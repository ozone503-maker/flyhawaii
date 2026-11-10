// Per-business regulars: delivery counts, relationship tiers, tip bonuses
// and greeter lines. Pure helpers so they can be unit tested.
// Persist with the versioned localStorage key; loadRegulars must tolerate
// missing, unversioned or junk data without throwing.

export const REGULARS_KEY = 'fh_regulars_v1';
export const REGULARS_VERSION = 1;

export const TIERS = [
  { id: 'stranger', label: 'Stranger', min: 0, tip: 0, pips: 0, rank: 0 },
  { id: 'familiar', label: 'Familiar', min: 3, tip: 0.10, pips: 1, rank: 1 },
  { id: 'regular', label: 'Regular', min: 8, tip: 0.20, pips: 2, rank: 2 },
  { id: 'ohana', label: 'Ohana', min: 15, tip: 0.35, pips: 3, rank: 3 },
];

export const TIER_IDS = TIERS.map((t) => t.id);

// Fallback lines when a business has no tierLines of its own. Destinations
// data can override these with a top-level greeterLines object.
export const DEFAULT_GREETER_LINES = {
  stranger: [
    'Ho, first time at this stop? Mahalo for coming',
    'Appreciate you flying out. Here is your drop',
    'New face! Welcome. We been waiting on this',
  ],
  familiar: [
    'Eh, good to see you again. Mahalo plenty',
    'You getting the hang of these hills',
    'Back already? We like that',
  ],
  regular: [
    'Our regular! We set this aside for you',
    'Knew you would make it. Kudokens coming your way',
    'You one of us now. Mahalo for always showing up',
  ],
  ohana: [
    'Family! Whatever you need, you got it',
    'Ohana rate today. Come back anytime, yeah?',
    'You family now. Come eat after you land the next one',
  ],
};

export function emptyRegulars() {
  return { v: REGULARS_VERSION, counts: {} };
}

function cleanCount(n) {
  const c = Math.floor(Number(n));
  if (!Number.isFinite(c) || c <= 0) return 0;
  return Math.min(9999, c);
}

/**
 * Accepts a JSON string, a parsed object, or nothing. Always returns a
 * { v, counts } store. Unversioned maps of id -> count still load. Future
 * versions keep any usable counts rather than wiping progress.
 */
export function loadRegulars(raw) {
  const out = emptyRegulars();
  if (raw == null || raw === '') return out;
  let data = raw;
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw); } catch { return out; }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return out;
  let src = data.counts;
  if (!src || typeof src !== 'object' || Array.isArray(src)) {
    const { v, counts, ...rest } = data;
    src = (v == null && counts == null) ? rest : {};
  }
  for (const [id, n] of Object.entries(src)) {
    if (!id || id === 'v' || id === 'counts') continue;
    const c = cleanCount(n);
    if (c) out.counts[id] = c;
  }
  return out;
}

export function saveRegulars(store) {
  const counts = {};
  const src = store?.counts && typeof store.counts === 'object' ? store.counts : {};
  for (const [id, n] of Object.entries(src)) {
    const c = cleanCount(n);
    if (c) counts[id] = c;
  }
  return JSON.stringify({ v: REGULARS_VERSION, counts });
}

export function getCount(store, id) {
  if (!id || !store?.counts) return 0;
  return cleanCount(store.counts[id]);
}

export function recordVisit(store, id) {
  const next = loadRegulars(store && typeof store === 'object' ? JSON.stringify(store) : store);
  if (!id) return next;
  next.counts[id] = getCount(next, id) + 1;
  return next;
}

/** Count a completed job at both ends (pickup and dropoff). */
export function recordJob(store, fromId, toId) {
  let next = recordVisit(store, fromId);
  if (toId && toId !== fromId) next = recordVisit(next, toId);
  return next;
}

export function tierFor(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  let t = TIERS[0];
  for (const x of TIERS) if (n >= x.min) t = x;
  return t;
}

export function tipBonus(pay, count) {
  const tip = tierFor(count).tip;
  const p = Number(pay);
  if (!Number.isFinite(p) || p <= 0 || tip <= 0) return 0;
  return Math.max(0, Math.round(p * tip));
}

export function specialEligible(count) {
  return tierFor(count).id === 'ohana';
}

export function nextTier(count) {
  const t = tierFor(count);
  const i = TIERS.findIndex((x) => x.id === t.id);
  return i >= 0 && i < TIERS.length - 1 ? TIERS[i + 1] : null;
}

function cleanLines(v) {
  return Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter(Boolean) : [];
}

/** Merge file-level greeterLines with the built-in fallbacks. */
export function mergeGreeterLines(data) {
  const src = data?.greeterLines && typeof data.greeterLines === 'object' ? data.greeterLines : {};
  const out = {};
  for (const t of TIERS) {
    const lines = cleanLines(src[t.id]);
    out[t.id] = lines.length ? lines : DEFAULT_GREETER_LINES[t.id].slice();
  }
  return out;
}

/**
 * A greeter line for this business and tier. Prefers local.tierLines[tier],
 * then file-level / default tier lines, then the local's generic lines.
 */
export function pickGreeting({ local, tier, linesByTier, rand = Math.random } = {}) {
  const id = tier?.id || 'stranger';
  const pools = [local?.tierLines?.[id], linesByTier?.[id], local?.lines, DEFAULT_GREETER_LINES[id]];
  for (const pool of pools) {
    const lines = cleanLines(pool);
    if (lines.length) return lines[Math.floor(rand() * lines.length) % lines.length];
  }
  return '';
}
