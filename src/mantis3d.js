// Defend the island: mantis alien craft (our own design: gunmetal mechanical mantises with
// glowing teal eyes, antennae, scythe forelegs and swept wings), plasma bolts, explosions.
// Rules and steering live in combat.js.
import * as THREE from 'three';
import { RAID_TOWNS, MANTIS, PLAYER, TOWN_HP, waveSpec, waveBonus, spawnRing, assistTarget, segPointDist, mantisGoal, steer, shieldStep, swarmSpeed, escapeSpec, escapeGoal, caughtBonus, runnerSpeed, QUICK_CATCH_S, runnerEscapes, RUNNER_LOCK, LOCK, MISSILE, lockStep } from './combat.js';

const BEST_KEY = 'fh_defend_best_v1';
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function merge(parts) {
  const pos = [], nor = [], col = [];
  for (const { geo, color } of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo; g.computeVertexNormals();
    const p = g.attributes.position.array, n = g.attributes.normal.array, c = new THREE.Color(color);
    for (let i = 0; i < p.length; i += 3) { pos.push(p[i], p[i + 1], p[i + 2]); nor.push(n[i], n[i + 1], n[i + 2]); col.push(c.r, c.g, c.b); }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}
/** a rod from a to b */
function rod(a, b, r0, r1 = r0, seg = 6) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), L = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r1, r0, L, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g;
}

// nose toward +z, about 1 unit long
function mantisBodyGeo() {
  const M = 0x7f8994, D = 0x3c434b, L = 0xa3adb7;
  const parts = [
    { geo: new THREE.SphereGeometry(0.5, 12, 8).scale(0.13, 0.11, 0.44).translate(0, -0.02, -0.32), color: M }, // abdomen
    { geo: new THREE.SphereGeometry(0.5, 10, 6).scale(0.1, 0.06, 0.2).translate(0, 0.05, -0.32), color: L },   // abdomen plate
    { geo: new THREE.SphereGeometry(0.5, 10, 8).scale(0.14, 0.13, 0.28).translate(0, 0.02, 0.02), color: M },   // thorax
    { geo: rod([0, 0.05, 0.12], [0, 0.22, 0.3], 0.035, 0.028), color: D },                                    // neck
    { geo: new THREE.ConeGeometry(0.1, 0.16, 3).rotateX(Math.PI).rotateY(Math.PI / 6).translate(0, 0.24, 0.34), color: M }, // head
  ];
  for (const s of [1, -1]) {
    parts.push({ geo: rod([s * 0.03, 0.29, 0.36], [s * 0.1, 0.45, 0.42], 0.006), color: D }); // antennae
    parts.push({ geo: rod([s * 0.1, 0.45, 0.42], [s * 0.22, 0.58, 0.28], 0.005), color: D });
    parts.push({ geo: rod([s * 0.05, 0.14, 0.22], [s * 0.09, 0.02, 0.46], 0.03, 0.022), color: M }); // scythe arm
    parts.push({ geo: rod([s * 0.09, 0.02, 0.46], [s * 0.08, -0.28, 0.34], 0.03, 0.008), color: L }); // blade
    for (const k of [0.1, 0.2]) parts.push({ geo: rod([s * 0.087, 0.02 - k, 0.46 - k * 0.43], [s * 0.087, -0.01 - k, 0.5 - k * 0.43], 0.006, 0.001), color: L }); // spikes
    for (const z of [0.0, -0.1]) { // walking legs, dangling
      parts.push({ geo: rod([s * 0.06, -0.02, z], [s * 0.2, 0.06, z - 0.05], 0.012), color: D });
      parts.push({ geo: rod([s * 0.2, 0.06, z - 0.05], [s * 0.26, -0.3, z - 0.1], 0.01, 0.004), color: D });
    }
  }
  return merge(parts);
}
function wingGeo() { // one wing, root at the origin, out along +x and back along -z
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.06, 0.62, 0.02, -0.18, 0.12, 0, -0.5, 0, 0, 0.06, 0.12, 0, -0.5, 0.0, 0, -0.3], 3));
  g.computeVertexNormals(); return g;
}

