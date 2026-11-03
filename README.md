# Fly Hawaii (prototype)

Three.js + Vite. Fly a UFO over a true-scale Big Island, deliver packages, earn Kudoken (KDU).

- `npm run bake` refetches bathymetry and OSM waterways; `node scripts/bake-copernicus.mjs` (CH_TILES=path to cartoon-hawaii public/maps/tiles) re-chunks the Copernicus/Sentinel tiles
- `npm run dev` / `npm run build`
- `?debug=1` exposes `window.__fh` for testing, `?vex=2` doubles vertical scale (default 1 = true scale), `?ring=N` sets the chunk ring, `?nochunks` shows only the base

Terrain streaming
- Whole-island base: public/terrain/base-h.png (1024x1024 16-bit, meters + 6000, about 160 m/cell; GLO-30 averaged on land, terrarium bathymetry offshore) and base-sat.jpg (2048x2048 Sentinel-2 mosaic)
- Near the UFO: public/chunks/h-X-Y.png (16-bit gray meters, 6.4 km chunks sampled every 50 m from 12.5 m/px GLO-30, 1-sample border for seamless normals) plus s-X-Y.jpg Sentinel-2 imagery at 12.5 m/px. 3x3 chunks on phones, 5x5 on desktop, max 3 fetches at once; the base sinks under fully covered ground
- 16-bit PNGs are decoded in the browser (src/height-png.js, ported from cartoon-hawaii) since browsers downsample to 8 bit

Data sources and credits
- Copernicus DEM © DLR/Airbus, provided under COPERNICUS by the EU and ESA (GLO-30)
- Contains modified Copernicus Sentinel data 2025-2026 (Sentinel-2 imagery)
- Both preprocessed into 4096 px tiles in the cartoon-hawaii repo (public/maps/tiles), read only here
- Bathymetry offshore: AWS Terrain Tiles (Mapzen terrarium, z11: NOAA/ETOPO, SRTM, USGS)
- Rivers, streams, waterfalls: OpenStreetMap contributors (ODbL) via Overpass API, baked to public/terrain/waterways.json
- Landmark and town coordinates: OpenStreetMap / Nominatim / Wikipedia; summits snapped to the DEM high point, labeled with official elevations. Ka Lae 18.9111, -155.6811 (Wikipedia/GNIS; GLO-30 southernmost land pixel 18.91108, -155.68196)
- Projection: equirectangular at the map's center latitude, 1 unit = 100 m on all axes

Attraction photo signs
- 15 zones in public/photos/attractions.json (true coordinates, radius in km). Each photo stands in the world as a small sign (about 220 m wide, bottom edge about 12 m above the highest ground under it) at the landmark, turning to face the camera and fading in from about 2x radius + 3 km. Name and photo credit are printed on the sign
- Entering a zone the first time gives +25 KDU, a small non-blocking note and counts toward Discovered N/15 (localStorage fh_found)
- Photos are lazy-loaded only within about 2x radius + 3 km of a zone, each 150-240 KB
- Every photo is from Wikimedia Commons (CC BY, CC BY-SA or public domain); author, license and source per photo in public/photos/CREDITS.md and on each sign

Shelved co-pilot
- The scripted co-pilot was removed from the game. Its script and bake tools are kept out of the build in voice-src/ and scripts/ (bake-voice.sh, voice-prep.py) in case it comes back
## Pilots and ships

After Start a pilot select screen appears. The choice is saved on the device (`localStorage.fh_pilot`, or `?pilot=drone|ipo|mj`) and can be changed from the pause menu.

| Pilot | Ship | Feel |
| --- | --- | --- |
| Mystery Drone | Cyan Ring Drone | Sharpest turns (turn x1.18, boost x0.94) |
| Ipo | Fruity Puppy Cruiser | All round, best climb (turn x1.05, boost x1.02, climb x1.1) |
| Monkey Jockey | MJ Racer | Fastest boost, wider turns (boost x1.14, turn x0.9) |

Ships are built in `src/ships.js`. Pilot portraits (`public/pilots/`) are original AI art made for Fly Hawaii from the owner's character references, with no helmets or hats. Sources are in `art/pilots/`.
