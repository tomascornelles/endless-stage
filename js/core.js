/* Endless Stage · funciones puras, compartidas por el juego y los tests */
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

// Ondulación del terreno en coordenadas del mundo (acotada a ±11.5 m)
function hills(x, z) {
  return 6 * Math.sin(x * 0.011 + 1.3) * Math.cos(z * 0.013)
    + 3.5 * Math.sin(x * 0.027 + z * 0.021)
    + 2 * Math.sin(z * 0.05 - x * 0.031);
}

// 0 junto a la carretera, 1 lejos de ella
function fadeOff(a) {
  const f = clamp((Math.abs(a) - 4.5) / 15, 0, 1);
  return f * f * (3 - 2 * f);
}

// Elevación de los puentes en un índice de la pista
function bumpAt(bridges, idx, height, width) {
  let s = 0;
  for (const c of bridges) {
    const d = Math.abs(idx - c);
    if (d < width) { const t = 1 - d / width; s += height * t * t * (3 - 2 * t); }
  }
  return s;
}


// Hacia el interior de una curva, un desplazamiento lateral mayor que el radio de giro hace que la malla se pliegue
// sobre sí misma (capas de terreno cruzadas sobre la carretera y el cielo). Se limita a INNER × radio.
// Convención del trazado: con k > 0 el exterior es a > 0 y el interior a < 0.
const INNER = 0.92;
function latEff(p, a) {
  const k = p.k || 0;
  if (a * k < 0) {
    const lim = INNER / Math.abs(k);
    if (Math.abs(a) > lim) return Math.sign(a) * lim;
  }
  return a;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { clamp, hills, fadeOff, bumpAt, latEff, INNER };
}
