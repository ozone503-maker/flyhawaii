import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TIERS, REGULARS_KEY, REGULARS_VERSION, DEFAULT_GREETER_LINES,
  emptyRegulars, loadRegulars, saveRegulars, getCount, recordVisit, recordJob,
  tierFor, tipBonus, specialEligible, nextTier, mergeGreeterLines, pickGreeting,
} from '../src/regulars.js';
import { makeOffers, makeSpecialOffer, offerPay, SPECIAL_PAY_MULT, PAY } from '../src/job-offers.js';
import { homecomingBonus, isNearHq, startCoords, hqDestination, FALLBACK_START } from '../src/shift.js';
import { normalizeDestinations } from '../src/destinations.js';

const D = (id, lat, lon) => ({ id, name: id, kind: 'shop', lat, lon });
const toy = [D('kona', 19.64, -155.99), D('keauhou', 19.57, -155.96), D('volcano', 19.43, -155.23), D('hilo', 19.72, -155.08)];
const seeded = (s = 7) => () => (s = (s * 16807) % 2147483647) / 2147483647;

test('tier thresholds: Stranger 0, Familiar 3, Regular 8, Ohana 15', () => {
  assert.equal(tierFor(0).id, 'stranger');
  assert.equal(tierFor(2).id, 'stranger');
  assert.equal(tierFor(3).id, 'familiar');
  assert.equal(tierFor(7).id, 'familiar');
  assert.equal(tierFor(8).id, 'regular');
  assert.equal(tierFor(14).id, 'regular');
  assert.equal(tierFor(15).id, 'ohana');
  assert.equal(tierFor(99).id, 'ohana');
  assert.equal(tierFor(-4).id, 'stranger');
  assert.equal(tierFor('nope').id, 'stranger');
  assert.deepEqual(TIERS.map((t) => t.min), [0, 3, 8, 15]);
  assert.equal(nextTier(0).id, 'familiar');
  assert.equal(nextTier(20), null);
});

test('tip bonus grows +0 / +10 / +20 / +35 percent of job pay', () => {
  assert.equal(tipBonus(100, 0), 0);
  assert.equal(tipBonus(100, 2), 0);
  assert.equal(tipBonus(100, 3), 10);
  assert.equal(tipBonus(100, 8), 20);
  assert.equal(tipBonus(100, 15), 35);
  assert.equal(tipBonus(50, 15), 18);
  assert.equal(tipBonus(0, 15), 0);
  assert.equal(tipBonus(-10, 15), 0);
});

test('Ohana special jobs are eligible only at 15+ deliveries', () => {
  assert.equal(specialEligible(14), false);
  assert.equal(specialEligible(15), true);
  const none = { v: 1, counts: { kona: 8, hilo: 14 } };
  assert.equal(makeSpecialOffer(toy, null, none), null);
  const ready = { v: 1, counts: { kona: 15 } };
  const offer = makeSpecialOffer(toy, { lat: 19.64, lon: -155.99 }, ready, seeded(3));
  assert.ok(offer);
  assert.equal(offer.special, true);
  assert.equal(offer.specialBiz, 'kona');
  assert.equal(offer.specialName, 'kona');
  assert.ok(offer.from.id === 'kona' || offer.to.id === 'kona');
  assert.notEqual(offer.from.id, offer.to.id);
  const expected = Math.max(PAY.round, Math.round(offerPay(offer.legKm, offer.deadheadKm, [], 0) * SPECIAL_PAY_MULT / PAY.round) * PAY.round);
  assert.equal(offer.pay, expected);
  assert.ok(offer.pay > offerPay(offer.legKm, offer.deadheadKm, [], 0));
});

test('the job board only injects a special when chance fires and a host qualifies', () => {
  const regulars = { v: 1, counts: { volcano: 20 } };
  const always = makeOffers(toy, null, seeded(2), { regulars, specialChance: 1 });
  assert.equal(always.filter((o) => o.special).length, 1);
  assert.equal(always.length, 4);
  const never = makeOffers(toy, null, seeded(2), { regulars, specialChance: 0 });
  assert.equal(never.filter((o) => o.special).length, 0);
  const noHost = makeOffers(toy, null, seeded(2), { regulars: emptyRegulars(), specialChance: 1 });
  assert.equal(noHost.filter((o) => o.special).length, 0);
  // existing boards without regulars stay unchanged
  const plain = makeOffers(toy, null, seeded(2));
  assert.equal(plain.filter((o) => o.special).length, 0);
});

