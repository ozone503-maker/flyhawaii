import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDistance, approachHint, createDeliveryAudio } from '../src/delivery-feedback.js';
import { buildPilotHead } from '../src/pilot-head.js';
import { PILOTS } from '../src/ships.js';

test('distance uses useful meters on final approach', () => {
  assert.equal(formatDistance(0), '0 m');
  assert.equal(formatDistance(0.32), '320 m');
  assert.equal(formatDistance(1), '1.0 km');
  assert.equal(formatDistance(12.34), '12.3 km');
});
test('guidance matches transfer thresholds in each phase', () => {
  assert.equal(approachHint(3.2, 0, 0, 'pickup'), 'Fly to the amber beacon');
  assert.equal(approachHint(20, 0, 0, 'dropoff'), 'Fly to the green beacon');
  assert.equal(approachHint(1, 8, 0, 'pickup'), 'Descend into the beacon');
  assert.equal(approachHint(1, 2, 9, 'pickup'), 'Slow down to transfer');
  assert.equal(approachHint(1, 2, 8, 'pickup'), 'Hold steady to pick up');
  assert.equal(approachHint(1, 2, 8, 'dropoff'), 'Hold steady to deliver');
});
test('pilot heads have no face textures, sprites, helmets or hats', () => {
  for (const { id } of PILOTS) {
    const head = buildPilotHead(id);
    assert.equal(head.rotation.y, 0);
    head.traverse(o => {
      assert.ok(!o.isSprite);
      if (o.isMesh) { assert.equal(o.material.map, null); assert.equal(o.geometry.type, 'SphereGeometry'); }
    });
  }
  assert.deepEqual(PILOTS[0].stats, PILOTS[1].stats);
  assert.deepEqual(PILOTS[0].stats, PILOTS[2].stats);
});
test('sound stays silent until enabled and unlocked, then plays only while running', () => {
  let constructed = 0, starts = 0, context;
  class AudioContext {
    constructor() { constructed++; context = this; this.state = 'suspended'; this.currentTime = 0; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createGain() { return { gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
    createOscillator() { return { frequency: {}, connect() {}, disconnect() {}, start() { starts++; }, stop() {} }; }
  }
  const audio = createDeliveryAudio({ AudioContext });
  audio.complete(); audio.unlock(); assert.equal(constructed, 0);
  audio.setEnabled(true); assert.equal(constructed, 1);
  audio.complete(); assert.equal(starts, 3);
  audio.setEnabled(false); audio.complete(); assert.equal(starts, 3);
  audio.setEnabled(true); context.state = 'suspended'; audio.complete(); assert.equal(starts, 3);
});
test('audio unavailable or blocked never breaks rewards', () => {
  const unsupported = createDeliveryAudio({ enabled: true });
  assert.doesNotThrow(() => { unsupported.unlock(); unsupported.complete(); });
  const blocked = createDeliveryAudio({ enabled: true, AudioContext: class { constructor() { throw Error('blocked'); } } });
  assert.doesNotThrow(() => { blocked.unlock(); blocked.complete(); });
});
