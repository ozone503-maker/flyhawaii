// Job offer board: four gig-style offers drawn from the destinations list.
// Pure helpers so pay and offer mixes can be unit tested.
import { distanceKm, packageFor, MIN_JOB_KM } from './destinations.js';
import { getCount, specialEligible, tierFor } from './regulars.js';

export const SPECIAL_PAY_MULT = 1.5;
export const OHANA_SPECIAL_CHANCE = 0.4;
import { CRUISE } from './flight-speed.js';

export const OFFER_COUNT = 4;
export const REROLL_COOLDOWN = 8; // seconds
export const PAY = { base: 15, perLegKm: 1.6, perDeadheadKm: 0.6, round: 5 };
export const TAGS = {
  rush: { id: 'rush', label: 'Rush', mult: 1.3, chance: 0.22 },
  fragile: { id: 'fragile', label: 'Fragile', mult: 1.15, chance: 0.18 },
  moving: { id: 'moving', label: 'Moving', mult: 1.25, chance: 0 }, // set by moving-jobs.js, never rolled
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
export function makeOffers(list, player, rand = Math.random, { count = OFFER_COUNT, avoid = new Set(), minKm = MIN_JOB_KM, regulars = null, specialChance = OHANA_SPECIAL_CHANCE } = {}) {
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
  const offers = picks.map((p, i) => {
    const tags = [];
    if (rand() < TAGS.rush.chance) tags.push('rush');
    else if (rand() < TAGS.fragile.chance) tags.push('fragile');
    const pay = offerPay(p.legKm, p.deadheadKm, tags, rand() * 2 - 1);
    return decorateOffer({
      key: `${p.from.id}>${p.to.id}`, slot: i + 1, from: p.from, to: p.to,
      legKm: p.legKm, deadheadKm: p.deadheadKm, totalKm: p.totalKm,
      etaSec: offerEtaSec(p.totalKm), pay, tags, pkg: packageFor(p.from, rand),
    }, regulars);
  });
  maybeInsertSpecial(offers, list, player, regulars, rand, { avoid, specialChance });
  return offers;
}

/** Stamp relationship tiers onto an offer for the job board pips. */
export function decorateOffer(offer, regulars) {
  if (!offer) return offer;
  offer.fromTier = tierFor(getCount(regulars, offer.from?.id));
  offer.toTier = tierFor(getCount(regulars, offer.to?.id));
  return offer;
}

/**
 * A higher-paying Ohana run involving a business the player has delivered
 * to at least 15 times. Returns null when none qualify or no valid pair exists.
 */
export function makeSpecialOffer(list, player, regulars, rand = Math.random, { avoid = new Set(), minKm = MIN_JOB_KM } = {}) {
  if (!Array.isArray(list) || !regulars) return null;
  const hosts = list.filter((d) => specialEligible(getCount(regulars, d.id)));
  if (!hosts.length) return null;
  const host = hosts[Math.floor(rand() * hosts.length) % hosts.length];
  const partners = [];
  for (const b of list) {
    if (b.id === host.id) continue;
    const asPickup = rand() < 0.5;
    const from = asPickup ? host : b, to = asPickup ? b : host;
    const legKm = distanceKm(from, to);
    if (legKm < minKm) continue;
    if (avoid.has(`${from.id}>${to.id}`)) continue;
    partners.push({ from, to, legKm, deadheadKm: player ? distanceKm(player, from) : 0 });
  }
  if (!partners.length) {
    for (const b of list) if (b.id !== host.id) {
      const from = host, to = b, legKm = distanceKm(from, to);
      partners.push({ from, to, legKm, deadheadKm: player ? distanceKm(player, from) : 0 });
    }
  }
  if (!partners.length) return null;
  partners.sort((a, b) => b.legKm - a.legKm);
  const pool = partners.slice(0, Math.max(1, Math.ceil(partners.length / 2)));
  const p = pool[Math.floor(rand() * pool.length) % pool.length];
  const pay = Math.max(PAY.round, Math.round(offerPay(p.legKm, p.deadheadKm, [], 0) * SPECIAL_PAY_MULT / PAY.round) * PAY.round);
  return decorateOffer({
    key: `${p.from.id}>${p.to.id}`, from: p.from, to: p.to,
    legKm: p.legKm, deadheadKm: p.deadheadKm, totalKm: p.legKm + p.deadheadKm,
    etaSec: offerEtaSec(p.legKm + p.deadheadKm), pay, tags: [], pkg: packageFor(p.from, rand),
    special: true, specialName: host.name, specialBiz: host.id,
  }, regulars);
}

function maybeInsertSpecial(offers, list, player, regulars, rand, { avoid, specialChance = OHANA_SPECIAL_CHANCE } = {}) {
  if (!regulars || !offers.length || rand() >= specialChance) return offers;
  const special = makeSpecialOffer(list, player, regulars, rand, { avoid });
  if (!special) return offers;
  if (offers.some((o) => o.key === special.key || o.special)) return offers;
  let i = offers.findIndex((o) => o.from.id !== special.specialBiz && o.to.id !== special.specialBiz);
  if (i < 0) i = offers.length - 1;
  special.slot = offers[i].slot;
  offers[i] = special;
  return offers;
}

export function formatKm(km) { return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`; }
