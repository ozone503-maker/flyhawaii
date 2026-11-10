// Shared light tint for the hand-written shaders (ocean, clouds, waterfalls, wakes) so they dim
// and warm with the time of day. Pass WORLD_TINT as a uniform; the daylight code updates it.
import * as THREE from 'three';
export const WORLD_TINT = { value: new THREE.Color(1, 1, 1) };
export const SUN_COLOR = { value: new THREE.Color(1, 0.95, 0.85) };
