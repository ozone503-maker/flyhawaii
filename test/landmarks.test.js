import test from 'node:test';
import assert from 'node:assert/strict';
import { placeBuildings, fallHeightM, fallDrop, TOWN_AREAS, OBSERVATORIES } from '../src/landmarks.js';

test('buildings stay on dry, flat ground and are deterministic', () => {
  const mk = () => { let s = 5; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
  const toWorld = (lat, lon) => ({ x: (lon + 155) * 1000, y: (19.7 - lat) * 1000 });
  // west half is ocean, a steep strip at x > 20
  const sample = (x) => ({ groundM: x < 0 ? -5 : 30, slope: x > 20 ? 1 : 0.05, urban: 0.8 });
  const towns = [{ name: 'T', lat: 19.7, lon: -155, r: 3, n: 120 }];
  const a = placeBuildings({ rand: mk(), towns, toWorld, sample, unitM: 100 });
  const b = placeBuildings({ rand: mk(), towns, toWorld, sample, unitM: 100 });
  assert.deepEqual(a, b);
  assert.ok(a.length > 60);
  for (const o of a) { assert.ok(o.x >= 0 && o.x <= 20); assert.ok(o.w > 0 && o.h > 0); }
});

test('waterfall heights come from the real drops, with a default', () => {
  assert.equal(fallHeightM('ʻAkaka Falls'), 135);
  assert.equal(fallHeightM('Hiʻilawe Falls'), 442);
  assert.equal(fallHeightM('Some New Falls'), 60);
});

test('a fall faces downhill', () => {
  const d = fallDrop(0, 0, (x) => 500 - x * 50); // ground drops toward +x
  assert.ok(d.dirX > 0.9);
});

test('landmark lists are on the Big Island', () => {
  for (const p of [...TOWN_AREAS, ...OBSERVATORIES]) assert.ok(p.lat > 18.9 && p.lat < 20.3 && p.lon > -156.1 && p.lon < -154.8, p.name);
});
