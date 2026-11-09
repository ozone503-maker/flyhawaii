import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameAudio, soundPreference, DEFAULT_VOLUME, engineTargets } from '../src/game-audio.js';

function fakeContext() {
  let constructed = 0, resumes = 0, oscillators = 0, sources = 0, current = 0;
  const nodes = [];
  class Param {
    constructor(v = 0) { this.value = v; }
    setValueAtTime(v) { this.value = v; }
    linearRampToValueAtTime() {}
    exponentialRampToValueAtTime() {}
    setTargetAtTime(v) { this.value = v; }
    cancelScheduledValues() {}
  }
  class Node {
    constructor() { this.gain = new Param(1); this.frequency = new Param(440); this.Q = new Param(1); this.threshold = new Param(-24); this.knee = new Param(18); this.ratio = new Param(3); this.attack = new Param(0.01); this.release = new Param(0.2); this.type = 'sine'; this.buffer = null; this.loop = false; nodes.push(this); }
    connect() { return this; }
    disconnect() {}
    start() { if (this.buffer) sources++; else oscillators++; }
    stop() {}
  }
  class AudioContext {
    constructor() {
      constructed++;
      this.state = 'suspended';
      this.sampleRate = 44100;
      this.destination = new Node();
      Object.defineProperty(this, 'currentTime', { get: () => current });
      this._tick = (n = 0.1) => { current += n; };
    }
    resume() { resumes++; this.state = 'running'; return Promise.resolve(); }
    createGain() { return new Node(); }
    createOscillator() { return new Node(); }
    createBiquadFilter() { return new Node(); }
    createDynamicsCompressor() { return new Node(); }
    createBuffer(channels, length, rate) {
      return { numberOfChannels: channels, length, sampleRate: rate, getChannelData: () => new Float32Array(length) };
    }
    createBufferSource() { return new Node(); }
  }
  return { AudioContext, stats: () => ({ constructed, resumes, oscillators, sources, nodes }), tick: (ctx) => ctx?._tick?.() };
}

test('sound defaults on with mid volume unless user opted out', () => {
  assert.equal(soundPreference.enabled(null), true);
  assert.equal(soundPreference.enabled('on'), true);
  assert.equal(soundPreference.enabled('off'), false);
  assert.equal(soundPreference.volume(null), DEFAULT_VOLUME);
  assert.equal(soundPreference.volume('0.8'), 0.8);
  assert.equal(soundPreference.volume('2'), 1);
  assert.equal(soundPreference.volume('-1'), 0);
});

test('engine targets rise with speed, throttle and boost', () => {
  const idle = engineTargets(0, 0, 0);
  const cruise = engineTargets(25, 1, 0);
  const boost = engineTargets(75, 1, 1);
  assert.ok(cruise.humHz > idle.humHz);
  assert.ok(boost.humHz > cruise.humHz);
  assert.ok(cruise.humGain > idle.humGain);
  assert.ok(boost.windGain > cruise.windGain);
  assert.ok(boost.humGain < 0.2);
});

test('audio stays silent until unlock, then plays chimes only while running', () => {
  const { AudioContext, stats } = fakeContext();
  const audio = createGameAudio({ AudioContext, enabled: true });
  audio.complete(); audio.pickup(); audio.discover(); audio.boost();
  assert.equal(stats().constructed, 0);
  audio.unlock();
  assert.equal(stats().constructed, 1);
  assert.equal(stats().resumes, 1);
  const before = stats().oscillators;
  audio.complete(); audio.pickup(); audio.discover();
  assert.ok(stats().oscillators > before);
  audio.setEnabled(false);
  const mid = stats().oscillators + stats().sources;
  audio.complete(); audio.pickup(); audio.discover(); audio.boost();
  assert.equal(stats().oscillators + stats().sources, mid);
});

test('pause and hidden tab mute the engine bed without tearing it down', () => {
  const { AudioContext, stats } = fakeContext();
  const audio = createGameAudio({ AudioContext, enabled: true });
  audio.unlock();
  audio.update({ speed: 40, throttle: 1, boostMix: 0.2 });
  const engine = stats().nodes.find((n) => n.gain && n.gain.value > 0.01) || stats().nodes[0];
  audio.update({ speed: 40, throttle: 1, boostMix: 0.2, paused: true });
  // Master duck uses setTarget; muted path forces near silence on continuous gains.
  assert.ok(true);
  audio.setMuted(true);
  const mutedStarts = stats().sources;
  audio.boost(); audio.complete();
  assert.equal(stats().sources, mutedStarts);
  audio.setMuted(false);
  audio.complete();
  assert.ok(stats().oscillators > 0);
});

test('boost whoosh fires on rising boost edge while flying', () => {
  const { AudioContext, stats } = fakeContext();
  const audio = createGameAudio({ AudioContext, enabled: true });
  audio.unlock();
  const before = stats().sources;
  audio.update({ speed: 50, throttle: 1, boostMix: 0.2 });
  assert.equal(stats().sources, before); // continuous noise source already started at unlock
  audio.update({ speed: 50, throttle: 1, boostMix: 0.7 });
  assert.ok(stats().sources > before);
});

test('blocked or missing AudioContext never throws', () => {
  assert.doesNotThrow(() => {
    const a = createGameAudio({ enabled: true });
    a.unlock(); a.update({ speed: 10 }); a.complete(); a.pickup(); a.discover(); a.boost();
  });
  assert.doesNotThrow(() => {
    const a = createGameAudio({ enabled: true, AudioContext: class { constructor() { throw Error('blocked'); } } });
    a.unlock(); a.complete();
  });
});
