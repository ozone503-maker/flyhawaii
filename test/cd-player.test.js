import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCdPlayer,
  musicPreference,
  normalizeTracks,
  DEFAULT_MUSIC_VOLUME,
} from '../src/cd-player.js';

function fakeAudio() {
  const listeners = {};
  return {
    paused: true,
    ended: false,
    volume: 1,
    currentTime: 0,
    src: '',
    preload: 'none',
    loop: false,
    playCalls: 0,
    pauseCalls: 0,
    loadCalls: 0,
    play() { this.paused = false; this.ended = false; this.playCalls++; this._emit('play'); return Promise.resolve(); },
    pause() { this.paused = true; this.pauseCalls++; this._emit('pause'); },
    load() { this.loadCalls++; },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    _emit(type) { for (const fn of listeners[type] || []) fn(); },
    end() { this.paused = true; this.ended = true; this._emit('ended'); },
  };
}

const sample = normalizeTracks({
  album: 'ShockBot',
  tracks: [
    { file: 'track-01.mp3', title: 'ShockBot · Track 1' },
    { file: 'track-02.mp3' },
    { file: 'track-03.mp3', title: 'Named Song' },
  ],
});

test('music defaults on at moderate volume unless opted out', () => {
  assert.equal(musicPreference.enabled(null), true);
  assert.equal(musicPreference.enabled('off'), false);
  assert.equal(musicPreference.volume(null), DEFAULT_MUSIC_VOLUME);
  assert.equal(musicPreference.volume('0.8'), 0.8);
  assert.equal(musicPreference.volume('9'), 1);
});

test('normalizeTracks fills titles and /music src paths', () => {
  assert.equal(sample.length, 3);
  assert.equal(sample[0].src, '/music/track-01.mp3');
  assert.equal(sample[1].title, 'ShockBot · Track 2');
  assert.equal(sample[2].title, 'Named Song');
});

test('album advances and loops, pausing when the game pauses', () => {
  const audio = fakeAudio();
  const changes = [];
  const player = createCdPlayer({
    audio,
    tracks: sample,
    enabled: true,
    volume: 0.4,
    onChange: (s) => changes.push(s.index),
  });
  assert.equal(player.getTrack().file, 'track-01.mp3');
  assert.equal(audio.src, '/music/track-01.mp3');
  assert.equal(audio.playCalls, 0); // waits for unlock / gesture
  player.unlock();
  assert.ok(audio.playCalls >= 1);
  player.next();
  assert.equal(player.getIndex(), 1);
  assert.equal(audio.src, '/music/track-02.mp3');
  audio.end();
  assert.equal(player.getIndex(), 2);
  audio.end();
  assert.equal(player.getIndex(), 0); // loops album
  const pauses = audio.pauseCalls;
  player.setGamePaused(true);
  assert.ok(audio.pauseCalls > pauses);
  assert.equal(audio.paused, true);
  player.setGamePaused(false);
  assert.equal(audio.paused, false);
});

test('M-style disable silences without throwing when audio is missing', () => {
  assert.doesNotThrow(() => {
    const p = createCdPlayer({ tracks: sample, enabled: true });
    p.unlock(); p.next(); p.prev(); p.setEnabled(false); p.setGamePaused(true);
  });
});
