// Cruise ships, sport fishing boats and a snorkel catamaran with foamy wakes. Generic paint
// (no real cruise line or charter brand). Larger than life like the other props.
import * as THREE from 'three';
import { timedPath } from './air-traffic.js';
import { CRUISE_ROUTE, BOAT_ROUTES, outAndBack, seaPoints } from './sea-traffic.js';

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
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

// bow toward +z, 1 unit long
function hullGeo(w, h, color) { // pointed bow
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -0.5); s.lineTo(w / 2, -0.5); s.lineTo(w / 2, 0.28); s.quadraticCurveTo(w / 2, 0.45, 0, 0.5); s.quadraticCurveTo(-w / 2, 0.45, -w / 2, 0.28); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
  g.rotateX(Math.PI / 2); g.translate(0, h, 0); // shape's y becomes z, extrude goes down to y = 0
  return { geo: g, color };
}

function cruiseGeo() {
  const parts = [hullGeo(0.13, 0.05, 0x1b2a4a), hullGeo(0.128, 0.03, 0xf3f4f6)];
  parts[1].geo.translate(0, 0.05, 0);
  for (let k = 0; k < 6; k++) { // stacked decks, stepping back toward the stern
    const L = 0.78 - k * 0.07, z = -0.06 - k * 0.012;
    parts.push({ geo: box(0.118 - k * 0.006, 0.022, L, 0, 0.09 + k * 0.022, z), color: 0xf6f7f8 });
    parts.push({ geo: box(0.1195 - k * 0.006, 0.006, L * 0.96, 0, 0.093 + k * 0.022, z), color: 0x27435f }); // window band
  }
  parts.push({ geo: box(0.124, 0.012, 0.5, 0, 0.088, -0.05), color: 0xf28c28 }); // lifeboats row
  parts.push({ geo: new THREE.CylinderGeometry(0.022, 0.026, 0.06, 10).translate(0, 0.25, -0.28), color: 0x1d5fa8 });
  parts.push({ geo: new THREE.CylinderGeometry(0.0225, 0.0225, 0.012, 10).translate(0, 0.283, -0.28), color: 0x1b1b1b });
  return merge(parts);
}

function fishingGeo() {
  return merge([
    hullGeo(0.32, 0.12, 0xf7f7f5),
    { geo: box(0.3, 0.02, 0.55, 0, 0.12, -0.18), color: 0x2a6f9e }, // stripe
    { geo: box(0.24, 0.13, 0.32, 0, 0.19, 0.02), color: 0xf2f2f0 }, // cabin
    { geo: box(0.245, 0.04, 0.2, 0, 0.21, 0.1), color: 0x23313f }, // windows
    { geo: box(0.2, 0.012, 0.18, 0, 0.42, 0.0), color: 0xdfe3e6 }, // tuna tower top
    { geo: box(0.012, 0.18, 0.012, 0.09, 0.33, 0.08), color: 0xc8cdd2 }, { geo: box(0.012, 0.18, 0.012, -0.09, 0.33, 0.08), color: 0xc8cdd2 },
    { geo: box(0.012, 0.18, 0.012, 0.09, 0.33, -0.08), color: 0xc8cdd2 }, { geo: box(0.012, 0.18, 0.012, -0.09, 0.33, -0.08), color: 0xc8cdd2 },
    { geo: box(0.008, 0.008, 0.6, 0.15, 0.3, -0.25).rotateZ(-0.5), color: 0x9aa0a6 }, // outrigger poles
    { geo: box(0.008, 0.008, 0.6, -0.15, 0.3, -0.25).rotateZ(0.5), color: 0x9aa0a6 },
  ]);
}

function catamaranGeo() {
  return merge([
    hullGeo(0.12, 0.1, 0xf7f7f5), hullGeo(0.12, 0.1, 0xf7f7f5),
    { geo: box(0.46, 0.04, 0.8, 0, 0.12, -0.05), color: 0xf0f0ee },
    { geo: box(0.3, 0.1, 0.3, 0, 0.19, 0.0), color: 0x1fa3b8 },
    { geo: box(0.36, 0.015, 0.4, 0, 0.26, -0.02), color: 0xf6f6f4 },
  ].map((p, i) => (i < 2 ? { ...p, geo: p.geo.translate(i ? 0.2 : -0.2, 0, 0) } : p)));
}

function wakeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      void main(){ float along = vUv.y; float across = abs(vUv.x - 0.5) * 2.0;
        float width = mix(0.05, 1.0, along);
        float edge = smoothstep(width, width * 0.6, across) * smoothstep(width * 0.15, width * 0.45, across);
        float center = smoothstep(width * 0.25, 0.0, across) * 0.6;
        float ripple = 0.6 + 0.4 * sin(along * 40.0 - uTime * 5.0 + across * 6.0);
        float a = (edge + center) * ripple * (1.0 - along) * 0.85;
        gl_FragColor = vec4(vec3(0.95, 0.98, 1.0), a); }`,
  });
}

/** ctx: { scene, toWorld(lat, lon) -> Vector2, isTouch } */
export function createSeaTraffic({ scene, toWorld, isTouch }) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const wakeMat = wakeMaterial();
  const vessels = [];
  const add = (geo, path, offset, size, wakeLen, kind) => {
    const g = new THREE.Group(); g.rotation.order = 'YXZ';
    const m = new THREE.Mesh(geo, mat); m.scale.setScalar(size); g.add(m);
    // wake: a long triangle behind the stern (plane uv.y runs from stern 0 to tail 1)
    const wake = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.9, wakeLen).rotateX(-Math.PI / 2).translate(0, 0.03, -size * 0.45 - wakeLen / 2), wakeMat);
    g.add(wake); scene.add(g);
    vessels.push({ g, path, offset, wake, kind, size });
  };
  // two cruise ships, one starting docked in Hilo, one at anchor off Kona
  const cruise = cruiseGeo();
  const route = outAndBack(CRUISE_ROUTE), konaIdx = CRUISE_ROUTE.length - 1;
  const cpts = seaPoints(route, toWorld, 0.7, { 0: 240, [konaIdx]: 240 });
  cpts[0].v = cpts[1].v = cpts[route.length - 1].v = 0.2; // creep in and out of Hilo Harbor
  const cpath = timedPath(cpts, [0, konaIdx]);
  add(cruise, cpath, 0, 4, 11, 'cruise');
  if (!isTouch) add(cruise, cpath, cpath.period / 2, 4, 11, 'cruise');
  // boats
  const geos = { fishing: fishingGeo(), catamaran: catamaranGeo() };
  BOAT_ROUTES.slice(0, isTouch ? 4 : BOAT_ROUTES.length).forEach((r, i) => {
    const pts = seaPoints([r.home, ...r.pts], toWorld, r.kind === 'catamaran' ? 0.3 : 0.35, { 0: 40 + i * 9 });
    pts[0].v = pts[1].v = 0.12;
    const kealakekua = r.kind === 'catamaran' ? 4 : -1;
    if (kealakekua > 0) pts[kealakekua].hold = 90; // snorkel stop
    const path = timedPath(pts, kealakekua > 0 ? [0, kealakekua] : [0]);
    add(geos[r.kind], path, i * 53, r.kind === 'catamaran' ? 0.9 : 0.7, r.kind === 'catamaran' ? 3 : 3.5, r.kind);
  });

  return {
    vessels,
    update(t) {
      const tt = reduceMotion ? 0 : t;
      wakeMat.uniforms.uTime.value = tt;
      for (const v of vessels) {
        const a = v.path.at(tt + v.offset), b = v.path.at(tt + v.offset + 0.5);
        const moving = Math.hypot(b.x - a.x, b.z - a.z) > 0.01;
        v.g.position.set(a.x, 0, a.z);
        v.g.rotation.set(Math.sin(tt * 0.9 + v.offset) * 0.02, a.heading, Math.sin(tt * 0.7 + v.offset) * (v.kind === 'cruise' ? 0.008 : 0.05));
        v.wake.visible = moving;
      }
    },
  };
}
