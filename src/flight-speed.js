// Actual world displacement rates, not HUD multipliers. One unit is 100 m.
export const CRUISE = 25;
export const BOOST = 80;
export const REVERSE = 3;
const LANDING_CRUISE = 10;
export const ease = (cur, tgt, rate, dt) => cur + (tgt - cur) * (1 - Math.exp(-rate * dt));

export function targetSpeed(forward, boostMix, stats) {
  if (forward < 0) return forward * REVERSE;
  const top = CRUISE * stats.cruise + (BOOST * stats.boost - CRUISE * stats.cruise) * boostMix;
  // Preserve the previous low-stick speeds, then smoothly open up island travel.
  const t = Math.max(0, Math.min(1, (forward - 0.3) / 0.7));
  const travel = t * t * (3 - 2 * t);
  return forward * LANDING_CRUISE + (top - LANDING_CRUISE) * travel;
}

export function advanceSpeed(state, input, stats, dt) {
  const previous = state.inF || 0;
  const braking = Math.abs(input.fwd) < Math.abs(previous) || input.fwd * previous < 0;
  state.inF = ease(previous, input.fwd, braking ? 14 : 5, dt);
  state.boostMix = ease(state.boostMix || 0, input.boost && input.fwd > 0.2 ? 1 : 0, 2.2, dt);
  const target = targetSpeed(state.inF, state.boostMix, stats);
  const speed = state.speed || 0;
  const accelerating = Math.abs(target) > Math.abs(speed) && target * speed >= 0;
  state.speed = ease(speed, target, accelerating ? 1.1 : 6, dt);
}
