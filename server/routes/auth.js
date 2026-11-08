import { randomBytes } from 'node:crypto';
import express from 'express';
import {
  RESERVED_USERNAMES,
  SESSION_COOKIE,
  cookieOptions,
  createSession,
  deleteSession,
  hashPassword,
  purgeExpiredSessions,
  validateCredentials,
  verifyDummy,
  verifyPassword,
} from '../auth.js';
import {
  PROVIDERS,
  authorizeUrl,
  callbackUrl,
  deviceConfig,
  fetchProfile,
  fetchUserProfile,
  pollDeviceLogin,
  providerConfig,
  startDeviceLogin,
} from '../oauth.js';
import { transaction } from '../db.js';
import { ensureSettings, getUser, isDate, selfUser } from '../data.js';
import { loginLimiter, rateLimiter } from '../limits.js';
import { seedUser } from '../seed.js';
import { removeAvatarFile } from './account.js';

export { loginLimiter };

const STATE_COOKIE = 'oauth_state';
const TOO_MANY = '로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요';

function deleteUser(ctx, user) {
  removeAvatarFile(ctx, user);
  ctx.db.prepare('DELETE FROM users WHERE id = ?').run(user.id); // cascades to every table
}

/**
 * Remove throwaway demo accounts that nobody can reach any more (no live session) or that are older
 * than ctx.demoTtlHours (0 = no age limit). Cheap; run at startup and whenever sessions come and go.
 */
export function purgeDemoUsers(ctx) {
  const ttl = Number(ctx.demoTtlHours) || 0;
  const rows = ctx.db
    .prepare(
      `SELECT * FROM users u WHERE is_demo = 1 AND (
         (? > 0 AND created_at < datetime('now', ?))
         OR NOT EXISTS (SELECT 1 FROM sessions s WHERE s.user_id = u.id AND s.expires_at >= ?))`,
    )
    .all(ttl, `-${ttl} hours`, Date.now());
  for (const u of rows) deleteUser(ctx, u);
  return rows.length;
}

/**
 * Password check with the failed-login limits (per address + account, and per address overall).
 * Returns 'ok', 'wrong' or 'blocked'. `hash` null/undefined still costs the same time (unknown accounts).
 */
export function checkPassword(ctx, req, { account, password, hash }) {
  const ip = String(req.ip || '');
  const key = `${ip}:${account}`;
  if (ctx.limiter.blocked(key) || ctx.ipLimiter.blocked(ip)) return 'blocked';
  const ok = typeof password === 'string' && (hash ? verifyPassword(password, hash) : verifyDummy(password));
  if (!ok) {
    ctx.limiter.fail(key);
    ctx.ipLimiter.fail(ip);
    return 'wrong';
  }
  ctx.limiter.reset(key);
  return 'ok';
}

