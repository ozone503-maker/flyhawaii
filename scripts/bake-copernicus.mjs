// Bakes Copernicus GLO-30 heights + Sentinel-2 imagery (from the cartoon-hawaii tile set) into
//  - public/chunks/h-{cx}-{cy}.png   16-bit grayscale heights, meters, 1 sample per 4 px (~50 m)
//  - public/chunks/s-{cx}-{cy}.jpg   Sentinel-2 imagery, 512 px per chunk (~12.5 m/px)
//  - public/chunks/chunks.json       georeferencing + list of land chunks
//  - public/terrain/base-h.png       whole-island base heights (16-bit, meters + 6000), GLO-30 land + terrarium bathymetry
//  - public/terrain/base-sat.jpg     whole-island Sentinel-2 mosaic in the base world frame
// Source dir: CH_TILES (default /tmp/ch/public/maps/tiles). Never uses hawaii-height*.png.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SRC = process.env.CH_TILES || '/tmp/ch/public/maps/tiles';
const tj = JSON.parse(fs.readFileSync(path.join(SRC, 'tiles.json'), 'utf8'));
const meta = JSON.parse(fs.readFileSync('public/terrain/meta.json', 'utf8'));
const F = tj.frame, FW = F.widthPx, FH = F.heightPx, TILE = tj.tileSize;
const CH = 512, STEP = 4;
const OUT = 'public/chunks';
fs.mkdirSync(OUT, { recursive: true });
sharp.cache(false);

