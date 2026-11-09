// Plug-in destinations: real businesses that jobs pick up from and deliver to.
// Data lives in public/destinations/destinations.json so anyone can edit it
// without touching code. These helpers are pure so they can be unit tested.

export const DEST_KINDS = ['hq', 'own', 'market', 'restaurant', 'mall', 'shop', 'hotel'];

// Island of Hawaiʻi with a small margin. Anything outside is a typo.
export const BIG_ISLAND_BBOX = { latMin: 18.85, latMax: 20.30, lonMin: -156.10, lonMax: -154.75 };

// Jobs shorter than this feel like a hop across the parking lot.
export const MIN_JOB_KM = 1;

const PACKAGES_BY_KIND = {
  hq: ['a crate of KDU tokens', 'a box of FlashTown fruit'],
  own: ['a box of merch', 'a sealed order'],
  market: ['a crate of fresh produce', 'a box of apple bananas', 'a jar of local honey', 'a flat of Kona coffee'],
  restaurant: ['a hot takeout order', 'a catering tray', 'a dessert box (keep it level)'],
  mall: ['shopping bags', 'a gift-wrapped box', 'a returns parcel'],
  shop: ['a small parcel', 'a gift box', 'a special order'],
  hotel: ['a stack of fresh towels', 'a box of leis', 'a guest delivery'],
};

export function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f\u02bb\u02bc']/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function inBigIsland(lat, lon, box = BIG_ISLAND_BBOX) {
  return Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= box.latMin && lat <= box.latMax && lon >= box.lonMin && lon <= box.lonMax;
}

/**
 * Accepts { destinations: [...] } or a bare array. Returns only valid entries,
 * normalized. Problems are reported through warn() and the entry is skipped
 * (bad coords, missing name, duplicate id, enabled: false).
 */
export function normalizeDestinations(data, warn = () => {}) {
  const list = Array.isArray(data) ? data : Array.isArray(data?.destinations) ? data.destinations : [];
  const seen = new Set(), out = [];
  list.forEach((d, i) => {
    const where = `destinations[${i}]`;
    if (!d || typeof d !== 'object') return warn(`${where}: not an object, skipped`);
    const name = typeof d.name === 'string' ? d.name.trim() : '';
    if (!name) return warn(`${where}: missing name, skipped`);
    if (d.enabled === false) return;
    const lat = Number(d.lat), lon = Number(d.lon);
    if (d.lat === undefined || d.lon === undefined || d.lat === null || d.lon === null || !inBigIsland(lat, lon)) {
      return warn(`${where} "${name}": lat/lon ${d.lat}, ${d.lon} is not on the Big Island, skipped`);
    }
    const id = slugify(d.id || name);
    if (!id) return warn(`${where} "${name}": no usable id, skipped`);
    if (seen.has(id)) return warn(`${where} "${name}": duplicate id "${id}", skipped`);
    let kind = String(d.kind || '').trim().toLowerCase();
    if (!DEST_KINDS.includes(kind)) { warn(`${where} "${name}": unknown kind "${d.kind}", using "shop"`); kind = 'shop'; }
    seen.add(id);
    const e = { id, name, town: String(d.town || '').trim(), kind, lat, lon, sponsor: d.sponsor === true, approx: d.approx === true };
    for (const k of ['address', 'website', 'hours', 'packageHint', 'photo', 'source', 'note']) {
      if (typeof d[k] === 'string' && d[k].trim()) e[k] = d[k].trim();
    }
    const clean = (v) => (Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter(Boolean) : []);
    if (clean(d.packages).length) e.packages = clean(d.packages);
    // The local who greets the pilot here: name, a portrait in public/locals/, and their lines
    if (d.local && typeof d.local === 'object' && String(d.local.name || '').trim()) {
      e.local = { name: String(d.local.name).trim(), portrait: String(d.local.portrait || '').trim(), lines: clean(d.local.lines) };
    }
    out.push(e);
  });
  return out;
}

export function distanceKm(a, b) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(h));
}

/** What the player carries: one of the pickup's packages, its packageHint, or a pick by kind. */
export function packageFor(from, rand = Math.random) {
  if (from?.packages?.length) return from.packages[Math.floor(rand() * from.packages.length) % from.packages.length];
  if (from?.packageHint) return from.packageHint;
  const list = PACKAGES_BY_KIND[from?.kind] || PACKAGES_BY_KIND.shop;
  return list[Math.floor(rand() * list.length) % list.length];
}

/**
 * Picks a pickup and a dropoff. They are always different places and, when
 * possible, at least MIN_JOB_KM apart. Avoids repeating the last pair.
 * Returns null when there are fewer than two destinations.
 */
export function pickJob(list, rand = Math.random, { minKm = MIN_JOB_KM, last = null } = {}) {
  if (!Array.isArray(list) || list.length < 2) return null;
  const pairs = [];
  for (const a of list) for (const b of list) if (a.id !== b.id) pairs.push([a, b]);
  const lastKey = last ? `${last.from?.id}>${last.to?.id}` : '';
  const far = pairs.filter(([a, b]) => distanceKm(a, b) >= minKm);
  let pool = far.length ? far : pairs;
  const fresh = pool.filter(([a, b]) => `${a.id}>${b.id}` !== lastKey);
  if (fresh.length) pool = fresh;
  const [from, to] = pool[Math.floor(rand() * pool.length) % pool.length];
  return { from, to, km: distanceKm(from, to), pkg: packageFor(from, rand) };
}
