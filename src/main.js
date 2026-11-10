import { BOOST, ease, advanceSpeed } from './flight-speed.js';
import { formatDistance, approachHint, createGameAudio, soundPreference } from './delivery-feedback.js';
import { createCdPlayer, musicPreference, normalizeTracks } from './cd-player.js';
import { glyph, gaugeFraction, trackSeed, waveBars } from './alien-ui.js';
import { cutscenePreference, cutsceneBeats, orbitOffset, countUp, createCutsceneClock, coinPath, CLIP_DURATION, CLIP_DURATION_PICKUP } from './cutscene.js';
import { createArrivalFx } from './arrival-fx.js';
import { normalizeClips, pickClip, shouldPlayClip, CLIP_HOLD_AT, CLIP_START_TIMEOUT, CLIP_MAX_SECONDS } from './clips.js';
import { CAM_CHASE, CAM_COCKPIT, cameraPreference, nextCameraMode, camBlendStep, cockpitEyeLocal } from './camera-mode.js';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { decodeHeightPng } from './height-png.js';
import { ChunkStreamer } from './chunks.js';
import { Attractions } from './attractions.js';
import { PILOTS, pilotById, buildShip, disposeShip } from './ships.js';
import { createSky, createOcean, createClouds } from './sky-ocean.js';
import { normalizeDestinations } from './destinations.js';
import { makeOffers, formatEta, formatKm, REROLL_COOLDOWN, TAGS } from './job-offers.js';
import { createRingField } from './ring-field.js';
import { RING_TIERS, RINGS_ENABLED } from './rings.js';
import bundledDestinations from '../public/destinations/destinations.json';

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
  { id: 'hilo',   town: 'Hilo',          lat: 19.7241, lon: -155.0868 },
  { id: 'kona',   town: 'Kailua-Kona',   lat: 19.6400, lon: -155.9969 },
  { id: 'waimea', town: 'Waimea',        lat: 20.0234, lon: -155.6717 },
  { id: 'volcano',town: 'Volcano',       lat: 19.4296, lon: -155.2357 },
  { id: 'pahoa',  town: 'Pahoa',         lat: 19.4970, lon: -154.9453 },
  { id: 'hawi',   town: 'Hawi',          lat: 20.2414, lon: -155.8336 },
];
// Job pickups and dropoffs come from public/destinations/destinations.json (see docs/destinations.md).
// The bundled copy is a fallback if the runtime file can't load.
const destLib = { list: normalizeDestinations(bundledDestinations, (m) => console.warn('[destinations]', m)), lastJob: null };

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

