// Defend the island: mantis alien craft raid the towns in waves and the saucer shoots them
// down. Pure rules and steering math (plain { x, y, z } objects, world units), no three.js.

export const RAID_TOWNS = [
  { id: 'hilo', name: 'Hilo', lat: 19.7090, lon: -155.0800 },
  { id: 'kona', name: 'Kailua-Kona', lat: 19.6370, lon: -155.9890 },
  { id: 'waimea', name: 'Waimea', lat: 20.0230, lon: -155.6700 },
  { id: 'volcano', name: 'Volcano', lat: 19.4300, lon: -155.2360 },
  { id: 'flashtown', name: 'FlashTown', lat: 19.48148, lon: -155.098468 },
];

export const MANTIS = { hp: 3, speed: 14, turn: 1.6, radius: 1.3, fireEvery: 2.2, fireRange: 34, engageRange: 45, keepAway: 12, townDps: 1.6, bounty: 15 };
export const PLAYER = { shield: 100, regen: 9, regenDelay: 3, boltSpeed: 150, boltLife: 1.1, fireRate: 7, hitDamage: 9, assistDeg: 22, assistRange: 140 };
export const TOWN_HP = 100;

/** How many mantis craft in wave n (1-based), and how fast they are. */
export function waveSpec(n) {
  return { count: Math.min(24, 3 + n * 2), speed: MANTIS.speed * (1 + Math.min(0.6, (n - 1) * 0.06)), fireEvery: Math.max(0.9, MANTIS.fireEvery - (n - 1) * 0.12) };
}

/** KDU for clearing wave n. */
export const waveBonus = (n) => 50 * n;

/** Spawn points out at sea on the far side from the town, spread in a fan. */
export function spawnRing(town, count, rand = Math.random, distU = 220) {
  const base = rand() * Math.PI * 2, out = [];
  for (let i = 0; i < count; i++) {
    const a = base + (i - (count - 1) / 2) * 0.09;
    out.push({ x: town.x + Math.cos(a) * (distU + rand() * 30), z: town.z + Math.sin(a) * (distU + rand() * 30) });
  }
  return out;
}

/**
 * Picks what a bolt should home toward: the nearest mantis within the assist cone ahead of the
 * shooter. dir is the unit aim direction. Returns the index or -1.
 */
export function assistTarget(from, dir, targets, { deg = PLAYER.assistDeg, range = PLAYER.assistRange } = {}) {
  const cosMax = Math.cos(deg * Math.PI / 180);
  let best = -1, bd = Infinity;
  targets.forEach((t, i) => {
    if (t.dead) return;
    const dx = t.x - from.x, dy = t.y - from.y, dz = t.z - from.z, d = Math.hypot(dx, dy, dz);
    if (d > range || d < 0.5) return;
    const c = (dx * dir.x + dy * dir.y + dz * dir.z) / d;
    if (c >= cosMax && d < bd) { bd = d; best = i; }
  });
  return best;
}

/** Closest distance from point p to the segment a -> b. */
export function segPointDist(a, b, p) {
  const vx = b.x - a.x, vy = b.y - a.y, vz = b.z - a.z, L2 = vx * vx + vy * vy + vz * vz || 1;
  const u = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy + (p.z - a.z) * vz) / L2));
  return Math.hypot(a.x + vx * u - p.x, a.y + vy * u - p.y, a.z + vz * u - p.z);
}

/**
 * Where a mantis wants to go this moment. Raiding: the town. Near the player: circle at a
 * distance and keep shooting. Returns { goal, mode }.
 */
export function mantisGoal(m, town, player, t) {
  const dp = Math.hypot(player.x - m.x, player.y - m.y, player.z - m.z);
  if (dp < MANTIS.engageRange) {
    const a = t * 0.7 + m.seed * 6.28, r = MANTIS.keepAway + (m.seed * 6) % 6;
    return { mode: 'fight', goal: { x: player.x + Math.cos(a) * r, y: player.y + 2 + Math.sin(t + m.seed) * 2, z: player.z + Math.sin(a) * r } };
  }
  const a = m.seed * 6.28;
  return { mode: 'raid', goal: { x: town.x + Math.cos(a) * 3.5, y: town.y + 4 + (m.seed * 3) % 3, z: town.z + Math.sin(a) * 3.5 } };
}

/** Turn the velocity toward the goal (limited turn rate), keep speed, return the new velocity. */
export function steer(vel, pos, goal, speed, turn, dt) {
  const dx = goal.x - pos.x, dy = goal.y - pos.y, dz = goal.z - pos.z, d = Math.hypot(dx, dy, dz) || 1;
  const want = { x: dx / d * speed, y: dy / d * speed, z: dz / d * speed };
  const k = Math.min(1, turn * dt);
  const v = { x: vel.x + (want.x - vel.x) * k, y: vel.y + (want.y - vel.y) * k, z: vel.z + (want.z - vel.z) * k };
  const s = Math.hypot(v.x, v.y, v.z) || 1, slow = d < 2 ? d / 2 : 1;
  return { x: v.x / s * speed * slow, y: v.y / s * speed * slow, z: v.z / s * speed * slow };
}

/** Shield after taking hits and regenerating. */
export function shieldStep(shield, dt, sinceHit) {
  return sinceHit > PLAYER.regenDelay ? Math.min(PLAYER.shield, shield + PLAYER.regen * dt) : shield;
}
