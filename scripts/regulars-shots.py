# Phone-size shots of the greeter pop-up and a job board with regulars.
#   npm run build && npx vite preview --port 4182 --strictPort
#   python3 scripts/regulars-shots.py http://localhost:4182
import sys, time, os
from playwright.sync_api import sync_playwright
url = sys.argv[1].rstrip('/')
D = os.environ.get('FH_SHOTS', '/workspace/flyhawaii/shots/')
os.makedirs(D, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
log = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    ctx = b.new_context(viewport={'width': 412, 'height': 915}, is_mobile=True, has_touch=True, device_scale_factor=2)
    pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(f'{url}/?debug&touch=1&cam=cockpit')
    pg.wait_for_function("!document.getElementById('startBtn').disabled", timeout=120000)
    pg.tap('#startBtn'); time.sleep(0.8)
    pg.tap('#selGo'); time.sleep(2.5)
    spawn = pg.evaluate("""() => {
      const f = window.__fh, pad = f.startCoords(f.destLib.list);
      const w = f.toWorld(pad.lat, pad.lon);
      return { fromHq: pad.fromHq, id: pad.id, dx: Math.hypot(f.state.pos.x - w.x, f.state.pos.z - w.y), board: f.board.open };
    }""")
    log.append(f"spawn {spawn}")
    shown = pg.evaluate("""() => {
      const f = window.__fh;
      document.getElementById('jobBoard').classList.add('hidden');
      document.body.classList.remove('jobboard');
      f.board.open = false;
      f.setRegulars({ v: 1, counts: { 'flashtown-hq': 16, 'kona-farmers-market': 8, 'volcano-house': 3 } });
      const biz = f.destLib.list.find(d => d.id === 'flashtown-hq');
      return f.showGreeter(biz, 'delivery', () => {});
    }""")
    time.sleep(0.5)
    vis = pg.evaluate("""() => ({ hidden: document.getElementById('greeter').classList.contains('hidden'), name: document.getElementById('grName').textContent, tier: document.getElementById('grTier').innerText, line: document.getElementById('grLine').textContent })""")
    log.append(f"greeter shown={shown} {vis}")
    pg.screenshot(path=os.path.join(D, 'greeter-412x915.png'))
    pg.evaluate("window.__fh.dismissGreeter()")
    time.sleep(0.3)
    info = pg.evaluate("""() => {
      const f = window.__fh;
      f.setRegulars({ v: 1, counts: { 'kona-farmers-market': 16, 'volcano-house': 8, 'hilo-farmers-market': 3, 'flashtown-hq': 16 } });
      f.shift.jobs = 2; f.shift.kdu = 140; f.shift.tips = 28;
      const here = { lat: 19.48148, lon: -155.098468 };
      f.board.offers = f.makeOffers(f.destLib.list, here, Math.random, { regulars: f.regulars, specialChance: 1 });
      f.board.open = true;
      f.renderJobBoard();
      document.getElementById('jobBoard').classList.remove('hidden');
      document.body.classList.add('jobboard');
      return {
        cards: document.querySelectorAll('#jbCards .jb-card').length,
        special: [...document.querySelectorAll('.jb-card.special')].map(c => c.querySelector('.jb-tag.special')?.textContent),
        pips: document.querySelectorAll('.jb-pips').length,
        home: document.getElementById('jbHome')?.textContent,
        homeHidden: document.getElementById('jbHome')?.classList.contains('hidden'),
        offers: f.board.offers.map(o => ({ key: o.key, pay: o.pay, special: !!o.special, from: o.fromTier?.id, to: o.toTier?.id })),
      };
    }""")
    log.append(f"board {info}")
    time.sleep(0.3)
    pg.screenshot(path=os.path.join(D, 'jobboard-regulars-412x915.png'))
    log.append(f"errors {errs}")
    ctx.close(); b.close()
print('\n'.join(log))
