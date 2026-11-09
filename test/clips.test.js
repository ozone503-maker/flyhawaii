import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeClips, pickClip, shouldPlayClip } from '../src/clips.js';
import { createCutsceneClock, cutsceneBeats, CLIP_COIN_START, CLIP_DURATION } from '../src/cutscene.js';
import { createCdPlayer } from '../src/cd-player.js';

test('shipped clip manifest is valid and empty', () => {
  const data = JSON.parse(readFileSync(new URL('../public/clips/clips.json', import.meta.url)));
  assert.deepEqual(normalizeClips(data), []);
});

test('manifest accepts an object or a bare array and builds /clips paths', () => {
  const a = normalizeClips([{ id: 'thanks-01', file: 'thanks-01.mp4' }, { file: 'thanks-02.mp4' }, { id: 'x' }, null]);
  assert.equal(a.length, 2);
  assert.equal(a[0].src, '/clips/thanks-01.mp4');
  assert.equal(a[1].id, 'thanks-02');
  const b = normalizeClips({ clips: [{ id: 'a', file: '/test/a.mp4' }, { id: 'a', file: 'dupe.mp4' }] });
  assert.equal(b.length, 1);
  assert.equal(b[0].src, '/test/a.mp4');
  assert.deepEqual(normalizeClips({}), []);
});

test('random pick avoids repeating the last clip', () => {
  const list = normalizeClips([{ id: 'a', file: 'a.mp4' }, { id: 'b', file: 'b.mp4' }, { id: 'c', file: 'c.mp4' }]);
  for (let i = 0; i < 50; i++) assert.notEqual(pickClip(list, 'b').id, 'b');
  assert.equal(pickClip(list.slice(0, 1), 'a').id, 'a'); // only one clip: it may repeat
  assert.equal(pickClip([], 'a'), null);
});

test('clips only play for deliveries with scenes on', () => {
  const clips = [{ id: 'a' }];
  assert.equal(shouldPlayClip({ kind: 'delivery', scenesOn: true, clips }), true);
  assert.equal(shouldPlayClip({ kind: 'pickup', scenesOn: true, clips }), false);
  assert.equal(shouldPlayClip({ kind: 'delivery', scenesOn: false, clips }), false);
  assert.equal(shouldPlayClip({ kind: 'delivery', scenesOn: true, clips: [] }), false);
});

test('clock holds for the clip, then coins fly after it', () => {
  const c = createCutsceneClock('delivery', CLIP_DURATION);
  c.holdAt(3.3);
  for (let i = 0; i < 100; i++) c.tick(0.1);
  assert.equal(c.t, 3.3);
  assert.equal(c.holding, true);
  assert.equal(cutsceneBeats('delivery', c.t, c.dur, { clip: true }).coins, 0);
  c.release();
  c.tick(1.5);
  assert.ok(cutsceneBeats('delivery', c.t, c.dur, { clip: true }).coins > 0.9);
  assert.ok(CLIP_COIN_START > 3.3);
  c.tick(5); assert.equal(c.done, true);
});

test('skip releases a clip hold', () => {
  const c = createCutsceneClock('delivery', CLIP_DURATION);
  c.holdAt(3.3); c.tick(4); c.skip();
  assert.equal(c.holding, false);
  assert.ok(c.tick(1));
});

test('music ducks under a clip and comes back', () => {
  const audio = { paused: false, volume: 1, play() { this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; }, load() {}, addEventListener() {} };
  const p = createCdPlayer({ audio, tracks: [{ id: 't', file: 't.mp3', src: '/music/t.mp3', title: 't' }], volume: 0.5 });
  p.unlock();
  p.duck(true);
  assert.ok(audio.volume < 0.15);
  assert.equal(p.isDucked(), true);
  p.duck(false);
  assert.equal(audio.volume, 0.5);
  // iOS style read-only volume: falls back to pausing, then resumes
  const stuck = { paused: false, get volume() { return 1; }, set volume(v) {}, play() { this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; }, load() {}, addEventListener() {} };
  const q = createCdPlayer({ audio: stuck, tracks: [{ id: 't', file: 't.mp3', src: '/music/t.mp3', title: 't' }], volume: 0.5 });
  q.unlock(); stuck.paused = false;
  q.duck(true); assert.equal(stuck.paused, true);
  q.duck(false); assert.equal(stuck.paused, false);
});
