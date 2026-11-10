// Landmark data and placement math for the 3D island details. Pure, no three.js.
// Coordinates: OpenStreetMap / Wikipedia. Sizes in meters; the 3D side converts to world units.

// Towns that get little 3D buildings. r = rough radius of the built-up area in km.
export const TOWN_AREAS = [
  { name: 'Hilo', lat: 19.7090, lon: -155.0800, r: 3.6, n: 950 },
  { name: 'Kailua-Kona', lat: 19.6370, lon: -155.9890, r: 2.8, n: 650 },
  { name: 'Keauhou', lat: 19.5640, lon: -155.9600, r: 1.6, n: 220 },
  { name: 'Waimea', lat: 20.0230, lon: -155.6700, r: 2.0, n: 260 },
  { name: 'Waikōloa Village', lat: 19.9290, lon: -155.7880, r: 1.6, n: 220 },
  { name: 'Captain Cook', lat: 19.4970, lon: -155.9200, r: 1.6, n: 160 },
  { name: 'Keaʻau', lat: 19.6230, lon: -155.0380, r: 1.2, n: 140 },
  { name: 'Pāhoa', lat: 19.4970, lon: -154.9460, r: 0.9, n: 90 },
  { name: 'Volcano', lat: 19.4300, lon: -155.2360, r: 1.3, n: 110 },
  { name: 'Mountain View', lat: 19.5500, lon: -155.1100, r: 0.9, n: 70 },
  { name: 'Honokaʻa', lat: 20.0790, lon: -155.4670, r: 0.8, n: 90 },
  { name: 'Hāwī', lat: 20.2410, lon: -155.8330, r: 0.7, n: 60 },
  { name: 'Kapaʻau', lat: 20.2330, lon: -155.8000, r: 0.6, n: 45 },
  { name: 'Nāʻālehu', lat: 19.0610, lon: -155.5860, r: 0.7, n: 55 },
  { name: 'Pāhala', lat: 19.2030, lon: -155.4790, r: 0.6, n: 45 },
];

// Mauna Kea observatories (lat, lon, dome diameter in m, white or silver)
export const OBSERVATORIES = [
  { name: 'Keck I', lat: 19.82636, lon: -155.47475, d: 37 },
  { name: 'Keck II', lat: 19.82659, lon: -155.47394, d: 37 },
  { name: 'Subaru', lat: 19.82550, lon: -155.47602, d: 40, cyl: true },
  { name: 'NASA IRTF', lat: 19.82618, lon: -155.47204, d: 20 },
  { name: 'CFHT', lat: 19.82530, lon: -155.46888, d: 33 },
  { name: 'Gemini North', lat: 19.82381, lon: -155.46902, d: 35 },
  { name: 'UH 2.2 m', lat: 19.82303, lon: -155.46942, d: 25 },
  { name: 'UKIRT', lat: 19.82245, lon: -155.47030, d: 24 },
  { name: 'JCMT', lat: 19.82280, lon: -155.47700, d: 30, cyl: true },
];

// Halemaʻumaʻu crater inside Kīlauea caldera: the lava glow and the vog plume rise from here
export const HALEMAUMAU = { lat: 19.4072, lon: -155.2840, lakeM: 380, plumeM: 1600 };

// Real drop heights in meters (the elevation grid is too smooth to measure a cliff)
const FALL_M = { akaka: 135, kahuna: 100, rainbow: 24, hiilawe: 442, hakalaoa: 400, nanaue: 300, waiilikahi: 320,
  kulaniapia: 37, peepee: 30, onomea: 30, kawainui: 60, wailoa: 50, waiale: 25, ipuu: 250, hilalawe: 90 };
export function fallHeightM(name) {
  const k = String(name || '').normalize('NFD').replace(/[^a-z]/gi, '').toLowerCase();
  for (const [key, m] of Object.entries(FALL_M)) if (k.includes(key)) return m;
  return 60;
}

// Snow line for Mauna Kea and Mauna Loa (it is often white up top from November to March)
export const SNOW_LINE_M = 3750;

/**
 * Places buildings around towns. sample(x, z) -> { groundM, slope, urban } where slope is
 * rise over run and urban 0..1 says how built-up the imagery looks. Returns
 * [{ x, z, w, d, h, rot, roof }] with sizes in meters and roof an index into a palette.
 */
export function placeBuildings({ rand, towns, toWorld, sample, unitM, scale = 1 }) {
  const out = [];
  for (const t of towns) {
    const c = toWorld(t.lat, t.lon);
    const want = Math.round(t.n * scale);
    let got = 0, tries = 0;
    while (got < want && tries < want * 25) {
      tries++;
      // denser toward the middle of town
      const a = rand() * Math.PI * 2, r = Math.pow(rand(), 0.75) * t.r * 1000;
      const x = c.x + Math.cos(a) * r / unitM, z = c.y + Math.sin(a) * r / unitM;
      const s = sample(x, z);
      if (s.groundM <= 1 || s.slope > 0.35) continue;
      if (rand() > 0.25 + s.urban * 0.75) continue;
      const big = rand() < 0.08;
      out.push({
        x, z,
        w: big ? 30 + rand() * 40 : 10 + rand() * 12,
        d: big ? 20 + rand() * 30 : 8 + rand() * 10,
        h: big ? 8 + rand() * 10 : 4 + rand() * 3,
        rot: rand() * Math.PI,
        roof: Math.floor(rand() * 6),
      });
      got++;
    }
  }
  return out;
}

/**
 * Where a waterfall drops: looks around the mapped point for the steepest fall and returns
 * { topM, baseM, dirX, dirZ } (dir points from the cliff out over the drop). elevM in meters.
 */
export function fallDrop(x, z, elevM, stepUnits = 1.5) {
  let best = { drop: 0, topM: elevM(x, z), baseM: elevM(x, z), dirX: 1, dirZ: 0 };
  for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
    const up = elevM(x - dx * stepUnits, z - dz * stepUnits), down = elevM(x + dx * stepUnits * 2, z + dz * stepUnits * 2);
    if (up - down > best.drop) best = { drop: up - down, topM: up, baseM: down, dirX: dx, dirZ: dz };
  }
  return best;
}
