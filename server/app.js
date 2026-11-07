import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { SESSION_COOKIE, userFromSession } from './auth.js';
import { createAiClient } from './ai.js';
import { accountRoutes } from './routes/account.js';
import { authRoutes, loginLimiter } from './routes/auth.js';
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
 */
export function createApp({ db, env = process.env, fetchImpl = fetch, ai, uploadDir, staticDir, inlineAvatars = false } = {}) {
  const app = express();
  const production = env.NODE_ENV === 'production';

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
    demoAllowed: env.ALLOW_DEMO ? env.ALLOW_DEMO === 'true' : true,
    limiter: loginLimiter(),
    requireUser,
  };

  loadAllCustomExercises(db);

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use((req, _res, next) => {
    req.user = userFromSession(db, req.cookies[SESSION_COOKIE]);
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
