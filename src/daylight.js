// Time of day on Hawaiʻi Island. Pure math, no three.js: where the sun is for a given hour and
// what the sky, light and fog should look like. Hawaiʻi has no daylight saving (always UTC-10).
// Sun times are tuned for the island (latitude about 19.7 N); they drift with the season.

export const TIME_MODES = ['live', 'day', 'sunset', 'night'];
export const FIXED_HOURS = { day: 11.5, sunset: 17.85, night: 21.5 };

/** Decimal hour in Hawaiʻi for a Date (or now). */
export function hawaiiHour(d = new Date()) {
  return ((d.getUTCHours() - 10 + 24) % 24) + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
}

/** Day of the year (1..366) in Hawaiʻi. */
export function hawaiiDay(d = new Date()) {
  const h = new Date(d.getTime() - 10 * 3600 * 1000);
  return Math.floor((h - Date.UTC(h.getUTCFullYear(), 0, 1)) / 86400000) + 1;
}

/** Sunrise and sunset hours for a day of the year (rough fit for Hilo and Kona). */
export function sunTimes(dayOfYear = 314) {
  const a = (dayOfYear - 172) / 365 * Math.PI * 2; // 0 at the June solstice
  const half = 6.07 + 0.63 * Math.cos(a); // half the day length: about 13.4 h in June, 10.9 h in December
  const B = 2 * Math.PI * (dayOfYear - 81) / 364;
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // minutes the sun runs fast
  const noon = 12 + 20.4 / 60 - eot / 60; // the island sits about 5 degrees west of the UTC-10 meridian
  return { rise: noon - half, set: noon + half, noon };
}

/** Sun elevation and azimuth (radians, azimuth clockwise from north) for an hour. */
export function sunPosition(hour, dayOfYear = 314) {
  const { rise, set, noon } = sunTimes(dayOfYear);
  const decl = 23.44 * Math.sin((dayOfYear - 81) / 365 * Math.PI * 2);
  const maxEl = (90 - 19.7 + decl) * Math.PI / 180;
  const day = set - rise;
  let el;
  if (hour >= rise && hour <= set) el = maxEl * Math.sin(Math.PI * (hour - rise) / day);
  else { // below the horizon: dips to about -40 degrees around midnight
    const h = hour < rise ? hour + 24 : hour, night = 24 - day;
    el = -0.7 * Math.sin(Math.PI * (h - set) / night);
  }
  // rises in the east (south of east in winter), sets in the west, south at noon
  const swing = (90 + decl * 1.1) * Math.PI / 180;
  const u = Math.max(-1, Math.min(1, (hour - noon) / (day / 2)));
  const az = Math.PI + u * (Math.PI - swing);
  return { el, az };
}

const K = [ // keyframes by sun elevation in degrees
  { e: -14, zen: [8, 12, 30], hor: [22, 32, 58], sun: [140, 165, 235], sunI: 0.65, hemiI: 0.65, exp: 1.3, tint: [0.34, 0.4, 0.58], stars: 1, lights: 1 },
  { e: -5, zen: [20, 30, 70], hor: [70, 70, 110], sun: [150, 160, 220], sunI: 0.5, hemiI: 0.7, exp: 1.2, tint: [0.45, 0.47, 0.62], stars: 0.6, lights: 1 },
  { e: 0, zen: [45, 85, 160], hor: [235, 140, 95], sun: [255, 150, 90], sunI: 1.1, hemiI: 0.95, exp: 1.25, tint: [0.85, 0.7, 0.66], stars: 0.1, lights: 0.8 },
  { e: 6, zen: [40, 100, 185], hor: [250, 190, 140], sun: [255, 190, 130], sunI: 1.7, hemiI: 1.2, exp: 1.28, tint: [1.0, 0.86, 0.76], stars: 0, lights: 0.25 },
  { e: 18, zen: [33, 108, 195], hor: [185, 216, 238], sun: [255, 236, 210], sunI: 2.1, hemiI: 1.45, exp: 1.3, tint: [1, 0.97, 0.93], stars: 0, lights: 0 },
  { e: 40, zen: [31, 111, 196], hor: [185, 220, 242], sun: [255, 241, 220], sunI: 2.2, hemiI: 1.5, exp: 1.3, tint: [1, 1, 1], stars: 0, lights: 0 },
];

const mixA = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** Everything the scene needs for a sun elevation (radians). Colors are 0..1 RGB arrays. */
export function skyLook(elRad) {
  const e = elRad * 180 / Math.PI;
  let i = 0; while (i < K.length - 2 && e > K[i + 1].e) i++;
  const a = K[i], b = K[i + 1], t = Math.max(0, Math.min(1, (e - a.e) / (b.e - a.e)));
  const c = (k) => mixA(a[k], b[k], t).map((v) => v / 255);
  const n = (k) => a[k] + (b[k] - a[k]) * t;
  return { zenith: c('zen'), horizon: c('hor'), sunColor: c('sun'), sunI: n('sunI'), hemiI: n('hemiI'), exposure: n('exp'),
    tint: mixA(a.tint, b.tint, t), stars: n('stars'), lights: n('lights'), night: e < 0 };
}

/** The hour to show for a mode ('live' follows the clock in Hawaiʻi). */
export function hourFor(mode, now = new Date()) {
  return mode === 'live' || !(mode in FIXED_HOURS) ? hawaiiHour(now) : FIXED_HOURS[mode];
}
