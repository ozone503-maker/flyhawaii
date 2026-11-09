// Cutaway clips (live action) shown in arrival scenes. Pure helpers.
// Each clip may say when it plays: "delivery" (default), "pickup" or "any".
export const CLIP_WHEN = ['delivery', 'pickup', 'any'];
export const CLIP_HOLD_AT = 3.3;      // cutscene time where the clip plays (after the burst)
export const CLIP_START_TIMEOUT = 2.5; // seconds to wait for a clip to start before skipping it
export const CLIP_MAX_SECONDS = 12;    // safety cap if a file never reports its end

export function clipWhen(value) {
  const v = String(value || '').trim().toLowerCase();
  return CLIP_WHEN.includes(v) ? v : 'delivery';
}

/** Accepts { clips: [...] } or a bare array. Entries need a file. */
export function normalizeClips(data) {
  const list = Array.isArray(data) ? data : Array.isArray(data?.clips) ? data.clips : [];
  const seen = new Set();
  return list
    .filter((c) => c && typeof c.file === 'string' && c.file.trim().length)
    .map((c, i) => {
      const file = c.file.trim();
      const id = String(c.id || file.replace(/\.[^.]+$/, '') || `clip-${i + 1}`);
      const src = /^(https?:)?\//.test(file) ? file : `/clips/${file}`;
      return { id, file, src, when: clipWhen(c.when) };
    })
    .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
}

/** Clips that can play for a scene kind ("delivery" or "pickup"). */
export function clipsFor(list, kind) {
  return (list || []).filter((c) => c && ((c.when || 'delivery') === 'any' || (c.when || 'delivery') === kind));
}

/** Random clip for this kind that is not the last one played (unless it is the only one). */
export function pickClip(list, lastId, rand = Math.random, kind = 'delivery') {
  const fit = clipsFor(list, kind);
  if (!fit.length) return null;
  const pool = fit.length > 1 ? fit.filter((c) => c.id !== lastId) : fit;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}

/** A clip plays when scenes are on and at least one clip fits this kind of arrival. */
export function shouldPlayClip({ kind, scenesOn, clips }) {
  return (kind === 'delivery' || kind === 'pickup') && !!scenesOn && clipsFor(clips, kind).length > 0;
}
