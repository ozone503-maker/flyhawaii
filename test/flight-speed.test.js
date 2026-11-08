import test from 'node:test';
import assert from 'node:assert/strict';
import { CRUISE, BOOST, targetSpeed, advanceSpeed, ease } from '../src/flight-speed.js';
import { PILOTS } from '../src/ships.js';

test('all skins get 2.5 times the actual cruise and boost displacement speeds', () => {
  for (const p of PILOTS) {
    assert.equal(targetSpeed(1, 0, p.stats), 25);
    assert.ok(Math.abs(targetSpeed(1, 1, p.stats) - 75.2) < 1e-10);
    assert.equal(CRUISE / 10, 2.5);
    assert.equal(BOOST / 32, 2.5);
    const state = {};
    for (let i = 0; i < 1200; i++) advanceSpeed(state, { fwd: 1, boost: true }, p.stats, 1 / 60);
    assert.ok(Math.abs(state.speed - 75.2) < 0.001);
  }
});
test('landing throttle and reverse retain their previous world speeds', () => {
  for (const p of PILOTS) for (const boost of [0, 1]) {
    for (const throttle of [0, 0.05, 0.15, 0.3]) {
      assert.equal(targetSpeed(throttle, boost, p.stats), throttle * 10);
    }
    assert.equal(targetSpeed(-1, boost, p.stats), -3);
  }
});
test('forward speed curve is continuous and monotonic', () => {
  for (const boost of [0, 0.5, 1]) {
    let previous = 0;
    for (let i = 0; i <= 1000; i++) {
      const speed = targetSpeed(i / 1000, boost, PILOTS[0].stats);
      assert.ok(speed >= previous);
      assert.ok(speed - previous < 0.16);
      previous = speed;
    }
  }
});
function stoppingDistance(boost, fps, old) {
  const stats = PILOTS[0].stats;
  const state = { speed: old ? boost ? 32 * stats.boost : 10 : targetSpeed(1, +boost, stats), inF: 1, boostMix: +boost };
  let distance = 0;
  for (let i = 0; i < fps * 8; i++) {
    if (old) {
      state.inF = ease(state.inF, 0, 5, 1 / fps);
      state.boostMix = ease(state.boostMix, 0, 2.2, 1 / fps);
      const top = 10 + (32 * stats.boost - 10) * state.boostMix;
      state.speed = ease(state.speed, state.inF * top, 1.6, 1 / fps);
    } else advanceSpeed(state, { fwd: 0, boost: false }, stats, 1 / fps);
    distance += state.speed / fps;
  }
  assert.ok(state.speed < 0.001);
  return distance;
}
test('releasing throttle stops in less distance despite higher travel speeds', () => {
  for (const fps of [30, 60, 120]) for (const boost of [false, true]) {
    assert.ok(stoppingDistance(boost, fps, false) < stoppingDistance(boost, fps, true));
  }
});
