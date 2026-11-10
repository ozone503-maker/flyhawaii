import test from 'node:test';
import assert from 'node:assert/strict';
import { cloudWeight, placeClouds, cloudDensityAt, CLOUD_TOP_M } from '../src/clouds.js';

test('clouds favor the windward slopes, skip the summits, stay sparse over the sea', () => {
  const hilo = cloudWeight({ lat: 19.72, lon: -155.2, groundM: 900 });
  const summit = cloudWeight({ lat: 19.82, lon: -155.47, groundM: 4200 });
  const saddle = cloudWeight({ lat: 19.7, lon: -155.65, groundM: 1900 });
  const sea = cloudWeight({ lat: 19.5, lon: -156.2, groundM: -900 });
  assert.ok(hilo > 0.8);
  assert.equal(summit, 0);
  assert.ok(saddle < 0.3);
  assert.ok(sea > 0 && sea < 0.2);
});

test('placement is deterministic, inside the bounds and under the cloud top', () => {
  const mk = () => { let s = 42; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
  const sample = (x, z) => ({ lat: 19.7, lon: -155.2 + x * 0.001, groundM: 800 + z * 2 });
  const opts = { bounds: { x0: -100, x1: 100, z0: -100, z1: 100 }, sample, unitM: 100, clusters: 30 };
  const a = placeClouds({ rand: mk(), ...opts }), b = placeClouds({ rand: mk(), ...opts });
  assert.deepEqual(a, b);
  assert.ok(a.length > 50);
  for (const p of a) {
    assert.ok(p.x > -150 && p.x < 150 && p.z > -150 && p.z < 150);
    assert.ok(p.y * 100 < CLOUD_TOP_M + 1500 && p.y > 0 && p.s > 0);
  }
});

test('density is 1 at a puff center and 0 well outside it', () => {
  const puffs = [{ x: 0, y: 10, z: 0, s: 10, shade: 1 }];
  assert.equal(cloudDensityAt(puffs, 0, 10, 0), 1);
  assert.equal(cloudDensityAt(puffs, 50, 10, 0), 0);
});
