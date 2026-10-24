/* Endless Stage · lógica del juego */
const STEP = 3, CH = 20, ROAD_W = 9, GRASS = 120, BAR = ROAD_W / 2 + 0.4;
const BRIDGE_H = 8, BRIDGE_W = 30;
// Columnas laterales del terreno (metros desde el centro de la carretera)
const LAT = [-GRASS, -90, -60, -40, -28, -18, -11, -6.5, -5, 5, 6.5, 11, 18, 28, 40, 60, 90, GRASS];
const $ = id => document.getElementById(id);

// ---------- Terrenos ----------
const TERR = [
  { name: 'Asfalto', road: 0x2b2f38, grass: 0x3f8f3a, max: 70, acc: 1.0, grip: 1.0 },
  { name: 'Grava',   road: 0x9a7b55, grass: 0x7d6a48, max: 56, acc: 0.9, grip: 0.6 },
  { name: 'Nieve',   road: 0xeef6ff, grass: 0xdde8f2, max: 46, acc: 0.8, grip: 0.45 },
  { name: 'Barro',   road: 0x5a4632, grass: 0x3d5a2e, max: 42, acc: 0.7, grip: 0.5 }
];

// ---------- Three.js ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const SKY = 0x8fd3ff;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 140, 420);
const cam = new THREE.PerspectiveCamera(68, 1, 0.3, 900);
scene.add(new THREE.HemisphereLight(0xffffff, 0x406030, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 0.9);
sun.position.set(-80, 120, 60);
scene.add(sun);
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  cam.aspect = innerWidth / innerHeight;
  cam.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const TM = TERR.map(t => ({
  road: new THREE.MeshLambertMaterial({ color: t.road, side: THREE.DoubleSide }),
  grass: new THREE.MeshLambertMaterial({ color: t.grass, side: THREE.DoubleSide })
}));
const MAT = {
  line: new THREE.MeshLambertMaterial({ color: 0xfafafa, side: THREE.DoubleSide }),
  kerb: new THREE.MeshLambertMaterial({ color: 0xff4d4d, side: THREE.DoubleSide }),
  rail: new THREE.MeshLambertMaterial({ color: 0xe8eef7, side: THREE.DoubleSide }),
  concrete: new THREE.MeshLambertMaterial({ color: 0x9aa3ad }),
  walls: [0xf2e6d0, 0xd9a77b, 0xa8c3d6, 0xe0d28a, 0xc9b8e6, 0xf0c0b0].map(c => new THREE.MeshLambertMaterial({ color: c })),
  roofs: [0x8a3b2a, 0x3d4a5c, 0x6b5744, 0x2e5a6b].map(c => new THREE.MeshLambertMaterial({ color: c }))
};

// Geometrías compartidas (no se eliminan al descargar un tramo)
const HBOX = new THREE.BoxGeometry(1, 1, 1); HBOX.translate(0, 0.5, 0);
const HPYR = new THREE.ConeGeometry(0.75, 1, 4); HPYR.rotateY(Math.PI / 4); HPYR.translate(0, 0.5, 0);
const PILLAR = new THREE.BoxGeometry(1.4, 1, 1.4);
const TRUNK_G = new THREE.CylinderGeometry(0.3, 0.4, 2, 6); TRUNK_G.translate(0, 1, 0);

// Árboles billboard: sprites que siempre miran a la cámara
function treeMat(kind) {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 128;
  const x = cv.getContext('2d');
  if (kind === 'pine') {
    x.fillStyle = '#1f6b34';
    for (let i = 0; i < 4; i++) {
      const y = 20 + i * 24, w = 14 + i * 5;
      x.beginPath(); x.moveTo(32, y - 20); x.lineTo(32 - w, y + 14); x.lineTo(32 + w, y + 14); x.closePath(); x.fill();
    }
  } else {
    x.fillStyle = '#3f9a46';
    x.beginPath(); x.arc(32, 50, 28, 0, 7); x.fill();
    x.beginPath(); x.arc(22, 72, 18, 0, 7); x.fill();
    x.beginPath(); x.arc(42, 74, 18, 0, 7); x.fill();
  }
  x.fillStyle = '#5a3d22';
  x.fillRect(29, 108, 6, 20);
  return new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, alphaTest: 0.4 });
}
const SM = { pine: treeMat('pine'), round: treeMat('round') };

