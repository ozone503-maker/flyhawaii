import { BOOST, ease, advanceSpeed } from './flight-speed.js';
import { formatDistance, approachHint, createDeliveryAudio } from './delivery-feedback.js';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { decodeHeightPng } from './height-png.js';
import { ChunkStreamer } from './chunks.js';
import { Attractions } from './attractions.js';
import { PILOTS, pilotById, buildShip, disposeShip } from './ships.js';

// ---------- constants ----------
// True scale: 1 world unit = 100 m on every axis. Positions come from real lat/lon (equirectangular
// projection at the map's center latitude, under 0.5% scale error across the island).
const params = new URLSearchParams(location.search);
const UNIT_M = 100;
const VEXAG = Number(params.get('vex') || 1);   // 1 = true vertical scale
const SHADE_EX = 3;                             // hillshade only (texture), not geometry
const UFO_SCALE = 0.32;                         // saucer about 200 m across
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

// Real landmark coordinates (OpenStreetMap / Nominatim, USGS GNIS). Summits are snapped to the
// highest DEM cell within snapKm so the label sits on the real peak of the baked terrain.
const LANDMARKS = [
  { name: 'Mauna Kea', lat: 19.8207, lon: -155.4681, snapKm: 2, ele: 4207 },
  { name: 'Mauna Loa', lat: 19.4756, lon: -155.6054, snapKm: 3, ele: 4169 },
  { name: 'Kilauea caldera', lat: 19.4067, lon: -155.2830 },
  { name: 'Halemaumau', lat: 19.4065, lon: -155.2821 },
  { name: 'Hualalai', lat: 19.6911, lon: -155.8666, snapKm: 1.5, ele: 2521 },
  { name: 'Kohala', lat: 20.0862, lon: -155.7172, snapKm: 3, ele: 1670 },
  { name: 'Waipio Valley', lat: 20.1190, lon: -155.6000 },
  { name: 'Waimanu Valley', lat: 20.1425, lon: -155.6371 },
  { name: 'Akaka Falls', lat: 19.8532, lon: -155.1561 },
  { name: 'Rainbow Falls', lat: 19.7195, lon: -155.1096 },
  { name: 'Hilo Bay', lat: 19.7260, lon: -155.0787 },
  { name: 'Kealakekua Bay', lat: 19.4771, lon: -155.9271 },
  { name: 'South Point (Ka Lae)', lat: 18.9111, lon: -155.6811 }, // Wikipedia/GNIS 18.9111, -155.681111; GLO-30 southernmost land pixel 18.91108, -155.68196
];

const TOWNS = [
  { id: 'hilo',   town: 'Hilo',          lat: 19.7241, lon: -155.0868, biz: ['Mango Moon Bakery', 'Rainbow Falls Surf Repair'] },
  { id: 'kona',   town: 'Kailua-Kona',   lat: 19.6400, lon: -155.9969, biz: ['Rocket Bean Coffee Co', 'Ali\u02BBi Glow Poke Bar'] },
  { id: 'waimea', town: 'Waimea',        lat: 20.0234, lon: -155.6717, biz: ['Paniolo Pixel Feed & Gear', 'Upcountry Cloud Creamery'] },
  { id: 'volcano',town: 'Volcano',       lat: 19.4296, lon: -155.2357, biz: ['Fern Fog Glass Studio', 'Steam Vent Noodle House'] },
  { id: 'pahoa',  town: 'Pahoa',         lat: 19.4970, lon: -154.9453, biz: ['Lava Lamp Records', 'Puna Star Fruit Stand'] },
  { id: 'hawi',   town: 'Hawi',          lat: 20.2414, lon: -155.8336, biz: ['Trade Wind Kite Works', 'Kohala Comet Chocolate'] },
];
const PACKAGES = ['a box of malasadas', 'surfboard fins', 'a crate of coffee beans', 'glass floats', 'vinyl records', 'kite parts', 'ice cream (keep it cold)', 'a lei order', 'chocolate bars', 'saddle leather'];

// ---------- renderer / scene ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;

const scene = new THREE.Scene();
const SKY = new THREE.Color(0x8cc8ee);
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 180, 1300);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 5000);

const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
sun.position.set(-600, 900, 300);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xdcefff, 0x4a5a40, 1.5));

// sky dome gradient
{
  const g = new THREE.SphereGeometry(3500, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x2f7fd0) }, bottom: { value: SKY } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y*2.2, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, h),1.0);}',
  });
  const sky = new THREE.Mesh(g, m); sky.renderOrder = -1; scene.add(sky);
  window.__sky = sky;
}

