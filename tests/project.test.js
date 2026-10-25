'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = f => fs.existsSync(path.join(ROOT, f));
const SITE = 'https://endless-stage.netlify.app/';

function pngSize(file) {
  const b = fs.readFileSync(path.join(ROOT, file));
  assert.equal(b.toString('ascii', 1, 4), 'PNG', `${file} no es PNG`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

test('index.html: referencias locales existen', () => {
  const html = read('index.html');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1])
    .filter(u => !u.includes('://') && !u.startsWith('#') && !u.startsWith('data:'));
  assert.ok(refs.length > 0);
  for (const r of refs) assert.ok(exists(r), `falta ${r}`);
});

test('play.html: core.js se carga antes que game.js', () => {
  const html = read('play.html');
  assert.ok(html.indexOf('js/core.js') > 0);
  assert.ok(html.indexOf('js/core.js') < html.indexOf('js/game.js'));
});

test('game.js no redefine las funciones de core.js', () => {
  const game = read('js/game.js');
  for (const name of ['function hills', 'function fadeOff', 'function bumpAt', 'const clamp']) {
    assert.ok(!game.includes(name), `duplicado: ${name}`);
  }
});

test('scripts compilan', () => {
  for (const f of ['js/core.js', 'js/game.js', 'sw.js', 'server.js']) {
    assert.doesNotThrow(() => new vm.Script(read(f), { filename: f }), f);
  }
});

test('SEO: canonical, Open Graph y sitemap apuntan a la URL final', () => {
  const html = read('index.html');
  assert.ok(html.includes(`<link rel="canonical" href="${SITE}">`));
  assert.ok(html.includes(`<meta property="og:url" content="${SITE}">`));
  assert.ok(read('sitemap.xml').includes(`<loc>${SITE}</loc>`));
  assert.ok(read('robots.txt').includes(`Sitemap: ${SITE}sitemap.xml`));
});

test('manifest válido, con iconos reales de tamaño correcto', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.display, 'standalone');
  assert.ok(m.start_url && m.name && m.short_name);
  for (const icon of m.icons) {
    assert.ok(exists(icon.src), `falta ${icon.src}`);
    if (icon.type === 'image/png') {
      const [w, h] = icon.sizes.split('x').map(Number);
      const s = pngSize(icon.src);
      assert.equal(s.w, w); assert.equal(s.h, h);
    }
  }
  const sizes = m.icons.map(i => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
});

test('Service Worker: todos los recursos precacheados existen', () => {
  const sw = read('sw.js');
  const core = sw.match(/const CORE = \[([\s\S]*?)\];/)[1];
  const files = [...core.matchAll(/'([^']+)'/g)].map(m => m[1]).filter(f => f !== './');
  assert.ok(files.length > 5);
  for (const f of files) assert.ok(exists(f), `falta ${f}`);
});

test('favicon e iconos de Apple existen', () => {
  assert.ok(exists('favicon.svg'));
  assert.ok(pngSize('icons/favicon-32.png').w === 32);
  assert.ok(pngSize('icons/apple-touch-icon.png').w === 180);
});
