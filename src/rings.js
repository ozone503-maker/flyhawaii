// KDU fly-through rings. Pure helpers (no three.js) so they can be unit tested.
// World units: 1 unit = 100 m. Radii are in world units.

// Parked until collection feels right. Flip to true to bring rings back.
// When false, nothing spawns, renders, or runs per-frame, and the old 1 KDU tokens stay gone.
export const RINGS_ENABLED = false;

// Big easy rings pay a little, small rare ones pay a lot.
export const RING_TIERS = [
  { id: 'blue',  value: 5,  radius: 2.6, weight: 52, color: 0x1ec8ff, glow: 0x0a6cff, label: 'KDU' },
  { id: 'green', value: 10, radius: 2.0, weight: 30, color: 0x39ff9e, glow: 0x0fbf6a, label: 'KDU' },
  { id: 'gold',  value: 25, radius: 1.45, weight: 14, color: 0xffc94a, glow: 0xff9d1a, label: 'KDU' },
  { id: 'prism', value: 50, radius: 1.0, weight: 4,  color: 0xff6ad5, glow: 0xb04bff, label: 'KDU', prismatic: true },
];
export const tierById = (id) => RING_TIERS.find((t) => t.id === id) || RING_TIERS[0];

export const COMBO_WINDOW = 4;   // seconds between rings to keep a streak alive
export const COMBO_STEP = 2;     // extra KDU per ring in a streak
export const COMBO_CAP = 20;     // max streak extra per ring
export const CHAIN_BONUS = 10;   // per ring, paid once when a whole chain is cleared
export const SHIP_PAD = 0.35;    // the disc has some size, so be a bit generous

/** Weighted random tier. rand() in [0,1). */
export function pickTier(rand = Math.random, tiers = RING_TIERS) {
  const total = tiers.reduce((s, t) => s + t.weight, 0);
  let r = rand() * total;
  for (const t of tiers) { if ((r -= t.weight) < 0) return t; }
  return tiers[tiers.length - 1];
}

/**
 * Did the segment p0 -> p1 pass through the ring? The ring is a disc with
 * center c, unit normal n and radius r. True only when the segment crosses
 * the ring plane and the crossing point is inside the radius, so flying next
 * to a ring or over its top does not count. Returns the crossing fraction t
 * in [0,1] or -1.
 */
export function crossRing(ring, p0, p1, pad = SHIP_PAD) {
  const { c, n, r } = ring;
  const d0 = (p0.x - c.x) * n.x + (p0.y - c.y) * n.y + (p0.z - c.z) * n.z;
  const d1 = (p1.x - c.x) * n.x + (p1.y - c.y) * n.y + (p1.z - c.z) * n.z;
  if (d0 === 0 && d1 === 0) return -1;              // sliding along the plane
  if ((d0 > 0 && d1 > 0) || (d0 < 0 && d1 < 0)) return -1;
  const t = d0 / (d0 - d1);
  const x = p0.x + (p1.x - p0.x) * t - c.x, y = p0.y + (p1.y - p0.y) * t - c.y, z = p0.z + (p1.z - p0.z) * t - c.z;
  return x * x + y * y + z * z <= (r + pad) * (r + pad) ? t : -1;
}

/** KDU for one ring given how many rings in a row (1 = first). */
export function ringReward(tier, streak = 1) {
  const extra = Math.min(COMBO_CAP, Math.max(0, streak - 1) * COMBO_STEP);
  return tier.value + extra;
}

/** Streak after a ring hit at time now, given the last hit time. */
export function nextStreak(streak, lastHitAt, now, window = COMBO_WINDOW) {
  return lastHitAt != null && now - lastHitAt <= window ? streak + 1 : 1;
}

export const chainBonus = (n) => CHAIN_BONUS * n;

/** Horizontal unit normal for a heading (radians, same as ship yaw). */
export function headingNormal(yaw) {
  return { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) };
}

/**
 * Plan ring spots along a leg from a to b (world x/z), every `spacing` units,
 * skipping the first and last `margin` units. Each spot faces along the leg.
 * groundAt(x,z) returns ground height in world units; heights stay flyable.
 */
export function ringsAlong(a, b, { spacing = 40, margin = 12, groundAt = () => 0, rand = Math.random, minAgl = 2.5, maxAgl = 7, maxY = 60 } = {}) {
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
  if (len < margin * 2 + 1) return [];
  const yaw = Math.atan2(-dx, -dz), out = [];
  for (let s = margin; s <= len - margin; s += spacing) {
    const f = s / len, side = (rand() - 0.5) * 6;
    const x = a.x + dx * f + (dz / len) * side, z = a.z + dz * f - (dx / len) * side;
    const y = Math.min(maxY, groundAt(x, z) + minAgl + rand() * (maxAgl - minAgl));
    out.push({ x, y, z, yaw });
  }
  return out;
}

/** A short gentle arc of n rings starting at p heading yaw. */
export function chainSpots(p, yaw, n = 5, { gap = 7, curve = 0.12, climb = 0.4, groundAt = () => 0, minAgl = 2.5 } = {}) {
  const out = []; let x = p.x, z = p.z, y = p.y, h = yaw;
  for (let i = 0; i < n; i++) {
    const g = groundAt(x, z) + minAgl;
    out.push({ x, y: Math.max(y, g), z, yaw: h });
    h += curve; x += -Math.sin(h) * gap; z += -Math.cos(h) * gap; y += climb;
  }
  return out;
}
