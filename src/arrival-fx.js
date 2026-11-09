// Procedural arrival effects: tractor beam, package, hex rings, sparkle burst.
// Everything is built from primitives, positioned relative to the disc and the
// ground under it, so it works at any destination.
import * as THREE from 'three';

export const PILOT_GLOW = { drone: 0x5fd4ff, ipo: 0xff7ac0, mj: 0x7fe8ff };
const GOLD = new THREE.Color(0xffd36b);
const N_SPARK = 110;

function sparkTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  x.fillStyle = 'rgba(255,255,255,.9)'; // four point star glint
  x.beginPath(); x.moveTo(32, 0); x.lineTo(35, 29); x.lineTo(64, 32); x.lineTo(35, 35); x.lineTo(32, 64); x.lineTo(29, 35); x.lineTo(0, 32); x.lineTo(29, 29); x.closePath(); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createArrivalFx(scene) {
  const root = new THREE.Group(); root.visible = false; root.renderOrder = 6; scene.add(root);
  const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false };

  // beam: open cone, narrow at the disc, wide on the ground; unit height, scaled per frame
  const beamGeo = new THREE.CylinderGeometry(0.32, 1.0, 1, 6, 1, true); beamGeo.translate(0, -0.5, 0);
  // normal blending so the beam keeps the pilot color over bright ground instead of blowing out to white
  const beamMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false, color: 0xffffff, opacity: 0, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(beamGeo, beamMat); root.add(beam);
  const coreMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false, color: 0xffffff, opacity: 0, side: THREE.DoubleSide });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.22, 1, 6, 1, true).translate(0, -0.5, 0), coreMat); root.add(core);

  // hexagon rings sliding along the beam
  const rings = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 6, 1), new THREE.MeshBasicMaterial({ ...add, color: 0xffffff, opacity: 0, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; root.add(m); rings.push(m);
  }

  // package: cardboard cube with glowing pilot colored edges
  const pkg = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), new THREE.MeshStandardMaterial({ color: 0xc89a5a, roughness: 0.8, emissive: 0x2a1a08, emissiveIntensity: 0.6 }));
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, fog: false });
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), edgeMat); edges.scale.setScalar(1.02);
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.44), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
  pkg.add(box, edges, strap); root.add(pkg);

  // ground shockwave: flat hex ring
  const waveMat = new THREE.MeshBasicMaterial({ ...add, color: 0xffffff, opacity: 0, side: THREE.DoubleSide });
  const wave = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 6, 1), waveMat); wave.rotation.x = -Math.PI / 2; root.add(wave);
  const wave2 = new THREE.Mesh(wave.geometry, waveMat.clone()); wave2.rotation.x = -Math.PI / 2; wave2.rotation.z = Math.PI / 6; root.add(wave2);

  // sparkle burst
  const seeds = new Float32Array(N_SPARK * 4);
  const pos = new Float32Array(N_SPARK * 3), col = new Float32Array(N_SPARK * 3);
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pMat = new THREE.PointsMaterial({ ...add, size: 0.7, map: sparkTexture(), vertexColors: true, opacity: 0, sizeAttenuation: true });
  const sparks = new THREE.Points(pg, pMat); sparks.frustumCulled = false; root.add(sparks);

  const tint = new THREE.Color(), base = new THREE.Vector3(), ground = new THREE.Vector3();
  let kind = 'delivery', burstAt = null;

  function reseed(color) {
    for (let i = 0; i < N_SPARK; i++) {
      const a = Math.random() * Math.PI * 2, up = 0.35 + Math.random() * 0.9;
      seeds[i * 4] = Math.cos(a); seeds[i * 4 + 1] = up; seeds[i * 4 + 2] = Math.sin(a); seeds[i * 4 + 3] = 1.2 + Math.random() * 2.6;
      const c = Math.random() < 0.3 ? GOLD : color;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    pg.attributes.color.needsUpdate = true;
  }

  return {
    get active() { return root.visible; },
    start(k, pilotId) {
      kind = k; burstAt = null;
      tint.setHex(PILOT_GLOW[pilotId] ?? PILOT_GLOW.drone);
      for (const m of [beamMat, coreMat, waveMat, wave2.material, ...rings.map((r) => r.material)]) m.color.copy(tint);
      coreMat.color.lerp(new THREE.Color(0xffffff), 0.15);
      edgeMat.color.copy(tint); strap.material.color.copy(tint).lerp(new THREE.Color(0xffffff), 0.3);
      reseed(tint);
      pkg.visible = true; root.visible = true;
    },
    /** b: beats from cutsceneBeats, ship: disc world position, gy: ground height under the disc */
    update(b, ship, gy, time) {
      if (!root.visible) return;
      base.copy(ship); base.y -= 0.22; // disc belly
      ground.set(ship.x, gy, ship.z);
      const len = Math.max(0.6, base.y - gy);
      beam.position.copy(base); beam.scale.set(1, len, 1); beam.rotation.y = time * 0.6;
      core.position.copy(base); core.scale.set(1, len, 1);
      beamMat.opacity = 0.26 * b.beam; coreMat.opacity = 0.32 * b.beam;
      const dir = kind === 'delivery' ? 1 : -1; // rings travel with the package
      rings.forEach((r, i) => {
        let f = ((time * 0.55 + i / rings.length) % 1);
        if (dir < 0) f = 1 - f;
        r.position.set(ship.x, base.y - f * len, ship.z);
        const s = 0.35 + 0.65 * f; r.scale.setScalar(s);
        r.material.opacity = 0.55 * b.beam * Math.sin(Math.PI * f);
      });
      // package: delivery lowers from disc to ground, pickup lifts ground to disc
      const p = kind === 'delivery' ? b.cargo : 1 - b.cargo;
      const py = base.y - 0.25 - p * (len - 0.45);
      pkg.position.set(ship.x, py, ship.z);
      pkg.rotation.y = time * 1.4; pkg.rotation.z = Math.sin(time * 2.1) * 0.15;
      // picked-up crates vanish into the disc, delivered ones fade into the burst
      const inDisc = kind === 'pickup' && b.cargo > 0.97;
      pkg.visible = !inDisc && !(kind === 'delivery' && b.burst > 0.45);
      const sc = kind === 'delivery' && b.burst > 0 ? Math.max(0.01, 1 - b.burst * 2.2) : 1;
      pkg.scale.setScalar(sc);

      // burst at the ground for deliveries, at the disc belly for pickups
      if (b.burst > 0 && !burstAt) burstAt = (kind === 'delivery' ? ground : base).clone();
      if (burstAt) {
        const q = b.burst;
        const fade = 1 - q;
        wave.position.copy(burstAt); wave.position.y += 0.06;
        wave.scale.setScalar(0.3 + 2.4 * (1 - Math.pow(1 - q, 3)));
        waveMat.opacity = 0.7 * fade;
        wave2.position.copy(wave.position); wave2.scale.setScalar(0.2 + 1.6 * (1 - Math.pow(1 - q, 2)));
        wave2.material.opacity = 0.6 * fade;
        const g = kind === 'delivery' ? 3.2 : 1.2, tt = q * 1.1;
        for (let i = 0; i < N_SPARK; i++) {
          const sp = seeds[i * 4 + 3] * (kind === 'delivery' ? 1 : 0.7);
          pos[i * 3] = burstAt.x + seeds[i * 4] * sp * tt;
          pos[i * 3 + 1] = Math.max(burstAt.y, burstAt.y + seeds[i * 4 + 1] * sp * tt * 1.4 - g * tt * tt);
          pos[i * 3 + 2] = burstAt.z + seeds[i * 4 + 2] * sp * tt;
        }
        pg.attributes.position.needsUpdate = true;
        pMat.opacity = Math.min(1, q * 8) * fade;
        pMat.size = 0.7 * (1 - 0.45 * q);
      } else {
        waveMat.opacity = wave2.material.opacity = pMat.opacity = 0;
      }
    },
    stop() { root.visible = false; burstAt = null; },
    // exposed for screenshots and tests in the browser
    _parts: { beam, pkg, sparks, wave },
  };
}