test('storage load tolerates junk, unversioned maps and future versions', () => {
  assert.deepEqual(loadRegulars(null), emptyRegulars());
  assert.deepEqual(loadRegulars(''), emptyRegulars());
  assert.deepEqual(loadRegulars('{'), emptyRegulars());
  assert.deepEqual(loadRegulars('[]'), emptyRegulars());
  assert.deepEqual(loadRegulars(7), emptyRegulars());
  const unversioned = loadRegulars('{"kona-farmers-market": 4, "hilo": "9", "bad": -3, "nope": "x"}');
  assert.equal(unversioned.v, REGULARS_VERSION);
  assert.equal(getCount(unversioned, 'kona-farmers-market'), 4);
  assert.equal(getCount(unversioned, 'hilo'), 9);
  assert.equal(getCount(unversioned, 'bad'), 0);
  assert.equal(getCount(unversioned, 'nope'), 0);
  const future = loadRegulars('{"v": 99, "counts": {"volcano": 8.7, "x": null}}');
  assert.equal(getCount(future, 'volcano'), 8);
  assert.equal(getCount(future, 'x'), 0);
  const starting = recordJob(emptyRegulars(), 'kona', 'hilo');
  assert.equal(getCount(starting, 'kona'), 1);
  assert.equal(getCount(starting, 'hilo'), 1);
  const twice = recordVisit(starting, 'kona');
  assert.equal(getCount(twice, 'kona'), 2);
  const json = saveRegulars(twice);
  assert.equal(JSON.parse(json).v, REGULARS_VERSION);
  assert.equal(getCount(loadRegulars(json), 'kona'), 2);
  assert.equal(REGULARS_KEY, 'fh_regulars_v1');
});

test('greeter lines prefer a business tier line, then defaults, then generic lines', () => {
  const local = {
    name: 'Noa',
    lines: ['Generic hello'],
    tierLines: { ohana: ['You family now, come in'] },
  };
  assert.equal(pickGreeting({ local, tier: tierFor(15), rand: () => 0 }), 'You family now, come in');
  assert.equal(pickGreeting({ local, tier: tierFor(0), linesByTier: { stranger: ['File level'] }, rand: () => 0 }), 'File level');
  assert.equal(pickGreeting({ local, tier: tierFor(3), rand: () => 0 }), 'Generic hello');
  const merged = mergeGreeterLines({ greeterLines: { regular: ['Our regular from the file'] } });
  assert.equal(merged.regular[0], 'Our regular from the file');
  assert.deepEqual(merged.stranger, DEFAULT_GREETER_LINES.stranger);
  assert.ok(pickGreeting({ tier: tierFor(8), linesByTier: merged, rand: () => 0 }));
});

test('new shifts take off from FlashTown HQ and fall back if the pin is missing', () => {
  const hq = { id: 'flashtown-hq', name: 'FlashTown HQ', kind: 'hq', lat: 19.48148, lon: -155.098468 };
  const pad = startCoords([hq, ...toy]);
  assert.equal(pad.fromHq, true);
  assert.equal(pad.id, 'flashtown-hq');
  assert.deepEqual([pad.lat, pad.lon], [19.48148, -155.098468]);
  assert.equal(hqDestination(toy), null);
  const fb = startCoords(toy);
  assert.equal(fb.fromHq, false);
  assert.deepEqual([fb.lat, fb.lon], [FALLBACK_START.lat, FALLBACK_START.lon]);
  assert.equal(startCoords(null).fromHq, false);
});

test('homecoming bonus only pays after a job, and near-HQ uses a tight radius', () => {
  assert.equal(homecomingBonus(0), 0);
  assert.equal(homecomingBonus(1), 15);
  assert.equal(homecomingBonus(3, 100), 30);
  const hq = { lat: 19.48148, lon: -155.098468 };
  assert.equal(isNearHq({ lat: 19.48148, lon: -155.098468 }, hq), true);
  assert.equal(isNearHq({ lat: 19.72, lon: -155.05 }, hq), false);
  assert.equal(isNearHq(null, hq), false);
});

test('normalizeDestinations keeps per-business tier lines', () => {
  const [d] = normalizeDestinations([{
    name: 'Suisan', kind: 'shop', lat: 19.72, lon: -155.07,
    local: { name: 'Kenji', portrait: 'fisherman.webp', lines: ['Ho!'],
      tierLines: { familiar: ['Back again!'], ohana: ['', 'Family rate'], nope: ['ignored'] } },
  }]);
  assert.deepEqual(d.local.tierLines, { familiar: ['Back again!'], ohana: ['Family rate'] });
});
