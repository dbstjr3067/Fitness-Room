export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export const NETWORK_ERROR = '서버에 연결할 수 없습니다. 네트워크를 확인해 주세요';

// Called (once per response) when an authenticated call gets 401; AppContext checks whether the session is gone.
let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

/** fetch that turns network failures into a Korean ApiError. */
export async function request(url, opts) {
  try {
    return await fetch(url, opts);
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    throw new ApiError(NETWORK_ERROR, 0);
  }
}

/** JSON body of a response, or a Korean ApiError for failures and non-JSON replies. */
export async function readJson(res, path = '') {
  let data = null;
  let parsed = true;
  try {
    data = await res.json();
  } catch {
    parsed = false; // empty or non-JSON body (e.g. a proxy error page)
  }
  if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized?.();
  if (!res.ok) {
    if (data?.error) throw new ApiError(data.error, res.status);
    if (res.status === 413) throw new ApiError('파일이 너무 큽니다', res.status);
    throw new ApiError(
      res.status >= 500 || !parsed ? `서버에서 오류가 발생했습니다 (${res.status}). 잠시 후 다시 시도해 주세요` : `요청에 실패했습니다 (${res.status})`,
      res.status,
    );
  }
  // e.g. an HTML page from a proxy or the static server instead of the API
  if (!parsed && /text\/html/.test(res.headers.get('content-type') || '')) {
    throw new ApiError('서버 응답을 처리할 수 없습니다. 잠시 후 다시 시도해 주세요', res.status);
  }
  return data;
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await request(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return readJson(res, path);
}
