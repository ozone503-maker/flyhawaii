// Three pilots, one shared disc skeleton with color skins. Every ship faces -Z, sits about 6 hull units across
// and returns the same parts the game animates (lights, beam, glow).
import * as THREE from 'three';
import { buildPilotHead } from './pilot-head.js';

export const PILOTS = [
  { id: 'drone', name: 'Mystery Drone', ship: 'Silver and Blue Disc', blurb: 'Classic silver disc with blue trim',
    badge: '/pilots/drone-badge.webp', portrait: '/pilots/drone.jpg', stats: { turn: 1.18, boost: 0.94, cruise: 1, climb: 1 },
    feel: ['Shared flight handling', 'Color skin only'] },
  { id: 'ipo', name: 'Ipo', ship: 'Pink Disc', blurb: 'The same classic disc in Fruity Puppy pink',
    badge: '/pilots/ipo-badge.webp', portrait: '/pilots/ipo.jpg', stats: { turn: 1.18, boost: 0.94, cruise: 1, climb: 1 },
    feel: ['Shared flight handling', 'Color skin only'] },
  { id: 'mj', name: 'Monkey Jockey', ship: 'Electric Blue Disc', blurb: 'The same classic disc in light electric blue',
    badge: '/pilots/mj-badge.webp', portrait: '/pilots/mj.jpg', stats: { turn: 1.18, boost: 0.94, cruise: 1, climb: 1 },
    feel: ['Shared flight handling', 'Color skin only'] },
];
export const pilotById = (id) => PILOTS.find((p) => p.id === id) || PILOTS[0];

function glowTexture(rgb) {
  const gc = document.createElement('canvas'); gc.width = gc.height = 128;
  const gx = gc.getContext('2d'); const grd = gx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, `rgba(${rgb},0.9)`); grd.addColorStop(0.35, `rgba(${rgb},0.35)`); grd.addColorStop(1, `rgba(${rgb},0)`);
  gx.fillStyle = grd; gx.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(gc);
}
function glass(color, opacity = 0.32) {
  return new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.05, transparent: true, opacity, depthWrite: false, clearcoat: 1 });
}
function common(g, { rgb, lightColor, glowScale = [11, 7], beamColor }) {
  const glowTex = glowTexture(rgb);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.set(glowScale[0] * 0.85, glowScale[1] * 0.85, 1); glow.position.y = -0.45; glow.userData.glow = true; g.add(glow);
  const pl = new THREE.PointLight(lightColor, 30, 40, 1.6); pl.position.y = -1.5; g.add(pl);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 3.5, 1, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: beamColor, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  g.add(beam);
  return { beam, glowTex };
}
function ringLights(g, n, r, y, color) {
  const lights = [], geo = new THREE.SphereGeometry(0.17, 8, 6);
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2; const l = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
    l.position.set(Math.cos(a) * r, y, Math.sin(a) * r); g.add(l); lights.push(l);
  }
  return lights;
}

function buildDrone(p) {
  const g = new THREE.Group();
  const palette = p.id === 'ipo' ? { hull: 0xff76b4, trim: 0xffb8dc, deep: 0x8f315f, hue: 0.93, rgb: '255,140,200' }
    : p.id === 'mj' ? { hull: 0x75cfff, trim: 0xb1e9ff, deep: 0x235f9c, hue: 0.56, rgb: '90,190,255' }
    : { hull: 0xb9c5d2, trim: 0x48aaff, deep: 0x1238b8, hue: 0.56, rgb: '90,180,255' };
  const blue = new THREE.MeshPhysicalMaterial({ color: palette.hull, metalness: 0.35, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
  const deep = new THREE.MeshStandardMaterial({ color: palette.deep, metalness: 0.6, roughness: 0.35 });
  const cyan = new THREE.MeshBasicMaterial({ color: palette.trim });
  const hull = new THREE.Mesh(new THREE.SphereGeometry(3.0, 48, 16), blue); hull.scale.set(1, 0.17, 1); g.add(hull);
  const top = new THREE.Mesh(new THREE.SphereGeometry(2.1, 40, 12), blue); top.scale.set(1, 0.28, 1); top.position.y = 0.2; g.add(top);
  const under = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.0, 0.35, 32), deep); under.position.y = -0.4; g.add(under);
  for (const [R, tube, y] of [[2.92, 0.09, 0.02], [2.15, 0.07, 0.36], [1.45, 0.09, -0.58]]) {
    const ringMat = cyan.clone();
    ringMat.polygonOffset = true; ringMat.polygonOffsetFactor = -1; ringMat.polygonOffsetUnits = -1;
    const r = new THREE.Mesh(new THREE.TorusGeometry(R, tube, 10, 64), ringMat); r.rotation.x = Math.PI / 2; r.position.y = y; g.add(r);
  }
  // four pods with glowing ring faces, like the wheels on his car
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2, x = Math.cos(a) * 2.45, z = Math.sin(a) * 2.45;
    const pod = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 12), blue); pod.scale.set(1, 0.7, 1); pod.position.set(x, -0.08, z); g.add(pod);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 8, 28), cyan); ring.position.set(x * 1.13, -0.08, z * 1.13); ring.lookAt(x * 3, -0.08, z * 3); g.add(ring);
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), new THREE.MeshBasicMaterial({ color: 0xbaf6ff })); core.position.copy(ring.position); core.quaternion.copy(ring.quaternion); g.add(core);
  }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.3, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), glass(0x8fe9ff, 0.28)); dome.position.y = 0.48; dome.renderOrder = 2; g.add(dome);
  const head = buildPilotHead(p.id); head.position.y = 1.05; g.add(head);
  const lights = ringLights(g, 14, 2.65, -0.16, palette.trim);
  const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.25, 24), new THREE.MeshBasicMaterial({ color: 0x7fe8ff })); belly.position.y = -0.62; g.add(belly);
  return { group: g, lights, hue: palette.hue, ...common(g, { rgb: palette.rgb, lightColor: palette.trim, beamColor: palette.trim }) };
}

export function buildShip(id, scale, env) {
  const p = pilotById(id);
  const ship = buildDrone(p);
  if (env) ship.group.traverse((o) => { const m = o.material; if (m && m.isMeshStandardMaterial) { m.envMap = env; m.envMapIntensity = 0.45; } });
  ship.group.scale.setScalar(scale); ship.pilot = p;
  return ship;
}
export function disposeShip(ship) {
  ship.group.traverse((o) => { o.geometry?.dispose(); const m = o.material; if (m && m.map) m.map.dispose(); m?.dispose?.(); });
  ship.group.removeFromParent();
}
