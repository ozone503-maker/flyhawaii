// Ocean traffic routes: cruise ships between Hilo's pier and the Kailua-Kona anchorage, sport
// fishing boats out of Honokōhau, Kawaihae and Hilo, and a snorkel catamaran to Kealakekua Bay.
// Pure data and path building in lat/lon; the 3D side converts to world units.

// Cruise ships tie up at Hilo Harbor (Kuhio Bay) and anchor off Kailua Pier, sailing around the
// north tip (Upolu Point) well offshore. Waypoints are kept in deep water (see the test).
export const CRUISE_ROUTE = [
  [19.7318, -155.0585], [19.7395, -155.0690], [19.7530, -155.0890], [19.8000, -155.0300], [19.9300, -155.0650],
  [20.0700, -155.2600], [20.1900, -155.5000], [20.3000, -155.7600], [20.3100, -155.9200], [20.1800, -156.0000],
  [19.9500, -156.0400], [19.7800, -156.0800], [19.7000, -156.0900], [19.6450, -156.0450], [19.6360, -156.0060],
];

export const BOAT_ROUTES = [
  { name: 'Honokōhau sport fishing', kind: 'fishing', home: [19.6706, -156.0272],
    pts: [[19.6690, -156.0330], [19.6900, -156.0750], [19.7400, -156.1000], [19.7000, -156.1300], [19.6300, -156.1000], [19.6400, -156.0500]] },
  { name: 'Honokōhau sport fishing', kind: 'fishing', home: [19.6706, -156.0272],
    pts: [[19.6690, -156.0330], [19.6200, -156.0700], [19.5500, -156.0400], [19.5200, -156.0900], [19.6000, -156.1200], [19.6600, -156.0600]] },
  { name: 'Honokōhau sport fishing', kind: 'fishing', home: [19.6706, -156.0272],
    pts: [[19.6690, -156.0330], [19.7300, -156.0700], [19.8100, -156.0900], [19.7800, -156.1400], [19.7000, -156.1100]] },
  { name: 'Kawaihae fishing', kind: 'fishing', home: [20.0370, -155.8340],
    pts: [[20.0380, -155.8420], [20.0600, -155.9000], [20.1200, -155.9300], [20.0200, -155.9600], [19.9800, -155.9000]] },
  { name: 'Hilo fishing', kind: 'fishing', home: [19.7300, -155.0680],
    pts: [[19.7390, -155.0700], [19.7530, -155.0890], [19.7900, -155.0300], [19.8300, -154.9800], [19.7700, -154.9700], [19.7500, -155.0200]] },
  { name: 'Kealakekua snorkel cruise', kind: 'catamaran', home: [19.6390, -155.9985],
    pts: [[19.6360, -156.0060], [19.5800, -155.9950], [19.5200, -155.9780], [19.4700, -155.9560], [19.4770, -155.9360], [19.4700, -155.9560], [19.5200, -155.9800], [19.5900, -155.9980]] },
];

/** Out and back along a route: the forward points then the same points in reverse. */
export function outAndBack(pts) {
  return [...pts, ...pts.slice(1, -1).reverse()];
}

/**
 * Turns lat/lon waypoints into timedPath points. toWorld(lat, lon) -> { x, y } (y is world z).
 * speed in world units per second, holds { index: seconds } pause at those waypoints.
 */
export function seaPoints(latlon, toWorld, speed, holds = {}) {
  return latlon.map(([lat, lon], i) => {
    const w = toWorld(lat, lon);
    return { x: w.x, z: w.y, y: 0, v: speed, hold: holds[i] || 0 };
  });
}
