# Job board + KDU ring checks and screenshots.
#   npm run build && npx vite preview --port 4181 &
#   python3 scripts/rings-jobs-shots.py http://localhost:4181
import sys, time, json
from playwright.sync_api import sync_playwright
url = sys.argv[1].rstrip('/'); D = '/workspace/flyhawaii/shots/'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
log = []
AIM = """(d) => { const f = window.__fh, p = f.state.pos;
  const rs = f.ringField.rings.filter(r => r.alive).map(r => ({ r, d: Math.hypot(r.x - p.x, r.z - p.z) })).sort((a, b) => a.d - b.d);
  const r = (rs.find(x => x.r.tier.id === (d.tier || x.r.tier.id)) || rs[0]).r;
  p.set(r.x - r.n.x * d.back, r.y, r.z - r.n.z * d.back); f.state.yaw = Math.atan2(r.n.x, r.n.z) + Math.PI;
  f.state.speed = 0; f.state.vy = 0; return { tier: r.tier.id, val: r.tier.value }; }"""
def until(pg, js, timeout=60):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if pg.evaluate(js): return True
        time.sleep(0.25)
    return False
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    for name, vp, mobile, q in [('desktop', {'width': 1280, 'height': 800}, False, '&cam=chase'),
                                ('412x915', {'width': 412, 'height': 915}, True, '&touch=1&cam=cockpit')]:
        ctx = b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile); pg = ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(f'{url}/?debug{q}')
        pg.wait_for_function("!document.getElementById('startBtn').disabled", timeout=120000)
        (pg.tap if mobile else pg.click)('#startBtn'); time.sleep(1)
        (pg.tap if mobile else pg.click)('#selGo'); time.sleep(3)
        info = pg.evaluate("({ open: window.__fh.board.open, n: document.querySelectorAll('#jbCards .jb-card').length, job: !!window.__fh.state.job, offers: window.__fh.board.offers.map(o => `${o.slot}. ${o.from.name} > ${o.to.name} ${o.totalKm.toFixed(1)}km (${o.deadheadKm.toFixed(1)} deadhead) ${o.pay} KDU ${o.tags.join(',')} [${o.pkg}]`) })")
        log.append(f"{name} board at start: open={info['open']} cards={info['n']} job={info['job']}"); log += ['   ' + o for o in info['offers']]
        pg.screenshot(path=f'{D}jobboard-{name}.png')
        # overflow check on cards
        ov = pg.evaluate("[...document.querySelectorAll('.jb-card')].map(c => c.scrollWidth > c.clientWidth + 1 || c.getBoundingClientRect().bottom > innerHeight)")
        log.append(f"{name} card overflow/offscreen: {ov}")
        # reroll + cooldown
        before = pg.evaluate("window.__fh.board.offers.map(o => o.key).join()")
        if mobile: pg.tap('#jbReroll')
        else: pg.keyboard.press('KeyR')
        time.sleep(0.3)
        after = pg.evaluate("window.__fh.board.offers.map(o => o.key).join()")
        cool = pg.evaluate("({ c: window.__fh.board.cool, dis: document.getElementById('jbReroll').disabled, txt: document.getElementById('jbCool').textContent })")
        pg.keyboard.press('KeyR'); time.sleep(0.2)
        again = pg.evaluate("window.__fh.board.offers.map(o => o.key).join()")
        log.append(f"{name} reroll changed={before != after} cooldown={cool} second reroll blocked={again == after}")
        # pause over board
        pg.keyboard.press('KeyP'); time.sleep(0.4)
        log.append(f"{name} pause over board: paused={pg.evaluate('window.__fh.state.paused')} pauseVisible={pg.is_visible('#pause')} pauseOnTop={pg.evaluate('getComputedStyle(document.getElementById(\"pause\")).zIndex')}")
        pg.keyboard.press('KeyP'); time.sleep(0.3)
        # accept card 2
        if mobile: pg.tap('.jb-card[data-slot="2"]')
        else: pg.keyboard.press('Digit2')
        time.sleep(0.5)
        j = pg.evaluate("(() => { const j = window.__fh.state.job; return j && { from: j.from.name, to: j.to.name, reward: j.reward, open: window.__fh.board.open, mission: document.getElementById('missionTarget').textContent, route: window.__fh.ringField.rings.filter(r => r.kind === 'route').length }; })()")
        log.append(f"{name} accepted: {j}")
        # rings in view + fly through
        tier = pg.evaluate(AIM, {'back': 7, 'tier': 'gold' if mobile else None}); time.sleep(2.5)
        pg.evaluate(AIM, {'back': 7, 'tier': 'gold' if mobile else None}); time.sleep(1.2)
        pg.screenshot(path=f'{D}rings-{name}.png')
        t0 = pg.evaluate("window.__fh.state.tokens")
        pg.evaluate(AIM, {'back': 4, 'tier': tier['tier']})
        pg.keyboard.down('KeyW')
        hit = until(pg, f"window.__fh.state.tokens > {t0}", 20)
        pg.keyboard.up('KeyW')
        # headless renders slowly, so hold the newest "+N" pop a quarter of the way in for the screenshot
        pg.evaluate("(() => { const els = [...document.querySelectorAll('.ring-pop')]; const e = els[els.length - 1]; if (!e) return; clearTimeout(e._t); e.style.animation = 'none'; e.style.opacity = 1; e.style.transform = 'translate(-50%, -80%)'; })()")
        pg.screenshot(path=f'{D}rings-pop-{name}.png')
        log.append(f"{name} fly through {tier}: hit={hit} gained={pg.evaluate('window.__fh.state.tokens') - t0} streak={pg.evaluate('window.__fh.ringField.streak')}")
        # near miss: fly beside a ring, should not count
        pg.evaluate("""() => { const f = window.__fh, p = f.state.pos; const r = f.ringField.rings.filter(r => r.alive).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
          const side = { x: r.n.z, z: -r.n.x }, off = r.tier.radius + 1.2;
          p.set(r.x - r.n.x * 4 + side.x * off, r.y, r.z - r.n.z * 4 + side.z * off); f.state.yaw = Math.atan2(r.n.x, r.n.z) + Math.PI; f.state.speed = 0; window.__miss = { r, t: f.state.tokens }; }""")
        pg.keyboard.down('KeyW'); time.sleep(2.5); pg.keyboard.up('KeyW')
        log.append(f"{name} near miss counted={pg.evaluate('window.__fh.state.tokens > window.__miss.t + 0 && window.__miss.r.alive === false')}")
        # deliver: hover at pickup then dropoff, scene, board returns
        for ph in ['pickup', 'dropoff']:
            pg.evaluate("""() => { const f = window.__fh, t = f.target(); f.state.pos.set(t.w.x, f.groundY(t.w.x, t.w.y) + 2, t.w.y); f.state.speed = 0; }""")
            until(pg, f"window.__fh.state.phase !== '{ph}' || !window.__fh.state.job || window.__fh.state.cut", 20)
            if pg.evaluate("!!window.__fh.state.cut"):
                time.sleep(0.6); pg.keyboard.press('KeyX'); until(pg, "!window.__fh.state.cut", 15)
        ok = until(pg, "window.__fh.board.open", 15)
        log.append(f"{name} after delivery: board reopened={ok} job={pg.evaluate('!!window.__fh.state.job')} cards={pg.evaluate('document.querySelectorAll(\".jb-card\").length')} tokens={pg.evaluate('window.__fh.state.tokens')}")
        # skip job from pause menu still works
        pg.keyboard.press('Digit1'); time.sleep(0.3); pg.keyboard.press('KeyP'); time.sleep(0.3)
        (pg.tap if mobile else pg.click)('#newJobBtn'); time.sleep(0.5)
        log.append(f"{name} skip job -> board open={pg.evaluate('window.__fh.board.open')} paused={pg.evaluate('window.__fh.state.paused')} job={pg.evaluate('!!window.__fh.state.job')}")
        rc = pg.evaluate("(() => { const c = {}; for (const r of window.__fh.ringField.rings) if (r.alive) c[r.tier.id] = (c[r.tier.id] || 0) + 1; return c; })()")
        log.append(f"{name} rings alive by tier {rc}; errors {errs}")
        ctx.close()
    b.close()
print('\n'.join(log))
