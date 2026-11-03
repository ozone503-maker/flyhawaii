// Tourist attraction zones: fly into one and a real photo card fades in.
// Photos load lazily, only when the UFO gets close to a zone.
const FIRST_BONUS = 25;
const KEY = 'fh_found';

export class Attractions {
  constructor({ list, fromWorld, haversineKm, onDiscover, onShow }) {
    this.list = list; this.fromWorld = fromWorld; this.hav = haversineKm; this.onDiscover = onDiscover; this.onShow = onShow;
    this.found = new Set(JSON.parse(localStorage.getItem(KEY) || '[]').filter((id) => list.some((a) => a.id === id)));
    this.active = null; this.dismissed = null; this.loaded = new Map();
    this.$ = (id) => document.getElementById(id);
    this.card = this.$('photoCard');
    this.card.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.dismiss(); });
    this.renderCount();
  }
  renderCount() { this.$('foundCount').textContent = `${this.found.size}/${this.list.length}`; }
  preload(a) {
    if (this.loaded.has(a.id)) return this.loaded.get(a.id);
    const p = new Promise((res) => { const im = new Image(); im.decoding = 'async'; im.onload = () => res(im); im.onerror = () => res(null); im.src = a.img; });
    this.loaded.set(a.id, p); return p;
  }
  update(x, z) {
    const here = this.fromWorld(x, z);
    let inside = null, best = Infinity;
    for (const a of this.list) {
      const d = this.hav(here, a);
      if (d < a.r * 2 + 3) this.preload(a);              // fetch the photo a few km before the zone
      const r = this.active === a ? a.r * 1.15 : a.r;      // a little hysteresis on the way out
      if (d < r && d / a.r < best) { best = d / a.r; inside = a; }
    }
    if (this.dismissed && this.dismissed !== inside) this.dismissed = null;
    if (inside && inside !== this.active && inside !== this.dismissed) this.show(inside);
    else if (!inside && this.active) this.hide();
  }
  async show(a) {
    this.active = a;
    const first = !this.found.has(a.id);
    if (first) {
      this.found.add(a.id); localStorage.setItem(KEY, JSON.stringify([...this.found])); this.renderCount();
      this.onDiscover?.(a, FIRST_BONUS);
    }
    this.onShow?.(a, first);
    const $ = this.$;
    $('photoHint').textContent = matchMedia('(pointer: coarse)').matches ? 'Tap to close, or just fly on' : 'Click or press Enter to close, or just fly on';
    $('photoName').textContent = a.name;
    $('photoFact').textContent = a.fact;
    $('photoNew').textContent = first ? `New discovery +${FIRST_BONUS} KDU` : `Discovered ${this.found.size} of ${this.list.length}`;
    $('photoNew').classList.toggle('first', first);
    const lic = a.licenseUrl ? `<a href="${a.licenseUrl}" target="_blank" rel="noopener">${a.license}</a>` : a.license;
    $('photoCredit').innerHTML = `Photo: ${esc(a.author)}, ${lic}, via <a href="${a.source}" target="_blank" rel="noopener">Wikimedia Commons</a> (resized)`;
    $('photoCredit').querySelectorAll('a').forEach((el) => el.addEventListener('pointerdown', (e) => e.stopPropagation()));
    const img = $('photoImg'); img.classList.remove('ready');
    const im = await this.preload(a);
    if (this.active !== a) return;
    img.style.backgroundImage = im ? `url("${a.img}")` : 'none';
    requestAnimationFrame(() => img.classList.add('ready'));
    this.card.classList.add('on'); this.card.setAttribute('aria-hidden', 'false');
  }
  hide() { this.active = null; this.card.classList.remove('on'); this.card.setAttribute('aria-hidden', 'true'); }
  dismiss() { if (!this.active) return; this.dismissed = this.active; this.hide(); }
}
function esc(s) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
