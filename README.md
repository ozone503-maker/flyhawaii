# Fly Hawaii

A browser 3D game: fly a classic disc UFO over a true-scale Big Island of Hawaii, run delivery errands for local businesses and earn Kudoken (KDU). Built with Three.js and Vite, no game engine, no paid assets.

Live: https://flyhawaii.vercel.app

Helping out with an AI assistant? Read [AGENTS.md](AGENTS.md) first. It has the code map, the game and style rules, and how to add songs, cutaway clips and businesses.

## Pickup and drop-off places

Every job runs between two real Big Island businesses. See [public/destinations/README.md](public/destinations/README.md) for the list, the ones waiting on a pin, and how to add one.

## Run it locally

Needs Node.js 24 (20 or newer works) and npm.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (node --test)
npm run build      # production build into dist/
npm run preview    # serve dist/ locally
```

Phone testing on your network: `npm run dev -- --host 0.0.0.0`, then open the shown address on the phone.

## Controls

- Keyboard: W / S or arrows fly, A / D turn, Space climbs, Q / F / Ctrl descends, Shift boosts, C switches chase and cockpit view, P or Esc pauses
- Music: M toggles, `,` and `.` change track
- Touch: left thumb anywhere on the left half is the flight pad, right side has climb, descend and boost pads
- Deliveries: hover low and slow inside the amber beacon to beam a package up, then inside the green beacon to drop it off. Arrival scenes play after each pickup and delivery; any key or tap skips them

## Handy URL options

| Option | What it does |
| --- | --- |
| `?cam=cockpit` | Start in the cockpit view |
| `?pilot=drone`, `ipo`, `mj` | Pick a pilot |
| `?touch=1` | Force touch controls on a desktop |
| `?debug` | Exposes `window.__fh` for testing (start or skip a scene, read state) |
| `?debug&clips=/path/clips.json` | Use a test-only clip list |
| `?debug&dest=/path/destinations.json` | Use a test-only destinations list |
| `?vex=2` | Exaggerate terrain height (default 1, true scale) |
| `?ring=N`, `?nochunks` | Terrain chunk streaming radius, or base map only |

## Deploys

Every push to `master` deploys to production on Vercel (project `flyhawaii`). Pull requests get preview deployments.

## Data sources and credits

- Copernicus DEM © DLR/Airbus, provided under COPERNICUS by the EU and ESA (GLO-30)
- Contains modified Copernicus Sentinel data 2025-2026 (Sentinel-2 imagery)
- Bathymetry offshore: AWS Terrain Tiles (Mapzen terrarium: NOAA/ETOPO, SRTM, USGS)
- Rivers, streams, waterfalls and place data: OpenStreetMap contributors (ODbL), baked to `public/terrain/waterways.json`
- Attraction photos: Wikimedia Commons (CC BY, CC BY-SA or public domain), credited on each in-game sign and in `public/photos/CREDITS.md`
- Projection: equirectangular at the map's center latitude, 1 unit = 100 m on all axes

Terrain details: `public/terrain/base-h.png` (16-bit heights, meters + 6000) and `base-sat.jpg` cover the whole island; `public/chunks/` holds 6.4 km high detail chunks streamed around the UFO. `npm run bake` refetches bathymetry and waterways; `scripts/bake-copernicus.mjs` re-chunks the source tiles.

Pickup and drop-off businesses are real Big Island places; coordinates and their sources are in `public/destinations/destinations.json`. Pilot and local portraits are original art made for Fly Hawaii.
