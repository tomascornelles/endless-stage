/* Endless Stage · motor del juego */
const STEP = 3, CH = 20, ROAD_W = 10, GRASS = 120, BAR = ROAD_W / 2 + 0.4;
const BRIDGE_H = 8, BRIDGE_W = 30;
const LAT = [-GRASS, -90, -60, -40, -28, -18, -11, -6.5, -5, 5, 6.5, 11, 18, 28, 40, 60, 90, GRASS];
const WALLS = ['rail', 'wave', 'stone', 'hay', 'tyre'];
const TERR = [
  { name: 'Asfalto', road: 0xffffff, grass: 0xffffff, max: 70, acc: 1.0, grip: 1.0 },
  { name: 'Grava',   road: 0xc9a77e, grass: 0xd8c39a, max: 56, acc: 0.9, grip: 0.6 },
  { name: 'Nieve',   road: 0xa9c4df, grass: 0xc4dbf3, max: 46, acc: 0.8, grip: 0.25 },
  { name: 'Barro',   road: 0x8a6a4a, grass: 0x7d9a5a, max: 42, acc: 0.7, grip: 0.5 }
];
const $ = id => document.getElementById(id);
const DEBUG = /[?&]debug=1/.test(location.search);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// La configuración de assets/manifest.json se lee antes de arrancar; si falta, se usan texturas procedurales
// Iconos de aviso por defecto (SVG con currentColor). El manifiesto puede sustituirlos en 'arrows'.
const FB_ICONS = {
  left: '<svg viewBox="0 0 24 24"><path d="M10 4 L4 10 L10 16 M4 10 H16 Q20 10 20 14 V21" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M14 4 L20 10 L14 16 M20 10 H8 Q4 10 4 14 V21" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  obstacle: '<svg viewBox="0 0 24 24"><path d="M12 3 L22 20 H2 Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M12 9 V14 M12 16.5 V17" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'
};
// Avisos visibles en el menú para diagnosticar recursos que no cargan
const notice = msg => {
  const el = document.getElementById('notice');
  if (!el || !DEBUG) return;
  el.classList.remove('hidden');
  el.textContent += (el.textContent ? '\n' : '') + msg;
};
if (location.protocol === 'file:') notice('Abre el juego con npm start (http://localhost:8080): el navegador bloquea los archivos locales.');
fetch('assets/manifest.json')
  .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .catch(e => { notice('No se pudo leer assets/manifest.json (' + e.message + ')'); return {}; })
  .then(init);

