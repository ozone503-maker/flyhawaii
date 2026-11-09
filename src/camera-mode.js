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
 * Forward is -Z. Look Y stays above eye Y so the pink nose is only a thin rim.
 */
export function cockpitEyeLocal(portrait = false) {
  if (portrait) {
    // Eye further aft and higher; look pitched up toward the horizon.
    return { eye: [0, 1.28, 0.85], look: [0, 2.05, -16], fov: 86 };
  }
  return { eye: [0, 0.95, 0.25], look: [0, 1.15, -9], fov: 66 };
}
