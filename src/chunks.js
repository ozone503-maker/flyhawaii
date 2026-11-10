// Streams high-res terrain chunks (Copernicus GLO-30 heights ~50 m mesh, Sentinel-2 imagery ~12.5 m/px)
// around the UFO. Ideas from cartoon-hawaii GroundTiles.tsx (wanted set, cache, drop, periodic sync),
// ported to plain Three.js with small 6.4 km chunks so phones only hold a 3x3 block.
import * as THREE from 'three';
import { decodeHeightPng } from './height-png.js';

export class ChunkStreamer {
  constructor({ scene, manifest, world, water, ring, maxAniso, onLoad, unitM, patchMaterial }) {
    this.patchMaterial = patchMaterial; this.scene = scene; this.m = manifest; this.world = world; this.ring = ring; this.onLoad = onLoad;
    this.unitM = unitM; this.aniso = maxAniso;
    this.index = new Map(manifest.chunks.map(([cx, cy, nx, ny, max]) => [`${cx},${cy}`, { cx, cy, nx, ny, max }]));
    this.loaded = new Map(); this.pending = new Set(); this.failed = new Set();
    this.group = new THREE.Group(); scene.add(this.group);
    const f = manifest.frame; this.f = f; this.C = manifest.chunkPx; this.S = manifest.step;
    this.ncx = Math.ceil(f.w / this.C); this.ncy = Math.ceil(f.h / this.C);
    // frame pixel-center coordinate <-> world (both equirectangular, so it is linear)
    const w0 = world.toWorld(f.latNorth - 0.5 * f.dlat, f.lonWest + 0.5 * f.dlon), w1 = world.toWorld(f.latNorth - 1.5 * f.dlat, f.lonWest + 1.5 * f.dlon);
    this.ax = w1.x - w0.x; this.bx = w0.x; this.az = w1.y - w0.y; this.bz = w0.y; // world = a*X + b (X = pixel-center index)
    this.material = new THREE.MeshLambertMaterial();
    // rivers per chunk (frame px bbox)
    this.ways = (water?.ways || []).map((w) => {
      const pts = w.p.map(([lon, lat]) => [(lon - f.lonWest) / f.dlon, (f.latNorth - lat) / f.dlat]);
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      return { ...w, pts, bb: [x0, y0, x1, y1] };
    });
    this.falls = (water?.falls || []).filter((q) => q.n).map((q) => ({ n: q.n, X: (q.p[0] - f.lonWest) / f.dlon, Y: (f.latNorth - q.p[1]) / f.dlat }));
    this.cover = new THREE.Vector4(1, 1, -1, -1); // minX, minZ, maxX, maxZ of fully covered area (empty)
  }
  chunkOf(x, z) { const X = (x - this.bx) / this.ax, Y = (z - this.bz) / this.az; return [Math.floor((X + 0.5) / this.C), Math.floor((Y + 0.5) / this.C), X, Y]; }
  chunkRect(cx, cy) { // world rect covered by chunk (sample 0 .. sample n-1)
    const X0 = cx * this.C, Y0 = cy * this.C, X1 = Math.min(this.f.w - 1, X0 + this.C), Y1 = Math.min(this.f.h - 1, Y0 + this.C);
    return [this.ax * X0 + this.bx, this.az * Y0 + this.bz, this.ax * X1 + this.bx, this.az * Y1 + this.bz];
  }
  // elevation in meters from a loaded chunk, or null
  heightM(x, z) {
    const [cx, cy, X, Y] = this.chunkOf(x, z); const c = this.loaded.get(`${cx},${cy}`); if (!c) return null;
    const sx = (X - cx * this.C) / this.S, sy = (Y - cy * this.C) / this.S;
    if (sx < 0 || sy < 0 || sx > c.nx - 1 || sy > c.ny - 1) return null;
    const i = Math.min(c.nx - 2, Math.floor(sx)), j = Math.min(c.ny - 2, Math.floor(sy)), tx = sx - i, ty = sy - j, W = c.nx + 2;
    const h = c.h, k = (j + 1) * W + i + 1;
    return (h[k] * (1 - tx) + h[k + 1] * tx) * (1 - ty) + (h[k + W] * (1 - tx) + h[k + W + 1] * tx) * ty;
  }
  update(pos) {
    const [cx, cy] = this.chunkOf(pos.x, pos.z); const R = this.ring;
    const want = [];
    for (let r = 0; r <= R; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const k = `${cx + dx},${cy + dy}`;
      if (this.index.has(k) && !this.loaded.has(k) && !this.pending.has(k) && !this.failed.has(k)) want.push(k);
    }
    for (const k of want) { if (this.pending.size >= 3) break; this.load(k); }
    for (const [k, c] of this.loaded) if (Math.max(Math.abs(c.cx - cx), Math.abs(c.cy - cy)) > R + 1) this.drop(k);
    // largest fully covered block (loaded, or no land chunk exists there)
    let best = -1;
    for (let r = 0; r <= R; r++) {
      let ok = true;
      for (let dy = -r; dy <= r && ok; dy++) for (let dx = -r; dx <= r; dx++) { const k = `${cx + dx},${cy + dy}`; if (this.index.has(k) && !this.loaded.has(k)) { ok = false; break; } }
      if (!ok) break; best = r;
    }
    if (best < 0) this.cover.set(1, 1, -1, -1);
    else { const a = this.chunkRect(cx - best, cy - best), b = this.chunkRect(cx + best, cy + best); this.cover.set(a[0], a[1], b[2], b[3]); }
  }
  async load(k) {
    const c = this.index.get(k); this.pending.add(k);
    try {
      const [hbuf, img] = await Promise.all([
        fetch(`/chunks/h-${c.cx}-${c.cy}.png`).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }),
        fetch(`/chunks/s-${c.cx}-${c.cy}.jpg`).then((r) => { if (!r.ok) throw new Error(r.status); return r.blob(); }).then((b) => createImageBitmap(b)),
      ]);
      const dec = await decodeHeightPng(hbuf);
      if (dec.width !== c.nx + 2 || dec.height !== c.ny + 2) throw new Error('chunk size mismatch');
      c.h = dec.data;
      c.mesh = this.buildMesh(c, img);
      this.group.add(c.mesh); this.loaded.set(k, c);
      this.onLoad?.(c);
    } catch (e) { console.warn('chunk failed', k, e); this.failed.add(k); }
    finally { this.pending.delete(k); }
  }
  drop(k) {
    const c = this.loaded.get(k); if (!c) return;
    this.group.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh.material.map.dispose(); c.mesh.material.dispose(); c.mesh = null; c.h = null;
    this.loaded.delete(k);
  }
  buildMesh(c, img) {
    const { nx, ny, h } = c, W = nx + 2, S = this.S, U = this.unitM;
    const X0 = c.cx * this.C, Y0 = c.cy * this.C, pw = img.width, ph = img.height;
    const pos = new Float32Array(nx * ny * 3), nor = new Float32Array(nx * ny * 3), uv = new Float32Array(nx * ny * 2);
    const sx = Math.abs(this.ax) * S, sz = Math.abs(this.az) * S; // world units between samples
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const v = j * nx + i, k = (j + 1) * W + i + 1, e = h[k];
      const X = Math.min(this.f.w - 1, X0 + i * S), Y = Math.min(this.f.h - 1, Y0 + j * S);
      pos[v * 3] = this.ax * X + this.bx; pos[v * 3 + 2] = this.az * Y + this.bz;
      pos[v * 3 + 1] = e > 0 ? e / U + 0.02 : -0.3;
      const dx = (h[k + 1] - h[k - 1]) / U / (2 * sx), dz = (h[k + W] - h[k - W]) / U / (2 * sz);
      const l = Math.hypot(dx, 1, dz); nor[v * 3] = -dx / l; nor[v * 3 + 1] = 1 / l; nor[v * 3 + 2] = -dz / l;
      uv[v * 2] = (i * S + 0.5) / pw; uv[v * 2 + 1] = 1 - (j * S + 0.5) / ph;
    }
    const idx = new Uint32Array((nx - 1) * (ny - 1) * 6); let q = 0;
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, d = a + nx, e2 = d + 1;
      idx[q++] = a; idx[q++] = d; idx[q++] = b; idx[q++] = b; idx[q++] = d; idx[q++] = e2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    // imagery + OSM rivers drawn at 12.5 m/px
    const cv = document.createElement('canvas'); cv.width = pw; cv.height = ph; const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0); img.close?.();
    ctx.lineCap = ctx.lineJoin = 'round';
    for (const pass of ['s', 'r']) for (const w of this.ways) {
      if (w.t !== pass || w.bb[2] < X0 - 4 || w.bb[0] > X0 + pw + 4 || w.bb[3] < Y0 - 4 || w.bb[1] > Y0 + ph + 4) continue;
      ctx.strokeStyle = w.t === 'r' ? 'rgba(70,165,230,0.9)' : w.i ? 'rgba(110,175,220,0.4)' : 'rgba(80,160,225,0.75)';
      ctx.lineWidth = w.t === 'r' ? 3 : w.i ? 1 : (w.n ? 2 : 1.5);
      ctx.beginPath(); w.pts.forEach(([x, y], n) => (n ? ctx.lineTo(x - X0, y - Y0) : ctx.moveTo(x - X0, y - Y0))); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(235,250,255,0.9)';
    for (const fl of this.falls) if (fl.X > X0 && fl.X < X0 + pw && fl.Y > Y0 && fl.Y < Y0 + ph) { ctx.beginPath(); ctx.arc(fl.X - X0, fl.Y - Y0, 3, 0, Math.PI * 2); ctx.fill(); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = this.aniso;
    tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const mat = this.material.clone(); mat.map = tex; this.patchMaterial?.(mat);
    const mesh = new THREE.Mesh(g, mat); mesh.name = `chunk ${c.cx},${c.cy}`;
    return mesh;
  }
}
