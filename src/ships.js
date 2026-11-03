// Three pilots, three procedural ships. Every ship faces -Z, sits about 6 hull units across
// and returns the same parts the game animates (lights, beam, glow).
import * as THREE from 'three';

export const PILOTS = [
  { id: 'drone', name: 'Mystery Drone', ship: 'Cyan Ring Drone', blurb: 'Smooth, quiet and the sharpest turner in the sky',
    badge: '/pilots/drone-badge.webp', portrait: '/pilots/drone.jpg', stats: { turn: 1.18, boost: 0.94, cruise: 1, climb: 1 },
    feel: ['Turning best', 'Boost good', 'Climb good'] },
  { id: 'ipo', name: 'Ipo', ship: 'Fruity Puppy Cruiser', blurb: 'Fruity Puppy pilot with an easygoing, all round ship',
    badge: '/pilots/ipo-badge.webp', portrait: '/pilots/ipo.jpg', stats: { turn: 1.05, boost: 1.02, cruise: 1.04, climb: 1.1 },
    feel: ['Turning good', 'Boost good', 'Climb best'] },
  { id: 'mj', name: 'Monkey Jockey', ship: 'MJ Racer', blurb: 'Pure racer. Fastest boost, wider turns',
    badge: '/pilots/mj-badge.webp', portrait: '/pilots/mj.jpg', stats: { turn: 0.9, boost: 1.14, cruise: 1, climb: 0.95 },
    feel: ['Turning wide', 'Boost fastest', 'Climb good'] },
];
export const pilotById = (id) => PILOTS.find((p) => p.id === id) || PILOTS[0];

