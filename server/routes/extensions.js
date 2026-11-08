// 익스텐션 목록(좋아요·저장), AI 검색, CalTrack 식단.
import express from 'express';
import { EXTENSIONS, getExtension } from '../../src/shared/extensions.js';
import { analyzeFoodPhoto, keywordSearch, searchExtensionsAi } from '../ai.js';
import { isDate, readSettings } from '../data.js';
import { rateLimiter } from '../limits.js';
import { sniffImage } from './account.js';

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const MAX_MEALS_PER_DAY = 50;

function num(v, max) {
  return typeof v === 'number' && v >= 0 && v <= max;
}

export function extensionRoutes(ctx) {
  const { db, requireUser } = ctx;
  const r = express.Router();
  const aiPerUser = rateLimiter({ max: 20, windowMs: 60 * 1000 });
  const aiPerIp = rateLimiter({ max: 40, windowMs: 60 * 1000 });
  // Paid AI calls: per account and per address (many accounts from one place).
  const aiAllowed = (req) => aiPerUser(req.user.id) && aiPerIp(String(req.ip || ''));

  r.get('/extensions', (req, res) => {
    const likes = new Map(
      db.prepare('SELECT extension_id, COUNT(*) AS n FROM extension_likes GROUP BY extension_id').all().map((x) => [x.extension_id, x.n]),
    );
    const mine = (table) =>
      req.user
        ? new Set(db.prepare(`SELECT extension_id FROM ${table} WHERE user_id = ?`).all(req.user.id).map((x) => x.extension_id))
        : new Set();
    const liked = mine('extension_likes');
    const saved = mine('extension_saves');
    const enabled = req.user ? readSettings(db, req.user.id).extensions : {};
    res.json({
      extensions: EXTENSIONS.map((e) => ({
        id: e.id,
        likes: likes.get(e.id) || 0,
        liked: liked.has(e.id),
        saved: saved.has(e.id),
        enabled: Boolean(enabled[e.id]),
      })),
    });
  });

  for (const [path, table] of [
    ['like', 'extension_likes'],
    ['save', 'extension_saves'],
  ]) {
    const handler = (on) => (req, res) => {
      if (!getExtension(req.params.id)) return res.status(404).json({ error: '없는 익스텐션입니다' });
      if (on) db.prepare(`INSERT OR IGNORE INTO ${table} (user_id, extension_id) VALUES (?, ?)`).run(req.user.id, req.params.id);
      else db.prepare(`DELETE FROM ${table} WHERE user_id = ? AND extension_id = ?`).run(req.user.id, req.params.id);
      const { n } = db.prepare(`SELECT COUNT(*) AS n FROM extension_likes WHERE extension_id = ?`).get(req.params.id);
      res.json({ [path === 'like' ? 'liked' : 'saved']: on, likes: n });
    };
    r.post(`/extensions/:id/${path}`, requireUser, handler(true));
    r.delete(`/extensions/:id/${path}`, requireUser, handler(false));
  }

  r.get('/ai/status', (_req, res) => res.json({ enabled: Boolean(ctx.ai) }));

  r.post('/ai/extension-search', requireUser, async (req, res, next) => {
    const question = String(req.body?.question || '').trim();
    if (!question) return res.status(400).json({ error: '질문을 입력하세요' });
    if (question.length > 300) return res.status(400).json({ error: '질문은 300자 이하로 입력하세요' });
    // Throwaway demo accounts get the free keyword search, not the paid model.
    if (req.user.is_demo) return res.json(keywordSearch(question));
    if (!aiAllowed(req)) return res.status(429).json({ error: '잠시 후 다시 질문해 주세요' });
    try {
      res.json(await searchExtensionsAi(ctx.ai, question));
    } catch (e) {
      console.error('[ai:search]', e.message);
      next(Object.assign(new Error('AI 검색에 실패했습니다'), { status: 502, expose: true }));
    }
  });

  // ---- meals (CalTrack) ----
  r.get('/meals', requireUser, (req, res) => {
    const { date } = req.query;
    if (!isDate(date)) return res.status(400).json({ error: '날짜 형식이 올바르지 않습니다' });
    const meals = db.prepare('SELECT * FROM meals WHERE user_id = ? AND date = ? ORDER BY time, id').all(req.user.id, date);
    res.json({ meals: meals.map(({ user_id: _u, ...m }) => m) });
  });

  r.post('/meals', requireUser, (req, res) => {
    const b = req.body || {};
    if (!isDate(b.date)) return res.status(400).json({ error: '날짜 형식이 올바르지 않습니다' });
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (!name || name.length > 40) return res.status(400).json({ error: '음식 이름은 1~40자여야 합니다' });
    if (b.time && (typeof b.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time))) return res.status(400).json({ error: '시간 형식이 올바르지 않습니다' });
    if (!num(b.kcal, 5000) || !num(b.carbs ?? 0, 1000) || !num(b.protein ?? 0, 1000) || !num(b.fat ?? 0, 1000)) {
      return res.status(400).json({ error: '영양 정보가 올바르지 않습니다' });
    }
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM meals WHERE user_id = ? AND date = ?').get(req.user.id, b.date);
    if (n >= MAX_MEALS_PER_DAY) return res.status(400).json({ error: `식단은 하루 ${MAX_MEALS_PER_DAY}개까지 기록할 수 있습니다` });
    const id = db
      .prepare('INSERT INTO meals (user_id, date, time, name, kcal, carbs, protein, fat) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(req.user.id, b.date, b.time || null, name, b.kcal, b.carbs ?? 0, b.protein ?? 0, b.fat ?? 0).lastInsertRowid;
    res.status(201).json({ meal: db.prepare('SELECT id, date, time, name, kcal, carbs, protein, fat FROM meals WHERE id = ?').get(id) });
  });

  r.delete('/meals/:id', requireUser, (req, res) => {
    const { changes } = db.prepare('DELETE FROM meals WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
    if (!changes) return res.status(404).json({ error: '기록을 찾을 수 없습니다' });
    res.json({ ok: true });
  });

  r.post(
    '/meals/analyze',
    requireUser,
    express.raw({ type: () => true, limit: MAX_PHOTO_BYTES }),
    async (req, res, next) => {
      if (!ctx.ai) return res.status(503).json({ error: '사진 분석을 사용할 수 없습니다 (서버에 AI 키가 필요합니다)' });
      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const type = sniffImage(buf);
      if (!type) return res.status(400).json({ error: 'JPG, PNG, WEBP 이미지만 분석할 수 있습니다' });
      if (req.user.is_demo) return res.status(403).json({ error: '체험 계정에서는 사진 분석을 사용할 수 없습니다' });
      if (!aiAllowed(req)) return res.status(429).json({ error: '잠시 후 다시 시도해 주세요' });
      try {
        res.json(await analyzeFoodPhoto(ctx.ai, { data: buf.toString('base64'), mediaType: MIME[type] }));
      } catch (e) {
        console.error('[ai:food]', e.message);
        next(Object.assign(new Error('사진 분석에 실패했습니다'), { status: 502, expose: true }));
      }
    },
  );

  return r;
}
