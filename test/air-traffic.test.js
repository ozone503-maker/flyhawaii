import test from 'node:test';
import assert from 'node:assert/strict';
import { RUNWAYS, HELI_TOURS, timedPath, airlinerCircuit, heliLoop } from '../src/air-traffic.js';

test('runways match the real headings: Hilo 08 east, Kona 17 south', () => {
  const ito = RUNWAYS.ito, koa = RUNWAYS.koa;
  assert.ok(ito.to.lon > ito.from.lon && Math.abs(ito.to.lat - ito.from.lat) < 0.001);
  assert.ok(koa.to.lat < koa.from.lat);
});

test('an airliner circuit starts and ends on the runway and loops smoothly', () => {
  const from = { x: 0, z: 0 }, to = { x: 30, z: 0 };
  const pts = airlinerCircuit({ from, to, groundY: 0.1, seaSide: -1 });
  const path = timedPath(pts, [0]);
  assert.ok(path.period > 200 && path.period < 1200, String(path.period));
  const a = path.at(0), b = path.at(path.period);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 1e-6);
  let maxY = 0; for (let t = 0; t < path.period; t += 2) maxY = Math.max(maxY, path.at(t).y);
  assert.ok(maxY > 8 && maxY < 14);
  assert.ok(path.at(5).onGround); // holding at the start
  // the circuit turns to the sea side (z < 0 for seaSide -1 with the runway pointing +x)
  let minZ = 0; for (let t = 0; t < path.period; t += 2) minZ = Math.min(minZ, path.at(t).z);
  assert.ok(minZ < -40);
});

test('helicopters stay above the ground', () => {
  const ground = (x, z) => Math.sin(x * 0.1) * 5 + 10;
  const pts = heliLoop(HELI_TOURS[0].pts.map(([lat, lon]) => ({ x: (lon + 155) * 1000, z: (19.7 - lat) * 1000 })), ground);
  const path = timedPath(pts);
  for (let t = 0; t < path.period; t += 7) { const s = path.at(t); assert.ok(s.y >= ground(s.x, s.z) + 3, String(t)); }
});
