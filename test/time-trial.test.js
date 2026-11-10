import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeHeightPng } from '../src/height-png.js';
import { traceCourse, makeGates, nearestIndex, formatLap, encodeGhost, ghostAt, GATE_SPACING_U } from '../src/time-trial.js';
import { crossRing } from '../src/rings.js';

const meta = JSON.parse(readFileSync(new URL('../public/terrain/meta.json', import.meta.url)));
const raw = readFileSync(new URL('../public/terrain/base-h.png', import.meta.url));
const png = await decodeHeightPng(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
const N = meta.N, SIZE = meta.sizeKm * 10;
const elevM = (x, z) => { const i = Math.round((x / SIZE + 0.5) * N - 0.5), j = Math.round((z / SIZE + 0.5) * N - 0.5);
  if (i < 0 || j < 0 || i >= N || j >= N) return -3000; return png.data[j * N + i] - 6000; };
const toWorld = (lat, lon) => ({ x: ((lon - meta.lon0) / (meta.lon1 - meta.lon0) - 0.5) * SIZE, z: ((meta.lat1 - lat) / (meta.lat1 - meta.lat0) - 0.5) * SIZE });
const course = traceCourse(elevM, toWorld(19.6, -155.5));

test('the course circles the island over water with even gates', () => {
  let len = 0;
  for (let i = 0; i < course.length; i++) {
    const a = course[i], b = course[(i + 1) % course.length];
    len += Math.hypot(b.x - a.x, b.z - a.z);
    assert.ok(elevM(a.x, a.z) < 0, `gate ${i} is over land`);
    const gap = Math.hypot(b.x - a.x, b.z - a.z); assert.ok(gap > GATE_SPACING_U * 0.5 && gap < GATE_SPACING_U * 1.3, `gap ${gap}`);
  }
  assert.ok(len > 3500 && len < 6000, `lap ${len * 0.1} km`); // roughly 350 to 600 km
  // it really goes around: passes north of Upolu Point and south of Ka Lae
  const north = toWorld(20.27, -155.86), south = toWorld(18.91, -155.68);
  const near = (q) => Math.min(...course.map((p) => Math.hypot(p.x - q.x, p.z - q.z)));
  assert.ok(near(north) < 45, 'rounds Upolu Point');
  assert.ok(near(south) < 45, 'rounds Ka Lae');
});

test('gates face along the course and can be flown through', () => {
  const start = nearestIndex(course, toWorld(19.73, -155.05).x, toWorld(19.73, -155.05).z);
  const gates = makeGates(course, start);
  assert.equal(gates.length, course.length);
  const g = gates[3];
  const p0 = { x: g.c.x - g.n.x * 2, y: g.c.y, z: g.c.z - g.n.z * 2 }, p1 = { x: g.c.x + g.n.x * 2, y: g.c.y, z: g.c.z + g.n.z * 2 };
  assert.ok(crossRing(g, p0, p1) >= 0);
});

test('lap times and ghosts', () => {
  assert.equal(formatLap(83.456), '1:23.46');
  assert.equal(formatLap(5), '0:05.00');
  const track = encodeGhost([[0, 1, 0], [4, 1, 0], [8, 1.04, 0]]);
  assert.deepEqual(ghostAt(track, 0.125), { x: 2, y: 1, z: 0, done: false });
  assert.equal(ghostAt(track, 99).done, true);
});
