import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

import {
  loadCustomFloors,
  loadCustomRoomDir,
  sanitizeFloors,
  sanitizeRoomDefinition,
  saveCustomFloors,
  saveCustomRoomDir,
} from '../src/data/floor-store.js';

const STORAGE_KEY = 'panorama.customFloors.v1';

beforeEach(() => {
  const values = new Map();
  globalThis.localStorage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
});

function oneFloor(name = 'Main room') {
  return [{ name, cells: [[0, 0], [1, 0]], seats: [[1, 0]], openings: [] }];
}

test('room definition stores sanitized floors and rotation direction together', () => {
  const clean = sanitizeRoomDefinition({
    v: 1,
    dir: 2,
    floors: oneFloor('  Main room  '),
  });

  assert.deepEqual(clean, {
    dir: 2,
    floors: [{ name: 'Main room', cells: [[0, 0], [1, 0]], seats: [[1, 0]], openings: [] }],
  });
});

test('room definition defaults invalid or missing rotation to zero', () => {
  assert.equal(sanitizeRoomDefinition({ v: 1, dir: 8, floors: oneFloor() }).dir, 0);
  assert.equal(sanitizeRoomDefinition({ v: 1, floors: oneFloor() }).dir, 0);
});

test('saving room rotation updates the persisted room definition without dropping layout', () => {
  saveCustomFloors(oneFloor(), 3);
  saveCustomRoomDir(1);

  assert.equal(loadCustomRoomDir(), 1);
  assert.deepEqual(loadCustomFloors(), oneFloor());

  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
  assert.equal(stored.dir, 1);
  assert.deepEqual(stored.floors, oneFloor());
});

test('saving room rotation can create a room definition from current floors', () => {
  saveCustomRoomDir(2, oneFloor('Default room'));

  assert.equal(loadCustomRoomDir(), 2);
  assert.deepEqual(loadCustomFloors(), oneFloor('Default room'));
});

test('sanitizeFloors keeps valid openings and drops invalid ones', () => {
  const floors = sanitizeFloors([
    {
      name: 'Room',
      cells: [[0, 0], [1, 0]],
      seats: [[1, 0]],
      openings: [
        { c: 0, r: 0, edge: 'N', kind: 'door' },
        { c: 0, r: 0, edge: 'E', kind: 'window' },
        { c: 9, r: 9, edge: 'N', kind: 'door' },
      ],
    },
  ]);
  assert.deepEqual(floors[0].openings, [{ c: 0, r: 0, edge: 'N', kind: 'door' }]);
});

test('sanitizeFloors defaults missing openings to an empty array', () => {
  const floors = sanitizeFloors([{ name: 'Room', cells: [[0, 0]], seats: [] }]);
  assert.deepEqual(floors[0].openings, []);
});

test('room definition accepts both v1 and v2', () => {
  const v1 = sanitizeRoomDefinition({ v: 1, dir: 0, floors: oneFloor() });
  assert.ok(v1);
  assert.deepEqual(v1.floors[0].openings, []);

  const v2 = sanitizeRoomDefinition({
    v: 2,
    dir: 1,
    floors: [{ name: 'R', cells: [[0, 0]], seats: [], openings: [{ c: 0, r: 0, edge: 'N', kind: 'window' }] }],
  });
  assert.equal(v2.dir, 1);
  assert.deepEqual(v2.floors[0].openings, [{ c: 0, r: 0, edge: 'N', kind: 'window' }]);
});

test('saveCustomFloors persists openings under v2', () => {
  saveCustomFloors([
    { name: 'R', cells: [[0, 0], [1, 0]], seats: [], openings: [{ c: 0, r: 0, edge: 'N', kind: 'door' }] },
  ], 0);
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
  assert.equal(stored.v, 2);
  assert.deepEqual(stored.floors[0].openings, [{ c: 0, r: 0, edge: 'N', kind: 'door' }]);
});
