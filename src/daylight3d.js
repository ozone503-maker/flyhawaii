// Applies the time of day to the scene: sun or moon light, sky colors, fog, exposure, stars,
// and the shared tint the custom shaders use. Pure sun math lives in daylight.js.
import * as THREE from 'three';
import { sunPosition, skyLook, hourFor, hawaiiDay, TIME_MODES } from './daylight.js';
import { WORLD_TINT, SUN_COLOR } from './world-light.js';

const MOON_DIR = new THREE.Vector3(-0.45, 0.75, 0.35).normalize();

function makeStars(isTouch) {
  const n = isTouch ? 900 : 1600, p = new Float32Array(n * 3), c = new Float32Array(n * 3);
  let s = 3; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const u = r() * 2 * Math.PI, y = 0.05 + Math.pow(r(), 0.7) * 0.95, q = Math.sqrt(1 - y * y);
    p[i * 3] = Math.cos(u) * q * 3000; p[i * 3 + 1] = y * 3000; p[i * 3 + 2] = Math.sin(u) * q * 3000;
    const b = 0.55 + r() * 0.45, warm = r(); c[i * 3] = b; c[i * 3 + 1] = b * (0.92 + warm * 0.08); c[i * 3 + 2] = b * (1.05 - warm * 0.15);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const m = new THREE.PointsMaterial({ size: isTouch ? 2.2 : 1.8, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = -1; return pts;
}

/** ctx: { scene, renderer, sun (DirectionalLight), hemi (HemisphereLight), sky (dome mesh), ocean, landmarks, isTouch } */
export function createDaylight(ctx) {
  const { scene, renderer, sun, hemi, sky } = ctx;
  const stars = makeStars(ctx.isTouch); sky.add(stars);
  let mode = TIME_MODES.includes(ctx.mode) ? ctx.mode : 'live', lastHour = -1, lastApply = -99, lastLook = null;
  const dir = new THREE.Vector3(), col = new THREE.Color();

  function apply(hour) {
    const { el, az } = sunPosition(hour, hawaiiDay());
    const L = skyLook(el);
    dir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)); // north is -z, east is +x
    const light = L.night ? MOON_DIR : dir;
    sun.position.copy(light).multiplyScalar(1000);
    sun.color.setRGB(...L.sunColor); sun.intensity = L.sunI;
    hemi.intensity = L.hemiI; hemi.color.setRGB(...L.zenith).lerp(col.setRGB(1, 1, 1), 0.5);
    renderer.toneMappingExposure = L.exposure;
    const u = sky.material.uniforms;
    u.zenith.value.setRGB(...L.zenith); u.horizon.value.setRGB(...L.horizon); u.sunDir.value.copy(dir);
    scene.background.setRGB(...L.horizon); if (scene.fog) scene.fog.color.setRGB(...L.horizon);
    WORLD_TINT.value.setRGB(...L.tint); SUN_COLOR.value.setRGB(...L.sunColor);
    const ou = ctx.ocean?.mesh.material.uniforms;
    if (ou) { ou.uHorizon.value.setRGB(...L.horizon); ou.uSun.value.copy(L.night ? MOON_DIR : dir); }
    stars.material.opacity = L.stars; stars.visible = L.stars > 0.01; u.uMoon.value = L.stars; u.moonDir.value.copy(MOON_DIR);
    ctx.landmarks?.setNight(L.lights, WORLD_TINT.value);
    lastHour = hour; lastLook = L;
    return L;
  }

  return {
    get mode() { return mode; },
    get hour() { return lastHour; },
    /** the last sky look: night, stars (0..1) and so on */
    get look() { return lastLook; },
    setMode(m) { mode = TIME_MODES.includes(m) ? m : 'live'; apply(hourFor(mode)); return mode; },
    setHour(h) { mode = 'fixed'; apply(h); },
    /** live mode re-checks the clock every few seconds */
    update(t) { if (mode === 'live' && t - lastApply > 5) { lastApply = t; apply(hourFor('live')); } },
    apply,
  };
}
