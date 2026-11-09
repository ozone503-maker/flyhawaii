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
  class Param { constructor(v=0){this.value=v;} setValueAtTime(v){this.value=v;} linearRampToValueAtTime(){} exponentialRampToValueAtTime(){} setTargetAtTime(v){this.value=v;} cancelScheduledValues(){} }
  const node = () => ({ gain: new Param(), frequency: new Param(), Q: new Param(), threshold: new Param(), knee: new Param(), ratio: new Param(), attack: new Param(), release: new Param(), type: 'sine', buffer: null, loop: false, connect(){return this;}, disconnect(){}, start(){ starts++; }, stop(){} });
  class AudioContext {
    constructor() { constructed++; context = this; this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 44100; this.destination = node(); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createGain() { return node(); }
    createOscillator() { return node(); }
    createBiquadFilter() { return node(); }
    createDynamicsCompressor() { return node(); }
    createBuffer(c,l,r){ return { getChannelData: () => new Float32Array(l) }; }
    createBufferSource() { return node(); }
  }
  const audio = createDeliveryAudio({ AudioContext, enabled: false });
  audio.complete(); audio.unlock(); assert.equal(constructed, 0);
  audio.setEnabled(true); assert.equal(constructed, 1);
  // Graph spins continuous oscillators at unlock; chime adds three more.
  const before = starts;
  audio.complete(); assert.equal(starts, before + 3);
  audio.setEnabled(false); audio.complete(); assert.equal(starts, before + 3);
  audio.setEnabled(true); context.state = 'suspended'; audio.complete(); assert.equal(starts, before + 3);
});
test('audio unavailable or blocked never breaks rewards', () => {
  const unsupported = createDeliveryAudio({ enabled: true });
  assert.doesNotThrow(() => { unsupported.unlock(); unsupported.complete(); });
  const blocked = createDeliveryAudio({ enabled: true, AudioContext: class { constructor() { throw Error('blocked'); } } });
  assert.doesNotThrow(() => { blocked.unlock(); blocked.complete(); });
});
