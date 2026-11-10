// Sky dome, ocean and clouds. The look that makes the island read from the air:
// a hazy horizon instead of a hard line, turquoise shallows that fall off to deep blue using the
// real bathymetry, surf along the shore, and trade-wind clouds you can fly through.
import * as THREE from 'three';
import { placeClouds, cloudDensityAt } from './clouds.js';

export const HORIZON = new THREE.Color(0xb9dcf2);
const ZENITH = new THREE.Color(0x1f6fc4);

const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createSky(scene, sunDir) {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { zenith: { value: ZENITH }, horizon: { value: HORIZON }, sunDir: { value: sunDir.clone().normalize() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunDir; varying vec3 vP;
      void main(){ vec3 d = normalize(vP); float h = max(d.y, 0.0);
        vec3 c = mix(horizon, zenith, pow(smoothstep(0.0, 0.75, h), 0.65));
        float s = max(dot(d, sunDir), 0.0);
        c += vec3(1.0, 0.93, 0.78) * (pow(s, 600.0) * 2.5 + pow(s, 12.0) * 0.18);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3500, 32, 16), m);
  sky.renderOrder = -1; scene.add(sky);
  scene.background = HORIZON.clone();
  if (scene.fog) scene.fog.color.copy(HORIZON);
  return sky;
}

/**
 * Ocean surface colored by real depth. H: Int16 elevations in meters (negative = sea), N x N over
 * a SIZE x SIZE world square centered on 0. Opaque, so the old sea floor mesh is hidden under it.
 */
export function createOcean(scene, { H, N, SIZE, sunDir }) {
  const data = new Uint8Array(N * N);
  for (let k = 0; k < N * N; k++) data[k] = Math.round(255 * Math.min(1, Math.sqrt(Math.max(0, -H[k]) / 1500)));
  const depth = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  depth.magFilter = depth.minFilter = THREE.LinearFilter; depth.wrapS = depth.wrapT = THREE.ClampToEdgeWrapping;
  depth.needsUpdate = true;
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uDepth: { value: null }, uSize: { value: SIZE }, uTime: { value: 0 },
    uSun: { value: sunDir.clone().normalize() }, uHorizon: { value: HORIZON.clone() },
  }]);
  uniforms.uDepth.value = depth;
  const mat = new THREE.ShaderMaterial({
    uniforms, fog: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2,
    vertexShader: `#include <fog_pars_vertex>
      varying vec3 vW;
      void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz;
        vec4 mvPosition = viewMatrix*w; gl_Position = projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `#include <fog_pars_fragment>
      uniform sampler2D uDepth; uniform float uSize, uTime; uniform vec3 uSun, uHorizon; varying vec3 vW;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
      float waves(vec2 p){ return vn(p*1.7 + vec2(uTime*0.35, uTime*0.2)) * 0.6 + vn(p*4.3 - vec2(uTime*0.5, -uTime*0.3)) * 0.4; }
      void main(){
        vec2 uv = vW.xz / uSize + 0.5;
        float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
        float d = mix(1.0, texture2D(uDepth, clamp(uv, 0.0, 1.0)).r, inside);
        float dm = d * d * 1500.0; // depth in meters
        vec3 c = mix(vec3(0.24, 0.74, 0.74), vec3(0.07, 0.50, 0.74), smoothstep(1.5, 14.0, dm));
        c = mix(c, vec3(0.04, 0.32, 0.62), smoothstep(10.0, 70.0, dm));
        c = mix(c, vec3(0.02, 0.17, 0.42), smoothstep(60.0, 700.0, dm));
        // surf: bands that roll toward the shore, strongest in the shallowest water
        float n = vn(vW.xz * 0.9);
        float band = 0.5 + 0.5 * sin(dm * 1.6 - uTime * 1.4 + n * 5.0);
        float foam = smoothstep(9.0, 1.0, dm) * smoothstep(0.55, 0.95, band) * 0.75 + smoothstep(2.2, 0.4, dm) * 0.55;
        c = mix(c, vec3(0.95, 0.98, 1.0), clamp(foam, 0.0, 1.0));
        // ripples, sky reflection and sun glints
        float e = 0.15, w0 = waves(vW.xz), wx = waves(vW.xz + vec2(e, 0.0)), wz = waves(vW.xz + vec2(0.0, e));
        vec3 nrm = normalize(vec3((w0 - wx) * 0.9, 1.0, (w0 - wz) * 0.9));
        vec3 V = normalize(cameraPosition - vW);
        float fr = pow(1.0 - max(dot(nrm, V), 0.0), 4.0);
        c = mix(c, uHorizon, fr * 0.4);
        float sp = pow(max(dot(reflect(-uSun, nrm), V), 0.0), 140.0);
        c += vec3(1.0, 0.95, 0.85) * sp * 0.9;
        gl_FragColor = vec4(c, 1.0);
        #include <fog_fragment>
      }`,
  });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), mat);
  ocean.rotation.x = -Math.PI / 2; ocean.position.y = 0.0; scene.add(ocean);
  return { mesh: ocean, update(t) { if (!reduceMotion) uniforms.uTime.value = t; } };
}

function puffTexture() {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S; const ctx = cv.getContext('2d');
  // 2 x 2 atlas of soft lumpy puffs
  let seed = 7; const r = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * 128, oy = Math.floor(v / 2) * 128;
    for (let k = 0; k < 14; k++) {
      const a = r() * Math.PI * 2, d = r() * 26, rad = 22 + r() * 22;
      const x = ox + 64 + Math.cos(a) * d, y = oy + 66 + Math.sin(a) * d * 0.7 - k * 0.6;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.6, 'rgba(255,255,255,0.25)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/**
 * Trade-wind clouds as camera-facing puffs in one instanced draw. update() drifts them with the
 * wind and returns how deep the camera is inside a cloud (0..1) for the white-out overlay.
 */
export function createClouds(scene, { bounds, sample, unitM, isTouch, seed = 1 }) {
  let s = seed; const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const puffs = placeClouds({ rand, bounds, sample, unitM, clusters: isTouch ? 150 : 230 });
  const n = puffs.length;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const off = new Float32Array(n * 3), size = new Float32Array(n), shade = new Float32Array(n), vari = new Float32Array(n);
  puffs.forEach((p, i) => { off[i * 3] = p.x; off[i * 3 + 1] = p.y; off[i * 3 + 2] = p.z; size[i] = p.s; shade[i] = p.shade; vari[i] = Math.floor(rand() * 4); });
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3));
  geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 1));
  geo.setAttribute('aShade', new THREE.InstancedBufferAttribute(shade, 1));
  geo.setAttribute('aVar', new THREE.InstancedBufferAttribute(vari, 1));
  geo.instanceCount = n;
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTex: { value: null }, uDrift: { value: new THREE.Vector3() } }]);
  uniforms.uTex.value = puffTexture();
  const mat = new THREE.ShaderMaterial({
    uniforms, fog: true, transparent: true, depthWrite: false,
    vertexShader: `#include <fog_pars_vertex>
      attribute vec3 aOff; attribute float aSize, aShade, aVar; uniform vec3 uDrift;
      varying vec2 vUv; varying float vShade, vFade;
      void main(){
        vec4 mvPosition = modelViewMatrix * vec4(aOff + uDrift, 1.0);
        mvPosition.xy += position.xy * aSize * vec2(1.25, 0.8);
        float dist = -mvPosition.z;
        vFade = smoothstep(aSize * 0.35, aSize * 2.0, dist); // fade puffs you fly into instead of a hard pop
        vUv = (position.xy + 0.5) * 0.5 + vec2(mod(aVar, 2.0), floor(aVar / 2.0)) * 0.5;
        vShade = clamp(aShade * 0.7 + (position.y + 0.5) * 0.45, 0.0, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `#include <fog_pars_fragment>
      uniform sampler2D uTex; varying vec2 vUv; varying float vShade, vFade;
      void main(){
        float a = texture2D(uTex, vUv).r * vFade;
        if (a < 0.01) discard;
        vec3 c = mix(vec3(0.62, 0.68, 0.78), vec3(1.0, 0.99, 0.96), vShade);
        gl_FragColor = vec4(c, min(1.0, a * 1.15));
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 2; scene.add(mesh);
  const drift = uniforms.uDrift.value; // trade wind from the east-northeast: clouds move west-southwest
  const p = new THREE.Vector3();
  return {
    mesh, puffs,
    update(dt, camPos) {
      if (!reduceMotion) { drift.x -= dt * 0.35; drift.z += dt * 0.08; }
      p.copy(camPos).sub(drift);
      return cloudDensityAt(puffs, p.x, p.y, p.z);
    },
  };
}
