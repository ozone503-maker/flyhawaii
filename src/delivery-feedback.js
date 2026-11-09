export { createDeliveryAudio, createGameAudio, soundPreference, DEFAULT_VOLUME, engineTargets } from './game-audio.js';

export function formatDistance(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}
export function approachHint(horizontal, altitude, speed, phase) {
  if (horizontal >= 3.2) return phase === 'pickup' ? 'Fly to the amber beacon' : 'Fly to the green beacon';
  if (altitude >= 8) return 'Descend into the beacon';
  if (speed >= 9) return 'Slow down to transfer';
  return phase === 'pickup' ? 'Hold steady to pick up' : 'Hold steady to deliver';
}