// sky dome: hazy horizon, deep zenith, sun glow (src/sky-ocean.js)
window.__sky = createSky(scene, sun.position);
let ocean = null, clouds = null, cloudVeil = null;

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
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  const mat = new THREE.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 });
  // The low-res whole-island base sinks out of the way wherever high-res chunks fully cover the ground
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCover = { value: COVER };
    sh.vertexShader = 'uniform vec4 uCover;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float dIn = min(min(position.x - uCover.x, uCover.z - position.x), min(position.z - uCover.y, uCover.w - position.z));
      transformed.y -= 6.0 * smoothstep(0.0, 4.0, dIn);`);
  };
  const mesh = new THREE.Mesh(geo, mat); scene.add(mesh);

  // the ocean surface and clouds are built in boot() from src/sky-ocean.js
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
    // Normal blending keeps the job beacon amber or green even far away against bright sky
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide, fog: false }));
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
  camMode: cameraPreference(params.get('cam') || localStorage.getItem('fh_cam')),
  tokens: Number(localStorage.getItem('fh_kdu') || 0),
  delivered: Number(localStorage.getItem('fh_jobs') || 0),
  pos: new THREE.Vector3(), yaw: 0, vel: new THREE.Vector3(), vy: 0, bank: 0,
  job: null, phase: 'pickup', hover: 0, jobStart: 0,
  cut: null, // active arrival cutscene
};
const keys = new Set();
const input = { fwd: 0, turn: 0, up: 0, boost: false };

let ufo, beaconPick, beaconDrop, labelPick, labelDrop, colorCanvas, ringField = null;
const prevPos = new THREE.Vector3();

// KDU rings live on land (or just off the coast) at flyable heights
function randomRingSpot(rand) {
  for (let tries = 0; tries < 40; tries++) {
    const x = (rand() - 0.5) * SIZE * 0.8, z = (rand() - 0.5) * SIZE * 0.8;
    if (elevM(x, z) < 15) continue;
    return { x, y: groundY(x, z) + 2.5 + rand() * 6, z };
  }
  return null;
}

// ---------- jobs: offer board ----------
const board = { open: false, offers: [], cool: 0, lastKeys: new Set() };
function acceptOffer(o) {
  if (!o) return;
  const from = { ...o.from, w: toWorld(o.from.lat, o.from.lon) };
  const to = { ...o.to, w: toWorld(o.to.lat, o.to.lon) };
  state.job = { from, to, pkg: o.pkg, km: o.legKm, reward: o.pay, tags: o.tags };
  state.phase = 'pickup'; state.hover = 0;
  placeBeacon(beaconPick, labelPick, from, `Pick up: ${from.name}`, '#ffc46b');
  placeBeacon(beaconDrop, labelDrop, to, `Deliver: ${to.name}`, '#7dffb0');
  beaconDrop.visible = labelDrop.visible = false;
  beaconPick.visible = labelPick.visible = true;
  ringField?.seedRoute([{ x: state.pos.x, z: state.pos.z }, { x: from.w.x, z: from.w.y }, { x: to.w.x, z: to.w.y }]);
  closeJobBoard();
  updateMissionText();
  gameAudio.pickup();
}
function clearJob() {
  state.job = null; state.hover = 0;
  if (beaconPick) beaconPick.visible = labelPick.visible = beaconDrop.visible = labelDrop.visible = false;
  ringField?.clearRoute();
  updateMissionText();
}
function openJobBoard({ reroll = false } = {}) {
  if (!state.running) return;
  const here = fromWorld(state.pos.x, state.pos.z);
  board.offers = makeOffers(destLib.list, here, Math.random, { avoid: reroll ? board.lastKeys : new Set() });
  board.lastKeys = new Set(board.offers.map((o) => o.key));
  board.open = true; resetHeldControls();
  renderJobBoard();
  $('jobBoard').classList.remove('hidden'); document.body.classList.add('jobboard');
  updateMissionText();
}
function closeJobBoard() { board.open = false; $('jobBoard').classList.add('hidden'); document.body.classList.remove('jobboard'); }
function rerollJobs() {
  if (!board.open || board.cool > 0 || state.paused) return;
  board.cool = REROLL_COOLDOWN; openJobBoard({ reroll: true });
}
function renderJobBoard() {
  const wrap = $('jbCards'); wrap.innerHTML = '';
  if (!board.offers.length) { wrap.textContent = 'No jobs right now. Add places to public/destinations/destinations.json'; return; }
  for (const o of board.offers) {
    const b = document.createElement('button'); b.className = 'jb-card'; b.dataset.slot = o.slot;
    if (o.tags.length) b.classList.add(`tag-${o.tags[0]}`);
    const tag = o.tags.map((t) => `<span class="jb-tag ${t}">${TAGS[t].label} +${Math.round((TAGS[t].mult - 1) * 100)}%</span>`).join('');
    b.innerHTML = `<span class="jb-key">${o.slot}</span>
      <span class="jb-pay">${glyph('kdu')}<b></b><small>KDU</small></span>
      <span class="jb-route"><span class="jb-stop pick"><b></b><i></i></span>${glyph('next', 'jb-to')}<span class="jb-stop drop"><b></b><i></i></span></span>
      <span class="jb-meta"><span class="jb-km"></span><span class="jb-eta"></span><span class="jb-dead"></span></span>
      <span class="jb-pkg"></span>${tag}`;
    b.querySelector('.jb-pay b').textContent = o.pay.toLocaleString();
    const [p, d] = b.querySelectorAll('.jb-stop');
    p.querySelector('b').textContent = o.from.name; p.querySelector('i').textContent = o.from.town || '';
    d.querySelector('b').textContent = o.to.name; d.querySelector('i').textContent = o.to.town || '';
    b.querySelector('.jb-km').textContent = formatKm(o.totalKm);
    b.querySelector('.jb-eta').textContent = formatEta(o.etaSec);
    b.querySelector('.jb-dead').textContent = `${formatKm(o.deadheadKm)} to pickup`;
    b.querySelector('.jb-pkg').textContent = o.pkg;
    b.setAttribute('aria-label', `Job ${o.slot}: ${o.pkg} from ${o.from.name} to ${o.to.name}, ${formatKm(o.totalKm)}, ${o.pay} KDU${o.tags.length ? `, ${o.tags.join(', ')}` : ''}`);
    b.addEventListener('click', () => { if (!state.paused) { unlockAudio(); acceptOffer(o); } });
    wrap.append(b);
  }
}
async function loadDestinations() {
  const url = (params.has('debug') && params.get('dest')) || '/destinations/destinations.json';
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = normalizeDestinations(await res.json(), (m) => console.warn('[destinations]', m));
    if (list.length >= 2) destLib.list = list;
    else console.warn('[destinations] fewer than two valid entries in', url, '- using the bundled list');
  } catch (e) { console.warn('[destinations] could not load', url, '- using the bundled list', e); }
}
function placeBeacon(b, label, t, text, color) {
  seat(b, t.w.x, t.w.y, 0);
  const old = label.material.map; const nl = makeLabel(text, color);
  label.material.map = nl.material.map; label.userData.aspect = nl.userData.aspect; old && old.dispose();
  label.scale.set(label.userData.aspect * 2.2, 2.2, 1);
  seat(label, t.w.x, t.w.y, 9);
}
function target() { return state.job ? (state.phase === 'pickup' ? state.job.from : state.job.to) : null; }
const $ = (id) => document.getElementById(id);
const gameAudio = createGameAudio({
  AudioContext: window.AudioContext || window.webkitAudioContext,
  enabled: soundPreference.enabled(localStorage.getItem('fh_sound')),
  volume: soundPreference.volume(localStorage.getItem('fh_volume')),
});
const soundButton = $('soundBtn');
const volumeSlider = $('volumeSlider');
function updateSoundButton() {
  const on = gameAudio.isEnabled();
  soundButton.setAttribute('aria-pressed', String(on));
  soundButton.setAttribute('aria-label', `Engine sound ${on ? 'on' : 'off'}`);
  soundButton.classList.toggle('off', !on);
  volumeSlider.disabled = !on;
  volumeSlider.value = String(Math.round(gameAudio.getVolume() * 100));
  $('volumeLabel').textContent = `Volume ${Math.round(gameAudio.getVolume() * 100)}%`;
}
updateSoundButton();
soundButton.addEventListener('click', () => {
  const on = !gameAudio.isEnabled();
  localStorage.setItem('fh_sound', on ? 'on' : 'off');
  gameAudio.setEnabled(on); updateSoundButton();
});
volumeSlider.addEventListener('input', () => {
  const v = Number(volumeSlider.value) / 100;
  localStorage.setItem('fh_volume', String(v));
  gameAudio.setVolume(v); updateSoundButton();
});
// Unlock only on deliberate play/resume gestures, never from a timer.
const unlockAudio = () => gameAudio.unlock();
for (const id of ['startBtn', 'selGo', 'resumeBtn']) {
  $(id).addEventListener('click', unlockAudio);
  $(id).addEventListener('pointerdown', unlockAudio);
}
addEventListener('keydown', (e) => {
  if (e.code === 'Enter' || e.code === 'Space') unlockAudio();
}, { once: false });

// ---------- ShockBot CD player ----------
const musicAudio = new Audio();
musicAudio.preload = 'metadata';
const cdEls = {
  root: $('cdPlayer'),
  disc: $('cdDisc'),
  title: $('cdTitle'),
  play: $('cdPlay'),
  prev: $('cdPrev'),
  next: $('cdNext'),
  vol: $('cdVol'),
  volLabel: $('cdVolLabel'),
  pips: $('cdPips'),
  wave: $('cdWave'),
};
let syncCdUi = (s = {}) => {};
const waveState = { playing: false, seed: 0, energy: 1, col: '', colAt: -9 };
const cdPlayer = createCdPlayer({
  audio: musicAudio,
  tracks: [],
  enabled: musicPreference.enabled(localStorage.getItem('fh_music')),
  volume: musicPreference.volume(localStorage.getItem('fh_music_vol')),
  onChange: (s) => syncCdUi(s),
});
syncCdUi = (s = {}) => {
  const track = s.track || cdPlayer.getTrack();
  const playing = s.playing ?? cdPlayer.isPlaying();
  const enabled = s.enabled ?? cdPlayer.isEnabled();
  const volume = s.volume ?? cdPlayer.getVolume();
  if (cdEls.title) cdEls.title.textContent = track?.title || 'ShockBot';
  if (cdEls.disc) cdEls.disc.title = track?.title || 'ShockBot';
  if (cdEls.play) {
    const want = playing ? 'pause' : 'play';
    if (cdEls.play.dataset.glyph !== want) { cdEls.play.innerHTML = glyph(want); cdEls.play.dataset.glyph = want; }
    cdEls.play.setAttribute('aria-pressed', String(!!playing));
    cdEls.play.setAttribute('aria-label', playing ? 'Pause music' : 'Play music');
    cdEls.play.title = playing ? 'Pause music' : 'Play music';
  }
  if (cdEls.disc) cdEls.disc.classList.toggle('spin', !!playing);
  if (cdEls.root) cdEls.root.classList.toggle('playing', !!playing);
  const count = s.count ?? cdPlayer.getTracks().length;
  const idx = s.index ?? cdPlayer.getIndex();
  if (cdEls.pips && cdEls.pips.childElementCount !== count) {
    cdEls.pips.innerHTML = '';
    for (let i = 0; i < count; i++) cdEls.pips.append(document.createElement('i'));
  }
  if (cdEls.pips) [...cdEls.pips.children].forEach((el, i) => el.classList.toggle('on', i === idx));
  waveState.playing = !!playing;
  waveState.seed = trackSeed(track?.id || '');
  waveState.energy = enabled ? 0.55 + volume * 0.45 : 0.2;
  if (cdEls.vol) {
    cdEls.vol.value = String(Math.round(volume * 100));
    cdEls.vol.disabled = !enabled;
  }
  if (cdEls.volLabel) cdEls.volLabel.textContent = enabled ? `Music ${Math.round(volume * 100)}%` : 'Music off';
  if (cdEls.root) cdEls.root.hidden = !(s.count ?? cdPlayer.getTracks().length);
}
syncCdUi();
// Holographic waveform for the sound crystal. A procedural pulse (no analyser
// on the music element, so iOS playback never depends on an AudioContext).
function drawWave(t) {
  const cv = cdEls.wave; if (!cv || cdEls.root?.hidden) return;
  if (!cv.offsetParent) return; // hidden by layout
  const ctx = cv.getContext('2d'); const w = cv.width, h = cv.height;
  ctx.clearRect(0, 0, w, h);
  const bars = waveBars(t, { count: 16, seed: waveState.seed, playing: waveState.playing, energy: waveState.energy });
  if (!waveState.col || t - waveState.colAt > 1) { waveState.col = getComputedStyle(cdEls.root).getPropertyValue('--glow').trim() || '#1ec8ff'; waveState.colAt = t; }
  const col = waveState.col;
  const bw = w / bars.length;
  ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 6;
  bars.forEach((v, i) => {
    const bh = Math.max(2, v * (h - 6));
    const x = i * bw + bw * 0.18, y = (h - bh) / 2;
    ctx.globalAlpha = 0.45 + v * 0.55;
    ctx.beginPath(); // angled shard bars
    ctx.moveTo(x + bw * 0.16, y); ctx.lineTo(x + bw * 0.64, y); ctx.lineTo(x + bw * 0.48, y + bh); ctx.lineTo(x, y + bh);
    ctx.closePath(); ctx.fill();
  });
  ctx.globalAlpha = 0.35; ctx.shadowBlur = 0; ctx.fillRect(0, h / 2 - 0.5, w, 1);
  ctx.globalAlpha = 1;
}
function isNarrowHud() { return matchMedia('(max-width: 640px)').matches; }
function setCdOpen(open) {
  if (!cdEls.root) return;
  cdEls.root.classList.toggle('open', !!open);
  if (cdEls.disc) {
    cdEls.disc.setAttribute('aria-expanded', String(!!open));
    cdEls.disc.setAttribute('aria-label', open ? 'Collapse sound crystal' : 'Open sound crystal');
  }
}
cdEls.disc?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!isNarrowHud()) {
    // Desktop: disc toggles play
    if (!cdPlayer.isEnabled()) { cdPlayer.setEnabled(true); localStorage.setItem('fh_music', 'on'); }
    cdPlayer.toggle(); unlockAudio(); cdPlayer.unlock();
    return;
  }
  setCdOpen(!cdEls.root.classList.contains('open'));
});
cdEls.play?.addEventListener('click', () => {
  if (!cdPlayer.isEnabled()) {
    cdPlayer.setEnabled(true);
    localStorage.setItem('fh_music', 'on');
  }
  cdPlayer.toggle();
  unlockAudio();
  cdPlayer.unlock();
});
cdEls.prev?.addEventListener('click', () => { cdPlayer.prev(); cdPlayer.unlock(); unlockAudio(); });
cdEls.next?.addEventListener('click', () => { cdPlayer.next(); cdPlayer.unlock(); unlockAudio(); });
cdEls.vol?.addEventListener('input', () => {
  const v = Number(cdEls.vol.value) / 100;
  localStorage.setItem('fh_music_vol', String(v));
  if (v <= 0) {
    localStorage.setItem('fh_music', 'off');
    cdPlayer.setEnabled(false);
  } else {
    localStorage.setItem('fh_music', 'on');
    if (!cdPlayer.isEnabled()) cdPlayer.setEnabled(true);
    cdPlayer.setVolume(v);
  }
  syncCdUi();
});
async function loadAlbum() {
  try {
    const res = await fetch('/music/tracks.json');
    if (!res.ok) return;
    const data = await res.json();
    cdPlayer.setTracks(normalizeTracks(data));
    syncCdUi();
  } catch { /* Music is optional. */ }
}
loadAlbum();
const unlockMusic = () => { unlockAudio(); cdPlayer.unlock(); };
for (const id of ['startBtn', 'selGo', 'resumeBtn']) {
  $(id).addEventListener('click', unlockMusic);
  $(id).addEventListener('pointerdown', unlockMusic);
}
function deliveryReward(amount, bonus) {
  const el = $('deliveryReward');
  el.textContent = `Delivered  +${amount} KDU${bonus ? ` (${bonus} speed bonus)` : ''}`;
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  clearTimeout(deliveryReward.timer);
  deliveryReward.timer = setTimeout(() => el.classList.remove('on'), 3000);
  gameAudio.complete();
}
function updateMissionText() {
  const j = state.job, m = $('mission');
  if (!j) {
    m.className = 'idle';
    $('missionStep').textContent = 'No job yet';
    $('missionTarget').textContent = 'Pick your next job';
    $('cargo').textContent = ''; $('dist').textContent = ''; $('missionHint').textContent = 'Choose one of four offers';
    return;
  }
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
// "+N" pops where a ring was crossed (pooled DOM nodes)
const _popV = new THREE.Vector3();
function ringPop(h, gain) {
  const layer = $('ringPops'); if (!layer) return;
  let el = [...layer.children].find((e) => !e.classList.contains('on'));
  if (!el) { if (layer.children.length >= 8) el = layer.firstElementChild; else { el = document.createElement('div'); el.className = 'ring-pop'; layer.append(el); } }
  _popV.set(h.x, h.y, h.z).project(camera);
  const onScreen = _popV.z < 1 && Math.abs(_popV.x) < 1.1 && Math.abs(_popV.y) < 1.1;
  const x = onScreen ? (_popV.x + 1) / 2 * innerWidth : innerWidth / 2, y = onScreen ? (1 - _popV.y) / 2 * innerHeight : innerHeight * 0.42;
  el.className = `ring-pop tier-${h.tier.id}`;
  el.innerHTML = `${glyph('kdu')}<b>+${gain}</b>${h.combo > 1 ? `<i>x${h.combo}</i>` : ''}${h.chainBonus ? `<em>Chain +${h.chainBonus}</em>` : ''}`;
  // lift it above the disc so it never sits on top of the ship
  el.style.left = `${Math.max(60, Math.min(innerWidth - 60, x))}px`; el.style.top = `${Math.max(80, Math.min(innerHeight - 80, Math.min(y, innerHeight * 0.5) - innerHeight * 0.12))}px`;
  void el.offsetWidth; el.classList.add('on');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 1100);
}
function updateRerollUi() {
  const b = $('jbReroll'); if (!b) return;
  b.disabled = board.cool > 0;
  b.style.setProperty('--cool', (board.cool / REROLL_COOLDOWN).toFixed(3));
  $('jbCool').textContent = board.cool > 0 ? `${Math.ceil(board.cool)}` : '';
}
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 1800); }
function discoverNote(a, bonus) {
  const el = $('discover'); el.innerHTML = '';
  const b = document.createElement('b'); b.textContent = a.name;
  el.append('New discovery ', b, ` +${bonus} KDU`); el.classList.add('on');
  clearTimeout(discoverNote._t); discoverNote._t = setTimeout(() => el.classList.remove('on'), 3200);
  gameAudio.discover();
}
function addTokens(n, { quiet = false } = {}) {
  state.tokens += n; localStorage.setItem('fh_kdu', state.tokens);
  if (quiet) return;
  $('tokenCount').textContent = state.tokens.toLocaleString();
  bumpTokens();
}
function bumpTokens() { const el = $('tokens'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

// ---------- arrival cutscenes ----------
let arrivalFx = null;
let cutscenesOn = cutscenePreference.enabled(localStorage.getItem('fh_cutscenes'));
const cutBtn = $('cutBtn');
function updateCutButton() {
  if (!cutBtn) return;
  cutBtn.setAttribute('aria-pressed', String(cutscenesOn));
  cutBtn.setAttribute('aria-label', `Arrival scenes ${cutscenesOn ? 'on' : 'off'}`);
  cutBtn.classList.toggle('off', !cutscenesOn);
  const lab = $('cutLabel'); if (lab) lab.textContent = `Arrival scenes ${cutscenesOn ? 'on' : 'off'}`;
}
updateCutButton();
cutBtn?.addEventListener('click', () => {
  cutscenesOn = !cutscenesOn;
  localStorage.setItem('fh_cutscenes', cutscenesOn ? 'on' : 'off');
  updateCutButton();
});
function resetHeldControls() {
  keys.clear();
  for (const k of Object.keys(held)) held[k] = false;
  document.querySelectorAll('.tbtn.active').forEach((b) => b.classList.remove('active'));
  if (stick.id !== null) { try { stickZone.releasePointerCapture(stick.id); } catch { /* gone */ } }
  stick.id = null; stick.x = stick.y = 0; knob.style.transform = '';
  stickEl.classList.remove('live'); stickEl.style.left = stickEl.style.top = stickEl.style.bottom = '';
}
/** Plays after a pickup or delivery. Returns false when scenes are off. */
// ---------- cutaway clips (live action, shown in arrival scenes; see AGENTS.md) ----------
const clipEls = { root: $('clipFx'), video: $('clipVideo'), sound: $('clipSound') };
const clipLib = { list: [], lastId: localStorage.getItem('fh_last_clip') || '' };
let clipPlaying = false; // mutes the engine hum while a clip is on screen
async function loadClips() {
  // ?debug&clips=/path/clips.json points at a test-only manifest
  const url = (params.has('debug') && params.get('clips')) || '/clips/clips.json';
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (res.ok) clipLib.list = normalizeClips(await res.json());
  } catch { /* clips are optional */ }
}
loadClips();
function prepareClip(c) {
  const v = clipEls.video; if (!v) return;
  v.muted = false; v.preload = 'metadata';
  v.src = c.clip.clip.src; // lazy: the file is only requested once a delivery picks it
  try { v.load(); } catch { /* ignore */ }
  v.onended = () => finishClip(c, 'ended');
  v.onerror = () => finishClip(c, 'error');
}
function showClip(c) {
  const v = clipEls.video, k = c.clip;
  k.phase = 'starting'; k.wait = 0;
  clipEls.root.hidden = false; clipEls.root.classList.remove('closing'); clipEls.sound.hidden = true;
  document.body.classList.add('clip-on');
  cdPlayer.duck(true); clipPlaying = true; gameAudio.setMuted(true);
  clipLib.lastId = k.clip.id; localStorage.setItem('fh_last_clip', k.clip.id);
  const playing = () => { if (k.phase === 'starting') { k.phase = 'playing'; k.elapsed = 0; } };
  const attempt = v.play?.();
  if (!attempt?.then) { playing(); return; }
  attempt.then(playing).catch((err) => {
    if (k.phase !== 'starting') return;
    if (err?.name === 'NotAllowedError') {
      // sound blocked: play muted and offer a tap-for-sound glyph
      v.muted = true; clipEls.sound.hidden = false;
      v.play().then(playing).catch(() => finishClip(c, 'blocked'));
    } else finishClip(c, 'error');
  });
}
function finishClip(c, why) {
  const k = c?.clip; if (!k || k.phase === 'done') return;
  const wasShown = k.phase !== 'loading';
  k.phase = 'done'; k.why = why;
  const v = clipEls.video;
  v.onended = v.onerror = null;
  try { v.pause(); } catch { /* ignore */ }
  if (wasShown) {
    clipEls.root.classList.add('closing');
    setTimeout(() => { if (clipEls.root.classList.contains('closing')) { clipEls.root.hidden = true; clipEls.root.classList.remove('closing'); } }, 260);
  }
  setTimeout(() => { if (!state.cut?.clip || state.cut.clip.phase === 'done') { v.removeAttribute('src'); try { v.load(); } catch { /* ignore */ } } }, 300);
  clipEls.sound.hidden = true;
  document.body.classList.remove('clip-on');
  if (clipPlaying) { clipPlaying = false; cdPlayer.duck(false); gameAudio.setMuted(state.paused || document.hidden); }
  c.clock.release();
}
function tickClip(c, dt) {
  const k = c.clip; if (!k || k.phase === 'done') return;
  if (k.phase === 'loading' && c.clock.holding) showClip(c);
  else if (k.phase === 'starting') { k.wait += dt; if (k.wait > CLIP_START_TIMEOUT) finishClip(c, 'timeout'); }
  else if (k.phase === 'playing') { k.elapsed += dt; if (k.elapsed > CLIP_MAX_SECONDS) finishClip(c, 'cap'); }
}
clipEls.sound?.addEventListener('click', () => {
  clipEls.video.muted = false; clipEls.sound.hidden = true;
  clipEls.video.play?.()?.catch?.(() => {});
});

function startCutscene(kind, { fromTokens = state.tokens, toTokens = state.tokens, onEnd, bizId = '' } = {}) {
  if (!cutscenesOn || !arrivalFx) return false;
  if (state.cut) endCutscene();
  const az = Math.atan2(camera.position.x - state.pos.x, camera.position.z - state.pos.z);
  const withClip = shouldPlayClip({ kind, scenesOn: cutscenesOn, clips: clipLib.list, bizId });
  const clock = createCutsceneClock(kind, withClip ? (kind === 'delivery' ? CLIP_DURATION : CLIP_DURATION_PICKUP) : undefined);
  state.cut = {
    kind, clock, fromTokens, toTokens, onEnd, beatOpts: { clip: withClip },
    startAngle: az, sweep: (Math.random() < 0.5 ? -1 : 1) * 1.9, coins: [],
    clip: null,
  };
  if (withClip) {
    state.cut.clip = { clip: pickClip(clipLib.list, clipLib.lastId, Math.random, kind, bizId), phase: 'loading', wait: 0, elapsed: 0 };
    clock.holdAt(CLIP_HOLD_AT);
    prepareClip(state.cut);
  }
  resetHeldControls();
  arrivalFx.start(kind, pilot.id);
  document.body.classList.add('cutscene');
  if (kind === 'delivery') {
    const layer = $('coinFx');
    for (let i = 0; i < 9; i++) {
      const c = document.createElement('div'); c.className = 'fx-coin'; c.innerHTML = glyph('kdu');
      layer.append(c); state.cut.coins.push(c);
    }
  }
  return true;
}
function endCutscene() {
  const c = state.cut; if (!c) return;
  finishClip(c, 'end');
  state.cut = null;
  arrivalFx?.stop();
  c.coins.forEach((el) => el.remove());
  document.body.classList.remove('cutscene');
  if (c.kind === 'delivery') { $('tokenCount').textContent = state.tokens.toLocaleString(); bumpTokens(); }
  resetHeldControls();
  c.onEnd?.();
}
function skipCutscene() {
  const c = state.cut; if (!c || state.paused) return;
  // First skip during a clip ends the clip so the tip coins still fly; next skip ends the scene
  if (c.clip && c.clip.phase !== 'done' && c.clip.phase !== 'loading') { finishClip(c, 'skip'); return; }
  finishClip(c, 'skip');
  c.clock.skip();
}
const _proj = new THREE.Vector3();
function tickCutscene(dt, t) {
  const c = state.cut; if (!c) return;
  const done = c.clock.tick(dt);
  tickClip(c, dt);
  const b = cutsceneBeats(c.kind, c.clock.t, c.clock.dur, c.beatOpts);
  arrivalFx.update(b, ufo.group.position, groundY(state.pos.x, state.pos.z), t);
  if (c.kind === 'delivery') {
    // KDU coins arc from the disc into the counter while it counts up
    _proj.copy(state.pos).project(camera);
    const from = [(_proj.x + 1) / 2 * innerWidth, (1 - _proj.y) / 2 * innerHeight];
    const r = $('tokens').getBoundingClientRect();
    const to = [r.left + 22, r.top + r.height / 2];
    c.coins.forEach((el, i) => {
      const p = Math.max(0, Math.min(1, (b.coins - i * 0.055) / (1 - 0.055 * (c.coins.length - 1))));
      const [x, y, s] = coinPath(p, [from[0] + (i % 3 - 1) * 14, from[1] + 10], to, 90 + (i % 4) * 25);
      el.style.opacity = p > 0 && p < 1 ? '1' : '0';
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${s}) rotate(${p * 540}deg)`;
    });
    const shown = countUp(c.fromTokens, c.toTokens, b.coins);
    const el = $('tokenCount'); const txt = shown.toLocaleString();
    if (el.textContent !== txt) { el.textContent = txt; if (b.coins > 0) gameAudio.coinTick?.(); }
  }
  if (done) endCutscene();
}

