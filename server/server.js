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

function createServer(staticDir) {
  const root = path.resolve(staticDir);
  return http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD', ...HEADERS });
      return res.end();
    }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { pathname = null; }
    if (pathname === null || pathname.includes('\0')) {
      res.writeHead(400, HEADERS);
      return res.end('Bad Request');
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
  const port = Number(process.env.PORT) || 8080;
  createServer(path.join(__dirname, '..', 'site')).listen(port, '0.0.0.0', () => console.log(`Farkel listening on ${port}`));
}
