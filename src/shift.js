// New-shift takeoff and the optional FlashTown homecoming payout.
// Pure helpers so spawn and bonus math can be unit tested.
import { hqDestination, startCoords, distanceKm, FALLBACK_START } from './destinations.js';

export { hqDestination, startCoords, FALLBACK_START };

// Close enough to HQ to clock out without another hop (about 400 m).
export const HQ_NEAR_KM = 0.4;

export function isNearHq(player, hq, km = HQ_NEAR_KM) {
  if (!player || !hq) return false;
  if (!Number.isFinite(player.lat) || !Number.isFinite(player.lon)) return false;
  if (!Number.isFinite(hq.lat) || !Number.isFinite(hq.lon)) return false;
  return distanceKm(player, hq) <= km;
}

/** Small thank-you for flying home after at least one delivery this shift. */
export function homecomingBonus(jobs, earned = 0) {
  const n = Math.max(0, Math.floor(Number(jobs) || 0));
  if (n < 1) return 0;
  const raw = 10 + n * 5 + Math.max(0, Number(earned) || 0) * 0.05;
  return Math.max(10, Math.round(raw / 5) * 5);
}

export function emptyShift() {
  return { jobs: 0, kdu: 0, tips: 0, leftHome: false };
}