// ---------- input ----------
addEventListener('keydown', (e) => {
  if (state.cut && !state.paused && e.code !== 'KeyP' && e.code !== 'Escape') { skipCutscene(); return; }
  if (board.open && !state.paused) {
    const n = /^(Digit|Numpad)([1-4])$/.exec(e.code);
    if (n) { e.preventDefault(); unlockAudio(); acceptOffer(board.offers[Number(n[2]) - 1]); return; }
    if (e.code === 'KeyR') { e.preventDefault(); rerollJobs(); return; }
  }
  keys.add(e.code);
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (e.code === 'KeyM') {
    const on = !cdPlayer.isEnabled();
    localStorage.setItem('fh_music', on ? 'on' : 'off');
    cdPlayer.setEnabled(on);
    if (on) { unlockAudio(); cdPlayer.unlock(); cdPlayer.play(); }
    syncCdUi();
  }
  if (e.code === 'Comma') { cdPlayer.prev(); cdPlayer.unlock(); unlockAudio(); }
  if (e.code === 'Period') { cdPlayer.next(); cdPlayer.unlock(); unlockAudio(); }
  if (e.code === 'KeyC') { e.preventDefault(); toggleCamera(); }
});
addEventListener('keyup', (e) => keys.delete(e.code));
// Tap or click anywhere skips an arrival scene (but not the pause rail or menus)
addEventListener('pointerdown', (e) => {
  if (!state.cut || state.paused) return;
  if (e.target.closest?.('#hudRail, .overlay, #clipSound')) return;
  e.preventDefault(); skipCutscene();
}, { capture: true });
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
  let up = (k('Space') || k('KeyE') || k('KeyR') ? 1 : 0) - (k('KeyQ') || k('KeyF') || k('ControlLeft') ? 1 : 0);
  if (stick.id !== null) { const [sx, sy] = shapeStick(stick.x, stick.y); fwd = -sy; turn = -sx; }
  up += (held.up ? 1 : 0) - (held.down ? 1 : 0);
  input.fwd = Math.max(-1, Math.min(1, fwd)); input.turn = Math.max(-1, Math.min(1, turn)); input.up = Math.max(-1, Math.min(1, up));
  input.boost = k('ShiftLeft') || k('ShiftRight') || held.boost;
}