// ---------- terrain ----------
let H, meta, SIZE, N;
function toWorld(lat, lon) {
  const x = ((lon - meta.lon0) / (meta.lon1 - meta.lon0) - 0.5) * SIZE;
  const z = ((meta.lat1 - lat) / (meta.lat1 - meta.lat0) - 0.5) * SIZE;
  return new THREE.Vector2(x, z);
}
function elevM(x, z) { // bilinear elevation in meters at world x,z
  const fx = (x / SIZE + 0.5) * N - 0.5, fz = (z / SIZE + 0.5) * N - 0.5;
  const i = Math.max(0, Math.min(N - 2, Math.floor(fx))), j = Math.max(0, Math.min(N - 2, Math.floor(fz)));
  const tx = Math.min(1, Math.max(0, fx - i)), tz = Math.min(1, Math.max(0, fz - j));
  const a = H[j * N + i], b = H[j * N + i + 1], c = H[(j + 1) * N + i], d = H[(j + 1) * N + i + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}
const COVER = new THREE.Vector4(1, 1, -1, -1);
let streamer = null, attractions = null, lastAttr = 0;
function elevBest(x, z) { const c = streamer ? streamer.heightM(x, z) : null; return c ?? elevM(x, z); }
const groundY = (x, z) => Math.max(0, elevBest(x, z)) / UNIT_M * VEXAG;
// objects that sit on the ground get re-seated when sharper chunk heights arrive
const grounded = new Set();
function seat(o, x, z, off) { o.userData.ground = { x, z, off }; o.position.set(x, groundY(x, z) + off, z); grounded.add(o); }
function reseat() { for (const o of grounded) { const g = o.userData.ground; o.position.y = groundY(g.x, g.z) + g.off; } }
function fromWorld(x, z) {
  return { lon: meta.lon0 + (x / SIZE + 0.5) * (meta.lon1 - meta.lon0), lat: meta.lat1 - (z / SIZE + 0.5) * (meta.lat1 - meta.lat0) };
}
function haversineKm(a, b) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(h));
}
function snapPeak(lm) {
  if (!lm.snapKm) return;
  const w = toWorld(lm.lat, lm.lon), rad = lm.snapKm * 1000 / UNIT_M; let best = -1e9, bx = w.x, bz = w.y;
  for (let dz = -rad; dz <= rad; dz += 0.5) for (let dx = -rad; dx <= rad; dx += 0.5) {
    if (dx * dx + dz * dz > rad * rad) continue; const e = elevM(w.x + dx, w.y + dz); if (e > best) { best = e; bx = w.x + dx; bz = w.y + dz; }
  }
  const ll = fromWorld(bx, bz); lm.lat = ll.lat; lm.lon = ll.lon; lm.eleM = Math.round(best);
}

