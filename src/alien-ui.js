// Alien cockpit UI helpers: glyph markup, segmented gauge fractions and the
// sound crystal waveform. Pure functions so they are easy to test.

export const GLYPHS = [
  'view-in', 'view-out', 'pause', 'play', 'prev', 'next', 'up', 'down', 'boost',
  'sound', 'find', 'alt', 'speed', 'kdu', 'arrow',
];

export function glyph(id, extra = '') {
  const safe = GLYPHS.includes(id) ? id : 'find';
  const cls = extra ? `glyph ${extra}` : 'glyph';
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#g-${safe}"></use></svg>`;
}

export function gaugeFraction(value, max) {
  const v = Number(value), m = Number(max);
  if (!Number.isFinite(v) || !Number.isFinite(m) || m <= 0) return 0;
  return Math.max(0, Math.min(1, v / m));
}

// Deterministic per-track seed so each song gets its own wave "signature".
export function trackSeed(id = '') {
  let h = 2166136261;
  for (const ch of String(id)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}

/**
 * Bar heights 0..1 for the holographic waveform. A fake spectrum: layered
 * sines with a beat pulse while playing, a slow low shimmer while idle.
 */
export function waveBars(t, { count = 16, seed = 0, playing = false, energy = 1 } = {}) {
  const out = new Array(count);
  const beat = playing ? Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * (1.9 + seed * 0.4))), 6) : 0;
  for (let i = 0; i < count; i++) {
    const x = i / Math.max(1, count - 1);
    const p = seed * 40 + i * 1.7;
    let v;
    if (playing) {
      const body = 0.5 + 0.25 * Math.sin(t * 5.1 + p) + 0.15 * Math.sin(t * 8.3 + p * 1.9) + 0.1 * Math.sin(t * 13.7 + p * 0.6);
      const tilt = 1 - x * 0.45; // more low end, like music
      v = (body * tilt + beat * (1 - x) * 0.5) * energy;
    } else {
      v = 0.08 + 0.05 * Math.sin(t * 1.3 + p);
    }
    out[i] = Math.max(0.04, Math.min(1, v));
  }
  return out;
}
