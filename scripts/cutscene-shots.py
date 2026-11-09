# Mid-cutscene screenshots + behavior checks. Usage: python3 scripts/cutscene-shots.py URL [suffix]
import sys, time, json
from playwright.sync_api import sync_playwright
url = sys.argv[1].rstrip('/'); suf = sys.argv[2] if len(sys.argv) > 2 else ''
D = '/workspace/flyhawaii/shots/'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
log = []
def fly(pg, mobile):
    pg.wait_for_function("!document.getElementById('startBtn').disabled", timeout=90000)
    (pg.tap if mobile else pg.click)('#startBtn'); time.sleep(1)
    if pg.is_visible('#selGo'): (pg.tap if mobile else pg.click)('#selGo')
    time.sleep(4)
def wait_t(pg, t):
    pg.wait_for_function(f"!window.__fh.state.cut || window.__fh.state.cut.clock.t >= {t}", timeout=60000)
def start(pg, kind):
    pg.evaluate("""k => { const f = window.__fh; const from = f.state.tokens;
      if (k === 'delivery') f.state.tokens += 128;
      f.startCutscene(k, { fromTokens: from, toTokens: f.state.tokens }); }""", kind)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    for name, vp, mobile, q, cam, pilot in [
        ('desktop', {'width': 1280, 'height': 800}, False, '', 'chase', 'drone'),
        ('desktop-cockpit', {'width': 1280, 'height': 800}, False, '', 'cockpit', 'mj'),
        ('412x915', {'width': 412, 'height': 915}, True, '&touch=1', 'cockpit', 'ipo'),
    ]:
        ctx = b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile)
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: log.append('ERR ' + str(e)))
        pg.goto(f'{url}/?debug&cam={cam}&pilot={pilot}{q}'); fly(pg, mobile)
        if name == '412x915':
            pg.screenshot(path=f'{D}cockpit-412x915-v3{suf}.png')
        # delivery: beam beat, then burst + coins beat
        start(pg, 'delivery'); wait_t(pg, 1.45)
        pg.screenshot(path=f'{D}cutscene-delivery-beam-{name}{suf}.png')
        wait_t(pg, 2.95)
        pg.screenshot(path=f'{D}cutscene-delivery-coins-{name}{suf}.png')
        pg.wait_for_function("!window.__fh.state.cut", timeout=60000)
        log.append(f"{name} delivery ended, tokens shown={pg.inner_text('#tokenCount')} state={pg.evaluate('window.__fh.state.tokens')}")
        # pickup beat
        start(pg, 'pickup'); wait_t(pg, 1.6)
        pg.screenshot(path=f'{D}cutscene-pickup-{name}{suf}.png')
        # pause mid-scene: clock must freeze, then resume and skip by key/tap
        (pg.tap if mobile else pg.click)('#pauseBtn'); time.sleep(0.2)
        t0 = pg.evaluate('window.__fh.state.cut.clock.t'); time.sleep(1.2); t1 = pg.evaluate('window.__fh.state.cut.clock.t')
        log.append(f'{name} paused clock frozen={abs(t1 - t0) < 1e-6}')
        (pg.tap if mobile else pg.click)('#resumeBtn'); time.sleep(0.3)
        if mobile: pg.tap('#hud', position={'x': 200, 'y': 300}, force=True)
        else: pg.keyboard.press('KeyX')
        pg.wait_for_function("!window.__fh.state.cut", timeout=20000)
        bc = pg.evaluate('document.body.className'); td = pg.evaluate("getComputedStyle(document.getElementById('touch')).display")
        log.append(f"{name} skipped ok, body classes='{bc}' touch display={td}")
        if not mobile:
            pg.keyboard.down('KeyW'); time.sleep(1.5); pg.keyboard.up('KeyW')
            log.append(f"{name} control after: speed={pg.evaluate('window.__fh.state.speed'):.2f}")
        ctx.close()
    b.close()
print('\n'.join(log))
