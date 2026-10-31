import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import { EXTENSIONS } from '../src/shared/extensions.js';
import {
  SESSION_COOKIE,
  cookieOptions,
  createSession,
  deleteSession,
  hashPassword,
  userFromSession,
  validateCredentials,
  verifyPassword,
} from './auth.js';
import { PROVIDERS, authorizeUrl, callbackUrl, fetchProfile, providerConfig } from './oauth.js';
import { seedUser } from './seed.js';
import { transaction } from './db.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATE_COOKIE = 'oauth_state';
const THEMES = ['dark', 'light'];
const UNITS = ['kg', 'lbs'];

export function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    email: u.email,
    avatarUrl: u.avatar_url,
    isDemo: Boolean(u.is_demo),
  };
}

function ensureSettings(db, userId) {
  db.prepare('INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)').run(userId);
}

// Small in-memory limiter for failed password logins.
function loginLimiter({ max = 10, windowMs = 15 * 60 * 1000 } = {}) {
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

export function createApp({ db, env = process.env, fetchImpl = fetch, staticDir } = {}) {
  const app = express();
  const production = env.NODE_ENV === 'production';
  const demoAllowed = env.ALLOW_DEMO ? env.ALLOW_DEMO === 'true' : true;
  const limiter = loginLimiter();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use((req, _res, next) => {
    req.user = userFromSession(db, req.cookies[SESSION_COOKIE]);
    next();
  });

  const requireUser = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: '로그인이 필요합니다' });
    next();
  };

  const startSession = (res, userId) => {
    ensureSettings(db, userId);
    res.cookie(SESSION_COOKIE, createSession(db, userId), cookieOptions(production));
  };

  // ---- auth ----
  app.get('/api/auth/me', (req, res) => {
    res.json({ user: req.user ? publicUser(req.user) : null });
  });

  app.get('/api/auth/providers', (_req, res) => {
    res.json({
      providers: Object.keys(PROVIDERS).map((id) => {
        const cfg = providerConfig(env, id);
        return { id, label: cfg.label, enabled: cfg.enabled };
      }),
      demo: demoAllowed,
    });
  });

  app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body || {};
    const displayName = String(req.body?.displayName || '').trim() || username;
    const err = validateCredentials({ username, password });
    if (err) return res.status(400).json({ error: err });
    if (displayName.length > 30) return res.status(400).json({ error: '사용자명은 30자 이하여야 합니다' });
    const exists = db.prepare('SELECT 1 FROM users WHERE username = ?').get(username);
    if (exists) return res.status(409).json({ error: '이미 사용 중인 아이디입니다' });
    const { lastInsertRowid } = db
      .prepare('INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)')
      .run(username, displayName, hashPassword(password));
    startSession(res, Number(lastInsertRowid));
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid);
    res.status(201).json({ user: publicUser(user) });
  });

  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    const key = `${req.ip}:${username}`;
    if (limiter.blocked(key)) {
      return res.status(429).json({ error: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요' });
    }
    const user =
      typeof username === 'string'
        ? db.prepare('SELECT * FROM users WHERE username = ?').get(username)
        : null;
    if (!user || typeof password !== 'string' || !verifyPassword(password, user.password_hash)) {
      limiter.fail(key);
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다' });
    }
    limiter.reset(key);
    startSession(res, user.id);
    res.json({ user: publicUser(user) });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) deleteSession(db, token);
    // Demo accounts are throwaway: remove them with their data on logout.
    if (req.user?.is_demo) db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  app.post('/api/auth/demo', (req, res) => {
    if (!demoAllowed) return res.status(404).json({ error: '데모 로그인을 사용할 수 없습니다' });
    const today = req.body?.today;
    if (!DATE_RE.test(String(today))) return res.status(400).json({ error: 'today 형식이 올바르지 않습니다' });
    const userId = transaction(db, () =>
      Number(
        db
          .prepare("INSERT INTO users (display_name, is_demo) VALUES ('체단실 체험', 1)")
          .run().lastInsertRowid,
      ),
    );
    seedUser(db, userId, today);
    startSession(res, userId);
    res.status(201).json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(userId)) });
  });

  app.get('/api/auth/oauth/:provider', (req, res) => {
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

  app.get('/api/auth/oauth/:provider/callback', async (req, res) => {
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
          .run(profile.name || `${cfg.label} 사용자`, profile.email || null, profile.avatar || null)
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

  // ---- settings & extensions ----
  const readSettings = (userId) => {
    ensureSettings(db, userId);
    const s = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
    const ext = {};
    for (const r of db.prepare('SELECT * FROM user_extensions WHERE user_id = ?').all(userId)) {
      ext[r.extension_id] = Boolean(r.enabled);
    }
    return { weeklyGoal: s.weekly_goal, unit: s.unit, theme: s.theme, extensions: ext };
  };

  app.get('/api/settings', requireUser, (req, res) => res.json(readSettings(req.user.id)));

  app.put('/api/settings', requireUser, (req, res) => {
    const cur = readSettings(req.user.id);
    const { weeklyGoal = cur.weeklyGoal, unit = cur.unit, theme = cur.theme } = req.body || {};
    if (!Number.isInteger(weeklyGoal) || weeklyGoal < 1 || weeklyGoal > 7) {
      return res.status(400).json({ error: '주간 목표는 1~7일이어야 합니다' });
    }
    if (!UNITS.includes(unit)) return res.status(400).json({ error: '단위가 올바르지 않습니다' });
    if (!THEMES.includes(theme)) return res.status(400).json({ error: '테마가 올바르지 않습니다' });
    db.prepare('UPDATE user_settings SET weekly_goal = ?, unit = ?, theme = ? WHERE user_id = ?').run(
      weeklyGoal,
      unit,
      theme,
      req.user.id,
    );
    res.json(readSettings(req.user.id));
  });

  app.put('/api/extensions/:id', requireUser, (req, res) => {
    if (!EXTENSIONS.some((e) => e.id === req.params.id)) {
      return res.status(404).json({ error: '없는 익스텐션입니다' });
    }
    const enabled = req.body?.enabled ? 1 : 0;
    db.prepare(
      'INSERT OR REPLACE INTO user_extensions (user_id, extension_id, enabled) VALUES (?, ?, ?)',
    ).run(req.user.id, req.params.id, enabled);
    res.json(readSettings(req.user.id));
  });

  // ---- status data ----
  app.get('/api/status', requireUser, (req, res) => {
    const uid = req.user.id;
    const rows = db
      .prepare(
        `SELECT w.id, w.date, w.split_name, w.memo, e.exercise, e.weight, e.unit, e.sets, e.reps
         FROM workouts w LEFT JOIN workout_entries e ON e.workout_id = w.id
         WHERE w.user_id = ? ORDER BY w.date, w.id, e.id`,
      )
      .all(uid);
    const byId = new Map();
    for (const r of rows) {
      if (!byId.has(r.id)) {
        byId.set(r.id, { id: r.id, date: r.date, splitName: r.split_name, memo: r.memo || '', entries: [] });
      }
      if (r.exercise) {
        byId.get(r.id).entries.push({
          exercise: r.exercise,
          weight: r.weight,
          unit: r.unit,
          sets: r.sets,
          reps: r.reps,
        });
      }
    }
    const routine = {};
    for (const r of db.prepare('SELECT * FROM routine_days WHERE user_id = ?').all(uid)) {
      routine[r.weekday] = { splitName: r.split_name, exercises: JSON.parse(r.exercises) };
    }
    const bodyWeights = db
      .prepare('SELECT date, kg FROM body_weights WHERE user_id = ? ORDER BY date')
      .all(uid)
      .map((r) => ({ date: r.date, kg: r.kg }));
    res.json({ workouts: [...byId.values()], routine, bodyWeights });
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // Serve the built client in production.
  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile('index.html', { root: staticDir }));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다' });
  });

  return app;
}
