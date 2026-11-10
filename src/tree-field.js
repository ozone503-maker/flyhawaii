// Trees around the saucer: forest canopy where the imagery is green, coconut palms on the low
// coast, scattered kiawe on dry land. Only the cells near the camera are filled, in three
// instanced draws, and refilled as you fly. Drawn larger than life so they read from the air.
import * as THREE from 'three';
import { treesInCell, TREE_FOREST, TREE_PALM, TREE_SHRUB } from './trees.js';

const EX = 2.6;

function merge(parts) { // [{ geo, color }] -> one non-indexed geometry with vertex colors
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

function forestGeo() {
  return merge([
    { geo: new THREE.CylinderGeometry(0.05, 0.07, 0.4, 5).translate(0, 0.2, 0), color: 0x5a4632 },
    { geo: new THREE.IcosahedronGeometry(0.42, 0).scale(1, 0.75, 1).translate(0, 0.62, 0), color: 0xffffff },
    { geo: new THREE.IcosahedronGeometry(0.3, 0).scale(1, 0.8, 1).translate(0.18, 0.82, 0.08), color: 0xf2f2f2 },
  ]);
}
function palmGeo() {
  const parts = [{ geo: new THREE.CylinderGeometry(0.025, 0.04, 1.0, 5).translate(0, 0.5, 0), color: 0x8a7458 }];
  for (let k = 0; k < 7; k++) {
    const a = k / 7 * Math.PI * 2;
    const f = new THREE.BoxGeometry(0.42, 0.015, 0.09).translate(0.21, 0, 0);
    f.rotateZ(-0.35); f.rotateY(a); f.translate(0, 1.0, 0);
    parts.push({ geo: f, color: 0xffffff });
  }
  return merge(parts);
}
function shrubGeo() {
  return merge([{ geo: new THREE.DodecahedronGeometry(0.3, 0).scale(1.2, 0.7, 1).translate(0, 0.22, 0), color: 0xffffff }]);
}

/**
 * ctx: { scene, groundY(x, z), rgbAt(x, z) -> [r, g, b], elevM(x, z), lonAt(x), unitM, isTouch }
 */
export function createTreeField(ctx) {
  const { scene, groundY, rgbAt, elevM, lonAt, unitM, isTouch } = ctx;
  const cellU = 4, spacingU = isTouch ? 0.75 : 0.6, radiusU = isTouch ? 34 : 52;
  const maxN = isTouch ? 7000 : 18000;
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const kinds = {
    [TREE_FOREST]: { mesh: new THREE.InstancedMesh(forestGeo(), mat, maxN), h: 16, cols: [0x2f5e2a, 0x3b6f2f, 0x2a5233, 0x46733a] },
    [TREE_PALM]: { mesh: new THREE.InstancedMesh(palmGeo(), mat, Math.floor(maxN / 3)), h: 20, cols: [0x4d8a3a, 0x5c9440, 0x3f7a35] },
    [TREE_SHRUB]: { mesh: new THREE.InstancedMesh(shrubGeo(), mat, Math.floor(maxN / 3)), h: 6, cols: [0x6b7a3e, 0x7a7d45, 0x5f6e3a] },
  };
  for (const k of Object.values(kinds)) { k.mesh.count = 0; k.mesh.frustumCulled = false; k.cols = k.cols.map((c) => new THREE.Color(c)); scene.add(k.mesh); }
  const cache = new Map();
  const sample = (x, z) => { const [r, g, b] = rgbAt(x, z); return { r, g, b, groundM: elevM(x, z), lon: lonAt(x) }; };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  let cx0 = 1e9, cz0 = 1e9, dirty = true, lastFill = -1e9;

  function fill(cx, cz) {
    cx0 = cx; cz0 = cz; dirty = false;
    const n = { [TREE_FOREST]: 0, [TREE_PALM]: 0, [TREE_SHRUB]: 0 };
    const R = Math.ceil(radiusU / cellU), want = new Set();
    // nearest cells first so the budget goes to what you can see best
    const cells = [];
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) { const d = i * i + j * j; if (d <= R * R) cells.push([d, cx + i, cz + j]); }
    cells.sort((a, b) => a[0] - b[0]);
    for (const [, i, j] of cells) {
      const key = i + ',' + j; want.add(key);
      let list = cache.get(key); if (!list) { list = treesInCell(i, j, cellU, spacingU, sample); cache.set(key, list); }
      for (const t of list) {
        const k = kinds[t.kind]; if (n[t.kind] >= k.mesh.instanceMatrix.count) continue;
        const s = k.h / unitM * EX * t.s;
        q.setFromAxisAngle(up, t.c * 6.283);
        m.compose(p.set(t.x, groundY(t.x, t.z) - 0.02, t.z), q, sc.set(s, s, s));
        k.mesh.setMatrixAt(n[t.kind], m);
        tint.copy(k.cols[Math.floor(t.c * k.cols.length) % k.cols.length]);
        k.mesh.setColorAt(n[t.kind], tint);
        n[t.kind]++;
      }
    }
    for (const [key] of cache) if (!want.has(key)) cache.delete(key);
    for (const [kind, k] of Object.entries(kinds)) {
      k.mesh.count = n[kind]; k.mesh.instanceMatrix.needsUpdate = true; if (k.mesh.instanceColor) k.mesh.instanceColor.needsUpdate = true;
    }
  }

  return {
    update(pos, t) {
      const cx = Math.floor(pos.x / cellU), cz = Math.floor(pos.z / cellU);
      if (Math.abs(cx - cx0) > 1 || Math.abs(cz - cz0) > 1 || (dirty && t - lastFill > 1)) { lastFill = t; fill(cx, cz); }
    },
    /** sharper terrain arrived: re-seat trees on the next update */
    reseat() { dirty = true; },
    get count() { return Object.values(kinds).reduce((a, k) => a + k.mesh.count, 0); },
  };
}
