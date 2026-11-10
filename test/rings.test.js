import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RINGS_ENABLED, RING_TIERS, pickTier, crossRing, ringReward, nextStreak, chainBonus, headingNormal, ringsAlong, chainSpots, COMBO_CAP } from '../src/rings.js';
import { createRingField } from '../src/ring-field.js';

test('fly-through rings are parked behind RINGS_ENABLED and cost nothing while off', () => {
  assert.equal(RINGS_ENABLED, false, 'flip this test when bringing rings back');
  const added = [];
  const scene = { add(...objs) { added.push(...objs); } };
  const field = createRingField(scene, { groundAt: () => 0, randomSpot: () => ({ x: 0, y: 5, z: 0 }), rand: () => 0.5 });
  field.populate();
  field.seedRoute([{ x: 0, z: 0 }, { x: 200, z: 0 }]);
  const hits = field.update(0.016, 1, { x: 0, y: 5, z: 0 }, { x: 1, y: 5, z: 0 }, 0, { collect: true });
  assert.equal(added.length, 0, 'no meshes added to the scene');
  assert.equal(field.rings.length, 0);
  assert.equal(field.streak, 0);
  assert.deepEqual(hits, []);
  field.clearRoute();
});


const ring = { c: { x: 0, y: 10, z: 0 }, n: { x: 0, y: 0, z: 1 }, r: 2 };
const P = (x, y, z) => ({ x, y, z });

test('flying straight through the middle counts', () => {
  assert.ok(crossRing(ring, P(0, 10, -1), P(0, 10, 1)) >= 0);
  assert.ok(crossRing(ring, P(0, 10, 1), P(0, 10, -1)) >= 0, 'either direction');
  assert.equal(crossRing(ring, P(0, 10, -3), P(0, 10, 1)), 0.75);
});

test('a fast frame that jumps far past the ring still counts (no tunneling)', () => {
  assert.ok(crossRing(ring, P(0.5, 10.5, -40), P(0.5, 10.5, 60)) >= 0);
});

test('passing beside, over or near without crossing does not count', () => {
  assert.equal(crossRing(ring, P(3, 10, -1), P(3, 10, 1)), -1, 'outside radius');
  assert.equal(crossRing(ring, P(0, 13, -1), P(0, 13, 1)), -1, 'over the top');
  assert.equal(crossRing(ring, P(0, 10, -1), P(0, 10, -0.2)), -1, 'stopped short');
  assert.equal(crossRing(ring, P(-5, 10, 0.5), P(5, 10, 0.5)), -1, 'parallel, close by');
  assert.equal(crossRing(ring, P(-5, 10, 0), P(5, 10, 0)), -1, 'sliding in the plane');
});

test('the edge of the ring counts with a little ship padding', () => {
  assert.ok(crossRing(ring, P(2.2, 10, -1), P(2.2, 10, 1)) >= 0);
  assert.equal(crossRing(ring, P(2.6, 10, -1), P(2.6, 10, 1)), -1);
});

test('crossing works for tilted rings and diagonal paths', () => {
  const n = headingNormal(Math.PI / 4), r = { c: P(5, 3, 5), n, r: 1.5 };
  assert.ok(crossRing(r, P(5 - n.x * 2, 3, 5 - n.z * 2), P(5 + n.x * 2, 3.4, 5 + n.z * 2)) >= 0);
});

test('tiers: bigger rings pay less, smaller rings pay more and are rarer', () => {
  const vals = RING_TIERS.map((t) => t.value);
  assert.deepEqual(vals, [5, 10, 25, 50]);
  for (let i = 1; i < RING_TIERS.length; i++) {
    assert.ok(RING_TIERS[i].radius < RING_TIERS[i - 1].radius);
    assert.ok(RING_TIERS[i].weight < RING_TIERS[i - 1].weight);
  }
  assert.equal(RING_TIERS[0].color, 0x1ec8ff, 'base ring is KDU electric blue');
});

test('pickTier follows the weights', () => {
  assert.equal(pickTier(() => 0).id, 'blue');
  assert.equal(pickTier(() => 0.9999).id, 'prism');
  const n = {}; let s = 1;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 20000; i++) { const t = pickTier(rand).id; n[t] = (n[t] || 0) + 1; }
  assert.ok(n.blue > n.green && n.green > n.gold && n.gold > n.prism);
  assert.ok(n.prism / 20000 > 0.02 && n.prism / 20000 < 0.06);
});

test('streaks add a capped bonus and chains pay per ring', () => {
  const blue = RING_TIERS[0];
  assert.equal(ringReward(blue, 1), 5);
  assert.equal(ringReward(blue, 3), 9);
  assert.equal(ringReward(blue, 99), 5 + COMBO_CAP);
  assert.equal(nextStreak(2, 10, 12), 3);
  assert.equal(nextStreak(2, 10, 20), 1);
  assert.equal(nextStreak(0, null, 5), 1);
  assert.equal(chainBonus(5), 50);
});

test('route rings sit along the leg at flyable heights facing along it', () => {
  const spots = ringsAlong({ x: 0, z: 0 }, { x: 0, z: -200 }, { groundAt: () => 10, rand: () => 0.5 });
  assert.ok(spots.length >= 4);
  for (const s of spots) {
    assert.ok(s.y >= 12.5 && s.y <= 17, String(s.y));
    assert.ok(Math.abs(s.x) <= 3);
    assert.ok(Math.abs(s.yaw) < 1e-9, 'facing north (-z)');
  }
  assert.deepEqual(ringsAlong({ x: 0, z: 0 }, { x: 5, z: 0 }), []);
  const high = ringsAlong({ x: 0, z: 0 }, { x: 100, z: 0 }, { groundAt: () => 58 });
  assert.ok(high.every((s) => s.y <= 60), 'never above the flight ceiling');
});

test('chains are evenly spaced and stay above ground', () => {
  const c = chainSpots({ x: 0, y: 5, z: 0 }, 0, 5, { groundAt: (x, z) => (z < -10 ? 20 : 0) });
  assert.equal(c.length, 5);
  for (let i = 1; i < c.length; i++) assert.ok(Math.abs(Math.hypot(c[i].x - c[i - 1].x, c[i].z - c[i - 1].z) - 7) < 1e-9);
  assert.ok(c.slice(2).every((s) => s.y >= 22.5));
});
