'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { clamp, hills, fadeOff, bumpAt, latEff, INNER } = require('../js/core.js');

test('clamp limita el valor al rango', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(clamp(2, 0, 3), 2);
});

test('hills es determinista y está acotado a ±11.5 m', () => {
  assert.equal(hills(10, 20), hills(10, 20));
  for (let x = -2000; x <= 2000; x += 137) {
    for (let z = -2000; z <= 2000; z += 151) {
      const v = hills(x, z);
      assert.ok(Number.isFinite(v));
      assert.ok(Math.abs(v) <= 11.5 + 1e-9, `fuera de rango en ${x},${z}: ${v}`);
    }
  }
});

test('fadeOff: 0 junto a la carretera, 1 lejos, y no decrece', () => {
  assert.equal(fadeOff(0), 0);
  assert.equal(fadeOff(4.5), 0);
  assert.ok(Math.abs(fadeOff(19.5) - 1) < 1e-12);
  assert.ok(Math.abs(fadeOff(-19.5) - 1) < 1e-12);
  let prev = -1;
  for (let a = 4.5; a <= 19.5; a += 0.5) {
    const v = fadeOff(a);
    assert.ok(v >= prev);
    prev = v;
  }
});

test('bumpAt: sin puentes vale 0, pico en el centro y 0 fuera de la ventana', () => {
  assert.equal(bumpAt([], 5, 8, 30), 0);
  assert.equal(bumpAt([100], 100, 8, 30), 8);
  assert.equal(bumpAt([100], 130, 8, 30), 0);
  assert.equal(bumpAt([100], 200, 8, 30), 0);
});

test('bumpAt es simétrico y suma varios puentes', () => {
  const a = bumpAt([100], 115, 8, 30);
  const b = bumpAt([100], 85, 8, 30);
  assert.ok(a > 0 && a < 8);
  assert.ok(Math.abs(a - b) < 1e-12);
  assert.ok(Math.abs(bumpAt([100, 500], 100, 8, 30) - 8) < 1e-12);
});

test('latEff recorta solo el lado interior según la curvatura', () => {
  assert.equal(latEff({ k: 0 }, 50), 50);
  assert.equal(latEff({ k: 0.1 }, 50), 50);                       // exterior: sin recorte
  assert.equal(latEff({ k: 0.1 }, -5), -5);                       // interior cercano: sin recorte
  assert.ok(Math.abs(latEff({ k: 0.1 }, -50) + INNER / 0.1) < 1e-9);
  assert.ok(Math.abs(latEff({ k: -0.1 }, 50) - INNER / 0.1) < 1e-9);
  assert.equal(latEff({}, -80), -80);
});

test('la malla desplazada no se pliega en curvas de radio 10-40 m (ni a un lado ni al otro)', () => {
  const LAT = [-120, -90, -60, -40, -28, -18, -11, -6.5, -5, 5, 6.5, 11, 18, 28, 40, 60, 90, 120];
  for (const r of [10, 15, 25, 40]) for (const sign of [1, -1]) {
    const k = sign / r, pts = [{ x: 0, z: 0, h: 0, k }];
    let h = 0, x = 0, z = 0;
    for (let i = 0; i < 70; i++) { h += k * 3; x += Math.sin(h) * 3; z += Math.cos(h) * 3; pts.push({ x, z, h, k }); }
    const off = (p, a) => { const e = latEff(p, a); return { x: p.x - Math.cos(p.h) * e, z: p.z + Math.sin(p.h) * e }; };
    for (const a of LAT) for (let i = 0; i < pts.length - 1; i++) {
      const c0 = pts[i], c1 = pts[i + 1], q0 = off(c0, a), q1 = off(c1, a);
      const dot = (q1.x - q0.x) * (c1.x - c0.x) + (q1.z - q0.z) * (c1.z - c0.z);
      assert.ok(dot > 0, `plegado en r=${r} signo=${sign} a=${a} i=${i}`);
    }
  }
});
