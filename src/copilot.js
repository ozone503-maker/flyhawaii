// Scripted co-pilot: pre-baked voice lines (Piper TTS, built once offline) plus a cockpit subtitle.
// Audio plays through WebAudio so volume works on iOS, and the context unlocks on the first tap or key.
// Lines load lazily: landmark and town lines only when the UFO gets near, cues once the game starts.
const MUTE_KEY = 'fh_cp_mute', VOL_KEY = 'fh_cp_vol';

export class Copilot {
  constructor({ manifest, fromWorld, haversineKm, towns }) {
    this.lines = manifest?.lines || {};
    this.fromWorld = fromWorld; this.hav = haversineKm;
    this.towns = (towns || []).map((t) => ({ ...t, id: `town-${t.town.toLowerCase().replace(/[^a-z]+/g, '-')}`, r: 2.5 }));
    this.muted = localStorage.getItem(MUTE_KEY) === '1';
    const v = Number(localStorage.getItem(VOL_KEY)); this.volume = Number.isFinite(v) && localStorage.getItem(VOL_KEY) !== null ? Math.min(1, Math.max(0, v)) : 0.9;
    this.ctx = null; this.gain = null; this.buffers = new Map(); this.queue = []; this.playing = null;
    this.townIn = null; this.townSaid = new Map(); this.fetched = new Set();
    this.sub = document.getElementById('cpSub'); this.subText = document.getElementById('cpSubText');
    const unlock = () => this.unlock();
    addEventListener('pointerdown', unlock, { capture: true }); addEventListener('keydown', unlock, { capture: true });
    addEventListener('touchend', unlock, { capture: true });
  }
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = new AC(); this.gain = this.ctx.createGain(); this.gain.connect(this.ctx.destination); this.applyGain();
      const b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0); // iOS warm-up
    }
    if (this.ctx.state === 'suspended' && !this.paused) this.ctx.resume().catch(() => {});
  }
  get unlocked() { return !!this.ctx && this.ctx.state === 'running'; }
  applyGain() { if (!this.gain) return; const g = this.gain.gain; g.cancelScheduledValues(0); g.value = this.muted ? 0 : this.volume; }
  setMuted(m) { this.muted = !!m; localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0'); this.applyGain(); this.onChange?.(); }
  setVolume(v) { this.volume = Math.min(1, Math.max(0, v)); localStorage.setItem(VOL_KEY, String(this.volume)); this.applyGain(); this.onChange?.(); }
  pause(p) { this.paused = p; this.sub?.classList.toggle('paused', !!p); if (!this.ctx) return; if (p) this.ctx.suspend().catch(() => {}); else this.ctx.resume().catch(() => {}); }

  // fetch the mp3 bytes early, decode once the context exists
  load(id) {
    const L = this.lines[id]; if (!L) return null;
    if (!this.fetched.has(id)) { this.fetched.add(id); L._bytes = fetch(L.src).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null); }
    return L._bytes;
  }
  async buffer(id) {
    if (this.buffers.has(id)) return this.buffers.get(id);
    const bytes = await this.load(id); if (!bytes || !this.ctx) return null;
    const buf = await new Promise((res) => this.ctx.decodeAudioData(bytes.slice(0), res, () => res(null)));
    if (buf) this.buffers.set(id, buf); return buf;
  }
  preloadCues() { for (const id of Object.keys(this.lines)) if (id.startsWith('cue-')) this.load(id); }

  say(id) {
    if (!this.lines[id]) return;
    if (this.playing?.id === id || this.queue.some((q) => q.id === id)) return;
    this.load(id);
    const item = { id, at: performance.now() };
    if (id === 'cue-lowAlt') this.queue.unshift(item); else this.queue.push(item); // safety first
    if (this.queue.length > 3) this.queue.splice(0, this.queue.length - 3);
    if (!this.playing) this.next();
  }
  async next() {
    let item;
    while ((item = this.queue.shift())) { if (performance.now() - item.at < 20000 || item.id.startsWith('lm-')) break; }
    if (!item) { this.playing = null; return; }
    const L = this.lines[item.id]; this.playing = item;
    let buf = null;
    if (this.unlocked && !this.muted) buf = await Promise.race([this.buffer(item.id), new Promise((r) => setTimeout(() => r(null), 4000))]);
    this.showSub(L.text);
    const words = L.text.split(/\s+/).length;
    const hold = Math.max(buf ? buf.duration : 0, L.dur || 0, words * 0.32, 4);
    if (buf) {
      const s = this.ctx.createBufferSource(); s.buffer = buf; s.connect(this.gain); s.start();
      item.src = s; this.lastPlayed = item.id;
    }
    item.timer = setTimeout(() => { this.hideSub(); setTimeout(() => this.next(), 450); }, (hold + 0.8) * 1000);
    this.lastShown = item.id;
  }
  showSub(text) { if (!this.sub) return; this.subText.textContent = text; this.sub.classList.add('on'); this.sub.setAttribute('aria-hidden', 'false'); }
  hideSub() { if (!this.sub) return; this.sub.classList.remove('on'); this.sub.setAttribute('aria-hidden', 'true'); }

  // called a few times a second with the UFO position; handles town zones and lazy loading
  update(x, z, attractions) {
    const here = this.fromWorld(x, z);
    let inside = null;
    for (const t of this.towns) {
      const d = this.hav(here, t);
      if (d < t.r * 2 + 3) this.load(t.id);
      const r = this.townIn === t ? t.r * 1.2 : t.r;
      if (d < r) inside = t;
    }
    if (inside && inside !== this.townIn) {
      const last = this.townSaid.get(inside.id) || -Infinity;
      if (performance.now() - last > 180000) { this.townSaid.set(inside.id, performance.now()); this.say(inside.id); }
    }
    this.townIn = inside;
    if (attractions) for (const a of attractions.list) if (this.hav(here, a) < a.r * 2 + 3) this.load(`lm-${a.id}`);
  }
}
