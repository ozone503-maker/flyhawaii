// How loud each place sound should be where the saucer is. Pure, so it can be tested; the
// WebAudio side (game-audio.js ambient()) just follows these numbers.
//   surf: waves on the shore, strongest low over the coast
//   wind: high-altitude wind, grows with height
//   birds: forest birdsong by day
//   coqui: the two-note coquí frogs of Hilo and Puna at night
//   rumble: the low roar near Kīlauea's lava lake
//   rain: showers (rain.js sets wetness)

const clamp = (x) => Math.max(0, Math.min(1, x));

/**
 * agl: height above ground in m. coast: 0..1 how much shoreline is around. forest: 0..1.
 * craterKm: distance to Halemaʻumaʻu. night: 0..1. windward: true on the Hilo and Puna side.
 * wet: 0..1 rain at this spot.
 */
export function ambienceLevels({ agl = 0, coast = 0, forest = 0, craterKm = 99, night = 0, windward = false, wet = 0 }) {
  const low = clamp(1 - agl / 1500); // place sounds fade out by about 1.5 km up
  return {
    surf: clamp(coast * low * 1.1),
    wind: clamp((agl - 400) / 3000) * 0.8 + 0.05,
    birds: clamp(forest * low * (1 - night) * 0.9),
    coqui: clamp(forest * low * night * (windward ? 1 : 0.25)),
    rumble: clamp((1 - craterKm / 8) * (1 - agl / 4000)),
    rain: clamp(wet * (0.4 + low * 0.6)),
  };
}
