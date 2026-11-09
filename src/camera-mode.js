// Chase vs cockpit camera preference helpers (pure, easy to test).
export const CAM_CHASE = 'chase';
export const CAM_COCKPIT = 'cockpit';

export function cameraPreference(stored) {
  return stored === CAM_COCKPIT ? CAM_COCKPIT : CAM_CHASE;
}

export function nextCameraMode(current) {
  return current === CAM_COCKPIT ? CAM_CHASE : CAM_COCKPIT;
}

export function camBlendStep(blend, target, dt, rate = 6) {
  const t = target === CAM_COCKPIT ? 1 : 0;
  const k = Math.min(1, Math.max(0, dt) * rate);
  return blend + (t - blend) * k;
}

/** Local eye / look offsets in unscaled ship hull units (group already applies UFO_SCALE). */
export function cockpitEyeLocal() {
  return { eye: [0, 0.72, -0.05], look: [0, 0.55, -6] };
}
