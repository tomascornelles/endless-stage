'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { createServer } = require('../server.js');

const ROOT = path.resolve(__dirname, '..');
let server, base;

function get(p, method = 'GET') {
  return new Promise((resolve, reject) => {
    const url = new URL(base);
    const req = http.request({ host: url.hostname, port: url.port, path: p, method }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test.before(() => new Promise(resolve => {
  server = createServer(ROOT).listen(0, '127.0.0.1', () => {
    base = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));
test.after(() => new Promise(resolve => server.close(resolve)));

test('sirve index.html en la raíz con tipo HTML', async () => {
  const r = await get('/');
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /text\/html/);
  assert.match(r.body, /Endless Stage/);
});

test('sirve JS, CSS y manifest con su tipo MIME', async () => {
  assert.match((await get('/js/core.js')).headers['content-type'], /javascript/);
  assert.match((await get('/css/style.css')).headers['content-type'], /text\/css/);
  assert.match((await get('/manifest.webmanifest')).headers['content-type'], /manifest/);
});

test('sw.js y HTML no se cachean', async () => {
  assert.equal((await get('/sw.js')).headers['cache-control'], 'no-cache');
  assert.equal((await get('/')).headers['cache-control'], 'no-cache');
});

test('404 para archivos inexistentes', async () => {
  assert.equal((await get('/no-existe.js')).status, 404);
});

test('bloquea el acceso fuera de la carpeta del proyecto', async () => {
  const r = await get('/%2e%2e%2f%2e%2e%2fetc%2fpasswd');
  assert.equal(r.status, 403);
  assert.ok(!r.body.includes('root:'));
});

test('solo acepta GET y HEAD', async () => {
  assert.equal((await get('/', 'POST')).status, 405);
  assert.equal((await get('/', 'HEAD')).status, 200);
});
