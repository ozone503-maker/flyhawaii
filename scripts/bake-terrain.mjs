// Bakes a Big Island heightmap from free AWS Terrain Tiles (Mapzen terrarium, no key).
// Output: public/terrain/height.bin (Int16 meters, row 0 = north) + meta.json
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const OUT = path.resolve('public/terrain');
const N = 1024;              // output grid size
const Z = 11;                // tile zoom
const LAT0 = 18.85, LAT1 = 20.33;            // south, north
const LATC = (LAT0 + LAT1) / 2;
const spanKm = (LAT1 - LAT0) * 111.0;
const lonSpan = spanKm / (111.32 * Math.cos(LATC * Math.PI / 180));
const LONC = -155.47;
const LON0 = LONC - lonSpan / 2, LON1 = LONC + lonSpan / 2;

if (fs.existsSync(path.join(OUT, 'height.bin')) && !process.argv.includes('--force')) {
  console.log('terrain already baked, use --force to rebake'); process.exit(0);
}
fs.mkdirSync(OUT, { recursive: true });

const lon2x = (lon) => (lon + 180) / 360 * 2 ** Z;
const lat2y = (lat) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** Z; };

const tx0 = Math.floor(lon2x(LON0)), tx1 = Math.floor(lon2x(LON1));
const ty0 = Math.floor(lat2y(LAT1)), ty1 = Math.floor(lat2y(LAT0));
const tiles = new Map();
const jobs = [];
for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) jobs.push([x, y]);
console.log(`fetching ${jobs.length} tiles at z${Z}`);
async function fetchTile([x, y]) {
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`;
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(url); if (!r.ok) throw new Error(r.status);
      const png = PNG.sync.read(Buffer.from(await r.arrayBuffer()));
      tiles.set(`${x}/${y}`, png); return;
    } catch (e) { if (a === 3) throw e; }
  }
}
for (let i = 0; i < jobs.length; i += 8) await Promise.all(jobs.slice(i, i + 8).map(fetchTile));

function elevAtPixel(px, py) { // global pixel coords at zoom Z
  const x = Math.floor(px / 256), y = Math.floor(py / 256);
  const t = tiles.get(`${x}/${y}`); if (!t) return -3000;
  const ix = Math.min(255, Math.max(0, Math.floor(px - x * 256)));
  const iy = Math.min(255, Math.max(0, Math.floor(py - y * 256)));
  const o = (iy * 256 + ix) * 4, d = t.data;
  return d[o] * 256 + d[o + 1] + d[o + 2] / 256 - 32768;
}
function sample(lon, lat) {
  const px = lon2x(lon) * 256 - 0.5, py = lat2y(lat) * 256 - 0.5;
  const x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0;
  const a = elevAtPixel(x0, y0), b = elevAtPixel(x0 + 1, y0), c = elevAtPixel(x0, y0 + 1), d = elevAtPixel(x0 + 1, y0 + 1);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}
const out = new Int16Array(N * N);
let max = -1e9, min = 1e9;
for (let j = 0; j < N; j++) {
  const lat = LAT1 - (j + 0.5) / N * (LAT1 - LAT0);
  for (let i = 0; i < N; i++) {
    const lon = LON0 + (i + 0.5) / N * (LON1 - LON0);
    const e = Math.round(Math.max(-6000, Math.min(6000, sample(lon, lat))));
    out[j * N + i] = e; if (e > max) max = e; if (e < min) min = e;
  }
}
fs.writeFileSync(path.join(OUT, 'height.bin'), Buffer.from(out.buffer));
const meta = { N, lat0: LAT0, lat1: LAT1, lon0: LON0, lon1: LON1, sizeKm: spanKm, min, max,
  source: 'AWS Terrain Tiles (Mapzen terrarium), https://registry.opendata.aws/terrain-tiles/', zoom: Z };
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 2));
console.log('baked', meta);
