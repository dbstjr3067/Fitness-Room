// Social login with Google and GitHub.
// - Web: OAuth 2.0 authorization code (redirect). Enabled when <PROVIDER>_CLIENT_ID and _CLIENT_SECRET are set.
// - Android app: OAuth 2.0 device authorization grant (RFC 8628): the user enters a short code on the provider's
//   site in the phone's browser, so no redirect address or hosted server is needed. Enabled when the device
//   client settings are present (Google: GOOGLE_DEVICE_CLIENT_ID/_SECRET of a "TVs and Limited Input" client;
//   GitHub: GITHUB_CLIENT_ID of an OAuth app with "Enable Device Flow" checked — no secret needed).

export const PROVIDERS = {
  google: {
    label: 'Google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    deviceCodeUrl: 'https://oauth2.googleapis.com/device/code',
    deviceHosts: ['google.com', 'www.google.com'],
    profileUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
    parseProfile: (p) => ({ id: p.sub, name: p.name, email: p.email, avatar: p.picture }),
  },
  github: {
    label: 'GitHub',
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    deviceCodeUrl: 'https://github.com/login/device/code',
    deviceHosts: ['github.com'],
    profileUrl: 'https://api.github.com/user',
    scope: 'read:user user:email',
    parseProfile: (p) => ({ id: p.id, name: p.name || p.login, email: p.email, avatar: p.avatar_url }),
  },
};

export function providerConfig(env, id) {
  if (typeof id !== 'string' || !Object.hasOwn(PROVIDERS, id)) return null;
  const p = PROVIDERS[id];
  const key = id.toUpperCase();
  const clientId = env[`${key}_CLIENT_ID`];
  const clientSecret = env[`${key}_CLIENT_SECRET`];
  return { ...p, id, clientId, clientSecret, enabled: Boolean(clientId && clientSecret) };
}

/** Device-login settings for a provider ({ enabled: false } when not configured). */
export function deviceConfig(env, id) {
  if (typeof id !== 'string' || !Object.hasOwn(PROVIDERS, id)) return null;
  const p = PROVIDERS[id];
  if (id === 'google') {
    const clientId = env.GOOGLE_DEVICE_CLIENT_ID;
    const clientSecret = env.GOOGLE_DEVICE_CLIENT_SECRET;
    return { ...p, id, clientId, clientSecret, enabled: Boolean(clientId && clientSecret) };
  }
  const clientId = env.GITHUB_DEVICE_CLIENT_ID || env.GITHUB_CLIENT_ID;
  return { ...p, id, clientId, clientSecret: null, enabled: Boolean(clientId) };
}

export function callbackUrl(env, id) {
  const base = (env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/api/auth/oauth/${id}/callback`;
}

export function authorizeUrl(cfg, { redirectUri, state }) {
  const url = new URL(cfg.authorizeUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  if (cfg.scope) url.searchParams.set('scope', cfg.scope);
  return url.toString();
}

const FETCH_TIMEOUT_MS = 10000;

function timeoutSignal() {
  return typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(FETCH_TIMEOUT_MS) : undefined;
}

// Provider data is untrusted: keep only non-empty strings, trimmed and length-capped.
function text(v, max) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

export function cleanProfile(p) {
  const id = typeof p?.id === 'number' && Number.isFinite(p.id) ? String(p.id) : text(p?.id, 200);
  if (!id) throw new Error('profile has no id');
  const avatar = text(p.avatar, 1000);
  return {
    id,
    name: text(p.name, 30),
    email: text(p.email, 200),
    avatar: avatar && /^https?:\/\//i.test(avatar) ? avatar : null,
  };
}

export async function fetchProfile(cfg, { code, state, redirectUri, fetchImpl = fetch }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    redirect_uri: redirectUri,
    state,
  });
  const tokenRes = await fetchImpl(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
    signal: timeoutSignal(),
  });
  const token = await tokenRes.json();
  if (!tokenRes.ok || typeof token?.access_token !== 'string' || !token.access_token) {
    throw new Error(`token exchange failed (${tokenRes.status})`);
  }
  return fetchUserProfile(cfg, token.access_token, fetchImpl);
}

export async function fetchUserProfile(cfg, accessToken, fetchImpl = fetch) {
  const profileRes = await fetchImpl(cfg.profileUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'User-Agent': 'fitness-room',
    },
    signal: timeoutSignal(),
  });
  if (!profileRes.ok) throw new Error(`profile request failed (${profileRes.status})`);
  return cleanProfile(cfg.parseProfile((await profileRes.json()) || {}));
}

const form = (fields) => new URLSearchParams(Object.entries(fields).filter(([, v]) => v !== null && v !== undefined));

async function postForm(url, fields, fetchImpl) {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: form(fields),
    signal: timeoutSignal(),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // not JSON
  }
  return { res, data: data && typeof data === 'object' ? data : {} };
}

/**
 * Device login step 1: ask the provider for a code the user types on its site.
 * Returns { deviceCode, userCode, verificationUri, interval (s), expiresIn (s) }.
 */
export async function startDeviceLogin(cfg, fetchImpl = fetch) {
  const { res, data } = await postForm(cfg.deviceCodeUrl, { client_id: cfg.clientId, scope: cfg.scope }, fetchImpl);
  const uri = text(data.verification_uri || data.verification_url, 300);
  let host = null;
  try {
    const u = new URL(uri);
    host = u.protocol === 'https:' ? u.hostname : null;
  } catch {
    // invalid
  }
  const deviceCode = text(data.device_code, 2000);
  const userCode = text(data.user_code, 40);
  if (!res.ok || !deviceCode || !userCode || !host || !cfg.deviceHosts.includes(host)) {
    throw new Error(`device code request failed (${res.status}${data.error ? ` ${String(data.error).slice(0, 60)}` : ''})`);
  }
  const num = (v, d, min, max) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : d);
  return {
    deviceCode,
    userCode,
    verificationUri: uri,
    interval: num(data.interval, 5, 1, 60),
    expiresIn: num(data.expires_in, 900, 60, 1800),
  };
}

/**
 * Device login step 2: one token request. Returns { status: 'pending' | 'slow_down' | 'denied' | 'expired' | 'ok', accessToken? }.
 * Both providers report "not yet" through an `error` field (GitHub with HTTP 200, Google with 428/403/400).
 */
export async function pollDeviceLogin(cfg, deviceCode, fetchImpl = fetch) {
  const { res, data } = await postForm(
    cfg.tokenUrl,
    {
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    },
    fetchImpl,
  );
  if (typeof data.access_token === 'string' && data.access_token) return { status: 'ok', accessToken: data.access_token };
  const err = data.error;
  if (err === 'authorization_pending') return { status: 'pending' };
  if (err === 'slow_down') return { status: 'slow_down' };
  if (err === 'access_denied') return { status: 'denied' };
  if (err === 'expired_token') return { status: 'expired' };
  throw new Error(`device token request failed (${res.status}${err ? ` ${String(err).slice(0, 60)}` : ''})`);
}
