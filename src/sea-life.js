// Humpback whales (in season, November to April) off Kohala and Kona, spinner dolphin pods
// that leap in arcs, and honu basking on the black sand at Punaluʻu. Pure timing helpers are
// exported for tests; the models are low-poly and drawn larger than life like the other props.
import * as THREE from 'three';
import { WORLD_TINT } from './world-light.js';

const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const WHALE_SPOTS = [ // humpbacks like the shallow channels off Kohala and the Kona coast
  [20.12, -155.92], [20.02, -155.90], [19.93, -155.92], [19.80, -156.07], [19.70, -156.07], [19.58, -156.02],
];
export const DOLPHIN_SPOTS = [[19.476, -155.940], [19.668, -156.045], [20.040, -155.855], [19.420, -155.925]];
export const HONU_BEACH = { lat: 19.1362, lon: -155.5047 }; // Punaluʻu black sand beach

/** Humpbacks visit from about November to April. month 1..12 */
export const whaleSeason = (month) => month >= 11 || month <= 4;

/**
 * What a whale is doing t seconds into its 60 s cycle: cruising at the surface with blows,
 * a dive that shows the tail, and now and then a breach. Returns { y, pitch, blow, splash, fluke }
 * with y in body lengths above the water line.
 */
export function whaleCycle(t, seed = 0) {
  const T = 60, u = ((t + seed * 17.3) % T + T) % T;
  const breaches = Math.floor((t + seed * 17.3) / T + seed) % 3 === 0;
  if (u < 22) { // surface cruise, a blow every 7 s
    const k = u % 7;
    return { y: 0.02 + 0.03 * Math.sin(u * 0.9), pitch: 0.02 * Math.sin(u), blow: k < 1.6 ? 1 - k / 1.6 : 0, splash: 0, fluke: 0 };
  }
  if (u < 30) { // dive: arch, tail up, gone
    const k = (u - 22) / 8;
    return { y: 0.02 - k * 0.7, pitch: Math.sin(k * Math.PI) * 0.9, blow: 0, splash: 0, fluke: Math.sin(k * Math.PI) };
  }
  if (breaches && u > 48 && u < 52) { // breach: launch, twist, crash
    const k = (u - 48) / 4, h = 4 * k * (1 - k);
    return { y: -0.4 + h * 1.15, pitch: -1.3 * (1 - k) + 0.5 * k, blow: 0, splash: k > 0.8 ? (k - 0.8) / 0.2 : (k < 0.15 ? 1 - k / 0.15 : 0), fluke: 0, roll: k * 2.5 };
  }
  return { y: -1.2, pitch: 0, blow: 0, splash: 0, fluke: 0 }; // under
}

/** A spinner dolphin's leap: 0 underwater, arcs above the surface for part of a 2.4 s cycle. */
export function dolphinLeap(t, phase) {
  const u = ((t + phase) % 2.4 + 2.4) % 2.4;
  if (u > 1.0) return { y: -0.3, pitch: 0, up: false };
  const k = u / 1.0;
  return { y: 4 * k * (1 - k) * 0.9 - 0.1, pitch: (0.5 - k) * 1.6, up: true };
}

function merge(parts) {
  const pos = [], nor = [], col = [];
  for (const { geo, color } of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo; g.computeVertexNormals();
    const p = g.attributes.position.array, n = g.attributes.normal.array, c = new THREE.Color(color);
    for (let i = 0; i < p.length; i += 3) { pos.push(p[i], p[i + 1], p[i + 2]); nor.push(n[i], n[i + 1], n[i + 2]); col.push(c.r, c.g, c.b); }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

function whaleGeo() { // 1 unit long, nose +z
  const D = 0x2c3644, W = 0xdfe5ea;
  const fin = (s) => new THREE.BoxGeometry(0.34, 0.02, 0.07).translate(s * 0.17, 0, 0).rotateY(s * -0.5).rotateZ(s * -0.25).translate(s * 0.07, -0.04, 0.16);
  const fluke = (s) => new THREE.BoxGeometry(0.16, 0.012, 0.08).translate(s * 0.08, 0, 0).rotateY(s * 0.35).translate(0, 0, -0.5);
  return merge([
    { geo: new THREE.SphereGeometry(0.5, 14, 10).scale(0.2, 0.17, 1).translate(0, 0, 0), color: D },
    { geo: new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38).scale(0.195, 0.165, 0.95), color: W },
    { geo: fin(1), color: W }, { geo: fin(-1), color: W },
    { geo: fluke(1), color: D }, { geo: fluke(-1), color: D },
    { geo: new THREE.ConeGeometry(0.03, 0.06, 6).translate(0, 0.09, -0.15), color: D },
  ]);
}
function dolphinGeo() {
  const G = 0x5d6b78, L = 0xc9d2da;
  return merge([
    { geo: new THREE.SphereGeometry(0.5, 10, 8).scale(0.13, 0.13, 1), color: G },
    { geo: new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.4).scale(0.128, 0.125, 0.95), color: L },
    { geo: new THREE.ConeGeometry(0.05, 0.14, 6).rotateX(-0.6).translate(0, 0.1, -0.05), color: G },
    { geo: new THREE.ConeGeometry(0.025, 0.14, 6).rotateX(Math.PI / 2).translate(0, -0.01, 0.56), color: G },
    { geo: new THREE.BoxGeometry(0.22, 0.01, 0.07).translate(0, 0, -0.5), color: G },
  ]);
}
function honuGeo() {
  const S = 0x5b4a2f, K = 0x8a7a55;
  return merge([
    { geo: new THREE.SphereGeometry(0.5, 12, 8).scale(0.75, 0.28, 1), color: S },
    { geo: new THREE.SphereGeometry(0.15, 8, 6).translate(0, 0.02, 0.58), color: K },
    { geo: new THREE.BoxGeometry(0.42, 0.04, 0.16).translate(0.36, -0.06, 0.22).rotateY(-0.4), color: K },
    { geo: new THREE.BoxGeometry(0.42, 0.04, 0.16).translate(-0.36, -0.06, 0.22).rotateY(0.4), color: K },
    { geo: new THREE.BoxGeometry(0.2, 0.04, 0.12).translate(0.25, -0.06, -0.38), color: K },
    { geo: new THREE.BoxGeometry(0.2, 0.04, 0.12).translate(-0.25, -0.06, -0.38), color: K },
  ]);
}

