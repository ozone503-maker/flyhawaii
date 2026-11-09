// ShockBot album CD player. Streams HTMLAudioElement tracks from /music/.
export const DEFAULT_MUSIC_VOLUME = 0.4;

export const musicPreference = {
  enabled(stored) { return stored !== 'off'; },
  volume(stored) {
    if (stored == null || stored === '') return DEFAULT_MUSIC_VOLUME;
    const n = Number(stored);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : DEFAULT_MUSIC_VOLUME;
  },
};

export function normalizeTracks(data) {
  const album = (data && data.album) || 'ShockBot';
  const list = Array.isArray(data?.tracks) ? data.tracks : [];
  return list
    .filter((t) => t && typeof t.file === 'string' && t.file.length)
    .map((t, i) => ({
      id: t.id || `track-${String(i + 1).padStart(2, '0')}`,
      file: t.file,
      title: t.title || `${album} · Track ${i + 1}`,
      src: t.file.startsWith('/') || t.file.startsWith('http') ? t.file : `/music/${t.file}`,
    }));
}

export function createCdPlayer({
  audio,
  tracks = [],
  enabled = true,
  volume = DEFAULT_MUSIC_VOLUME,
  onChange = () => {},
} = {}) {
  let index = 0;
  let wantPlay = enabled;
  let pausedByGame = false;
  let unlocked = false;
  let loadedIndex = -1;

  function current() {
    return tracks[index] || null;
  }

  function applyVolume() {
    if (!audio) return;
    try { audio.volume = enabled ? Math.max(0, Math.min(1, volume)) : 0; } catch { /* ignore */ }
  }

  function notify() {
    onChange({
      enabled,
      volume,
      index,
      track: current(),
      playing: !!(audio && !audio.paused && !audio.ended),
      wantPlay,
      pausedByGame,
      unlocked,
      count: tracks.length,
    });
  }

  function tryPlay() {
    if (!audio || !enabled || !wantPlay || pausedByGame || !tracks.length) return;
    const p = audio.play?.();
    if (p && typeof p.then === 'function') p.catch(() => {});
  }

  function loadTrack(i, { autoplay = false, restart = false } = {}) {
    if (!audio || !tracks.length) return;
    index = ((i % tracks.length) + tracks.length) % tracks.length;
    const track = current();
    if (loadedIndex !== index || restart) {
      loadedIndex = index;
      try {
        audio.preload = 'metadata';
        audio.src = track.src;
        audio.load?.();
      } catch { /* ignore */ }
    }
    applyVolume();
    if (autoplay) tryPlay();
    notify();
  }

  if (audio) {
    try {
      audio.preload = 'metadata';
      audio.loop = false;
    } catch { /* ignore */ }
    applyVolume();
    audio.addEventListener?.('ended', () => {
      if (!tracks.length) return;
      loadTrack(index + 1, { autoplay: true });
    });
    audio.addEventListener?.('play', notify);
    audio.addEventListener?.('pause', notify);
    audio.addEventListener?.('error', () => {
      if (!tracks.length) return;
      loadTrack(index + 1, { autoplay: wantPlay && enabled && !pausedByGame });
    });
  }

  if (tracks.length) loadTrack(0, { autoplay: false });

  return {
    setTracks(next) {
      tracks = Array.isArray(next) && next[0]?.src
        ? next.slice()
        : normalizeTracks({ tracks: next });
      index = 0;
      loadedIndex = -1;
      if (tracks.length) loadTrack(0, { autoplay: wantPlay && enabled && unlocked && !pausedByGame });
      else notify();
    },
    unlock() {
      unlocked = true;
      applyVolume();
      if (enabled && wantPlay && !pausedByGame && tracks.length) {
        if (loadedIndex < 0) loadTrack(index, { autoplay: true });
        else tryPlay();
      }
      notify();
    },
    setEnabled(value) {
      enabled = !!value;
      wantPlay = enabled;
      applyVolume();
      if (!enabled) {
        try { audio?.pause?.(); } catch { /* ignore */ }
      } else if (unlocked && !pausedByGame) {
        tryPlay();
      }
      notify();
    },
    setVolume(value) {
      volume = Math.max(0, Math.min(1, Number(value) || 0));
      applyVolume();
      notify();
    },
    play() {
      wantPlay = true;
      if (!enabled || pausedByGame || !tracks.length) { notify(); return; }
      unlocked = true;
      if (loadedIndex < 0) loadTrack(index, { autoplay: true });
      else tryPlay();
      notify();
    },
    pause() {
      wantPlay = false;
      try { audio?.pause?.(); } catch { /* ignore */ }
      notify();
    },
    toggle() {
      if (wantPlay && audio && !audio.paused) this.pause();
      else this.play();
    },
    next() {
      if (!tracks.length) return;
      loadTrack(index + 1, { autoplay: wantPlay && enabled && !pausedByGame });
    },
    prev() {
      if (!tracks.length) return;
      const t = Number(audio?.currentTime) || 0;
      if (t > 3) loadTrack(index, { autoplay: wantPlay && enabled && !pausedByGame, restart: true });
      else loadTrack(index - 1, { autoplay: wantPlay && enabled && !pausedByGame });
    },
    setGamePaused(value) {
      pausedByGame = !!value;
      if (pausedByGame) {
        try { audio?.pause?.(); } catch { /* ignore */ }
      } else if (enabled && wantPlay && unlocked) {
        tryPlay();
      }
      notify();
    },
    isEnabled() { return enabled; },
    getVolume() { return volume; },
    getIndex() { return index; },
    getTrack() { return current(); },
    getTracks() { return tracks.slice(); },
    isPlaying() { return !!(audio && !audio.paused && !audio.ended); },
  };
}