// ---------- Relieve ----------
// Ondulación del terreno en coordenadas del mundo
// 0 junto a la carretera, 1 lejos de ella: el terreno se funde con el asfalto
// Posición de un punto del terreno: a = desplazamiento lateral (positivo = derecha de pantalla)
function ptAt(p, a) {
  return { x: p.x - Math.cos(p.h) * a, z: p.z + Math.sin(p.h) * a };
}
function groundY(p, a) {
  const q = ptAt(p, a);
  return (p.y - p.b) + fadeOff(a) * hills(q.x, q.z);
}

// ---------- Pista procedural ----------
let pts = [], world = new THREE.Group(), chunks = new Map(), terrMap = new Map(), zoneMap = new Map();
let grid = new Map(), bridges = [];
scene.add(world);
let gk = 0, gh = 0, gslope = 0, gx = 0, gy = 0, gz = 0;

function resetTrack() {
  chunks.forEach((g) => { world.remove(g); disposeChunk(g); });
  chunks.clear(); terrMap.clear(); zoneMap.clear(); grid = new Map(); bridges = [];
  pts = []; gk = 0; gh = 0; gslope = 0; gx = 0; gy = 0; gz = 0;
  pts.push({ x: 0, y: 0, z: 0, h: 0, b: 0 });
  grid.set('0,0', [0]);
}
// Sube el tramo alrededor de un cruce para que la pista pase por encima de la otra
function applyBridge(m) {
  for (let idx = Math.max(0, m - BRIDGE_W); idx < pts.length; idx++) {
    const nb = bumpAt(bridges, idx, BRIDGE_H, BRIDGE_W), p = pts[idx];
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
function extend(n) {
  while (pts.length < n) {
    const m = pts.length;
    gk = clamp(gk * 0.98 + (Math.random() - 0.5) * 0.006, -0.025, 0.025);
    gh += gk * STEP;
    gslope = clamp(gslope * 0.97 + (Math.random() - 0.5) * 0.03, -0.18, 0.18);
    gy += gslope * STEP;
    gx += Math.sin(gh) * STEP;
    gz += Math.cos(gh) * STEP;
    const b = bumpAt(bridges, m, BRIDGE_H, BRIDGE_W);
    const p = { x: gx, y: gy + b, z: gz, h: gh, b };
    pts.push(p);
    checkCross(m);
    const key = Math.floor(p.x / 16) + ',' + Math.floor(p.z / 16);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(m);
  }
}

// Cinta entre dos desplazamientos laterales con alturas independientes (suelo o muro)
function ribbon(list, a, ya, b, yb) {
  const n = list.length, pos = new Float32Array(n * 6), idx = [];
  for (let i = 0; i < n; i++) {
    const p = list[i], A = ptAt(p, a), B = ptAt(p, b);
    pos.set([A.x, p.y + ya, A.z, B.x, p.y + yb, B.z], i * 6);
    if (i < n - 1) { const j = i * 2; idx.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// Línea discontinua central
function dashes(list) {
  const n = list.length, pos = new Float32Array(n * 6), idx = [];
  for (let i = 0; i < n; i++) {
    const p = list[i], A = ptAt(p, -0.15), B = ptAt(p, 0.15);
    pos.set([A.x, p.y + 0.03, A.z, B.x, p.y + 0.03, B.z], i * 6);
    if (i < n - 1 && ((i >> 2) & 1) === 0) { const j = i * 2; idx.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// Terreno en rejilla: colinas y cambios de pendiente fuera de la carretera
function groundMesh(list) {
  const M = LAT.length, n = list.length, pos = new Float32Array(n * M * 3), idx = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < M; j++) {
    const p = list[i], a = LAT[j], q = ptAt(p, a), o = (i * M + j) * 3;
    pos[o] = q.x; pos[o + 1] = groundY(p, a); pos[o + 2] = q.z;
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < M - 1; j++) {
    const a = i * M + j, b = a + 1, c = a + M, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function terrFor(c) {
  if (c === 0) return 0;
  if (Math.random() < 0.12) return Math.floor(Math.random() * TERR.length);
  return terrMap.get(c - 1) ?? 0;
}
// Zona junto a la carretera: pueblo (casas), bosque o campo abierto
function zoneFor() {
  const r = Math.random();
  return r < 0.35 ? 'pueblo' : r < 0.7 ? 'bosque' : 'campo';
}
function house(x, y, z, yaw) {
  const w = 3 + Math.random() * 3, d = 3 + Math.random() * 3, h = 3 + Math.random() * 4;
  const g = new THREE.Group();
  const body = new THREE.Mesh(HBOX, MAT.walls[Math.floor(Math.random() * MAT.walls.length)]);
  body.scale.set(w, h, d); body.userData.own = false; g.add(body);
  const roofMat = MAT.roofs[Math.floor(Math.random() * MAT.roofs.length)];
  let roof;
  if (Math.random() < 0.5) {
    roof = new THREE.Mesh(HPYR, roofMat);
    roof.scale.set(w, 1.4, d);
  } else {
    roof = new THREE.Mesh(HBOX, roofMat);
    roof.scale.set(w * 1.08, 0.25, d * 1.08);
  }
  roof.position.y = h; roof.userData.own = false; g.add(roof);
  g.position.set(x, y, z); g.rotation.y = yaw;
  return g;
}
function buildChunk(c) {
  const list = pts.slice(c * CH, c * CH + CH + 1);
  const t = terrFor(c), zone = zoneFor();
  terrMap.set(c, t); zoneMap.set(c, zone);
  const g = new THREE.Group();
  const add = (geo, m, own = true) => { const mesh = new THREE.Mesh(geo, m); mesh.userData.own = own; g.add(mesh); };

  add(groundMesh(list), TM[t].grass);
  add(ribbon(list, -ROAD_W / 2, 0, ROAD_W / 2, 0), TM[t].road);
  add(ribbon(list, -ROAD_W / 2 - 0.4, 0.02, -ROAD_W / 2, 0.02), MAT.kerb);
  add(ribbon(list, ROAD_W / 2, 0.02, ROAD_W / 2 + 0.4, 0.02), MAT.kerb);
  if (t === 0) add(dashes(list), MAT.line);
  add(ribbon(list, -BAR, 0.3, -BAR, 1.0), MAT.rail);
  add(ribbon(list, BAR, 0.3, BAR, 1.0), MAT.rail);

  // Pilares de los puentes
  for (let i = 0; i < list.length; i += 3) {
    const p = list[i];
    if (p.b > 1) for (const side of [-4, 4]) {
      const q = ptAt(p, side);
      const m = new THREE.Mesh(PILLAR, MAT.concrete);
      m.scale.set(1, p.b, 1);
      m.position.set(q.x, p.y - p.b / 2, q.z);
      m.userData.own = false; g.add(m);
    }
  }

  // Objetos junto a la carretera
  const prob = zone === 'bosque' ? 0.9 : zone === 'campo' ? 0.2 : 0.3;
  for (let i = 0; i < CH; i += 3) {
    const p = list[i];
    if (zone === 'pueblo' && i % 5 === 0) {
      for (const side of [-1, 1]) {
        if (Math.random() < 0.6) {
          const a = side * (22 + Math.random() * 8);
          const q = ptAt(p, a);
          g.add(house(q.x, groundY(p, a), q.z, p.h));
        }
      }
    }
    if (Math.random() < prob) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const a = side * (BAR + 3 + Math.random() * 28);
      const q = ptAt(p, a), y = groundY(p, a);
      const kind = Math.random() < 0.6 ? 'pine' : 'round';
      const s = new THREE.Sprite(SM[kind]);
      const w = 6 + Math.random() * 5;
      s.scale.set(w, w * 2, 1);
      s.center.set(0.5, 0);
      s.position.set(q.x, y, q.z);
      s.userData.own = false; g.add(s);
    }
  }
  world.add(g);
  chunks.set(c, g);
}
function disposeChunk(g) {
  g.children.forEach(m => { if (m.userData.own) m.geometry.dispose(); });
}
function updateTrack(p) {
  const c0 = Math.floor(p / CH);
  extend(Math.floor(p) + CH * 8);
  for (let c = c0; c <= c0 + 3; c++) {
    if (!chunks.has(c) && pts.length > (c + 1) * CH + 1) buildChunk(c);
  }
  for (const [c, g] of chunks) {
    if (c < c0 - 2) { world.remove(g); disposeChunk(g); chunks.delete(c); }
  }
}
function sample(p) {
  const i = clamp(Math.floor(p), 0, pts.length - 2), f = p - i, a = pts[i], b = pts[i + 1];
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f, h: a.h + (b.h - a.h) * f, k: (b.h - a.h) / STEP };
}
function terrAt(p) { return TERR[terrMap.get(Math.floor(p / CH)) ?? 0]; }

// ---------- Estado e input ----------
const S = { mode: 'keys', state: 'menu', p: 0, speed: 0, lat: 0, rel: 0, lv: 0, steer: 0, time: 60, nextCP: 500, dist: 0, best: load(), demoT: 0, terr: -1, cd: 0 };
const keys = {}, touch = { L: 0, R: 0, B: 0, G: 0 }, gyro = { steer: 0 };
const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'Space'];
const HINT = {
  keys: 'Flechas o WASD para conducir. Espacio o ↓ para frenar. Esc: menú.',
  gyro: 'Inclina el móvil para girar. ▲ acelera a la derecha y ■ frena a la izquierda.',
  touch: 'Acelerador automático. ◀ ▶ para girar y FRENO en el centro.'
};

function load() { try { return +localStorage.getItem('endless_stage_best') || 0; } catch (e) { return 0; } }
function saveBest() { try { localStorage.setItem('endless_stage_best', String(S.best)); } catch (e) {} }

addEventListener('keydown', e => {
  if (KEYS.includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (e.code === 'Enter' && S.state === 'menu') start();
  if (e.code === 'Escape') togglePause();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
addEventListener('deviceorientation', e => {
  if (e.gamma == null) return;
  const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
  const landscape = Math.abs(angle) === 90;
  const v = landscape ? (e.beta || 0) : (e.gamma || 0);
  gyro.steer = clamp(v / 25, -1, 1);
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
  $('menu').classList.toggle('hidden', st !== 'menu');
  $('hud').classList.toggle('hidden', st === 'menu');
  $('over').classList.toggle('hidden', st !== 'over');
  $('pause').classList.toggle('hidden', st !== 'paused');
  $('touch').classList.toggle('hidden', st !== 'playing' || S.mode === 'keys');
}
function start() {
  if (S.mode === 'gyro' && window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission) {
    DeviceOrientationEvent.requestPermission().catch(() => {});
  }
  try { document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {}); } catch (e) {}
  try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch (e) {}
  resetTrack();
  Object.assign(S, { p: 0, speed: 0, lat: 0, rel: 0, lv: 0, steer: 0, time: 60, nextCP: 500, dist: 0, state: 'playing', terr: -1, cd: 0 });
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
  resetTrack();
  Object.assign(S, { p: 0, speed: 0, lat: 0, rel: 0, lv: 0, steer: 0, dist: 0, terr: -1 });
  sync();
}
function flash(msg) {
  const f = $('flash'); f.textContent = msg; f.style.opacity = 1;
  setTimeout(() => f.style.opacity = 0, 1100);
}
$('go').onclick = start;
$('retry').onclick = start;
$('menuBtn').onclick = goMenu;
$('quit').onclick = goMenu;
$('resume').onclick = togglePause;
$('pauseBtn').onclick = togglePause;

// ---------- Física ----------
function physics(dt, inp) {
  const T = terrAt(S.p);
  if (S.terr !== TERR.indexOf(T)) {
    const prev = S.terr; S.terr = TERR.indexOf(T);
    if (prev !== -1 && S.state === 'playing') flash('Terreno: ' + T.name);
  }
  $('terr').textContent = T.name;

  S.speed += inp.gas * 24 * T.acc * Math.max(0, 1 - S.speed / T.max) * dt;
  S.speed -= inp.brake * 32 * dt;
  S.speed -= S.speed * 0.04 * dt;
  if (S.speed > T.max) S.speed -= (S.speed - T.max) * Math.min(1, dt * 1.5);
  S.speed = clamp(S.speed, 0, 80);

  const c = sample(S.p);
  S.steer += (inp.steer - S.steer) * Math.min(1, dt * 7);
  // rel: ángulo del coche respecto a la carretera (positivo = hacia la derecha de pantalla).
  // El coche no sigue la curva por sí solo: si no giras, la carretera se aleja de tu rumbo.
  const turn = S.steer * 1.4 * T.grip * Math.min(1, S.speed / 12);
  S.rel += (turn + c.k * S.speed - S.rel * 0.12 * T.grip) * dt;
  S.rel = clamp(S.rel, -1.2, 1.2);
  S.lat += S.speed * Math.sin(S.rel) * dt;
  const vx = S.speed * Math.cos(S.rel) * dt;

  // Barreras laterales
  const LIM = ROAD_W / 2 - 0.9;
  if (Math.abs(S.lat) > LIM) {
    S.lat = Math.sign(S.lat) * LIM;
    if (Math.sign(S.rel) === Math.sign(S.lat) && Math.abs(S.rel) > 0.1) {
      S.speed *= 0.85;
      if (S.cd <= 0) { flash('¡Choque!'); S.cd = 1; }
      S.rel = -S.rel * 0.4;
    }
  }
  S.cd = Math.max(0, S.cd - dt);

  S.p += vx / STEP;
  S.dist = S.p * STEP;

  if (S.state === 'playing') {
    S.time -= dt;
    if (S.dist >= S.nextCP) { S.time += 12; S.nextCP += 500; flash('+12 s'); }
    if (S.time <= 0) { S.time = 0; end(); }
  }
}

// ---------- Bucle ----------
resetTrack();
updateTrack(0);
setMode('keys');
sync();
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (S.state === 'menu') {
    S.demoT += dt;
    physics(dt, { steer: Math.sin(S.demoT * 0.6) * 0.35, gas: 1, brake: 0 });
  } else if (S.state === 'playing') {
    physics(dt, readInput());
  } else if (S.state === 'over') {
    physics(dt, { steer: 0, gas: 0, brake: 1 });
  }
  // En pausa no se simula, solo se renderiza

  updateTrack(S.p);

  // Cámara en primera persona a 1.4 m del suelo, sin coche visible
  const c = sample(S.p);
  const rx = -Math.cos(c.h), rz = Math.sin(c.h);
  const ex = c.x + rx * S.lat, ey = c.y + 1.4, ez = c.z + rz * S.lat;
  const yaw = c.h - S.rel;
  cam.position.set(ex, ey, ez);
  cam.lookAt(ex + Math.sin(yaw) * 30, ey - 0.3, ez + Math.cos(yaw) * 30);
  cam.fov = 68 + S.speed * 0.15;
  cam.updateProjectionMatrix();

  if (S.state !== 'menu') {
    $('spd').textContent = Math.round(S.speed * 3.6);
    const t = Math.ceil(S.time), m = Math.floor(t / 60), s = String(t % 60).padStart(2, '0');
    const tm = $('tm');
    tm.textContent = m + ':' + s;
    tm.style.color = S.time < 10 ? '#ff6b6b' : '#fff';
    $('dst').textContent = (S.dist / 1000).toFixed(2) + ' km';
  }
  renderer.render(scene, cam);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
