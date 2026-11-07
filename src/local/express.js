// A small Express-compatible router so the server's route modules can run inside the mobile app.
// Supports what server/ uses: Router, use/get/post/put/delete, path params, json/raw body parsers,
// async handlers and error middleware.

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
    const next = async (err) => {
      if (res.finished) return;
      const layer = stack[i++];
      if (!layer) return done(err);
      const path = req.path.slice(base.length) || '/';
      if (layer.method && layer.method !== req.method) return next(err);
      const m = layer.re.exec(path);
      if (!m) return next(err);
      const params = {};
      layer.keys.forEach((k, j) => (params[k] = decodeURIComponent(m[j + 1])));
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

express.json = () => (req, _res, next) => {
  if (req.bodyParsed) return next();
  const type = req.headers['content-type'] || '';
  if (type.includes('application/json') && req.rawBody) {
    try {
      req.body = JSON.parse(new TextDecoder().decode(req.rawBody));
    } catch {
      return next(Object.assign(new Error('bad json'), { type: 'entity.parse.failed' }));
    }
    req.bodyParsed = true;
  }
  next();
};

express.raw = ({ limit = 100 * 1024 } = {}) => (req, _res, next) => {
  if (req.bodyParsed) return next();
  const buf = Buffer.from(req.rawBody || new Uint8Array());
  if (buf.length > limit) return next(Object.assign(new Error('too large'), { type: 'entity.too.large' }));
  req.body = buf;
  req.bodyParsed = true;
  next();
};

express.static = () => (_req, _res, next) => next();

export default express;

/** Run one request through an app built with this shim. Returns { status, headers, body, cookies }. */
export async function dispatch(app, { method, url, headers = {}, body, cookies = {} }) {
  const u = new URL(url, 'http://local');
  const req = {
    method,
    url: u.pathname + u.search,
    path: u.pathname,
    query: Object.fromEntries(u.searchParams),
    headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
    rawBody: body,
    body: {},
    params: {},
    cookies,
    ip: '127.0.0.1',
  };
  const out = { status: 200, headers: { 'content-type': 'application/json' }, body: '', setCookies: {}, clearCookies: [] };
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
      out.body = JSON.stringify(data);
      res.finished = true;
      return res;
    },
    send(data) {
      out.body = typeof data === 'string' ? data : JSON.stringify(data);
      res.finished = true;
      return res;
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
      res.finished = true;
      return res;
    },
    sendFile() {
      out.status = 404;
      out.body = JSON.stringify({ error: 'Not found' });
      res.finished = true;
      return res;
    },
  };
  await app.__router.handle(req, res, (err) => {
    if (res.finished) return;
    if (err) {
      console.error(err);
      res.status(500).json({ error: '서버 오류가 발생했습니다' });
    } else res.status(404).json({ error: 'Not found' });
  });
  return out;
}
