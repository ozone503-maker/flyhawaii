import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAM_CHASE, CAM_COCKPIT, cameraPreference, nextCameraMode, camBlendStep, cockpitEyeLocal,
} from '../src/camera-mode.js';

test('camera defaults to chase unless cockpit stored', () => {
  assert.equal(cameraPreference(null), CAM_CHASE);
  assert.equal(cameraPreference('chase'), CAM_CHASE);
  assert.equal(cameraPreference('cockpit'), CAM_COCKPIT);
  assert.equal(cameraPreference('nope'), CAM_CHASE);
});

test('camera mode toggles between chase and cockpit', () => {
  assert.equal(nextCameraMode(CAM_CHASE), CAM_COCKPIT);
  assert.equal(nextCameraMode(CAM_COCKPIT), CAM_CHASE);
});

test('cam blend eases toward the active mode', () => {
  const a = camBlendStep(0, CAM_COCKPIT, 0.1, 6);
  assert.ok(a > 0 && a < 1);
  const b = camBlendStep(0.9, CAM_CHASE, 0.2, 6);
  assert.ok(b < 0.9);
  const done = camBlendStep(0.99, CAM_COCKPIT, 1, 6);
  assert.ok(done > 0.99);
});

test('cockpit eye sits inside the bubble looking forward', () => {
  const { eye, look } = cockpitEyeLocal(false);
  assert.equal(eye.length, 3);
  assert.ok(eye[1] > 0.4);
  assert.ok(look[2] < eye[2]); // look is further forward (-Z)
  assert.ok(look[1] >= eye[1] - 0.01); // not pitching into the nose
});

test('portrait cockpit looks up so the hull is only a thin sliver', () => {
  const { eye, look, fov } = cockpitEyeLocal(true);
  assert.ok(look[1] > eye[1]);
  assert.ok(eye[2] > 0); // eye sits a bit aft of the nose
  assert.ok(fov >= 78);
});