const texLoader = new THREE.TextureLoader();
const badgeTex = new Map();
function badge(p) {
  if (!badgeTex.has(p.id)) { const t = texLoader.load(p.badge); t.colorSpace = THREE.SRGBColorSpace; badgeTex.set(p.id, t); }
  return badgeTex.get(p.id);
}
function glowTexture(rgb) {
  const gc = document.createElement('canvas'); gc.width = gc.height = 128;
  const gx = gc.getContext('2d'); const grd = gx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, `rgba(${rgb},0.9)`); grd.addColorStop(0.35, `rgba(${rgb},0.35)`); grd.addColorStop(1, `rgba(${rgb},0)`);
  gx.fillStyle = grd; gx.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(gc);
}
function decal(text, bg, fg, w = 256, h = 96) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.fillStyle = fg; x.font = `italic 900 ${Math.round(h * 0.78)}px system-ui, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function heartShape(s) {
  const h = new THREE.Shape(); h.moveTo(0, -s * 0.9);
  h.bezierCurveTo(s * 0.2, -s * 0.55, s * 1.05, -s * 0.2, s * 1.0, s * 0.35);
  h.bezierCurveTo(s * 0.95, s * 0.95, s * 0.2, s * 1.0, 0, s * 0.45);
  h.bezierCurveTo(-s * 0.2, s * 1.0, -s * 0.95, s * 0.95, -s * 1.0, s * 0.35);
  h.bezierCurveTo(-s * 1.05, -s * 0.2, -s * 0.2, -s * 0.55, 0, -s * 0.9);
  return h;
}
// the pilot: a portrait badge that always faces the camera, inside the cockpit
function pilotSprite(p, size, y, z = 0) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: badge(p), transparent: true, fog: false, toneMapped: false }));
  s.scale.set(size, size, 1); s.position.set(0, y, z); s.renderOrder = 1; return s;
}
function glass(color, opacity = 0.32) {
  return new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.05, transparent: true, opacity, depthWrite: false, clearcoat: 1 });
}
function common(g, { rgb, lightColor, glowScale = [11, 7], beamColor }) {
  const glowTex = glowTexture(rgb);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.set(glowScale[0], glowScale[1], 1); glow.position.y = -0.3; glow.userData.glow = true; g.add(glow);
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
  const blue = new THREE.MeshPhysicalMaterial({ color: 0x1238b8, metalness: 0.35, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
  const deep = new THREE.MeshStandardMaterial({ color: 0x10265e, metalness: 0.6, roughness: 0.35 });
  const cyan = new THREE.MeshBasicMaterial({ color: 0x48e6ff });
  const hull = new THREE.Mesh(new THREE.SphereGeometry(3.0, 48, 16), blue); hull.scale.set(1, 0.17, 1); g.add(hull);
  const top = new THREE.Mesh(new THREE.SphereGeometry(2.1, 40, 12), blue); top.scale.set(1, 0.28, 1); top.position.y = 0.2; g.add(top);
  const under = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.0, 0.35, 32), deep); under.position.y = -0.4; g.add(under);
  for (const [R, tube, y] of [[3.02, 0.11, 0], [2.15, 0.08, 0.36], [1.45, 0.1, -0.58]]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(R, tube, 10, 64), cyan); r.rotation.x = Math.PI / 2; r.position.y = y; g.add(r);
  }
  // four pods with glowing ring faces, like the wheels on his car
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2, x = Math.cos(a) * 2.45, z = Math.sin(a) * 2.45;
    const pod = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 12), blue); pod.scale.set(1, 0.7, 1); pod.position.set(x, -0.08, z); g.add(pod);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 8, 28), cyan); ring.position.set(x * 1.13, -0.08, z * 1.13); ring.lookAt(x * 3, -0.08, z * 3); g.add(ring);
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), new THREE.MeshBasicMaterial({ color: 0xbaf6ff })); core.position.copy(ring.position); core.quaternion.copy(ring.quaternion); g.add(core);
  }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.3, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), glass(0x8fe9ff, 0.28)); dome.position.y = 0.48; dome.renderOrder = 2; g.add(dome);
  g.add(pilotSprite(p, 2.1, 1.3));
  const lights = ringLights(g, 14, 2.65, -0.16, 0x48e6ff);
  const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.25, 24), new THREE.MeshBasicMaterial({ color: 0x7fe8ff })); belly.position.y = -0.62; g.add(belly);
  return { group: g, lights, hue: 0.53, ...common(g, { rgb: '90,230,255', lightColor: 0x30d8ff, beamColor: 0x5fe0ff }) };
}

function buildIpo(p) {
  const g = new THREE.Group();
  const pink = new THREE.MeshPhysicalMaterial({ color: 0xff3d8f, metalness: 0.15, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06 });
  const ear = new THREE.MeshPhysicalMaterial({ color: 0xf0468f, metalness: 0.15, roughness: 0.3, clearcoat: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(2.2, 48, 20), pink); body.scale.set(1.2, 0.42, 1.5); g.add(body);
  const skirt = new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.16, 10, 56), pink); skirt.rotation.x = Math.PI / 2; skirt.scale.set(1.08, 1.32, 1); skirt.position.y = -0.1; g.add(skirt);
  // heart emblem on the nose
  const heart = new THREE.Mesh(new THREE.ExtrudeGeometry(heartShape(0.62), { depth: 0.08, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 }),
    new THREE.MeshPhysicalMaterial({ color: 0xff1f6e, roughness: 0.2, clearcoat: 1, emissive: 0x5a0020, emissiveIntensity: 0.4 }));
  heart.rotation.x = -Math.PI / 2 - 0.32; heart.position.set(0, 0.74, -2.05); g.add(heart);
  const heartRim = new THREE.Mesh(new THREE.ShapeGeometry(heartShape(0.74)), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  heartRim.rotation.copy(heart.rotation); heartRim.position.set(0, 0.725, -2.05); g.add(heartRim);
  // floppy ear fins drooping off each side
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), ear); e.scale.set(0.28, 1.25, 0.72);
    e.position.set(s * 2.55, -0.35, 0.55); e.rotation.set(0.35, 0, s * 0.62); g.add(e);
  }
  // little tail fin with a heart
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 10), ear); tail.scale.set(0.25, 0.9, 0.8); tail.position.set(0, 0.6, 2.7); tail.rotation.x = -0.5; g.add(tail);
  const tub = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.0, 0.4, 28), dark); tub.position.set(0, 0.62, 0.15); g.add(tub);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.2, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), glass(0xffc4de, 0.3)); canopy.position.set(0, 0.78, 0.15); canopy.renderOrder = 2; g.add(canopy);
  g.add(pilotSprite(p, 2.0, 1.55, 0.15));
  const lights = ringLights(g, 12, 2.35, -0.3, 0xff7ab8);
  lights.forEach((l) => { l.position.z *= 1.35; l.position.x *= 1.1; });
  const thr = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.3, 20), new THREE.MeshBasicMaterial({ color: 0xffb3d6 })); thr.position.y = -0.85; g.add(thr);
  return { group: g, lights, hue: 0.93, ...common(g, { rgb: '255,140,200', lightColor: 0xff6fb4, beamColor: 0xff9fcf }) };
}

function buildMJ(p) {
  const g = new THREE.Group();
  const blue = new THREE.MeshPhysicalMaterial({ color: 0x1846d6, metalness: 0.35, roughness: 0.25, clearcoat: 1 });
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf4f7fb, metalness: 0.1, roughness: 0.25, clearcoat: 1 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.6 });
  const mjSide = decal('MJ', '#1846d6', '#ffffff'), mjWhite = decal('MJ', '#f4f7fb', '#1846d6');
  // main wedge hull: a tapered box (nose at -Z)
  const hullGeo = new THREE.BoxGeometry(2.6, 0.8, 5.6, 1, 1, 4); const pos = hullGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const z = pos.getZ(i), t = (z + 2.8) / 5.6; // 0 at nose, 1 at tail
    pos.setX(i, pos.getX(i) * (0.45 + 0.55 * Math.min(1, t * 1.6))); if (pos.getY(i) > 0) pos.setY(i, pos.getY(i) * (0.35 + 0.65 * t)); }
  hullGeo.computeVertexNormals();
  const hull = new THREE.Mesh(hullGeo, blue); g.add(hull);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 5.0), white); stripe.position.set(0, 0.36, 0.1); stripe.rotation.x = -0.06; g.add(stripe);
  const noseDecal = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.42), new THREE.MeshBasicMaterial({ map: mjWhite, toneMapped: false }));
  noseDecal.rotation.x = -Math.PI / 2 + 0.1; noseDecal.position.set(0, 0.25, -1.75); g.add(noseDecal);
  // side pods with MJ livery and rear thrusters
  for (const s of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.62, 3.6), blue); pod.position.set(s * 1.95, -0.12, 0.55); g.add(pod);
    const ps = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.14, 3.62), white); ps.position.set(s * 1.95, 0.05, 0.55); g.add(ps);
    const sd = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.5), new THREE.MeshBasicMaterial({ map: mjSide, toneMapped: false }));
    sd.position.set(s * 2.46, -0.15, 0.6); sd.rotation.y = s * Math.PI / 2; g.add(sd);
    const thr = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.5, 18), black); thr.rotation.x = Math.PI / 2; thr.position.set(s * 1.95, -0.12, 2.55); g.add(thr);
    const fl = new THREE.Mesh(new THREE.CircleGeometry(0.24, 18), new THREE.MeshBasicMaterial({ color: 0x8fd0ff })); fl.position.set(s * 1.95, -0.12, 2.81); g.add(fl);
    const front = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.3, 0.6), white); front.position.set(s * 1.95, -0.28, -1.45); g.add(front);
  }
  // rear spoiler with struts and MJ on the wing
  const wing = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.12, 0.85), blue); wing.position.set(0, 1.25, 2.45); wing.rotation.x = 0.12; g.add(wing);
  const wingTop = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.7), new THREE.MeshBasicMaterial({ map: mjSide, toneMapped: false }));
  wingTop.rotation.x = -Math.PI / 2 + 0.12; wingTop.position.set(0, 1.32, 2.45); g.add(wingTop);
  const wingBack = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), new THREE.MeshBasicMaterial({ map: mjWhite, toneMapped: false }));
  wingBack.position.set(0, 1.0, 2.9); g.add(wingBack);
  for (const s of [-1, 1]) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 1.0), white); plate.position.set(s * 2.2, 1.15, 2.45); g.add(plate);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.95, 0.3), black); strut.position.set(s * 0.8, 0.75, 2.4); g.add(strut);
  }
  // open cockpit with a small windscreen
  const tub = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 1.5), black); tub.position.set(0, 0.42, 0.35); g.add(tub);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.5), glass(0xbfe2ff, 0.4)); screen.position.set(0, 0.72, -0.55); screen.rotation.x = -0.6; screen.renderOrder = 2; g.add(screen);
  g.add(pilotSprite(p, 2.0, 1.4, 0.4));
  const lights = ringLights(g, 10, 2.55, -0.45, 0x3d8bff);
  lights.forEach((l) => { l.position.z = l.position.z * 1.2 + 0.3; });
  return { group: g, lights, hue: 0.6, ...common(g, { rgb: '90,160,255', lightColor: 0x3d8bff, beamColor: 0x7fb8ff }) };
}

export function buildShip(id, scale, env) {
  const p = pilotById(id);
  const ship = (p.id === 'ipo' ? buildIpo : p.id === 'mj' ? buildMJ : buildDrone)(p);
  if (env) ship.group.traverse((o) => { const m = o.material; if (m && m.isMeshStandardMaterial) { m.envMap = env; m.envMapIntensity = 0.45; } });
  ship.group.scale.setScalar(scale); ship.pilot = p;
  return ship;
}
export function disposeShip(ship) {
  ship.group.traverse((o) => { o.geometry?.dispose(); const m = o.material; if (m && m.map && ![...badgeTex.values()].includes(m.map)) m.map.dispose(); m?.dispose?.(); });
  ship.group.removeFromParent();
}
