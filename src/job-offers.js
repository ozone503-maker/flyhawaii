// Job offer board: four gig-style offers drawn from the destinations list.
// Pure helpers so pay and offer mixes can be unit tested.
import { distanceKm, packageFor, MIN_JOB_KM } from './destinations.js';
import { CRUISE } from './flight-speed.js';

export const OFFER_COUNT = 4;
export const REROLL_COOLDOWN = 8; // seconds
export const PAY = { base: 15, perLegKm: 1.6, perDeadheadKm: 0.6, round: 5 };
export const TAGS = {
  rush: { id: 'rush', label: 'Rush', mult: 1.3, chance: 0.22 },
  fragile: { id: 'fragile', label: 'Fragile', mult: 1.15, chance: 0.18 },
};
const UNIT_M = 100;
const HOVER_S = 6; // two beam-ups plus lining up

/**
 * Pay in KDU. Scales with the whole trip: player -> pickup (deadhead, paid
 * less) and pickup -> dropoff. Tags multiply. jitter in [-1,1] adds up to 8%.
 */
export function offerPay(legKm, deadheadKm, tags = [], jitter = 0) {
  let pay = PAY.base + PAY.perLegKm * Math.max(0, legKm) + PAY.perDeadheadKm * Math.max(0, deadheadKm);
  for (const t of tags) pay *= TAGS[t]?.mult || 1;
  pay *= 1 + 0.08 * Math.max(-1, Math.min(1, jitter));
  return Math.max(PAY.round, Math.round(pay / PAY.round) * PAY.round);
}

/** Rough game-time minutes at a relaxed cruise, plus time to beam up and down. */
export function offerEtaSec(totalKm) {
  return Math.round(totalKm * 1000 / UNIT_M / (CRUISE * 0.8) + HOVER_S);
}
export function formatEta(sec) {
  if (sec < 58) return `~${Math.max(5, Math.round(sec / 5) * 5)} s`;
  if (sec < 68) return '~1 min';
  const m = Math.floor(sec / 60), s = Math.round((sec % 60) / 15) * 15;
  return s === 60 ? `~${m + 1} min` : s ? `~${m} min ${s} s` : `~${m} min`;
}

/**
 * Up to four offers. All valid pairs (at least MIN_JOB_KM apart, when any
 * exist) are sorted by total trip length and split into four bands, one offer
 * from each band, so the board mixes short hops with long hauls.
 * `avoid` is a set of "from>to" keys to skip when possible (reroll).
 */
export function makeOffers(list, player, rand = Math.random, { count = OFFER_COUNT, avoid = new Set(), minKm = MIN_JOB_KM } = {}) {
  if (!Array.isArray(list) || list.length < 2) return [];
  let pairs = [];
  for (const a of list) for (const b of list) if (a.id !== b.id) pairs.push([a, b, distanceKm(a, b)]);
  const far = pairs.filter((p) => p[2] >= minKm);
  if (far.length) pairs = far;
  const fresh = pairs.filter(([a, b]) => !avoid.has(`${a.id}>${b.id}`));
  if (fresh.length >= count) pairs = fresh;
  const scored = pairs.map(([from, to, legKm]) => {
    const deadheadKm = player ? distanceKm(player, from) : 0;
    return { from, to, legKm, deadheadKm, totalKm: legKm + deadheadKm };
  }).sort((p, q) => p.totalKm - q.totalKm);
  const n = Math.min(count, scored.length), picks = [], used = new Set();
  for (let i = 0; i < n; i++) {
    const lo = Math.floor(i * scored.length / n), hi = Math.floor((i + 1) * scored.length / n);
    let band = scored.slice(lo, hi).filter((p) => !used.has(p.from.id + '>' + p.to.id) && !picks.some((q) => q.from.id === p.from.id));
    if (!band.length) band = scored.slice(lo, hi).filter((p) => !used.has(p.from.id + '>' + p.to.id));
    if (!band.length) continue;
    const p = band[Math.floor(rand() * band.length) % band.length];
    used.add(p.from.id + '>' + p.to.id); picks.push(p);
  }
  return picks.map((p, i) => {
    const tags = [];
    if (rand() < TAGS.rush.chance) tags.push('rush');
    else if (rand() < TAGS.fragile.chance) tags.push('fragile');
    const pay = offerPay(p.legKm, p.deadheadKm, tags, rand() * 2 - 1);
    return {
      key: `${p.from.id}>${p.to.id}`, slot: i + 1, from: p.from, to: p.to,
      legKm: p.legKm, deadheadKm: p.deadheadKm, totalKm: p.totalKm,
      etaSec: offerEtaSec(p.totalKm), pay, tags, pkg: packageFor(p.from, rand),
    };
  });
}

export function formatKm(km) { return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`; }
