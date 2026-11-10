// Defend the island: mantis alien craft raid the towns in waves and the saucer shoots them
// down. Pure rules and steering math (plain { x, y, z } objects, world units), no three.js.

export const RAID_TOWNS = [
  { id: 'hilo', name: 'Hilo', lat: 19.7090, lon: -155.0800 },
  { id: 'kona', name: 'Kailua-Kona', lat: 19.6370, lon: -155.9890 },
  { id: 'waimea', name: 'Waimea', lat: 20.0230, lon: -155.6700 },
  { id: 'volcano', name: 'Volcano', lat: 19.4300, lon: -155.2360 },
  { id: 'flashtown', name: 'FlashTown', lat: 19.48148, lon: -155.098468 },
];

export const MANTIS = { hp: 3, speed: 14, turn: 1.6, radius: 1.3, fireEvery: 2.2, fireRange: 34, engageRange: 80, keepAway: 10, townDps: 1.6, bounty: 15 };
export const PLAYER = { shield: 100, regen: 9, regenDelay: 3, boltSpeed: 150, boltLife: 1.1, fireRate: 7, hitDamage: 9, assistDeg: 22, assistRange: 140 };
export const TOWN_HP = 100;

/** How many mantis craft in wave n (1-based), and how fast they are. */
export function waveSpec(n) {
  return { count: Math.min(24, 3 + n * 2), speed: MANTIS.speed * (1 + Math.min(0.6, (n - 1) * 0.06)), fireEvery: Math.max(0.9, MANTIS.fireEvery - (n - 1) * 0.12) };
}

/** KDU for clearing wave n. */
export const waveBonus = (n) => 50 * n;