// Minimal 16-bit grayscale PNG writer (sharp drops raw ushort input to 8-bit when writing grey16)
import zlib from 'node:zlib';
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(b) { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, cr]); }
function png16(be, w, h) {
  const stride = w * 2, out = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    const row = be.subarray(y * stride, (y + 1) * stride), prev = y ? be.subarray((y - 1) * stride, y * stride) : null;
    let best = null, bestSum = Infinity, bestF = 0;
    for (let f = 0; f < 5; f++) {
      const r = Buffer.alloc(stride); let sum = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 2 ? row[i - 2] : 0, b = prev ? prev[i] : 0, c = prev && i >= 2 ? prev[i - 2] : 0;
        let pr = 0;
        if (f === 1) pr = a; else if (f === 2) pr = b; else if (f === 3) pr = (a + b) >> 1;
        else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        const v = (row[i] - pr) & 255; r[i] = v; sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) { bestSum = sum; best = r; bestF = f; }
    }
    out[y * (stride + 1)] = bestF; best.copy(out, y * (stride + 1) + 1);
  }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 16; ih[9] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(out, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---- height tiles, decoded once each, small LRU ----
const hcache = new Map();
async function htile(r, c) {
  const k = `${r}-${c}`;
  if (hcache.has(k)) { const v = hcache.get(k); hcache.delete(k); hcache.set(k, v); return v; }
  const { data, info } = await sharp(path.join(SRC, `h-r${r}-c${c}.png`)).toColourspace('grey16').raw({ depth: 'ushort' }).toBuffer({ resolveWithObject: true });
  if (info.channels !== 1) throw new Error('expected 1 channel');
  const v = { a: new Uint16Array(data.buffer, data.byteOffset, info.width * info.height), w: info.width, h: info.height };
  hcache.set(k, v); while (hcache.size > 5) hcache.delete(hcache.keys().next().value);
  return v;
}
async function hpx(X, Y) {
  X = Math.min(FW - 1, Math.max(0, X)); Y = Math.min(FH - 1, Math.max(0, Y));
  const t = await htile(Math.floor(Y / TILE), Math.floor(X / TILE));
  return t.a[(Y % TILE) * t.w + (X % TILE)];
}

const ncx = Math.ceil(FW / CH), ncy = Math.ceil(FH / CH);
const list = [];
let total = 0;
for (let cy = 0; cy < ncy; cy++) {
  for (let cx = 0; cx < ncx; cx++) {
    const x0 = cx * CH, y0 = cy * CH, pw = Math.min(CH, FW - x0), ph = Math.min(CH, FH - y0);
    // interior samples nx x ny, plus a 1-sample border all round so the client can build seamless normals
    const nx = pw / STEP + 1, ny = ph / STEP + 1, bx = nx + 2, by = ny + 2;
    const hh = new Uint16Array(bx * by); let land = 0, max = 0;
    for (let j = -1; j <= ny; j++) for (let i = -1; i <= nx; i++) {
      const v = await hpx(x0 + i * STEP, y0 + j * STEP); hh[(j + 1) * bx + i + 1] = v;
      if (i >= 0 && j >= 0 && i < nx && j < ny) { if (v > 0) land++; if (v > max) max = v; }
    }
    if (!land) continue;
    // 16-bit grayscale PNG (big-endian samples)
    const be = Buffer.alloc(bx * by * 2); for (let k = 0; k < hh.length; k++) be.writeUInt16BE(hh[k], k * 2);
    fs.writeFileSync(`${OUT}/h-${cx}-${cy}.png`, png16(be, bx, by));
    const r = Math.floor(y0 / TILE), c = Math.floor(x0 / TILE);
    await sharp(path.join(SRC, `sat-r${r}-c${c}.jpg`)).extract({ left: x0 % TILE, top: y0 % TILE, width: pw, height: ph })
      .jpeg({ quality: 74, mozjpeg: true }).toFile(`${OUT}/s-${cx}-${cy}.jpg`);
    total += fs.statSync(`${OUT}/h-${cx}-${cy}.png`).size + fs.statSync(`${OUT}/s-${cx}-${cy}.jpg`).size;
    list.push([cx, cy, nx, ny, max]);
  }
  process.stdout.write(`row ${cy}/${ncy} chunks ${list.length}\r`);
}
fs.writeFileSync(`${OUT}/chunks.json`, JSON.stringify({
  frame: { w: FW, h: FH, lonWest: F.lonWest, latNorth: F.latNorth, dlon: F.degPerPx.lon, dlat: F.degPerPx.lat },
  chunkPx: CH, step: STEP, border: 1, chunks: list,
  credits: [tj.height.attribution, tj.imagery.attribution],
}));
console.log(`\nchunks ${list.length}, ${(total / 1e6).toFixed(1)} MB`);

// ---- whole-island base: GLO-30 downsampled over terrarium bathymetry ----
const N = meta.N, terr = new Int16Array(fs.readFileSync('data/height-terrarium.bin').buffer.slice(0));
const base = new Int16Array(N * N);
let southMost = null;
for (let j = 0; j < N; j++) {
  const lat = meta.lat1 - (j + 0.5) / N * (meta.lat1 - meta.lat0);
  for (let i = 0; i < N; i++) {
    const lon = meta.lon0 + (i + 0.5) / N * (meta.lon1 - meta.lon0);
    const X = (lon - F.lonWest) / F.degPerPx.lon - 0.5, Y = (F.latNorth - lat) / F.degPerPx.lat - 0.5;
    let e = terr[j * N + i];
    if (X >= 0 && Y >= 0 && X < FW - 1 && Y < FH - 1) {
      // average a 13x13 px block (~160 m) for the base cell
      let s = 0, n = 0, landN = 0;
      for (let dy = -6; dy <= 6; dy += 3) for (let dx = -6; dx <= 6; dx += 3) { const v = await hpx(Math.round(X + dx), Math.round(Y + dy)); s += v; n++; if (v > 0) landN++; }
      if (landN > n / 2) e = Math.max(1, Math.round(s / n));
      else e = Math.min(e, -1);
    }
    base[j * N + i] = e;
  }
}
const bb = Buffer.alloc(N * N * 2); for (let k = 0; k < base.length; k++) bb.writeUInt16BE(Math.max(0, Math.min(65535, base[k] + 6000)), k * 2);
fs.writeFileSync('public/terrain/base-h.png', png16(bb, N, N));

// southernmost land pixel near Ka Lae (sanity check for the landmark)
for (let Y = FH - 1; Y >= 0 && !southMost; Y -= 1) {
  for (let X = Math.round((-155.75 - F.lonWest) / F.degPerPx.lon); X < Math.round((-155.6 - F.lonWest) / F.degPerPx.lon); X++) {
    if ((await hpx(X, Y)) > 0) { southMost = { lat: F.latNorth - (Y + 0.5) * F.degPerPx.lat, lon: F.lonWest + (X + 0.5) * F.degPerPx.lon }; break; }
  }
}
console.log('southernmost GLO-30 land pixel', southMost);

// ---- base satellite mosaic in the base world frame ----
const T = 2048, sc = 8;
const mosaic = [];
for (const t of tj.tiles) {
  // widthPx/heightPx are the unpadded size; padding sits right/bottom inside the 4096 file
  const buf = await sharp(path.join(SRC, t.satFile)).extract({ left: 0, top: 0, width: t.widthPx, height: t.heightPx })
    .resize(Math.round(t.widthPx / sc), Math.round(t.heightPx / sc)).png().toBuffer();
  mosaic.push({ input: buf, left: Math.round(t.originPx[0] / sc), top: Math.round(t.originPx[1] / sc) });
}
const mw = Math.round(FW / sc), mh = Math.round(FH / sc);
const mos = await sharp({ create: { width: mw, height: mh, channels: 3, background: tj.padColor } }).composite(mosaic).png().toBuffer();
const lonSpan = meta.lon1 - meta.lon0, latSpan = meta.lat1 - meta.lat0;
const fw = Math.round(FW * F.degPerPx.lon / lonSpan * T), fh = Math.round(FH * F.degPerPx.lat / latSpan * T);
const left = Math.round((F.lonWest - meta.lon0) / lonSpan * T), top = Math.round((meta.lat1 - F.latNorth) / latSpan * T);
const scaled = await sharp(mos).resize(fw, fh).png().toBuffer();
await sharp({ create: { width: T, height: T, channels: 3, background: tj.padColor } }).composite([{ input: scaled, left, top }])
  .jpeg({ quality: 72, mozjpeg: true }).toFile('public/terrain/base-sat.jpg');
console.log('base sizes', fs.statSync('public/terrain/base-h.png').size, fs.statSync('public/terrain/base-sat.jpg').size);
