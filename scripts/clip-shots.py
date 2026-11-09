# Thank-you clip overlay screenshots + checks, using the test-only manifest.
# Serve a build that has test/fixtures/clips copied to /clips-test, then:
#   python3 scripts/clip-shots.py http://localhost:4174
import sys, time
from playwright.sync_api import sync_playwright
url = sys.argv[1].rstrip('/'); D = '/workspace/flyhawaii/shots/'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
BLOCK_SOUND = """(() => { const real = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { if (this.tagName === 'VIDEO' && !this.muted) return Promise.reject(new DOMException('blocked', 'NotAllowedError')); return real.call(this); }; })();"""
log = []
def fly(pg, mobile):
    pg.wait_for_function("!document.getElementById('startBtn').disabled", timeout=90000)
    (pg.tap if mobile else pg.click)('#startBtn'); time.sleep(1)
    if pg.is_visible('#selGo'): (pg.tap if mobile else pg.click)('#selGo')
    time.sleep(4)
def deliver(pg):
    pg.wait_for_function("window.__fh.clipLib.list.length > 0", timeout=20000)
    pg.evaluate("""() => { const f = window.__fh; const from = f.state.tokens; f.state.tokens += 150;
      f.startCutscene('delivery', { fromTokens: from, toTokens: f.state.tokens }); }""")
def vt(pg): return pg.evaluate("document.getElementById('clipVideo').currentTime")
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    for name, vp, mobile, q, cam, pilot, block in [
        ('desktop', {'width': 1280, 'height': 800}, False, '', 'chase', 'drone', False),
        ('412x915', {'width': 412, 'height': 915}, True, '&touch=1', 'cockpit', 'ipo', False),
        ('412x915-muted', {'width': 412, 'height': 915}, True, '&touch=1', 'chase', 'mj', True),
    ]:
        ctx = b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile)
        if block: ctx.add_init_script(BLOCK_SOUND)
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: log.append('ERR ' + str(e)))
        pg.goto(f'{url}/?debug&clips=/clips-test/clips.json&cam={cam}&pilot={pilot}{q}'); fly(pg, mobile)
        vol0 = pg.evaluate("window.__fh.cdPlayer.getVolume()")
        deliver(pg)
        pg.wait_for_function("window.__fh.state.cut?.clip?.phase === 'playing' && document.getElementById('clipVideo').currentTime > 1.2", timeout=60000)
        pg.screenshot(path=f'{D}clip-overlay-{name}.png')
        k = pg.evaluate("({ id: window.__fh.state.cut.clip.clip.id, muted: document.getElementById('clipVideo').muted, ducked: window.__fh.cdPlayer.isDucked(), sound: !document.getElementById('clipSound').hidden, t: window.__fh.state.cut.clock.t })")
        log.append(f'{name} playing {k}')
        # pause freezes video and clock
        (pg.tap if mobile else pg.click)('#pauseBtn'); time.sleep(0.3); a = vt(pg); time.sleep(1); c = vt(pg)
        log.append(f'{name} paused video frozen={abs(c - a) < 0.01}')
        (pg.tap if mobile else pg.click)('#resumeBtn'); time.sleep(0.5)
        log.append(f'{name} resumed video moving={vt(pg) > c}')
        if block:
            pg.tap('#clipSound'); time.sleep(0.4)
            log.append(f"{name} after sound tap muted={pg.evaluate('document.getElementById(\"clipVideo\").muted')} still in clip={pg.evaluate('window.__fh.state.cut?.clip?.phase')}")
        if name == 'desktop':
            pg.wait_for_function("!window.__fh.state.cut || window.__fh.state.cut.clip.phase === 'done'", timeout=30000)
            time.sleep(0.6); pg.screenshot(path=f'{D}clip-after-coins-{name}.png')
            log.append(f'{name} clip ended naturally: {pg.evaluate("window.__fh.state.cut?.clip?.why")}')
        else:
            pg.keyboard.press('KeyX') if not mobile else pg.tap('#hud', position={'x': 30, 'y': 450}, force=True)
            time.sleep(0.3)
            log.append(f"{name} skip during clip -> {pg.evaluate('window.__fh.state.cut?.clip?.why')}, coins still to fly={pg.evaluate('!!window.__fh.state.cut')}")
        pg.wait_for_function("!window.__fh.state.cut", timeout=30000)
        log.append(f"{name} end: tokens shown={pg.inner_text('#tokenCount')} ducked={pg.evaluate('window.__fh.cdPlayer.isDucked()')} vol={pg.evaluate('window.__fh.cdPlayer.getVolume()')}/{vol0} overlay hidden={pg.evaluate('document.getElementById(\"clipFx\").hidden')}")
        # second delivery should pick the other clip
        deliver(pg); pg.wait_for_function("window.__fh.state.cut?.clip", timeout=5000)
        log.append(f"{name} next clip={pg.evaluate('window.__fh.state.cut.clip.clip.id')}")
        ctx.close()
    b.close()
print('\n'.join(log))
