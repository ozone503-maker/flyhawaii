// Thank-you transmission clips shown after deliveries. Pure helpers.
export const CLIP_HOLD_AT = 3.3;      // cutscene time where the clip plays (after the burst)
export const CLIP_START_TIMEOUT = 2.5; // seconds to wait for a clip to start before skipping it
export const CLIP_MAX_SECONDS = 12;    // safety cap if a file never reports its end

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
      return { id, file, src };
    })
    .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
}

/** Random clip that is not the last one played (unless it is the only one). */
export function pickClip(list, lastId, rand = Math.random) {
  if (!list?.length) return null;
  const pool = list.length > 1 ? list.filter((c) => c.id !== lastId) : list;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}

/** Clips only play for deliveries, with scenes on and at least one clip. */
export function shouldPlayClip({ kind, scenesOn, clips }) {
  return kind === 'delivery' && !!scenesOn && Array.isArray(clips) && clips.length > 0;
}
