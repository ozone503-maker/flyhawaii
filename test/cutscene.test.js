import test from 'node:test';
import assert from 'node:assert/strict';
import { CUTSCENE_DURATION, SKIP_OUTRO, cutscenePreference, cutsceneBeats, orbitOffset, countUp, createCutsceneClock, coinPath } from '../src/cutscene.js';

test('cutscenes default on and last 3 to 5 seconds', () => {
  assert.equal(cutscenePreference.enabled(null), true);
  assert.equal(cutscenePreference.enabled('off'), false);
  for (const d of Object.values(CUTSCENE_DURATION)) assert.ok(d >= 3 && d <= 5);
});

test('camera eases in and fully returns at the end', () => {
  for (const kind of ['pickup', 'delivery']) {
    const d = CUTSCENE_DURATION[kind];
    assert.equal(cutsceneBeats(kind, 0).cam, 0);
    assert.ok(cutsceneBeats(kind, d / 2).cam > 0.99);
    const end = cutsceneBeats(kind, d);
    assert.equal(end.cam, 0);
    assert.equal(end.done, true);
    assert.equal(end.beam, 0);
  }
});

test('package travels, burst follows, coins only for deliveries', () => {
  const mid = cutsceneBeats('delivery', 1.4);
  assert.ok(mid.beam > 0.9 && mid.cargo > 0 && mid.cargo < 1);
  assert.equal(cutsceneBeats('delivery', 1.0).burst, 0);
  assert.ok(cutsceneBeats('delivery', 2.6).burst > 0);
  assert.equal(cutsceneBeats('pickup', 3).coins, 0);
  assert.equal(cutsceneBeats('delivery', CUTSCENE_DURATION.delivery - SKIP_OUTRO).coins, 1);
});

test('orbit stays at a sane distance and sweeps around', () => {
  const a = orbitOffset(0, { startAngle: 0 }), b = orbitOffset(1, { startAngle: 0 });
  for (const o of [a, b, orbitOffset(0.5)]) {
    const r = Math.hypot(o[0], o[2]);
    assert.ok(r > 4 && r < 6.5);
    assert.ok(o[1] > 1);
  }
  assert.ok(Math.hypot(a[0] - b[0], a[2] - b[2]) > 3);
});

test('count-up lands exactly on the total', () => {
  assert.equal(countUp(10, 90, 0), 10);
  assert.equal(countUp(10, 90, 1), 90);
  const m = countUp(10, 90, 0.5);
  assert.ok(m > 10 && m < 90);
});

test('clock pauses, skips to a short outro and finishes', () => {
  const c = createCutsceneClock('delivery');
  c.tick(1); assert.equal(c.t, 1);
  c.tick(1, true); assert.equal(c.t, 1); // paused
  c.skip(); assert.ok(Math.abs(c.t - (c.dur - SKIP_OUTRO)) < 1e-9); assert.equal(c.skipped, true);
  assert.equal(c.done, false);
  assert.equal(c.tick(1), true); assert.equal(c.done, true);
});

test('coin path starts at the disc and ends at the counter', () => {
  const s = coinPath(0, [100, 400], [30, 20]), e = coinPath(1, [100, 400], [30, 20]);
  assert.deepEqual([s[0], s[1]], [100, 400]);
  assert.ok(Math.abs(e[0] - 30) < 1e-9 && Math.abs(e[1] - 20) < 1e-9);
  assert.ok(e[2] < s[2]);
});
