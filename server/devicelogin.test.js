// @vitest-environment node
// Google / GitHub login in the Android app: device authorization grant (the user types a code on the provider's site).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { openDb } from './db.js';

const uploadDir = mkdtempSync(join(tmpdir(), 'fr-device-'));
const ENV = { GOOGLE_DEVICE_CLIENT_ID: 'g-dev', GOOGLE_DEVICE_CLIENT_SECRET: 'g-secret', GITHUB_CLIENT_ID: 'gh-id' };

let db;
let calls;
let tokenAnswers; // queue of token endpoint answers per test

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function fakeProviders(url, init = {}) {
  calls.push({ url, body: init.body ? String(init.body) : '' });
  if (url === 'https://github.com/login/device/code') {
    return json({ device_code: 'dc-gh', user_code: 'ABCD-1234', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 });
  }
  if (url === 'https://oauth2.googleapis.com/device/code') {
    return json({ device_code: 'dc-g', user_code: 'XYZ-QWE-RTY', verification_url: 'https://www.google.com/device', expires_in: 1800, interval: 5 });
  }
  if (url === 'https://github.com/login/oauth/access_token' || url === 'https://oauth2.googleapis.com/token') {
    const a = tokenAnswers.shift() || { body: { error: 'authorization_pending' } };
    return json(a.body, a.status || 200);
  }
  if (url === 'https://api.github.com/user') return json({ id: 4242, login: 'octo', name: null, avatar_url: 'https://a/x.png' });
  if (url === 'https://openidconnect.googleapis.com/v1/userinfo') return json({ sub: 'g-77', name: '구글 리프터', email: 'l@gmail.com' });
  return json({}, 404);
}

