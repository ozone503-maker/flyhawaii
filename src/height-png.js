// Decode a 16-bit grayscale PNG to raw samples (browsers would downsample these to 8-bit).
// Ported from cartoon-hawaii src/lib/hawaii/height-png.ts, generalized to return every sample.

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

async function inflate(zlib) {
  const stream = new DecompressionStream('deflate'); // zlib wrapper included
  const writer = stream.writable.getWriter();
  void writer.write(zlib);
  void writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

export async function decodeHeightPng(buf) {
  const bytes = new Uint8Array(buf), view = new DataView(buf);
  let p = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (p < bytes.length) {
    const len = view.getUint32(p);
    const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
    if (type === 'IHDR') {
      width = view.getUint32(p + 8); height = view.getUint32(p + 12);
      bitDepth = bytes[p + 16]; colorType = bytes[p + 17]; interlace = bytes[p + 20];
    } else if (type === 'IDAT') idat.push(bytes.subarray(p + 8, p + 8 + len));
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bitDepth !== 16 || colorType !== 0 || interlace) throw new Error(`height png must be 16-bit gray, non-interlaced`);
  const packed = new Uint8Array(idat.reduce((n, a) => n + a.length, 0));
  let o = 0; for (const a of idat) { packed.set(a, o); o += a.length; }
  const raw = await inflate(packed);
  const bpp = 2, stride = width * bpp;
  const rows = new Uint8Array(height * stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++], rowStart = y * stride;
    const prev = y === 0 ? null : rows.subarray((y - 1) * stride, y * stride);
    for (let i = 0; i < stride; i++) {
      const x = raw[rp++];
      const a = i >= bpp ? rows[rowStart + i - bpp] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= bpp ? prev[i - bpp] : 0;
      let v = x;
      if (filter === 1) v = (x + a) & 255;
      else if (filter === 2) v = (x + b) & 255;
      else if (filter === 3) v = (x + ((a + b) >> 1)) & 255;
      else if (filter === 4) v = (x + paeth(a, b, c)) & 255;
      rows[rowStart + i] = v;
    }
  }
  const data = new Uint16Array(width * height);
  for (let k = 0; k < data.length; k++) data[k] = (rows[k * 2] << 8) | rows[k * 2 + 1];
  return { width, height, data };
}
