// Time trial in the world: hex gates around the coast, lap timer, best lap and a ghost saucer
// that replays your best run. Course math lives in time-trial.js.
import * as THREE from 'three';
import { traceCourse, makeGates, nearestIndex, formatLap, encodeGhost, ghostAt, touchesGate, GHOST_HZ } from './time-trial.js';

const BEST_KEY = 'fh_tt_best_v1';
const KDU = 0x1ec8ff, GOLD = 0xffc94d;

function loadBest() { try { const b = JSON.parse(localStorage.getItem(BEST_KEY) || 'null'); return b && Number.isFinite(b.time) ? b : null; } catch { return null; } }
function saveBest(b) { try { localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch { /* private mode */ } }

/** ctx: { scene, elevM(x, z), toWorld(lat, lon) -> Vector2, fromWorld(x, z) -> { lat, lon } } */
export function createTimeTrial(ctx) {
  const { scene, elevM, toWorld, fromWorld } = ctx;
  const group = new THREE.Group(); group.visible = false; scene.add(group);
  let gates = [], meshes = [], next = 0, lapStart = null, lastLap = null, samples = [], sampleT = 0, laps = 0;
  let best = loadBest();
  const ringGeo = new THREE.TorusGeometry(1, 0.06, 4, 6); // six sides: a hex ring
  const mk = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false });
  const ghost = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10).scale(1, 0.28, 1), mk(0x9fe8ff, 0.35));
  ghost.visible = false; group.add(ghost);

  function build() {
    if (gates.length) return;
    const c = toWorld(19.6, -155.5);
    const course = traceCourse(elevM, { x: c.x, z: c.y });
    const hilo = toWorld(19.76, -155.04); // start and finish off Hilo Bay
    gates = makeGates(course, nearestIndex(course, hilo.x, hilo.y));
    meshes = gates.map((g, i) => {
      const m = new THREE.Mesh(ringGeo, mk(i === 0 ? GOLD : KDU, 0.0));
      m.position.set(g.c.x, g.c.y, g.c.z); m.scale.setScalar(g.r);
      m.rotation.y = Math.atan2(g.n.x, g.n.z); m.rotation.z = Math.PI / 6; // flat side down
      group.add(m); return m;
    });
  }
  function paint(t = 0) {
    meshes.forEach((m, i) => {
      const ahead = (i - next + gates.length) % gates.length;
      const on = ahead < 4 || (i === 0 && lapStart !== null && next === 0);
      m.visible = on;
      m.material.opacity = ahead === 0 ? 0.95 : 0.45 - ahead * 0.1;
      m.scale.setScalar(gates[i].r * (ahead === 0 ? 1 + 0.05 * Math.sin(t * 6) : 1));
    });
  }

  return {
    get gates() { return gates; },
    get best() { return best; },
    get next() { return next; },
    /** where to put the saucer: just before the start gate, facing through it */
    spawn() {
      build();
      const g = gates[0];
      return { x: g.c.x - g.n.x * 14, y: g.c.y, z: g.c.z - g.n.z * 14, yaw: Math.atan2(-g.n.x, -g.n.z) };
    },
    start() { build(); group.visible = true; next = 0; lapStart = null; samples = []; laps = 0; paint(); },
    stop() { group.visible = false; },
    /** p0 -> p1: the saucer's move this frame. Returns an event or null. */
    update(dt, t, p0, p1) {
      if (!group.visible) return null;
      let ev = null;
      if (touchesGate(gates[next], p0, p1)) {
        if (next === 0) {
          if (lapStart !== null) { // finished a lap
            const time = t - lapStart; lastLap = time; laps++;
            const newBest = !best || time < best.time;
            if (newBest) { best = { time, ghost: encodeGhost(samples), at: Date.now() }; saveBest(best); }
            ev = { type: 'lap', time, newBest };
          } else ev = { type: 'start' };
          lapStart = t; samples = []; sampleT = 0;
        } else ev = { type: 'gate', index: next, split: t - lapStart };
        next = (next + 1) % gates.length;
      }
      if (lapStart !== null) { // record for the ghost
        sampleT += dt;
        while (sampleT >= 1 / GHOST_HZ) { sampleT -= 1 / GHOST_HZ; samples.push([p1.x, p1.y, p1.z]); }
        const g = best?.ghost && ghostAt(best.ghost, t - lapStart);
        ghost.visible = !!g && !g.done;
        if (g) ghost.position.set(g.x, g.y, g.z);
      } else ghost.visible = false;
      paint(t);
      return ev;
    },
    /** the next gate, for the arrow and minimap */
    target() {
      const g = gates[next]; if (!g) return null;
      const ll = fromWorld(g.c.x, g.c.z);
      return { w: new THREE.Vector2(g.c.x, g.c.z), lat: ll.lat, lon: ll.lon, name: next === 0 ? 'Start gate' : `Gate ${next}` };
    },
    hud(t) {
      const running = lapStart !== null;
      return {
        step: running ? `Lap ${formatLap(t - lapStart)}` : 'Time trial',
        target: (next === 0 ? (running ? 'Finish gate' : 'Start gate off Hilo Bay') : `Gate ${next} of ${gates.length - 1}`) + (running ? `  ${formatLap(t - lapStart)}` : (best ? `  best ${formatLap(best.time)}` : '')),
        cargo: best ? `Best ${formatLap(best.time)}` : (lastLap ? `Last ${formatLap(lastLap)}` : 'No best yet'),
        hint: running ? 'Touch the glowing hex gates in order, all the way around the island' : 'Touch the gold gate to start the clock',
      };
    },
  };
}
