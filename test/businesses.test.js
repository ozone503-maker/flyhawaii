import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { normalizeBusinesses, readCoords, onIsland, pickJobPair, pickPackage, distanceKm, MIN_JOB_KM } from '../src/businesses.js';
import { normalizeClips, pickClip, clipsFor, shouldPlayClip } from '../src/clips.js';

const shipped = JSON.parse(readFileSync(new URL('../public/businesses/businesses.json', import.meta.url)));

test('shipped business list is valid, on the island, and has portraits that exist', () => {
  const { businesses, problems } = normalizeBusinesses(shipped);
  assert.deepEqual(problems, []);
  assert.ok(businesses.length >= 2);
  for (const b of businesses) {
    assert.ok(onIsland(b), b.name);
    if (b.local?.portrait) assert.ok(existsSync(new URL(`../public/locals/${b.local.portrait}`, import.meta.url)), b.local.portrait);
  }
});

test('coordinates paste straight from Google Maps or come as lat and lon', () => {
  assert.deepEqual(readCoords({ coords: '19.72333, -155.08475' }), { lat: 19.72333, lon: -155.08475 });
  assert.deepEqual(readCoords({ lat: '19.5', lon: -155.1 }), { lat: 19.5, lon: -155.1 });
});

test('bad entries are skipped with a reason instead of breaking the game', () => {
  const { businesses, problems } = normalizeBusinesses({ businesses: [
    { name: 'Good', town: 'Hilo', coords: '19.72, -155.08' },
    { name: 'Swapped', town: 'Hilo', coords: '-155.08, 19.72' },
    { name: 'No minus', town: 'Hilo', lat: 19.72, lon: 155.08 },
    { name: 'No town', coords: '19.72, -155.08' },
    { town: 'Hilo', coords: '19.72, -155.08' },
    { name: 'Good', town: 'Kona', coords: '19.64, -155.99' },
    { name: 'Closed', town: 'Kona', coords: '19.64, -155.99', active: false },
    null,
  ] });
  assert.deepEqual(businesses.map((b) => b.name), ['Good']);
  assert.equal(problems.length, 6);
  assert.match(problems.join('\n'), /not on Hawai/);
  assert.match(problems.join('\n'), /duplicate id/);
});

test('ids come from names, kinds are known, sponsors only when active with https', () => {
  const { businesses: [a, b] } = normalizeBusinesses([
    { name: 'Kaʻū Coffee Mill', town: 'Pāhala', coords: '19.2, -155.47', kind: 'Cafe', sponsor: { active: true, tagline: 'Hi', url: 'http://x' } },
    { name: 'Lava Rock Café', town: 'Volcano', coords: '19.43, -155.23', kind: 'diner', sponsor: { active: false, url: 'https://x' } },
  ]);
  assert.equal(a.id, 'kau-coffee-mill');
  assert.equal(a.kind, 'cafe');
  assert.deepEqual(a.sponsor, { tagline: 'Hi', url: '' });
  assert.equal(b.id, 'lava-rock-cafe');
  assert.equal(b.kind, 'other');
  assert.equal(b.sponsor, null);
});

test('jobs pick two different places far enough apart and avoid restarting at the last drop-off', () => {
  const { businesses } = normalizeBusinesses(shipped);
  let r = 0.123;
  const rand = () => (r = (r * 9301 + 49297) % 233280 / 233280);
  for (let i = 0; i < 200; i++) {
    const { from, to } = pickJobPair(businesses, rand, { lastId: 'volcano-house' });
    assert.notEqual(from, to);
    assert.notEqual(from.id, 'volcano-house');
    assert.ok(distanceKm(from, to) >= MIN_JOB_KM);
  }
  assert.equal(pickJobPair(businesses.slice(0, 1)), null);
});

test('package comes from the pickup business first', () => {
  assert.equal(pickPackage({ packages: ['poi'] }, ['x'], () => 0.9), 'poi');
  assert.equal(pickPackage({ packages: [] }, ['x'], () => 0.1), 'x');
  assert.equal(pickPackage(null, [], () => 0.1), 'a package');
});

test('a business plays its own clips, other businesses only get shared clips', () => {
  const list = normalizeClips([
    { id: 'shared', file: 'shared.mp4' },
    { id: 'hfm', file: 'hfm.mp4', biz: 'hilo-farmers-market' },
    { id: 'vh', file: 'vh.mp4', biz: 'volcano-house', when: 'any' },
  ]);
  assert.deepEqual(clipsFor(list, 'delivery', 'hilo-farmers-market').map((c) => c.id), ['hfm']);
  assert.deepEqual(clipsFor(list, 'delivery', 'mango-moon').map((c) => c.id), ['shared']);
  assert.deepEqual(clipsFor(list, 'pickup', 'volcano-house').map((c) => c.id), ['vh']);
  assert.deepEqual(clipsFor(list, 'pickup', 'hilo-farmers-market').map((c) => c.id), []);
  assert.equal(pickClip(list, 'hfm', Math.random, 'delivery', 'hilo-farmers-market').id, 'hfm');
  assert.equal(shouldPlayClip({ kind: 'pickup', scenesOn: true, clips: list, bizId: 'kona' }), false);
  assert.equal(shouldPlayClip({ kind: 'pickup', scenesOn: true, clips: list, bizId: 'volcano-house' }), true);
});
