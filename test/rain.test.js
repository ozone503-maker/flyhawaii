import test from 'node:test';
import assert from 'node:assert/strict';
import { showerCells, wetness, rainbowFor, WIND } from '../src/rain.js';

const box = { x0: 0, x1: 400, z0: -200, z1: 200 };

test('showers drift west on the trade wind and stay in the windward strip', () => {
  const a = showerCells(100, box, 6), b = showerCells(110, box, 6);
  assert.equal(a.length, 6);
  assert.ok(WIND.x < 0);
  const moved = a.filter((c, i) => b[i].x < c.x).length;
  assert.ok(moved >= 5);
  for (const c of a) { assert.ok(c.x >= box.x0 - 1 && c.x <= box.x1 + 1); assert.ok(c.k >= 0 && c.k <= 1); }
});

test('wet in the middle of a shower, dry outside', () => {
  const cells = [{ x: 0, z: 0, r: 20, k: 1 }];
  assert.equal(wetness(cells, 0, 0), 1);
  assert.equal(wetness(cells, 30, 0), 0);
});

test('a rainbow needs a low sun behind you and rain ahead', () => {
  const cells = [{ x: 100, z: 0, r: 20, k: 1 }];
  const cam = { x: 0, y: 5, z: 0 };
  const lowWest = { x: -Math.cos(0.4), y: Math.sin(0.4), z: 0 }; // sun 23 degrees up in the west, rain to the east
  assert.ok(rainbowFor(cam, lowWest, cells).k > 0.5);
  assert.equal(rainbowFor(cam, { x: Math.cos(0.4), y: Math.sin(0.4), z: 0 }, cells).k, 0); // sun ahead
  assert.equal(rainbowFor(cam, { x: -0.3, y: Math.sin(1.2), z: 0 }, cells).k, 0); // sun too high
  assert.equal(rainbowFor(cam, { x: -1, y: -0.1, z: 0 }, cells).k, 0); // sun down
});
