// KDU fly-through rings in the 3D world: pooled instanced meshes per tier,
// spin and bob, plane-crossing pickup, combos, chains, respawns and bursts.
import * as THREE from 'three';
import { RING_TIERS, pickTier, crossRing, ringReward, nextStreak, chainBonus, ringsAlong, chainSpots } from './rings.js';

const SCATTER = 46;          // rings spread around the island
const ROUTE_MAX = 22;        // rings along the current job legs
const NEAR_R = 140;          // keep a few rings within this range of the ship (14 km)
const NEAR_MIN = 7;
const PER_TIER = 64;         // pool size per tier
const RESPAWN = [22, 40];    // seconds before a collected ring comes back elsewhere
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color();

export function createRingField(scene, { groundAt, randomSpot, maxY = 60, rand = Math.random }) {
  const tiers = RING_TIERS.map((tier) => {
    const core = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.085, 4, 6),
      new THREE.MeshBasicMaterial({ color: tier.prismatic ? 0xffffff : tier.color, toneMapped: false }), PER_TIER);
    const glow = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.24, 6, 6),
      new THREE.MeshBasicMaterial({ color: tier.glow, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), PER_TIER);
    const veil = new THREE.InstancedMesh(new THREE.CircleGeometry(0.94, 6),
      new THREE.MeshBasicMaterial({ color: tier.color, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), PER_TIER);
    for (const m of [core, glow, veil]) { m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); }
    if (tier.prismatic) { for (let i = 0; i < PER_TIER; i++) core.setColorAt(i, _c.set(tier.color)); }
    return { tier, core, glow, veil };
  });
  // burst flashes, pooled
  const flashGeo = new THREE.TorusGeometry(1, 0.12, 4, 6);
  const flashes = Array.from({ length: 8 }, () => {
    const m = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.visible = false; scene.add(m); return { m, t: 1, s: 1 };
  });
  const sparkGeo = new THREE.BufferGeometry();
  const SPARKS = 48, sp = new Float32Array(SPARKS * 3), sv = new Float32Array(SPARKS * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const sparkMat = new THREE.PointsMaterial({ size: 0.16, map: dotTexture(), alphaTest: 0.01, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const sparks = new THREE.Points(sparkGeo, sparkMat); sparks.frustumCulled = false; scene.add(sparks);
  let sparkT = 1;

  let rings = [], chainSeq = 0, streak = 0, lastHit = null, nearCheck = 0, time = 0;
  const chains = new Map();

  function add(spot, { tier = pickTier(rand), kind = 'scatter', chain = null } = {}) {
    if (rings.filter((r) => r.tier === tier).length >= PER_TIER) return null;
    const y = Math.min(maxY, Math.max(spot.y, groundAt(spot.x, spot.z) + 1.8));
    const r = { tier, x: spot.x, y, z: spot.z, yaw: spot.yaw ?? rand() * Math.PI * 2, kind, chain,
      alive: true, respawnAt: 0, phase: rand() * 6.28, spin: (rand() < 0.5 ? -1 : 1) * (0.25 + rand() * 0.3) };
    r.n = { x: Math.sin(r.yaw), y: 0, z: Math.cos(r.yaw) };
    rings.push(r); return r;
  }
  function addChain(start, yaw, n = 5) {
    const id = ++chainSeq, tier = rand() < 0.65 ? RING_TIERS[1] : RING_TIERS[2];
    const spots = chainSpots(start, yaw, n, { groundAt, gap: 6 + rand() * 2, curve: (rand() - 0.5) * 0.3, climb: (rand() - 0.4) * 0.6 });
    const list = spots.map((s) => add(s, { tier, kind: 'chain', chain: id })).filter(Boolean);
    chains.set(id, { n: list.length, hit: 0, born: time });
  }
  function scatter(count) { for (let i = 0; i < count; i++) { const s = randomSpot(rand); if (s) add(s); } }

  function spawnNear(pos, yaw) {
    const ahead = 50 + rand() * 70, side = (rand() - 0.5) * 50;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const x = pos.x + fx * ahead - fz * side, z = pos.z + fz * ahead + fx * side;
    const g = groundAt(x, z);
    const y = Math.min(maxY - 4, Math.max(pos.y - 2 + rand() * 5, g + 2.5));
    if (rand() < 0.25) addChain({ x, y, z }, yaw + (rand() - 0.5) * 0.8, 4 + Math.floor(rand() * 3));
    else add({ x, y, z, yaw: yaw + (rand() - 0.5) * 1.2 }, { kind: 'near' });
  }

  return {
    get rings() { return rings; },
    get streak() { return streak; },
    populate() { scatter(SCATTER); },
    /** Rings along player -> pickup -> dropoff. points: [{x,z}, ...] */
    seedRoute(points) {
      rings = rings.filter((r) => r.kind !== 'route');
      const legs = [];
      for (let i = 1; i < points.length; i++) legs.push([points[i - 1], points[i], Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z)]);
      const total = legs.reduce((s, l) => s + l[2], 0) || 1;
      for (const [a, b, len] of legs) {
        const n = Math.max(1, Math.round(ROUTE_MAX * len / total));
        const spacing = Math.max(30, len / (n + 1));
        for (const s of ringsAlong(a, b, { spacing, margin: Math.min(14, len / 4), groundAt, rand, maxY })) add(s, { kind: 'route' });
      }
    },
    /** Call every frame. Returns hits: [{ tier, value, combo, chainBonus, x, y, z }] */
    update(dt, t, prev, pos, yaw, { collect = true } = {}) {
      time += dt; const hits = [];
      // respawn
      for (const r of rings) if (!r.alive && r.kind === 'scatter' && time >= r.respawnAt) {
        const near = rand() < 0.6, s = near ? null : randomSpot(rand);
        if (near) { const a = rand() * Math.PI * 2, d = 40 + rand() * 90; const x = pos.x + Math.cos(a) * d, z = pos.z + Math.sin(a) * d; r.x = x; r.z = z; r.y = Math.min(maxY, groundAt(x, z) + 2.5 + rand() * 5); }
        else if (s) { r.x = s.x; r.y = s.y; r.z = s.z; }
        r.tier = pickTier(rand); r.yaw = rand() * Math.PI * 2; r.n = { x: Math.sin(r.yaw), y: 0, z: Math.cos(r.yaw) }; r.alive = true;
      }
      // keep some rings around the ship
      if ((nearCheck -= dt) <= 0) {
        nearCheck = 2.5;
        const close = rings.filter((r) => r.alive && Math.hypot(r.x - pos.x, r.z - pos.z) < NEAR_R).length;
        if (close < NEAR_MIN) spawnNear(pos, yaw);
        // drop stale chain and near rings far behind to keep the pool small
        rings = rings.filter((r) => {
          if (!r.alive) return r.kind === 'scatter';
          const far = Math.hypot(r.x - pos.x, r.z - pos.z) > 400;
          if (r.kind === 'near') return !far;
          if (r.kind === 'chain') return !(far && time - (chains.get(r.chain)?.born || 0) > 60);
          return true;
        });
      }
      // collect
      if (collect) for (const r of rings) {
        if (!r.alive) continue;
        const dxz = Math.abs(r.x - pos.x) + Math.abs(r.z - pos.z);
        if (dxz > 120) continue;
        const bob = Math.sin(t * 1.3 + r.phase) * 0.15;
        if (crossRing({ c: { x: r.x, y: r.y + bob, z: r.z }, n: r.n, r: r.tier.radius }, prev, pos) < 0) continue;
        r.alive = false; r.respawnAt = time + RESPAWN[0] + rand() * (RESPAWN[1] - RESPAWN[0]);
        streak = nextStreak(streak, lastHit, time); lastHit = time;
        let bonus = 0;
        if (r.chain) { const c = chains.get(r.chain); if (c) { c.hit++; if (c.hit >= c.n) { bonus = chainBonus(c.n); chains.delete(r.chain); } } }
        hits.push({ tier: r.tier, value: ringReward(r.tier, streak), combo: streak, chainBonus: bonus, x: r.x, y: r.y + bob, z: r.z });
        burst(r);
      }
      draw(t, dt);
      return hits;
    },
    clearRoute() { rings = rings.filter((r) => r.kind !== 'route'); },
  };

  function burst(r) {
    const f = flashes.find((x) => x.t >= 1) || flashes[0];
    f.t = 0; f.s = r.tier.radius; f.m.visible = true;
    f.m.material.color.set(r.tier.prismatic ? 0xffffff : r.tier.color);
    f.m.position.set(r.x, r.y, r.z); f.m.rotation.set(0, r.yaw, 0);
    for (let i = 0; i < SPARKS; i++) {
      sp[i * 3] = r.x; sp[i * 3 + 1] = r.y; sp[i * 3 + 2] = r.z;
      const a = (i / SPARKS) * Math.PI * 2, k = 4 + rand() * 6;
      // fan out in the ring plane
      sv[i * 3] = Math.cos(a) * Math.cos(r.yaw) * k; sv[i * 3 + 1] = Math.sin(a) * k; sv[i * 3 + 2] = -Math.cos(a) * Math.sin(r.yaw) * k;
    }
    sparkMat.color.set(r.tier.prismatic ? 0xffb3ff : r.tier.color); sparkT = 0;
  }

  function draw(t, dt) {
    for (const T of tiers) {
      let i = 0;
      for (const r of rings) {
        if (!r.alive || r.tier !== T.tier || i >= PER_TIER) continue;
        _e.set(0, r.yaw, t * r.spin + r.phase); _q.setFromEuler(_e);
        _p.set(r.x, r.y + Math.sin(t * 1.3 + r.phase) * 0.15, r.z);
        _s.setScalar(T.tier.radius);
        _m.compose(_p, _q, _s);
        T.core.setMatrixAt(i, _m); T.glow.setMatrixAt(i, _m); T.veil.setMatrixAt(i, _m);
        if (T.tier.prismatic) T.core.setColorAt(i, _c.setHSL((t * 0.25 + r.phase * 0.1) % 1, 0.9, 0.62));
        i++;
      }
      for (const m of [T.core, T.glow, T.veil]) { m.count = i; m.instanceMatrix.needsUpdate = true; }
      if (T.tier.prismatic && T.core.instanceColor) T.core.instanceColor.needsUpdate = true;
      T.glow.material.opacity = 0.17 + 0.07 * Math.sin(t * 3);
    }
    for (const f of flashes) {
      if (f.t >= 1) continue;
      f.t = Math.min(1, f.t + dt / 0.32);
      f.m.scale.setScalar(f.s * (1 + f.t * 0.3)); f.m.material.opacity = (1 - f.t) * (1 - f.t) * 0.55;
      if (f.t >= 1) f.m.visible = false;
    }
    if (sparkT < 1) {
      sparkT = Math.min(1, sparkT + dt / 0.7);
      for (let i = 0; i < SPARKS * 3; i++) sp[i] += sv[i] * dt;
      sparkGeo.attributes.position.needsUpdate = true; sparkMat.opacity = 1 - sparkT;
    }
  }
}

function dotTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'), r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.7)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
