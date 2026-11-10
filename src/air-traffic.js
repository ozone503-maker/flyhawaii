// Sky traffic paths: airliners flying circuits at Hilo (ITO) and Kona (KOA), and tour helicopters
// over Kīlauea and the waterfall coasts. Pure math in world units (1 unit = 100 m), no three.js.
// Runway ends: FAA data via GlobalAir (ITO 08/26, KOA 17/35). Trade winds blow from the
// east-northeast, so Hilo uses runway 08 and Kona usually runway 17.

export const RUNWAYS = {
  ito: { name: 'Hilo', from: { lat: 19.721370, lon: -155.058000 }, to: { lat: 19.721366, lon: -155.029275 }, seaSide: -1 }, // 08: east, the bay is to the north (left)
  koa: { name: 'Kona', from: { lat: 19.753855, lon: -156.044289 }, to: { lat: 19.723675, lon: -156.046974 }, seaSide: 1 }, // 17: south, the sea is to the west (right)
};

export const HELI_TOURS = [
  { name: 'Volcano tour', pts: [[19.7175, -155.045], [19.62, -155.10], [19.45, -155.22], [19.403, -155.272], [19.395, -155.30], [19.415, -155.30], [19.42, -155.27], [19.36, -155.05], [19.55, -154.98], [19.70, -155.03]] },
  { name: 'Waterfall tour', pts: [[19.7175, -155.045], [19.80, -155.09], [19.86, -155.15], [19.95, -155.24], [20.06, -155.45], [20.11, -155.58], [20.13, -155.62], [20.08, -155.55], [19.93, -155.22], [19.78, -155.08]] },
  { name: 'Kohala tour', pts: [[19.92, -155.86], [20.03, -155.83], [20.17, -155.82], [20.21, -155.74], [20.16, -155.66], [20.11, -155.59], [20.09, -155.62], [20.05, -155.75], [19.95, -155.84]] },
];

/** Piecewise path through points [{ x, z, y, v }] (v = speed in units/s at that point). Loops. */
export function timedPath(points, holdAt = []) {
  const seg = [];
  let T = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const d = Math.hypot(b.x - a.x, b.z - a.z, b.y - a.y);
    const v = Math.max(0.05, (a.v + b.v) / 2);
    const hold = holdAt.includes(i) ? (a.hold || 0) : 0;
    seg.push({ a, b, t0: T, hold, dt: d / v });
    T += hold + d / v;
  }
  return {
    period: T,
    at(t) {
      t = ((t % T) + T) % T;
      let lo = 0, hi = seg.length - 1;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (seg[m].t0 <= t) lo = m; else hi = m - 1; }
      const s = seg[lo]; let u = (t - s.t0 - s.hold) / s.dt; if (u < 0) u = 0;
      const { a, b } = s;
      const x = a.x + (b.x - a.x) * u, z = a.z + (b.z - a.z) * u, y = a.y + (b.y - a.y) * u;
      const n = seg[(lo + 1) % seg.length].b;
      const h0 = Math.atan2(b.x - a.x, b.z - a.z), h1 = Math.atan2(n.x - b.x, n.z - b.z);
      let dh = h1 - h0; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
      const flat = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      return { x, y, z, heading: h0 + dh * u * u, bank: Math.max(-0.6, Math.min(0.6, -dh * 3)), pitch: Math.atan2(b.y - a.y, flat), onGround: a.ground && b.ground };
    },
  };
}

/**
 * An airliner circuit: take off, climb out, turn over the sea, downwind, turn to final, land,
 * roll out, taxi back alongside the runway and wait. from/to: runway ends in world units,
 * groundY: runway height, seaSide: +1 turns right, -1 left. Returns timedPath points.
 */
export function airlinerCircuit({ from, to, groundY, seaSide }) {
  const dx = to.x - from.x, dz = to.z - from.z, L = Math.hypot(dx, dz);
  const fx = dx / L, fz = dz / L; // runway direction
  const sx = fz * -seaSide, sz = -fx * -seaSide; // side the circuit turns toward
  const P = (along, side, y, v, extra = {}) => ({ x: from.x + fx * along + sx * side, z: from.z + fz * along + sz * side, y, v, ...extra });
  const g = groundY + 0.06, cruise = groundY + 12, pts = [];
  pts.push(P(0, 0, g, 0.1, { ground: true, hold: 25 }));      // 0: holding at the start of the runway
  pts.push(P(L * 0.45, 0, g, 0.75, { ground: true }));       // take-off roll
  pts.push(P(L * 0.55, 0, g + 0.05, 0.8));                   // rotate
  pts.push(P(L + 60, 0, cruise * 0.7, 1.3));                 // climb out
  const R = 30, ox = L + 90; // turn radius 3 km, turns start 9 km past the runway
  for (let k = 0; k <= 8; k++) { const a = k / 8 * Math.PI; pts.push(P(ox + Math.sin(a) * R, R - Math.cos(a) * R, cruise, 1.5)); }
  const back = -110; // downwind back past the runway, then turn to final 11 km out
  for (let k = 0; k <= 8; k++) { const a = k / 8 * Math.PI; pts.push(P(back - Math.sin(a) * R, R + Math.cos(a) * R, cruise * 0.75, 1.3)); }
  pts.push(P(-60, 0, g + 3.2, 0.9));                          // final, about 3 degrees
  pts.push(P(0, 0, g + 0.05, 0.75));                          // over the threshold
  pts.push(P(L * 0.08, 0, g, 0.7, { ground: true }));         // touchdown
  pts.push(P(L * 0.8, 0, g, 0.2, { ground: true }));          // roll out
  pts.push(P(L, 1.6, g, 0.12, { ground: true }));             // off onto the taxiway
  pts.push(P(L * 0.5, 1.6, g, 0.12, { ground: true }));       // taxi back
  pts.push(P(0, 1.6, g, 0.12, { ground: true }));
  return pts;
}

/** A helicopter tour loop at about 450 m above the ground. ground(x, z) -> world height. */
export function heliLoop(worldPts, ground, aglU = 4.5, speed = 0.55, stepU = 0.8) {
  const raw = [];
  for (let i = 0; i < worldPts.length; i++) { // subdivide so it can follow the terrain
    const a = worldPts[i], b = worldPts[(i + 1) % worldPts.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / stepU));
    for (let k = 0; k < n; k++) { const u = k / n; raw.push({ x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u }); }
  }
  const N = raw.length, g = raw.map((p) => ground(p.x, p.z));
  // highest ground nearby (so a straight leg never cuts a ridge), then a gentle smoothing pass
  const hi = g.map((_, i) => { let m = -Infinity; for (let k = -4; k <= 4; k++) m = Math.max(m, g[(i + k + N) % N]); return m + aglU; });
  return raw.map((p, i) => {
    let s = 0; for (let k = -3; k <= 3; k++) s = Math.max(s, hi[(i + k + N) % N]);
    return { ...p, y: s, v: speed };
  });
}
