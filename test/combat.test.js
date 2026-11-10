import test from 'node:test';
import assert from 'node:assert/strict';
import { waveSpec, waveBonus, spawnRing, assistTarget, segPointDist, mantisGoal, steer, shieldStep, MANTIS, PLAYER, RAID_TOWNS } from '../src/combat.js';

test('waves grow and speed up, with a cap', () => {
  assert.ok(waveSpec(2).count > waveSpec(1).count);
  assert.ok(waveSpec(5).speed > waveSpec(1).speed);
  assert.equal(waveSpec(99).count, 24);
  assert.equal(waveBonus(3), 150);
});

test('swarms spawn a few km out from the town', () => {
  const town = { x: 0, z: 0 };
  let s = 1; const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (const p of spawnRing(town, 9, rand)) { const d = Math.hypot(p.x, p.z); assert.ok(d > 60 && d < 90, String(d)); } // 6 to 9 km out: close enough to see coming
});

test('shots lock on to a craft ahead, not one behind', () => {
  const from = { x: 0, y: 0, z: 0 }, dir = { x: 0, y: 0, z: -1 };
  const ts = [{ x: 0, y: 0, z: 40 }, { x: 5, y: 2, z: -60 }, { x: 0, y: 0, z: -300 }];
  assert.equal(assistTarget(from, dir, ts), 1);
  assert.equal(assistTarget(from, dir, [ts[0]]), -1);
});

test('hits, goals and steering', () => {
  assert.ok(segPointDist({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 5, y: 1, z: 0 }) === 1);
  const town = { x: 0, y: 1, z: 0 }, m = { x: 200, y: 10, z: 0, seed: 0.3 };
  assert.equal(mantisGoal(m, town, { x: 500, y: 5, z: 0 }, 0).mode, 'raid');
  assert.equal(mantisGoal(m, town, { x: 210, y: 10, z: 0 }, 0).mode, 'fight');
  const g = mantisGoal(m, town, { x: 210, y: 10, z: 0 }, 0, { x: 0, y: 0, z: -1 }).goal; // facing north: they fight in front
  assert.ok(g.z < 0, 'in front of the saucer');
  const v = steer({ x: 0, y: 0, z: 0 }, m, { x: 0, y: 10, z: 0 }, MANTIS.speed, MANTIS.turn, 0.1);
  assert.ok(v.x < 0 && Math.abs(Math.hypot(v.x, v.y, v.z) - MANTIS.speed) < 1e-6);
  assert.equal(shieldStep(50, 1, 0.5), 50);
  assert.ok(shieldStep(50, 1, 5) > 50 && shieldStep(99, 1, 5) === PLAYER.shield);
  assert.ok(RAID_TOWNS.some((t) => t.id === 'flashtown'));
});

test('the swarm keeps up with you and the runner gets harder each wave', async () => {
  const { swarmSpeed, escapeSpec, escapeGoal, caughtBonus } = await import('../src/combat.js');
  assert.ok(swarmSpeed(14, 80, 10) > 80); // never slower than the saucer
  assert.ok(swarmSpeed(14, 0, 120) > swarmSpeed(14, 0, 10)); // catches up when left behind
  const a = escapeSpec(1), b = escapeSpec(6);
  assert.ok(b.speed > a.speed && b.jink > a.jink && b.dodge > a.dodge);
  assert.ok(escapeSpec(99).speed < 80, 'still catchable at full boost');
  const g = escapeGoal({ x: 10, y: 5, z: 0, seed: 0.2 }, { x: 0, y: 5, z: 0 }, 0, a, 800);
  assert.ok(g.x > 10, 'runs away from you');
  assert.ok(caughtBonus(3) > caughtBonus(1));
});
