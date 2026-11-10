// Shower cells you can see coming (a dark cloud and a gray rain curtain), rain on the
// windshield when you fly through one, and a rainbow when the sun is behind you.
import * as THREE from 'three';
import { showerCells, wetness, rainbowFor, RAINBOW_DEG } from './rain.js';
import { WORLD_TINT } from './world-light.js';

const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function darkPuff() {
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S; const ctx = cv.getContext('2d');
  for (let k = 0; k < 10; k++) {
    const x = 30 + Math.random() * 68, y = 50 + Math.random() * 30, r = 22 + Math.random() * 20;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; return t;
}

/** ctx: { scene, toWorld(lat, lon) -> Vector2, isTouch } */
export function createRain({ scene, toWorld, isTouch }) {
  const a = toWorld(20.18, -154.75), b = toWorld(19.28, -155.38);
  const box = { x0: b.x, x1: a.x, z0: a.y, z1: b.y };
  const n = isTouch ? 4 : 6;
  const shaftU = { uTime: { value: 0 }, uTint: WORLD_TINT };
  const shaftMat = new THREE.ShaderMaterial({
    uniforms: shaftU, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    vertexShader: `#include <fog_pars_vertex>
      varying vec2 vUv;
      void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `#include <fog_pars_fragment>
      uniform float uTime; uniform vec3 uTint; uniform float uK; varying vec2 vUv;
      void main(){ float streak = 0.55 + 0.45 * sin(vUv.x * 260.0 + sin(vUv.x * 31.0) * 3.0) * sin((vUv.y * 9.0 + uTime * 3.5) + vUv.x * 40.0);
        float a = streak * smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.75, vUv.y) * 0.45 * uK;
        gl_FragColor = vec4(vec3(0.55, 0.6, 0.68) * uTint, a);
        #include <fog_fragment>
      }`,
  });
  shaftMat.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uK: { value: 1 } }]);
  Object.assign(shaftMat.uniforms, shaftU);
  const puffTex = darkPuff();
  const cells = [];
  for (let i = 0; i < n; i++) {
    const m = shaftMat.clone(); m.uniforms.uTime = shaftU.uTime; m.uniforms.uTint = WORLD_TINT;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.15, 1, 24, 1, true).translate(0, 0.5, 0), m);
    shaft.renderOrder = 2; scene.add(shaft);
    const puffs = [];
    for (let k = 0; k < 5; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0x8a929e, transparent: true, depthWrite: false }));
      scene.add(sp); puffs.push({ sp, dx: (Math.random() - 0.5) * 1.2, dz: (Math.random() - 0.5) * 1.2, s: 0.9 + Math.random() * 0.6 });
    }
    cells.push({ shaft, puffs });
  }
  // rainbow: a camera-facing ring around the antisolar point, red outside, violet inside
  const bowMat = new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `uniform float uK; varying vec2 vP;
      vec3 spectrum(float t){ return clamp(vec3(abs(t * 6.0 - 3.0) - 1.0, 2.0 - abs(t * 6.0 - 2.0), 2.0 - abs(t * 6.0 - 4.0)), 0.0, 1.0); }
      void main(){ float r = length(vP);
        float t1 = (r - 0.955) / 0.045; // primary bow: violet at 0.955, red at 1.0 (unit = 42 degrees)
        float t2 = (1.215 - r) / 0.055; // secondary bow, colors reversed, fainter
        float a1 = smoothstep(0.0, 0.15, t1) * smoothstep(1.0, 0.85, t1), a2 = smoothstep(0.0, 0.2, t2) * smoothstep(1.0, 0.8, t2) * 0.35;
        vec3 c = spectrum(clamp(1.0 - t1, 0.0, 1.0)) * a1 + spectrum(clamp(1.0 - t2, 0.0, 1.0)) * a2;
        float a = max(a1, a2) * uK * 0.45;
        if (a < 0.005) discard; gl_FragColor = vec4(c / max(0.001, max(a1, a2)), a); }`,
  });
  const bow = new THREE.Mesh(new THREE.RingGeometry(0.94, 1.28, 96, 1), bowMat); bow.visible = false; bow.renderOrder = 4; scene.add(bow);
  const anti = new THREE.Vector3(), sunV = new THREE.Vector3();
  let wetNow = 0, lastList = [];

  return {
    get wet() { return wetNow; },
    get cells() { return lastList; },
    get rainbow() { return bow.visible ? bowMat.uniforms.uK.value : 0; },
    update(t, camera, pos, sunPos, isDay) {
      const tt = reduceMotion ? 0 : t;
      shaftU.uTime.value = tt;
      const list = showerCells(t, box, n); lastList = list;
      list.forEach((c, i) => {
        const cell = cells[i], h = 9 + c.r * 0.05, vis = c.k > 0.05;
        cell.shaft.visible = vis; cell.shaft.position.set(c.x, 0, c.z); cell.shaft.scale.set(c.r * 0.7, h, c.r * 0.7);
        cell.shaft.material.uniforms.uK.value = c.k;
        for (const p of cell.puffs) {
          p.sp.visible = vis; p.sp.position.set(c.x + p.dx * c.r * 0.6, h + 1 + p.dx, c.z + p.dz * c.r * 0.6);
          p.sp.scale.set(c.r * 1.3 * p.s, c.r * 0.6 * p.s, 1);
          p.sp.material.opacity = 0.75 * c.k; p.sp.material.color.setRGB(0.55, 0.58, 0.64).multiply(WORLD_TINT.value);
        }
      });
      wetNow = wetness(list, pos.x, pos.z) * (pos.y < 12 ? 1 : Math.max(0, 1 - (pos.y - 12) / 6));
      sunV.copy(sunPos).normalize();
      const rb = isDay ? rainbowFor(camera.position, sunV, list) : { k: 0 };
      bow.visible = rb.k > 0.01;
      if (bow.visible) {
        const d = Math.hypot(rb.cell.x - camera.position.x, rb.cell.z - camera.position.z);
        anti.copy(sunV).multiplyScalar(-d).add(camera.position);
        bow.position.copy(anti); bow.lookAt(camera.position);
        bow.scale.setScalar(d * Math.tan(RAINBOW_DEG * Math.PI / 180));
        bowMat.uniforms.uK.value = rb.k;
      }
      return wetNow;
    },
  };
}