// Ocean = cells at or below sea level connected to the map edge. Inland cells at or below 0 m
// (DEM datum quirks around Hilo and stream mouths) are raised to 1 m so they render as land.
let OCEAN, COAST;
function fixInlandSea() {
  OCEAN = new Uint8Array(N * N); const q = new Int32Array(N * N); let qh = 0, qt = 0;
  const push = (k) => { if (!OCEAN[k] && H[k] <= 0) { OCEAN[k] = 1; q[qt++] = k; } };
  for (let i = 0; i < N; i++) { push(i); push((N - 1) * N + i); push(i * N); push(i * N + N - 1); }
  while (qh < qt) { const k = q[qh++], i = k % N, j = (k / N) | 0;
    if (i > 0) push(k - 1); if (i < N - 1) push(k + 1); if (j > 0) push(k - N); if (j < N - 1) push(k + N); }
  for (let k = 0; k < N * N; k++) if (!OCEAN[k] && H[k] <= 0) H[k] = 1;
  COAST = new Uint8Array(N * N); // land within ~2 cells of open ocean
  for (let j = 2; j < N - 2; j++) for (let i = 2; i < N - 2; i++) { const k = j * N + i; if (OCEAN[k]) continue;
    for (let d = 1; d <= 2 && !COAST[k]; d++) if (OCEAN[k - d] || OCEAN[k + d] || OCEAN[k - d * N] || OCEAN[k + d * N]) COAST[k] = 1; }
}
function hash(i, j) { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - v) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v;
}
const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function buildColorTexture(water, satImg) {
  // Sentinel-2 mosaic (baked into the base world frame) with OSM rivers on top
  const N = 2048, c = document.createElement('canvas'); c.width = c.height = N;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#061e52'; ctx.fillRect(0, 0, N, N);
  if (satImg) ctx.drawImage(satImg, 0, 0, N, N);
  if (water) {
    const P = ([lon, lat]) => [(lon - meta.lon0) / (meta.lon1 - meta.lon0) * N, (meta.lat1 - lat) / (meta.lat1 - meta.lat0) * N];
    ctx.lineCap = ctx.lineJoin = 'round';
    for (const pass of ['s', 'r']) for (const w of water.ways) {
      if (w.t !== pass) continue;
      ctx.strokeStyle = w.t === 'r' ? 'rgba(70,165,230,0.9)' : w.i ? 'rgba(110,175,220,0.35)' : 'rgba(80,160,225,0.7)';
      ctx.lineWidth = w.t === 'r' ? 1.4 : w.i ? 0.5 : (w.n ? 1 : 0.7);
      ctx.beginPath(); w.p.forEach((q, k) => { const [x, y] = P(q); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
    }
  }
  return c;
}

function buildTerrain(water, satImg) {
  const seg = isTouch ? 255 : 383;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), z = pos.getZ(k);
    const e = elevM(x, z);
    pos.setY(k, e > 0 ? e / UNIT_M * VEXAG + 0.08 : -0.25 + Math.max(-0.5, e / 6000));
  }
  geo.computeVertexNormals();
  const colorCanvas = buildColorTexture(water, satImg);
  const tex = new THREE.CanvasTexture(colorCanvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const mat = new THREE.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 });
  // The low-res whole-island base sinks out of the way wherever high-res chunks fully cover the ground
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCover = { value: COVER };
    sh.vertexShader = 'uniform vec4 uCover;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float dIn = min(min(position.x - uCover.x, uCover.z - position.x), min(position.z - uCover.y, uCover.w - position.z));
      transformed.y -= 6.0 * smoothstep(0.0, 4.0, dIn);`);
  };
  const mesh = new THREE.Mesh(geo, mat); scene.add(mesh);

  // far ocean
  const far = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshLambertMaterial({ color: 0x0a3a78 }));
  far.rotation.x = -Math.PI / 2; far.position.y = -0.8; scene.add(far);
  // water sheen
  const waterMat = new THREE.MeshPhongMaterial({ color: 0x2a8fd0, transparent: true, opacity: 0.38, shininess: 90, specular: 0x99ddff, depthWrite: false });
  const sheen = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), waterMat);
  sheen.rotation.x = -Math.PI / 2; sheen.position.y = 0.02; scene.add(sheen);
  return colorCanvas;
}

// ---------- UFO ----------
// ---------- markers ----------
function makeLabel(text, color) {
  const c = document.createElement('canvas'); const ctx = c.getContext('2d');
  const font = '700 44px system-ui, sans-serif'; ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 48; c.width = w; c.height = 76;
  ctx.font = font; ctx.fillStyle = 'rgba(6,18,31,0.75)';
  ctx.beginPath(); ctx.roundRect(0, 0, w, 76, 24); ctx.fill();
  ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.fillText(text, 24, 40);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, fog: false }));
  s.userData.aspect = w / 76; s.renderOrder = 10; return s;
}
function makeBeacon(color) {
  const g = new THREE.Group(); g.scale.setScalar(0.35);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 260, 24, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  col.position.y = 130; g.add(col);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(9, 0.6, 8, 48), new THREE.MeshBasicMaterial({ color, fog: false }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 1.5; g.add(ring);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(9, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false }));
  pad.rotation.x = -Math.PI / 2; pad.position.y = 1.2; g.add(pad);
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 2.2), new THREE.MeshStandardMaterial({ color: 0xc89a5a, roughness: 0.8 }));
  box.position.y = 2.6; g.add(box);
  g.userData = { col, ring, box };
  return g;
}

// ---------- state ----------
const state = {
  running: false, paused: false,
  tokens: Number(localStorage.getItem('fh_kdu') || 0),
  delivered: Number(localStorage.getItem('fh_jobs') || 0),
  pos: new THREE.Vector3(), yaw: 0, vel: new THREE.Vector3(), vy: 0, bank: 0,
  job: null, phase: 'pickup', hover: 0, jobStart: 0,
};
const keys = new Set();
const input = { fwd: 0, turn: 0, up: 0, boost: false };

let ufo, beaconPick, beaconDrop, labelPick, labelDrop, colorCanvas, coins = [];

function placeCoins() {
  const coinGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 28);
  coinGeo.rotateX(Math.PI / 2);
  const coinMat = new THREE.MeshStandardMaterial({ color: 0x1ec8ff, emissive: 0x0a6cff, emissiveIntensity: 0.9, metalness: 0.7, roughness: 0.25 });
  let tries = 0;
  while (coins.length < 40 && tries++ < 4000) {
    const x = (Math.random() - 0.5) * SIZE * 0.8, z = (Math.random() - 0.5) * SIZE * 0.8;
    if (elevM(x, z) < 20) continue;
    const m = new THREE.Mesh(coinGeo, coinMat);
    seat(m, x, z, 2 + Math.random() * 5);
    scene.add(m); coins.push(m);
  }
}

function newJob() {
  const a = TOWNS[Math.floor(Math.random() * TOWNS.length)];
  let b; do { b = TOWNS[Math.floor(Math.random() * TOWNS.length)]; } while (b === a);
  const from = { ...a, name: a.biz[Math.floor(Math.random() * 2)] };
  const to = { ...b, name: b.biz[Math.floor(Math.random() * 2)] };
  const pkg = PACKAGES[Math.floor(Math.random() * PACKAGES.length)];
  const km = haversineKm(from, to);
  state.job = { from, to, pkg, km, reward: Math.round(20 + km * 1.6) };
  state.phase = 'pickup'; state.hover = 0;
  placeBeacon(beaconPick, labelPick, from, `Pick up: ${from.name}`, '#ffc46b');
  placeBeacon(beaconDrop, labelDrop, to, `Deliver: ${to.name}`, '#7dffb0');
  beaconDrop.visible = labelDrop.visible = false;
  beaconPick.visible = labelPick.visible = true;
  updateMissionText();
}
function placeBeacon(b, label, t, text, color) {
  seat(b, t.w.x, t.w.y, 0);
  const old = label.material.map; const nl = makeLabel(text, color);
  label.material.map = nl.material.map; label.userData.aspect = nl.userData.aspect; old && old.dispose();
  label.scale.set(label.userData.aspect * 2.2, 2.2, 1);
  seat(label, t.w.x, t.w.y, 9);
}
function target() { return state.phase === 'pickup' ? state.job.from : state.job.to; }
const $ = (id) => document.getElementById(id);
const deliveryAudio = createDeliveryAudio({
  AudioContext: window.AudioContext || window.webkitAudioContext,
  enabled: localStorage.getItem('fh_sound') === 'on',
});
const soundButton = $('soundBtn');
function updateSoundButton() {
  const on = localStorage.getItem('fh_sound') === 'on';
  soundButton.textContent = `Delivery sound: ${on ? 'on' : 'off'}`;
  soundButton.setAttribute('aria-pressed', String(on));
}
updateSoundButton();
soundButton.addEventListener('click', () => {
  const on = localStorage.getItem('fh_sound') !== 'on';
  localStorage.setItem('fh_sound', on ? 'on' : 'off');
  deliveryAudio.setEnabled(on); updateSoundButton();
});
// Unlock only on deliberate play/resume clicks, never from a timer.
for (const id of ['startBtn', 'selGo', 'resumeBtn']) {
  $(id).addEventListener('click', () => deliveryAudio.unlock());
}
function deliveryReward(amount, bonus) {
  const el = $('deliveryReward');
  el.textContent = `Delivered  +${amount} KDU${bonus ? ` (${bonus} speed bonus)` : ''}`;
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  clearTimeout(deliveryReward.timer);
  deliveryReward.timer = setTimeout(() => el.classList.remove('on'), 3000);
  deliveryAudio.complete();
}
function updateMissionText() {
  const j = state.job, m = $('mission');
  m.className = state.phase;
  if (state.phase === 'pickup') {
    $('missionStep').textContent = `Job ${state.delivered + 1}: pick up ${j.pkg}`;
    $('missionTarget').textContent = `${j.from.name}, ${j.from.town}`;
    $('cargo').textContent = `${j.reward} KDU`;
  } else {
    $('missionStep').textContent = `Deliver ${j.pkg} to`;
    $('missionTarget').textContent = `${j.to.name}, ${j.to.town}`;
    $('cargo').textContent = `${j.reward} KDU + speed bonus`;
  }
}
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 1800); }
function discoverNote(a, bonus) {
  const el = $('discover'); el.innerHTML = '';
  const b = document.createElement('b'); b.textContent = a.name;
  el.append('New discovery ', b, ` +${bonus} KDU`); el.classList.add('on');
  clearTimeout(discoverNote._t); discoverNote._t = setTimeout(() => el.classList.remove('on'), 3200);
}
function addTokens(n) {
  state.tokens += n; localStorage.setItem('fh_kdu', state.tokens);
  $('tokenCount').textContent = state.tokens.toLocaleString();
  const el = $('tokens'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}

// ---------- input ----------
addEventListener('keydown', (e) => { keys.add(e.code); if (e.code === 'Space') e.preventDefault(); if (e.code === 'KeyP' || e.code === 'Escape') togglePause(); });
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
// Floating stick: the base anchors wherever the left thumb first lands, anywhere in the left zone
const stick = { id: null, x: 0, y: 0, cx: 0, cy: 0 };
const stickZone = $('stickZone'), stickEl = $('stick'), knob = $('knob');
const STICK_R = 64;
stickZone.addEventListener('pointerdown', (e) => {
  if (stick.id !== null) return;
  e.preventDefault(); stick.id = e.pointerId; stickZone.setPointerCapture(e.pointerId);
  const z = stickZone.getBoundingClientRect();
  stick.cx = e.clientX; stick.cy = e.clientY;
  stickEl.style.left = `${e.clientX - z.left - 75}px`; stickEl.style.top = `${e.clientY - z.top - 75}px`; stickEl.style.bottom = 'auto';
  stickEl.classList.add('live'); moveStick(e);
});
stickZone.addEventListener('pointermove', (e) => { if (e.pointerId === stick.id) moveStick(e); });
const endStick = (e) => {
  if (e.pointerId !== stick.id) return; stick.id = null; stick.x = stick.y = 0; knob.style.transform = '';
  stickEl.classList.remove('live'); stickEl.style.left = stickEl.style.top = stickEl.style.bottom = '';
};
stickZone.addEventListener('pointerup', endStick); stickZone.addEventListener('pointercancel', endStick); stickZone.addEventListener('lostpointercapture', endStick);
function moveStick(e) {
  let dx = e.clientX - stick.cx, dy = e.clientY - stick.cy; const l = Math.hypot(dx, dy);
  if (l > STICK_R) { dx *= STICK_R / l; dy *= STICK_R / l; }
  stick.x = dx / STICK_R; stick.y = dy / STICK_R; knob.style.transform = `translate(${dx}px, ${dy}px)`;
}
// radial dead zone (15%) then an expo curve so small thumb moves give gentle changes
const DEAD = 0.15, expo = (v) => Math.sign(v) * (0.3 * Math.abs(v) + 0.7 * Math.abs(v) ** 3);
function shapeStick(x, y) {
  const m = Math.hypot(x, y); if (m < DEAD) return [0, 0];
  const k = Math.min(1, (m - DEAD) / (1 - DEAD)) / m;
  return [expo(x * k), expo(y * k)];
}
const held = { up: false, down: false, boost: false };
for (const [id, k] of [['btnUp', 'up'], ['btnDown', 'down'], ['btnBoost', 'boost']]) {
  const el = $(id);
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); held[k] = true; el.classList.add('active'); el.setPointerCapture(e.pointerId); });
  const up = () => { held[k] = false; el.classList.remove('active'); };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
}
document.addEventListener('contextmenu', (e) => e.preventDefault());

function readInput() {
  const k = (c) => keys.has(c);
  let fwd = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
  let turn = (k('KeyA') || k('ArrowLeft') ? 1 : 0) - (k('KeyD') || k('ArrowRight') ? 1 : 0);
  let up = (k('Space') || k('KeyE') || k('KeyR') ? 1 : 0) - (k('KeyC') || k('KeyQ') || k('KeyF') || k('ControlLeft') ? 1 : 0);
  if (stick.id !== null) { const [sx, sy] = shapeStick(stick.x, stick.y); fwd = -sy; turn = -sx; }
  up += (held.up ? 1 : 0) - (held.down ? 1 : 0);
  input.fwd = Math.max(-1, Math.min(1, fwd)); input.turn = Math.max(-1, Math.min(1, turn)); input.up = Math.max(-1, Math.min(1, up));
  input.boost = k('ShiftLeft') || k('ShiftRight') || held.boost;
}

function togglePause(force) {
  if (!state.running || !$('select').classList.contains('hidden')) return;
  state.paused = force !== undefined ? force : !state.paused;
  $('pause').classList.toggle('hidden', !state.paused);
}
$('pauseBtn').addEventListener('click', () => togglePause(true));
$('resumeBtn').addEventListener('click', () => togglePause(false));
$('newJobBtn').addEventListener('click', () => { newJob(); togglePause(false); });
document.addEventListener('visibilitychange', () => { if (document.hidden) togglePause(true); });

// ---------- minimap ----------
const mm = $('minimap'), mctx = mm.getContext('2d');
let mmBase;
function drawMinimap() {
  const W = mm.width;
  mctx.drawImage(mmBase, 0, 0, W, W);
  const toMM = (x, z) => [(x / SIZE + 0.5) * W, (z / SIZE + 0.5) * W];
  for (const t of TOWNS) { const [a, b] = toMM(t.w.x, t.w.y); mctx.fillStyle = 'rgba(255,255,255,.7)'; mctx.fillRect(a - 1.5, b - 1.5, 3, 3); }
  const tg = target(); const [tx, tz] = toMM(tg.w.x, tg.w.y);
  mctx.fillStyle = state.phase === 'pickup' ? '#ffc46b' : '#7dffb0';
  mctx.beginPath(); mctx.arc(tx, tz, 5, 0, Math.PI * 2); mctx.fill();
  const [ux, uz] = toMM(state.pos.x, state.pos.z);
  mctx.save(); mctx.translate(ux, uz); mctx.rotate(-state.yaw);
  mctx.fillStyle = '#1ec8ff'; mctx.beginPath(); mctx.moveTo(0, -7); mctx.lineTo(5, 5); mctx.lineTo(-5, 5); mctx.closePath(); mctx.fill();
  mctx.restore();
}

// ---------- loop ----------
const clock = new THREE.Clock();
const tmp = new THREE.Vector3(), camTarget = new THREE.Vector3(), lookAt = new THREE.Vector3();
let camInit = false;

// Flight feel: everything eases toward a target, nothing jumps.
// Existing stylized game-mph readout. Actual world speeds live in flight-speed.js.
const GAME_MPH = 15;
// All disc skins share flight stats
let shipEnv = null;
let pilot = pilotById(params.get('pilot') || localStorage.getItem('fh_pilot'));
function step(dt, t) {
  readInput();
  // Gentle throttle opening, faster release/braking, unchanged low-stick control.
  const S = pilot.stats;
  advanceSpeed(state, input, S, dt);
  state.inT = ease(state.inT || 0, input.turn, 7, dt);
  // turn rate is capped by speed: nimble when hovering, wide and steady at boost
  const sp = Math.abs(state.speed);
  const maxTurn = lerp(1.5, 0.55, Math.min(1, sp / BOOST)) * S.turn;
  state.yawRate = ease(state.yawRate || 0, state.inT * maxTurn, 6, dt);
  state.yaw += state.yawRate * dt;
  const fwdDir = tmp.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
  state.vel.copy(fwdDir).multiplyScalar(state.speed);
  state.vy = ease(state.vy, input.up * lerp(7, 12, state.boostMix) * S.climb, 4, dt);
  state.pos.addScaledVector(state.vel, dt); state.pos.y += state.vy * dt;
  const lim = SIZE * 0.62; state.pos.x = Math.max(-lim, Math.min(lim, state.pos.x)); state.pos.z = Math.max(-lim, Math.min(lim, state.pos.z));
  const gy = groundY(state.pos.x, state.pos.z);
  const minY = gy + 0.45;
  if (state.pos.y < minY) { state.pos.y = minY; if (state.vy < 0) state.vy = 0; }
  state.pos.y = Math.min(state.pos.y, 70);

  // ufo visuals
  state.bank = lerp(state.bank, (state.yawRate / 1.5) * 0.4, Math.min(1, dt * 4));
  const pitch = -state.inF * 0.12;
  ufo.group.position.copy(state.pos);
  ufo.group.position.y += Math.sin(t * 2.2) * 0.06;
  ufo.group.rotation.set(0, 0, 0); ufo.group.rotateY(state.yaw); ufo.group.rotateZ(state.bank); ufo.group.rotateX(pitch);
  ufo.lights.forEach((l, i) => { l.material.color.setHSL(ufo.hue, 1, 0.5 + 0.2 * Math.sin(t * 6 + i)); });

  // mission
  let tg = target();
  let dx = tg.w.x - state.pos.x, dz = tg.w.y - state.pos.z;
  const horiz = Math.hypot(dx, dz);
  const agl = state.pos.y - groundY(tg.w.x, tg.w.y);
  const inZone = horiz < 3.2 && agl < 8;
  const beamOn = inZone && state.vel.length() < 9;
  if (beamOn) state.hover += dt; else state.hover = Math.max(0, state.hover - dt * 2);
  const need = 1.4;
  $('beam').classList.toggle('on', state.hover > 0); $('beamFill').style.width = `${Math.min(100, state.hover / need * 100)}%`;
  const bh = Math.max(1, (state.pos.y - groundY(state.pos.x, state.pos.z)) / UFO_SCALE);
  ufo.beam.material.opacity = lerp(ufo.beam.material.opacity, beamOn ? 0.35 : 0, Math.min(1, dt * 6));
  ufo.beam.scale.set(1, bh, 1); ufo.beam.position.y = -bh / 2 - 0.6;
  if (state.hover >= need) {
    state.hover = 0;
    if (state.phase === 'pickup') {
      state.phase = 'dropoff'; state.jobStart = performance.now();
      beaconPick.visible = labelPick.visible = false; beaconDrop.visible = labelDrop.visible = true;
      toast(`Package on board\nFly to ${state.job.to.town}`);
      updateMissionText();
    } else {
      const secs = (performance.now() - state.jobStart) / 1000;
      const par = state.job.km * 1000 / UNIT_M / 12; // seconds at a relaxed pace
      const bonus = Math.max(0, Math.round((par - secs) / par * state.job.reward * 0.6));
      addTokens(state.job.reward + bonus);
      state.delivered++; localStorage.setItem('fh_jobs', state.delivered);
      deliveryReward(state.job.reward + bonus, bonus);
      newJob();
    }
  }
  // coins
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i]; c.rotation.y += dt * 2.5;
    if (c.position.distanceToSquared(state.pos) < 2.5) { scene.remove(c); grounded.delete(c); coins.splice(i, 1); addTokens(1); toast('+1 KDU'); }
  }
  // beacon animation
  for (const b of [beaconPick, beaconDrop]) {
    const d = Math.hypot(b.position.x - state.pos.x, b.position.z - state.pos.z);
    b.userData.col.material.opacity = 0.05 + 0.25 * sstep(4, 40, d);
    b.userData.ring.scale.setScalar(1 + 0.08 * Math.sin(t * 4)); b.userData.box.rotation.y += dt;
    b.userData.box.visible = (b === beaconPick && state.phase === 'pickup') || (b === beaconDrop && false);
  }
  // HUD
  tg = target(); dx = tg.w.x - state.pos.x; dz = tg.w.y - state.pos.z;
  const bearing = Math.atan2(dx, dz); // world bearing
  const rel = bearing - Math.atan2(-Math.sin(state.yaw), -Math.cos(state.yaw));
  $('arrow').style.transform = `rotate(${-rel}rad)`;
  $('dist').textContent = formatDistance(haversineKm(fromWorld(state.pos.x, state.pos.z), tg));
  $('missionHint').textContent = approachHint(Math.hypot(dx, dz), state.pos.y - groundY(tg.w.x, tg.w.y), state.vel.length(), state.phase);
  $('altVal').textContent = Math.round(Math.max(0, state.pos.y) / VEXAG * UNIT_M).toLocaleString();
  $('spdVal').textContent = Math.round(state.vel.length() * GAME_MPH);
  if ((step.f = (step.f || 0) + 1) % 3 === 0) drawMinimap();
}

let camYaw = 0, camH = 0;
function updateCamera(dt) {
  // third-person chase cam locked directly behind the saucer's heading
  if (!camInit) { camYaw = state.yaw; camInit = true; }
  let dy = state.yaw - camYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  camYaw += dy * Math.min(1, dt * 10);
  const back = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
  const spd = state.vel.length();
  const portrait = camera.aspect < 1;
  const dist = (portrait ? 7.5 : 5.5) + spd * 0.04, h = (portrait ? 2.2 : 1.6) + spd * 0.015;
  camTarget.copy(state.pos).addScaledVector(back, dist); camTarget.y += h;
  const cg = groundY(camTarget.x, camTarget.z) + 0.4;
  camH = Math.max(camTarget.y, cg);
  camera.position.set(camTarget.x, lerp(camera.position.y || camH, camH, Math.min(1, dt * 8)), camTarget.z);
  if (camera.position.y < cg) camera.position.y = cg;
  lookAt.copy(state.pos).addScaledVector(back, -4); lookAt.y += 0.3;
  camera.lookAt(lookAt);
  window.__sky.position.copy(camera.position);
}

let lastStream = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
  if (attractions && state.running && !state.paused && t - lastAttr > 0.2) { lastAttr = t; attractions.update(state.pos.x, state.pos.z); }
  attractions?.tick(dt);
  if (streamer && state.running && t - lastStream > 0.25) { lastStream = t; streamer.update(state.pos); COVER.copy(streamer.cover); }
  if (state.running && !state.paused) { step(dt, t); updateCamera(dt); }
  else if (!state.running && ufo) { // attract mode orbit
    const a = t * 0.06; camera.position.set(Math.cos(a) * 650, 160, Math.sin(a) * 650); camera.lookAt(0, 10, 0); window.__sky.position.copy(camera.position);
  }
  renderer.render(scene, camera);
}

function fitFov() { camera.fov = innerWidth < innerHeight ? 72 : 62; }
fitFov();
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; fitFov(); camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// ---------- boot ----------
async function boot() {
  const startBtn = $('startBtn'); startBtn.disabled = true;
  const ok = (r) => { if (!r.ok) throw new Error(`${r.url} ${r.status}`); return r; };
  const [m, hb, water, manifest, attrList, satImg] = await Promise.all([
    fetch('/terrain/meta.json').then(ok).then((r) => r.json()),
    fetch('/terrain/base-h.png').then(ok).then((r) => r.arrayBuffer()).then(decodeHeightPng),
    fetch('/terrain/waterways.json').then(ok).then((r) => r.json()).catch(() => null),
    fetch('/chunks/chunks.json').then(ok).then((r) => r.json()).catch(() => null),
    fetch('/photos/attractions.json').then(ok).then((r) => r.json()).catch(() => []),
    fetch('/terrain/base-sat.jpg').then(ok).then((r) => r.blob()).then((b) => createImageBitmap(b)).catch(() => null)]);
  meta = m; N = m.N; SIZE = m.sizeKm * 1000 / UNIT_M;
  H = new Int16Array(N * N); for (let k = 0; k < H.length; k++) H[k] = hb.data[k] - 6000; // stored as meters + 6000
  fixInlandSea();
  for (const t of TOWNS) t.w = toWorld(t.lat, t.lon);
  colorCanvas = buildTerrain(water, satImg);
  mmBase = document.createElement('canvas'); mmBase.width = mmBase.height = 160; mmBase.getContext('2d').drawImage(colorCanvas, 0, 0, 160, 160);
  shipEnv = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  ufo = buildShip(pilot.id, UFO_SCALE, shipEnv); scene.add(ufo.group);
  beaconPick = makeBeacon(0xffa94d); beaconDrop = makeBeacon(0x4dff9a); scene.add(beaconPick, beaconDrop);
  labelPick = makeLabel(' ', '#fff'); labelDrop = makeLabel(' ', '#fff'); scene.add(labelPick, labelDrop);
  // town name labels
  for (const t of TOWNS) { const l = makeLabel(t.town, '#ffffff'); l.material.depthTest = true; l.scale.set(l.userData.aspect * 1.6, 1.6, 1); seat(l, t.w.x, t.w.y, 4); scene.add(l); }
  const pinMat = new THREE.MeshBasicMaterial({ color: 0xffffff }), pinGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 6);
  for (const lm of LANDMARKS) {
    snapPeak(lm); const w = toWorld(lm.lat, lm.lon); const gy = groundY(w.x, w.y);
    const text = lm.ele ? `${lm.name} ${lm.ele.toLocaleString()} m` : lm.name;
    const l = makeLabel(text, '#cfefff'); l.material.depthTest = true; l.scale.set(l.userData.aspect * 1.4, 1.4, 1); seat(l, w.x, w.y, 4.2); scene.add(l);
    const pin = new THREE.Mesh(pinGeo, pinMat); pin.scale.y = 3.4; seat(pin, w.x, w.y, 1.7); scene.add(pin);
  }
  window.__landmarks = LANDMARKS;
  placeCoins();
  attractions = new Attractions({ list: attrList, fromWorld, toWorld, haversineKm, groundY, scene, camera,
    onDiscover: (a, bonus) => { addTokens(bonus); discoverNote(a, bonus); } });
  if (manifest && !params.has('nochunks')) {
    const ring = Number(params.get('ring') || (isTouch ? 1 : 2));
    streamer = new ChunkStreamer({ scene, manifest, world: { toWorld }, water, ring, unitM: UNIT_M / VEXAG,
      maxAniso: Math.min(8, renderer.capabilities.getMaxAnisotropy()), onLoad: () => reseat() });
  }
  // start near Hilo airport, facing west toward Mauna Kea
  const start = toWorld(19.72, -155.05);
  state.pos.set(start.x, groundY(start.x, start.y) + 3, start.y);
  state.yaw = Math.PI / 2; // face west toward Mauna Kea
  $('tokenCount').textContent = state.tokens.toLocaleString();
  newJob();
  startBtn.disabled = false; $('loading').textContent = '';
  if (params.has('debug')) window.__fh = { state, target, TOWNS, streamer, COVER, groundY, attractions, toWorld, get ufo() { return ufo; }, get pilot() { return pilot; } };
  if (params.has('autostart')) startGame();
}
function setPilot(id) {
  pilot = pilotById(id); localStorage.setItem('fh_pilot', pilot.id);
  if (ufo && ufo.pilot.id !== pilot.id) { const old = ufo; ufo = buildShip(pilot.id, UFO_SCALE, shipEnv); scene.add(ufo.group); ufo.group.position.copy(old.group.position); disposeShip(old); }
  $('pilotBadge').src = pilot.badge; $('pilotBadge').alt = pilot.name;
}
// ---------- pilot select ----------
let sel = null;
function openSelect(fromPause) {
  const ov = $('select'); ov.classList.remove('hidden'); ov.dataset.from = fromPause ? 'pause' : 'menu';
  $('menu').classList.add('hidden'); $('pause').classList.add('hidden');
  $('selBack').textContent = fromPause ? 'Back to the game' : 'Back';
  if (!sel) {
    const cv = $('shipPreview');
    const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(2, devicePixelRatio)); r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xdff3ff, 0x30405a, 1.6));
    const dl = new THREE.DirectionalLight(0xffffff, 2.2); dl.position.set(4, 8, 6); sc.add(dl);
    sc.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
    const cam = new THREE.PerspectiveCamera(32, 2, 0.1, 100); cam.position.set(0, 4.2, 10.5); cam.lookAt(0, 0.4, 0);
    sel = { r, sc, cam, ship: null, id: null, on: true };
    const loop = () => { if (!sel.on) return; requestAnimationFrame(loop);
      const w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== Math.round(w * r.getPixelRatio()) || cv.height !== Math.round(h * r.getPixelRatio())) { r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
      if (sel.ship) { const tt = performance.now() / 1000; sel.ship.group.rotation.y = 0; sel.ship.group.position.y = Math.sin(tt * 2) * 0.12;
        sel.ship.lights.forEach((l, i) => l.material.color.setHSL(sel.ship.hue, 1, 0.5 + 0.2 * Math.sin(tt * 6 + i))); }
      r.render(sc, cam); };
    sel.loop = loop;
    const grid = $('pilotGrid');
    for (const p of PILOTS) {
      const b = document.createElement('button'); b.className = 'pilot'; b.dataset.id = p.id; b.setAttribute('aria-pressed', 'false');
      b.innerHTML = `<img src="${p.portrait}" alt="" width="256" height="256" /><span class="pname"></span><span class="pship"></span>`;
      b.querySelector('.pname').textContent = p.name; b.querySelector('.pship').textContent = p.ship;
      b.addEventListener('click', () => pickPilot(p.id)); grid.append(b);
    }
  } else if (!sel.on) { sel.on = true; sel.loop(); }
  if (sel.on && !sel.started) { sel.started = true; sel.loop(); }
  pickPilot(pilot.id);
}
function pickPilot(id) {
  const p = pilotById(id); sel.id = p.id;
  document.querySelectorAll('#pilotGrid .pilot').forEach((b) => { const on = b.dataset.id === p.id; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  if (sel.ship) disposeShip(sel.ship);
  sel.ship = buildShip(p.id, 1); sel.sc.add(sel.ship.group);
  sel.ship.beam.visible = false; sel.ship.group.children.forEach((o) => { if (o.isPointLight) o.intensity = 3; if (o.userData.glow) o.visible = false; });
  sel.ship.group.traverse((o) => { if (o.material?.isMeshStandardMaterial) o.material.envMapIntensity = 0.5; });
  $('selName').textContent = `${p.name} flies the ${p.ship}`;
  $('selBlurb').textContent = p.blurb;
  $('selFeel').innerHTML = ''; for (const f of p.feel) { const li = document.createElement('li'); li.textContent = f; $('selFeel').append(li); }
  $('selGo').textContent = `Fly with ${p.name}`;
}
function closeSelect() { $('select').classList.add('hidden'); if (sel) sel.on = false; }
$('selGo').addEventListener('click', () => {
  const fromPause = $('select').dataset.from === 'pause';
  setPilot(sel.id); closeSelect();
  if (fromPause) togglePause(false); else startGame();
});
$('selBack').addEventListener('click', () => {
  const fromPause = $('select').dataset.from === 'pause'; closeSelect();
  if (fromPause) $('pause').classList.remove('hidden'); else $('menu').classList.remove('hidden');
});
$('changePilotBtn').addEventListener('click', () => openSelect(true));
function startGame() {
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden');
  if (isTouch || params.has('touch')) $('touch').classList.remove('hidden');
  state.running = true; clock.getDelta();
}
$('startBtn').addEventListener('click', () => openSelect(false));
setPilot(pilot.id);
boot().catch((e) => { console.error(e); $('loading').textContent = 'Could not load terrain, please reload'; });
frame();