function togglePause(force) {
  if (!state.running || !$('select').classList.contains('hidden')) return;
  state.paused = force !== undefined ? force : !state.paused;
  $('pause').classList.toggle('hidden', !state.paused);
  const k = state.cut?.clip;
  if (k && (k.phase === 'playing' || k.phase === 'starting')) {
    if (state.paused) { try { clipEls.video.pause(); } catch { /* ignore */ } }
    else clipEls.video.play?.()?.catch?.(() => {});
  }
  gameAudio.setMuted(state.paused || document.hidden || clipPlaying);
  cdPlayer.setGamePaused(state.paused || document.hidden);
}
$('pauseBtn').addEventListener('click', () => togglePause(true));
$('camBtn')?.addEventListener('click', () => toggleCamera());
$('resumeBtn').addEventListener('click', () => togglePause(false));
$('newJobBtn').addEventListener('click', () => { if (state.cut) endCutscene(); clearJob(); togglePause(false); openJobBoard(); });
$('jbReroll').addEventListener('click', () => rerollJobs());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) togglePause(true);
  gameAudio.setMuted(state.paused || document.hidden);
  cdPlayer.setGamePaused(state.paused || document.hidden);
});

// ---------- minimap ----------
const mm = $('minimap'), mctx = mm.getContext('2d');
let mmBase;
function drawMinimap() {
  const map = document.getElementById('minimap') || mm;
  if (!map || !mmBase || !SIZE) return;
  const ctx = map.getContext('2d', { alpha: false }) || mctx;
  if (!ctx) return;
  const W = map.width > 0 ? map.width : 160;
  if (map.width !== W) map.width = W;
  if (map.height !== W) map.height = W;
  ctx.fillStyle = '#0a2540';
  ctx.fillRect(0, 0, W, W);
  ctx.drawImage(mmBase, 0, 0, W, W);
  const toMM = (x, z) => [(x / SIZE + 0.5) * W, (z / SIZE + 0.5) * W];
  for (const t of TOWNS) { const [a, b] = toMM(t.w.x, t.w.y); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(a - 1.5, b - 1.5, 3, 3); }
  const tg = target();
  if (tg) {
    const [tx, tz] = toMM(tg.w.x, tg.w.y);
    ctx.fillStyle = state.phase === 'pickup' ? '#ffc46b' : '#7dffb0';
    ctx.beginPath(); ctx.arc(tx, tz, 5, 0, Math.PI * 2); ctx.fill();
  }
  const [ux, uz] = toMM(state.pos.x, state.pos.z);
  ctx.save(); ctx.translate(ux, uz); ctx.rotate(-state.yaw);
  ctx.fillStyle = '#1ec8ff'; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
  ctx.restore();
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
applyCamHud(); // after pilot exists (calling it earlier hits the let before it is set in dev builds)
function step(dt, t) {
  readInput();
  prevPos.copy(state.pos);
  if (board.cool > 0) { board.cool = Math.max(0, board.cool - dt); updateRerollUi(); }
  if (state.cut || board.open) { input.fwd = input.turn = input.up = 0; input.boost = false; }
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
  if (state.cut || board.open) { state.speed = ease(state.speed, 0, 7, dt); state.vy = ease(state.vy, 0, 7, dt); state.vel.copy(fwdDir).multiplyScalar(state.speed); }
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
  let dx = tg ? tg.w.x - state.pos.x : 1e9, dz = tg ? tg.w.y - state.pos.z : 1e9;
  const horiz = Math.hypot(dx, dz);
  const agl = tg ? state.pos.y - groundY(tg.w.x, tg.w.y) : 1e9;
  const inZone = !!tg && horiz < 3.2 && agl < 8;
  const beamOn = inZone && state.vel.length() < 9 && !state.cut;
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
      const town = state.job.to.town || state.job.to.name;
      gameAudio.pickup();
      updateMissionText();
      if (!startCutscene('pickup', { bizId: state.job.from.id, onEnd: () => toast(`Package on board\nFly to ${town}`) })) toast(`Package on board\nFly to ${town}`);
    } else {
      const secs = (performance.now() - state.jobStart) / 1000;
      const par = state.job.km * 1000 / UNIT_M / 12; // seconds at a relaxed pace
      const bonus = Math.max(0, Math.round((par - secs) / par * state.job.reward * 0.6));
      const before = state.tokens, gain = state.job.reward + bonus;
      const cine = cutscenesOn && !!arrivalFx;
      addTokens(gain, { quiet: cine });
      state.delivered++; localStorage.setItem('fh_jobs', state.delivered);
      deliveryReward(gain, bonus);
      const dropId = state.job.to.id; // clearJob() drops the job, the clip belongs to this drop-off
      clearJob();
      if (!(cine && startCutscene('delivery', { fromTokens: before, toTokens: state.tokens, bizId: dropId, onEnd: () => openJobBoard() }))) openJobBoard();
    }
  }
  // KDU rings: fly through the middle
  if (ringField) {
    const hits = ringField.update(dt, t, prevPos, state.pos, state.yaw, { collect: !state.cut });
    for (const h of hits) {
      const gain = h.value + h.chainBonus;
      addTokens(gain);
      gameAudio.ring(RING_TIERS.indexOf(h.tier), h.combo);
      ringPop(h, gain);
    }
  }
  // beacon animation
  for (const b of [beaconPick, beaconDrop]) {
    const d = Math.hypot(b.position.x - state.pos.x, b.position.z - state.pos.z);
    b.userData.col.material.opacity = 0.06 + 0.4 * sstep(4, 40, d);
    b.userData.ring.scale.setScalar(1 + 0.08 * Math.sin(t * 4)); b.userData.box.rotation.y += dt;
    b.userData.box.visible = (b === beaconPick && state.phase === 'pickup') || (b === beaconDrop && false);
  }
  // HUD
  tg = target();
  if (!tg) { $('arrow').style.transform = ''; finishHud(); return; }
  dx = tg.w.x - state.pos.x; dz = tg.w.y - state.pos.z;
  const bearing = Math.atan2(dx, dz); // world bearing
  const rel = bearing - Math.atan2(-Math.sin(state.yaw), -Math.cos(state.yaw));
  $('arrow').style.transform = `rotate(${-rel}rad)`;
  $('dist').textContent = formatDistance(haversineKm(fromWorld(state.pos.x, state.pos.z), tg));
  $('missionHint').textContent = approachHint(Math.hypot(dx, dz), state.pos.y - groundY(tg.w.x, tg.w.y), state.vel.length(), state.phase);
  finishHud();
}
function finishHud() {
  $('altVal').textContent = Math.round(Math.max(0, state.pos.y) / VEXAG * UNIT_M).toLocaleString();
  $('spdVal').textContent = Math.round(state.vel.length() * GAME_MPH);
  const altEl = $('alt');
  altEl.style.setProperty('--alt-f', gaugeFraction(state.pos.y / VEXAG * UNIT_M, 4300).toFixed(3));
  altEl.style.setProperty('--spd-f', gaugeFraction(state.vel.length(), BOOST).toFixed(3));
  gameAudio.update({
    speed: state.speed || 0,
    throttle: state.inF || 0,
    boostMix: state.boostMix || 0,
    paused: state.paused || clipPlaying,
    hidden: document.hidden,
  });
  drawMinimap();
}

