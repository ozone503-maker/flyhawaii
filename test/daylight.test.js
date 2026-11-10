import test from 'node:test';
import assert from 'node:assert/strict';
import { hawaiiHour, sunTimes, sunPosition, skyLook, hourFor } from '../src/daylight.js';

test('Hawaiʻi time is UTC-10 all year', () => {
  assert.equal(hawaiiHour(new Date('2026-11-10T08:30:00Z')), 22.5);
  assert.equal(hawaiiHour(new Date('2026-07-01T20:00:00Z')), 10);
});

test('the sun is up by day and down at night, south at noon', () => {
  const { rise, set } = sunTimes(314);
  assert.ok(rise > 6.2 && rise < 7.2 && set > 17.3 && set < 18.3, `${rise} ${set}`);
  assert.ok(sunPosition(12.4).el > 0.8);
  assert.ok(sunPosition(22).el < -0.3);
  assert.ok(Math.abs(sunPosition(12.45).az - Math.PI) < 0.1);
  assert.ok(sunPosition(8).az < Math.PI && sunPosition(16).az > Math.PI); // east in the morning, west after
});

test('night has stars and town lights, noon has neither', () => {
  const night = skyLook(sunPosition(23).el), noon = skyLook(sunPosition(12).el);
  assert.ok(night.stars > 0.9 && night.lights > 0.9 && night.night);
  assert.equal(noon.stars, 0); assert.equal(noon.lights, 0);
  assert.equal(hourFor('night'), 21.5);
});
