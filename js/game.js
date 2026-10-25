/* Endless Stage · motor del juego */
const STEP = 3, CH = 20, ROAD_W = 10, GRASS = 120, BAR = ROAD_W / 2 + 0.4;
const BRIDGE_H = 8, BRIDGE_W = 30;
const LAT = [-GRASS, -90, -60, -40, -28, -18, -11, -6.5, -5, 5, 6.5, 11, 18, 28, 40, 60, 90, GRASS];
const WALLS = ['rail', 'wave', 'stone', 'hay', 'tyre'];
const TERR = [
  { name: 'Asfalto', road: 0xffffff, grass: 0xffffff, max: 70, acc: 1.0, grip: 1.0 },
  { name: 'Grava',   road: 0xc9a77e, grass: 0xd8c39a, max: 56, acc: 0.9, grip: 0.6 },
  { name: 'Nieve',   road: 0xc9d6e2, grass: 0xffffff, max: 46, acc: 0.8, grip: 0.25 },
  { name: 'Barro',   road: 0x8a6a4a, grass: 0x7d9a5a, max: 42, acc: 0.7, grip: 0.5 }
];
const $ = id => document.getElementById(id);
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
  if (!el) return;
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
  const REPEAT = { plaster: 3, roof: 3, guardrail: 3, stone: 2, rock: 2, hay: 2, concrete: 2, wave: 2, wheel: 2, log: 2 };
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
  function ext(url, fallback, onload) {
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
    snow: tex('snow', noise('#f4f8fc', '170,190,210', 0.5)),
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

  // Personas en billboard: una textura por imagen del manifiesto (respaldo: figura sencilla)
  const personDraw = x => {
    x.fillStyle = '#2b3a55';
    x.beginPath(); x.arc(32, 22, 11, 0, 7); x.fill();
    x.fillRect(22, 36, 20, 48); x.fillRect(22, 84, 8, 40); x.fillRect(34, 84, 8, 40);
  };
  const PEOPLE = (M.people && M.people.length ? M.people : [null, null, null, null]).map(u => {
    const fb = canvasTex(64, 128, personDraw);
    const pm = new THREE.MeshLambertMaterial({ map: fb, alphaTest: 0.4, side: DS });
    pm.userData.aspect = 0.5;
    ext(u, fb, img => { pm.userData.aspect = img.width / img.height; });
    return pm;
  });

  // Casas: paredes y tejados de PNG (M.houseWalls / M.houseRoofs) más tintes procedurales
  const WALL_MATS = [0xf2e6d0, 0xd9a77b, 0xa8c3d6, 0xe0d28a, 0xc9b8e6, 0xf0c0b0]
    .map(c => new THREE.MeshLambertMaterial({ map: TX.plaster, color: c, side: DS }))
    .concat(pool('plaster', THREE.MeshLambertMaterial, { map: TX.plaster, side: DS }))
    .concat((M.houseWalls || []).map(u => new THREE.MeshLambertMaterial({ map: sizedTex(ext(u, canvasTex(128, 128, noise('#d0c8b8', '90,80,70', 0.4))), M.repeat && M.repeat.houseWalls), side: DS })));
  const ROOF_MATS = [0x8a3b2a, 0x3d4a5c, 0x6b5744, 0x2e5a6b]
    .map(c => new THREE.MeshLambertMaterial({ map: TX.roof, color: c, side: DS }))
    .concat(pool('roof', THREE.MeshLambertMaterial, { map: TX.roof, side: DS }))
    .concat((M.houseRoofs || []).map(u => new THREE.MeshLambertMaterial({ map: sizedTex(ext(u, canvasTex(128, 128, tileDraw)), M.repeat && M.repeat.houseRoofs), side: DS })));

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
      road: pool(snow ? 'snow' : 'asphalt', THREE.MeshLambertMaterial, { map: snow ? TX.snow : TX.asphalt, color: t.road, side: DS, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
      grass: pool(snow ? 'snow' : 'grass', THREE.MeshLambertMaterial, { map: snow ? TX.snow : TX.grass, color: t.grass, side: DS, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
    };
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
    rock: pool('rock', THREE.MeshLambertMaterial, { map: TX.rock, flatShading: true }),
    snow: new THREE.MeshLambertMaterial({ color: 0xf4f8ff, flatShading: true }),
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
  const HAY = new THREE.CylinderGeometry(0.9, 0.9, 3, 12); HAY.rotateZ(Math.PI / 2);
  const TYRE_G = new THREE.TorusGeometry(0.55, 0.22, 8, 14); TYRE_G.rotateX(Math.PI / 2);
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
  const ROCK_G = new THREE.IcosahedronGeometry(1, 0);
  const LOG_G = new THREE.CylinderGeometry(0.4, 0.4, 2.6, 8); LOG_G.rotateZ(Math.PI / 2);
  const CONE_G = new THREE.ConeGeometry(0.35, 0.9, 8);

  // ---------- Three.js ----------
  const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const SKY = 0x8fd3ff;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 140, 420);
  const cam = new THREE.PerspectiveCamera(68, 1, 0.3, 900);
  // Faros: foco unido a la cámara que solo se enciende de noche
  const headL = new THREE.SpotLight(0xfff3d6, 0, 90, 0.55, 0.45, 1);
  headL.position.set(0, 0, 0);
  headL.target.position.set(0, -0.3, -30);
  cam.add(headL); cam.add(headL.target);
  scene.add(cam);
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x4a5a3a, 0.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.5);
  sun.position.set(-80, 120, 60);
  // Sombras del sol: la zona de sombra sigue al coche (unos 140 m)
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
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
  function ptAt(p, a) { return { x: p.x - Math.cos(p.h) * a, z: p.z + Math.sin(p.h) * a }; }
  function groundY(p, a) {
    const q = ptAt(p, a), f0 = clamp((Math.abs(a) - 11) / 12, 0, 1), f = f0 * f0 * (3 - 2 * f0);
    const dep = 3.5 * (p.b / BRIDGE_H);
    return (p.y - p.b - 0.6) - dep * (1 - f) + f * hills(q.x, q.z);
  }
  // Cinta entre dos desplazamientos laterales; ya/yb pueden ser números o funciones del índice
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
  function groundMesh(list) {
    const Mn = LAT.length, n = list.length, pos = new Float32Array(n * Mn * 3), uv = new Float32Array(n * Mn * 2), idx = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < Mn; j++) {
      const p = list[i], a = LAT[j], q = ptAt(p, a), o = i * Mn + j;
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
  function prismOf(w, h, d, mat, x, y, z, rot) {
    const m = new THREE.Mesh(PRISM, mat);
    m.scale.set(w, h, d); m.position.set(x, y, z); m.rotation.y = rot || 0;
    m.userData.own = false;
    return m;
  }
  // Casa compuesta por formas: cuerpo + tejado (a dos aguas, a cuatro aguas, plano), L, torre o granero
  const FRAME_MAT = new THREE.MeshLambertMaterial({ color: 0xe9e4da });
  const GLASS_MAT = new THREE.MeshPhongMaterial({ color: 0x6d9cc0, specular: 0xbfdcf2, shininess: 90 });
  const SILL_MAT = new THREE.MeshLambertMaterial({ color: 0xcfc6b6 });
  const DOOR_MAT = new THREE.MeshLambertMaterial({ color: 0x6b4428 });
  const PANEL_MAT = new THREE.MeshLambertMaterial({ color: 0x553620 });
  const SHUTTER_MAT = new THREE.MeshLambertMaterial({ color: 0x3d5a40 });
  const BRASS_MAT = new THREE.MeshPhongMaterial({ color: 0xc9a84a, specular: 0xfff0c0, shininess: 60 });
  const KNOB = new THREE.SphereGeometry(0.06, 8, 6);
  const DECOR_MATS = { frame: FRAME_MAT, glass: GLASS_MAT, sill: SILL_MAT, door: DOOR_MAT, panel: PANEL_MAT, shutter: SHUTTER_MAT };
  // Une cajas (BOX) en una sola geometría: una malla por material y casa
  function mergeBoxes(items) {
    const P = [], N = [], I = [];
    const bp = BOX.attributes.position, bn = BOX.attributes.normal, bi = BOX.index.array;
    let off = 0;
    for (const it of items) {
      for (let v = 0; v < bp.count; v++) {
        P.push(bp.getX(v) * it.sx + it.x, bp.getY(v) * it.sy + it.y, bp.getZ(v) * it.sz + it.z);
        N.push(bn.getX(v), bn.getY(v), bn.getZ(v));
      }
      for (let k = 0; k < bi.length; k++) I.push(bi[k] + off);
      off += bp.count;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setIndex(I);
    return g;
  }
  // Ventanas y puertas: sobresalen de la fachada (marco, cristal, parteluz, alféizar y persianas)
  function decor(g, w, h, d) {
    const parts = { frame: [], glass: [], sill: [], door: [], panel: [], shutter: [] };
    const B = (k, sx, sy, sz, x, y, z) => parts[k].push({ sx, sy, sz, x, y, z });
    const n = Math.max(1, Math.floor((w - 0.6) / 1.5));
    for (const f of [1, -1]) {
      const zs = f * d / 2, ww = 0.9, wh = 1.2;
      for (let yb = 1.0; yb + wh < h - 0.4; yb += 2.8) for (let k = 0; k < n; k++) {
        const x = (k - (n - 1) / 2) * (w / n);
        if (yb < 2.4 && f === 1 && Math.abs(x) < 1.0) continue;   // hueco de la puerta
        B('frame', ww + 0.16, wh + 0.16, 0.08, x - ww / 2 - 0.08, yb - 0.08, zs + f * 0.04);
        B('glass', ww, wh, 0.03, x - ww / 2, yb, zs + f * 0.03);
        B('frame', 0.06, wh, 0.06, x - 0.03, yb, zs + f * 0.05);
        B('frame', ww, 0.06, 0.06, x - ww / 2, yb + wh / 2, zs + f * 0.05);
        B('sill', ww + 0.32, 0.06, 0.24, x - ww / 2 - 0.16, yb - 0.12, zs + f * 0.12);
        if (Math.random() < 0.35) {
          B('shutter', 0.28, wh, 0.04, x - ww / 2 - 0.2, yb, zs + f * 0.03);
          B('shutter', 0.28, wh, 0.04, x + ww / 2 + 0.2 - 0.28, yb, zs + f * 0.03);
        }
      }
    }
    // Puerta con marco, hoja y dos paneles, pomo y escalón
    const zd = d / 2;
    B('frame', 1.36, 2.12, 0.1, -0.68, 0, zd + 0.04);
    B('door', 1.0, 2.0, 0.08, -0.5, 0.04, zd + 0.06);
    B('panel', 0.72, 0.62, 0.03, -0.36, 1.2, zd + 0.11);
    B('panel', 0.72, 0.78, 0.03, -0.36, 0.25, zd + 0.11);
    B('sill', 1.8, 0.16, 0.8, -0.9, 0, zd + 0.4);
    for (const k of Object.keys(parts)) if (parts[k].length) {
      const m = new THREE.Mesh(mergeBoxes(parts[k]), DECOR_MATS[k]);
      m.userData.own = true; g.add(m);
    }
    const kn = new THREE.Mesh(KNOB, BRASS_MAT);
    kn.position.set(0.12, 1.0, zd + 0.12); kn.userData.own = false; g.add(kn);
  }
  function house(x, y, z, yaw) {
    const kind = pick(['gable', 'hip', 'flat', 'L', 'tower', 'barn']);
    const w = rnd(3, 6.5), d = rnd(3, 6), h = kind === 'tower' ? rnd(7, 11) : rnd(3, 6);
    const wm = pick(WALL_MATS), rm = pick(ROOF_MATS);
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
    if (kind === 'L') {
      body(w, h, d * 0.6, 0, -d * 0.2, wm);
      part(PRISM, w * 1.08, rnd(1.5, 2.5), d * 0.66, 0, h, -d * 0.2, rm);
      body(w * 0.5, h * 0.8, d * 0.5, w * 0.4, d * 0.3, wm);
      part(PYR, w * 0.55, 1.2, d * 0.55, w * 0.4, h * 0.8, d * 0.3, rm);
    } else if (kind === 'tower') {
      body(w * 0.6, h, w * 0.6, 0, 0, wm);
      part(PYR, w * 0.7, w * 0.8, w * 0.7, 0, h, 0, rm);
    } else if (kind === 'barn') {
      body(w * 1.5, h, d * 1.8, 0, 0, wm);
      part(PRISM, w * 1.6, rnd(1.8, 2.6), d * 1.9, 0, h, 0, rm);
    } else {
      body(w, h, d, 0, 0, wm);
      if (kind === 'gable') part(PRISM, w * 1.08, rnd(1.5, 2.5), d * 1.08, 0, h, 0, rm);
      else if (kind === 'hip') part(PYR, w * 1.1, rnd(1.5, 2.5), d * 1.1, 0, h, 0, rm);
      else part(BOX, w * 1.06, 0.25, d * 1.06, 0, h, 0, rm);
    }
    decor(g, w, h, d);
    const fw = kind === 'barn' ? w * 1.5 : kind === 'L' ? w * 1.4 : w;
    const fd = kind === 'barn' ? d * 1.8 : kind === 'L' ? d * 1.2 : d;
    g.userData.hw = fw / 2 + 0.2; g.userData.hd = fd / 2 + 0.2;
    g.position.set(x, y, z); g.rotation.y = yaw;
    return g;
  }

  let houseCols = [];
  function addHouse(g, x, y, z, yaw, c) {
    const h = house(x, y, z, yaw);
    g.add(h);
    houseCols.push({ x, z, yaw, hw: h.userData.hw, hd: h.userData.hd, c });
  }

  // Obstáculos ocasionales sobre la carretera
  let obsCols = [];
  function addObstacle(g, p, lat, c, gi) {
    const q = ptAt(p, lat), kind = pick(['rock', 'log', 'cone']);
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
  function wallOf(type, list, sgn, g, BAR) {
    const a = sgn * BAR;
    // Altura h sobre el terreno junto al muro, expresada respecto a la carretera de cada punto
    // Base de la barrera: terreno junto a la carretera, o tablero si está sobre un puente
    const base = i => groundY(list[i], a) + list[i].b * (1 + 3.5 / BRIDGE_H);
    const gy = h => i => base(i) - list[i].y + h;
    const add = (geo, m, own = true) => { const mesh = new THREE.Mesh(geo, m); mesh.userData.own = own; g.add(mesh); };
    if (type === 'rail') {
      add(ribbon(list, a, gy(0.3), a, gy(1.0)), pick(MAT.rail));
      for (let i = 0; i < list.length; i += 4) {
        const q = ptAt(list[i], a), m = new THREE.Mesh(POST, MAT.post);
        m.position.set(q.x, base(i), q.z); m.userData.own = false; g.add(m);
      }
    } else if (type === 'wave') {
      const top = i => base(i) - list[i].y + 0.9 + 0.35 * Math.sin(i * 0.7);
      add(ribbon(list, a, gy(0.3), a, top), pick(MAT.wave));
    } else if (type === 'stone') {
      wallVolume(list, a, a + sgn * 0.6, gy(0), gy(1.2), pick(MAT.stone), add);
    } else if (type === 'hay') {
      for (let i = 0; i < list.length - 1; i++) {
        const p = list[i], q = ptAt(p, a + sgn * 0.9), m = new THREE.Mesh(HAY, pick(MAT.hay));
        m.position.set(q.x, groundY(p, a + sgn * 0.9) + 0.9, q.z); m.rotation.y = p.h - Math.PI / 2; m.userData.own = false; g.add(m);
      }
    } else if (type === 'tyre') {
      const slots = [];
      for (let i = 0; i < list.length - 1; i += 2) for (const k of [-1.5, 0, 1.5]) {
        const p = list[i], q = ptAt(p, a + sgn * 0.9), n = Math.random() < 0.5 ? 3 : 4;
        for (let h = 0; h < n; h++) slots.push({ x: q.x + Math.sin(p.h) * k, y: groundY(p, a + sgn * 0.9) + 0.2 + h * 0.4, z: q.z + Math.cos(p.h) * k });
      }
      if (!slots.length) return;
      const mats = MAT.tyre, buckets = mats.map(() => []);
      for (const sl of slots) buckets[Math.floor(Math.random() * mats.length)].push(sl);
      buckets.forEach((bk, bi) => {
        if (!bk.length) return;
        const inst = new THREE.InstancedMesh(TYRE_G, mats[bi], bk.length);
        const dm = new THREE.Object3D();
        bk.forEach((sl, j) => { dm.position.set(sl.x, sl.y, sl.z); dm.updateMatrix(); inst.setMatrixAt(j, dm.matrix); });
        inst.instanceMatrix.needsUpdate = true;
        inst.userData.own = false; g.add(inst);
      });
    }
  }

  // ---------- Pista procedural ----------
  let pts = [], world = new THREE.Group(), chunks = new Map(), terrMap = new Map(), zoneMap = new Map();
  let grid = new Map(), bridges = [];
  const widthMap = new Map();
  const roadWidthAt = d => Math.max(2, 10 - 0.5 * d / 1000);
  scene.add(world);
  let gk = 0, gh = 0, gslope = 0, gx = 0, gy = 0, gz = 0, gT = 0, gTimer = 0, segQueue = [];

  function resetTrack() {
    chunks.forEach(g => { world.remove(g); disposeChunk(g); });
    chunks.clear(); terrMap.clear(); zoneMap.clear(); grid = new Map(); bridges = []; houseCols = []; obsCols = []; widthMap.clear();
    pts = []; gk = 0; gh = 0; gslope = 0; gx = 0; gy = 0; gz = 0; gT = 0; gTimer = 0; segQueue = [];
    pts.push({ x: 0, y: 0, z: 0, h: 0, b: 0 });
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
        if ((o.x - q.x) ** 2 + (o.z - q.z) ** 2 < 144) { bridges.push(m); applyBridge(m); return; }
      }
    }
  }
  // Patrones: recta, curva, chicane (dos curvas opuestas casi seguidas) o curvas enlazadas
  function buildPattern() {
    const sgn = () => (Math.random() < 0.5 ? -1 : 1);
    const seg = (k, n) => segQueue.push({ k, n: Math.floor(n) });
    const r = Math.random();
    if (r < 0.2) seg(0, rnd(30, 70));
    else if (r < 0.5) seg(sgn() * rnd(0.01, 0.02), rnd(12, 30));
    else if (r < 0.75) {
      const k = sgn() * rnd(0.016, 0.024);
      seg(k, rnd(8, 12)); seg(0, 3); seg(-k, rnd(8, 12)); seg(0, rnd(20, 40));
    } else {
      let d = sgn();
      const count = Math.floor(rnd(2, 4));
      for (let j = 0; j < count; j++) {
        seg(d * rnd(0.012, 0.02), rnd(10, 22));
        seg(0, rnd(4, 9));
        if (Math.random() < 0.4) d = -d;
      }
      seg(0, rnd(30, 60));
    }
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
      gk += (gT - gk) * 0.15;
      gh += gk * STEP;
      gslope = clamp(gslope * 0.97 + (Math.random() - 0.5) * 0.03, -0.18, 0.18);
      gy += gslope * STEP;
      gx += Math.sin(gh) * STEP;
      gz += Math.cos(gh) * STEP;
      const b = bridgeHeight(m);
      const p = { x: gx, y: gy + b, z: gz, h: gh, b, k: gk };
      pts.push(p);
      checkCross(m);
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
    const t = terrFor(c), zone = zoneFor();
    const onBridge = list.some(p => p.b > 1);
    const wall = onBridge ? pick(['rail', 'wave', 'stone'])
      : (Math.random() < 0.2 ? 'tyre' : pick(['rail', 'wave', 'stone', 'hay']));
    terrMap.set(c, t); zoneMap.set(c, zone);
    const g = new THREE.Group();
    const add = (geo, m, own = true) => { const mesh = new THREE.Mesh(geo, m); mesh.userData.own = own; g.add(mesh); };

    add(groundMesh(list), pick(TM[t].grass));
    add(ribbon(list, -ROAD_W / 2, 0, ROAD_W / 2, 0), pick(TM[t].road));
    if (t === 0) add(dashes(list), MAT.line);
    // Marcas de neumáticos por tramos, en los dos carriles
    for (const lane of [-ROAD_W * 0.25, ROAD_W * 0.25]) if (Math.random() < 0.5)
      add(ribbon(list, lane - 0.6, 0.035, lane + 0.6, 0.035, i => ((i >> 3) & 1) === 0), t === 2 ? MAT.tireMarkSnow : pick(MAT.tireMark));
    // Baches y charcos
    for (let i = 0; i < CH; i += 2) if (t !== 2 && Math.random() < 0.08) {
      const q = ptAt(list[i], rnd(-3.2, 3.2)), m = new THREE.Mesh(CIRCLE, MAT.pothole);
      m.rotation.x = -Math.PI / 2; m.scale.setScalar(rnd(0.5, 1.2));
      m.position.set(q.x, list[i].y + 0.02, q.z); m.userData.own = false; g.add(m);
    }
    if (t !== 2 && Math.random() < 0.3) {
      const i = Math.floor(rnd(0, CH)), q = ptAt(list[i], rnd(-3, 3)), m = new THREE.Mesh(CIRCLE, MAT.puddle);
      m.rotation.x = -Math.PI / 2; m.scale.set(rnd(1.5, 3), rnd(1.2, 2.5), 1);
      m.position.set(q.x, list[i].y + 0.04, q.z); m.userData.own = false; g.add(m);
    }
    for (const sgn of [-1, 1]) wallOf(wall, list, sgn, g, BAR);

    // Pilares de puentes (cima oculta bajo la carretera)
    for (let i = 0; i < list.length; i += 3) {
      const p = list[i];
      if (p.b > 1) for (const side of [-4, 4]) {
        const q = ptAt(p, side), m = new THREE.Mesh(PILLAR, MAT.pillar);
        const dep = 3.5 * (p.b / BRIDGE_H), bottom = p.y - p.b - 0.6 - dep, top = p.y - 0.4;
        m.scale.set(1, top - bottom, 1);
        m.position.set(q.x, (top + bottom) / 2, q.z);
        m.userData.own = false; g.add(m);
      }
    }
    // Montañas lejanas, de siluetas distintas y con rotación aleatoria
    if (Math.random() < 0.18) {
      const side = pick([-1, 1]), q = ptAt(list[10], side * rnd(200, 320)), r = rnd(70, 160), hgt = rnd(90, 220);
      const m = new THREE.Mesh(MOUNT, MAT.mountain);
      m.scale.set(r, hgt, r); m.position.set(q.x, list[10].y - 10, q.z); m.rotation.y = rnd(0, 6.28);
      m.userData.own = false; g.add(m);
    }
    // Árboles y casas detrás de las barreras: cuadrícula densa, ~90 % ocupada
    for (let i = 0; i < CH; i += 2) {
      const p = list[i];
      for (let col = 0; col < 5; col++) for (const side of [-1, 1]) {
        if (Math.random() > 0.9) continue;
        if (zone === 'pueblo' && col < 2 && Math.random() < 0.35) {
          const ah = side * (BAR + 7 + col * 6), qh = ptAt(p, ah);
          addHouse(g, qh.x, groundY(p, ah), qh.z, p.h, c);
          continue;
        }
        {
          const a = side * (BAR + 3 + col * 6 + rnd(-1, 1)), q = ptAt(p, a), y = groundY(p, a);
          const mat = pick(TREE_MATS), w = rnd(6, 11) * (mat.userData.size || 1), s = new THREE.Mesh(TREE_PLANE, mat);
          s.scale.set(w, w * mat.userData.aspect, 1);
          s.userData.bb = true;
          s.position.set(q.x, y, q.z);
          s.userData.own = false; g.add(s);
          const cs = new THREE.Mesh(CANOPY_G, SHADOW_MAT);
          cs.scale.set(w * 0.5, w * mat.userData.aspect, w * 0.5);
          cs.position.set(q.x, y, q.z); cs.userData.own = false; g.add(cs);
        }
      }
    }
    if (Math.random() < 0.12) {
      const oi = Math.floor(rnd(2, CH - 2));
      addObstacle(g, list[oi], rnd(-ROAD_W / 2 + 0.9, ROAD_W / 2 - 0.9), c, c * CH + oi);
    }
    if (Math.random() < 0.4) {
      const grp = Math.random() < 0.5 ? Math.floor(rnd(2, 6)) : Math.floor(rnd(1, 3));
      const i0 = Math.floor(rnd(0, CH - 4)), side = pick([-1, 1]), base = BAR + rnd(2.5, 5);
      for (let j = 0; j < grp; j++) {
        const p = list[i0 + Math.floor(rnd(0, 4))], a = side * (base + rnd(-0.5, 0.5)), q = ptAt(p, a);
        const mat = pick(PEOPLE), H = rnd(1.6, 1.9), sp = new THREE.Mesh(TREE_PLANE, mat);
        sp.scale.set(H * mat.userData.aspect, H, 1);
        sp.userData.bb = true;
        sp.position.set(q.x, groundY(p, a), q.z);
        sp.userData.own = false; g.add(sp);
      }
    }
    g.traverse(m => { if (m.isMesh) { m.castShadow = !m.userData.bb; m.receiveShadow = true; } });
    world.add(g);
    chunks.set(c, g);
  }
  function disposeChunk(g) {
    g.traverse(m => { if (m.isMesh && m.userData.own) m.geometry.dispose(); });
  }
  function updateTrack(p) {
    const c0 = Math.floor(p / CH);
    extend(Math.floor(p) + CH * 25);
    for (let c = c0; c <= c0 + 3; c++) {
      if (!chunks.has(c) && pts.length > (c + 1) * CH + 1) buildChunk(c);
    }
    for (const [c, g] of chunks) {
      if (c < c0 - 2) { world.remove(g); disposeChunk(g); chunks.delete(c); houseCols = houseCols.filter(h => h.c !== c); obsCols = obsCols.filter(o => o.c !== c); }
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
    Object.entries(so.terrain || {}).forEach(([k, u]) => { list['t:' + k] = u; });
    for (const [k, u] of Object.entries(list)) if (u) {
      fetch(u).then(r => (r.ok ? r.arrayBuffer() : null)).then(b => { if (b) SND.raw[k] = b; }).catch(() => {});
    }
    Object.keys(FB_ICONS).forEach(k => {
      const u = M.arrows && M.arrows[k];
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
  function audio() {
    if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (audioCtx && !eng) initSound(audioCtx);
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  if (M.sounds && M.sounds.crash) {
    fetch(M.sounds.crash).then(r => r.arrayBuffer())
      .then(b => audio() && audioCtx.decodeAudioData(b)).then(d => { crashBuf = d; }).catch(() => {});
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

  addEventListener('keydown', e => {
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
    Object.assign(S, { p: 0, speed: 0, lat: 0, rel: 0, lv: 0, steer: 0, time: 60, nextCP: 500, dist: 0, state: 'playing', terr: -1, cd: 0, hp: 100, cam: null, prevBest: S.best, beat: false });
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
    Object.assign(S, { p: 0, speed: 0, lat: 0, rel: 0, lv: 0, steer: 0, dist: 0, terr: -1, cam: null });
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
    const LIM = Math.max(0.2, RW / 2 - 0.6);
    if (Math.abs(S.lat) > LIM) {
      const hit = Math.sign(S.rel) === Math.sign(S.lat) && Math.abs(S.rel) > 0.1;
      const impact = hit ? Math.abs(S.speed) * (0.2 + 0.8 * Math.abs(Math.sin(S.rel))) : 0;
      if (impact > 4 && S.cd <= 0) { S.hp = Math.max(0, S.hp - impact * 0.6); S.cd = 0.8; playCrash(clamp(impact / 40, 0.2, 1)); }
      if (impact > 30 && Math.abs(S.lat) < 20) {
        S.speed *= 0.6; // rompe la barrera: el coche sale a la hierba
      } else {
        S.lat = Math.sign(S.lat) * LIM;
        if (hit) { S.speed *= 0.85; S.rel *= 0.3; }
      }
    }
    if (Math.abs(S.lat) > RW / 2 + 0.5) S.speed *= 1 - 0.5 * dt;
    S.cd = Math.max(0, S.cd - dt);
    S.p = Math.max(0, S.p + vx / STEP);
    if (S.p === 0 && vx < 0) S.speed = 0;
    S.dist = S.p * STEP;

    if (S.state === 'playing' && S.hp <= 0) end();
  }

  function houseCollide() {
    const c = sample(S.p), rx = -Math.cos(c.h), rz = Math.sin(c.h);
    const cx = c.x + rx * S.lat, cz = c.z + rz * S.lat;
    for (const o of obsCols) {
      if (Math.hypot(cx - o.x, cz - o.z) < o.r + 1) {
        const impact = Math.abs(S.speed) * 0.8;
        if (S.cd <= 0 && impact > 4) { S.hp = Math.max(0, S.hp - impact * 0.6); S.cd = 0.8; playCrash(clamp(impact / 40, 0.2, 1)); }
        S.speed *= 0.2; S.p -= 0.5;
        return;
      }
    }
    for (const h of houseCols) {
      const dx = cx - h.x, dz = cz - h.z, cs = Math.cos(h.yaw), sn = Math.sin(h.yaw);
      const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
      if (Math.abs(lx) < h.hw + 1 && Math.abs(lz) < h.hd + 1.5) {
        const impact = Math.abs(S.speed) * 0.7;
        if (S.cd <= 0 && impact > 4) { S.hp = Math.max(0, S.hp - impact * 0.6); S.cd = 0.8; playCrash(clamp(impact / 40, 0.2, 1)); }
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
      if (Math.abs(sum) > 0.35) items.push({ kind: 'curve', start: st, ang: sum, maxK });   // ang > 0 = izquierda
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
    for (const o of obsCols) if (o.i > S.p && o.i - S.p <= n) items.push({ kind: 'obs', start: o.i });
    return items.sort((x, y) => x.start - y.start);
  }
  function updateTurn() {
    const items = findItems(1200).filter(it => it.start > S.p);
    const panel = $('turns'), t1 = $('t1'), t2 = $('t2');
    const dTxt = it => {
      const d = Math.max(0, (it.start - S.p) * STEP);
      return d < 1000 ? Math.round(d / 10) * 10 + 'm' : (d / 1000).toFixed(1) + 'km';
    };
    const color = it => it.kind === 'obs' ? '#ff5a5a'
      : it.maxK < 0.01 ? '#7dff9b' : it.maxK < 0.016 ? '#ffd166' : '#ff5a5a';
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
    scene.fog.color.set(on ? 0x0b1222 : SKY);
    hemi.intensity = on ? 0.5 * 0.05 : 0.5;
    sun.intensity = on ? 0 : 1.5;
    headL.intensity = on ? 4 : 0;
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
    const ex = c.x + rx * S.lat, ey = c.y + 1.4, ez = c.z + rz * S.lat;
    const yaw = c.h - S.rel;
    if (!S.cam) S.cam = { x: ex, y: ey, z: ez, yaw };
    const kp = 1 - Math.exp(-dt * 18), ky = 1 - Math.exp(-dt * 10);
    S.cam.x += (ex - S.cam.x) * kp; S.cam.y += (ey - S.cam.y) * kp; S.cam.z += (ez - S.cam.z) * kp;
    S.cam.yaw += (yaw - S.cam.yaw) * ky;
    const vib = S.rough * S.speed / 20 * 0.1;
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
    // Billboards: los planos de árboles y personas giran para mirar a la cámara
    for (const cg of chunks.values()) for (const m of cg.children) if (m.userData.bb)
      m.rotation.y = Math.atan2(cam.position.x - m.position.x, cam.position.z - m.position.z);
    sun.position.set(S.cam.x - 80, S.cam.y + 120, S.cam.z + 60);
    sun.target.position.set(S.cam.x, S.cam.y - 1.4, S.cam.z);
    if (S.state !== 'menu') renderer.render(scene, cam);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
