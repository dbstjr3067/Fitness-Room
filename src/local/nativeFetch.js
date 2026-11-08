// fetch() for the in-app server's requests to Google / GitHub during social login.
// Those sign-in endpoints don't allow requests from a web page (no CORS), so on the phone they go through
// Capacitor's native HTTP instead of the WebView. Elsewhere (tests, browser preview) the normal fetch is used.

/** Form bodies are sent as text; native HTTP returns parsed JSON or text, rebuilt here into a Response. */
export function makeNativeFetch(http, fallback = globalThis.fetch) {
  return async function nativeFetch(url, init = {}) {
    const target = String(url);
    if (!http || !/^https:\/\//i.test(target)) return fallback(url, init);
    const headers = { ...(init.headers || {}) };
    const body = init.body === undefined || init.body === null ? undefined : String(init.body);
    const r = await http.request({
      url: target,
      method: init.method || 'GET',
      headers,
      data: body,
      responseType: 'text',
      connectTimeout: 10000,
      readTimeout: 10000,
    });
    const text = typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? null);
    return new Response(text, { status: r.status, headers: { 'Content-Type': 'application/json' } });
  };
}

/** Native HTTP when running inside the Android app, otherwise the browser's fetch. */
export async function appFetch() {
  try {
    const { Capacitor, CapacitorHttp } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) return makeNativeFetch(CapacitorHttp);
  } catch {
    // not inside Capacitor
  }
  return (...args) => globalThis.fetch(...args);
}
