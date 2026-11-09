import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeDestinations, pickJob, inBigIsland, slugify, packageFor, distanceKm, DEST_KINDS, MIN_JOB_KM } from '../src/destinations.js';

const shipped = JSON.parse(readFileSync(new URL('../public/destinations/destinations.json', import.meta.url)));

test('shipped destinations file loads cleanly with no warnings', () => {
  const warnings = [];
  const list = normalizeDestinations(shipped, (m) => warnings.push(m));
  assert.deepEqual(warnings, []);
  assert.equal(list.length, shipped.destinations.length);
  assert.ok(list.length >= 2);
  for (const d of list) {
    assert.ok(DEST_KINDS.includes(d.kind), d.id);
    assert.ok(inBigIsland(d.lat, d.lon), d.id);
    assert.ok(d.source || d.approx, `${d.id} needs a source or approx: true`);
  }
});

test('FlashTown HQ is on Jessie\'s exact pin in Mountain View', () => {
  const hq = normalizeDestinations(shipped).find((d) => d.kind === 'hq');
  assert.ok(hq);
  assert.equal(hq.id, 'flashtown-hq');
  assert.equal(hq.approx, false);
  assert.deepEqual([hq.lat, hq.lon], [19.48148, -155.098468]);
});

test('accepts a bare array and fills id from name', () => {
  const list = normalizeDestinations([{ name: 'Aliʻi Shop', kind: 'shop', lat: 19.64, lon: -155.99 }]);
  assert.equal(list[0].id, 'alii-shop');
  assert.equal(list[0].sponsor, false);
  assert.equal(list[0].approx, false);
  assert.equal(slugify("Ken's House of Pancakes"), 'kens-house-of-pancakes');
});

test('validation skips bad coords, missing names, duplicates and disabled entries with warnings', () => {
  const warnings = [];
  const list = normalizeDestinations({ destinations: [
    { id: 'ok', name: 'Good', kind: 'market', lat: 19.43, lon: -155.23 },
    { id: 'maui', name: 'On Maui', kind: 'shop', lat: 20.89, lon: -156.47 },
    { id: 'swapped', name: 'Swapped', kind: 'shop', lat: -155.99, lon: 19.64 },
    { id: 'nolat', name: 'No coords', kind: 'shop' },
    { id: 'text', name: 'Text coords', kind: 'shop', lat: 'abc', lon: -155.9 },
    { id: 'zero', name: 'Null island', kind: 'shop', lat: 0, lon: 0 },
    { id: 'noname', kind: 'shop', lat: 19.6, lon: -155.9 },
    { id: 'ok', name: 'Dup', kind: 'shop', lat: 19.6, lon: -155.9 },
    { id: 'off', name: 'Closed for now', kind: 'shop', lat: 19.6, lon: -155.9, enabled: false },
    null,
  ] }, (m) => warnings.push(m));
  assert.deepEqual(list.map((d) => d.id), ['ok']);
  assert.equal(warnings.length, 8);
  assert.ok(warnings.some((w) => w.includes('On Maui') && w.includes('not on the Big Island')));
  assert.ok(warnings.some((w) => w.includes('duplicate id')));
});

test('numeric strings are accepted and unknown kinds fall back to shop', () => {
  const warnings = [];
  const [d] = normalizeDestinations([{ name: 'X', kind: 'bakery', lat: '19.7', lon: '-155.08' }], (m) => warnings.push(m));
  assert.equal(d.lat, 19.7); assert.equal(d.kind, 'shop');
  assert.equal(warnings.length, 1);
});