let camYaw = 0, camH = 0;
const _cinePos = new THREE.Vector3(), _cineLook = new THREE.Vector3();
let camBlend = state.camMode === CAM_COCKPIT ? 1 : 0;
const chasePos = new THREE.Vector3(), cockpitPos = new THREE.Vector3();
const chaseLook = new THREE.Vector3(), cockpitLook = new THREE.Vector3();
const _eyeLocal = new THREE.Vector3(), _lookLocal = new THREE.Vector3();

function setPilotHeadVisible(vis) {
  if (!ufo?.group) return;
  ufo.group.traverse((o) => { if (o.userData?.isPilotHead) o.visible = vis; });
}

function applyCamHud() {
  const cockpit = state.camMode === CAM_COCKPIT;
  document.body.dataset.cam = state.camMode;
  document.body.dataset.pilot = pilot?.id || 'drone';
  const hud = $('hud'); if (hud) hud.dataset.cam = state.camMode;
  const dash = $('dash'); if (dash) dash.setAttribute('aria-hidden', cockpit ? 'false' : 'true');
  const fx = $('cockpitFx'); if (fx) fx.setAttribute('aria-hidden', cockpit ? 'false' : 'true');
  const btn = $('camBtn');
  if (btn) {
    btn.setAttribute('aria-pressed', String(cockpit));
    const g = cockpit ? 'view-out' : 'view-in';
    if (btn.dataset.glyph !== g) { btn.innerHTML = glyph(g); btn.dataset.glyph = g; }
    btn.title = cockpit ? 'Chase camera' : 'Cockpit camera';
    btn.setAttribute('aria-label', cockpit ? 'Switch to chase camera' : 'Switch to cockpit camera');
  }
  const mount = {
    tokens: 'tokens', found: 'found', alt: 'alt',
    mission: 'mission', cd: 'cdPlayer',
  };
  for (const [slot, id] of Object.entries(mount)) {
    const el = $(id); if (!el) continue;
    const host = cockpit ? document.querySelector(`[data-slot="${slot}"]`) : hud;
    if (host && el.parentElement !== host) host.appendChild(el);
  }
  if (cockpit) {
    cdEls.root?.classList.add('open', 'dash-mounted');
    setCdOpen(true);
    const map = $('minimap');
    if (map) {
      const side = isNarrowHud() ? 128 : 160;
      if (map.width !== side) { map.width = side; map.height = side; }
      map.style.width = isNarrowHud() ? '64px' : '108px';
      map.style.height = map.style.width;
    }
    const paint = () => { try { drawMinimap(); } catch { /* waits for terrain */ } };
    paint();
    requestAnimationFrame(paint);
    setTimeout(paint, 300);
    setTimeout(paint, 1000);
  } else {
    cdEls.root?.classList.remove('dash-mounted');
    if (isNarrowHud()) setCdOpen(false);
  }
  setPilotHeadVisible(!cockpit || camBlend < 0.55);
  const wantNear = cockpit ? 0.04 : 0.35;
  if (Math.abs(camera.near - wantNear) > 0.01) {
    camera.near = wantNear; camera.updateProjectionMatrix();
  }
}