function sprayTexture() {
  const S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S; const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; return t;
}

/** ctx: { scene, toWorld(lat, lon) -> Vector2, groundY(x, z), isTouch, month } */
export function createSeaLife({ scene, toWorld, groundY, isTouch, month }) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const spray = sprayTexture();
  const sprayMat = () => new THREE.SpriteMaterial({ map: spray, color: 0xffffff, transparent: true, depthWrite: false, opacity: 0 });
  const whales = [], dolphins = [], honu = [], sprays = [];
  let s = 11; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);

  if (whaleSeason(month)) {
    const wg = whaleGeo();
    WHALE_SPOTS.slice(0, isTouch ? 4 : 6).forEach(([lat, lon], i) => {
      const c = toWorld(lat, lon), g = new THREE.Group(); g.rotation.order = 'YXZ';
      const body = new THREE.Mesh(wg, mat); body.scale.setScalar(0.8); g.add(body); // about 80 m: 5x a real humpback, so it reads from the air
      const blow = new THREE.Sprite(sprayMat()); blow.scale.set(0.35, 0.9, 1); g.add(blow); sprays.push(blow.material);
      const splash = new THREE.Sprite(sprayMat()); splash.scale.set(1.2, 0.7, 1); scene.add(splash); sprays.push(splash.material);
      scene.add(g);
      whales.push({ g, body, blow, splash, c, R: 2 + r() * 3, w: (r() < 0.5 ? -1 : 1) * (0.01 + r() * 0.008), a0: r() * 6.28, seed: i * 1.7 });
    });
  }
  const dg = dolphinGeo();
  DOLPHIN_SPOTS.slice(0, isTouch ? 2 : 4).forEach(([lat, lon], i) => {
    const c = toWorld(lat, lon), pod = [];
    for (let k = 0; k < 7; k++) {
      const m = new THREE.Mesh(dg, mat); m.scale.setScalar(0.3); m.rotation.order = 'YXZ'; scene.add(m);
      pod.push({ m, dx: (r() - 0.5) * 0.9, dz: (r() - 0.5) * 0.9, ph: r() * 2.4 });
    }
    dolphins.push({ c, pod, R: 1.5 + r(), w: 0.04 + r() * 0.02, a0: r() * 6.28 });
  });
  { // honu: some basking on the sand, a few swimming just off the beach
    const c = toWorld(HONU_BEACH.lat, HONU_BEACH.lon), hg = honuGeo();
    for (let k = 0; k < 9; k++) {
      const m = new THREE.Mesh(hg, mat); m.scale.setScalar(0.2);
      const onSand = k < 5, a = r() * 6.28, d = onSand ? 0.15 + r() * 0.25 : 0.6 + r() * 0.6;
      const x = c.x + Math.cos(a) * d, z = c.y + Math.sin(a) * d * 0.6 + (onSand ? -0.15 : 0.35);
      m.position.set(x, onSand ? groundY(x, z) + 0.01 : -0.02, z); m.rotation.y = r() * 6.28; scene.add(m);
      honu.push({ m, onSand, x, z, a: r() * 6.28 });
    }
  }

  return {
    get counts() { return { whales: whales.length, dolphins: dolphins.reduce((n, p) => n + p.pod.length, 0), honu: honu.length }; },
    update(t) {
      const tt = reduceMotion ? 0 : t;
      for (const sm of sprays) sm.color.copy(WORLD_TINT.value);
      for (const w of whales) {
        const a = w.a0 + tt * w.w, st = whaleCycle(tt, w.seed);
        const x = w.c.x + Math.cos(a) * w.R, z = w.c.y + Math.sin(a) * w.R;
        w.g.position.set(x, st.y * 0.8, z);
        const sg = Math.sign(w.w); w.g.rotation.set(st.pitch, Math.atan2(-Math.sin(a) * sg, Math.cos(a) * sg), st.roll || 0);
        w.g.visible = st.y > -1;
        w.blow.material.opacity = st.blow * 0.85; w.blow.position.set(0, 0.35 + st.blow * 0.2, 0.12);
        w.splash.material.opacity = st.splash * 0.9; w.splash.position.set(x, 0.3, z);
      }
      for (const p of dolphins) {
        const a = p.a0 + tt * p.w, hx = Math.cos(a) * p.R, hz = Math.sin(a) * p.R, head = Math.atan2(-Math.sin(a), Math.cos(a));
        for (const d of p.pod) {
          const lp = dolphinLeap(tt, d.ph);
          d.m.position.set(p.c.x + hx + d.dx, lp.y * 0.3, p.c.y + hz + d.dz);
          d.m.rotation.set(-lp.pitch, head, 0); d.m.visible = lp.up || lp.y > -0.2;
        }
      }
      for (const h of honu) if (!h.onSand) { h.a += 0.004; h.m.position.x = h.x + Math.cos(h.a) * 0.15; h.m.rotation.y = h.a + Math.PI / 2; }
    },
  };
}
