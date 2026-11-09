// Delivery businesses: the real places packages are picked up from and delivered to.
// The list lives in public/businesses/businesses.json so anyone can add a business without
// touching code. See docs/businesses.md. Pure helpers, no DOM or three.js.

// Hawaiʻi Island with a small margin. A business outside this box is almost always a typo
// (swapped lat/lon, a missing minus sign) and is dropped instead of flying you to the ocean.
export const ISLAND_BOUNDS = { latMin: 18.85, latMax: 20.30, lonMin: -156.10, lonMax: -154.75 };

export const BUSINESS_KINDS = ['market', 'restaurant', 'shop', 'mall', 'farm', 'cafe', 'hotel', 'service', 'other'];

export const MIN_JOB_KM = 1.5; // pickup and drop-off must be at least this far apart

function slug(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯʻ‘’']/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function num(v) {
  const n = typeof v === 'string' ? Number(v.trim()) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : NaN;
}

/** Accepts "19.7232, -155.0847" (a Google Maps copy) or separate lat and lon fields. */
export function readCoords(b) {
  if (typeof b?.coords === 'string') {
    const [lat, lon] = b.coords.split(',').map(num);
    return { lat, lon };
  }
  return { lat: num(b?.lat), lon: num(b?.lon) };
}

export function onIsland({ lat, lon }, box = ISLAND_BOUNDS) {
  return lat >= box.latMin && lat <= box.latMax && lon >= box.lonMin && lon <= box.lonMax;
}

function cleanList(v) {
  return Array.isArray(v) ? v.map((s) => String(s || '').trim()).filter(Boolean) : [];
}

/**
 * Accepts { businesses: [...] } or a bare array. Each entry needs a name, a town and
 * coordinates on the island. Bad entries are skipped; `problems` says why, for the console.
 */
export function normalizeBusinesses(data) {
  const list = Array.isArray(data) ? data : Array.isArray(data?.businesses) ? data.businesses : [];
  const seen = new Set();
  const out = [];
  const problems = [];
  list.forEach((b, i) => {
    if (!b || typeof b !== 'object') { problems.push(`#${i + 1}: not an object`); return; }
    const name = String(b.name || '').trim();
    const town = String(b.town || '').trim();
    if (!name) { problems.push(`#${i + 1}: missing name`); return; }
    if (!town) { problems.push(`${name}: missing town`); return; }
    if (b.active === false) return;
    const { lat, lon } = readCoords(b);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) { problems.push(`${name}: missing coordinates`); return; }
    if (!onIsland({ lat, lon })) { problems.push(`${name}: ${lat}, ${lon} is not on Hawaiʻi Island`); return; }
    const id = slug(b.id || name);
    if (seen.has(id)) { problems.push(`${name}: duplicate id "${id}"`); return; }
    seen.add(id);
    const kind = BUSINESS_KINDS.includes(String(b.kind || '').toLowerCase()) ? String(b.kind).toLowerCase() : 'other';
    const local = b.local && typeof b.local === 'object' ? {
      name: String(b.local.name || '').trim(),
      portrait: String(b.local.portrait || '').trim(),
      lines: cleanList(b.local.lines),
    } : null;
    const sponsor = b.sponsor && typeof b.sponsor === 'object' && b.sponsor.active === true ? {
      tagline: String(b.sponsor.tagline || '').trim(),
      url: /^https:\/\//.test(String(b.sponsor.url || '')) ? String(b.sponsor.url) : '',
    } : null;
    out.push({ id, name, town, kind, lat, lon, address: String(b.address || '').trim(),
      packages: cleanList(b.packages), local, sponsor, placeholder: b.placeholder === true });
  });
  return { businesses: out, problems };
}

/** Great-circle distance in km. */
export function distanceKm(a, b) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Picks a pickup and a drop-off at least MIN_JOB_KM apart. Avoids starting where the last
 * job ended when there is a choice. Returns null when fewer than two places qualify.
 */
export function pickJobPair(list, rand = Math.random, { lastId = '', minKm = MIN_JOB_KM } = {}) {
  const all = list || [];
  if (all.length < 2) return null;
  const starts = all.length > 2 ? all.filter((b) => b.id !== lastId) : all;
  for (let tries = 0; tries < 40; tries++) {
    const from = starts[Math.floor(rand() * starts.length) % starts.length];
    const far = all.filter((b) => b !== from && distanceKm(from, b) >= minKm);
    if (!far.length) continue;
    const to = far[Math.floor(rand() * far.length) % far.length];
    return { from, to };
  }
  // Everything is clustered: fall back to any two different places
  const from = all[0], to = all.find((b) => b !== from);
  return to ? { from, to } : null;
}

/** The package for a job: the pickup business's own goods first, else the shared list. */
export function pickPackage(from, fallback, rand = Math.random) {
  const pool = from?.packages?.length ? from.packages : fallback || [];
  return pool.length ? pool[Math.floor(rand() * pool.length) % pool.length] : 'a package';
}