function makeApp({ socialMode = 'device', env = ENV, fetchImpl = vi.fn(fakeProviders) } = {}) {
  db = openDb(':memory:');
  return createApp({ db, env: { NODE_ENV: 'test', ...env }, ai: null, uploadDir, socialMode, fetchImpl });
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  calls = [];
  tokenAnswers = [];
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-08T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

const later = (sec) => vi.setSystemTime(new Date(Date.now() + sec * 1000));

describe('device login', () => {
  test('providers report device mode and which are configured', async () => {
    const app = makeApp({ env: { GITHUB_CLIENT_ID: 'gh-id' } });
    const r = await request(app).get('/api/auth/providers');
    expect(r.body.providers).toEqual([
      { id: 'google', label: 'Google', enabled: false, mode: 'device' },
      { id: 'github', label: 'GitHub', enabled: true, mode: 'device' },
    ]);
  });

  test('GitHub: code, waiting, slow down, then signed in; the same account next time', async () => {
    const app = makeApp();
    const agent = request.agent(app);
    const start = await agent.post('/api/auth/device/github/start');
    expect(start.status).toBe(200);
    expect(start.body).toMatchObject({ userCode: 'ABCD-1234', verificationUri: 'https://github.com/login/device', interval: 5 });
    expect(calls[0].body).toContain('client_id=gh-id');
    const { flowId } = start.body;

    // asking before the interval passes doesn't reach GitHub
    expect((await agent.post('/api/auth/device/github/poll').send({ flowId })).body.status).toBe('pending');
    expect(calls).toHaveLength(1);

    later(5);
    tokenAnswers.push({ body: { error: 'authorization_pending' } });
    expect((await agent.post('/api/auth/device/github/poll').send({ flowId })).body).toEqual({ status: 'pending', interval: 5 });

    later(5);
    tokenAnswers.push({ body: { error: 'slow_down' } });
    expect((await agent.post('/api/auth/device/github/poll').send({ flowId })).body).toEqual({ status: 'pending', interval: 10 });

    later(10);
    tokenAnswers.push({ body: { access_token: 'gho_token', token_type: 'bearer' } });
    const ok = await agent.post('/api/auth/device/github/poll').send({ flowId });
    expect(ok.body.status).toBe('ok');
    expect(ok.body.user).toMatchObject({ displayName: 'octo', providers: ['github'] });
    expect(calls.find((c) => c.url.includes('access_token')).body).toContain('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code');
    expect((await agent.get('/api/auth/me')).body.user.displayName).toBe('octo');

    // the flow is used up
    expect((await agent.post('/api/auth/device/github/poll').send({ flowId })).status).toBe(404);

    // a second login finds the same account
    const again = request.agent(app);
    const s2 = await again.post('/api/auth/device/github/start');
    later(5);
    tokenAnswers.push({ body: { access_token: 'gho_2' } });
    const ok2 = await again.post('/api/auth/device/github/poll').send({ flowId: s2.body.flowId });
    expect(ok2.body.user.id).toBe(ok.body.user.id);
    expect(db.prepare('SELECT COUNT(*) AS n FROM users').get().n).toBe(1);
  });

  test('Google: sends the device client secret and reads the OpenID profile', async () => {
    const app = makeApp();
    const agent = request.agent(app);
    const start = await agent.post('/api/auth/device/google/start');
    expect(start.body).toMatchObject({ userCode: 'XYZ-QWE-RTY', verificationUri: 'https://www.google.com/device' });
    later(5);
    tokenAnswers.push({ body: { error: 'authorization_pending' }, status: 428 });
    expect((await agent.post('/api/auth/device/google/poll').send({ flowId: start.body.flowId })).body.status).toBe('pending');
    later(5);
    tokenAnswers.push({ body: { access_token: 'ya29.x', id_token: 'jwt' } });
    const ok = await agent.post('/api/auth/device/google/poll').send({ flowId: start.body.flowId });
    expect(ok.body.user).toMatchObject({ displayName: '구글 리프터', email: 'l@gmail.com' });
    expect(calls.find((c) => c.url === 'https://oauth2.googleapis.com/token').body).toContain('client_secret=g-secret');
  });

  test('denied, expired and broken answers end the flow with a clear result', async () => {
    const app = makeApp();
    const agent = request.agent(app);
    let s = await agent.post('/api/auth/device/github/start');
    later(5);
    tokenAnswers.push({ body: { error: 'access_denied' } });
    expect((await agent.post('/api/auth/device/github/poll').send({ flowId: s.body.flowId })).body).toEqual({ status: 'denied' });

    s = await agent.post('/api/auth/device/github/start');
    later(901);
    expect((await agent.post('/api/auth/device/github/poll').send({ flowId: s.body.flowId })).body).toEqual({ status: 'expired' });

    s = await agent.post('/api/auth/device/github/start');
    later(5);
    tokenAnswers.push({ body: { error: 'device_flow_disabled' } });
    const broken = await agent.post('/api/auth/device/github/poll').send({ flowId: s.body.flowId });
    expect(broken.status).toBe(502);
    expect(broken.body.error).toMatch(/GitHub 로그인에 실패/);
    expect((await agent.get('/api/auth/me')).body.user).toBeNull();
  });

  test('rejects unknown flows, other providers, unconfigured providers and odd verification pages', async () => {
    let app = makeApp({ env: { GITHUB_CLIENT_ID: 'gh-id' } });
    expect((await request(app).post('/api/auth/device/google/start')).status).toBe(400);
    expect((await request(app).post('/api/auth/device/naver/start')).status).toBe(404);
    expect((await request(app).post('/api/auth/device/github/poll').send({ flowId: 'nope' })).status).toBe(404);
    expect((await request(app).post('/api/auth/device/github/poll').send({ flowId: { $ne: 1 } })).status).toBe(404);

    // a flow started for GitHub can't be finished as Google
    app = makeApp();
    const s = await request(app).post('/api/auth/device/github/start');
    expect((await request(app).post('/api/auth/device/google/poll').send({ flowId: s.body.flowId })).status).toBe(404);

    // the code page must be the provider's own https page
    app = makeApp({
      fetchImpl: vi.fn(async (url) =>
        url.includes('device/code')
          ? json({ device_code: 'd', user_code: 'U', verification_uri: 'https://evil.example/device', interval: 5 })
          : json({}),
      ),
    });
    expect((await request(app).post('/api/auth/device/github/start')).status).toBe(502);
  });

  test('the web server keeps redirect login and has no device routes', async () => {
    const app = makeApp({ socialMode: 'redirect', env: { ...ENV, GITHUB_CLIENT_SECRET: 's' } });
    expect((await request(app).post('/api/auth/device/github/start')).status).toBe(404);
    const r = await request(app).get('/api/auth/providers');
    expect(r.body.providers.find((p) => p.id === 'github')).toMatchObject({ enabled: true, mode: 'redirect' });
  });
});
