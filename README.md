# Fly Hawaii (prototype)

Three.js + Vite. Fly a UFO over a true-scale Big Island, deliver packages, earn Kudoken (KDU).

- `npm run bake` refetches data (skips if already baked, add `--force` to the scripts to refresh)
- `npm run dev` / `npm run build`
- `?debug=1` exposes `window.__fh` for testing, `?vex=2` doubles vertical scale (default 1 = true scale)

Data sources
- Elevation and bathymetry: AWS Terrain Tiles (Mapzen terrarium, z11), which blends USGS 3DEP/NED, SRTM and NOAA/ETOPO bathymetry. Baked to public/terrain/height.bin (1024x1024, about 160 m per cell)
- Rivers, streams, waterfalls: OpenStreetMap contributors (ODbL) via Overpass API, baked to public/terrain/waterways.json
- Landmark and town coordinates: OpenStreetMap / Nominatim; summits snapped to the DEM high point
- Projection: equirectangular at the map's center latitude, 1 unit = 100 m on all axes
