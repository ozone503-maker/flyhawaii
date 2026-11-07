export function formatDistance(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}
export function approachHint(horizontal, altitude, speed, phase) {
  if (horizontal >= 3.2) return phase === 'pickup' ? 'Fly to the amber beacon' : 'Fly to the green beacon';
  if (altitude >= 8) return 'Descend into the beacon';
  if (speed >= 9) return 'Slow down to transfer';
  return phase === 'pickup' ? 'Hold steady to pick up' : 'Hold steady to deliver';
}

// No context is created until an explicit click. A suspended context is never
// resumed from the animation loop, and muting also silences scheduled tones.
export function createDeliveryAudio({ AudioContext, enabled = false }) {
  let context, output;
  return {
    unlock() {
      if (!enabled || !AudioContext) return;
      try {
        context ??= new AudioContext();
        if (!output) { output = context.createGain(); output.connect(context.destination); }
        output.gain.value = 0.12;
        context.resume()?.catch(() => {});
      } catch { /* Sound is optional, including on restricted devices. */ }
    },
    setEnabled(value) {
      enabled = value;
      if (output) output.gain.value = value ? 0.12 : 0;
      if (value) this.unlock();
    },
    complete() {
      if (!enabled || context?.state !== 'running' || !output) return;
      try {
        [523.25, 659.25, 783.99].forEach((frequency, i) => {
          const start = context.currentTime + i * 0.11;
          const oscillator = context.createOscillator(), gain = context.createGain();
          oscillator.type = 'sine'; oscillator.frequency.value = frequency;
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(0.7, start + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
          oscillator.connect(gain); gain.connect(output);
          oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
          oscillator.start(start); oscillator.stop(start + 0.24);
        });
      } catch { /* Delivery and rewards must still work if audio fails. */ }
    },
  };
}