function flashTexture(color) {
  const S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S; const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S); const t = new THREE.CanvasTexture(cv); return t;
}

function loadBest() { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; } }

/** ctx: { scene, toWorld(lat, lon) -> Vector2, fromWorld(x, z), groundY(x, z), isTouch } */
export function createCombat(ctx) {
  const { scene, toWorld, fromWorld, groundY, isTouch } = ctx;
  const elevU = ctx.elevU || ((x, z) => groundY(x, z) || -1);
  const bounds = ctx.bounds || 800;
  const group = new THREE.Group(); group.visible = false; scene.add(group);
  const bodyGeo = mantisBodyGeo(), wGeo = wingGeo();
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.42 });
  const wingMat = new THREE.MeshStandardMaterial({ color: 0x5c6b78, metalness: 0.3, roughness: 0.4, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x38ffd2, fog: false });
  const eyeGeo = new THREE.SphereGeometry(0.05, 10, 8);
  const eyeGlowMat = new THREE.SpriteMaterial({ map: flashTexture('#38ffd2'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 });
  const SIZE = 3.4; // about 340 m: bigger than the saucer, menacing and easy to spot
  const markMat = new THREE.SpriteMaterial({ map: flashTexture('#38ffd2'), color: 0xffffff, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false, fog: false });
  const runMat = new THREE.SpriteMaterial({ map: flashTexture('#ffd24d'), color: 0xffffff, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false, fog: false });
  const pool = [];
  function makeMantis() {
    const g = new THREE.Group(); g.rotation.order = 'YXZ';
    const body = new THREE.Mesh(bodyGeo, bodyMat); g.add(body);
    const wings = [1, -1].map((s) => { const w = new THREE.Mesh(wGeo, wingMat); w.scale.x = s; w.position.set(s * 0.05, 0.08, 0.02); g.add(w); return w; });
    for (const s of [1, -1]) { const e = new THREE.Mesh(eyeGeo, eyeMat); e.position.set(s * 0.075, 0.27, 0.37); e.scale.set(1, 1.2, 1); g.add(e);
      const h = new THREE.Sprite(eyeGlowMat); h.position.copy(e.position); h.scale.setScalar(0.2); g.add(h); }
    g.scale.setScalar(SIZE); group.add(g);
    const mark = new THREE.Sprite(markMat); mark.scale.set(0.035, 0.035, 1); mark.renderOrder = 20; group.add(mark);
    return { mark, g, wings, x: 0, y: 0, z: 0, v: { x: 0, y: 0, z: 0 }, hp: 0, dead: true, seed: Math.random(), cool: 0, flash: 0 };
  }
  // bolts
  const boltGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.6, 6).rotateX(Math.PI / 2);
  const pBoltMat = new THREE.MeshBasicMaterial({ color: 0x7fe6ff, fog: false });
  const mBoltMat = new THREE.MeshBasicMaterial({ color: 0x5dff9a, fog: false });
  const bolts = [];
  function bolt(from, dir, speed, life, mine, home = -1, far = false) {
    let b = bolts.find((q) => !q.live && q.mine === mine);
    if (!b) { b = { m: new THREE.Mesh(boltGeo, mine ? pBoltMat : mBoltMat), mine }; b.m.scale.setScalar(mine ? 1 : 1.4); group.add(b.m); bolts.push(b); }
    Object.assign(b, { live: true, x: from.x, y: from.y, z: from.z, vx: dir.x * speed, vy: dir.y * speed, vz: dir.z * speed, life, home, speed, far, seen: false });
    b.m.visible = true;
  }
  // the one lock-on missile per chase: a gold dart with a glowing tail
  const missile = new THREE.Group(); missile.visible = false; group.add(missile);
  missile.add(new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.6, 6).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffc94d, fog: false })));
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.3, 2.6, 6, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -1.9), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  missile.add(tail);
  const M = { live: false, x: 0, y: 0, z: 0, v: { x: 0, y: 0, z: 0 }, life: 0 };
  // explosions
  const flashTex = flashTexture('#8fffe0'), booms = [];
  function boom(x, y, z, big = 1) {
    let e = booms.find((q) => !q.live);
    if (!e) { e = { s: new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })) }; group.add(e.s); booms.push(e); }
    Object.assign(e, { live: true, t: 0, big }); e.s.position.set(x, y, z); e.s.visible = true;
  }

  const towns = RAID_TOWNS.map((t) => { const w = toWorld(t.lat, t.lon); return { ...t, x: w.x, z: w.y, y: groundY(w.x, w.y) }; });
  const S = { runner: null, escT: 0, streak: 0, on: false, wave: 0, town: null, townHP: TOWN_HP, shield: PLAYER.shield, sinceHit: 99, fireCool: 0, kills: 0, score: 0, best: loadBest(), invuln: 0, between: 0, over: 0 };
  const events = [];

  function startWave(n) {
    S.wave = n; S.town = towns[(n - 1) % towns.length]; S.townHP = TOWN_HP; S.between = 0; S.runner = null; S.escT = 0; S.escaped = false; S.lock = 0; S.missiles = 0; M.live = false; missile.visible = false;
    const spec = waveSpec(n), spots = spawnRing(S.town, spec.count);
    spots.forEach((p, i) => {
      const m = pool[i] || (pool[i] = makeMantis());
      m.runner = false; m.mark.material = markMat; m.mark.scale.set(0.035, 0.035, 1); m.dodgeCool = 0;
      Object.assign(m, { x: p.x, y: S.town.y + 8 + Math.random() * 6, z: p.z, hp: MANTIS.hp, dead: false, speed: spec.speed * (0.9 + Math.random() * 0.2), fireEvery: spec.fireEvery, cool: Math.random() * spec.fireEvery, seed: Math.random() });
      m.v = { x: (S.town.x - p.x) * 0.01, y: 0, z: (S.town.z - p.z) * 0.01 }; m.g.visible = true;
    });
    for (let i = spots.length; i < pool.length; i++) { pool[i].dead = true; pool[i].g.visible = false; pool[i].mark.visible = false; }
    const ang = Math.atan2(-(spots[0].z - S.town.z), spots[0].x - S.town.x); // 0 = east, counterclockwise
    const dirs = ['east', 'northeast', 'north', 'northwest', 'west', 'southwest', 'south', 'southeast'];
    const from = dirs[((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8];
    events.push({ type: 'wave', wave: n, town: S.town.name, count: spec.count, from });
  }
  const alive = () => pool.filter((m) => !m.dead);
  const tmpDir = new THREE.Vector3();

  return {
    get state() { return S; },
    get missileLive() { return M.live; },
    get mantises() { return alive(); },
    start() { group.visible = true; S.on = true; S.kills = 0; S.score = 0; S.streak = 0; S.shield = PLAYER.shield; S.over = 0; startWave(1); },
    stop() { group.visible = false; S.on = false; },
    /** firing: true while the fire control is held. aim: unit vector the saucer points along */
    update(dt, t, pos, aim, firing, playerSpeed = 0) {
      events.length = 0;
      if (!S.on) return events;
      const tt = reduceMotion ? 0 : t;
      S.sinceHit += dt; S.invuln = Math.max(0, S.invuln - dt); S.shield = shieldStep(S.shield, dt, S.sinceHit);
      // player fire
      S.fireCool -= dt;
      const runnerUp = S.runner && !S.runner.dead;
      if (runnerUp && S.missiles > 0 && !M.live) S.lock = lockStep(S.lock, dt, pos, aim, S.runner); else if (!M.live) S.lock = 0;
      if (firing && S.lock >= 1 && S.missiles > 0 && !M.live && runnerUp) { // locked: fire the missile
        S.missiles--; S.fireCool = 0.4; S.lock = 0;
        Object.assign(M, { live: true, x: pos.x + aim.x * 1.5, y: pos.y - 0.3, z: pos.z + aim.z * 1.5, v: { x: aim.x * MISSILE.speed * 0.6, y: aim.y * MISSILE.speed * 0.6, z: aim.z * MISSILE.speed * 0.6 }, life: MISSILE.life });
        missile.visible = true; events.push({ type: 'missile' });
      }
      if (M.live) { // pure pursuit, faster and tighter-turning than the runner: it always gets there
        const r = S.runner;
        if (!r || r.dead || (M.life -= dt) <= 0) { M.live = false; missile.visible = false; }
        else {
          M.v = steer(M.v, M, r, MISSILE.speed, MISSILE.turn, dt);
          M.x += M.v.x * dt; M.y += M.v.y * dt; M.z += M.v.z * dt;
          missile.position.set(M.x, M.y, M.z); missile.lookAt(M.x + M.v.x, M.y + M.v.y, M.z + M.v.z);
          tail.scale.set(1, 1, 0.8 + Math.random() * 0.5);
          if (Math.hypot(r.x - M.x, r.y - M.y, r.z - M.z) < MISSILE.hitR + MANTIS.radius) {
            M.live = false; missile.visible = false; r.dead = true; r.g.visible = false; r.mark.visible = false; S.kills++; S.score += MANTIS.bounty; boom(r.x, r.y, r.z, 3);
            events.push({ type: 'kill', bounty: MANTIS.bounty });
            const secs = S.escT, quick = secs < QUICK_CATCH_S, bonus = caughtBonus(S.wave, secs, S.streak); S.streak = quick ? S.streak + 1 : 0; S.score += bonus;
            events.push({ type: 'caught', wave: S.wave, bonus, secs, quick, streak: S.streak, missile: true });
          }
        }
      }
      if (firing && S.fireCool <= 0 && !S.over) {
        S.fireCool = 1 / PLAYER.fireRate;
        const from = { x: pos.x + aim.x * 1.4, y: pos.y + aim.y * 1.4 - 0.1, z: pos.z + aim.z * 1.4 };
        const list = alive(), chasing = S.runner && !S.runner.dead;
        const home = chasing ? assistTarget(from, aim, list, RUNNER_LOCK) : assistTarget(from, aim, list);
        const far = chasing && Math.hypot(S.runner.x - pos.x, S.runner.y - pos.y, S.runner.z - pos.z) > RUNNER_LOCK.range;
        bolt(from, aim, PLAYER.boltSpeed, PLAYER.boltLife, true, home >= 0 ? pool.indexOf(list[home]) : -1, far);
        events.push({ type: 'shot' });
      }
      // the last craft of a wave makes a run for it
      const living = alive();
      if (!S.runner && living.length === 1 && !S.over) {
        S.runner = living[0]; S.runner.runner = true; S.escT = 0; S.runner.mark.material = runMat; S.runner.mark.scale.set(0.05, 0.05, 1);
        S.runner.hp += 2; S.missiles = 1; S.lock = 0; S.breakT = 0.7; for (const b of bolts) { b.home = -1; b.far = true; }
        { // it blinks out of the fight to a head start over the island, so every chase starts as a chase
          const r = S.runner, g = escapeGoal(r, pos, tt, escapeSpec(S.wave), elevU), dx = g.x - r.x, dz = g.z - r.z, L = Math.hypot(dx, dz) || 1;
          boom(r.x, r.y, r.z, 0.8);
          const hop = [60, 50, 40, 30, 20].find((h) => elevU(r.x + dx / L * h, r.z + dz / L * h) > 0.05) || 30;
          r.x += dx / L * hop; r.z += dz / L * hop; r.y = Math.max(0, elevU(r.x, r.z)) + 2.5; r.v = { x: dx / L * 60, y: 0, z: dz / L * 60 };
          boom(r.x, r.y, r.z, 0.8);
        }
        events.push({ type: 'runner', wave: S.wave });
      }
      const esc = escapeSpec(S.wave);
      // mantises
      for (const m of pool) {
        if (m.dead) continue;
        const dPlayer = Math.hypot(pos.x - m.x, pos.y - m.y, pos.z - m.z);
        let mode;
        if (m.runner) {
          mode = 'run'; S.escT += dt;
          m.v = steer(m.v, m, escapeGoal(m, pos, tt, esc, elevU), S.breakT > 0 ? Math.max(30, playerSpeed) * 1.1 : runnerSpeed(esc, dPlayer, playerSpeed), esc.turn, dt);
          S.breakT = Math.max(0, (S.breakT || 0) - dt);
          // sidestep a shot that is about to land
          m.dodgeCool = Math.max(0, (m.dodgeCool || 0) - dt);
          for (const b of bolts) {
            if (!b.live || !b.mine) continue;
            const dx = m.x - b.x, dy = m.y - b.y, dz = m.z - b.z, d = Math.hypot(dx, dy, dz);
            if (d < 9 && (dx * b.vx + dy * b.vy + dz * b.vz) > 0 && (b.far || m.dodgeCool <= 0) && !b.seen) {
              b.seen = true;
              m.dodgeCool = 0.5;
              if (b.far || Math.random() < esc.dodge) { const sx = -b.vz, sz = b.vx, sl = Math.hypot(sx, sz) || 1, side = Math.random() < 0.5 ? -1 : 1;
                m.x += sx / sl * side * 2.2; m.z += sz / sl * side * 2.2; m.y += (Math.random() - 0.5) * 1.5; b.home = -1; }
              break;
            }
          }
          if (!M.live && runnerEscapes(S.escT, dPlayer)) {
            m.dead = true; m.g.visible = false; m.mark.visible = false; S.escaped = true; S.streak = 0;
            events.push({ type: 'escaped', wave: S.wave }); continue;
          }
        } else {
          const g = mantisGoal(m, S.town, pos, tt, aim, playerSpeed); mode = g.mode;
          m.v = steer(m.v, m, g.goal, swarmSpeed(m.speed, playerSpeed, dPlayer), MANTIS.turn * 1.8, dt);
        }
        m.x += m.v.x * dt; m.y += m.v.y * dt; m.z += m.v.z * dt;
        m.y = Math.max(m.y, groundY(m.x, m.z) + 2.5);
        m.g.position.set(m.x, m.y, m.z); m.mark.position.set(m.x, m.y + SIZE * 0.5, m.z); m.mark.visible = true;
        const h = Math.atan2(m.v.x, m.v.z), fl = Math.hypot(m.v.x, m.v.z);
        m.g.rotation.set(-Math.atan2(m.v.y, fl) * 0.6, h, Math.sin(tt * 2 + m.seed * 9) * 0.15);
        const flap = Math.sin(tt * 26 + m.seed * 20) * 0.5;
        m.wings[0].rotation.z = flap; m.wings[1].rotation.z = -flap;
        // shoot at the player when close
        m.cool -= dt;
        const dp = Math.hypot(pos.x - m.x, pos.y - m.y, pos.z - m.z);
        if (mode === 'fight' && dp < MANTIS.fireRange && m.cool <= 0 && !S.over) {
          m.cool = m.fireEvery * (0.8 + Math.random() * 0.4);
          tmpDir.set(pos.x - m.x, pos.y - m.y, pos.z - m.z).normalize();
          tmpDir.x += (Math.random() - 0.5) * 0.06; tmpDir.y += (Math.random() - 0.5) * 0.06; tmpDir.normalize();
          bolt({ x: m.x, y: m.y + 0.3, z: m.z }, tmpDir, 60, 1.4, false);
        }
        // raiding the town
        if (mode === 'raid' && Math.hypot(m.x - S.town.x, m.z - S.town.z) < 7 && !S.over) {
          S.townHP = Math.max(0, S.townHP - MANTIS.townDps * dt);
        }
      }
      // bolts
      for (const b of bolts) {
        if (!b.live) continue;
        if (b.home >= 0 && !pool[b.home]?.dead) { // gentle homing toward the assist target
          const m = pool[b.home], dx = m.x - b.x, dy = m.y - b.y, dz = m.z - b.z, d = Math.hypot(dx, dy, dz) || 1;
          const k = Math.min(1, (m.runner ? 10 : 6) * dt);
          b.vx += (dx / d * b.speed - b.vx) * k; b.vy += (dy / d * b.speed - b.vy) * k; b.vz += (dz / d * b.speed - b.vz) * k;
        }
        const a = { x: b.x, y: b.y, z: b.z };
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt;
        b.m.position.set(b.x, b.y, b.z); b.m.lookAt(b.x + b.vx, b.y + b.vy, b.z + b.vz);
        if (b.mine) {
          for (const m of pool) {
            if (m.dead || (m.runner && b.far) || segPointDist(a, b, m) > MANTIS.radius * (m.runner ? 1.3 : 1)) continue; // long shots never touch the runner
            b.life = 0;
            m.hp -= 1;
            if (m.hp <= 0) {
              m.dead = true; m.g.visible = false; m.mark.visible = false; S.kills++; S.score += MANTIS.bounty; boom(m.x, m.y, m.z, m.runner ? 2.2 : 1.4);
              events.push({ type: 'kill', bounty: MANTIS.bounty });
              if (m.runner) { const secs = S.escT, quick = secs < QUICK_CATCH_S; const bonus = caughtBonus(S.wave, secs, S.streak); S.streak = quick ? S.streak + 1 : 0; S.score += bonus; events.push({ type: 'caught', wave: S.wave, bonus, secs, quick, streak: S.streak }); }
            } else { boom(b.x, b.y, b.z, 0.4); events.push({ type: 'hit' }); }
            break;
          }
        } else if (S.invuln <= 0 && segPointDist(a, b, pos) < 1.3) {
          b.life = 0; S.shield -= PLAYER.hitDamage; S.sinceHit = 0; boom(b.x, b.y, b.z, 0.5);
          events.push({ type: 'hurt' });
          if (S.shield <= 0) { S.shield = PLAYER.shield; S.invuln = 3; events.push({ type: 'down' }); }
        }
        if (b.life <= 0 || b.y < groundY(b.x, b.z)) { b.live = false; b.m.visible = false; }
      }
      // explosions
      for (const e of booms) {
        if (!e.live) continue;
        e.t += dt; const k = e.t / 0.6;
        e.s.scale.setScalar((1 + k * 5) * e.big * 2); e.s.material.opacity = Math.max(0, 1 - k);
        if (k >= 1) { e.live = false; e.s.visible = false; }
      }
      // wave over, or the town fell
      if (!S.over && S.townHP <= 0) {
        S.over = 4; if (S.wave > S.best) { S.best = S.wave; try { localStorage.setItem(BEST_KEY, String(S.best)); } catch { /* private */ } }
        events.push({ type: 'lost', town: S.town.name, wave: S.wave, best: S.best });
      } else if (S.over) {
        S.over -= dt; if (S.over <= 0) { S.over = 0; S.kills = 0; S.score = 0; S.streak = 0; startWave(1); }
      } else if (!alive().length) {
        if (!S.between) { S.between = 2.5; const bonus = waveBonus(S.wave); S.score += bonus; events.push({ type: 'cleared', wave: S.wave, bonus, escaped: S.escaped });
          if (S.wave > S.best) { S.best = S.wave; try { localStorage.setItem(BEST_KEY, String(S.best)); } catch { /* private */ } } }
        else { S.between -= dt; if (S.between <= 0.001) startWave(S.wave + 1); }
      }
      return events;
    },
    /** nearest mantis (or the town under attack) for the arrow and minimap; the runner when one is running */
    target(pos) {
      if (S.runner && !S.runner.dead) { const ll = fromWorld(S.runner.x, S.runner.z); return { w: new THREE.Vector2(S.runner.x, S.runner.z), lat: ll.lat, lon: ll.lon, name: 'Runner' }; }
      let best = null, bd = Infinity;
      for (const m of alive()) { const d = (m.x - pos.x) ** 2 + (m.z - pos.z) ** 2; if (d < bd) { bd = d; best = m; } }
      const p = best || S.town; if (!p) return null;
      const ll = fromWorld(p.x, p.z);
      return { w: new THREE.Vector2(p.x, p.z), lat: ll.lat, lon: ll.lon, name: best ? 'Mantis craft' : S.town.name };
    },
  };
}
