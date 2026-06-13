import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EDGES,
  NEIGHBOR,
  exteriorEdges,
  sanitizeOpenings,
  interiorEdges,
} from '../src/data/wall-edges.js';

test('EDGES lists the four grid directions', () => {
  assert.deepEqual([...EDGES].sort(), ['E', 'N', 'O', 'S']);
});

test('NEIGHBOR maps an edge to the neighbour offset', () => {
  assert.deepEqual(NEIGHBOR.N(2, 3), [2, 2]);
  assert.deepEqual(NEIGHBOR.S(2, 3), [2, 4]);
  assert.deepEqual(NEIGHBOR.E(2, 3), [3, 3]);
  assert.deepEqual(NEIGHBOR.O(2, 3), [1, 3]);
});

test('exteriorEdges returns edges whose neighbour is absent', () => {
  const cellset = new Set(['0,0']);
  assert.deepEqual(exteriorEdges(0, 0, cellset).sort(), ['E', 'N', 'O', 'S']);
});

test('exteriorEdges excludes edges with a present neighbour', () => {
  const cellset = new Set(['0,0', '1,0']);
  assert.deepEqual(exteriorEdges(0, 0, cellset).sort(), ['N', 'O', 'S']);
});

test('sanitizeOpenings keeps only valid exterior openings', () => {
  const cellset = new Set(['0,0', '1,0']);
  const input = [
    { c: 0, r: 0, edge: 'N', kind: 'door' },
    { c: 0, r: 0, edge: 'E', kind: 'window' },
    { c: 5, r: 5, edge: 'N', kind: 'door' },
    { c: 0, r: 0, edge: 'X', kind: 'door' },
    { c: 0, r: 0, edge: 'S', kind: 'gate' },
    { c: 1, r: 0, edge: 'N', kind: 'window' },
  ];
  assert.deepEqual(sanitizeOpenings(input, cellset), [
    { c: 0, r: 0, edge: 'N', kind: 'door' },
    { c: 1, r: 0, edge: 'N', kind: 'window' },
  ]);
});

test('sanitizeOpenings dedupes per (c,r,edge) keeping the first', () => {
  const cellset = new Set(['0,0']);
  const input = [
    { c: 0, r: 0, edge: 'N', kind: 'door' },
    { c: 0, r: 0, edge: 'N', kind: 'window' },
  ];
  assert.deepEqual(sanitizeOpenings(input, cellset), [
    { c: 0, r: 0, edge: 'N', kind: 'door' },
  ]);
});

test('sanitizeOpenings tolerates non-array input', () => {
  assert.deepEqual(sanitizeOpenings(undefined, new Set(['0,0'])), []);
  assert.deepEqual(sanitizeOpenings(null, new Set(['0,0'])), []);
});

test('interiorEdges returns edges whose neighbour IS a floor cell', () => {
  const cellset = new Set(['0,0', '1,0']);
  assert.deepEqual(interiorEdges(0, 0, cellset).sort(), ['E']);
  assert.deepEqual(interiorEdges(1, 0, cellset).sort(), ['O']);
});

test('interiorEdges returns empty for an isolated cell', () => {
  assert.deepEqual(interiorEdges(0, 0, new Set(['0,0'])), []);
});
