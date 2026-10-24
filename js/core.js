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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { clamp, hills, fadeOff, bumpAt };
}
