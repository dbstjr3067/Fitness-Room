// OAuth 2.0 authorization-code login for Google, Naver, Kakao and GitHub.
// A provider is enabled when its <PROVIDER>_CLIENT_ID and <PROVIDER>_CLIENT_SECRET are set.

export const PROVIDERS = {
  google: {
    label: 'Google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    profileUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
    parseProfile: (p) => ({ id: p.sub, name: p.name, email: p.email, avatar: p.picture }),
  },
  naver: {
    label: '네이버',
    authorizeUrl: 'https://nid.naver.com/oauth2.0/authorize',
    tokenUrl: 'https://nid.naver.com/oauth2.0/token',
    profileUrl: 'https://openapi.naver.com/v1/nid/me',
    scope: '',
    parseProfile: (p) => {
      const r = p.response || {};
      return { id: r.id, name: r.nickname || r.name, email: r.email, avatar: r.profile_image };
    },
  },
  kakao: {
    label: '카카오',
    authorizeUrl: 'https://kauth.kakao.com/oauth/authorize',
    tokenUrl: 'https://kauth.kakao.com/oauth/token',
    profileUrl: 'https://kapi.kakao.com/v2/user/me',
    scope: '',
    parseProfile: (p) => {
      const acc = p.kakao_account || {};
      return {
        id: p.id,
        name: acc.profile?.nickname,
        email: acc.email,
        avatar: acc.profile?.profile_image_url,
      };
    },
  },
  github: {
    label: 'GitHub',
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    profileUrl: 'https://api.github.com/user',
    scope: 'read:user user:email',
    parseProfile: (p) => ({ id: p.id, name: p.name || p.login, email: p.email, avatar: p.avatar_url }),
  },
};

export function providerConfig(env, id) {
  const p = PROVIDERS[id];
  if (!p) return null;
  const key = id.toUpperCase();
  const clientId = env[`${key}_CLIENT_ID`];
  const clientSecret = env[`${key}_CLIENT_SECRET`];
  return { ...p, id, clientId, clientSecret, enabled: Boolean(clientId && clientSecret) };
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
  });
  const token = await tokenRes.json();
  if (!tokenRes.ok || !token.access_token) {
    throw new Error(`token exchange failed (${tokenRes.status})`);
  }
  const profileRes = await fetchImpl(cfg.profileUrl, {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      Accept: 'application/json',
      'User-Agent': 'fitness-room',
    },
  });
  if (!profileRes.ok) throw new Error(`profile request failed (${profileRes.status})`);
  const profile = cfg.parseProfile(await profileRes.json());
  if (profile.id === undefined || profile.id === null) throw new Error('profile has no id');
  return { ...profile, id: String(profile.id) };
}
