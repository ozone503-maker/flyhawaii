import test from 'node:test';
import assert from 'node:assert/strict';
import { glyph, GLYPHS, gaugeFraction, trackSeed, waveBars } from '../src/alien-ui.js';

test('glyph markup is decorative SVG with no human words', () => {
  for (const id of GLYPHS) {
    const svg = glyph(id);
    assert.match(svg, /^<svg class="glyph"/);
    assert.match(svg, /aria-hidden="true"/);
    assert.match(svg, new RegExp(`#g-${id}"`));
    const text = svg.replace(/<[^>]*>/g, '');
    assert.equal(text, ''); // nothing readable inside the button
  }
  assert.match(glyph('nope'), /#g-find"/);
  assert.match(glyph('play', 'big'), /class="glyph big"/);
});

test('gauge fractions clamp to 0..1', () => {
  assert.equal(gaugeFraction(50, 100), 0.5);
  assert.equal(gaugeFraction(500, 100), 1);
  assert.equal(gaugeFraction(-3, 100), 0);
  assert.equal(gaugeFraction(5, 0), 0);
  assert.equal(gaugeFraction('x', 10), 0);
});

test('track seeds are stable and differ per track', () => {
  assert.equal(trackSeed('track-01'), trackSeed('track-01'));
  assert.notEqual(trackSeed('track-01'), trackSeed('track-02'));
  const s = trackSeed('track-03');
  assert.ok(s >= 0 && s <= 1);
});

test('sound crystal wave pulses while playing and rests when idle', () => {
  const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const live = waveBars(1.234, { count: 16, seed: 0.3, playing: true });
  const idle = waveBars(1.234, { count: 16, seed: 0.3, playing: false });
  assert.equal(live.length, 16);
  for (const v of [...live, ...idle]) assert.ok(v >= 0.04 && v <= 1);
  assert.ok(avg(live) > avg(idle) * 2);
});