/** Spawn points out at sea on the far side from the town, spread in a fan. */
export function spawnRing(town, count, rand = Math.random, distU = 70) {
  const base = rand() * Math.PI * 2, out = [];
  for (let i = 0; i < count; i++) {
    const a = base + (i - (count - 1) / 2) * 0.12;
    out.push({ x: town.x + Math.cos(a) * (distU + rand() * 15), z: town.z + Math.sin(a) * (distU + rand() * 15) });
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
export function mantisGoal(m, town, player, t, fwd = null, playerSpeed = 0) {
  const dp = Math.hypot(player.x - m.x, player.y - m.y, player.z - m.z);
  if (dp < MANTIS.engageRange || fwd) {
    // dogfight out in front of the saucer, weaving across its nose, so you can see them
    const fx = fwd ? fwd.x : 0, fz = fwd ? fwd.z : 0, ahead = MANTIS.keepAway + (m.seed * 8) % 8 + playerSpeed * 0.35;
    const sx = -fz, sz = fx, weave = Math.sin(t * 0.8 + m.seed * 6.28) * (4 + m.seed * 5);
    const cx = player.x + fx * ahead + sx * weave, cz = player.z + fz * ahead + sz * weave;
    if (!fwd) { const a = t * 0.7 + m.seed * 6.28; return { mode: 'fight', goal: { x: player.x + Math.cos(a) * ahead, y: player.y + 2, z: player.z + Math.sin(a) * ahead } }; }
    return { mode: 'fight', goal: { x: cx, y: player.y + 1.5 + Math.sin(t * 1.3 + m.seed * 9) * 2.5, z: cz } };
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

/** Swarm speed this frame: never slower than the saucer, so they stay in front of you. */
export function swarmSpeed(base, playerSpeed, dist) {
  const catchUp = dist > 40 ? 1 + Math.min(2, (dist - 40) / 40) : 1;
  return Math.max(base, playerSpeed * 1.15 + 6) * catchUp;
}

/**
 * The last craft of a wave runs. Each wave it is faster (still catchable at full boost), jinks
 * harder and dodges more of your shots. Speeds are world units per second (boost is 80).
 */
export function escapeSpec(wave) {
  return {
    speed: Math.min(74, 65 + wave),         // you need boost (80) to close on it
    jink: Math.min(12, 2 + wave * 1.2),     // sideways weave amplitude, units: showier each wave
    jinkHz: Math.min(1.2, 0.35 + wave * 0.08),
    dodge: Math.min(0.3, 0.08 + wave * 0.03), // a few flashy sidesteps, never a wall
    turn: Math.min(4, 1.8 + wave * 0.2),
    burst: Math.min(1.2, 1.0 + wave * 0.02), // how hard it kicks when you are right on it
  };
}

/**
 * Runner speed: just under full boost, so cruising never closes the gap and boosting closes it
 * slowly. Right on its tail it kicks to almost your boost speed for a moment. If you fall far
 * behind it eases off so you can always get back into it.
 */
export function runnerSpeed(spec, dist, playerSpeed) {
  if (dist > 100) return Math.min(spec.speed, Math.max(25, playerSpeed) * 0.6);
  if (dist < 12) return Math.min(78, spec.speed * 1.1);
  return spec.speed;
}

/** The runner can never get away before this many seconds, so every chase gets a real run. */
export const CHASE_MIN_S = 20;
/** After that it gets away if you lose it this far behind, or after this long. */
export const ESCAPE_DIST_U = 200, ESCAPE_MAX_S = 60;
export const QUICK_CATCH_S = 15;

/** Catch bonus: 40 + 20 x wave, up to double for a quick catch, times the catch streak. */
export function caughtBonus(wave, secs = 20, streak = 0) {
  const base = 40 + 20 * wave, quick = 1 + Math.max(0, Math.min(1, 1 - secs / 20));
  return Math.round(base * quick * streakMult(streak) / 5) * 5;
}
/** Can the runner get away now? Never before CHASE_MIN_S. */
export const runnerEscapes = (secs, dist) => secs >= CHASE_MIN_S && (dist > ESCAPE_DIST_U || secs > ESCAPE_MAX_S);
/** Every quick catch in a row adds 25%, up to double. */
export const streakMult = (streak) => 1 + Math.min(4, Math.max(0, streak)) * 0.25;

/**
 * Where the runner heads: away from you, but over the island, never out to sea. It weighs 16
 * headings by how much they get away from you, how close they are to where it is already going,
 * whether there is land under them, and how rugged that land is (valleys and ridges beat flat
 * pasture), then skims low over the ground along the winner so you have to chase it through the
 * terrain. elevU(x, z): ground height in world units, negative at sea.
 */
export function escapeGoal(m, player, t, spec, elevU) {
  let ax = m.x - player.x, az = m.z - player.z; const L = Math.hypot(ax, az) || 1; ax /= L; az /= L;
  const vl = Math.hypot(m.v?.x || 0, m.v?.z || 0), hx = vl > 1 ? m.v.x / vl : ax, hz = vl > 1 ? m.v.z / vl : az;
  let best = null, bs = -Infinity;
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
    const overSea = elevU(m.x, m.z) <= 0.05; // out over the water: get back to the island first
    let sc = (L < 40 ? 2.5 : 1.0) * (dx * ax + dz * az) + (overSea ? 0.3 : 1.2) * (dx * hx + dz * hz), prev = null, rough = 0;
    for (const r of [10, 22, 36, 52]) {
      const e = elevU(m.x + dx * r, m.z + dz * r);
      sc += e > 0.05 ? (overSea ? 1.2 : 0.5) : -2.5; // land good, ocean bad
      if (prev !== null) rough += Math.abs(e - prev); prev = e;
    }
    sc += Math.min(1.2, rough * 0.25);
    if (sc > bs) { bs = sc; best = { dx, dz }; }
  }
  const sx = -best.dz, sz = best.dx, w = Math.sin(t * spec.jinkHz * 6.28 + m.seed * 9) * spec.jink;
  const gx = m.x + best.dx * 30 + sx * w, gz = m.z + best.dz * 30 + sz * w;
  const floor = Math.max(0, elevU(m.x + best.dx * 8, m.z + best.dz * 8), elevU(m.x + best.dx * 18, m.z + best.dz * 18), elevU(gx, gz));
  return { x: gx, y: floor + 2.2 + Math.sin(t * spec.jinkHz * 4.1 + m.seed) * 0.8, z: gz };
}

/** Lock-on to the runner only when you are on its tail: close and lined up. */
export const RUNNER_LOCK = { range: 28, deg: 12 };

/**
 * Target lock for the one missile you get per chase: keep the runner within LOCK.deg of your
 * nose (left and right) and LOCK.range for LOCK.time seconds in total. Slipping out drains it
 * slowly, and a full lock holds. Returns the new progress 0..1.
 */
export const LOCK = { range: 90, deg: 30, time: 1.2, autoFire: 0.4 };
export const MISSILE = { speed: 115, turn: 7, life: 8, hitR: 1.6 };
export function lockStep(progress, dt, from, aim, target, lock = LOCK) {
  const dx = target.x - from.x, dz = target.z - from.z, d = Math.hypot(dx, dz), al = Math.hypot(aim.x, aim.z) || 1;
  const inCone = d <= lock.range && d > 0.5 && (dx * aim.x + dz * aim.z) / (d * al) >= Math.cos(lock.deg * Math.PI / 180);
  if (progress >= 1) return 1; // once locked it stays locked until the missile goes
  return Math.max(0, Math.min(1, progress + (inCone ? dt / lock.time : -0.5 * dt / lock.time)));
}
