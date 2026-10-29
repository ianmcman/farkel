const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createServer } = require('../server/server.js');

async function withServer(fn) {
  const s = createServer(path.join(__dirname, '..', 'site'));
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  try { await fn(`http://127.0.0.1:${s.address().port}`); } finally { s.close(); }
}

test('serves the page, scripts and health check', () => withServer(async base => {
  const home = await fetch(base + '/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Farmer Farkle/);
  assert.equal((await fetch(base + '/game.js')).status, 200);
  assert.equal(await (await fetch(base + '/healthz')).text(), 'ok');
  assert.match((await fetch(base + '/')).headers.get('content-security-policy'), /default-src 'self'/);
}));

test('blocks traversal and bad encoding', () => withServer(async base => {
  assert.equal((await fetch(base + '/%2e%2e/package.json')).status, 404);
  assert.equal((await fetch(base + '/%E0%A4%A')).status, 400);
  assert.equal((await fetch(base + '/', { method: 'POST' })).status, 405);
}));