function toggleCamera(force) {
  const next = force || nextCameraMode(state.camMode);
  state.camMode = next === CAM_COCKPIT ? CAM_COCKPIT : CAM_CHASE;
  localStorage.setItem('fh_cam', state.camMode);
  applyCamHud();
}

function updateCamera(dt) {
  if (!camInit) { camYaw = state.yaw; camInit = true; }
  let dy = state.yaw - camYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  camYaw += dy * Math.min(1, dt * 10);
  const back = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
  const spd = state.vel.length();
  const portrait = camera.aspect < 1;
  const dist = (portrait ? 7.5 : 5.5) + spd * 0.04, h = (portrait ? 2.2 : 1.6) + spd * 0.015;
  chasePos.copy(state.pos).addScaledVector(back, dist); chasePos.y += h;
  const cg = groundY(chasePos.x, chasePos.z) + 0.4;
  chasePos.y = Math.max(chasePos.y, cg);
  chaseLook.copy(state.pos).addScaledVector(back, -4); chaseLook.y += 0.3;

  let cockpitFov = 64;
  if (ufo?.group) {
    ufo.group.updateMatrixWorld(true);
    const { eye, look, fov } = cockpitEyeLocal(portrait);
    cockpitFov = fov || (portrait ? 78 : 64);
    _eyeLocal.set(eye[0], eye[1], eye[2]).applyMatrix4(ufo.group.matrixWorld);
    _lookLocal.set(look[0], look[1], look[2]).applyMatrix4(ufo.group.matrixWorld);
    cockpitPos.copy(_eyeLocal);
    cockpitLook.copy(_lookLocal);
  } else {
    cockpitPos.copy(state.pos); cockpitPos.y += 0.45;
    cockpitLook.copy(state.pos).addScaledVector(tmp.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw)), 5);
    cockpitLook.y += 0.55;
  }

  camBlend = camBlendStep(camBlend, state.camMode, dt, 5.5);
  camera.position.lerpVectors(chasePos, cockpitPos, camBlend);
  lookAt.lerpVectors(chaseLook, cockpitLook, camBlend);
  const chaseFov = portrait ? 72 : 62;
  let wantFov = chaseFov + (cockpitFov - chaseFov) * camBlend;
  let cineW = 0;
  if (state.cut) {
    // cinematic orbit around the hovering disc, blended over the normal camera
    const c = state.cut, b = cutsceneBeats(c.kind, c.clock.t, c.clock.dur, c.beatOpts);
    const gy = groundY(state.pos.x, state.pos.z), agl = Math.max(0.5, state.pos.y - gy);
    const radius = (4.6 + Math.min(agl, 8) * 0.35) * (portrait ? 1.3 : 1);
    const o = orbitOffset(b.orbit, { startAngle: c.startAngle, sweep: c.sweep, radius, height: 0.3 + Math.min(agl, 8) * 0.1 });
    _cinePos.set(state.pos.x + o[0], state.pos.y + o[1], state.pos.z + o[2]);
    _cinePos.y = Math.max(_cinePos.y, groundY(_cinePos.x, _cinePos.z) + 0.6);
    _cineLook.set(state.pos.x, state.pos.y - Math.min(agl * 0.4, 2), state.pos.z);
    cineW = b.cam;
    camera.position.lerp(_cinePos, cineW);
    lookAt.lerp(_cineLook, cineW);
    wantFov += ((portrait ? 70 : 54) - wantFov) * cineW;
  }
  camera.lookAt(lookAt);
  if (Math.abs(camera.fov - wantFov) > 0.05) { camera.fov = wantFov; camera.updateProjectionMatrix(); }
  setPilotHeadVisible(camBlend < 0.55 || cineW > 0.4);
  document.body.classList.toggle('cine-wide', cineW > 0.4);
  if (window.__sky) window.__sky.position.copy(camera.position);
}

