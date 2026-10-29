const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const HEADERS = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff'
};
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json; charset=utf-8', '.txt': 'text/plain; charset=utf-8'
};

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...HEADERS });
  res.end(JSON.stringify(data));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0, tooLarge = false;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 4096) tooLarge = true; else chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) return reject(Object.assign(new Error('Payload Too Large'), { status: 413 }));
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

// Behind a reverse proxy the socket peer is the proxy; trust X-Real-IP only from configured proxy addresses.
function makeClientIp(trusted) {
  const set = new Set(trusted);
  return req => {
    const peer = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    const fwd = req.headers['x-real-ip'];
    return set.has(peer) && typeof fwd === 'string' && fwd ? fwd.trim() : peer;
  };
}

function createLimiter(max, windowMs) {
  const hits = new Map();
  return key => {
    const t = Date.now();
    const list = (hits.get(key) || []).filter(x => x > t - windowMs);
    if (list.length >= max) { hits.set(key, list); return false; }
    list.push(t);
    hits.set(key, list);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || v[v.length - 1] <= t - windowMs) hits.delete(k);
    return true;
  };
}

function createServer({ store, staticDir, trustedProxies = [], createLimit = 10, joinLimit = 40 }) {
  const root = path.resolve(staticDir);
  const clientIp = makeClientIp(trustedProxies);
  const allowCreate = createLimiter(createLimit, 60 * 60e3);
  const allowJoin = createLimiter(joinLimit, 15 * 60e3);

  async function api(req, res, pathname, url) {
    const method = req.method;
    const tokenOf = () => req.headers['x-token'];
    try {
      if (method === 'POST' && pathname === '/api/rooms') {
        if (!allowCreate(clientIp(req))) return sendJson(res, 429, { error: 'Too many rooms from this address. Try again later.' });
        const body = await readJsonBody(req);
        return sendJson(res, 201, store.create(body.name));
      }
      const m = pathname.match(/^\/api\/rooms\/([^/]+)\/(join|start|act|events)$/);
      if (!m) return sendJson(res, 404, { error: 'Not Found' });
      const code = decodeURIComponent(m[1]);
      if (method === 'POST' && m[2] === 'join') {
        if (!allowJoin(clientIp(req))) return sendJson(res, 429, { error: 'Too many join attempts. Try again in a few minutes.' });
        const body = await readJsonBody(req);
        return sendJson(res, 200, store.join(code, body.name));
      }
      if (method === 'POST' && m[2] === 'start') {
        await readJsonBody(req);
        store.start(code, tokenOf());
        return sendJson(res, 200, {});
      }
      if (method === 'POST' && m[2] === 'act') {
        const body = await readJsonBody(req);
        store.act(code, tokenOf(), body);
        return sendJson(res, 200, {});
      }
      if (method === 'GET' && m[2] === 'events') return events(req, res, code, url.searchParams.get('watch'));
      return sendJson(res, 404, { error: 'Not Found' });
    } catch (err) {
      sendJson(res, err.status || 500, { error: err.status ? err.message : 'Internal error' });
    }
  }

  function events(req, res, code, token) {
    if (!token) return sendJson(res, 403, { error: 'Token is required' });
    let initial;
    try { initial = store.view(code, token); } catch (err) { return sendJson(res, err.status || 500, { error: err.message }); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', ...HEADERS });
    res.write(`data: ${JSON.stringify(initial)}\n\n`);
    let closed = false;
    const unsubscribe = store.subscribe(code, () => {
      try { res.write(`data: ${JSON.stringify(store.view(code, token))}\n\n`); } catch { cleanup(); res.end(); }
    });
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    ping.unref();
    function cleanup() {
      if (closed) return;
      closed = true;
      clearInterval(ping);
      unsubscribe();
    }
    req.on('close', cleanup);
    req.on('error', cleanup);
  }

  return http.createServer((req, res) => {
    let url, pathname;
    try { url = new URL(req.url, 'http://x'); pathname = decodeURIComponent(url.pathname); } catch { pathname = null; }
    if (pathname === null || pathname.includes('\0')) {
      res.writeHead(400, HEADERS);
      return res.end('Bad Request');
    }
    if (pathname.startsWith('/api/')) return api(req, res, pathname, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD', ...HEADERS });
      return res.end();
    }
    if (pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...HEADERS });
      return res.end('ok');
    }
    const file = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(404, HEADERS);
      return res.end('Not Found');
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, HEADERS);
        return res.end('Not Found');
      }
      const headers = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', ...HEADERS };
      if (path.basename(file) === 'sw.js') headers['Cache-Control'] = 'no-cache';
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  });
}

module.exports = { createServer };

if (require.main === module) {
  const { createRoomStore } = require('./rooms.js');
  const store = createRoomStore();
  setInterval(() => store.sweep(), 10 * 60 * 1000).unref();
  const port = Number(process.env.PORT) || 8080;
  const trustedProxies = (process.env.TRUSTED_PROXY || '').split(',').map(x => x.trim()).filter(Boolean);
  createServer({ store, staticDir: path.join(__dirname, '..', 'site'), trustedProxies }).listen(port, '0.0.0.0', () => console.log(`Farkel listening on ${port}`));
}
