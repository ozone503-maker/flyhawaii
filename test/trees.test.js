import test from 'node:test';
import assert from 'node:assert/strict';
import { treeAt, treesInCell, TREE_NONE, TREE_FOREST, TREE_PALM, TREE_SHRUB } from '../src/trees.js';

test('imagery decides the kind of tree', () => {
  assert.equal(treeAt({ r: 40, g: 80, b: 40, groundM: 600, lon: -155.2 }).kind, TREE_FOREST);
  assert.equal(treeAt({ r: 40, g: 80, b: 40, groundM: 20, lon: -155.2 }).kind, TREE_PALM);
  assert.equal(treeAt({ r: 30, g: 30, b: 32, groundM: 600, lon: -155.3 }).kind, TREE_NONE); // black lava
  assert.equal(treeAt({ r: 160, g: 130, b: 90, groundM: 300, lon: -155.85 }).kind, TREE_SHRUB);
  assert.equal(treeAt({ r: 40, g: 80, b: 40, groundM: -3, lon: -155.2 }).kind, TREE_NONE); // sea
  assert.equal(treeAt({ r: 40, g: 80, b: 40, groundM: 3500, lon: -155.5 }).kind, TREE_NONE); // above tree line
});

test('a cell always grows the same trees, inside the cell', () => {
  const sample = () => ({ r: 40, g: 90, b: 40, groundM: 500, lon: -155.2 });
  const a = treesInCell(3, -2, 4, 0.6, sample), b = treesInCell(3, -2, 4, 0.6, sample);
  assert.deepEqual(a, b);
  assert.ok(a.length > 10);
  for (const t of a) { assert.ok(t.x >= 12 && t.x < 16 && t.z >= -8 && t.z < -4); }
});
