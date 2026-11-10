import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { normalizeDestinations } from '../src/destinations.js';
import { makeMovingOffer, VESSEL_STOPS, MOVING_MULT } from '../src/moving-jobs.js';

const list = normalizeDestinations(JSON.parse(readFileSync(new URL('../public/destinations/destinations.json', import.meta.url))));

test('a moving offer rides on a vessel and picks up somewhere sensible', () => {
  let s = 7; const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const vessels = [{ key: 'fishing-0', kind: 'fishing', lat: 19.68, lon: -156.09 }, { key: 'cruise-0', kind: 'cruise', lat: 19.735, lon: -155.06 }];
  for (let i = 0; i < 30; i++) {
    const o = makeMovingOffer({ list, vessels, player: { lat: 19.5, lon: -155.1 }, rand });
    assert.ok(o, 'an offer');
    assert.ok(o.to.moving && o.to.vesselKey && o.tags.includes('moving'));
    assert.ok(o.legKm >= 3 && o.legKm <= 40, String(o.legKm));
    assert.notEqual(o.from.kind, 'hq');
    assert.equal(o.pay % 5, 0);
  }
  assert.ok(MOVING_MULT > 1);
});

test('no vessels, no offer; every vessel greeter has a portrait', () => {
  assert.equal(makeMovingOffer({ list, vessels: [] }), null);
  for (const v of VESSEL_STOPS) assert.ok(existsSync(new URL(`../public/locals/${v.local.portrait}`, import.meta.url)), v.local.portrait);
});
