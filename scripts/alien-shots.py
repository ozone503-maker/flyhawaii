# Headless screenshots of the alien cockpit UI. Usage: python3 scripts/alien-shots.py URL [suffix]
import sys, time
from playwright.sync_api import sync_playwright
url = sys.argv[1].rstrip('/'); suf = sys.argv[2] if len(sys.argv) > 2 else ''
D = '/workspace/flyhawaii/shots/'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
def fly(pg, mobile):
    pg.wait_for_function("!document.getElementById('startBtn').disabled", timeout=90000)
    (pg.tap if mobile else pg.click)('#startBtn'); time.sleep(1)
    if pg.is_visible('#selGo'): (pg.tap if mobile else pg.click)('#selGo')
    time.sleep(5)
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    for name, vp, mobile, q in [
        ('desktop', {'width': 1280, 'height': 800}, False, ''),
        ('412x915', {'width': 412, 'height': 915}, True, '&touch=1'),
    ]:
        for cam in ['cockpit', 'chase']:
            ctx = b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile, device_scale_factor=1)
            pg = ctx.new_page()
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
            pilot = 'ipo' if mobile else 'drone'
            pg.goto(f'{url}/?cam={cam}&pilot={pilot}{q}')
            fly(pg, mobile)
            time.sleep(1.5); errs.append(cam+name+' playing=' + str(pg.get_attribute('#cdPlay','aria-pressed')))
            pg.screenshot(path=f'{D}alien-{cam}-{name}{suf}.png')
            if cam == 'cockpit' and not mobile:
                pg.click('#pauseBtn'); time.sleep(0.8)
                pg.screenshot(path=f'{D}alien-pause-{name}{suf}.png')
            if cam == 'chase' and mobile:
                pg.tap('#cdDisc'); time.sleep(0.8)
                pg.screenshot(path=f'{D}alien-chase-{name}-crystal-open{suf}.png')
            ctx.close()
    b.close()
print('errors:', errs[:10])
