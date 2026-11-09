#!/usr/bin/env node
// Add a business to public/destinations/destinations.json.
//
//   node scripts/add-destination.mjs "Name" "address or lat,lon" [--kind market] [--town Volcano]
//        [--id custom-id] [--website https://...] [--hours "..."] [--package "a box of ..."] [--dry-run]
//
// Addresses are geocoded with OpenStreetMap Nominatim. Usage policy:
// https://operations.osmfoundation.org/policies/nominatim/ (max 1 request per second,
// identifying User-Agent, no bulk jobs). This script makes at most a few requests per run.
// Always open the printed OSM link and check the pin sits on the building.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeDestinations, slugify, inBigIsland, DEST_KINDS, BIG_ISLAND_BBOX } from '../src/destinations.js';

const FILE = fileURLToPath(new URL('../public/destinations/destinations.json', import.meta.url));
const UA = 'FlyHawaii-add-destination/1.0 (+https://github.com/ozone503-maker/flyhawaii)';
const NOMINATIM = 'https://nominatim.openstreetmap.org';

const args = process.argv.slice(2);
const flags = {}, pos = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dry-run') flags.dryRun = true;
  else if (args[i].startsWith('--')) flags[args[i].slice(2)] = args[++i];
  else pos.push(args[i]);
}
const [name, where] = pos;
if (!name || !where) {
  console.error('Usage: node scripts/add-destination.mjs "Name" "address or lat,lon" [--kind ' + DEST_KINDS.join('|') + '] [--town T] [--dry-run]');
  process.exit(1);
}

let lastCall = 0;
async function nominatim(path, params) {
  const wait = lastCall + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const url = `${NOMINATIM}/${path}?${new URLSearchParams({ format: 'jsonv2', addressdetails: '1', ...params })}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error(`Nominatim ${res.status} for ${url}`);
  return res.json();
}

function kindFromOsm(r) {
  const t = `${r.category || r.class}:${r.type}`;
  if (/marketplace/.test(t)) return 'market';
  if (/amenity:(restaurant|cafe|fast_food|food_court|bar|pub|ice_cream)/.test(t)) return 'restaurant';
  if (/shop:mall|shop:department_store/.test(t)) return 'mall';
  if (/^shop:/.test(t)) return 'shop';
  return null;
}
const townOf = (a = {}) => a.village || a.town || a.city || a.hamlet || a.suburb || a.county || '';

const coord = where.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
let lat, lon, hit = null;
const vb = BIG_ISLAND_BBOX;
if (coord) {
  lat = Number(coord[1]); lon = Number(coord[2]);
  try { hit = await nominatim('reverse', { lat, lon, zoom: '18' }); } catch (e) { console.warn('reverse lookup failed:', e.message); }
} else {
  const base = { limit: '5', countrycodes: 'us', viewbox: `${vb.lonMin},${vb.latMax},${vb.lonMax},${vb.latMin}`, bounded: '1' };
  let results = await nominatim('search', { ...base, q: `${name}, ${where}` });
  if (!results.length) results = await nominatim('search', { ...base, q: where });
  if (!results.length) { console.error(`No match on the Big Island for "${where}". Try a lat,lon instead (right-click in openstreetmap.org > Show address).`); process.exit(2); }
  if (results.length > 1) {
    console.log('Address matches:');
    for (const r of results) console.log(`  ${Number(r.lat).toFixed(6)}, ${Number(r.lon).toFixed(6)}  ${r.category || r.class}:${r.type}  ${r.display_name}`);
  }
  hit = results[0];
  lat = Number(hit.lat); lon = Number(hit.lon);
  // The address often resolves to the plaza or the lot. Look for the business by name right around it.
  const norm = (s) => slugify(s).replace(/-/g, ' ');
  if (!norm(hit.name || '').includes(norm(name))) {
    const d = 0.006;
    const near = await nominatim('search', { limit: '5', q: name, viewbox: `${lon - d},${lat + d},${lon + d},${lat - d}`, bounded: '1' });
    const named = near.find((r) => norm(r.name || '').includes(norm(name)) || norm(name).includes(norm(r.name || '-')));
    if (named) {
      console.log(`Found "${named.name}" (${named.category || named.class}:${named.type}) near that address; using its pin.`);
      hit = named; lat = Number(hit.lat); lon = Number(hit.lon);
    } else console.log(`"${name}" itself is not mapped in OSM near there; using the address pin. Check it.`);
  }
}
lat = Number(lat.toFixed(6)); lon = Number(lon.toFixed(6));
if (!inBigIsland(lat, lon)) { console.error(`${lat}, ${lon} is not on the Big Island. Did you swap lat and lon?`); process.exit(2); }

const data = JSON.parse(readFileSync(FILE, 'utf8'));
const list = Array.isArray(data) ? data : (data.destinations ||= []);
const id = slugify(flags.id || name);
if (list.some((d) => slugify(d.id || d.name) === id)) { console.error(`id "${id}" already exists. Pass --id something-else.`); process.exit(3); }

const kind = flags.kind || (hit && kindFromOsm(hit)) || 'shop';
if (!DEST_KINDS.includes(kind)) { console.error(`--kind must be one of ${DEST_KINDS.join(', ')}`); process.exit(1); }
const osmRef = hit?.osm_type && hit?.osm_id ? `https://www.openstreetmap.org/${hit.osm_type}/${hit.osm_id}` : null;
const entry = {
  id, name, town: flags.town || townOf(hit?.address), kind, lat, lon,
  address: coord ? (hit?.display_name || '') : where,
  ...(flags.website ? { website: flags.website } : {}),
  ...(flags.hours ? { hours: flags.hours } : {}),
  sponsor: false,
  ...(flags.package ? { packageHint: flags.package } : {}),
  source: coord ? 'manual lat,lon' : (osmRef || 'nominatim'),
};
if (!entry.address) delete entry.address;
const warnings = [];
if (!normalizeDestinations([entry], (m) => warnings.push(m)).length) { console.error(warnings.join('\n')); process.exit(2); }

console.log(JSON.stringify(entry, null, 2));
console.log(`\nCheck the pin: https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=19/${lat}/${lon}`);
if (hit && !coord && !kindFromOsm(hit)) console.log('Note: Nominatim matched an address or road, not the business itself. Zoom in and fix lat/lon if the pin is off the building.');
if (flags.dryRun) { console.log('\n--dry-run: file not changed'); process.exit(0); }
list.push(entry);
writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
console.log(`\nAdded "${name}" to public/destinations/destinations.json (${list.length} total). Run npm test before committing.`);
