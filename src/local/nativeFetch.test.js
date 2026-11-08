// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';
import { makeNativeFetch } from './nativeFetch.js';

describe('native requests for social login', () => {
  test('https requests go through native HTTP and come back as a Response', async () => {
    const http = { request: vi.fn(async () => ({ status: 200, data: '{"device_code":"d","user_code":"U"}' })) };
    const fallback = vi.fn();
    const f = makeNativeFetch(http, fallback);
    const res = await f('https://github.com/login/device/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ client_id: 'x', scope: 'read:user' }),
    });
    expect(res.ok).toBe(true);
    expect(await res.json()).toEqual({ device_code: 'd', user_code: 'U' });
    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://github.com/login/device/code', method: 'POST', data: 'client_id=x&scope=read%3Auser' }),
    );
    expect(fallback).not.toHaveBeenCalled();
  });

  test('error statuses and already-parsed JSON are passed through', async () => {
    const http = { request: vi.fn(async () => ({ status: 428, data: { error: 'authorization_pending' } })) };
    const res = await makeNativeFetch(http)('https://oauth2.googleapis.com/token', { method: 'POST', body: 'a=b' });
    expect(res.status).toBe(428);
    expect(await res.json()).toEqual({ error: 'authorization_pending' });
  });

  test('other requests (and no native HTTP) use the normal fetch', async () => {
    const fallback = vi.fn(async () => new Response('{}'));
    await makeNativeFetch({ request: vi.fn() }, fallback)('/api/auth/me');
    await makeNativeFetch(null, fallback)('https://api.github.com/user');
    expect(fallback).toHaveBeenCalledTimes(2);
  });
});