let lastStream = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
  if (attractions && state.running && !state.paused && t - lastAttr > 0.2) { lastAttr = t; attractions.update(state.pos.x, state.pos.z); }
  attractions?.tick(dt);
  if (streamer && state.running && t - lastStream > 0.25) { lastStream = t; streamer.update(state.pos); COVER.copy(streamer.cover); }
  if (state.running && !state.paused) { step(dt, t); tickCutscene(dt, t); updateCamera(dt); }
  else if (state.running) { updateCamera(dt); if (state.camMode === CAM_COCKPIT && mmBase) drawMinimap(); }
  else if (!state.running && ufo) { // attract mode orbit
    const a = t * 0.06; camera.position.set(Math.cos(a) * 650, 160, Math.sin(a) * 650); camera.lookAt(0, 10, 0); window.__sky.position.copy(camera.position);
  }
  if (state.running) drawWave(t);
  ocean?.update(t);
  if (clouds) { const d = clouds.update(dt, camera.position); cloudVeil.style.opacity = (Math.min(1, d * 1.4) * 0.85).toFixed(3); }
  renderer.render(scene, camera);
}

function fitFov() {
  if (state.running && state.camMode === CAM_COCKPIT) return; // updateCamera owns FOV while flying cockpit
  camera.fov = innerWidth < innerHeight ? 72 : 62;
}
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
    fetch('/terrain/base-sat.jpg').then(ok).then((r) => r.blob()).then((b) => createImageBitmap(b)).catch(() => null),
    loadDestinations()]);
  meta = m; N = m.N; SIZE = m.sizeKm * 1000 / UNIT_M;
  H = new Int16Array(N * N); for (let k = 0; k < H.length; k++) H[k] = hb.data[k] - 6000; // stored as meters + 6000
  fixInlandSea();
  for (const t of TOWNS) t.w = toWorld(t.lat, t.lon);
  colorCanvas = buildTerrain(water, satImg);
  ocean = createOcean(scene, { H, N, SIZE, sunDir: sun.position });
  clouds = createClouds(scene, { bounds: { x0: -SIZE / 2, x1: SIZE / 2, z0: -SIZE / 2, z1: SIZE / 2 },
    sample: (x, z) => ({ ...fromWorld(x, z), groundM: elevM(x, z) }), unitM: UNIT_M / VEXAG, isTouch });
  cloudVeil = document.createElement('div'); cloudVeil.className = 'cloud-veil'; canvas.after(cloudVeil);
  mmBase = document.createElement('canvas'); mmBase.width = mmBase.height = 160; mmBase.getContext('2d').drawImage(colorCanvas, 0, 0, 160, 160);
  try { drawMinimap(); } catch { /* HUD may not be mounted yet */ }
  shipEnv = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  ufo = buildShip(pilot.id, UFO_SCALE, shipEnv); scene.add(ufo.group);
  beaconPick = makeBeacon(0xffa94d); beaconDrop = makeBeacon(0x4dff9a); scene.add(beaconPick, beaconDrop);
  labelPick = makeLabel(' ', '#fff'); labelDrop = makeLabel(' ', '#fff'); scene.add(labelPick, labelDrop);
  arrivalFx = createArrivalFx(scene);
  // town name labels
  for (const t of TOWNS) { const l = makeLabel(t.town, '#ffffff'); l.material.depthTest = true; l.scale.set(l.userData.aspect * 1.6, 1.6, 1); seat(l, t.w.x, t.w.y, 4); scene.add(l); }
  // Landmark names live on the photo-sign captions and the discovery toast, not giant floating banners or white poles.
  for (const lm of LANDMARKS) snapPeak(lm);
  window.__landmarks = LANDMARKS;
  if (RINGS_ENABLED) {
    ringField = createRingField(scene, { groundAt: groundY, randomSpot: randomRingSpot, maxY: 62 });
    ringField.populate();
  }
  attractions = new Attractions({ list: attrList, fromWorld, toWorld, haversineKm, groundY, scene, camera,
    onDiscover: (a, bonus) => { addTokens(bonus); discoverNote(a, bonus); } });
  if (manifest && !params.has('nochunks')) {
    const ring = Number(params.get('ring') || 2);
    streamer = new ChunkStreamer({ scene, manifest, world: { toWorld }, water, ring, unitM: UNIT_M / VEXAG,
      maxAniso: renderer.capabilities.getMaxAnisotropy(), onLoad: () => reseat() });
  }
  // start near Hilo airport, facing west toward Mauna Kea
  const start = toWorld(19.72, -155.05);
  state.pos.set(start.x, groundY(start.x, start.y) + 3, start.y);
  state.yaw = Math.PI / 2; // face west toward Mauna Kea
  $('tokenCount').textContent = state.tokens.toLocaleString();
  updateMissionText();
  startBtn.disabled = false; $('loading').textContent = '';
  if (params.has('debug')) window.__fh = { state, target, TOWNS, destLib, board, openJobBoard, acceptOffer, clearJob, get ringField() { return ringField; }, updateMissionText, streamer, COVER, groundY, attractions, toWorld, get ufo() { return ufo; }, get pilot() { return pilot; }, startCutscene, skipCutscene, get arrivalFx() { return arrivalFx; }, camera, scene, get beacons() { return { beaconPick, beaconDrop }; }, clipLib, get clipPlaying() { return clipPlaying; }, cdPlayer };
  if (params.has('autostart')) startGame();
}
function setPilot(id) {
  pilot = pilotById(id); localStorage.setItem('fh_pilot', pilot.id);
  if (ufo && ufo.pilot.id !== pilot.id) { const old = ufo; ufo = buildShip(pilot.id, UFO_SCALE, shipEnv); scene.add(ufo.group); ufo.group.position.copy(old.group.position); disposeShip(old); }
  $('pilotBadge').src = pilot.badge; $('pilotBadge').alt = pilot.name;
  document.body.dataset.pilot = pilot.id;
  if (state.running) applyCamHud();
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
  applyCamHud();
  if (!state.job && !board.open) openJobBoard();
  try { drawMinimap(); } catch { /* terrain may still be wiring */ }
}
$('startBtn').addEventListener('click', () => openSelect(false));
setPilot(pilot.id);
boot().catch((e) => { console.error(e); $('loading').textContent = 'Could not load terrain, please reload'; });
frame();
