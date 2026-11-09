// Free synthesized WebAudio only. Context is created on the first user gesture.
export const DEFAULT_VOLUME = 0.55;
export const soundPreference = {
  enabled(stored) { return stored !== 'off'; },
  volume(stored) {
    if (stored == null || stored === '') return DEFAULT_VOLUME;
    const n = Number(stored);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : DEFAULT_VOLUME;
  },
};

export function engineTargets(speed, throttle, boostMix, boost = 80) {
  const motion = Math.max(0, Math.min(1, Math.abs(speed) / boost));
  const thrust = Math.max(0, Math.min(1, Math.abs(throttle)));
  const energy = Math.min(1, motion * 0.7 + thrust * 0.3 + Math.max(0, boostMix) * 0.15);
  return {
    humGain: 0.02 + energy * 0.09,
    humHz: 58 + energy * 92 + Math.max(0, boostMix) * 28,
    windGain: motion * motion * (0.01 + Math.min(1, Math.abs(speed) / boost) * 0.05),
    windHz: 420 + motion * 980,
  };
}

function tone(context, output, { freqs, type = 'sine', gap = 0.1, attack = 0.012, hold = 0.18, peak = 0.55 }) {
  freqs.forEach((frequency, i) => {
    const start = context.currentTime + i * gap;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peak, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + hold);
    oscillator.connect(gain);
    gain.connect(output);
    oscillator.onended = () => { try { oscillator.disconnect(); gain.disconnect(); } catch { /* ignore */ } };
    oscillator.start(start);
    oscillator.stop(start + hold + 0.02);
  });
}