function init(M) {
  const DS = THREE.DoubleSide;
  const loader = new THREE.TextureLoader();
  const texCache = {};
  const REPEAT = { plaster: 3, roof: 3, guardrail: 3, stone: 2, rock: 2, hay: 2, concrete: 2, wave: 2, wheel: 2, log: 2, snow: 2 };
  // Repetición final = base × ajuste de M.repeat (manifiesto)
  const rep = name => ((REPEAT[name] || 1) / 0.3) * ((M.repeat && M.repeat[name]) || 1);

  // ---------- Texturas ----------
  function canvasTex(w, h, draw, rep = [1, 1]) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rep[0], rep[1]);
    return t;
  }
  // Carga un PNG externo sobre la textura de respaldo (mismo objeto, así los materiales se actualizan solos)
  const one = u => (Array.isArray(u) ? (u.length ? pick(u) : null) : u);
  function ext(url, fallback, onload) {
    url = one(url);
    if (url) loader.load(url, t => {
      fallback.image = t.image; fallback.needsUpdate = true;
      if (onload) onload(t.image);
    }, undefined, () => {});
    return fallback;
  }
  const tex = (name, draw) => ext(M.textures && M.textures[name], canvasTex(128, 128, draw));
  const noise = (base, spk, amt) => (x, w, h) => {
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    for (let i = 0; i < w * h / 6; i++) {
      x.fillStyle = `rgba(${spk},${Math.random() * amt})`;
      x.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  };
  const stoneDraw = (x, w, h) => {
    x.fillStyle = '#8c8a84'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#5d5b56'; x.lineWidth = 3;
    for (let r = 0; r < h; r += 32) for (let c = -((r / 32) % 2) * 32; c < w; c += 64) x.strokeRect(c, r, 64, 32);
  };
  const hayDraw = (x, w, h) => {
    x.fillStyle = '#d9b24c'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#a67c2a';
    for (let i = 0; i < 60; i++) { const y = Math.random() * h; x.beginPath(); x.moveTo(0, y); x.lineTo(w, y + rnd(-6, 6)); x.stroke(); }
  };
  const tileDraw = (x, w, h) => {
    x.fillStyle = '#8a3b2a'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#5e2418'; x.lineWidth = 2;
    for (let r = 0; r < h; r += 16) { x.beginPath(); x.moveTo(0, r); x.lineTo(w, r); x.stroke(); }
  };
  const tireDraw = (x, w, h) => {
    x.clearRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) { x.fillStyle = `rgba(0,0,0,${rnd(0.15, 0.4)})`; x.fillRect(0, rnd(0, h), w, rnd(4, 14)); }
  };
  const pineDraw = (x) => {
    x.fillStyle = '#1f6b34';
    for (let i = 0; i < 4; i++) { const y = 20 + i * 24, w = 14 + i * 5; x.beginPath(); x.moveTo(32, y - 20); x.lineTo(32 - w, y + 14); x.lineTo(32 + w, y + 14); x.closePath(); x.fill(); }
    x.fillStyle = '#5a3d22'; x.fillRect(29, 108, 6, 20);
  };
  const roundDraw = (x) => {
    x.fillStyle = '#3f9a46';
    x.beginPath(); x.arc(32, 50, 28, 0, 7); x.fill();
    x.beginPath(); x.arc(22, 72, 18, 0, 7); x.fill();
    x.beginPath(); x.arc(42, 74, 18, 0, 7); x.fill();
    x.fillStyle = '#5a3d22'; x.fillRect(29, 108, 6, 20);
  };

  const TX = {
    grass: tex('grass', noise('#4f8f3a', '30,80,25', 0.6)),
    asphalt: tex('asphalt', noise('#3a3e47', '90,90,90', 0.5)),
    rock: tex('rock', noise('#7a7470', '50,45,40', 0.7)),
    stone: tex('stone', stoneDraw),
    hay: tex('hay', hayDraw),
    concrete: tex('concrete', noise('#9aa3ad', '60,60,60', 0.4)),
    plaster: tex('plaster', noise('#e8e0d0', '120,110,100', 0.3)),
    roof: tex('roof', tileDraw),
    tire: tex('tire', tireDraw),
    snow: tex('snow', noise('#eef4fb', '110,130,160', 0.9)),
    tireSnow: canvasTex(128, 128, (x, w, h) => { x.clearRect(0, 0, w, h); for (let i = 0; i < 6; i++) { x.fillStyle = `rgba(70,78,90,${rnd(0.3, 0.6)})`; x.fillRect(0, rnd(0, h), w, rnd(4, 14)); } })
  };

  const sizedTex = (t, r) => { t.repeat.set(r || 1, r || 1); return t; };
  // Árboles: PNG de assets/trees (uno al azar por árbol) o dos sprites procedurales
  function spriteMat(url, kind) {
    const fb = canvasTex(64, 128, kind === 'pine' ? pineDraw : roundDraw);
    const m = new THREE.MeshLambertMaterial({ map: fb, alphaTest: 0.4, side: DS });
    m.userData.aspect = 2;
    m.userData.size = (M.repeat && M.repeat.trees) || 1;
    ext(url, fb, img => { m.userData.aspect = img.height / img.width; });
    return m;
  }
  const TREE_MATS = M.trees && M.trees.length
    ? M.trees.map(u => spriteMat(u, 'pine'))
    : [spriteMat(null, 'pine'), spriteMat(null, 'round')];

  // Personas low poly: 64 variantes (altura, complexión, ropa, pelo y accesorios)

  // Casas de colores sólidos (sin texturas) y tejado blanco en tramos de nieve
  const WALL_MATS = [0xf2e6d0, 0xd9a77b, 0xa8c3d6, 0xe0d28a, 0xc9b8e6, 0xf0c0b0, 0xb8d8c4, 0xe8b4a0].map(c => new THREE.MeshLambertMaterial({ color: c, side: DS }));
  const ROOF_MATS = [0x8a3b2a, 0x3d4a5c, 0x6b5744, 0x2e5a6b, 0x7a3030].map(c => new THREE.MeshLambertMaterial({ color: c, side: DS }));
  const SNOW_ROOF = new THREE.MeshLambertMaterial({ color: 0xf4f8ff, side: DS });

  // Texturas como arrays: cada material escoge una al azar y la aplica al cargarse
  function bindMap(mat, name) {
    const list = M.textures && M.textures[name];
    const arr = Array.isArray(list) ? list : (list ? [list] : []);
    if (!arr.length) return;
    const url = pick(arr);
    const r = rep(name);
    const apply = t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(r, r); mat.map = t; mat.needsUpdate = true; };
    if (texCache[url]) return apply(texCache[url]);
    loader.load(url, t => { texCache[url] = t; apply(t); }, undefined, () => notice('Textura no encontrada: ' + url));
  }

  // Pool: un material por textura del manifiesto; cada elemento escoge uno al azar
  function urlsOf(name) { const l = M.textures && M.textures[name]; return Array.isArray(l) ? l : (l ? [l] : []); }
  function loadInto(mat, url, name) {
    const r = rep(name);
    const apply = t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(r, r); mat.map = t; mat.needsUpdate = true; };
    if (texCache[url]) return apply(texCache[url]);
    loader.load(url, t => { texCache[url] = t; apply(t); }, undefined, () => notice('Textura no encontrada: ' + url));
  }
  function pool(name, Cls, opts) {
    const urls = urlsOf(name);
    if (!urls.length) return [new Cls(Object.assign({}, opts))];
    return urls.map(u => { const m = new Cls(Object.assign({}, opts)); loadInto(m, u, name); return m; });
  }
  const TM = TERR.map(t => {
    const snow = t.name === 'Nieve';
    return {
      road: pool(snow ? 'snow' : 'asphalt', THREE.MeshLambertMaterial, { map: snow ? TX.snow : TX.asphalt, color: t.road, side: DS, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
      grass: pool(snow ? 'snow' : 'grass', THREE.MeshLambertMaterial, { map: snow ? TX.snow : TX.grass, color: t.grass, side: DS, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
    };
  });
  // Materiales de transición: cada terreno con opacidad creciente (25, 50, 75, 100 %)
  const TMB = TERR.map(t => {
    const snow = t.name === 'Nieve';
    return [0.25, 0.5, 0.75, 1].map(op => ({
      road: new THREE.MeshLambertMaterial({ map: snow ? TX.snow : TX.asphalt, color: t.road, side: DS, transparent: op < 1, opacity: op, depthWrite: op >= 1, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
      grass: new THREE.MeshLambertMaterial({ map: snow ? TX.snow : TX.grass, color: t.grass, side: DS, transparent: op < 1, opacity: op, depthWrite: op >= 1, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
    }));
  });
  const MAT = {
    line: new THREE.MeshLambertMaterial({ color: 0xfafafa, side: DS }),
    kerb: new THREE.MeshLambertMaterial({ color: 0xff4d4d, side: DS }),
    rail: pool('guardrail', THREE.MeshLambertMaterial, { color: 0xdfe6f0, side: DS }),
    post: new THREE.MeshLambertMaterial({ color: 0x6b7380 }),
    wave: pool('wave', THREE.MeshLambertMaterial, { map: TX.concrete, color: 0xffffff, side: DS }),
    stone: pool('stone', THREE.MeshLambertMaterial, { map: TX.stone, side: DS }),
    hay: pool('hay', THREE.MeshLambertMaterial, { map: TX.hay }),
    tyre: pool('wheel', THREE.MeshLambertMaterial, { color: 0xcfcfcf }),
    tireMark: pool('tire', THREE.MeshBasicMaterial, { map: TX.tire, color: 0xffffff, transparent: true, depthWrite: false, side: DS, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    tireMarkSnow: new THREE.MeshBasicMaterial({ map: TX.tireSnow, color: 0xffffff, transparent: true, depthWrite: false, side: DS, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    pothole: new THREE.MeshLambertMaterial({ color: 0x1d1d1d }),
    puddle: new THREE.MeshPhongMaterial({ color: 0x2c4f6e, transparent: true, opacity: 0.75, shininess: 140, side: DS }),
    rock: pool('rock', THREE.MeshPhongMaterial, { map: TX.rock, flatShading: true, shininess: 0 }),
    snow: new THREE.MeshPhongMaterial({ color: 0xf4f8ff, flatShading: true, shininess: 0 }),
    pillar: new THREE.MeshLambertMaterial({ color: 0x9aa3ad }),
    log: pool('log', THREE.MeshLambertMaterial, { map: canvasTex(64, 64, noise('#6b4a2b', '40,25,10', 0.6)) }),
    cone: pool('cone', THREE.MeshLambertMaterial, { map: canvasTex(64, 64, x => { x.fillStyle = '#ff7a1a'; x.fillRect(0, 0, 64, 64); }), color: 0xffffff }),
    mountain: new THREE.MeshLambertMaterial({ vertexColors: true })
  };


  // Geometrías compartidas (no se eliminan al descargar un tramo)
  const BOX = new THREE.BoxGeometry(1, 1, 1); BOX.translate(0, 0.5, 0);
  const PYR = new THREE.ConeGeometry(0.75, 1, 4); PYR.rotateY(Math.PI / 4); PYR.translate(0, 0.5, 0);
  const PRISM = (() => {
    const A = [-.5, 0, -.5], B = [.5, 0, -.5], C = [.5, 0, .5], D = [-.5, 0, .5], E = [0, 1, -.5], F = [0, 1, .5], v = [];
    const tri = (...ps) => ps.forEach(p => v.push(...p));
    tri(A, D, F, A, F, E); tri(B, E, F, B, F, C); tri(A, E, B); tri(D, C, F);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    return g;
  })();
  const PILLAR = new THREE.BoxGeometry(1.4, 1, 1.4);
  const POST = new THREE.BoxGeometry(0.15, 1.1, 0.15); POST.translate(0, 0.55, 0);
  const HAY = new THREE.BoxGeometry(1, 1, 1); HAY.translate(0, 0.5, 0);
  // Arbustos: icosaedro aplastado, color por instancia
  const BUSH_G = new THREE.IcosahedronGeometry(1, 1); BUSH_G.scale(1, 0.8, 1); BUSH_G.translate(0, 0.6, 0);
  const BUSH_MAT = new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true, shininess: 0 });
  const SNOW_COL = new THREE.Color(0xf4f8ff);
  // Sombreado translúcido en el centro de la calzada
  const SHADE_MAT = new THREE.MeshBasicMaterial({
    map: canvasTex(64, 4, (x, w, h) => {
      const gr = x.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.15)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = gr; x.fillRect(0, 0, w, h);
    }),
    transparent: true, depthWrite: false, side: DS,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3
  });
  // Banda degradada de anchura 2·half centrada en el desplazamiento `c`, con el degradado mapeado de borde a borde
  function gradStrip(list, c, half, y) {
    const P = [], UV = [];
    const at = (p, l, u) => { const q = ptAt(p, l); P.push(q.x, p.y + y, q.z); UV.push(u, 0.5); };
    for (let i = 0; i < list.length - 1; i++) {
      const A = list[i], B = list[i + 1];
      at(A, c - half, 0); at(A, c + half, 1); at(B, c + half, 1); at(A, c - half, 0); at(B, c + half, 1); at(B, c - half, 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    return geo;
  }
  // Destello rojo en el lado del impacto (-1 izquierda, 1 derecha)
  function hitFlash(side) {
    const el = side < 0 ? $('hitL') : $('hitR');
    if (!el) return;
    el.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('on')));
  }
  const BUSH_COLS = [0x2f7a3a, 0x3f8f46, 0x5aa85a, 0x2b6a3a, 0x7fb24a, 0x6b8e3a].map(h => new THREE.Color(h));
  // Estrechamiento: bloques rojos y blancos
  // Paisaje: vallas, tendido, cultivos, silos, agua y carteles
  const WOOD_MAT = new THREE.MeshLambertMaterial({ color: 0x8a5a2b, side: DS });
  const WIRE_MAT = new THREE.MeshBasicMaterial({ color: 0x1b1b1b, side: DS });
  const POLE_MAT = new THREE.MeshLambertMaterial({ color: 0x6d6f73 });
  const PYLON_MAT = new THREE.MeshLambertMaterial({ color: 0x9aa3ad });
  const CROP_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, side: DS });
  const WATER_MAT = new THREE.MeshPhongMaterial({ color: 0x2b6f9e, specular: 0xd0ecff, shininess: 140, transparent: true, opacity: 0.85, side: DS });
  const SILO_G = new THREE.CylinderGeometry(1.8, 1.8, 9, 14); SILO_G.translate(0, 4.5, 0);
  const SILO_TOP_G = new THREE.SphereGeometry(1.8, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2); SILO_TOP_G.translate(0, 9, 0);
  const SILO_MAT = new THREE.MeshLambertMaterial({ color: 0xd9dde3 });
  const SILO_ROOF_MAT = new THREE.MeshLambertMaterial({ color: 0x8c949e });
  const ADS = [['ENDLESS OIL', '#b71c1c', '#ffffff'], ['GRAVA 24', '#0d47a1', '#ffd166'], ['TURBO TYRES', '#1b5e20', '#ffffff'], ['RALLY FUEL', '#e65100', '#111111'], ['NORTH SHOCKS', '#263238', '#7cf5ff']];
  const AD_MATS = ADS.map(([t, bg, fg]) => new THREE.MeshLambertMaterial({ map: canvasTex(256, 128, x => {
    x.fillStyle = bg; x.fillRect(0, 0, 256, 128);
    x.fillStyle = fg; x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(t, 128, 64);
  }) }));
  const TYRE_G = new THREE.TorusGeometry(0.55, 0.22, 8, 14); TYRE_G.rotateX(Math.PI / 2);
  const TYRE_LP = new THREE.TorusGeometry(0.55, 0.22, 5, 8); TYRE_LP.rotateX(Math.PI / 2);
  const TYRE_LP_MAT = new THREE.MeshPhongMaterial({ color: 0x2a2a2a, flatShading: true, shininess: 0 });
  const CIRCLE = new THREE.CircleGeometry(1, 14);
  const MOUNT = (() => {
    const g = new THREE.ConeGeometry(1, 1, 28, 10, false);
    g.translate(0, 0.5, 0);
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
    const cLow = new THREE.Color(0x4f6b3e), cRock = new THREE.Color(0x7a716a), cSnow = new THREE.Color(0xf2f6fa), tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const n = Math.sin(x * 7.1 + z * 3.3) * 0.5 + Math.sin(x * 13.7 - z * 9.1) * 0.25 + Math.sin(y * 11 + x * 2) * 0.15;
      const j = 1 + n * 0.18 * (1 - y * 0.6);
      pos.setXYZ(i, x * j, y + n * 0.04, z * j);
      const t = clamp(y, 0, 1);
      if (t < 0.45) tmp.copy(cLow).lerp(cRock, t / 0.45);
      else if (t < 0.8) tmp.copy(cRock);
      else tmp.copy(cRock).lerp(cSnow, (t - 0.8) / 0.2);
      col.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  })();
  const CANOPY_G = new THREE.ConeGeometry(1, 1, 7); CANOPY_G.translate(0, 0.5, 0);
  const TREE_PLANE = new THREE.PlaneGeometry(1, 1); TREE_PLANE.translate(0, 0.5, 0);
  const SHADOW_MAT = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  // Árboles low poly: 64 variantes (forma, tamaño, color, copas) con tronco en el suelo y ramas que unen las copas
  const TREE_LP = true;
  const DEBUG = /[?&]debug=1/.test(location.search);
  const LP_MAT = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 0 });
  const buildLP = snow => {
    const out = [], UP = new THREE.Vector3(0, 1, 0), ZERO = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1), IDQ = new THREE.Quaternion();
    const palette = [0x2f7a3a, 0x3f8f46, 0x5aa85a, 0x2b6a3a, 0x7fb24a, 0xc8842a, 0xd9b53b, 0xb4472e];
    for (let k = 0; k < 64; k++) {
      let seed = ((k + 1) * 2654435761) % 4294967296;
      const r01 = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
      const R = (a, b) => a + (b - a) * r01();
      const shape = ['pine', 'round', 'tall', 'cloud'][k % 4];
      const sz = R(0.8, 1.4), H = R(2.0, 3.0) * sz;
      const base = new THREE.Color(palette[Math.floor(r01() * palette.length)]);
      const P = [], N = [], C = [];
      const put = (geo, pos, quat, scl, col) => {
        const g = geo.index ? geo.toNonIndexed() : geo, m = new THREE.Matrix4().compose(pos, quat, scl);
        const nm = new THREE.Matrix3().getNormalMatrix(m), pa = g.attributes.position, na = g.attributes.normal;
        const v = new THREE.Vector3(), n = new THREE.Vector3();
        for (let i = 0; i < pa.count; i++) {
          v.fromBufferAttribute(pa, i).applyMatrix4(m); P.push(v.x, v.y, v.z);
          n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); N.push(n.x, n.y, n.z);
          C.push(col.r, col.g, col.b);
        }
      };
      const branch = (a, b, r, col) => {
        const d = new THREE.Vector3().subVectors(b, a), len = d.length();
        const q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
        put(new THREE.CylinderGeometry(r, r, 1, 5).translate(0, 0.5, 0), a, q, new THREE.Vector3(1, len, 1), col);
      };
      const shade = c => c.clone().offsetHSL(0, 0, R(-0.05, 0.05));
      const crownC = c => (snow ? c.clone().lerp(new THREE.Color(0xf4f8ff), 0.55) : c);
      const trunkCol = new THREE.Color(0x6b4a2b);
      put(new THREE.CylinderGeometry(0.2 * sz, 0.3 * sz, H, 6).translate(0, H / 2, 0), ZERO, IDQ, ONE, trunkCol);
      if (shape === 'pine') {
        const tiers = 2 + Math.floor(r01() * 3);
        for (let i = 0; i < tiers; i++) {
          const rc = R(1.8, 2.6) * sz * (1 - i * 0.22), hc = 1.9 * sz;
          put(new THREE.ConeGeometry(rc, hc, 6).translate(0, hc / 2, 0), new THREE.Vector3(0, H * 0.55 + i * hc * 0.65, 0), IDQ, ONE, crownC(shade(base)));
        }
      } else {
        const top = new THREE.Vector3(0, H * 0.85, 0), crowns = [];
        if (shape === 'round') {
          const n = 1 + Math.floor(r01() * 3), rad = R(1.5, 2.1) * sz;
          crowns.push({ c: new THREE.Vector3(0, H + rad * 0.6, 0), r: rad, s: [1, 1, 1] });
          for (let i = 1; i < n; i++) crowns.push({ c: new THREE.Vector3((r01() < 0.5 ? -1 : 1) * R(1.2, 2.2) * sz, H * R(0.8, 1.15), R(-1, 1) * sz), r: rad * 0.7, s: [1, 1, 1] });
        } else if (shape === 'tall') {
          const n = 2 + Math.floor(r01() * 2), rad = R(1.1, 1.4) * sz;
          for (let i = 0; i < n; i++) crowns.push({ c: new THREE.Vector3(0, H + rad * (1.2 + i * 1.6), 0), r: rad, s: [0.9, 1.4, 0.9] });
        } else {
          const n = 3 + Math.floor(r01() * 3);
          for (let i = 0; i < n; i++) crowns.push({ c: new THREE.Vector3(R(-1.4, 1.4) * sz, H + R(0.5, 2.0) * sz, R(-1.4, 1.4) * sz), r: R(0.9, 1.4) * sz, s: [1, 1, 1] });
        }
        for (const cr of crowns) {
          branch(top, cr.c, 0.12 * sz, trunkCol);
          put(new THREE.IcosahedronGeometry(cr.r, 0), cr.c, IDQ, new THREE.Vector3(...cr.s), crownC(shade(base)));
          if (snow) put(new THREE.IcosahedronGeometry(cr.r * 0.7, 0), cr.c.clone().add(new THREE.Vector3(0, cr.r * 0.45, 0)), IDQ, new THREE.Vector3(...cr.s), new THREE.Color(0xffffff));
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      out.push(g);
    }
    return out;
  };
  const LP = buildLP(false), LP_SNOW = buildLP(true);
  const ROCK_G = new THREE.IcosahedronGeometry(1, 0);
  const LOG_G = new THREE.CylinderGeometry(0.4, 0.4, 2.6, 8); LOG_G.rotateZ(Math.PI / 2);
  const CONE_G = new THREE.ConeGeometry(0.35, 0.9, 8);

  // ---------- Three.js ----------
  const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const SKY = 0x8fd3ff;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 200, 900);
  const cam = new THREE.PerspectiveCamera(68, 1, 0.3, 900);
  // Faros: foco unido a la cámara que solo se enciende de noche
  const headL = new THREE.SpotLight(0xfff3d6, 0, 70, 0.42, 0.45, 1);
  headL.position.set(0, 0, 0);
  headL.target.position.set(0, -1.6, -14);
  cam.add(headL); cam.add(headL.target);
  const headP = new THREE.PointLight(0xfff3d6, 0, 14, 1.5);
  headP.position.set(0, -0.8, 0.5);
  cam.add(headP);
  scene.add(cam);
  // Farolas: 4 luces que se colocan en las farolas más cercanas al coche, solo de noche
  const lampLights = [0, 1, 2, 3].map(() => { const L = new THREE.PointLight(0xffd9a0, 0, 30, 1.5); scene.add(L); return L; });
  let lampTick = 0;
  function updateLampLights() {
    if (!document.body.classList.contains('night')) {
      if (lampLights[0].intensity) lampLights.forEach(L => { L.intensity = 0; });
      return;
    }
    if (++lampTick % 10) return;
    const c = sample(S.p);
    const best = LAMPS.map(l => ({ l, d: (l.x - c.x) ** 2 + (l.z - c.z) ** 2 })).sort((a, b) => a.d - b.d).slice(0, lampLights.length);
    lampLights.forEach((L, i) => {
      const b = best[i];
      if (b && b.d < 900) { L.position.set(b.l.x, b.l.y, b.l.z); L.intensity = 3; } else L.intensity = 0;
    });
  }
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x4a5a3a, 0.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.5);
  sun.position.set(-80, 120, 60);
  // Sombras del sol: la zona de sombra sigue al coche (unos 140 m)
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  scene.add(sun.target);
  scene.add(sun);
  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    cam.aspect = innerWidth / innerHeight;
    cam.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // ---------- Relieve y geometría ----------
  function ptAt(p, a) { a = latEff(p, a); return { x: p.x - Math.cos(p.h) * a, z: p.z + Math.sin(p.h) * a }; }
  // Campo de alturas: en cada punto, la altura del trazado más cercano. A menos de 5 m coincide con la pista;
  // de 5 a 25 m se funde con el relieve natural. Así el terreno nunca invade la calzada ni deja huecos.
  function nearestTrack(x, z) {
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    let best = -1, bd = Infinity;
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
      const L = grid.get((cx + dx) + ',' + (cz + dz));
      if (!L) continue;
      for (const j of L) {
        const o = pts[j], d = (o.x - x) ** 2 + (o.z - z) ** 2;
        if (d < bd) { bd = d; best = j; }
      }
    }
    return { j: best, d: Math.sqrt(bd) };
  }
  function fieldAt(x, z) {
    const n = nearestTrack(x, z);
    if (n.j < 0) return -1;
    const p = pts[n.j];
    const base = p.y - p.b - 0.1 - 3.5 * (p.b / BRIDGE_H);
    const w = clamp((n.d - 5) / 20, 0, 1), sm = w * w * (3 - 2 * w);
    return base + sm * hills(x, z);
  }
  // ---------- Mapa de alturas: teselas de 500 x 500 m, malla de 4 m ----------
  const TILE = 500, RES = 10, NT = TILE / RES;
  function tileHeight(x, z) {
    const A = 0.6 + 1.1 * (0.5 + 0.5 * Math.sin(x / 900 + z / 700));
    return 45 + A * (14 * Math.sin(x / 420) * Math.cos(z / 520) + 8 * Math.sin((x + z) / 380 + 0.7) + 4 * Math.sin(z / 260 - x / 300));
  }
  function ensureTile(tx, tz) {
    const key = tx + ',' + tz;
    if (tiles.has(key)) return;
    const ox = tx * TILE, oz = tz * TILE, N1 = NT + 1, H = new Float32Array(N1 * N1);
    for (let i = 0; i < N1; i++) for (let k = 0; k < N1; k++) H[i * N1 + k] = tileHeight(ox + i * RES, oz + k * RES);
    const pos = new Float32Array(N1 * N1 * 3);
    for (let i = 0; i < N1; i++) for (let k = 0; k < N1; k++) {
      const o = (i * N1 + k) * 3;
      pos[o] = ox + i * RES; pos[o + 1] = H[i * N1 + k]; pos[o + 2] = oz + k * RES;
    }
    const gI = [], sI = [];
    for (let i = 0; i < NT; i++) for (let k = 0; k < NT; k++) {
      const a = i * N1 + k, b = (i + 1) * N1 + k, c = (i + 1) * N1 + k + 1, d = i * N1 + k + 1;
      const avg = (H[a] + H[b] + H[c] + H[d]) / 4;
      (avg > 52 ? sI : gI).push(a, d, b, b, d, c);   // por encima de 52 m: nieve
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(gI.concat(sI));
    g.addGroup(0, gI.length, 0);
    g.addGroup(gI.length, sI.length, 1);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, [pick(TM[0].grass), pick(TM[2].grass)]);
    mesh.receiveShadow = true;
    world.add(mesh);
    tiles.set(key, { tx, tz, H, mesh });
    placeMountain(tx, tz);
  }
  let lastAT = NaN, lastAZ = NaN;
  function ensureAround(x, z) {
    const tx = Math.floor(x / TILE), tz = Math.floor(z / TILE);
    if (tx === lastAT && tz === lastAZ) return;
    lastAT = tx; lastAZ = tz;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) ensureTile(tx + dx, tz + dz);
  }
  function cullTiles(p) {
    const cp = pts[Math.min(Math.floor(p), pts.length - 1)];
    if (!cp) return;
    for (const [k, t] of tiles) {
      const dx = (t.tx + 0.5) * TILE - cp.x, dz = (t.tz + 0.5) * TILE - cp.z;
      if (Math.hypot(dx, dz) > 1600) { world.remove(t.mesh); t.mesh.geometry.dispose(); tiles.delete(k); clearMountains(0, 0, k); }
    }
  }
  function terrainAt(x, z) {
    const tx = Math.floor(x / TILE), tz = Math.floor(z / TILE);
    ensureTile(tx, tz);
    const t = tiles.get(tx + ',' + tz), N1 = NT + 1;
    const u = (x - tx * TILE) / RES, v = (z - tz * TILE) / RES;
    const i = Math.min(NT - 1, Math.floor(u)), k = Math.min(NT - 1, Math.floor(v)), fu = u - i, fv = v - k;
    const H = t.H;
    const h00 = H[i * N1 + k], h10 = H[(i + 1) * N1 + k], h01 = H[i * N1 + k + 1], h11 = H[(i + 1) * N1 + k + 1];
    return (h00 * (1 - fu) + h10 * fu) * (1 - fv) + (h01 * (1 - fu) + h11 * fu) * fv;
  }
  // Altura de un punto de la pista: un plano por encima del terreno más alto de su huella (calzada + 2 m a cada lado)
  function roadY(x, z, h) {
    let top = -Infinity;
    for (const along of [-1.5, 0, 1.5]) for (const lat of [-7.4, -3.7, 0, 3.7, 7.4]) {
      const sx = x + Math.sin(h) * along - Math.cos(h) * lat, sz = z + Math.cos(h) * along + Math.sin(h) * lat;
      top = Math.max(top, terrainAt(sx, sz));
    }
    return top + 0.3;
  }
  function groundY(p, a) {
    const q = ptAt(p, a);
    return terrainAt(q.x, q.z);
  }
  // Cinta entre dos desplazamientos laterales; ya/yb pueden ser números o funciones del índice
  function terrainMesh(c, list) {
    const S4 = 4, M = 60;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of list) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    const i0 = Math.floor((x0 - M) / S4), i1 = Math.ceil((x1 + M) / S4);
    const k0 = Math.floor((z0 - M) / S4), k1 = Math.ceil((z1 + M) / S4);
    const pos = [], idx = [];
    for (let i = i0; i < i1; i++) for (let k = k0; k < k1; k++) {
      const n = nearestTrack((i + 0.5) * S4, (k + 0.5) * S4);
      if (n.j < 0 || n.d > M || Math.floor(n.j / CH) !== c) continue;
      const base = pos.length / 3;
      for (const [a, b] of [[i, k], [i + 1, k], [i + 1, k + 1], [i, k + 1]]) pos.push(a * S4, fieldAt(a * S4, b * S4), b * S4);
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  function ribbon(list, a, ya, b, yb, mask) {
    const n = list.length, pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), idx = [];
    for (let i = 0; i < n; i++) {
      const p = list[i], A = ptAt(p, a), B = ptAt(p, b), u = i * STEP / 4;
      const y1 = typeof ya === 'function' ? ya(i) : ya, y2 = typeof yb === 'function' ? yb(i) : yb;
      pos.set([A.x, p.y + y1, A.z, B.x, p.y + y2, B.z], i * 6);
      uv.set([u, 0, u, Math.hypot(B.x - A.x, B.z - A.z, y2 - y1) / 4], i * 4);
      if (i < n - 1 && !(mask && mask(i))) { const j = i * 2; idx.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  function dashes(list) {
    return ribbon(list, -0.15, 0.03, 0.15, 0.03, i => ((i >> 2) & 1) === 1);
  }
  // Malla de hierba. En el interior de una curva, los vértices más allá del límite de la curva se fijan a ese límite
  // (un mismo límite para todo el tramo). Así los vértices cercanos a la carretera mandan y convergen allí,
  // y no se generan triángulos que crucen la calzada.
  // Relleno bajo toda la pista: una lámina a una altura inferior a cualquier punto del tramo.
  // Queda tapada por la hierba y la carretera; solo se ve en los huecos que dejan los recortes de las curvas.
  function fillMesh(list, lats, y) {
    const Mn = lats.length, n = list.length, pos = new Float32Array(n * Mn * 3), idx = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < Mn; j++) {
      const p = list[i], a = lats[j];
      pos.set([p.x - Math.cos(p.h) * a, y, p.z + Math.sin(p.h) * a], (i * Mn + j) * 3);
    }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < Mn - 1; j++) {
      const a = i * Mn + j, b = a + 1, c = a + Mn, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  function groundMesh(list, cols = LAT) {
    let L = Infinity;
    for (const p of list) if (Math.abs(p.k || 0) > 1e-6) L = Math.min(L, 0.92 / Math.abs(p.k));
    const Mn = cols.length, n = list.length, pos = new Float32Array(n * Mn * 3), uv = new Float32Array(n * Mn * 2), idx = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < Mn; j++) {
      const p = list[i], a0 = cols[j], o = i * Mn + j;
      const a = (a0 * (p.k || 0) < 0 && Math.abs(a0) > L) ? Math.sign(a0) * L : a0;
      const q = { x: p.x - Math.cos(p.h) * a, z: p.z + Math.sin(p.h) * a };
      pos.set([q.x, groundY(p, a), q.z], o * 3);
      uv.set([q.x / 4, q.z / 4], o * 2);
    }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < Mn - 1; j++) {
      const a = i * Mn + j, b = a + 1, c = a + Mn, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  // Materiales y geometrías de edificios rurales
  const H_STONE = new THREE.MeshLambertMaterial({ color: 0xa9a39a, side: DS });
  const H_STONE_L = new THREE.MeshLambertMaterial({ color: 0xc9c5bc, side: DS });
  const H_WOOD = new THREE.MeshLambertMaterial({ color: 0x7a5232, side: DS });
  const H_HAY = new THREE.MeshLambertMaterial({ color: 0xd9b44a });
  const H_WATER = new THREE.MeshPhongMaterial({ color: 0x2b6f9e, specular: 0xd0ecff, shininess: 140 });
  const H_CLOCK = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
  const RURAL = ['hayshed', 'cellar', 'washhouse', 'calvary', 'school', 'townhall', 'fountain', 'cemetery', 'shed'];
  // Geometrías para ábsides y cubiertas de cúpula
  const APSE_G = new THREE.CylinderGeometry(0.5, 0.5, 1, 12); APSE_G.translate(0, 0.5, 0);
  const APSE_ROOF_G = new THREE.CylinderGeometry(0, 0.6, 1, 12); APSE_ROOF_G.translate(0, 0.5, 0);
  // Edificio compuesto: 2-3 formas combinadas (cuerpos y tejados). Incluye tipos de iglesia.
  // Sin puertas ni ventanas; el centro queda en la mitad de la huella y el tamaño se mide al final.
  function house(x, y, z, yaw, snow) {
    const roll = Math.random();
    const kind = roll < 0.01 ? pick(['chapel', 'nave', 'romanic'])
      : roll < 0.11 ? pick(RURAL)
      : pick(['gable', 'hip', 'flat', 'L', 'tower', 'barn', 'T', 'cross', 'twin', 'chalet']);
    let w = rnd(3, 6.5), d = rnd(3, 6), h = rnd(3, 6);
    if (kind === 'tower') h = rnd(7, 11);
    if (kind === 'nave') { w = rnd(5, 6.5); d = rnd(10, 14); h = rnd(4, 5); }
    if (kind === 'romanic') { w = rnd(5, 6.5); d = rnd(8, 11); h = rnd(4, 5); }
    if (kind === 'chapel') { w = rnd(3, 4); d = rnd(4, 5); h = rnd(3, 4); }
    const wm = pick(WALL_MATS), rm = snow ? SNOW_ROOF : pick(ROOF_MATS);
    const g = new THREE.Group();
    const DN = 3; // cimientos: el cuerpo se prolonga bajo el suelo para no dejar huecos
    const body = (sx, sy, sz, px, pz, mat) => {
      const m = new THREE.Mesh(BOX, mat);
      m.scale.set(sx, sy + DN, sz); m.position.set(px, -DN, pz); m.userData.own = false; g.add(m);
    };
    const part = (geo, sx, sy, sz, px, py, pz, mat) => {
      const m = new THREE.Mesh(geo, mat);
      m.scale.set(sx, sy, sz); m.position.set(px, py, pz); m.userData.own = false; g.add(m);
    };
    const roofH = () => rnd(1.5, 2.5);
    if (kind === 'L') {
      body(w, h, d * 0.6, 0, -d * 0.2, wm);
      part(PRISM, w * 1.08, roofH(), d * 0.66, 0, h, -d * 0.2, rm);
      body(w * 0.5, h * 0.8, d * 0.5, w * 0.4, d * 0.3, wm);
      part(PYR, w * 0.55, 1.2, d * 0.55, w * 0.4, h * 0.8, d * 0.3, rm);
    } else if (kind === 'tower') {
      body(w * 0.6, h, w * 0.6, 0, 0, wm);
      part(PYR, w * 0.7, w * 0.8, w * 0.7, 0, h, 0, rm);
    } else if (kind === 'barn') {
      body(w * 1.5, h, d * 1.8, 0, 0, wm);
      part(PRISM, w * 1.6, roofH(), d * 1.9, 0, h, 0, rm);
    } else if (kind === 'T') {
      // Casa principal con ala lateral hacia delante
      body(w, h, d, 0, 0, wm); part(PRISM, w * 1.08, roofH(), d * 1.08, 0, h, 0, rm);
      body(w * 0.5, h * 0.8, d * 0.6, -w * 0.25, d / 2 + d * 0.3, wm);
      part(PRISM, w * 0.54, roofH(), d * 0.65, -w * 0.25, h * 0.8, d / 2 + d * 0.3, rm);
    } else if (kind === 'cross') {
      // Casa con alas delante y detrás (planta en cruz)
      body(w, h, d, 0, 0, wm); part(PRISM, w * 1.08, roofH(), d * 1.08, 0, h, 0, rm);
      for (const sg of [1, -1]) {
        body(w * 0.5, h * 0.8, d * 0.6, 0, sg * (d / 2 + d * 0.3), wm);
        part(PRISM, w * 0.54, roofH(), d * 0.65, 0, h * 0.8, sg * (d / 2 + d * 0.3), rm);
      }
    } else if (kind === 'twin') {
      // Dos casas adosadas de alturas distintas
      body(w * 0.5, h, d, -w * 0.25, 0, wm); part(PRISM, w * 0.54, roofH(), d * 1.08, -w * 0.25, h, 0, rm);
      body(w * 0.5, h * 0.8, d * 0.9, w * 0.25, 0, wm); part(PRISM, w * 0.54, roofH(), d * 0.97, w * 0.25, h * 0.8, 0, rm);
    } else if (kind === 'chalet') {
      // Cuerpo bajo con tejado amplio y porche delantero
      body(w, h * 0.7, d, 0, 0, wm); part(PRISM, w * 1.12, roofH() * 1.2, d * 1.12, 0, h * 0.7, 0, rm);
      body(w * 0.6, 2.2, 1.2, 0, d / 2 + 0.6, wm); part(BOX, w * 0.66, 0.2, 1.4, 0, 2.2, d / 2 + 0.6, rm);
    } else if (kind === 'chapel') {
      // Ermita: nave pequeña con espadaña (torre y pináculo en la fachada)
      body(w, h, d, 0, 0, wm); part(PRISM, w * 1.08, roofH(), d * 1.08, 0, h, 0, rm);
      body(w * 0.4, h * 1.5, w * 0.4, 0, d / 2 + w * 0.2, wm);
      part(PYR, w * 0.5, w, w * 0.5, 0, h * 1.5, d / 2 + w * 0.2, rm);
    } else if (kind === 'nave') {
      // Iglesia de nave larga con torre de campanario a los pies
      const tz = d / 2 + w * 0.25;
      body(w, h, d, 0, 0, wm); part(PRISM, w * 1.08, roofH(), d * 1.08, 0, h, 0, rm);
      body(w * 0.5, h * 1.9, w * 0.5, 0, tz, wm);
      part(PYR, w * 0.6, w * 1.1, w * 0.6, 0, h * 1.9, tz, rm);
    } else if (kind === 'romanic') {
      // Iglesia románica: nave, ábside semicircular al fondo y torre lateral
      body(w, h, d, 0, 0, wm); part(PRISM, w * 1.08, roofH(), d * 1.08, 0, h, 0, rm);
      part(APSE_G, w * 0.95, h * 0.9, w * 0.95, 0, 0, -d / 2, wm);
      part(APSE_ROOF_G, w * 0.95, roofH() * 1.3, w * 0.95, 0, h * 0.9, -d / 2, rm);
      body(w * 0.3, h * 1.6, w * 0.3, -w * 0.3, d / 2 - w * 0.15, wm);
      part(PYR, w * 0.4, w * 0.9, w * 0.4, -w * 0.3, h * 1.6, d / 2 - w * 0.15, rm);
    } else if (kind === 'hayshed') {
      // Pajar: nave baja con los fardos apilados delante
      body(w * 1.6, h * 0.7, d * 1.2, 0, 0, wm);
      part(PRISM, w * 1.7, roofH(), d * 1.3, 0, h * 0.7, 0, rm);
      for (let k = 0; k < 3; k++) for (let l = 0; l < 2; l++) part(BOX, 1.4, 0.9, 1.4, -w * 0.5 + k * 1.5, l * 0.9, d * 0.6 + 1.0, H_HAY);
    } else if (kind === 'cellar') {
      // Bodega: cuerpo de piedra bajo, tejado suave y chimenea
      body(w * 1.2, h * 0.6, d * 1.2, 0, 0, H_STONE);
      part(PRISM, w * 1.3, roofH() * 0.8, d * 1.3, 0, h * 0.6, 0, rm);
      part(BOX, 0.5, 2.0, 0.5, w * 0.3, h * 0.6, -d * 0.2, H_STONE);
    } else if (kind === 'washhouse') {
      // Lavadero: cubierta sobre cuatro pilares y pila de agua
      part(BOX, w * 1.2, 0.3, d * 1.2, 0, 3.2, 0, rm);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(BOX, 0.25, 3.2, 0.25, sx * w * 0.55, 0, sz * d * 0.55, H_STONE);
      part(BOX, w * 0.9, 0.7, d * 0.4, 0, 0, 0, H_STONE);
      part(BOX, w * 0.8, 0.05, d * 0.3, 0, 0.7, 0, H_WATER);
    } else if (kind === 'calvary') {
      // Cruz de término: peana, fuste y brazo
      part(BOX, 1.0, 1.0, 1.0, 0, 0, 0, H_STONE);
      part(BOX, 0.35, 2.6, 0.35, 0, 1.0, 0, H_STONE);
      part(BOX, 1.2, 0.35, 0.35, 0, 2.6, 0, H_STONE);
    } else if (kind === 'school') {
      // Escuela: edificio largo con espadaña en el tejado
      const rh = roofH();
      body(w * 1.5, h, d * 1.3, 0, 0, wm);
      part(PRISM, w * 1.6, rh, d * 1.4, 0, h, 0, rm);
      part(BOX, w * 0.35, h * 0.4, w * 0.35, 0, h + rh, 0, wm);
      part(PYR, w * 0.45, w * 0.6, w * 0.45, 0, h + rh + h * 0.4, 0, rm);
    } else if (kind === 'townhall') {
      // Ayuntamiento: edificio con torre central, reloj y pináculo
      const rh = roofH(), tz = d / 2 + w * 0.2;
      body(w * 1.4, h, d, 0, 0, wm);
      part(PRISM, w * 1.5, rh, d * 1.1, 0, h, 0, rm);
      part(BOX, w * 0.5, h * 1.6, w * 0.5, 0, 0, tz, wm);
      part(BOX, w * 0.4, w * 0.4, 0.1, 0, h * 1.2, tz + w * 0.26, H_CLOCK);
      part(PYR, w * 0.6, w * 0.9, w * 0.6, 0, h * 1.6, tz, rm);
    } else if (kind === 'fountain') {
      // Fuente de pueblo: pila circular, columna y cuenco superior
      part(APSE_G, 3.2, 0.5, 3.2, 0, 0, 0, H_STONE);
      part(APSE_G, 2.6, 0.08, 2.6, 0, 0.42, 0, H_WATER);
      part(BOX, 0.4, 1.6, 0.4, 0, 0.5, 0, H_STONE);
      part(APSE_G, 1.2, 0.3, 1.2, 0, 2.1, 0, H_STONE);
    } else if (kind === 'cemetery') {
      // Cementerio: filas de lápidas y una cruz al fondo
      for (let gx = -2; gx <= 2; gx++) for (let gz = -1; gz <= 1; gz++) part(BOX, 0.5, 0.8, 0.12, gx * 1.5, 0, gz * 2.2, H_STONE_L);
      part(BOX, 0.2, 1.6, 0.2, 0, 0, -3.4, H_STONE_L);
      part(BOX, 0.7, 0.2, 0.2, 0, 1.2, -3.4, H_STONE_L);
    } else if (kind === 'shed') {
      // Cobertizo para aperos: caseta de madera con tejado a dos aguas
      body(w * 0.9, h * 0.6, d * 0.9, 0, 0, H_WOOD);
      part(PRISM, w * 0.95, roofH(), d * 0.95, 0, h * 0.6, 0, rm);
    } else {
      // gable, hip y flat
      body(w, h, d, 0, 0, wm);
      if (kind === 'gable') part(PRISM, w * 1.08, roofH(), d * 1.08, 0, h, 0, rm);
      else if (kind === 'hip') part(PYR, w * 1.1, roofH(), d * 1.1, 0, h, 0, rm);
      else part(BOX, w * 1.06, 0.25, d * 1.06, 0, h, 0, rm);
    }
    // Centrar la huella en el origen y medirla: hw y hd sirven para colisiones y para colocarla junto a la pista
    g.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(g);
    const cx = (bb.max.x + bb.min.x) / 2, cz = (bb.max.z + bb.min.z) / 2;
    for (const ch of g.children) { ch.position.x -= cx; ch.position.z -= cz; }
    g.userData.hw = (bb.max.x - bb.min.x) / 2 + 0.2;
    g.userData.hd = (bb.max.z - bb.min.z) / 2 + 0.2;
    g.userData.top = bb.max.y;
    g.position.set(x, y, z); g.rotation.y = yaw;
    return g;
  }

  let houseCols = [];
  function addHouse(g, x, y, z, yaw, c, snow) {
    const h = house(x, y, z, yaw, snow);
    g.add(h);
    houseCols.push({ x, z, yaw, hw: h.userData.hw, hd: h.userData.hd, c });
  }

  // Estrechamiento: la barrera de un lado se acerca a la calzada siguiendo una curva suave (sin cajas).
  // pinchMap guarda, por punto, cuánto se estrecha y en qué lado; la física usa ese valor como límite lateral.
  const PINCH_ADS = AD_MATS.map(m => new THREE.MeshLambertMaterial({ map: m.map, side: DS }));
  function pinchWall(list, sgn, BAR, i0, i1, v, mat, g) {
    const P = [], UV = [], H = 1.2, STEP_M = 2.4;   // una publicidad por cada 2,4 m (imagen 2:1 sobre 1,2 m de alto)
    const at = (i, y) => {
      const q = ptAt(list[i], sgn * (BAR - v(i)));
      P.push(q.x, list[i].y + y, q.z);
      UV.push((i - i0) * STEP / STEP_M, y / H);
    };
    for (let i = i0; i < i1; i++) { at(i, 0); at(i, H); at(i + 1, H); at(i, 0); at(i + 1, H); at(i + 1, 0); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); m.userData.own = true; g.add(m);
  }
  function addPinch(g, list, c, BAR) {
    const sgn = pick([-1, 1]), len = 14 + Math.floor(rnd(0, 6)), i0 = Math.floor(rnd(1, CH - len - 1)), i1 = i0 + len;
    const amp = rnd(1.6, 2.6), v = i => amp * Math.sin(Math.PI * (i - i0) / len);
    for (let i = i0; i <= i1; i++) pinchMap.set(c * CH + i, { s: sgn, v: v(i) });
    pinchWall(list, sgn, BAR, i0, i1, v, pick(PINCH_ADS), g);
    // Solo aviso (no colisiona): ⚠ al llegar al estrechamiento
    obsCols.push({ x: list[i0].x, z: list[i0].z, r: 0, c, i: c * CH + i0, warnOnly: true });
  }
  // Obstáculos ocasionales sobre la carretera
  let obsCols = [];
  function addObstacle(g, p, lat, c, gi) {
    const kind = pick(['rock', 'log']);
    const q = ptAt(p, lat);
    let mesh, r;
    if (kind === 'rock') {
      r = rnd(0.6, 1.1);
      mesh = new THREE.Mesh(ROCK_G, pick(MAT.rock));
      mesh.scale.setScalar(r); mesh.position.set(q.x, p.y + r * 0.5, q.z);
      mesh.rotation.set(rnd(0, 3), rnd(0, 3), 0);
    } else if (kind === 'log') {
      r = 1.3;
      mesh = new THREE.Mesh(LOG_G, pick(MAT.log));
      mesh.position.set(q.x, p.y + 0.4, q.z); mesh.rotation.y = p.h - Math.PI / 2;
    } else {
      r = 0.4;
      mesh = new THREE.Mesh(CONE_G, pick(MAT.cone));
      mesh.position.set(q.x, p.y + 0.45, q.z);
    }
    mesh.userData.own = false; g.add(mesh);
    obsCols.push({ x: q.x, z: q.z, r, c, i: gi });
  }

  // ---------- Muros ----------
  // Muro como volumen: cara exterior, cara superior, cara interior y tapas en los dos extremos
  function wallVolume(list, a, b, yBot, yTop, m, add) {
    const L = list.length - 1, fy = (v, i) => (typeof v === 'function' ? v(i) : v);
    add(ribbon(list, a, yBot, a, yTop), m);
    add(ribbon(list, a, yTop, b, yTop), m);
    add(ribbon(list, b, yTop, b, yBot), m);
    for (const i of [0, L]) {
      const p = list[i], A = ptAt(p, a), B = ptAt(p, b), y0 = fy(yBot, i), y1 = fy(yTop, i);
      const pos = new Float32Array([A.x, p.y + y0, A.z, A.x, p.y + y1, A.z, B.x, p.y + y1, B.z, B.x, p.y + y0, B.z]);
      const uv = new Float32Array([0, 0, 0, 1, 1, 1, 1, 0]);
      const cap = new THREE.BufferGeometry();
      cap.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      cap.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      cap.setIndex([0, 1, 2, 0, 2, 3]);
      cap.computeVertexNormals();
      add(cap, m);
    }
  }
  // Proyección lateral de (x, z) sobre el punto o del trazado (positiva a la izquierda del rumbo)
  const latOf = (x, z, o) => (x - o.x) * -Math.cos(o.h) + (z - o.z) * Math.sin(o.h);
  // Punto desplazado `lat` lateralmente y `fw` hacia delante desde p (mismo convenio que ptAt)
  const offPt = (p, lat, fw) => ({ x: p.x - Math.cos(p.h) * lat + Math.sin(p.h) * fw, z: p.z + Math.sin(p.h) * lat + Math.cos(p.h) * fw });
  // ¿Está q en el lado sgn y a al menos `min` m del eje de la pista?
  function beyond(q, sgn, min) {
    const n = nearestTrack(q.x, q.z);
    if (n.j < 0) return false;
    return latOf(q.x, q.z, pts[n.j]) * sgn >= min && n.d >= min - 0.1;
  }
  const putIn = (map, v, e) => { if (!map.has(v)) map.set(v, []); map.get(v).push(e); };
  function freeMesh(o) { o.traverse(m => { if (m.isMesh && m.userData.own) m.geometry.dispose(); }); }

  // Fila de casas cuya cara próxima hace de barrera; huecos de 1 m como máximo
  function barrierHouses(list, sgn, g, BAR, ctx) {
    const maxS = (list.length - 1) * STEP;
    let s = rnd(0, 3);
    while (s < maxS - 4) {
      const p = list[Math.min(list.length - 1, Math.floor(s / STEP))];
      const h = house(0, 0, 0, p.h, ctx.snowC);
      const hw = h.userData.hw, hd = h.userData.hd, A = BAR + 0.3 + hw;
      const cs = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([u, v]) => offPt(p, sgn * (A + u * hw), v * hd));
      if (cs.every(q => beyond(q, sgn, BAR - 0.1))) {
        const C = offPt(p, sgn * A, 0);
        let y = -Infinity;
        for (const q of cs) y = Math.max(y, terrainAt(q.x, q.z));
        h.position.set(C.x, y, C.z);
        g.add(h);
        houseCols.push({ x: C.x, z: C.z, yaw: p.h, hw, hd, c: ctx.c });
        const eave = offPt(p, sgn * (BAR + 0.3), 0);
        ctx.spots[sgn > 0 ? 1 : 0].push({ s, x: eave.x, y: y + h.userData.top * 0.8, z: eave.z, r: p.y });
        s += 2 * hd + rnd(0.2, 0.9);
      } else {
        // Si la casa no cabe en la curva, un árbol de borde cierra el hueco
        freeMesh(h);
        const q = offPt(p, sgn * (BAR + 1.2), 0);
        if (beyond(q, sgn, BAR + 0.4)) putIn(ctx.trees, ctx.V(), { x: q.x, y: terrainAt(q.x, q.z), z: q.z, ry: rnd(0, 6.28), sc: rnd(1.0, 1.3) });
        s += 1;
      }
    }
  }
  // Fila de árboles pegada a la pista, a intervalos menores de 1,5 m (las copas se solapan)
  function barrierForest(list, sgn, BAR, ctx) {
    const maxS = (list.length - 1) * STEP;
    for (let s = rnd(0, 1); s < maxS; s += rnd(0.9, 1.5)) {
      const p = list[Math.min(list.length - 1, Math.floor(s / STEP))];
      const q = offPt(p, sgn * (BAR + 0.9 + rnd(0, 0.9)), 0);
      if (beyond(q, sgn, BAR + 0.5)) putIn(ctx.trees, ctx.V(), { x: q.x, y: terrainAt(q.x, q.z), z: q.z, ry: rnd(0, 6.28), sc: rnd(1.0, 1.4) });
    }
  }

  // Malla de franjas paralelas a la pista; yOf(p, lat) da la altura de cada vértice; un color por franja
  function bandMesh(list, bands, yOf, mat) {
    const P = [], C = [];
    const push = (p, lat, col) => { const q = ptAt(p, lat); P.push(q.x, yOf(p, lat), q.z); C.push(col.r, col.g, col.b); };
    for (let i = 0; i < list.length - 1; i++) for (const bd of bands) {
      const A = list[i], B = list[i + 1];
      for (const [p, l] of [[A, bd.l0], [A, bd.l1], [B, bd.l1], [A, bd.l0], [B, bd.l1], [B, bd.l0]]) push(p, l, bd.col);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); m.userData.own = true; return m;
  }
  const WHITE = new THREE.Color(1, 1, 1), CROP_A = new THREE.Color(0x6fa33a), CROP_B = new THREE.Color(0x8cbf4a), FURROW = new THREE.Color(0x6b4a2b);
  // Paisaje de un tramo: vallas, cultivos, silos, agua, carteles, farolas y tendido eléctrico
  function decorLandscape(list, c, g, BAR, zone, snowC, hasHouses) {
    const last = list.length - 1;
    for (const sgn of [-1, 1]) {
      if (zone === 'campo' && !snowC && Math.random() < 0.5) {
        // Vallas: postes cada 6 m, dos travesaños de madera o alambre
        const L = sgn * (BAR + 8), wood = Math.random() < 0.5;
        const gyAt = i => groundY(list[i], L);
        for (const h of wood ? [0.5, 0.9] : [0.7, 1.0]) g.add(bandMesh(list, [{ l0: L, l1: L + sgn * (wood ? 0.14 : 0.04), col: WHITE }], (p, l) => groundY(p, l) + h, wood ? WOOD_MAT : WIRE_MAT));
        for (let i = 0; i <= last; i += 2) {
          const post = new THREE.Mesh(BOX, WOOD_MAT);
          post.scale.set(0.14, wood ? 1.3 : 1.1, 0.14); const pq = offPt(list[i], L, 0); post.position.set(pq.x, gyAt(i), pq.z);
          post.userData.own = false; g.add(post);
        }
      }
      if (zone === 'campo' && !snowC && Math.random() < 0.5) {
        // Cultivos en hileras, siguiendo el terreno
        const bands = [];
        for (let k = 0; k < 10; k++) {
          const l0 = sgn * (BAR + 5 + k * 1.0);
          bands.push({ l0, l1: l0 + sgn * 0.6, col: k % 3 === 2 ? FURROW : (k % 2 ? CROP_A : CROP_B) });
        }
        g.add(bandMesh(list, bands, (p, l) => groundY(p, l) + 0.06, CROP_MAT));
      }
      if (zone === 'campo' && !snowC && Math.random() < 0.25) {
        // Silo o granero
        const i = Math.floor(rnd(2, last - 2)), p = list[i], a = sgn * (BAR + 16), q = ptAt(p, a), y = groundY(p, a);
        if (Math.random() < 0.6) {
          const s1 = new THREE.Mesh(SILO_G, SILO_MAT), s2 = new THREE.Mesh(SILO_TOP_G, SILO_ROOF_MAT);
          s1.position.set(q.x, y, q.z); s2.position.set(q.x, y, q.z);
          s1.userData.own = false; s2.userData.own = false; g.add(s1); g.add(s2);
        } else if (nearestTrack(q.x, q.z).d > 15) addHouse(g, q.x, y, q.z, p.h, c, false);
      }
      if (!snowC && Math.random() < 0.12) {
        // Charco o lago con superficie reflectante, ligeramente por debajo del trazado
        g.add(bandMesh(list, [{ l0: sgn * (BAR + 6), l1: sgn * (BAR + 14), col: WHITE }], p => p.y - 0.2, WATER_MAT));
      }
      if (Math.random() < 0.35) {
        // Cartel publicitario de rally sobre dos postes, con la cara hacia la pista
        const i = Math.floor(rnd(2, last - 2)), p = list[i], L = sgn * (BAR + 2), gy = groundY(p, L);
        const panel = new THREE.Mesh(BOX, AD_MATS[Math.floor(Math.random() * AD_MATS.length)]);
        const pc = offPt(p, L, 0);
        panel.scale.set(0.15, 1.6, 4.0); panel.position.set(pc.x, gy + 2.2, pc.z); panel.rotation.y = p.h;
        panel.userData.own = false; g.add(panel);
        for (const fw of [-1.8, 1.8]) {
          const q = offPt(p, L, fw), post = new THREE.Mesh(BOX, POLE_MAT);
          post.scale.set(0.15, 2.3, 0.15); post.position.set(q.x, gy, q.z); post.userData.own = false; g.add(post);
        }
      }
    }
    // Farolas a ambos lados (cada 30 m, cada 15 m en pueblo)
    const step = zone === 'pueblo' ? 5 : 10;
    if (hasHouses) for (let i = 0; i <= last; i += step) for (const sgn of [-1, 1]) {
      if (Math.random() < 0.15) continue;
      const p = list[i], L = sgn * (BAR + 1.3), gy = groundY(p, L), q = offPt(p, L, 0);
      const pole = new THREE.Mesh(BOX, POLE_MAT);
      pole.scale.set(0.16, 7, 0.16); pole.position.set(q.x, gy, q.z); pole.userData.own = false; g.add(pole);
      const arm = new THREE.Mesh(BOX, POLE_MAT), aq = offPt(p, L - sgn * 1.0, 0);
      arm.scale.set(2.0, 0.14, 0.14); arm.position.set(aq.x, gy + 6.9, aq.z); arm.rotation.y = p.h;
      arm.userData.own = false; g.add(arm);
      LAMPS.push({ c, x: aq.x, y: gy + 6.6, z: aq.z });
    }
    // Tendido eléctrico a 6 m del arcén: torres al inicio del tramo y tres cables
    if (Math.random() < 0.5) {
      const sgn = Math.random() < 0.5 ? -1 : 1, L = sgn * (BAR + 6), p = list[0], gy = groundY(p, L), q = offPt(p, L, 0);
      const tower = new THREE.Mesh(BOX, PYLON_MAT);
      tower.scale.set(0.35, 11, 0.35); tower.position.set(q.x, gy, q.z); tower.userData.own = false; g.add(tower);
      const cross = new THREE.Mesh(BOX, PYLON_MAT);
      cross.scale.set(4.2, 0.25, 0.25); cross.position.set(q.x, gy + 10, q.z); cross.rotation.y = p.h; cross.userData.own = false; g.add(cross);
      for (const h of [9.4, 9.8, 10.2]) g.add(bandMesh(list, [{ l0: L, l1: L + sgn * 0.05, col: WHITE }], p => p.y + h, WIRE_MAT));
    }
  }

  // Banderines entre dos casas enfrentadas a ambos lados de la pista: cuerda con sus banderas
  const FLAG_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, side: DS });
  function bunting(ctx, g) {
    const A = pick(ctx.spots[0]);
    let B = null, best = Infinity;
    for (const s of ctx.spots[1]) if (Math.abs(s.s - A.s) < best) { best = Math.abs(s.s - A.s); B = s; }
    if (!B || best > 9) return;
    const cols = [0xff1744, 0xffea00, 0x00e676, 0x00b0ff, 0xd500f9, 0xff6d00, 0xff4081, 0x76ff03, 0x18ffff]
      .map(hx => new THREE.Color(hx));
    const nStrings = 4 + Math.floor(Math.random() * 5);            // 4 a 8 cuerdas
    const cord = [], P = [], C = [];
    for (let s = 0; s < nStrings; s++) {
      // Cuerda a una altura sobre la calzada de 6,2 m o más; la banderola más baja queda a 4 m o más
      const hs = 6.2 + s * 0.35, sag = rnd(0.7, 1.0);
      const PT = t => ({
        x: A.x + (B.x - A.x) * t, y: A.r + hs + (B.r - A.r) * t - sag * 4 * t * (1 - t), z: A.z + (B.z - A.z) * t
      });
      for (let k = 0; k < 24; k++) { const a = PT(k / 24), b = PT((k + 1) / 24); cord.push(a.x, a.y, a.z, b.x, b.y, b.z); }
      const len = Math.hypot(B.x - A.x, B.z - A.z) || 1, ux = (B.x - A.x) / len, uz = (B.z - A.z) / len;
      const n = 8 + Math.floor(Math.random() * 5);                  // 8 a 12 banderines por cuerda
      for (let k = 0; k < n; k++) {
        const q = PT((k + 0.5) / n), col = cols[Math.floor(Math.random() * cols.length)];
        P.push(q.x - ux * 0.3, q.y, q.z - uz * 0.3, q.x + ux * 0.3, q.y, q.z + uz * 0.3, q.x, q.y - 0.9, q.z);
        for (let v = 0; v < 3; v++) C.push(col.r, col.g, col.b);
      }
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(cord, 3));
    const lines = new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0x222222 }));
    lines.userData.own = true; g.add(lines);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    fg.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    fg.computeVertexNormals();
    const flags = new THREE.Mesh(fg, FLAG_MAT);
    flags.userData.own = true; g.add(flags);
  }

  function wallOf(type, list, sgn, g, BAR, ctx) {
    const a = sgn * BAR;
    // Base de la barrera: terreno junto a la carretera, o tablero si está sobre un puente
    const base = i => list[i].y - 0.2;
    const bot = 0;
    const add = (geo, m, own = true) => { const mesh = new THREE.Mesh(geo, m); mesh.userData.own = own; g.add(mesh); };
    if (type === 'rail') {
      add(ribbon(list, a, bot, a, 0.8), pick(MAT.rail));
      for (let i = 0; i < list.length; i += 4) {
        const q = ptAt(list[i], a), m = new THREE.Mesh(POST, MAT.post);
        m.position.set(q.x, base(i), q.z); m.userData.own = false; g.add(m);
      }
    } else if (type === 'wave') {
      const top = i => 0.9 + 0.35 * Math.sin(i * 0.7);
      add(ribbon(list, a, bot, a, top), pick(MAT.wave));
    } else if (type === 'stone') {
      wallVolume(list, a, a + sgn * 0.6, bot, 1.2, pick(MAT.stone), add);
    } else if (type === 'hay') {
      // Dos capas de balas sin huecos: cada bala solapa a la siguiente (altura total ≈ 2 m)
      for (let i = 0; i < list.length - 1; i++) {
        const p = list[i], q0 = ptAt(p, a + sgn * 0.9);
        let top = -Infinity;
        for (const al of [-0.6, 0, 0.6]) for (const al2 of [-1.5, 0, 1.5]) top = Math.max(top, terrainAt(q0.x + Math.sin(p.h) * al2 - Math.cos(p.h) * al, q0.z + Math.cos(p.h) * al2 + Math.sin(p.h) * al));
        for (let layer = 0; layer < 2; layer++) {
          const Q = ptAt(p, a + sgn * (0.9 - (layer ? 0.15 : 0)));
          const m = new THREE.Mesh(HAY, pick(MAT.hay));
          m.position.set(Q.x, top + 0.05 + layer * 1.0, Q.z);
          m.scale.set(1.2 * rnd(0.95, 1.05), rnd(0.95, 1.05), 3.1 * rnd(1.0, 1.1));
          m.rotation.y = p.h; m.userData.own = false; g.add(m);
        }
      }
    } else if (type === 'tyre') {
      // Pilas de neumáticos cada metro, sin huecos
      const slots = [];
      for (let s = 0; s < (list.length - 1) * STEP; s += 1) {
        const i = Math.floor(s / STEP), f = s / STEP - i, p0 = list[i], p1 = list[i + 1];
        const p = { x: p0.x + (p1.x - p0.x) * f, y: p0.y + (p1.y - p0.y) * f, z: p0.z + (p1.z - p0.z) * f, h: p0.h };
        const q = ptAt(p, a + sgn * 0.9), y0 = groundY(p, a + sgn * 0.9) + 0.2, n = Math.random() < 0.5 ? 3 : 4;
        for (let h = 0; h < n; h++) slots.push({ x: q.x, y: y0 + h * 0.4, z: q.z });
      }
      if (!slots.length) return;
      const mats = TREE_LP ? [TYRE_LP_MAT] : MAT.tyre, buckets = mats.map(() => []);
      for (const sl of slots) buckets[Math.floor(Math.random() * mats.length)].push(sl);
      buckets.forEach((bk, bi) => {
        if (!bk.length) return;
        const inst = new THREE.InstancedMesh(TREE_LP ? TYRE_LP : TYRE_G, mats[bi], bk.length);
        const dm = new THREE.Object3D();
        bk.forEach((sl, j) => { dm.position.set(sl.x, sl.y, sl.z); dm.updateMatrix(); inst.setMatrixAt(j, dm.matrix); });
        inst.instanceMatrix.needsUpdate = true;
        inst.userData.own = false; g.add(inst);
      });
    } else if (type === 'houses') {
      barrierHouses(list, sgn, g, BAR, ctx);
    } else if (type === 'forest') {
      barrierForest(list, sgn, BAR, ctx);
    }
  }

  // ---------- Pista procedural ----------
  let pts = [], world = new THREE.Group(), chunks = new Map(), terrMap = new Map(), zoneMap = new Map();
  let grid = new Map(), bridges = [];
  const widthMap = new Map();
  let LAMPS = [];
  const pinchMap = new Map();
  const tiles = new Map();
  const mountains = [];
  function placeMountain(tx, tz) {
    const h1 = Math.abs(Math.sin((tx * 127.1 + tz * 311.7) * 43758.5453)) % 1;
    if (h1 > 0.35) return;
    const h2 = Math.abs(Math.sin((tx * 269.5 + tz * 183.3) * 12345.678)) % 1, h3 = Math.abs(Math.sin((tx * 47.9 + tz * 91.1) * 9876.5)) % 1;
    const cx = (tx + 0.25 + h2 * 0.5) * TILE, cz = (tz + 0.25 + h3 * 0.5) * TILE;
    const r = 150 + h2 * 110, hgt = 120 + h3 * 100;
    const near = nearestTrack(cx, cz);
    if (near.j >= 0 && near.d < r + 80) return;
    const m = new THREE.Mesh(MOUNT, MAT.mountain);
    m.scale.set(r, hgt, r); m.position.set(cx, tileHeight(cx, cz) - 10, cz); m.rotation.y = h1 * 6.28;
    m.userData.own = false; world.add(m);
    mountains.push({ x: cx, z: cz, r, m, key: tx + ',' + tz });
  }
  function clearMountains(x, z, key) {
    for (let i = mountains.length - 1; i >= 0; i--) {
      const mt = mountains[i];
      if ((key !== undefined && mt.key === key) || (key === undefined && Math.hypot(mt.x - x, mt.z - z) < mt.r + 80)) {
        world.remove(mt.m); mountains.splice(i, 1);
      }
    }
  }
  const roadWidthAt = d => Math.max(2, 10 - 0.5 * d / 1000);
  scene.add(world);
  let gk = 0, gh = 0, gslope = 0, gx = 0, gy = 0, gz = 0, gT = 0, gTimer = 0, segQueue = [];

  function resetTrack() {
    chunks.forEach(g => { world.remove(g); disposeChunk(g); });
    chunks.clear(); terrMap.clear(); zoneMap.clear(); grid = new Map(); bridges = []; houseCols = []; obsCols = []; widthMap.clear(); pinchMap.clear(); LAMPS = [];
    pts = []; gk = 0; gh = 0; gslope = 0; gx = 0; gz = 0; gT = 0; gTimer = 0; segQueue = [];
    ensureAround(0, 0);
    gy = roadY(0, 0, 0);
    pts.push({ x: 0, y: gy, z: 0, h: 0, b: 0 });
    grid.set('0,0', [0]);
  }
  function bridgeHeight(idx) { return bumpAt(bridges, idx, BRIDGE_H, BRIDGE_W); }
  function applyBridge(m) {
    for (let idx = Math.max(0, m - BRIDGE_W); idx < pts.length; idx++) {
      const nb = bridgeHeight(idx), p = pts[idx];
      p.y += nb - p.b; p.b = nb;
    }
  }
  function checkCross(m) {
    if (bridges.some(c => Math.abs(c - m) < 100)) return;
    const q = pts[m], cx = Math.floor(q.x / 16), cz = Math.floor(q.z / 16);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const L = grid.get((cx + dx) + ',' + (cz + dz));
      if (!L) continue;
      for (const i of L) {
        if (m - i < 80) continue;
        const o = pts[i];
        if ((o.x - q.x) ** 2 + (o.z - q.z) ** 2 < 400) { bridges.push(m); applyBridge(m); return; }
      }
    }
  }
  // Patrones: rectas cortas; las largas llevan chicane; curvas de 60° a 180° con radio de 10 a 40 m.
  // Cada patrón se simula antes de aceptarlo: ningún punto puede quedar a menos de 12 m de la pista ya trazada.
  function genPattern(out) {
    const sgn = () => (Math.random() < 0.5 ? -1 : 1);
    const seg = (k, n) => out.push({ k, n: Math.max(1, Math.floor(n)) });
    // Curva de ángulo A (grados) y radio r (m): curvatura k = 1/r, longitud n = A / (k·STEP) puntos
    const curve = (sign, A, r) => { const k = 1 / r; seg(sign * k, (A * Math.PI / 180) / (k * STEP)); };
    const randCurve = sign => { curve(sign, rnd(60, 120), rnd(10, 40)); seg(0, rnd(12, 20)); };
    const chicane = sg => { const A = rnd(60, 100), rr = rnd(15, 30); curve(sg, A, rr); seg(0, 6); curve(-sg, A, rr); seg(0, rnd(12, 20)); };
    const r = Math.random();
    if (r < 0.35) seg(0, rnd(6, 16));
    else if (r < 0.45) { seg(0, rnd(30, 45)); chicane(sgn()); }
    else if (r < 0.7) randCurve(sgn());
    else if (r < 0.85) chicane(sgn());
    else {
      let d = sgn();
      const count = Math.floor(rnd(2, 4));
      for (let j = 0; j < count; j++) { randCurve(d); if (Math.random() < 0.4) d = -d; }
    }
  }
  // Simula un recorrido desde un estado {k,h,x,z} y mide su separación respecto a la pista ya trazada.
  // c = pasos a menos de 20 m de un punto antiguo; minD = distancia mínima a la pista antigua.
  function simulate(cand, st) {
    let k = st.k, h = st.h, x = st.x, z = st.z, c = 0, minD = Infinity, mh = 0;
    const limit = pts.length - 40, R2 = 20 * 20;
    for (const sg of cand) for (let i = 0; i < sg.n; i++) {
      k += (sg.k - k) * 0.35; h += k * STEP; x += Math.sin(h) * STEP; z += Math.cos(h) * STEP;
      const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
      let dmin = Infinity;
      for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
        const L = grid.get((cx + dx) + ',' + (cz + dz));
        if (!L) continue;
        for (const j of L) {
          if (j >= limit) continue;
          const o = pts[j], d2 = (o.x - x) ** 2 + (o.z - z) ** 2;
          if (d2 < dmin) dmin = d2;
        }
      }
      if (dmin < R2) c++;
      minD = Math.min(minD, Math.sqrt(dmin));
      mh = Math.max(mh, Math.abs(h));
    }
    return { c, minD, end: { k, h, x, z }, mh };
  }
  // Planificación: genera muchos patrones posibles, descarta los que chocan con la pista y puntúa los demás
  // por su separación y por el espacio libre que dejan delante (180 m de recta de comprobación).
  function buildPattern() {
    const start = { k: gk, h: gh, x: gx, z: gz };
    const cands = [];
    for (let t = 0; t < 40; t++) { const cand = []; genPattern(cand); cands.push(cand); }
    for (const sg of [-1, 1]) { cands.push([{ k: sg / 10, n: 4 }]); cands.push([{ k: sg / 10, n: 2 }]); }
    cands.push([{ k: 0, n: 30 }]);
    let best = null, bestScore = -Infinity;
    for (const cand of cands) {
      const r = simulate(cand, start);
      let score;
      if (r.mh > 1.2) continue;   // el rumbo se sale del cono de avance
      if (r.c > 0) score = -1000 * r.c;
      else {
        const la = simulate([{ k: 0, n: 60 }], r.end);
        score = (la.c === 0 && la.mh <= 1.2 ? 500 : 0) + Math.min(la.minD, 150) + Math.min(r.minD, 60) + Math.random() * 5;
      }
      if (score > bestScore) { bestScore = score; best = cand; }
    }
    if (!best) best = [{ k: 0, n: 30 }];
    for (const sg of best) segQueue.push(sg);
  }
  function extend(n) {
    while (pts.length < n) {
      const m = pts.length;
      // Cada segmento: curvatura objetivo (rad/m) y longitud en puntos
      if (gTimer <= 0) {
        if (!segQueue.length) buildPattern();
        const sg = segQueue.shift();
        gT = sg.k; gTimer = sg.n;
      }
      gTimer--;
      gk += (gT - gk) * 0.35;
      gh += gk * STEP;
      // Rasante: suaves ondulaciones en cualquier tramo, y crestas bruscas (que hacen saltar el coche) solo en rectas
      gslope = clamp(gslope * 0.97 + (Math.random() - 0.5) * (Math.abs(gk) < 0.002 ? 0.03 : 0.006), -0.18, 0.18);
      if (Math.abs(gk) < 0.002 && Math.random() < 0.01) gslope = clamp(gslope + (Math.random() < 0.5 ? -1 : 1) * 0.16, -0.2, 0.2);
      gx += Math.sin(gh) * STEP;
      gz += Math.cos(gh) * STEP;
      ensureAround(gx, gz);
      gy = roadY(gx, gz, gh);
      const b = bridgeHeight(m);
      const p = { x: gx, y: gy + b, z: gz, h: gh, b, k: gk };
      pts.push(p);
      clearMountains(p.x, p.z);
      const key = Math.floor(p.x / 16) + ',' + Math.floor(p.z / 16);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(m);
    }
  }
  function terrFor(c) {
    if (c === 0) return 0;
    if (Math.random() < 0.12) return Math.floor(Math.random() * TERR.length);
    return terrMap.get(c - 1) ?? 0;
  }
  function zoneFor() {
    const r = Math.random();
    return r < 0.35 ? 'pueblo' : r < 0.7 ? 'bosque' : 'campo';
  }

  function buildChunk(c) {
    const list = pts.slice(c * CH, c * CH + CH + 1);
    const ROAD_W = roadWidthAt(c * CH * STEP), BAR = ROAD_W / 2 + 0.4;
    widthMap.set(c, ROAD_W);
    const t = terrFor(c), start = c < 4, zone = start ? 'pueblo' : zoneFor();
    const onBridge = list.some(p => p.b > 1);
    const wallPool = ['rail', 'wave', 'stone', 'hay', 'hay'];
    if (zone === 'pueblo') wallPool.push('houses', 'houses');
    if (zone === 'bosque') wallPool.push('forest', 'forest');
    const wall = onBridge ? pick(['rail', 'wave', 'stone'])
      : start ? 'houses' : (Math.random() < 0.2 ? 'tyre' : pick(wallPool));
    const highC = list.reduce((acc, p) => acc + p.y, 0) / list.length > 52;
    terrMap.set(c, highC ? 2 : (t === 2 ? 0 : t)); zoneMap.set(c, zone);
    const snowC = list.reduce((acc, p) => acc + p.y, 0) / list.length > 52;   // nieve solo en cotas altas
    const g = new THREE.Group();
    const add = (geo, m, own = true) => { const mesh = new THREE.Mesh(geo, m); mesh.userData.own = own; g.add(mesh); };

    const avgY = list.reduce((acc, p) => acc + p.y, 0) / list.length, rt = snowC ? 2 : (t === 2 ? 0 : t);
    add(ribbon(list, -ROAD_W / 2, 0, ROAD_W / 2, 0), pick(TM[rt].road));
    // Dos marcas de rodada de 0,5 m de ancho, a 2 m entre sí (±1 m del eje); opacidad 0 % – 15 % – 0 %
    for (const sg of [-1, 1]) add(gradStrip(list, sg * 1.0, 0.25, 0.03), SHADE_MAT);
    // Suelo de 2 m más allá de las barreras (las barreras no se mueven: el suelo empieza en su base)
    for (const sg of [-1, 1]) add(ribbon(list, sg * ROAD_W / 2, 0, sg * (ROAD_W / 2 + 5), 0), pick(TM[rt].road));
    if (t === 0 && !snowC) add(dashes(list), MAT.line);
    // Marcas de neumáticos por tramos, en los dos carriles
    for (const lane of [-ROAD_W * 0.25, ROAD_W * 0.25]) if (Math.random() < 0.5)
      add(ribbon(list, lane - 0.6, 0.035, lane + 0.6, 0.035, i => ((i >> 3) & 1) === 0), snowC ? MAT.tireMarkSnow : pick(MAT.tireMark));
    // Baches y charcos
    for (let i = 0; i < CH; i += 2) if (!snowC && Math.random() < 0.08) {
      const q = ptAt(list[i], rnd(-3.2, 3.2)), m = new THREE.Mesh(CIRCLE, MAT.pothole);
      m.rotation.x = -Math.PI / 2; m.scale.setScalar(rnd(0.5, 1.2));
      m.position.set(q.x, list[i].y + 0.02, q.z); m.userData.own = false; g.add(m);
    }
    if (!snowC && Math.random() < 0.3) {
      const i = Math.floor(rnd(0, CH)), q = ptAt(list[i], rnd(-3, 3)), m = new THREE.Mesh(CIRCLE, MAT.puddle);
      m.rotation.x = -Math.PI / 2; m.scale.set(rnd(1.5, 3), rnd(1.2, 2.5), 1);
      m.position.set(q.x, list[i].y + 0.04, q.z); m.userData.own = false; g.add(m);
    }
    // Contexto de decoración: 6 variantes de árbol por tramo (menos llamadas de dibujo)
    const vs = Array.from({ length: 6 }, () => Math.floor(Math.random() * LP.length));
    const ctx = { c, snowC, zone, BAR, spots: [[], []], trees: new Map(), bushes: [], rocks: [], V: () => vs[Math.floor(Math.random() * vs.length)] };
    for (const sgn of [-1, 1]) wallOf(wall, list, sgn, g, BAR, ctx);

    // Banderines: solo en el 10 % de los tramos con casas a ambos lados
    if (ctx.spots[0].length && ctx.spots[1].length && (start || Math.random() < 0.1)) bunting(ctx, g);
    // Pilares de puentes (cima oculta bajo la carretera)
    for (let i = 0; i < list.length; i += 3) {
      const p = list[i];
      if (p.b > 1) for (const side of [-4, 4]) {
        const q = ptAt(p, side), m = new THREE.Mesh(PILLAR, MAT.pillar);
        const bottom = groundY(p, side), top = p.y - 0.4;
        m.scale.set(1, top - bottom, 1);
        m.position.set(q.x, (top + bottom) / 2, q.z);
        m.userData.own = false; g.add(m);
      }
    }
    g.traverse(m => { if (m.isMesh) { m.castShadow = !m.userData.bb; m.receiveShadow = true; } });
    // Obstáculos ocasionales sobre la calzada, siempre a un cuarto de la pista
    if (Math.random() < 0.0625) {
      if (Math.random() < 0.5) {
        const oi = Math.floor(rnd(2, CH - 2));
        addObstacle(g, list[oi], pick([-1, 1]) * ROAD_W / 4, c, c * CH + oi);
      } else addPinch(g, list, c, BAR);
    }
    // Entorno: bosque denso, arbustos, rocas de campo, personas y alguna casa suelta
    {
      const dens = zone === 'bosque' ? 3.2 : zone === 'pueblo' ? 1.4 : 2;
      const dm = new THREE.Object3D();
      const emit = (map, geos, mat) => {
        for (const [v, arr] of map) {
          const im = new THREE.InstancedMesh(geos[v], mat, arr.length);
          arr.forEach((e, j) => { dm.position.set(e.x, e.y, e.z); dm.rotation.set(0, e.ry, 0); dm.scale.setScalar(e.sc); dm.updateMatrix(); im.setMatrixAt(j, dm.matrix); });
          im.instanceMatrix.needsUpdate = true;
          im.userData.own = false; g.add(im);
        }
      };
      const emitList = (arr, geo, mat) => {
        if (!arr.length) return;
        const im = new THREE.InstancedMesh(geo, mat, arr.length);
        arr.forEach((e, j) => {
          dm.position.set(e.x, e.y, e.z); dm.rotation.set(0, e.ry, 0); dm.scale.setScalar(e.sc); dm.updateMatrix(); im.setMatrixAt(j, dm.matrix);
          if (e.col) im.setColorAt(j, e.col);
        });
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.userData.own = false; g.add(im);
      };
      for (let i = 0; i < list.length - 1; i++) for (const side of [-1, 1]) {
        const p = list[i];
        let n = Math.floor(dens); if (Math.random() < dens - n) n++;
        for (let k = 0; k < n; k++) {
          const a = side * (BAR + 2 + Math.pow(Math.random(), 1.5) * 40), q = ptAt(p, a);
          if (nearestTrack(q.x, q.z).d > BAR + 1.5) putIn(ctx.trees, ctx.V(), { x: q.x, y: groundY(p, a), z: q.z, ry: rnd(0, 6.28), sc: rnd(1.0, 1.6) });
        }
        if (Math.random() < 0.8) {
          const a = side * (BAR + 1.2 + rnd(0, 8)), q = ptAt(p, a);
          if (nearestTrack(q.x, q.z).d > BAR + 0.8) ctx.bushes.push({ x: q.x, y: groundY(p, a), z: q.z, ry: rnd(0, 6.28), sc: rnd(0.6, 1.3), col: ctx.snowC ? SNOW_COL : BUSH_COLS[Math.floor(Math.random() * BUSH_COLS.length)] });
        }
        if (zone === 'campo' && Math.random() < 0.05) {
          const a = side * (BAR + 4 + rnd(0, 25)), q = ptAt(p, a);
          if (nearestTrack(q.x, q.z).d > BAR + 3) ctx.rocks.push({ x: q.x, y: groundY(p, a), z: q.z, ry: rnd(0, 6.28), sc: rnd(0.4, 1.4) });
        }
      }
      emit(ctx.trees, ctx.snowC ? LP_SNOW : LP, LP_MAT);
      emitList(ctx.bushes, BUSH_G, BUSH_MAT);
      emitList(ctx.rocks, ROCK_G, ctx.snowC ? MAT.snow : pick(MAT.rock));
      if (zone === 'pueblo' && Math.random() < 0.5) {
        const p = list[Math.floor(rnd(0, list.length - 1))], a = pick([-1, 1]) * (BAR + 12 + rnd(0, 10)), q = ptAt(p, a);
        if (nearestTrack(q.x, q.z).d > 15) addHouse(g, q.x, groundY(p, a), q.z, p.h, c, snowC);
      }
    }
    decorLandscape(list, c, g, BAR, zone, snowC, houseCols.some(h => h.c === c));
    world.add(g);
    chunks.set(c, g);
  }
  function disposeChunk(g) {
    g.traverse(m => { if (m.isMesh && m.userData.own) m.geometry.dispose(); });
  }
  function updateTrack(p) {
    cullTiles(p);
    const c0 = Math.floor(p / CH);
    extend(Math.floor(p) + CH * 25);
    for (let c = c0; c <= c0 + 3; c++) {
      if (!chunks.has(c) && pts.length > (c + 1) * CH + 1) buildChunk(c);
    }
    for (const [c, g] of chunks) {
      if (c < c0 - 2) { world.remove(g); disposeChunk(g); chunks.delete(c); houseCols = houseCols.filter(h => h.c !== c); obsCols = obsCols.filter(o => o.c !== c); LAMPS = LAMPS.filter(l => l.c !== c); }
    }
  }
  function sample(p) {
    if (pts.length < 2) return { x: 0, y: 0, z: 0, h: 0, k: 0 };
    const i = clamp(Math.floor(p), 0, pts.length - 2), f = p - i, a = pts[i], b = pts[i + 1];
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f, h: a.h + (b.h - a.h) * f, k: (b.h - a.h) / STEP };
  }
  function terrAt(p) { return TERR[terrMap.get(Math.floor(p / CH)) ?? 0]; }

  // ---------- Sonido ----------
  const SND = { raw: {}, buf: {} };
  const ICONS = Object.assign({}, FB_ICONS);
  (function loadExternal() {
    const so = M.sounds || {}, list = { engine: so.engine, shift: so.shift };
    Object.entries(so.terrain || {}).forEach(([k, u]) => { list['t:' + k] = one(u); });
    for (const [k, u0] of Object.entries(list)) { const u = one(u0); if (u) {
      fetch(u).then(r => (r.ok ? r.arrayBuffer() : null)).then(b => { if (b) SND.raw[k] = b; }).catch(() => {});
    } }
    Object.keys(FB_ICONS).forEach(k => {
      const u = one(M.arrows && M.arrows[k]);
      if (u) fetch(u).then(r => (r.ok ? r.text() : null)).then(t => {
        if (t) { ICONS[k] = t; document.querySelectorAll('.ico').forEach(e => { e.dataset.k = ''; }); }
      }).catch(() => {});
    });
  })();
  function decodePending(ac) {
    for (const k of Object.keys(SND.raw)) {
      const ab = SND.raw[k]; delete SND.raw[k];
      ac.decodeAudioData(ab).then(d => { SND.buf[k] = d; }).catch(() => {});
    }
  }
  function loopNode(ac, buf) {
    const src = ac.createBufferSource(), g = ac.createGain();
    src.buffer = buf; src.loop = true; g.gain.value = 0;
    src.connect(g); g.connect(ac.destination); src.start();
    return { src, g };
  }
  let audioCtx = null, crashBuf = null, eng = null;
  // El AudioContext solo se crea tras un gesto del usuario (el navegador lo exige)
  let gestured = false;
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, () => { gestured = true; audio(); }, { once: true, passive: true }));
  function audio() {
    if (!audioCtx && gestured) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (audioCtx && !eng) initSound(audioCtx);
    if (audioCtx && crashRaw) { const b = crashRaw; crashRaw = null; audioCtx.decodeAudioData(b).then(d => { crashBuf = d; }).catch(() => {}); }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  // El archivo de choque se descarga al arrancar, pero se decodifica solo cuando existe el AudioContext (tras un gesto)
  let crashRaw = null;
  if (one(M.sounds && M.sounds.crash)) {
    fetch(one(M.sounds.crash)).then(r => (r.ok ? r.arrayBuffer() : null)).then(b => { crashRaw = b; }).catch(() => {});
  }
  // k: intensidad 0..1. Usa el archivo de assets/sounds si existe; si no, ruido sintetizado
  // Motor: sierra + cuadrada filtradas; cambios de marcha con un chasquido; ruido de terreno según superficie
  function initSound(ac) {
    const nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const tn = ac.createBufferSource(); tn.buffer = nb; tn.loop = true;
    const tf = ac.createBiquadFilter(); tf.type = 'bandpass'; tf.Q.value = 0.8; tf.frequency.value = 400;
    const tg = ac.createGain(); tg.gain.value = 0;
    tn.connect(tf); tf.connect(tg); tg.connect(ac.destination); tn.start();
    const o1 = ac.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 40;
    const o2 = ac.createOscillator(); o2.type = 'square'; o2.frequency.value = 20;
    const ef = ac.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 600; ef.Q.value = 2;
    const eg = ac.createGain(); eg.gain.value = 0;
    o1.connect(ef); o2.connect(ef); ef.connect(eg); eg.connect(ac.destination);
    o1.start(); o2.start();
    eng = { nb, tf, tg, o1, o2, ef, eg, gear: 0, loop: null, tl: {} };
  }
  function playShift() {
    const ac = audioCtx; if (!ac || !eng) return;
    if (SND.buf.shift) {
      const src = ac.createBufferSource(), g = ac.createGain();
      src.buffer = SND.buf.shift; g.gain.value = 0.6;
      src.connect(g); g.connect(ac.destination); src.start();
      return;
    }
    const src = ac.createBufferSource(), bp = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = eng.nb; bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 1.5;
    g.gain.setValueAtTime(0.25, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12);
    src.connect(bp); bp.connect(g); g.connect(ac.destination);
    src.start(ac.currentTime, rnd(0, 1), 0.12);
  }
  const TSND = {
    Asfalto: { f: 300, q: 0.5, g: 0.03 },
    Grava: { f: 1100, q: 0.9, g: 0.22 },
    Nieve: { f: 450, q: 0.4, g: 0.07 },
    Barro: { f: 160, q: 1.4, g: 0.2 }
  };
  function updateSound() {
    const ac = audioCtx; if (!ac || !eng) return;
    if (Object.keys(SND.raw).length) decodePending(ac);
    const on = S.state === 'playing', t = ac.currentTime, v = Math.abs(S.speed);
    const gas = on && readInput().gas;
    const gear = Math.min(5, Math.floor(v / 14) + 1);
    if (on && eng.gear && gear !== eng.gear) playShift();
    eng.gear = on ? gear : 0;
    const rpmN = clamp((v - (gear - 1) * 14) / 14, 0, 1);
    const T = terrAt(S.p);
    // Motor: archivo en bucle (si existe) o síntesis
    const hasEng = !!SND.buf.engine;
    if (hasEng && !eng.loop) eng.loop = loopNode(ac, SND.buf.engine);
    if (hasEng) {
      eng.loop.src.playbackRate.setTargetAtTime(0.5 + rpmN * 1.3 + (gas ? 0.1 : 0), t, 0.1);
      eng.loop.g.gain.setTargetAtTime(on ? 0.35 + 0.25 * (gas ? 1 : 0.4) : 0, t, 0.1);
    }
    const f = (900 + rpmN * 4200) / 30;
    eng.o1.frequency.setTargetAtTime(f, t, 0.05);
    eng.o2.frequency.setTargetAtTime(f / 2, t, 0.05);
    eng.ef.frequency.setTargetAtTime(400 + rpmN * 1400 + (gas ? 300 : 0), t, 0.1);
    eng.eg.gain.setTargetAtTime(on && !hasEng ? 0.04 + 0.1 * (gas ? 1 : 0.4) + 0.04 * rpmN : 0, t, 0.1);
    // Terreno: archivo en bucle por superficie (si existe) o ruido sintetizado
    for (const k of Object.keys(SND.buf)) if (k.startsWith('t:')) {
      const name = k.slice(2);
      if (!eng.tl[name]) eng.tl[name] = loopNode(ac, SND.buf[k]);
      const L = eng.tl[name];
      L.src.playbackRate.setTargetAtTime(0.8 + 0.5 * clamp(v / 40, 0, 1), t, 0.2);
      L.g.gain.setTargetAtTime(on && name === T.name ? 0.7 * clamp(v / 30, 0, 1) : 0, t, 0.2);
    }
    const synthT = !SND.buf['t:' + T.name];
    const P = TSND[T.name] || TSND.Asfalto;
    eng.tf.frequency.setTargetAtTime(P.f * (0.7 + 0.3 * clamp(v / 40, 0, 1)), t, 0.2);
    eng.tf.Q.setTargetAtTime(P.q, t, 0.2);
    eng.tg.gain.setTargetAtTime(on && synthT ? P.g * clamp(v / 30, 0, 1) : 0, t, 0.2);
  }
  function playCrash(k) {
    const ac = audio(); if (!ac) return;
    const g = ac.createGain();
    g.gain.value = 0.3 + 0.6 * k;
    g.connect(ac.destination);
    if (crashBuf) {
      const src = ac.createBufferSource(); src.buffer = crashBuf; src.connect(g); src.start(); return;
    }
    const len = Math.floor(ac.sampleRate * 0.6), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = ac.createBufferSource(); src.buffer = buf;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900 + 1400 * k;
    src.connect(lp); lp.connect(g); src.start();
  }

  // ---------- Estado e input ----------
  const S = { mode: 'keys', state: 'menu', p: 0, speed: 0, lat: 0, rel: 0, lv: 0, steer: 0, time: 60, nextCP: 500, dist: 0, best: load(), demoT: 0, terr: -1, cd: 0, hp: 100 };
  const keys = {}, touch = { L: 0, R: 0, B: 0, G: 0 }, gyro = { steer: 0, base: null, land: null };
  const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'Space'];
  const HINT = {
    keys: 'Flechas o WASD para conducir. Espacio o ↓ para frenar. Esc: menú.',
    gyro: 'Inclina el móvil para girar. ▲ acelera a la derecha y ■ frena a la izquierda.',
    touch: 'Acelerador automático. ◀ ▶ para girar y FRENO en el centro.'
  };
  function load() { try { return +localStorage.getItem('endless_stage_best') || 0; } catch (e) { return 0; } }
  function saveBest() { try { localStorage.setItem('endless_stage_best', String(S.best)); } catch (e) {} }
  function loadSens() { try { return +localStorage.getItem('endless_stage_sens') || 1; } catch (e) { return 1; } }
  function setSens(v) {
    S.sens = clamp(v, 0.5, 2);
    try { localStorage.setItem('endless_stage_sens', String(S.sens)); } catch (e) {}
    document.querySelectorAll('.sensInput').forEach(i => { i.value = S.sens; });
  }
  document.querySelectorAll('.sensInput').forEach(i => i.addEventListener('input', () => setSens(+i.value)));

  let topView = false, godMode = DEBUG;
  const carBox = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4), new THREE.MeshBasicMaterial({ color: 0xff3030 }));
  carBox.visible = false; scene.add(carBox);
  const fogObj = scene.fog;
  addEventListener('keydown', e => {
    if (DEBUG && e.code === 'KeyV') topView = !topView;
    if (DEBUG && e.code === 'KeyG') godMode = !godMode;
    if (KEYS.includes(e.code)) e.preventDefault();
    keys[e.code] = true;
    if (e.code === 'Enter' && S.state === 'menu') start();
    if (e.code === 'Escape') togglePause();
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  const gyroStatus = { seen: false };
  // iOS exige permiso explícito, que debe pedirse dentro de un gesto del usuario (clic)
  function requestGyro() {
    gyroStatus.seen = false;
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      DOE.requestPermission()
        .then(r => { if (r !== 'granted') flash('Permiso de sensores denegado: usa otro control.'); })
        .catch(() => flash('No se pudo acceder al giroscopio.'));
    }
  }
  addEventListener('deviceorientation', e => {
    if (S.mode !== 'gyro' || e.gamma == null) return;
    gyroStatus.seen = true;
    const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    const landscape = Math.abs(angle) === 90;
    const raw = landscape ? (angle === 90 ? (e.beta || 0) : -(e.beta || 0)) : (e.gamma || 0);
    if (gyro.land !== landscape) { gyro.land = landscape; gyro.base = null; }
    if (gyro.base === null) gyro.base = raw;   // calibración: la posición al empezar es el centro
    gyro.steer = clamp((raw - gyro.base) / 25, -1, 1);
  });
  addEventListener('contextmenu', e => e.preventDefault());

  function readInput() {
    if (S.mode === 'keys') {
      const steer = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
      return { steer, gas: keys.ArrowUp || keys.KeyW ? 1 : 0, brake: keys.ArrowDown || keys.KeyS || keys.Space ? 1 : 0 };
    }
    if (S.mode === 'touch') return { steer: touch.R - touch.L, gas: 1, brake: touch.B };
    return { steer: gyro.steer, gas: touch.G, brake: touch.B };
  }
  function setMode(m) {
    S.mode = m;
    if (m === 'gyro') requestGyro();
    document.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('on', x.dataset.m === m));
    $('hint').textContent = HINT[m];
    $('touch').dataset.m = m;
    sync();
  }
  document.querySelectorAll('[data-m]').forEach(b => b.onclick = () => setMode(b.dataset.m));
  document.querySelectorAll('.zone').forEach(b => {
    const c = b.dataset.c;
    const set = v => { touch[c] = v; b.classList.toggle('on', !!v); };
    b.addEventListener('pointerdown', e => { e.preventDefault(); set(1); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => b.addEventListener(ev, () => set(0)));
  });

  // ---------- Flujo de juego ----------
  function sync() {
    const st = S.state;
    $('bestMenu').textContent = 'Récord: ' + (S.best / 1000).toFixed(2) + ' km';
    const inMenu = st === 'menu';
    $('c').style.display = inMenu ? 'none' : 'block';
    const menuEl = $('menu');
    menuEl.style.backgroundImage = inMenu ? `linear-gradient(rgba(5,8,20,.45),rgba(5,8,20,.6)), url("${M.menuImage || 'assets/menu.png'}")` : '';
    menuEl.style.backgroundSize = 'cover';
    menuEl.style.backgroundPosition = 'center';
    $('menu').classList.toggle('hidden', st !== 'menu');
    $('hud').classList.toggle('hidden', st === 'menu');
    $('over').classList.toggle('hidden', st !== 'over');
    $('pause').classList.toggle('hidden', st !== 'paused');
    $('touch').classList.toggle('hidden', st !== 'playing' || S.mode === 'keys');
  }
  function start() {
    $('restartMenu').classList.remove('hidden');
    audio();
    if (S.mode === 'gyro') {
      requestGyro();
      gyro.base = null; gyro.steer = 0;
      setTimeout(() => { if (!gyroStatus.seen) flash('Sin datos del giroscopio: prueba el control táctil'); }, 2000);
    }
    try { document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {}); } catch (e) {}
    try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch (e) {}
    resetTrack();
    Object.assign(S, { p: 0, speed: 0, lat: 0, rel: 0, lv: 0, steer: 0, time: 60, nextCP: 500, dist: 0, state: 'playing', terr: -1, cd: 0, hp: 100, cam: null, prevBest: S.best, beat: false, air: false, vy: 0, ry: undefined, rv: undefined });
    updateTrack(0);
    sync();
  }
  function end() {
    S.state = 'over';
    if (S.dist > S.best) { S.best = S.dist; saveBest(); }
    $('ovDist').textContent = (S.dist / 1000).toFixed(2) + ' km';
    $('ovInfo').textContent = 'Récord personal: ' + (S.best / 1000).toFixed(2) + ' km';
    sync();
  }
  function togglePause() {
    if (S.state === 'playing') { S.state = 'paused'; sync(); }
    else if (S.state === 'paused') { S.state = 'playing'; sync(); }
  }
  function goMenu() {
    S.state = 'menu';
    $('restartMenu').classList.add('hidden');
    resetTrack();
    updateTrack(0);
    Object.assign(S, { p: 0, speed: 0, lat: 0, rel: 0, lv: 0, steer: 0, dist: 0, terr: -1, cam: null, air: false, vy: 0, ry: undefined, rv: undefined });
    sync();
  }
  let toastT = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.add('hidden'), 2500);
  }
  function flash(msg) {
    const f = $('flash'); f.textContent = msg; f.style.opacity = 1;
    setTimeout(() => f.style.opacity = 0, 1100);
  }
  $('go').onclick = start;
  $('retry').onclick = start;
  $('restartMenu').onclick = start;
  $('restartPause').onclick = start;
  $('menuBtn').onclick = goMenu;
  $('quit').onclick = goMenu;
  $('resume').onclick = togglePause;
  $('pauseBtn').onclick = togglePause;

  // ---------- Física ----------
  // Saltos: si el suelo cae bruscamente bajo un coche rápido, el coche despega y aterriza con daño
  function airPhysics(dt) {
    const c = sample(S.p), ry = c.y;
    const rv = dt > 0 ? (ry - (S.ry ?? ry)) / dt : 0;
    const ra = dt > 0 ? (rv - (S.rv ?? rv)) / dt : 0;
    S.ry = ry; S.rv = rv;
    if (!S.air) {
      if (ra < -15 && S.speed > 12) { S.air = true; S.vy = rv; }
      S.ay = ry;
    } else {
      S.vy -= 9.8 * dt; S.ay += S.vy * dt;
      if (S.ay <= ry) {
        if (S.vy < -10) S.hp = Math.max(0, S.hp - (-S.vy) * 0.8);
        S.air = false; S.ay = ry; S.vy = 0;
      }
    }
  }
  function physics(dt, inp) {
    const T = terrAt(S.p);
    S.terr = TERR.indexOf(T);
    S.rough = ({ Grava: 0.05, Barro: 0.08 })[T.name] || 0;

    const vmax = T.max * (0.3 + 0.7 * S.hp / 100);
    S.speed += inp.gas * 24 * T.acc * Math.max(0, 1 - S.speed / vmax) * dt;
    if (inp.brake) {
      if (S.speed > 0.5) S.speed -= 32 * dt;
      else S.speed = Math.max(-15, S.speed - 8 * dt);
    }
    S.speed -= S.speed * 0.04 * dt;
    if (S.speed > vmax) S.speed -= (S.speed - vmax) * Math.min(1, dt * 1.5);
    S.speed = clamp(S.speed, -15, 80);

    const c = sample(S.p);
    S.steer += (inp.steer - S.steer) * Math.min(1, dt * 7);
    // Frenar girando pierde agarre: el coche derrapa (más con más velocidad)
    const gr0 = 1 - (1 - T.grip) * clamp(S.speed / 35, 0, 1);
    const skid = inp.brake * Math.abs(S.steer) * clamp(S.speed / 20, 0, 1);
    const gr = gr0 * (1 - 0.6 * skid);
    const turn = S.steer * 2.2 * S.sens * gr * Math.min(1, S.speed / 12) + S.steer * skid * 1.2;
    S.rel += (turn + c.k * S.speed - S.rel * 0.12 * gr) * dt;
    S.rel = clamp(S.rel, -1.5, 1.5);
    S.lat += S.speed * Math.sin(S.rel) * dt;
    const vx = S.speed * Math.cos(S.rel) * dt;

    const RW = widthMap.get(Math.floor(S.p / CH)) ?? 10;
    const LIM0 = Math.max(0.2, RW / 2 - 0.6);
    const pk = pinchMap.get(Math.floor(S.p));
    const LIM = pk && Math.sign(S.lat) === pk.s ? Math.max(0.2, LIM0 - pk.v) : LIM0;
    if (Math.abs(S.lat) > LIM) {
      const hit = Math.sign(S.rel) === Math.sign(S.lat) && Math.abs(S.rel) > 0.1;
      const impact = hit ? Math.abs(S.speed) * (0.2 + 0.8 * Math.abs(Math.sin(S.rel))) : 0;
      if (impact > 4 && S.cd <= 0) { S.hp = Math.max(0, S.hp - impact * 0.6); S.cd = 0.8; playCrash(clamp(impact / 40, 0.2, 1)); hitFlash(Math.sign(S.lat) || 1); }
      if (impact > 30 && Math.abs(S.lat) < 20) {
        S.speed *= 0.6; // rompe la barrera: el coche sale a la hierba
      } else {
        S.lat = Math.sign(S.lat) * LIM;
        if (hit) { S.speed *= 0.85; S.rel *= 0.3; S.lv = 0; }
      }
    }
    if (Math.abs(S.lat) > RW / 2 + 0.5) S.speed *= 1 - 0.5 * dt;
    S.cd = Math.max(0, S.cd - dt);
    S.p = Math.max(0, S.p + vx / STEP);
    if (S.p === 0 && vx < 0) S.speed = 0;
    S.dist = S.p * STEP;
    airPhysics(dt);

    if (S.state === 'playing' && S.hp <= 0) end();
  }

  function houseCollide() {
    const c = sample(S.p), rx = -Math.cos(c.h), rz = Math.sin(c.h);
    const cx = c.x + rx * S.lat, cz = c.z + rz * S.lat;
    for (const o of obsCols) {
      if (o.warnOnly) continue;
      if (Math.hypot(cx - o.x, cz - o.z) < o.r + 1) {
        const impact = Math.abs(S.speed) * 0.8;
        if (S.cd <= 0 && impact > 4) { S.hp = Math.max(0, S.hp - impact * 0.6); S.cd = 0.8; playCrash(clamp(impact / 40, 0.2, 1)); hitFlash(Math.sign((cx - o.x) * rx + (cz - o.z) * rz) || 1); }
        S.speed *= 0.2; S.p -= 0.5;
        return;
      }
    }
    for (const h of houseCols) {
      const dx = cx - h.x, dz = cz - h.z, cs = Math.cos(h.yaw), sn = Math.sin(h.yaw);
      const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
      if (Math.abs(lx) < h.hw + 1 && Math.abs(lz) < h.hd + 1.5) {
        const impact = Math.abs(S.speed) * 0.7;
        if (S.cd <= 0 && impact > 4) { S.hp = Math.max(0, S.hp - impact * 0.6); S.cd = 0.8; playCrash(clamp(impact / 40, 0.2, 1)); hitFlash(Math.sign(dx * rx + dz * rz) || 1); }
        S.speed *= -0.25;
        S.p -= 0.5;
        return;
      }
    }
  }

  // Elementos de aviso por delante: curvas (con sentido y severidad) y peligros (obstáculos), ordenados por distancia.
  // La curvatura se mide por punto (rad por tramo de 3 m) suavizada en 3 puntos.
  function findItems(maxDist) {
    const n = Math.floor(maxDist / STEP), base = Math.floor(S.p);
    const from = Math.max(1, base - 120), last = Math.min(pts.length - 2, base + n);
    const kAt = i => pts[i].k || 0;
    const TH = 0.0025, items = [];
    let st = -1, dir = 0, quiet = 0, maxK = 0, sum = 0;
    const close = () => {
      if (Math.abs(sum) > 1.0) items.push({ kind: 'curve', start: st, ang: sum, maxK });   // ang > 0 = izquierda
      st = -1; dir = 0; quiet = 0; maxK = 0; sum = 0;
    };
    for (let i = from; i <= last; i++) {
      const k = (kAt(i - 1) + kAt(i) + kAt(i + 1)) / 3;
      if (Math.abs(k) > TH) {
        const d = Math.sign(k);
        if (st >= 0 && d !== dir) close();
        if (st < 0) { st = i; dir = d; }
        quiet = 0; maxK = Math.max(maxK, Math.abs(k)); sum += kAt(i) * STEP;
      } else if (st >= 0 && ++quiet >= 3) close();
    }
    if (st >= 0) close();
    for (const o of obsCols) if (!o.quiet && o.i > S.p && o.i - S.p <= n) items.push({ kind: 'obs', start: o.i });
    return items.sort((x, y) => x.start - y.start);
  }
  let turnTick = 0;
  function updateTurn() {
    if (turnTick++ % 6) return;
    const items = findItems(1200).filter(it => it.start > S.p);
    const panel = $('turns'), t1 = $('t1'), t2 = $('t2');
    const dTxt = it => {
      const d = Math.max(0, (it.start - S.p) * STEP);
      return d < 1000 ? Math.round(d / 10) * 10 + 'm' : (d / 1000).toFixed(1) + 'km';
    };
    const color = it => it.kind === 'obs' ? '#ffd166'
      : Math.abs(it.ang) < 1.57 ? '#7dff9b' : Math.abs(it.ang) < 2.36 ? '#ffd166' : '#ff5a5a';
    const show = (el, it) => {
      const key = it.kind === 'obs' ? 'obstacle' : it.ang > 0 ? 'left' : 'right';
      const ico = el.querySelector('.ico');
      if (ico.dataset.k !== key) { ico.dataset.k = key; ico.innerHTML = ICONS[key]; }
      el.querySelector('.dtxt').textContent = dTxt(it);
      el.style.color = color(it);
    };
    panel.classList.toggle('hidden', items.length === 0);
    if (items.length) show(t1, items[0]);
    t2.classList.toggle('hidden', items.length < 2);
    if (items.length > 1) show(t2, items[1]);
  }

  // ---------- Nubes ----------
  const cloudMats = [0, 1, 2].map(() => {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
    const x = cv.getContext('2d');
    for (let i = 0; i < 9; i++) {
      const cx = rnd(60, 196), cy = rnd(50, 90), r = rnd(28, 52);
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
    }
    return new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false });
  });
  const clouds = [];
  for (let i = 0; i < 18; i++) {
    const sp = new THREE.Sprite(pick(cloudMats));
    sp.userData.s = -1e9; scene.add(sp); clouds.push(sp);
  }
  function placeClouds() {
    for (const c of clouds) {
      const u = c.userData;
      if (u.s < S.dist - 400 || u.s > S.dist + 1300) {
        u.s = S.dist + rnd(300, 1100); u.lat = rnd(-300, 300); u.h = rnd(130, 180); u.sz = rnd(150, 260);
      }
      const q = sample(u.s / STEP), w = ptAt(q, u.lat);
      c.position.set(w.x, q.y + u.h, w.z);
      c.scale.set(u.sz, u.sz * 0.5, 1);
    }
  }

  // ---------- Modo noche y pestañas ----------
  function loadNight() { try { return localStorage.getItem('endless_stage_night') === '1'; } catch (e) { return false; } }
  function setNight(on) {
    document.body.classList.toggle('night', on);
    scene.background.set(on ? 0x0b1222 : SKY);
    if (fogObj) fogObj.color.set(on ? 0x0b1222 : SKY);
    hemi.intensity = on ? 0.5 * 0.05 : 0.5;
    sun.intensity = on ? 0 : 1.5;
    headL.intensity = on ? 18 : 0;
    headP.intensity = on ? 1.5 : 0;
    cloudMats.forEach(mt => mt.color.set(on ? 0x5a6a80 : 0xffffff));
    document.querySelectorAll('.nightSeg [data-night]').forEach(b => b.classList.toggle('on', (b.dataset.night === '1') === on));
    try { localStorage.setItem('endless_stage_night', on ? '1' : '0'); } catch (e) {}
  }
  document.querySelectorAll('.nightSeg [data-night]').forEach(b => b.addEventListener('click', () => setNight(b.dataset.night === '1')));
  document.querySelectorAll('.tab').forEach(b => b.onclick = () => {
    const card = b.closest('.card');
    card.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === b));
    card.querySelectorAll('.pane').forEach(pn => pn.classList.toggle('hidden', pn.dataset.pane !== b.dataset.tab));
  });

  const ENVC = { Asfalto: 0x8fd3ff, Grava: 0xd9c49a, Nieve: 0xdfeaf5, Barro: 0xb9a48a };
  const envCol = new THREE.Color(0x8fd3ff), envTo = new THREE.Color();

  // ---------- Bucle ----------
  resetTrack();
  updateTrack(0);
  setSens(loadSens());
  setNight(loadNight());
  setMode((matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0) ? 'touch' : 'keys');
  sync();
  {
    const mi = M.menuImage || 'assets/menu.png', probe = new Image();
    probe.onerror = () => notice('Imagen de menú no encontrada: ' + mi);
    probe.src = mi;
  }
  let last = performance.now();
  function frame(now) {
    if (S.state === 'over' || S.state === 'paused') { updateSound(); last = now; requestAnimationFrame(frame); return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (S.state === 'menu') {
      S.demoT += dt;
      physics(dt, { steer: Math.sin(S.demoT * 0.6) * 0.35, gas: 1, brake: 0 });
    } else if (S.state === 'playing') {
      physics(dt, readInput());
    } else if (S.state === 'over') {
      physics(dt, { steer: 0, gas: 0, brake: 1 });
    }

    updateSound();
    if (S.state === 'playing') houseCollide();
    updateTrack(S.p);
    placeClouds();

    // Cámara en primera persona a 1.4 m del suelo
    const c = sample(S.p);
    const rx = -Math.cos(c.h), rz = Math.sin(c.h);
    const ex = c.x + rx * S.lat, ey = (S.ay ?? c.y) + 1.4, ez = c.z + rz * S.lat;
    const yaw = c.h - S.rel;
    if (!S.cam) S.cam = { x: ex, y: ey, z: ez, yaw };
    const kp = 1 - Math.exp(-dt * 18), ky = 1 - Math.exp(-dt * 10);
    S.cam.x += (ex - S.cam.x) * kp; S.cam.y += (ey - S.cam.y) * kp; S.cam.z += (ez - S.cam.z) * kp;
    S.cam.yaw += (yaw - S.cam.yaw) * ky;
    const vib = S.rough * S.speed / 20 * 0.04;
    cam.position.set(S.cam.x + rnd(-vib, vib) * 0.3, S.cam.y + rnd(-vib, vib) * 0.3, S.cam.z + rnd(-vib, vib) * 0.3);
    cam.lookAt(S.cam.x + Math.sin(S.cam.yaw) * 30, S.cam.y - 0.3 + rnd(-vib, vib) * 30, S.cam.z + Math.cos(S.cam.yaw) * 30);
    cam.fov = 68 + S.speed * 0.15;
    cam.updateProjectionMatrix();

    if (S.state !== 'menu') {
      $('spd').textContent = Math.round(S.speed * 3.6);
      $('spd').nextElementSibling.textContent = S.speed < -0.5 ? 'km/h · R' : 'km/h';
      $('dst').textContent = (S.dist / 1000).toFixed(2);
      $('bestHud').textContent = (S.best / 1000).toFixed(2);
      if (S.state === 'playing' && !S.beat && S.prevBest > 0 && S.dist > S.prevBest) {
        S.beat = true;
        toast('¡Nuevo récord! ' + (S.dist / 1000).toFixed(2) + ' km');
      }
      if (S.dist > S.best) {
        S.best = S.dist;
        if (Math.floor(S.dist / 500) !== S.lastSave) { S.lastSave = Math.floor(S.dist / 500); saveBest(); }
      }
      $('hpBar').style.width = S.hp + '%';
      updateTurn();
    }
    updateLampLights();
    if (!document.body.classList.contains('night')) {
      envTo.set(ENVC[terrAt(S.p).name]);
      envCol.lerp(envTo, 1 - Math.exp(-dt * 1.5));
      scene.background.copy(envCol); if (fogObj) fogObj.color.copy(envCol);
    }
    if (DEBUG && S.state !== 'menu') {
      const c0 = sample(S.p), pp = pts[Math.min(Math.floor(S.p), pts.length - 1)];
      const g0 = groundY(pp, 0), gL = groundY(pp, -4), gR = groundY(pp, 4);
      $('dbg').textContent = 'carretera y=' + c0.y.toFixed(2) + '  suelo(0)=' + g0.toFixed(2) + '  suelo(-4)=' + gL.toFixed(2) +
        '  suelo(+4)=' + gR.toFixed(2) + '\ncamara y=' + cam.position.y.toFixed(2) + '  S.ay=' + (S.ay ?? 0).toFixed(2) +
        '  aire=' + !!S.air + '  p=' + S.p.toFixed(1) + '  ancho=' + (widthMap.get(Math.floor(S.p / CH)) ?? 0).toFixed(1);
      $('dbg').classList.remove('hidden');
    }
    sun.position.set(S.cam.x - 80, S.cam.y + 120, S.cam.z + 60);
    sun.target.position.set(S.cam.x, S.cam.y - 1.4, S.cam.z);
    if (godMode && DEBUG) S.hp = 100;
    if (topView && DEBUG) {
      scene.fog = null;
      cam.up.set(Math.sin(yaw), 0, Math.cos(yaw));
      cam.position.set(ex, 100, ez);
      cam.lookAt(ex, 0, ez);
      carBox.visible = true;
      carBox.position.set(ex, c.y + 0.5, ez);
      carBox.rotation.set(0, yaw, 0);
    } else {
      scene.fog = fogObj;
      cam.up.set(0, 1, 0);
      carBox.visible = false;
    }
    if (S.state !== 'menu') renderer.render(scene, cam);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