export function authRoutes(ctx) {
  const { db, env, production, fetchImpl, demoAllowed, socialMode = 'redirect' } = ctx;
  const r = express.Router();
  // Demo accounts per address per 10 minutes (DEMO_RATE_LIMIT; unlimited for the UI test server).
  const demoMax = env.DEMO_RATE_LIMIT ? Number(env.DEMO_RATE_LIMIT) || 5 : env.NODE_ENV === 'test' ? Infinity : 5;
  const demoLimit = rateLimiter({ max: demoMax, windowMs: 10 * 60 * 1000 });

  // Signing in replaces the current session (and a demo account left behind is removed, as on logout).
  const startSession = (req, res, userId) => {
    const old = req.cookies[SESSION_COOKIE];
    if (old) deleteSession(db, old);
    if (req.user?.is_demo && req.user.id !== userId) deleteUser(ctx, req.user);
    ensureSettings(db, userId);
    const token = createSession(db, userId, ctx.sessionTtlMs);
    purgeExpiredSessions(db);
    purgeDemoUsers(ctx); // after the new session exists, so a fresh demo account is kept
    res.cookie(SESSION_COOKIE, token, cookieOptions(production, ctx.sessionTtlMs));
  };

  r.get('/me', (req, res) => {
    res.json({ user: req.user ? selfUser(db, req.user) : null });
  });

  // mode 'redirect': the browser goes to the provider and back (web). mode 'device': the user enters a code
  // on the provider's site (Android app, which has no address to come back to).
  r.get('/providers', (_req, res) => {
    res.json({
      providers: Object.keys(PROVIDERS).map((id) => {
        const cfg = socialMode === 'device' ? deviceConfig(env, id) : providerConfig(env, id);
        return { id, label: cfg.label, enabled: cfg.enabled, mode: socialMode };
      }),
      demo: demoAllowed,
    });
  });

  r.post('/register', (req, res) => {
    const { username, password } = req.body || {};
    const rawName = req.body?.displayName;
    if (rawName !== undefined && rawName !== null && typeof rawName !== 'string') {
      return res.status(400).json({ error: '사용자명이 올바르지 않습니다' });
    }
    const displayName = (rawName || '').trim() || username;
    const err = validateCredentials({ username, password });
    if (err) return res.status(400).json({ error: err });
    if (displayName.length > 30) return res.status(400).json({ error: '사용자명은 30자 이하여야 합니다' });
    if (RESERVED_USERNAMES.includes(username) || db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
      return res.status(409).json({ error: '이미 사용 중인 아이디입니다' });
    }
    const id = transaction(db, () => {
      const uid = Number(
        db
          .prepare('INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)')
          .run(username, displayName, hashPassword(password)).lastInsertRowid,
      );
      ensureSettings(db, uid);
      db.prepare('UPDATE user_settings SET promo_opt_in = ? WHERE user_id = ?').run(req.body?.promoOptIn === true ? 1 : 0, uid);
      return uid;
    });
    startSession(req, res, id);
    res.status(201).json({ user: selfUser(db, getUser(db, id)) });
  });

  r.post('/login', (req, res) => {
    const { username, password } = req.body || {};
    const name = typeof username === 'string' ? username.slice(0, 40) : '';
    const user = name ? db.prepare('SELECT * FROM users WHERE username = ?').get(name) : null;
    const result = checkPassword(ctx, req, { account: name, password, hash: user?.password_hash });
    if (result === 'blocked') return res.status(429).json({ error: TOO_MANY });
    if (result !== 'ok' || !user) return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다' });
    startSession(req, res, user.id);
    res.json({ user: selfUser(db, user) });
  });

  r.post('/logout', (req, res) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) deleteSession(db, token);
    // Demo accounts are throwaway: remove them with their data on logout.
    if (req.user?.is_demo) deleteUser(ctx, req.user);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  r.post('/demo', (req, res) => {
    if (!demoAllowed) return res.status(404).json({ error: '데모 로그인을 사용할 수 없습니다' });
    const today = req.body?.today;
    if (!isDate(today)) return res.status(400).json({ error: 'today 형식이 올바르지 않습니다' });
    if (!demoLimit(String(req.ip || ''))) {
      return res.status(429).json({ error: '체험 계정을 너무 자주 만들었습니다. 잠시 후 다시 시도하세요' });
    }
    // One transaction: a failure leaves no half-made demo account behind.
    const userId = transaction(db, () => {
      const id = Number(
        db.prepare("INSERT INTO users (display_name, is_demo, bio) VALUES ('체단실 체험', 1, '체험 계정입니다')").run()
          .lastInsertRowid,
      );
      seedUser(db, id, today);
      return id;
    });
    startSession(req, res, userId);
    res.status(201).json({ user: selfUser(db, getUser(db, userId)) });
  });

  // The account linked to a provider profile, created on first login.
  const userForProfile = (cfg, profile) =>
    transaction(db, () => {
      const link = db
        .prepare('SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?')
        .get(cfg.id, profile.id);
      if (link) return link.user_id;
      const id = Number(
        db
          .prepare('INSERT INTO users (display_name, email, avatar_url) VALUES (?, ?, ?)')
          .run((profile.name || `${cfg.label} 사용자`).slice(0, 30), profile.email, profile.avatar).lastInsertRowid,
      );
      db.prepare('INSERT INTO oauth_accounts (provider, provider_user_id, user_id) VALUES (?, ?, ?)').run(cfg.id, profile.id, id);
      return id;
    });

  // ---- device login (Android app) ----
  // Pending logins live in memory: flowId → { provider, deviceCode, interval, expiresAt, nextPollAt }.
  const deviceFlows = new Map();
  const MAX_FLOWS = 500;
  const deviceStartLimit = rateLimiter({ max: 10, windowMs: 10 * 60 * 1000 });
  const pruneFlows = () => {
    const now = Date.now();
    for (const [k, f] of deviceFlows) if (f.expiresAt < now) deviceFlows.delete(k);
  };

  r.post('/device/:provider/start', async (req, res) => {
    const cfg = socialMode === 'device' ? deviceConfig(env, req.params.provider) : null;
    if (!cfg) return res.status(404).json({ error: '지원하지 않는 로그인 방식입니다' });
    if (!cfg.enabled) return res.status(400).json({ error: `${cfg.label} 로그인이 아직 설정되지 않았습니다` });
    if (!deviceStartLimit(String(req.ip || ''))) {
      return res.status(429).json({ error: '로그인 요청이 너무 많습니다. 잠시 후 다시 시도하세요' });
    }
    pruneFlows();
    if (deviceFlows.size >= MAX_FLOWS) return res.status(503).json({ error: '잠시 후 다시 시도하세요' });
    try {
      const d = await startDeviceLogin(cfg, fetchImpl);
      const flowId = randomBytes(16).toString('hex');
      const now = Date.now();
      deviceFlows.set(flowId, {
        provider: cfg.id,
        deviceCode: d.deviceCode,
        interval: d.interval,
        expiresAt: now + d.expiresIn * 1000,
        nextPollAt: now + d.interval * 1000,
      });
      res.json({ flowId, userCode: d.userCode, verificationUri: d.verificationUri, interval: d.interval, expiresIn: d.expiresIn });
    } catch (e) {
      console.error(`[device:${cfg.id}]`, e.message);
      res.status(502).json({ error: `${cfg.label} 로그인을 시작하지 못했습니다. 인터넷 연결을 확인하세요` });
    }
  });

  // One check per call; the app calls again after `interval` seconds while status is 'pending'.
  r.post('/device/:provider/poll', async (req, res) => {
    const cfg = socialMode === 'device' ? deviceConfig(env, req.params.provider) : null;
    if (!cfg || !cfg.enabled) return res.status(404).json({ error: '지원하지 않는 로그인 방식입니다' });
    const flowId = req.body?.flowId;
    const flow = typeof flowId === 'string' ? deviceFlows.get(flowId) : null;
    if (!flow || flow.provider !== cfg.id) return res.status(404).json({ error: '로그인 요청을 찾을 수 없습니다. 다시 시작하세요' });
    const now = Date.now();
    if (flow.expiresAt < now) {
      deviceFlows.delete(flowId);
      return res.json({ status: 'expired' });
    }
    // Asked too early: answer without bothering the provider (it would slow us down).
    if (now < flow.nextPollAt) return res.json({ status: 'pending', interval: flow.interval });
    flow.nextPollAt = now + flow.interval * 1000;
    try {
      const r2 = await pollDeviceLogin(cfg, flow.deviceCode, fetchImpl);
      if (r2.status === 'slow_down') {
        flow.interval = Math.min(60, flow.interval + 5);
        flow.nextPollAt = Date.now() + flow.interval * 1000;
        return res.json({ status: 'pending', interval: flow.interval });
      }
      if (r2.status === 'pending') return res.json({ status: 'pending', interval: flow.interval });
      deviceFlows.delete(flowId);
      if (r2.status !== 'ok') return res.json({ status: r2.status });
      const profile = await fetchUserProfile(cfg, r2.accessToken, fetchImpl);
      const userId = userForProfile(cfg, profile);
      startSession(req, res, userId);
      res.json({ status: 'ok', user: selfUser(db, getUser(db, userId)) });
    } catch (e) {
      console.error(`[device:${cfg.id}]`, e.message);
      deviceFlows.delete(flowId);
      res.status(502).json({ error: `${cfg.label} 로그인에 실패했습니다. 다시 시도하세요` });
    }
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
    const fail = (msg) => {
      if (!res.headersSent) res.redirect(`/?login_error=${encodeURIComponent(msg)}`);
    };
    // Any unexpected error ends in a failed-login redirect, never an unhandled rejection.
    try {
      const cfg = providerConfig(env, req.params.provider);
      if (!cfg || !cfg.enabled) return fail('지원하지 않는 로그인 방식입니다');
      const expected = req.cookies[STATE_COOKIE];
      res.clearCookie(STATE_COOKIE, { path: '/' });
      if (req.query.error) {
        return fail(req.query.error === 'access_denied' ? '로그인을 취소했습니다' : `${cfg.label} 로그인에 실패했습니다`);
      }
      const { code, state } = req.query;
      if (typeof code !== 'string' || typeof state !== 'string' || !code || expected !== `${cfg.id}:${state}`) {
        return fail('로그인 요청이 만료되었습니다. 다시 시도하세요');
      }
      let profile;
      try {
        profile = await fetchProfile(cfg, { code, state, redirectUri: callbackUrl(env, cfg.id), fetchImpl });
      } catch (e) {
        console.error(`[oauth:${cfg.id}]`, e.message);
        return fail(`${cfg.label} 로그인에 실패했습니다`);
      }
      startSession(req, res, userForProfile(cfg, profile));
      res.redirect('/');
    } catch (e) {
      console.error('[oauth]', e.message);
      fail('로그인에 실패했습니다. 다시 시도하세요');
    }
  });

  return r;
}
