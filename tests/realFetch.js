// fetch for jsdom tests: sends relative /api calls to the test server and keeps cookies per "browser".
import { inject } from 'vitest';

export function createBrowserFetch() {
  const origin = inject('apiOrigin');
  const nodeFetch = globalThis.__nodeFetch || globalThis.fetch;
  globalThis.__nodeFetch = nodeFetch;
  const jar = new Map();
  const fetchImpl = async (url, opts = {}) => {
    const target = String(url).startsWith('/') ? origin + url : url;
    const headers = new Headers(opts.headers || {});
    if (jar.size) headers.set('Cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
    let body = opts.body;
    if (body && typeof body === 'object' && typeof body.arrayBuffer === 'function') body = Buffer.from(await body.arrayBuffer());
    const res = await nodeFetch(target, { ...opts, body, headers, redirect: 'manual' });
    for (const c of res.headers.getSetCookie?.() || []) {
      const [pair, ...attrs] = c.split(';');
      const [k, ...v] = pair.split('=');
      const expired = attrs.some((a) => /expires=thu, 01 jan 1970/i.test(a.trim()) || /max-age=0$/i.test(a.trim()));
      if (expired) jar.delete(k.trim());
      else jar.set(k.trim(), v.join('='));
    }
    return res;
  };
  return { fetch: fetchImpl, jar, api: (path, o) => fetchImpl(`/api${path}`, o).then((r) => r.json()) };
}
