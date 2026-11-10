import test from 'node:test';
import assert from 'node:assert/strict';
import { whaleSeason, whaleCycle, dolphinLeap, WHALE_SPOTS, DOLPHIN_SPOTS, HONU_BEACH } from '../src/sea-life.js';

test('humpbacks are here from November to April', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(whaleSeason), [true, true, true, true, false, false, false, false, false, false, true, true]);
});

test('a whale blows at the surface, dives, and some cycles breach', () => {
  let blows = 0, dives = 0, breach = 0;
  for (let t = 0; t < 600; t += 0.25) {
    const s = whaleCycle(t, 0.4);
    if (s.blow > 0.5) blows++;
    if (s.fluke > 0.5) dives++;
    if (s.y > 0.4) breach++;
  }
  assert.ok(blows > 10 && dives > 10 && breach > 0, `${blows} ${dives} ${breach}`);
});

test('dolphins leap clear of the water part of the time', () => {
  let up = 0; for (let t = 0; t < 24; t += 0.05) if (dolphinLeap(t, 0.3).y > 0.2) up++;
  assert.ok(up > 50 && up < 400, String(up));
});

test('sea life spots are on the island map', () => {
  for (const [lat, lon] of [...WHALE_SPOTS, ...DOLPHIN_SPOTS, [HONU_BEACH.lat, HONU_BEACH.lon]]) assert.ok(lat > 18.9 && lat < 20.3 && lon > -156.1 && lon < -154.8);
});
