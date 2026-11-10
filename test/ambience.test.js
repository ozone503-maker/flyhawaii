import test from 'node:test';
import assert from 'node:assert/strict';
import { ambienceLevels } from '../src/ambience.js';

test('surf low on the coast, gone high up', () => {
  assert.ok(ambienceLevels({ agl: 50, coast: 1 }).surf > 0.9);
  assert.equal(ambienceLevels({ agl: 3000, coast: 1 }).surf, 0);
});

test('birds by day, coquí at night on the windward side', () => {
  const day = ambienceLevels({ agl: 80, forest: 1, night: 0, windward: true });
  const night = ambienceLevels({ agl: 80, forest: 1, night: 1, windward: true });
  const kona = ambienceLevels({ agl: 80, forest: 1, night: 1, windward: false });
  assert.ok(day.birds > 0.7 && day.coqui === 0);
  assert.ok(night.coqui > 0.9 && night.birds === 0);
  assert.ok(kona.coqui < night.coqui);
});

test('the crater roars up close, wind grows with height', () => {
  assert.ok(ambienceLevels({ agl: 300, craterKm: 1 }).rumble > 0.8);
  assert.equal(ambienceLevels({ agl: 300, craterKm: 20 }).rumble, 0);
  assert.ok(ambienceLevels({ agl: 3500 }).wind > ambienceLevels({ agl: 100 }).wind);
});
