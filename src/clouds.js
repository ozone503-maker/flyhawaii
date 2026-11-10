// Where the clouds go. Pure placement math, no three.js, so it can be unit tested.
//
// Big Island weather in one paragraph: the trade winds blow from the east-northeast, pile moist air
// against the windward (Hilo, Hāmākua, Puna) slopes and build a cloud band from about 600 to 2200 m.
// Mauna Kea and Mauna Loa poke out above it into clear air. Kona's slopes get their own clouds in
// the afternoon around 600 to 1800 m, Kohala Mountain catches a cap, and small fair-weather
// cumulus drift over the ocean. Heights here are meters; the caller converts to world units.

export const CLOUD_BASE_M = 650;
export const CLOUD_TOP_M = 2300;

/** 0..1: how likely a cloud is over this spot. */
export function cloudWeight({ lat, lon, groundM }) {
  const land = groundM > 0;
  if (!land) return 0.08; // open ocean: sparse fair-weather cumulus
  if (groundM > 2800) return 0; // high summits sit above the cloud band
  const band = (lo, hi) => (groundM >= lo && groundM <= hi ? 1 : groundM < lo ? Math.max(0, 1 - (lo - groundM) / 400) : Math.max(0, 1 - (groundM - hi) / 500));
  const windward = lon > -155.5 || (lat < 19.4 && lon > -155.75) || (lat > 20.0 && lon > -155.8);
  const kona = lon < -155.78 && lat < 19.85;
  const kohalaCap = Math.hypot(lat - 20.08, (lon + 155.72) * 0.94) < 0.09;
  if (kohalaCap) return 0.9 * band(500, 1700);
  if (windward) return 0.95 * band(250, 2300);
  if (kona) return 0.6 * band(450, 1900);
  return 0.18 * band(300, 2000); // leeward saddle and Waikōloa: mostly clear
}

/**
 * Places cloud puffs. Returns [{ x, y, z, s, shade }] in world units, where y is the puff center
 * height, s its size and shade 0..1 (0 = flat gray underside, 1 = sunlit top).
 *   rand: () => 0..1
 *   bounds: { x0, x1, z0, z1 } world rectangle to fill
 *   sample(x, z): { lat, lon, groundM }
 *   unitM: meters per world unit
 *   clusters: how many clouds to try for
 */
export function placeClouds({ rand, bounds, sample, unitM, clusters = 220 }) {
  const out = [];
  let tries = 0;
  while (out.length < clusters * 6 && tries < clusters * 40) {
    tries++;
    const x = bounds.x0 + rand() * (bounds.x1 - bounds.x0), z = bounds.z0 + rand() * (bounds.z1 - bounds.z0);
    const here = sample(x, z);
    if (rand() > cloudWeight(here)) continue;
    const over = here.groundM > 0;
    // cloud base hugs the slope inside the band, floats at a fixed height over flat ground and sea
    const baseM = over ? Math.max(CLOUD_BASE_M, here.groundM + 120 + rand() * 250) : 600 + rand() * 300;
    if (baseM > CLOUD_TOP_M) continue;
    const widthM = over ? 1300 + rand() * 2000 : 700 + rand() * 1100;
    const heightM = Math.min(CLOUD_TOP_M - baseM + 200, widthM * (0.45 + rand() * 0.35));
    const puffs = over ? 6 + Math.floor(rand() * 6) : 4 + Math.floor(rand() * 4);
    for (let k = 0; k < puffs; k++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * widthM * 0.5;
      const up = rand();
      const sM = widthM * (0.35 + rand() * 0.3) * (1 - up * 0.35);
      out.push({
        x: x + Math.cos(a) * r / unitM,
        z: z + Math.sin(a) * r / unitM * 0.7, // trade-wind clouds stretch along the wind
        y: (baseM + sM * 0.35 + up * heightM * 0.7) / unitM,
        s: sM / unitM,
        shade: Math.min(1, 0.35 + up * 0.8),
      });
    }
  }
  return out;
}

/** How deep inside cloud a point is, 0 (clear) to 1 (white-out). puffs as returned above. */
export function cloudDensityAt(puffs, x, y, z) {
  let d = 0;
  for (const p of puffs) {
    const r = p.s * 0.42, dx = x - p.x, dy = (y - p.y) * 1.6, dz = z - p.z;
    const q = (dx * dx + dy * dy + dz * dz) / (r * r);
    if (q < 1) d = Math.max(d, 1 - q);
  }
  return d;
}
