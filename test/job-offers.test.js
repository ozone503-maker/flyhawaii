import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeOffers, offerPay, offerEtaSec, formatEta, formatKm, PAY, TAGS } from '../src/job-offers.js';
import { normalizeDestinations } from '../src/destinations.js';

const list = normalizeDestinations(JSON.parse(readFileSync(new URL('../public/destinations/destinations.json', import.meta.url))));
const seeded = (s = 7) => () => (s = (s * 16807) % 2147483647) / 2147483647;
const D = (id, lat, lon) => ({ id, name: id, kind: 'shop', lat, lon });
const toy = [D('kona', 19.64, -155.99), D('keauhou', 19.57, -155.96), D('volcano', 19.43, -155.23), D('hilo', 19.72, -155.08), D('waimea', 20.02, -155.67)];

test('pay grows with distance and deadhead pays less than the delivery leg', () => {
  let prev = 0;
  for (const km of [1, 5, 20, 50, 100]) { const p = offerPay(km, 0); assert.ok(p >= prev); prev = p; }
  assert.equal(offerPay(0, 0), PAY.base);
  assert.equal(offerPay(50, 0), 95);
  assert.ok(offerPay(50, 0) > offerPay(0, 50), 'driving to the pickup is paid at a lower rate');
  assert.ok(offerPay(10, 30) > offerPay(10, 0), 'a far pickup still pays more');
  assert.equal(offerPay(20, 0) % PAY.round, 0);
});

test('rush and fragile pay more, jitter stays small', () => {
  const plain = offerPay(40, 10);
  assert.ok(offerPay(40, 10, ['rush']) > plain);
  assert.ok(offerPay(40, 10, ['fragile']) > plain);
  assert.ok(TAGS.rush.mult > TAGS.fragile.mult);
  assert.ok(Math.abs(offerPay(80, 0, [], 1) - offerPay(80, 0)) <= 0.08 * offerPay(80, 0) + PAY.round);
});

test('four distinct offers from the shipped destinations, each fully described', () => {
  const offers = makeOffers(list, { lat: 19.72, lon: -155.05 }, seeded());
  assert.equal(offers.length, 4);
  assert.equal(new Set(offers.map((o) => o.key)).size, 4);
  offers.forEach((o, i) => {
    assert.equal(o.slot, i + 1);
    assert.notEqual(o.from.id, o.to.id);
    assert.ok(o.legKm >= 1 && o.totalKm >= o.legKm);
    assert.ok(o.pay > 0 && o.etaSec > 0 && o.pkg);
  });
});

test('offers span short to long trips and pay follows distance', () => {
  for (let s = 1; s < 40; s++) {
    const offers = makeOffers(toy, { lat: 19.64, lon: -155.99 }, seeded(s));
    assert.equal(offers.length, 4);
    const km = offers.map((o) => o.totalKm);
    assert.deepEqual([...km].sort((a, b) => a - b), km, 'sorted short to long');
    assert.ok(km[3] > km[0] * 2, 'a real spread');
    for (const o of offers) {
      const exact = offerPay(o.legKm, o.deadheadKm, o.tags);
      assert.ok(Math.abs(o.pay - exact) <= exact * 0.08 + PAY.round, `${o.key} ${o.pay} vs ${exact}`);
    }
    assert.ok(offers[3].pay > offers[0].pay, 'the longest trip pays more than the shortest');
  }
});

test('reroll avoids the previous board when it can', () => {
  const first = makeOffers(toy, null, seeded(3));
  const again = makeOffers(toy, null, seeded(4), { avoid: new Set(first.map((o) => o.key)) });
  assert.equal(again.filter((o) => first.some((f) => f.key === o.key)).length, 0);
});

test('tiny lists give fewer offers instead of failing', () => {
  assert.deepEqual(makeOffers([toy[0]], null), []);
  assert.deepEqual(makeOffers([], null), []);
  assert.equal(makeOffers(toy.slice(0, 2), null).length, 2);
});

test('eta and labels read well', () => {
  assert.ok(offerEtaSec(0) > 0);
  assert.ok(offerEtaSec(100) > offerEtaSec(10));
  assert.equal(formatEta(20), '~20 s');
  assert.equal(formatEta(60), '~1 min');
  assert.equal(formatEta(58), '~1 min');
  assert.equal(formatEta(57), '~55 s');
  assert.equal(formatEta(95), '~1 min 30 s');
  assert.equal(formatKm(3.25), '3.3 km');
  assert.equal(formatKm(81.6), '82 km');
});
