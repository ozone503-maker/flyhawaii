# Checks that job beacons land on the real business coordinates and sit on the ground,
# and screenshots one Kona and one Volcano delivery beacon.
#   npm run build && npx vite preview --port 4180 &
#   python3 scripts/destination-shots.py http://localhost:4180 [kona-farmers-market volcano-farmers-market]
import sys, time, math
from playwright.sync_api import sync_playwright
url = sys.argv[1].rstrip('/'); D = '/workspace/flyhawaii/shots/'
targets = sys.argv[2:] or ['kona-farmers-market', 'volcano-farmers-market']
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
log, errs, warns = [], [], []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: warns.append(m.text) if '[destinations]' in m.text else None)
    pg.goto(f'{url}/?debug&cam=chase')
    pg.wait_for_function("!document.getElementById('startBtn').disabled", timeout=120000)
    pg.click('#startBtn'); time.sleep(1)
    if pg.is_visible('#selGo'): pg.click('#selGo')
    time.sleep(1); pg.keyboard.press('Digit1')
    time.sleep(2)
    log.append(f"loaded {pg.evaluate('window.__fh.destLib.list.length')} destinations: {pg.evaluate('window.__fh.destLib.list.map(d => d.id).join(\", \")')}")
    for tid in targets:
        pg.evaluate("""(tid) => { const f = window.__fh;
          const L = f.destLib.list, to = L.find(d => d.id === tid), from = L.find(d => d.id !== tid);
          f.acceptOffer({ from, to, pkg: 'a test parcel', legKm: 1, pay: 10, tags: [] });
          f.state.phase = 'dropoff'; f.updateMissionText(); const { beaconPick, beaconDrop } = f.beacons; beaconPick.visible = false; beaconDrop.visible = true;
          const t = f.state.job.to; // park the ship 600 m out to sea / downhill, facing the beacon
          const off = t.lon < -155.5 ? [-9, 2.5] : [2.5, 9];
          f.state.pos.set(t.w.x + off[0], 0, t.w.y + off[1]);
          f.state.pos.y = f.groundY(f.state.pos.x, f.state.pos.z) + 5.5;
          f.state.yaw = Math.atan2(off[0], off[1]); f.state.vel?.set?.(0, 0, 0); }""", tid)
        # let terrain chunks around the spot stream in (beacons re-seat on load)
        for _ in range(40):
            time.sleep(1)
            busy = pg.evaluate("(() => { const s = window.__fh.streamer; return s ? (s.pending?.size ?? s.loading?.size ?? 0) : 0; })()")
            if not busy and _ > 6: break
        pg.evaluate("""() => { const f = window.__fh, t = f.state.job.to; f.state.pos.y = f.groundY(f.state.pos.x, f.state.pos.z) + 5.5; }""")
        time.sleep(1.5)
        r = pg.evaluate("""() => { const f = window.__fh, t = f.state.job.to, b = f.beacons.beaconDrop;
          const w = f.toWorld(t.lat, t.lon);
          const gy = f.groundY(b.position.x, b.position.z);
          // world -> metres: 1 unit = 100 m horizontally
          const offM = Math.hypot(b.position.x - w.x, b.position.z - w.y) * 100;
          return { id: t.id, name: t.name, town: t.town, lat: t.lat, lon: t.lon, beaconOffsetM: offM,
            beaconY: b.position.y, groundY: gy, groundElevM: gy * 100, visible: b.visible,
            label: document.getElementById('missionTarget').textContent, step: document.getElementById('missionStep').textContent }; }""")
        log.append(f"{r['id']}: '{r['label']}' | {r['step']} | beacon {r['beaconOffsetM']:.2f} m from listed lat/lon, beacon y {r['beaconY']:.3f} vs ground {r['groundY']:.3f} (terrain {r['groundElevM']:.0f} m)")
        pg.screenshot(path=f"{D}destination-{tid}.png")
    log.append(f'errors {errs}  destination warnings {warns}')
    b.close()
print('\n'.join(log))
