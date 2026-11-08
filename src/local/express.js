// A small Express-compatible router so the server's route modules can run inside the mobile app.
// Supports what server/ uses: Router, use/get/post/put/delete, path params, json/raw body parsers,
// async handlers and error middleware (and HEAD answered by GET routes).

function compile(path, prefix) {
  if (path instanceof RegExp) return { re: path, keys: [] };
  const keys = [];
  const src = path
    .replace(/\/+$/, '')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:(\w+)/g, (_, k) => {
      keys.push(k);
      return '([^/]+)';
    });
  return { re: new RegExp(`^${src}${prefix ? '(?=/|$)' : '/?$'}`), keys };
}

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400, statusCode: 400, expose: true });
}

// '100kb' → 102400 (the units body-parser accepts).
function parseLimit(limit) {
  if (typeof limit === 'number') return limit;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?\s*$/i.exec(String(limit));
  if (!m) return 100 * 1024;
  const unit = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 }[(m[2] || 'b').toLowerCase()];
  return Math.floor(Number(m[1]) * unit);
}

function createRouter() {
  const stack = [];
  const add = (method, prefix) => (first, ...rest) => {
    let paths = ['/'];
    let handlers = [first, ...rest];
    if (typeof first === 'string' || first instanceof RegExp || Array.isArray(first)) {
      paths = Array.isArray(first) ? first : [first];
      handlers = rest;
    }
    for (const p of paths) {
      const { re, keys } = compile(p === '/' && prefix ? '' : p, prefix);
      for (const h of handlers.flat()) if (h) stack.push({ method, prefix, re, keys, handle: h });
    }
    return router;
  };

  async function handle(req, res, done, base = '') {
    let i = 0;
    // Returns a promise, so middleware that awaits (or returns) next() waits for the rest of the chain.
    const next = async (err) => {
      if (res.finished) return;
      const layer = stack[i++];
      if (!layer) return done(err);
      const path = req.path.slice(base.length) || '/';
      if (layer.method && layer.method !== req.method && !(layer.method === 'GET' && req.method === 'HEAD')) return next(err);
      const m = layer.re.exec(path);
      if (!m) return next(err);
      const params = {};
      try {
        layer.keys.forEach((k, j) => (params[k] = decodeURIComponent(m[j + 1])));
      } catch {
        // Same as Express: a malformed %-escape in a path parameter is a 400, not a crash.
        return next(err || badRequest('요청 주소가 올바르지 않습니다'));
      }
      req.params = { ...req.params, ...params };
      const h = layer.handle;
      const isErrorHandler = h.length === 4;
      try {
        if (h.__router) {
          if (err) return next(err);
          return await h.__router.handle(req, res, next, base + m[0]);
        }
        if (err) return isErrorHandler ? await h(err, req, res, next) : next(err);
        if (isErrorHandler) return next();
        await h(req, res, next);
      } catch (e) {
        return next(e);
      }
    };
    return next();
  }

  const router = function () {};
  router.__router = { handle };
  router.use = add(null, true);
  router.get = add('GET', false);
  router.post = add('POST', false);
  router.put = add('PUT', false);
  router.delete = add('DELETE', false);
  router.disable = () => router;
  return router;
}

function express() {
  return createRouter();
}

express.Router = createRouter;

express.json = ({ limit = '100kb' } = {}) => {
  const max = parseLimit(limit);
  return (req, _res, next) => {
    if (req.bodyParsed) return next();
    const type = req.headers['content-type'] || '';
    if (type.includes('application/json') && req.rawBody?.length) {
      if (req.rawBody.length > max) return next(Object.assign(new Error('too large'), { type: 'entity.too.large' }));
      const text = new TextDecoder().decode(req.rawBody);
      // strict mode, like body-parser: only objects and arrays.
      if (!/^[\s\uFEFF]*[{[]/.test(text)) return next(Object.assign(new Error('bad json'), { type: 'entity.parse.failed' }));
      try {
        req.body = JSON.parse(text);
      } catch {
        return next(Object.assign(new Error('bad json'), { type: 'entity.parse.failed' }));
      }
      req.bodyParsed = true;
    }
    return next();
  };
};

express.raw = ({ limit = 100 * 1024 } = {}) => {
  const max = parseLimit(limit);
  return (req, _res, next) => {
    if (req.bodyParsed) return next();
    const buf = Buffer.from(req.rawBody || new Uint8Array());
    if (buf.length > max) return next(Object.assign(new Error('too large'), { type: 'entity.too.large' }));
    req.body = buf;
    req.bodyParsed = true;
    return next();
  };
};

express.static = () => (_req, _res, next) => next();

export default express;

// Query string → object; a repeated key becomes an array, as in Express.
function parseQuery(searchParams) {
  const query = {};
  for (const key of new Set(searchParams.keys())) {
    const all = searchParams.getAll(key);
    query[key] = all.length > 1 ? all : all[0];
  }
  return query;
}

/**
 * Run one request through an app built with this shim. Returns { status, headers, body, setCookies, clearCookies }.
 * Resolves once a response has been sent (json/send/end/redirect/sendFile), even when middleware called next()
 * without awaiting it; if nothing responds within `timeoutMs`, answers 500.
 */
export async function dispatch(app, { method, url, headers = {}, body, cookies = {} }, { timeoutMs = 30000 } = {}) {
  const u = new URL(url, 'http://local');
  const req = {
    method,
    url: u.pathname + u.search,
    path: u.pathname,
    query: parseQuery(u.searchParams),
    headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
    rawBody: body,
    body: {},
    params: {},
    cookies,
    ip: '127.0.0.1',
  };
  const out = { status: 200, headers: { 'content-type': 'application/json' }, body: '', setCookies: {}, clearCookies: [] };
  let finish;
  const finished = new Promise((resolve) => (finish = resolve));
  const end = (data) => {
    if (res.finished) return res;
    if (data !== undefined) out.body = data;
    res.finished = true;
    finish();
    return res;
  };
  const res = {
    finished: false,
    status(code) {
      out.status = code;
      return res;
    },
    set(k, v) {
      out.headers[k.toLowerCase()] = v;
      return res;
    },
    json(data) {
      return end(JSON.stringify(data));
    },
    send(data) {
      return end(typeof data === 'string' ? data : JSON.stringify(data));
    },
    end(data) {
      return end(data === undefined ? '' : String(data));
    },
    cookie(name, value) {
      out.setCookies[name] = value;
      return res;
    },
    clearCookie(name) {
      out.clearCookies.push(name);
      return res;
    },
    redirect(location) {
      out.status = 302;
      out.headers.location = location;
      return end();
    },
    sendFile() {
      out.status = 404;
      return end(JSON.stringify({ error: 'Not found' }));
    },
  };
  const fail = (err) => {
    if (res.finished) return;
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다' });
  };
  app.__router
    .handle(req, res, (err) => {
      if (res.finished) return;
      if (err) fail(err);
      else res.status(404).json({ error: 'Not found' });
    })
    .catch(fail);
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      fail(new Error(`no response for ${method} ${u.pathname} within ${timeoutMs}ms`));
      resolve();
    }, timeoutMs);
  });
  await Promise.race([finished, timeout]);
  clearTimeout(timer);
  if (method === 'HEAD') out.body = '';
  return out;
}