function makeNoiseBuffer(context) {
  const length = context.sampleRate * 2;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export function createGameAudio({ AudioContext, enabled = true, volume = DEFAULT_VOLUME } = {}) {
  let context, master, duck, engineGain, windGain, filter, windFilter;
  let oscA, oscB, noise, started = false, muted = false, lastBoost = 0, lastTick = 0;

  function alive() {
    return enabled && !muted && context?.state === 'running' && master;
  }

  function applyMaster() {
    if (!master) return;
    const target = enabled && !muted ? Math.max(0.0001, volume * 0.55) : 0.0001;
    try {
      const now = context.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(target, now, 0.05);
    } catch {
      master.gain.value = enabled && !muted ? volume * 0.55 : 0;
    }
  }

  function ensureGraph() {
    if (!AudioContext || context) return;
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = 0.0001;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 18;
    compressor.ratio.value = 3.5;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.2;
    duck = context.createGain();
    duck.gain.value = 1;
    duck.connect(compressor);
    compressor.connect(master);
    master.connect(context.destination);

    engineGain = context.createGain();
    engineGain.gain.value = 0.0001;
    filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.7;
    oscA = context.createOscillator();
    oscB = context.createOscillator();
    oscA.type = 'sine';
    oscB.type = 'triangle';
    oscA.frequency.value = 58;
    oscB.frequency.value = 87;
    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(duck);
    oscA.start();
    oscB.start();

    windGain = context.createGain();
    windGain.gain.value = 0.0001;
    windFilter = context.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windFilter.Q.value = 0.6;
    noise = context.createBufferSource();
    noise.buffer = makeNoiseBuffer(context);
    noise.loop = true;
    noise.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(duck);
    noise.start();
    applyMaster();
  }

  return {
    unlock() {
      if (!enabled || !AudioContext) return;
      try {
        ensureGraph();
        context.resume()?.catch(() => {});
        started = true;
        applyMaster();
      } catch { /* Sound is optional, including on restricted devices. */ }
    },
    setEnabled(value) {
      enabled = value;
      if (value) this.unlock();
      applyMaster();
    },
    setVolume(value) {
      volume = Math.max(0, Math.min(1, Number(value) || 0));
      applyMaster();
    },
    setMuted(value) {
      muted = !!value;
      applyMaster();
    },
    isEnabled() { return enabled; },
    getVolume() { return volume; },
    update({ speed = 0, throttle = 0, boostMix = 0, paused = false, hidden = false } = {}) {
      if (!started || !context || !engineGain) return;
      if (context.state === 'suspended' && enabled && !paused && !hidden) {
        context.resume()?.catch(() => {});
      }
      this.setMuted(paused || hidden);
      if (!alive()) {
        try {
          const now = context.currentTime;
          engineGain.gain.setTargetAtTime(0.0001, now, 0.08);
          windGain.gain.setTargetAtTime(0.0001, now, 0.08);
        } catch { /* ignore */ }
        return;
      }
      const t = engineTargets(speed, throttle, boostMix);
      const now = context.currentTime;
      try {
        oscA.frequency.setTargetAtTime(t.humHz, now, 0.08);
        oscB.frequency.setTargetAtTime(t.humHz * 1.5, now, 0.08);
        filter.frequency.setTargetAtTime(320 + Math.min(1, Math.abs(speed) / 80) * 900, now, 0.1);
        engineGain.gain.setTargetAtTime(Math.max(0.0001, t.humGain), now, 0.08);
        windFilter.frequency.setTargetAtTime(t.windHz, now, 0.12);
        windGain.gain.setTargetAtTime(Math.max(0.0001, t.windGain), now, 0.12);
        if (boostMix > 0.55 && lastBoost <= 0.55) this.boost();
        lastBoost = boostMix;
      } catch { /* Continuous layers must never break flight. */ }
    },
    boost() {
      if (!alive()) return;
      try {
        const start = context.currentTime;
        const src = context.createBufferSource();
        src.buffer = makeNoiseBuffer(context);
        const bp = context.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(280, start);
        bp.frequency.exponentialRampToValueAtTime(1800, start + 0.45);
        bp.Q.value = 0.8;
        const g = context.createGain();
        g.gain.setValueAtTime(0.0001, start);
        g.gain.linearRampToValueAtTime(0.18, start + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
        src.connect(bp); bp.connect(g); g.connect(duck);
        src.onended = () => { try { src.disconnect(); bp.disconnect(); g.disconnect(); } catch { /* ignore */ } };
        src.start(start); src.stop(start + 0.52);
      } catch { /* ignore */ }
    },
    pickup() {
      if (!alive()) return;
      try { tone(context, duck, { freqs: [392, 523.25], gap: 0.08, hold: 0.16, peak: 0.42 }); }
      catch { /* ignore */ }
    },
    complete() {
      if (!alive()) return;
      try { tone(context, duck, { freqs: [523.25, 659.25, 783.99], gap: 0.11, hold: 0.22, peak: 0.5 }); }
      catch { /* Delivery and rewards must still work if audio fails. */ }
    },
    coinTick() {
      if (!alive()) return;
      const now = context.currentTime;
      if (now - lastTick < 0.06) return; // throttle the count-up blips
      lastTick = now;
      try { tone(context, duck, { freqs: [1318.5 + Math.random() * 200], type: 'triangle', hold: 0.06, peak: 0.16 }); }
      catch { /* ignore */ }
    },
    // Fly-through ring: bright rising chime, higher for rarer rings and longer streaks.
    ring(level = 0, combo = 1) {
      if (!alive()) return;
      const base = 659.25 * Math.pow(2, (Math.min(level, 3) * 3 + Math.min(combo - 1, 6)) / 12);
      try { tone(context, duck, { freqs: [base, base * 1.25, base * 1.5, ...(level >= 2 ? [base * 2] : [])], gap: 0.045, hold: 0.12, peak: 0.34, type: 'triangle' }); }
      catch { /* ignore */ }
    },
    discover() {
      if (!alive()) return;
      try { tone(context, duck, { freqs: [659.25, 880, 1046.5], gap: 0.09, hold: 0.2, peak: 0.4, type: 'triangle' }); }
      catch { /* ignore */ }
    },
  };
}

// Keep the previous helper name so older imports and tests keep working.
export function createDeliveryAudio(opts) {
  return createGameAudio(opts);
}
