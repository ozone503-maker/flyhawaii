// Bakes OpenStreetMap waterways (rivers, streams) and waterfalls for the Big Island via the Overpass API.
// Output: public/terrain/waterways.json  (ODbL, (c) OpenStreetMap contributors)
import fs from 'node:fs';
const meta = JSON.parse(fs.readFileSync('public/terrain/meta.json', 'utf8'));
const OUT = 'public/terrain/waterways.json';
if (fs.existsSync(OUT) && !process.argv.includes('--force')) { console.log('waterways already baked'); process.exit(0); }
const bbox = `${meta.lat0},${meta.lon0},${meta.lat1},${meta.lon1}`;
const q = `[out:json][timeout:180];(way["waterway"~"^(river|stream)$"](${bbox});node["waterway"="waterfall"](${bbox});node["natural"="waterfall"](${bbox}););out geom;`;
const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
let data;
for (const ep of endpoints) {
  try {
    const r = await fetch(ep, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'FlyHawaii-prototype-bake/0.1' } });
    if (!r.ok) throw new Error(r.status); data = await r.json(); break;
  } catch (e) { console.warn('overpass failed', ep, e.message); }
}
if (!data) throw new Error('no overpass data');
const ways = [], falls = [];
for (const el of data.elements) {
  if (el.type === 'way' && el.geometry) {
    ways.push({ t: el.tags.waterway === 'river' ? 'r' : 's', n: el.tags.name || '', i: el.tags.intermittent === 'yes' ? 1 : 0,
      p: el.geometry.map((g) => [+g.lon.toFixed(5), +g.lat.toFixed(5)]) });
  } else if (el.type === 'node') falls.push({ n: el.tags.name || '', p: [+el.lon.toFixed(5), +el.lat.toFixed(5)] });
}
fs.writeFileSync(OUT, JSON.stringify({ source: 'OpenStreetMap contributors (ODbL) via Overpass API', fetched: new Date().toISOString(), ways, falls }));
console.log('ways', ways.length, 'rivers', ways.filter((w) => w.t === 'r').length, 'falls', falls.length, 'bytes', fs.statSync(OUT).size);
