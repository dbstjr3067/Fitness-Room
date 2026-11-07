import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { DAY_MS, SESSION_COOKIE, cookieOptions, purgeExpiredSessions, renewSession, userFromSession } from './auth.js';
import { createAiClient } from './ai.js';
import { accountRoutes } from './routes/account.js';
import { authRoutes, loginLimiter, purgeDemoUsers } from './routes/auth.js';
import { extensionRoutes } from './routes/extensions.js';
import { extraRoutes, loadAllCustomExercises } from './routes/extras.js';
import { socialRoutes } from './routes/social.js';
import { workoutRoutes } from './routes/workouts.js';

export { publicUser } from './data.js';

/**
 * options:
 *  db         node:sqlite database (required)
 *  env        environment variables (defaults to process.env)
 *  fetchImpl  fetch used for OAuth (tests inject a fake)
 *  ai         Anthropic client or null; defaults to one built from ANTHROPIC_API_KEY
 *  uploadDir  where profile pictures are stored
 *  staticDir  built client to serve in production
 *  inlineAvatars  store profile pictures in the database as data URLs (mobile app, no file system)
 *  sessionDays  login lifetime; renewed while in use (sliding)
 *
 * env: ALLOW_DEMO ('true'/'false'; default off in production), DEMO_TTL_HOURS (demo accounts are removed
 *      after this many hours, default 24, 0 = keep while signed in), DEMO_RATE_LIMIT (demo accounts per
 *      address per 10 minutes, default 5; no limit when NODE_ENV=test), TRUST_PROXY (Express 'trust proxy'
 *      value, e.g. 1 or 'loopback', so rate limits see the real client address behind a reverse proxy)
 */
export function createApp({
  db,
  env = process.env,
  fetchImpl = fetch,
  ai,
  uploadDir,
  staticDir,
  inlineAvatars = false,
  sessionDays = 30,
} = {}) {
  const app = express();
  const production = env.NODE_ENV === 'production';
  const sessionTtlMs = sessionDays * DAY_MS;

  const requireUser = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: '로그인이 필요합니다' });
    next();
  };

  const ctx = {
    db,
    env,
    production,
    fetchImpl,
    ai: ai === undefined ? createAiClient(env) : ai,
    uploadDir: uploadDir || join(tmpdir(), 'fitness-room-uploads'),
    inlineAvatars,
    demoAllowed: env.ALLOW_DEMO ? env.ALLOW_DEMO === 'true' : !production,
    demoTtlHours: env.DEMO_TTL_HOURS !== undefined && env.DEMO_TTL_HOURS !== '' ? Number(env.DEMO_TTL_HOURS) || 0 : 24,
    sessionTtlMs,
    limiter: loginLimiter(), // failed passwords per address + account
    ipLimiter: loginLimiter({ max: 30 }), // failed passwords per address, any account (password spraying)
    requireUser,
  };

  loadAllCustomExercises(db);
  purgeExpiredSessions(db);
  purgeDemoUsers(ctx);

  app.disable('x-powered-by');
  if (env.TRUST_PROXY && typeof app.set === 'function') app.set('trust proxy', trustProxyValue(env.TRUST_PROXY));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use((req, res, next) => {
    const token = req.cookies[SESSION_COOKIE];
    req.user = userFromSession(db, token);
    if (req.user && renewSession(db, token, req.user.expires_at, sessionTtlMs)) {
      res.cookie(SESSION_COOKIE, token, cookieOptions(production, sessionTtlMs));
    }
    next();
  });

  app.use('/api', (_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });

  app.use('/api/auth', authRoutes(ctx));
  app.use('/api/me', requireUser, accountRoutes(ctx));
  app.use('/api', workoutRoutes(ctx));
  app.use('/api', socialRoutes(ctx));
  app.use('/api', extensionRoutes(ctx));
  app.use('/api', extraRoutes(ctx));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // Serve the built client in production.
  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile('index.html', { root: staticDir }));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: '파일이 너무 큽니다' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: '요청 형식이 올바르지 않습니다' });
    if (err.expose && err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다' });
  });

  return app;
}

function trustProxyValue(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  return /^\d+$/.test(v) ? Number(v) : v;
}
