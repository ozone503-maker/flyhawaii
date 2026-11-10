import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeHeightPng } from '../src/height-png.js';
import { CRUISE_ROUTE, BOAT_ROUTES, outAndBack, seaPoints } from '../src/sea-traffic.js';
import { timedPath } from '../src/air-traffic.js';

const meta = JSON.parse(readFileSync(new URL('../public/terrain/meta.json', import.meta.url)));
const raw = readFileSync(new URL('../public/terrain/base-h.png', import.meta.url));
const png = await decodeHeightPng(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
const N = meta.N;
const elev = (lat, lon) => {
  const i = Math.round((lon - meta.lon0) / (meta.lon1 - meta.lon0) * N - 0.5), j = Math.round((meta.lat1 - lat) / (meta.lat1 - meta.lat0) * N - 0.5);
  return png.data[Math.max(0, Math.min(N - 1, j)) * N + Math.max(0, Math.min(N - 1, i))] - 6000;
};

function checkLegs(pts, name, skipFirst = 0) {
  for (let i = skipFirst; i < pts.length - 1; i++) {
    const [a1, o1] = pts[i], [a2, o2] = pts[i + 1];
    for (let k = 0; k <= 20; k++) {
      const lat = a1 + (a2 - a1) * k / 20, lon = o1 + (o2 - o1) * k / 20;
      assert.ok(elev(lat, lon) < 0, `${name}: leg ${i} crosses land near ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
    }
  }
}

test('the cruise route stays at sea between the harbor approaches', () => {
  checkLegs(CRUISE_ROUTE, 'cruise', 2); // the first legs are inside Hilo Harbor, finer than the grid
});

test('boat routes stay at sea once out of the harbor', () => {
  for (const r of BOAT_ROUTES) checkLegs(r.pts, r.name, 1);
});

test('routes become closed timed loops', () => {
  const toWorld = (lat, lon) => ({ x: lon * 1000, y: -lat * 1000 });
  const pts = seaPoints(outAndBack(CRUISE_ROUTE), toWorld, 0.6, { 0: 300 });
  const p = timedPath(pts, [0]);
  assert.ok(p.period > 300);
  assert.equal(p.at(10).y, 0);
  assert.equal(outAndBack([1, 2, 3, 4]).join(), '1,2,3,4,3,2');
});
