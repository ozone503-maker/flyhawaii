// Passing showers on the windward side and when a rainbow shows. Pure math in world units.
// Trade-wind showers form over the ocean east of Hilo and Puna, drift west-southwest onto the
// slopes and rain themselves out before the saddle. Rainbows sit opposite the sun at about 42
// degrees, so you see one when the sun is behind you, below 42 degrees, and rain is ahead.

export const RAINBOW_DEG = 42;
export const WIND = { x: -0.32, z: 0.08 }; // world units per second, east-northeast trade wind

/**
 * Shower cells at time t. box: the windward strip they live in { x0, x1, z0, z1 } (they enter at
 * x1 and fade out at x0). Returns [{ x, z, r, k }] with r the radius and k the strength 0..1.
 */
export function showerCells(t, box, n = 6) {
  const out = [], span = box.x1 - box.x0, life = span / -WIND.x;
  for (let i = 0; i < n; i++) {
    const seed = i * 7.31, u = ((t + seed * life / n) % life + life) % life / life; // 0 at the coast, 1 at the far side
    const z = box.z0 + (box.z1 - box.z0) * ((Math.sin(seed * 3.7 + Math.floor((t + seed * life / n) / life) * 1.3) + 1) / 2);
    const x = box.x1 - u * span;
    const k = Math.sin(Math.PI * Math.min(1, u * 1.15)) ** 0.7; // builds, rains, fades
    out.push({ x, z: z + WIND.z * u * life * 0.3, r: 18 + (i % 3) * 7, k });
  }
  return out;
}

/** 0..1 how hard it is raining at (x, z). */
export function wetness(cells, x, z) {
  let w = 0;
  for (const c of cells) { const d = Math.hypot(x - c.x, z - c.z) / c.r; if (d < 1) w = Math.max(w, (1 - d * d) * c.k); }
  return w;
}

/**
 * Rainbow strength 0..1 for a camera at cam { x, y, z } with the sun direction sun { x, y, z }
 * (unit vector toward the sun). Needs the sun up but below 42 degrees and a shower roughly
 * opposite the sun within reach. Returns { k, cell } with the shower it hangs on.
 */
export function rainbowFor(cam, sun, cells, reach = 260) {
  const el = Math.asin(Math.max(-1, Math.min(1, sun.y))) * 180 / Math.PI;
  if (el <= 1 || el >= RAINBOW_DEG) return { k: 0, cell: null };
  const sunK = Math.min(1, (el - 1) / 6) * Math.min(1, (RAINBOW_DEG - el) / 8);
  const ax = -sun.x, az = -sun.z, al = Math.hypot(ax, az) || 1; // antisolar direction on the ground
  let best = { k: 0, cell: null };
  for (const c of cells) {
    const dx = c.x - cam.x, dz = c.z - cam.z, d = Math.hypot(dx, dz);
    if (d > reach || d < 2 || c.k < 0.2) continue;
    const cos = (dx * ax + dz * az) / (d * al);
    const k = sunK * c.k * Math.max(0, (cos - 0.55) / 0.45) * Math.min(1, (reach - d) / 60);
    if (k > best.k) best = { k, cell: c };
  }
  return best;
}