test('pickJob picks two different places at least MIN_JOB_KM apart', () => {
  const list = normalizeDestinations(shipped);
  let r = 0; const rand = () => (r = (r * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 300; i++) {
    const job = pickJob(list, rand);
    assert.notEqual(job.from.id, job.to.id);
    assert.ok(job.km >= MIN_JOB_KM, `${job.from.id} > ${job.to.id} is ${job.km} km`);
    assert.ok(typeof job.pkg === 'string' && job.pkg.length);
  }
});

test('every shipped destination can appear as pickup and as dropoff', () => {
  const list = normalizeDestinations(shipped);
  const froms = new Set(), tos = new Set();
  for (let i = 0; i < 2000; i++) { const j = pickJob(list); froms.add(j.from.id); tos.add(j.to.id); }
  assert.equal(froms.size, list.length); assert.equal(tos.size, list.length);
});

test('pickJob avoids repeating the last pair and handles tiny lists', () => {
  const a = { id: 'a', name: 'A', kind: 'shop', lat: 19.6, lon: -155.99 };
  const b = { id: 'b', name: 'B', kind: 'shop', lat: 19.43, lon: -155.23 };
  const c = { id: 'c', name: 'C', kind: 'shop', lat: 19.431, lon: -155.231 };
  assert.equal(pickJob([a]), null);
  assert.equal(pickJob([]), null);
  const last = { from: a, to: b };
  for (let i = 0; i < 50; i++) { const j = pickJob([a, b], Math.random, { last }); assert.equal(j.from.id, 'b'); }
  // b and c are 150 m apart, so they never pair while a farther option exists
  for (let i = 0; i < 100; i++) { const j = pickJob([a, b, c]); assert.ok(j.from.id === 'a' || j.to.id === 'a'); }
  // only close places: still returns a job
  assert.ok(pickJob([b, c]));
});

test('packages follow packageHint, then kind', () => {
  assert.equal(packageFor({ kind: 'market', packageHint: 'a sack of taro' }), 'a sack of taro');
  assert.match(packageFor({ kind: 'restaurant' }, () => 0), /takeout/);
  assert.ok(packageFor({ kind: 'nope' }));
});

test('distanceKm matches a known span (Kona market to Volcano market about 80 km)', () => {
  const km = distanceKm({ lat: 19.637213, lon: -155.991901 }, { lat: 19.434211, lon: -155.230069 });
  assert.ok(km > 78 && km < 84, String(km));
});

test('every local portrait in the shipped list exists, and locals and packages pass through', async () => {
  const { existsSync } = await import('node:fs');
  for (const d of normalizeDestinations(shipped)) {
    if (d.local?.portrait) assert.ok(existsSync(new URL(`../public/locals/${d.local.portrait}`, import.meta.url)), d.local.portrait);
  }
  const [d] = normalizeDestinations([{ name: 'Suisan', kind: 'hotel', lat: 19.72, lon: -155.07,
    packages: ['ahi', ' ', 'poke'], local: { name: 'Uncle Kenji', portrait: 'fisherman.webp', lines: ['Ho!', ''] } }]);
  assert.equal(d.kind, 'hotel');
  assert.deepEqual(d.packages, ['ahi', 'poke']);
  assert.deepEqual(d.local, { name: 'Uncle Kenji', portrait: 'fisherman.webp', lines: ['Ho!'] });
  assert.equal(packageFor(d, () => 0.9), 'poke');
});

test('a business plays its own clips, other businesses only get shared clips', async () => {
  const { normalizeClips, pickClip, clipsFor, shouldPlayClip } = await import('../src/clips.js');
  const list = normalizeClips([
    { id: 'shared', file: 'shared.mp4' },
    { id: 'hfm', file: 'hfm.mp4', biz: 'hilo-farmers-market' },
    { id: 'vh', file: 'vh.mp4', biz: 'volcano-house', when: 'any' },
  ]);
  assert.deepEqual(clipsFor(list, 'delivery', 'hilo-farmers-market').map((c) => c.id), ['hfm']);
  assert.deepEqual(clipsFor(list, 'delivery', 'suisan-fish-market').map((c) => c.id), ['shared']);
  assert.deepEqual(clipsFor(list, 'pickup', 'volcano-house').map((c) => c.id), ['vh']);
  assert.equal(pickClip(list, 'hfm', Math.random, 'delivery', 'hilo-farmers-market').id, 'hfm');
  assert.equal(shouldPlayClip({ kind: 'pickup', scenesOn: true, clips: list, bizId: 'kona' }), false);
  assert.equal(shouldPlayClip({ kind: 'pickup', scenesOn: true, clips: list, bizId: 'volcano-house' }), true);
});
