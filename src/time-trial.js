// Time trial: a lap of the island through glowing hex gates just off the coast. Pure math:
// the course is traced from the real elevation grid, gates are passed in order, and the best
// run is kept as a compact ghost track. World units (1 unit = 100 m).

export const GATE_SPACING_U = 60;  // about 6 km between gates
export const GATE_OFFSHORE_U = 14; // about 1.4 km off the coast
export const GATE_ALT_U = 2.2;     // about 220 m above the sea
export const GATE_RADIUS_U = 3.2;  // a 640 m wide hex ring: room for a 200 m saucer at speed
export const GHOST_HZ = 4;

/**
 * Traces a closed loop around the island just offshore. elevM(x, z) gives meters (negative at
 * sea). center: a point inside the island. Rays go out from the center; on each, the last land
 * before open water marks the coast, then the course sits GATE_OFFSHORE_U past it. The loop is
 * smoothed and resampled to even spacing. Returns [{ x, z }] counterclockwise seen from above.
 */
export function traceCourse(elevM, center, { rays = 720, maxU = 900, stepU = 2, spacingU = GATE_SPACING_U, offshoreU = GATE_OFFSHORE_U } = {}) {
  const raw = [];
  for (let i = 0; i < rays; i++) {
    const a = i / rays * Math.PI * 2, dx = Math.cos(a), dz = -Math.sin(a);
    let lastLand = 0, seaRun = 0;
    for (let d = 0; d < maxU; d += stepU) {
      if (elevM(center.x + dx * d, center.z + dz * d) > 0) { lastLand = d; seaRun = 0; } else if ((seaRun += stepU) > 60) break;
    }
    const d = lastLand + offshoreU;
    raw.push({ x: center.x + dx * d, z: center.z + dz * d });
  }
  // smooth bumps from bays and points, then push any point that ended up over land back out
  let pts = raw;
  for (let pass = 0; pass < 3; pass++) pts = pts.map((p, i) => {
    const n = pts.length; let x = 0, z = 0;
    for (let k = -6; k <= 6; k++) { const q = pts[(i + k + n) % n]; x += q.x; z += q.z; }
    return { x: x / 13, z: z / 13 };
  });
  const pushOut = (list) => list.map((p) => {
    let { x, z } = p; const dx = x - center.x, dz = z - center.z, L = Math.hypot(dx, dz) || 1;
    for (let k = 0; k < 60 && elevM(x, z) > -5; k++) { x += dx / L * 2; z += dz / L * 2; }
    return { x, z };
  });
  // resampling can cut across a headland, so push out and resample until it settles
  pts = pushOut(pts);
  for (let pass = 0; pass < 3; pass++) pts = pushOut(resample(pts, spacingU / 4));
  return pushOut(resample(pts, spacingU));
}

/** Even spacing along a closed polyline. */
export function resample(pts, spacing) {
  const n = pts.length, seg = [];
  let total = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n], d = Math.hypot(b.x - a.x, b.z - a.z); seg.push(d); total += d; }
  const count = Math.max(8, Math.round(total / spacing)), step = total / count, out = [];
  let i = 0, acc = 0;
  for (let k = 0; k < count; k++) {
    const want = k * step;
    while (acc + seg[i] < want) { acc += seg[i]; i = (i + 1) % n; }
    const a = pts[i], b = pts[(i + 1) % n], u = seg[i] ? (want - acc) / seg[i] : 0;
    out.push({ x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u });
  }
  return out;
}

/** Gates with a center, a facing (unit normal along the course) and a radius. start: index to begin at. */
export function makeGates(course, start = 0, { alt = GATE_ALT_U, r = GATE_RADIUS_U } = {}) {
  const n = course.length, out = [];
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n, p = course[i], prev = course[(i - 1 + n) % n], next = course[(i + 1) % n];
    const dx = next.x - prev.x, dz = next.z - prev.z, L = Math.hypot(dx, dz) || 1;
    out.push({ c: { x: p.x, y: alt, z: p.z }, n: { x: dx / L, y: 0, z: dz / L }, r });
  }
  return out;
}

/** Index of the course point nearest to (x, z): where a lap starts. */
export function nearestIndex(course, x, z) {
  let best = 0, bd = Infinity;
  course.forEach((p, i) => { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = i; } });
  return best;
}

/** 83.456 s -> "1:23.45" */
export function formatLap(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '--:--.--';
  const m = Math.floor(sec / 60), s = sec - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

/** Ghost track: [[x, y, z], ...] sampled at GHOST_HZ, kept to one decimal. */
export function encodeGhost(samples) { return samples.map((p) => p.map((v) => Math.round(v * 10) / 10)); }

/** Position along a ghost track at time t (seconds since the lap started). */
export function ghostAt(track, t, hz = GHOST_HZ) {
  if (!track?.length) return null;
  const f = Math.max(0, t * hz), i = Math.min(track.length - 1, Math.floor(f)), j = Math.min(track.length - 1, i + 1), u = Math.min(1, f - i);
  const a = track[i], b = track[j];
  return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, z: a[2] + (b[2] - a[2]) * u, done: f >= track.length - 1 };
}
