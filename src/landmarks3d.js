// 3D island details that make places recognizable from the air: Kīlauea's lava glow and vog
// plume, snow and observatories on Mauna Kea, waterfalls down the Hāmākua cliffs, and little
// buildings in every town. Everything here is a few instanced draws so phones keep up.
import * as THREE from 'three';
import { WORLD_TINT } from './world-light.js';
import { TOWN_AREAS, OBSERVATORIES, HALEMAUMAU, SNOW_LINE_M, placeBuildings, fallDrop, fallHeightM } from './landmarks.js';

const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const EX = 2.2; // props are drawn a bit larger than life so they read from a saucer's height

/** Adds snow above the snow line and close-up ground detail to a terrain material (chains any existing onBeforeCompile). */
export function addSnow(mat, snowY) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.uSnowY = { value: snowY };
    sh.vertexShader = 'varying vec3 vSnowW; varying float vSnowN;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vSnowW = (modelMatrix * vec4(transformed, 1.0)).xyz; vSnowN = normalize(mat3(modelMatrix) * objectNormal).y;`);
    sh.fragmentShader = `uniform float uSnowY; varying vec3 vSnowW; varying float vSnowN;
      float gdH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float gdN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(gdH(i), gdH(i+vec2(1,0)), f.x), mix(gdH(i+vec2(0,1)), gdH(i+vec2(1,1)), f.x), f.y); }
` + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      { // close-up ground detail so low flying is not a smear
        float near = 1.0 - smoothstep(15.0, 70.0, distance(cameraPosition, vSnowW));
        float d = gdN(vSnowW.xz * 7.0) * 0.6 + gdN(vSnowW.xz * 23.0) * 0.4;
        diffuseColor.rgb *= mix(1.0, 0.82 + d * 0.36, near); }
      { float wob = sin(vSnowW.x * 1.7) * sin(vSnowW.z * 1.3) * 0.25 + sin(vSnowW.x * 5.1 + vSnowW.z * 4.3) * 0.12;
        float sn = smoothstep(uSnowY, uSnowY + 0.45, vSnowW.y + wob) * smoothstep(0.6, 0.9, vSnowN);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 0.99), sn * 0.92); }`);
  };
  const key = 'snow:' + (prev ? prev.toString() : '');
  mat.customProgramCacheKey = () => key;
  mat.needsUpdate = true;
  return mat;
}

function softPuffTexture() {
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S; const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; return t;
}

/** Rising puffs (vog plume, waterfall mist) animated entirely in the vertex shader. */
function puffColumn(count, { heightU, driftX, driftZ, sizeU, bottom, top, opacity, speed }) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const seed = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) { seed[i * 2] = i / count; seed[i * 2 + 1] = Math.random(); }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 2)); geo.instanceCount = count;
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTex: { value: null }, uTime: { value: 0 }, uH: { value: heightU }, uDrift: { value: new THREE.Vector2(driftX, driftZ) },
    uSize: { value: sizeU }, uBottom: { value: new THREE.Color(bottom) }, uTop: { value: new THREE.Color(top) },
    uOpacity: { value: opacity }, uSpeed: { value: speed } }]);
  uniforms.uTex.value = softPuffTexture();
  const mat = new THREE.ShaderMaterial({
    uniforms, fog: true, transparent: true, depthWrite: false,
    vertexShader: `#include <fog_pars_vertex>
      attribute vec2 aSeed; uniform float uTime, uH, uSize, uSpeed; uniform vec2 uDrift; varying vec2 vUv; varying float vK;
      void main(){
        float k = fract(aSeed.x + uTime * uSpeed); vK = k;
        float j = aSeed.y * 6.2831;
        vec3 p = vec3(uDrift.x * pow(k, 1.6) + cos(j) * uSize * 0.25 * k, uH * pow(k, 0.7), uDrift.y * pow(k, 1.6) + sin(j) * uSize * 0.25 * k);
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        mvPosition.xy += position.xy * uSize * (0.35 + 1.4 * k);
        vUv = position.xy + 0.5; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `#include <fog_pars_fragment>
      uniform sampler2D uTex; uniform vec3 uBottom, uTop; uniform float uOpacity; varying vec2 vUv; varying float vK;
      void main(){ float a = texture2D(uTex, vUv).r * uOpacity * smoothstep(0.0, 0.08, vK) * (1.0 - smoothstep(0.6, 1.0, vK));
        if (a < 0.01) discard; gl_FragColor = vec4(mix(uBottom, uTop, smoothstep(0.0, 0.35, vK)), a);
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 3;
  return { mesh, uniforms };
}

function gableGeometry() { // unit roof: 1 wide (x), 1 deep (z), 1 tall ridge along z, sitting on y = 0
  const g = new THREE.BufferGeometry();
  const v = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0, 1, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1, 0.5];
  const idx = [0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4];
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3)); g.setIndex(idx);
  const ng = g.toNonIndexed(); ng.computeVertexNormals(); return ng;
}

/**
 * ctx: { scene, toWorld(lat, lon) -> Vector2, groundY(x, z), elevM(x, z), unitM, vex, isTouch,
 *        colorCanvas (island imagery), falls: [{ n, p: [lon, lat] }], sunDir }
 */
export function createLandmarks(ctx) {
  const { scene, toWorld, groundY, elevM, unitM, vex, isTouch } = ctx;
  const U = (m) => m / unitM; // meters -> world units (horizontal)
  const V = (m) => m / unitM * vex; // meters -> world units (vertical)
  const group = new THREE.Group(); group.name = 'landmarks'; scene.add(group);
  const ticks = [];
  let nightK = 0; const mists = []; let plumeRef = null, lightsMat = null;

  // ---- Kīlauea: glowing lava lake and the vog plume drifting southwest on the trade wind ----
  {
    const w = toWorld(HALEMAUMAU.lat, HALEMAUMAU.lon), y = groundY(w.x, w.y);
    const lavaU = { uTime: { value: 0 } };
    const lava = new THREE.Mesh(new THREE.CircleGeometry(U(HALEMAUMAU.lakeM) * 0.5 * EX * 0.6, 48), new THREE.ShaderMaterial({
      uniforms: lavaU, fog: false, polygonOffset: true, polygonOffsetFactor: -2,
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `uniform float uTime; varying vec2 vP;
        float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 13758.5); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        void main(){ vec2 p = vP * 2.5; float c = n(p + uTime * 0.15) * 0.6 + n(p * 2.7 - uTime * 0.22) * 0.4;
          float crack = smoothstep(0.42, 0.5, c) * (1.0 - smoothstep(0.5, 0.6, c));
          vec3 crust = vec3(0.12, 0.05, 0.04), hot = vec3(1.0, 0.45, 0.08), white = vec3(1.0, 0.9, 0.5);
          vec3 col = mix(hot, crust, smoothstep(0.35, 0.75, c)); col = mix(col, white, crack * 0.8);
          gl_FragColor = vec4(col * 1.6, 1.0); }`,
    }));
    lava.rotation.x = -Math.PI / 2; lava.position.set(w.x, y + 0.05, w.y); group.add(lava);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(U(HALEMAUMAU.lakeM) * EX * 1.2, 40),
      new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glow.rotation.x = -Math.PI / 2; glow.position.set(w.x, y + 0.08, w.y); group.add(glow);
    const plume = puffColumn(isTouch ? 34 : 56, { heightU: V(HALEMAUMAU.plumeM), driftX: -U(2600), driftZ: U(1400), sizeU: U(700),
      bottom: 0xd9b49a, top: 0xc9ccd2, opacity: 0.55, speed: 0.012 });
    plume.mesh.position.set(w.x, y + 0.1, w.y); group.add(plume.mesh);
    ticks.push((t) => { lavaU.uTime.value = t; plume.uniforms.uTime.value = t; glow.material.opacity = (0.18 + 0.06 * Math.sin(t * 1.7)) * (1 + 2.5 * nightK); });
    plumeRef = plume;
  }

  // ---- Mauna Kea observatories ----
  {
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.35, metalness: 0.3 });
    const silver = new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.25, metalness: 0.7 });
    const dome = new THREE.SphereGeometry(0.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const drum = new THREE.CylinderGeometry(0.5, 0.5, 0.45, 20).translate(0, 0.225, 0);
    for (const o of OBSERVATORIES) {
      const w = toWorld(o.lat, o.lon), s = U(o.d) * EX * 1.4, g = new THREE.Group();
      const d1 = new THREE.Mesh(drum, white); d1.scale.set(s, s * (o.cyl ? 1.6 : 1), s);
      const d2 = new THREE.Mesh(o.cyl ? drum : dome, o.cyl ? silver : white);
      d2.scale.set(s * (o.cyl ? 0.98 : 1), s * (o.cyl ? 0.6 : 1), s * (o.cyl ? 0.98 : 1)); d2.position.y = s * (o.cyl ? 0.72 : 0.45);
      g.add(d1, d2); g.position.set(w.x, groundY(w.x, w.y) - 0.02, w.y); g.userData.ground = { x: w.x, z: w.y };
      group.add(g);
    }
  }

  // ---- waterfalls: a white ribbon down the cliff with mist at the bottom ----
  {
    const fallU = { uTime: { value: 0 }, uTint: WORLD_TINT };
    const fallMat = new THREE.ShaderMaterial({
      uniforms: fallU, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `uniform float uTime; uniform vec3 uTint; varying vec2 vUv;
        void main(){ float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
          float streak = 0.6 + 0.4 * sin(vUv.x * 40.0 + sin(vUv.y * 9.0)) * sin((vUv.y + uTime * 0.9) * 22.0 + vUv.x * 7.0);
          float a = edge * (0.55 + 0.45 * streak) * (0.75 + 0.25 * smoothstep(0.0, 0.2, vUv.y));
          gl_FragColor = vec4(vec3(0.94, 0.97, 1.0) * uTint, a); }`,
    });
    const mistTex = softPuffTexture();
    for (const f of (ctx.falls || [])) {
      if (!f.n) continue;
      const w = toWorld(f.p[1], f.p[0]);
      const d = fallDrop(w.x, w.y, elevM);
      const hU = V(fallHeightM(f.n)) * 1.05, wid = U(22) * EX;
      const rib = new THREE.Mesh(new THREE.PlaneGeometry(wid, hU), fallMat);
      const bx = w.x + d.dirX * 0.15, bz = w.y + d.dirZ * 0.15;
      rib.position.set(bx, groundY(bx, bz) + hU / 2, bz);
      rib.rotation.y = Math.atan2(d.dirX, d.dirZ);
      group.add(rib);
      const mist = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
      mists.push(mist); mist.scale.set(wid * 3.2, wid * 2, 1); mist.position.set(bx + d.dirX * 0.1, groundY(bx, bz) + wid * 0.6, bz + d.dirZ * 0.1); group.add(mist);
    }
    ticks.push((t) => { fallU.uTime.value = t; });
  }

  // ---- towns: walls and tin roofs, two instanced draws ----
  let townMeshes = null;
  {
    const urbanAt = (x, z) => {
      const [r, g, b] = ctx.rgbAt(x, z);
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0;
      return Math.max(0, Math.min(1, (mx / 255 - 0.25) * 1.6 * (1 - sat * 1.4)));
    };
    let s = 99; const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const b = placeBuildings({ rand, towns: TOWN_AREAS, toWorld, unitM, scale: isTouch ? 0.6 : 1,
      sample: (x, z) => { const e = elevM(x, z), ex = elevM(x + 0.2, z), ez = elevM(x, z + 0.2);
        return { groundM: e, slope: Math.hypot(ex - e, ez - e) / (0.2 * unitM), urban: urbanAt(x, z) }; } });
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), wallMat, b.length);
    const roofs = new THREE.InstancedMesh(gableGeometry(), roofMat, b.length);
    const wallCols = [0xf3efe6, 0xe8e2d4, 0xf6f3ee, 0xdfe6e3, 0xefe2cf, 0xe9eef2].map((c) => new THREE.Color(c));
    const roofCols = [0x3f7d5a, 0xa3433a, 0x5b7894, 0xe5e5e0, 0x8a5a3c, 0x8f9493].map((c) => new THREE.Color(c));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);
    const place = () => {
      b.forEach((o, i) => {
        const y = groundY(o.x, o.z) - 0.01, W = U(o.w) * EX, D = U(o.d) * EX, Hh = V(o.h) * EX;
        q.setFromAxisAngle(yAxis, o.rot);
        m.compose(p.set(o.x, y, o.z), q, sc.set(W, Hh, D)); walls.setMatrixAt(i, m);
        m.compose(p.set(o.x, y + Hh, o.z), q, sc.set(W * 1.08, Hh * 0.45, D * 1.08)); roofs.setMatrixAt(i, m);
      });
      walls.instanceMatrix.needsUpdate = roofs.instanceMatrix.needsUpdate = true;
      walls.computeBoundingSphere(); roofs.computeBoundingSphere();
    };
    b.forEach((o, i) => { walls.setColorAt(i, wallCols[i % wallCols.length]); roofs.setColorAt(i, roofCols[o.roof]); });
    // warm window lights for the night, one per building
    const lp = new Float32Array(b.length * 3);
    const lightsGeo = new THREE.BufferGeometry(); lightsGeo.setAttribute('position', new THREE.BufferAttribute(lp, 3));
    lightsMat = new THREE.PointsMaterial({ color: 0xffc77a, size: isTouch ? 1.0 : 0.85, sizeAttenuation: true, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending });
    const lights = new THREE.Points(lightsGeo, lightsMat); lights.frustumCulled = false; lights.visible = false;
    const placeAll = () => { place(); b.forEach((o, i) => { lp[i * 3] = o.x; lp[i * 3 + 1] = groundY(o.x, o.z) + V(o.h) * EX * 1.2; lp[i * 3 + 2] = o.z; }); lightsGeo.attributes.position.needsUpdate = true; };
    placeAll(); group.add(walls, roofs, lights);
    townMeshes = { place: placeAll, count: b.length, lights };
  }

  return {
    group,
    update(t) { if (!reduceMotion) for (const f of ticks) f(t); },
    /** k: 0 day .. 1 night. Lights come on, the lava glows harder and lights the plume from below */
    setNight(k, tint) {
      nightK = k;
      if (lightsMat) { lightsMat.opacity = k; townMeshes.lights.visible = k > 0.01; }
      if (plumeRef) { plumeRef.uniforms.uBottom.value.setRGB(0.85 + 0.15 * k, 0.7 - 0.25 * k, 0.6 - 0.45 * k).multiply(tint).lerp(new THREE.Color(1, 0.42, 0.12), k * 0.8);
        plumeRef.uniforms.uTop.value.setRGB(0.79, 0.8, 0.82).multiply(tint); }
      for (const m of mists) m.material.color.copy(tint);
    },
    /** call when sharper terrain heights arrive so props sit on the ground */
    reseat() {
      townMeshes?.place();
      group.traverse((o) => { const g = o.userData.ground; if (g) o.position.y = groundY(g.x, g.z) - 0.02; });
    },
  };
}

export { SNOW_LINE_M };
