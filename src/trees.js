// Which trees grow where, read from the island imagery. Pure, no three.js.
// Kinds: 0 none, 1 forest canopy (ʻōhiʻa, koa, rainforest), 2 coconut palm, 3 dry-land shrub/kiawe.

export const TREE_NONE = 0, TREE_FOREST = 1, TREE_PALM = 2, TREE_SHRUB = 3;

/** rgb 0..255 from the imagery, groundM in meters, lon for the dry leeward coast. Returns { kind, density 0..1 }. */
export function treeAt({ r, g, b, groundM, lon }) {
  if (groundM <= 1 || groundM > 2900) return { kind: TREE_NONE, density: 0 };
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0, light = mx / 255;
  const green = g > r * 1.04 && g >= b;
  if (groundM < 45 && (green || lon < -155.75)) return { kind: TREE_PALM, density: green ? 0.55 : 0.25 };
  if (light < 0.2 && sat < 0.25) return { kind: TREE_NONE, density: 0 }; // fresh black lava
  if (light > 0.62 && sat < 0.18) return { kind: TREE_NONE, density: 0 }; // towns, roads, bare rock
  if (green) {
    const lush = Math.min(1, Math.max(0, (g - r) / 40 + 0.3)) * (light < 0.5 ? 1 : 0.6);
    return { kind: TREE_FOREST, density: Math.min(1, lush) * (groundM > 2300 ? 0.3 : 1) };
  }
  // brown and gold dry country (leeward Kohala, Waikōloa, Kaʻū): scattered kiawe and shrubs
  if (r > g && light > 0.25) return { kind: TREE_SHRUB, density: 0.18 };
  return { kind: TREE_NONE, density: 0 };
}

function hash(a, b, c) { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

/**
 * Trees in one square cell of the world, always the same for the same cell.
 * sample(x, z) -> { r, g, b, groundM, lon }. Returns [{ x, z, kind, s, c }] with s a size factor
 * and c a 0..1 color jitter.
 */
export function treesInCell(cx, cz, cellU, spacingU, sample) {
  const out = [], n = Math.max(1, Math.round(cellU / spacingU));
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const h1 = hash(cx * 97 + i, cz * 89 + j, 1), h2 = hash(cx * 97 + i, cz * 89 + j, 2), h3 = hash(cx * 97 + i, cz * 89 + j, 3);
    const x = (cx + (i + h1) / n) * cellU, z = (cz + (j + h2) / n) * cellU;
    const t = treeAt(sample(x, z));
    if (t.kind === TREE_NONE || h3 > t.density) continue;
    out.push({ x, z, kind: t.kind, s: 0.75 + hash(i, j, cx + cz) * 0.6, c: hash(j, i, cx - cz) });
  }
  return out;
}
