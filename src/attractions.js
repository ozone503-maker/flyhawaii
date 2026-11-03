// Tourist attraction zones: each real photo stands in the world as a small sign just above the ground
// at the landmark, turning to face the camera and fading in as the UFO approaches.
// Photos load lazily, only when the UFO gets within about 2x radius + 3 km of a zone.
import * as THREE from 'three';
const FIRST_BONUS = 25;
const KEY = 'fh_found';
const SIGN_W = 2.2;     // world units (1 = 100 m), about the width of the saucer
const LIFT = 0.12;      // bottom edge about 12 m above the highest ground under the sign
const POST_H = LIFT + 0.02;

export class Attractions {
  constructor({ list, fromWorld, toWorld, haversineKm, groundY, scene, camera, onDiscover }) {
    this.list = list; this.fromWorld = fromWorld; this.hav = haversineKm; this.groundY = groundY;
    this.scene = scene; this.camera = camera; this.onDiscover = onDiscover;
    this.found = new Set(JSON.parse(localStorage.getItem(KEY) || '[]').filter((id) => list.some((a) => a.id === id)));
    this.active = null; this.loaded = new Map(); this.signs = new Map();
    for (const a of list) a.w = toWorld(a.lat, a.lon);
    this.$ = (id) => document.getElementById(id);
    this.renderCount();
  }
  renderCount() { this.$('foundCount').textContent = `${this.found.size}/${this.list.length}`; }
  preload(a) {
    if (this.loaded.has(a.id)) return this.loaded.get(a.id);
    const p = new Promise((res) => { const im = new Image(); im.decoding = 'async'; im.onload = () => res(im); im.onerror = () => res(null); im.src = a.img; })
      .then((im) => { if (im) this.buildSign(a, im); return im; });
    this.loaded.set(a.id, p); return p;
  }
  // photo plus a caption strip (name and credit) drawn into one texture
  buildSign(a, im) {
    const W = 768, ph = Math.round(W * im.naturalHeight / im.naturalWidth), cap = 96, pad = 10;
    const c = document.createElement('canvas'); c.width = W + pad * 2; c.height = ph + cap + pad * 2;
    const x = c.getContext('2d');
    x.fillStyle = '#0b1826'; x.beginPath(); x.roundRect(0, 0, c.width, c.height, 18); x.fill();
    x.drawImage(im, pad, pad, W, ph);
    x.fillStyle = '#ffffff'; x.font = '800 40px system-ui, sans-serif'; x.textBaseline = 'alphabetic';
    x.fillText(a.name, pad + 14, pad + ph + 48, W - 28);
    x.fillStyle = 'rgba(220,235,245,0.75)'; x.font = '500 20px system-ui, sans-serif';
    x.fillText(`Photo: ${a.author}, ${a.license}, Wikimedia Commons`, pad + 14, pad + ph + 80, W - 28);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const h = SIGN_W * c.height / c.width;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, toneMapped: false, fog: false, side: THREE.DoubleSide, depthWrite: false });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(SIGN_W, h), mat);
    board.position.y = POST_H + h / 2; board.renderOrder = 5;
    const postMat = new THREE.MeshBasicMaterial({ color: 0x3a3f44, transparent: true, opacity: 0, fog: false });
    const g = new THREE.Group(); g.add(board);
    for (const px of [-SIGN_W * 0.32, SIGN_W * 0.32]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, POST_H + 0.3, 6), postMat);
      post.position.set(px, (POST_H + 0.3) / 2 - 0.3, -0.01); g.add(post);
    }
    g.visible = false; g.userData = { mats: [mat, postMat], h };
    g.position.set(a.w.x, 0, a.w.y); this.seatSign(a, g);
    this.scene.add(g); this.signs.set(a.id, g);
  }
  // sit on the highest ground under the sign footprint so slopes never swallow it
  seatSign(a, g) {
    let top = this.groundY(a.w.x, a.w.y); const r = SIGN_W / 2;
    for (let k = 0; k < 8; k++) { const t = k / 8 * Math.PI * 2; top = Math.max(top, this.groundY(a.w.x + Math.cos(t) * r, a.w.y + Math.sin(t) * r)); }
    g.position.y = top;
  }
  update(x, z) {
    const here = this.fromWorld(x, z);
    let inside = null, best = Infinity;
    for (const a of this.list) {
      const d = this.hav(here, a);
      const near = a.r * 2 + 3;
      if (d < near) this.preload(a);
      const g = this.signs.get(a.id);
      if (g) {
        const op = Math.min(1, Math.max(0, (near - d) / (near - a.r)));   // 0 at load range, 1 at the zone edge
        g.userData.target = op;
        if (op > 0 && !g.visible) { this.seatSign(a, g); g.visible = true; }
        else if (op > 0) this.seatSign(a, g);
      }
      const r = this.active === a ? a.r * 1.15 : a.r;
      if (d < r && d / a.r < best) { best = d / a.r; inside = a; }
    }
    if (inside && inside !== this.active) this.enter(inside);
    this.active = inside;
  }
  enter(a) {
    if (this.found.has(a.id)) return;
    this.found.add(a.id); localStorage.setItem(KEY, JSON.stringify([...this.found])); this.renderCount();
    this.onDiscover?.(a, FIRST_BONUS);
  }
  // every frame: smooth fades and turn each visible sign toward the camera (yaw only, so it stands upright)
  tick(dt) {
    const cp = this.camera.position;
    for (const g of this.signs.values()) {
      if (!g.visible) continue;
      const [m, pm] = g.userData.mats;
      m.opacity += ((g.userData.target || 0) - m.opacity) * Math.min(1, dt * 3);
      pm.opacity = m.opacity;
      if (m.opacity < 0.01 && !(g.userData.target > 0)) { g.visible = false; continue; }
      g.rotation.y = Math.atan2(cp.x - g.position.x, cp.z - g.position.z);
    }
  }
}
