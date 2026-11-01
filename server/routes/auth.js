import { randomBytes } from 'node:crypto';
import express from 'express';
import {
  SESSION_COOKIE,
  cookieOptions,
  createSession,
  deleteSession,
  hashPassword,
  validateCredentials,
  verifyPassword,
} from '../auth.js';
import { PROVIDERS, authorizeUrl, callbackUrl, fetchProfile, providerConfig } from '../oauth.js';
import { transaction } from '../db.js';
import { ensureSettings, getUser, isDate, selfUser } from '../data.js';
import { seedUser } from '../seed.js';
import { removeAvatarFile } from './account.js';

const STATE_COOKIE = 'oauth_state';

// Small in-memory limiter for failed password logins.
export function loginLimiter({ max = 10, windowMs = 15 * 60 * 1000 } = {}) {
  const hits = new Map();
  return {
    blocked(key) {
      const h = hits.get(key);
      if (!h || h.until < Date.now()) return false;
      return h.count >= max;
    },
    fail(key) {
      const h = hits.get(key);
      if (!h || h.until < Date.now()) hits.set(key, { count: 1, until: Date.now() + windowMs });
      else h.count++;
    },
    reset(key) {
      hits.delete(key);
    },
  };
}

export function authRoutes(ctx) {
  const { db, env, production, fetchImpl, demoAllowed } = ctx;
  const r = express.Router();
  const limiter = ctx.limiter;

  const startSession = (res, userId) => {
    ensureSettings(db, userId);
    res.cookie(SESSION_COOKIE, createSession(db, userId), cookieOptions(production));
  };

  r.get('/me', (req, res) => {
    res.json({ user: req.user ? selfUser(db, req.user) : null });
  });

  r.get('/providers', (_req, res) => {
    res.json({
      providers: Object.keys(PROVIDERS).map((id) => {
        const cfg = providerConfig(env, id);
        return { id, label: cfg.label, enabled: cfg.enabled };
      }),
      demo: demoAllowed,
    });
  });

  r.post('/register', (req, res) => {
    const { username, password } = req.body || {};
    const displayName = String(req.body?.displayName || '').trim() || username;
    const err = validateCredentials({ username, password });
    if (err) return res.status(400).json({ error: err });
    if (displayName.length > 30) return res.status(400).json({ error: '사용자명은 30자 이하여야 합니다' });
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
      return res.status(409).json({ error: '이미 사용 중인 아이디입니다' });
    }
    const id = transaction(db, () => {
      const uid = Number(
        db
          .prepare('INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)')
          .run(username, displayName, hashPassword(password)).lastInsertRowid,
      );
      ensureSettings(db, uid);
      db.prepare('UPDATE user_settings SET promo_opt_in = ? WHERE user_id = ?').run(req.body?.promoOptIn ? 1 : 0, uid);
      return uid;
    });
    startSession(res, id);
    res.status(201).json({ user: selfUser(db, getUser(db, id)) });
  });

  r.post('/login', (req, res) => {
    const { username, password } = req.body || {};
    const key = `${req.ip}:${username}`;
    if (limiter.blocked(key)) {
      return res.status(429).json({ error: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요' });
    }
    const user =
      typeof username === 'string' ? db.prepare('SELECT * FROM users WHERE username = ?').get(username) : null;
    if (!user || typeof password !== 'string' || !verifyPassword(password, user.password_hash)) {
      limiter.fail(key);
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다' });
    }
    limiter.reset(key);
    startSession(res, user.id);
    res.json({ user: selfUser(db, user) });
  });

  r.post('/logout', (req, res) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) deleteSession(db, token);
    // Demo accounts are throwaway: remove them with their data on logout.
    if (req.user?.is_demo) {
      removeAvatarFile(ctx, req.user);
      db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
    }
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  r.post('/demo', (req, res) => {
    if (!demoAllowed) return res.status(404).json({ error: '데모 로그인을 사용할 수 없습니다' });
    const today = req.body?.today;
    if (!isDate(today)) return res.status(400).json({ error: 'today 형식이 올바르지 않습니다' });
    const userId = Number(
      db.prepare("INSERT INTO users (display_name, is_demo, bio) VALUES ('체단실 체험', 1, '체험 계정입니다')").run()
        .lastInsertRowid,
    );
    seedUser(db, userId, today);
    startSession(res, userId);
    res.status(201).json({ user: selfUser(db, getUser(db, userId)) });
  });

  r.get('/oauth/:provider', (req, res) => {
    const cfg = providerConfig(env, req.params.provider);
    if (!cfg) return res.status(404).json({ error: '지원하지 않는 로그인 방식입니다' });
    if (!cfg.enabled) {
      return res.redirect(`/?login_error=${encodeURIComponent(`${cfg.label} 로그인이 아직 설정되지 않았습니다`)}`);
    }
    const state = randomBytes(16).toString('hex');
    res.cookie(STATE_COOKIE, `${cfg.id}:${state}`, {
      httpOnly: true,
      sameSite: 'lax',
      secure: production,
      maxAge: 10 * 60 * 1000,
      path: '/',
    });
    res.redirect(authorizeUrl(cfg, { redirectUri: callbackUrl(env, cfg.id), state }));
  });

  r.get('/oauth/:provider/callback', async (req, res) => {
    const cfg = providerConfig(env, req.params.provider);
    const fail = (msg) => res.redirect(`/?login_error=${encodeURIComponent(msg)}`);
    if (!cfg || !cfg.enabled) return fail('지원하지 않는 로그인 방식입니다');
    const expected = req.cookies[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, { path: '/' });
    const { code, state } = req.query;
    if (!code || !state || expected !== `${cfg.id}:${state}`) return fail('로그인 요청이 만료되었습니다. 다시 시도하세요');
    let profile;
    try {
      profile = await fetchProfile(cfg, {
        code: String(code),
        state: String(state),
        redirectUri: callbackUrl(env, cfg.id),
        fetchImpl,
      });
    } catch (e) {
      console.error(`[oauth:${cfg.id}]`, e.message);
      return fail(`${cfg.label} 로그인에 실패했습니다`);
    }
    const userId = transaction(db, () => {
      const link = db
        .prepare('SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?')
        .get(cfg.id, profile.id);
      if (link) return link.user_id;
      const id = Number(
        db
          .prepare('INSERT INTO users (display_name, email, avatar_url) VALUES (?, ?, ?)')
          .run((profile.name || `${cfg.label} 사용자`).slice(0, 30), profile.email || null, profile.avatar || null)
          .lastInsertRowid,
      );
      db.prepare('INSERT INTO oauth_accounts (provider, provider_user_id, user_id) VALUES (?, ?, ?)').run(
        cfg.id,
        profile.id,
        id,
      );
      return id;
    });
    startSession(res, userId);
    res.redirect('/');
  });

  return r;
}
