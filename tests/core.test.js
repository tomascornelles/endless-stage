'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { clamp, hills, fadeOff, bumpAt } = require('../js/core.js');

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
