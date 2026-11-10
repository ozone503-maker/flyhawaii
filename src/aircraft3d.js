// Airliners at Hilo and Kona and tour helicopters, drawn as small low-poly models with vertex
// colors (a generic island airline, not a real brand). Larger than life like the other props.
import * as THREE from 'three';
import { RUNWAYS, HELI_TOURS, timedPath, airlinerCircuit, heliLoop } from './air-traffic.js';

const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

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

// Airliner, nose toward +z, about 1 unit long before scaling
function airlinerGeo() {
  const W = 0xf4f6f8, B = 0x1d5fa8, T = 0x22b8c8, G = 0xb9c0c8;
  const wing = (s) => new THREE.BoxGeometry(0.46, 0.012, 0.12).translate(s * 0.23, 0, 0).rotateY(s * 0.42);
  const stab = (s) => new THREE.BoxGeometry(0.17, 0.008, 0.06).translate(s * 0.085, 0, 0).rotateY(s * 0.5);
  return merge([
    { geo: new THREE.CylinderGeometry(0.055, 0.055, 0.82, 10).rotateX(Math.PI / 2), color: W },
    { geo: new THREE.CylinderGeometry(0.056, 0.056, 0.5, 10, 1, true, Math.PI * 0.62, Math.PI * 0.08).rotateX(Math.PI / 2).translate(0, 0, 0.04), color: T },
    { geo: new THREE.SphereGeometry(0.055, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).translate(0, 0, 0.41), color: W },
    { geo: new THREE.ConeGeometry(0.055, 0.16, 10).rotateX(-Math.PI / 2).translate(0, 0.01, -0.49), color: W },
    { geo: wing(1).translate(0, -0.03, 0.02), color: W }, { geo: wing(-1).translate(0, -0.03, 0.02), color: W },
    { geo: new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8).rotateX(Math.PI / 2).translate(0.15, -0.065, 0.1), color: G },
    { geo: new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8).rotateX(Math.PI / 2).translate(-0.15, -0.065, 0.1), color: G },
    { geo: new THREE.BoxGeometry(0.012, 0.16, 0.13).translate(0, 0.12, -0.46).rotateX(0), color: B },
    { geo: stab(1).translate(0, 0.03, -0.5), color: W }, { geo: stab(-1).translate(0, 0.03, -0.5), color: W },
  ]);
}

function heliGeo(color) {
  const D = 0x2b2f36;
  return merge([
    { geo: new THREE.SphereGeometry(0.15, 12, 8).scale(0.9, 0.85, 1.9), color },
    { geo: new THREE.SphereGeometry(0.11, 10, 6).scale(1, 0.8, 1).translate(0, 0.02, 0.15), color: 0x8fb8d8 },
    { geo: new THREE.CylinderGeometry(0.03, 0.05, 0.6, 6).rotateX(Math.PI / 2).translate(0, 0.05, -0.48), color },
    { geo: new THREE.BoxGeometry(0.015, 0.18, 0.1).translate(0, 0.12, -0.76), color },
    { geo: new THREE.BoxGeometry(0.02, 0.02, 0.4).translate(0.12, -0.17, 0), color: D },
    { geo: new THREE.BoxGeometry(0.02, 0.02, 0.4).translate(-0.12, -0.17, 0), color: D },
    { geo: new THREE.CylinderGeometry(0.02, 0.02, 0.07, 6).translate(0, 0.17, 0), color: D },
  ]);
}

/** ctx: { scene, toWorld(lat, lon) -> Vector2, groundY(x, z), isTouch } */
export function createAirTraffic({ scene, toWorld, groundY, isTouch }) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const flyers = [];
  const W = (p) => { const v = toWorld(p.lat ?? p[0], p.lon ?? p[1]); return { x: v.x, z: v.y }; };
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3020, fog: false });
  const beaconGeo = new THREE.SphereGeometry(0.02, 6, 4);

  // airliners: two per airport, half a circuit apart
  const plane = airlinerGeo();
  for (const key of ['ito', 'koa']) {
    const r = RUNWAYS[key], from = W(r.from), to = W(r.to);
    const path = timedPath(airlinerCircuit({ from, to, groundY: groundY(from.x, from.z), seaSide: r.seaSide }), [0]);
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group(); const m = new THREE.Mesh(plane, mat); g.add(m);
      const bl = new THREE.Mesh(beaconGeo, beaconMat); bl.position.set(0, 0.07, -0.05); g.add(bl);
      g.scale.setScalar(2.1); // about 210 m long: bigger than life so it reads next to the 200 m saucer
      g.rotation.order = 'YXZ'; scene.add(g);
      flyers.push({ g, path, offset: i * path.period / 2 + (key === 'koa' ? 37 : 0), beacon: bl, kind: 'plane' });
    }
  }
  // tour helicopters
  const heliCols = [0xd8322a, 0xf2c230, 0x1d1f24];
  HELI_TOURS.slice(0, isTouch ? 2 : 3).forEach((tour, i) => {
    const pts = heliLoop(tour.pts.map(W), groundY);
    const path = timedPath(pts);
    const g = new THREE.Group(); g.add(new THREE.Mesh(heliGeo(heliCols[i % heliCols.length]), mat));
    const rotor = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
    rotor.position.y = 0.21; g.add(rotor);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.006, 0.03), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
    blade.position.y = 0.215; g.add(blade);
    g.scale.setScalar(2.4); g.rotation.order = 'YXZ'; scene.add(g);
    flyers.push({ g, path, offset: i * 97, blade, kind: 'heli' });
  });

  const tmp = new THREE.Vector3();
  return {
    flyers,
    /** moves everything; returns the distance (world units) from pos to the nearest aircraft */
    update(t, pos) {
      let near = Infinity;
      for (const f of flyers) {
        const s = f.path.at(reduceMotion ? f.offset : t + f.offset);
        f.g.position.set(s.x, s.y, s.z);
        f.g.rotation.set(f.kind === 'heli' ? 0.08 : -s.pitch, s.heading, f.kind === 'heli' ? s.bank * 0.4 : s.bank);
        if (f.blade) f.blade.rotation.y = t * 38;
        if (f.beacon) f.beacon.visible = (t * 1.2 + f.offset) % 1 < 0.15;
        if (pos) near = Math.min(near, tmp.set(s.x, s.y, s.z).distanceTo(pos));
      }
      return near;
    },
  };
}
