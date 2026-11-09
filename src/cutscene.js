// Arrival cutscene timeline. Pure math so it is testable and works for any
// destination: everything is relative to the disc and the ground under it.

export const CUTSCENE_DURATION = { pickup: 3.4, delivery: 4.6 };
export const SKIP_OUTRO = 0.35; // seconds left after a skip so the camera eases home

export const cutscenePreference = {
  enabled(stored) { return stored !== 'off'; },
};

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);

/** Beat weights 0..1 for a cutscene of `kind` at time `t` seconds. */
export function cutsceneBeats(kind, t, dur = CUTSCENE_DURATION[kind] || 3.5) {
  const d = Math.max(0.5, dur);
  const deliver = kind === 'delivery';
  // camera: ease in over 0.6s, hold, ease back over the last 0.55s
  const cam = smooth(0, 0.6, t) * (1 - smooth(d - 0.55, d, t));
  const orbit = clamp01(t / d);
  // beam opens, carries the package, then closes
  const beamOn = smooth(0.35, 0.75, t) * (1 - smooth(deliver ? 2.3 : 2.4, deliver ? 2.7 : 2.8, t));
  const cargo = smooth(0.7, 2.2, t); // 0 = start of travel, 1 = arrived
  const burstT = deliver ? 2.15 : 2.25;
  const burst = t < burstT ? 0 : clamp01((t - burstT) / 1.1);
  const coins = deliver ? clamp01((t - 2.55) / 1.45) : 0;
  return { cam, orbit, beam: beamOn, cargo, burst, coins, done: t >= d };
}

/** Camera offset from the disc for the cinematic orbit. */
export function orbitOffset(p, { startAngle = 0, sweep = 2.0, radius = 5.5, height = 1.6 } = {}) {
  const a = startAngle + sweep * easeOut(p) * 0.85 + sweep * 0.15 * p;
  const r = radius * (1 - 0.12 * Math.sin(Math.PI * clamp01(p)));
  return [Math.sin(a) * r, height + 0.5 * Math.sin(Math.PI * clamp01(p)), Math.cos(a) * r];
}

/** Integer count-up for the KDU counter. */
export function countUp(from, to, p) {
  return Math.round(from + (to - from) * easeOut(p));
}

/** Pure clock: advances only while running and not paused; skip jumps to the outro. */
export function createCutsceneClock(kind, dur = CUTSCENE_DURATION[kind] || 3.5) {
  let t = 0, skipped = false;
  return {
    kind, dur,
    get t() { return t; },
    get skipped() { return skipped; },
    tick(dt, paused = false) { if (!paused) t = Math.min(dur, t + Math.max(0, dt)); return t >= dur; },
    skip() { if (t < dur - SKIP_OUTRO) { t = dur - SKIP_OUTRO; skipped = true; } },
    get done() { return t >= dur; },
  };
}

/** Screen path for a flying coin: a curved arc from start to the counter. */
export function coinPath(p, from, to, lift = 120) {
  const e = easeOut(p) * 0.6 + p * p * 0.4;
  const x = from[0] + (to[0] - from[0]) * e;
  const y = from[1] + (to[1] - from[1]) * e - Math.sin(Math.PI * clamp01(p)) * lift;
  return [x, y, 1 - 0.55 * clamp01(p)];
}
