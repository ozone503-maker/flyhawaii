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
  const { runnerSpeed, streakMult } = await import('../src/combat.js');
  const a = escapeSpec(1), b = escapeSpec(6);
  assert.ok(b.jink > a.jink && b.dodge > a.dodge);
  assert.ok(escapeSpec(99).dodge <= 0.3, 'dodges are flair, not a wall');
  for (const w of [1, 5, 20]) {
    const e = escapeSpec(w);
    assert.ok(runnerSpeed(e, 50, 80) < 80, 'boost closes the gap');
    assert.ok(runnerSpeed(e, 50, 25) > 25, 'cruising does not');
    for (const sp of [25, 80]) assert.ok(runnerSpeed(e, 150, sp) < sp, 'fall far behind and it waits for you');
  }
  assert.ok(runnerSpeed(a, 5, 80) > runnerSpeed(a, 20, 80), 'kicks when you are right on it');
  const island = (x, z) => (Math.hypot(x, z) < 100 ? 3 + Math.sin(x * 0.3) * 2 : -5); // round island, rugged
  const g = escapeGoal({ x: 10, y: 5, z: 0, seed: 0.2 }, { x: 0, y: 5, z: 0 }, 0, a, island);
  assert.ok(g.x > 10, 'runs away from you');
  // near the coast with you behind it, it turns along the island instead of out to sea
  const c = { x: 85, y: 5, z: 0, seed: 0.2, v: { x: 30, y: 0, z: 0 } };
  for (let k = 0; k < 5; k++) { const q = escapeGoal(c, { x: c.x - 20, y: 5, z: c.z }, k, a, island); assert.ok(Math.hypot(q.x, q.z) < 100, 'stays over land'); c.v = { x: q.x - c.x, y: 0, z: q.z - c.z }; c.x += c.v.x * 0.5; c.z += c.v.z * 0.5; }
  assert.ok(g.y > island(g.x, g.z), 'skims above the ground');
  assert.ok(caughtBonus(3) > caughtBonus(1));
  const { CHASE_MIN_S, runnerEscapes } = await import('../src/combat.js');
  for (const sec of [0, 3, 10, 19.9]) assert.equal(runnerEscapes(sec, 9999), false, 'never gets away before 20 s');
  assert.ok(CHASE_MIN_S >= 20 && runnerEscapes(25, 9999) && !runnerEscapes(25, 30));
  assert.ok(caughtBonus(1, 3) > caughtBonus(1, 25), 'quick catches pay more');
  assert.ok(caughtBonus(1, 22, 3) > caughtBonus(1, 22, 0) && streakMult(99) === 2);
});

test('target lock builds while the runner is in your sights and drains when it slips out', async () => {
  const { lockStep, LOCK } = await import('../src/combat.js');
  const from = { x: 0, y: 5, z: 0 }, aim = { x: 0, y: 0, z: -1 };
  let p = 0;
  for (let i = 0; i < 60 * LOCK.time + 2; i++) p = lockStep(p, 1 / 60, from, aim, { x: 2, y: 6, z: -30 });
  assert.equal(p, 1, 'locks after LOCK.time seconds dead ahead');
  assert.ok(lockStep(0.6, 0.1, from, aim, { x: 30, y: 5, z: -5 }) < 0.6, 'off to the side drains it');
  assert.equal(lockStep(1, 0.1, from, aim, { x: 30, y: 5, z: -5 }), 1, 'a full lock holds');
  assert.equal(lockStep(0.5, 0.1, from, aim, { x: 0, y: 5, z: -(LOCK.range + 5) }) < 0.5, true, 'too far does not count');
  assert.equal(lockStep(0, 0.5, from, aim, { x: 0, y: 5, z: 30 }), 0, 'behind you does not count');
});
