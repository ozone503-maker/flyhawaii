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

/**
 * Local eye / look in unscaled hull units (group already applies UFO_SCALE).
 * Forward is -Z. Landscape looks level; portrait pitches down a little.
 */
export function cockpitEyeLocal(portrait = false) {
  if (portrait) {
    // Eye high and forward in the glass dome so the hull is a thin band,
    // pitched about 6 degrees down so the horizon sits near 40% from the top.
    return { eye: [0, 1.6, -0.3], look: [0, -0.08, -16.3], fov: 76 };
  }
  return { eye: [0, 0.95, 0.25], look: [0, 1.15, -9], fov: 66 };
}
