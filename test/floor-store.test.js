import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

import {
  loadCustomFloors,
  loadCustomRoomDir,
  sanitizeFloors,
  sanitizePlaces,
  sanitizeRoomDefinition,
  saveCustomFloors,
  saveCustomRoom,
  saveCustomRoomDir,
} from '../src/data/floor-store.js';
import { DEFAULT_BG_OPACITY } from '../src/data/floor-backgrounds.js';

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
  return [{
    name,
    cells: [[0, 0], [1, 0]],
    seats: [[1, 0]],
    openings: [],
    dividers: [],
    background: null,
    backgroundOpacity: DEFAULT_BG_OPACITY,
  }];
}

test('room definition stores sanitized floors and rotation direction together', () => {
  const clean = sanitizeRoomDefinition({
    v: 1,
    dir: 2,
    floors: oneFloor('  Main room  '),
  });

  assert.deepEqual(clean, {
    v: 3,
    dir: 2,
    activePlaceId: 'default',
    places: [{ id: 'default', name: 'Lloc 1', floors: [{ name: 'Main room', cells: [[0, 0], [1, 0]], seats: [[1, 0]], openings: [], dividers: [], background: null, backgroundOpacity: DEFAULT_BG_OPACITY }] }],
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
  assert.equal(stored.v, 3);
  assert.equal(stored.dir, 1);
  assert.deepEqual(stored.places[0].floors, oneFloor());
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
  assert.deepEqual(v1.places[0].floors[0].openings, []);

  const v2 = sanitizeRoomDefinition({
    v: 2,
    dir: 1,
    floors: [{ name: 'R', cells: [[0, 0]], seats: [], openings: [{ c: 0, r: 0, edge: 'N', kind: 'window' }] }],
  });
  assert.equal(v2.dir, 1);
  assert.deepEqual(v2.places[0].floors[0].openings, [{ c: 0, r: 0, edge: 'N', kind: 'window' }]);
});

test('saveCustomFloors persists openings under v3', () => {
  saveCustomFloors([
    { name: 'R', cells: [[0, 0], [1, 0]], seats: [], openings: [{ c: 0, r: 0, edge: 'N', kind: 'door' }] },
  ], 0);
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
  assert.equal(stored.v, 3);
  assert.deepEqual(stored.places[0].floors[0].openings, [{ c: 0, r: 0, edge: 'N', kind: 'door' }]);
});

test('saveCustomRoom persists multiple places', () => {
  saveCustomRoom([
    { id: 'a', name: 'North', floors: oneFloor('North floor') },
    { id: 'b', name: 'South', floors: oneFloor('South floor') },
  ], 2, 'b');
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
  assert.equal(stored.v, 3);
  assert.equal(stored.activePlaceId, 'b');
  assert.equal(stored.places.length, 2);
  assert.deepEqual(loadCustomFloors(), oneFloor('South floor'));
});

test('v2 layouts migrate into a default place', () => {
  const clean = sanitizeRoomDefinition({
    v: 2,
    dir: 1,
    floors: oneFloor('Legacy'),
  });
  assert.equal(clean.v, 3);
  assert.equal(clean.places.length, 1);
  assert.deepEqual(clean.places[0].floors, oneFloor('Legacy'));
});

test('sanitizePlaces requires at least one floor per place', () => {
  assert.equal(sanitizePlaces([{ id: 'x', name: 'Empty', floors: [] }]), null);
});

test('sanitizeFloors keeps valid dividers, canonicalized and deduped', () => {
  const floors = sanitizeFloors([
    {
      name: 'Room',
      cells: [[0, 0], [1, 0]],
      seats: [],
      openings: [],
      dividers: [
        { c: 0, r: 0, edge: 'E' },
        { c: 1, r: 0, edge: 'O' }, // same wall -> dedup
        { c: 0, r: 0, edge: 'N' }, // exterior -> drop
      ],
    },
  ]);
  assert.deepEqual(floors[0].dividers, [{ c: 0, r: 0, edge: 'E' }]);
});

test('sanitizeFloors defaults missing dividers to an empty array', () => {
  const floors = sanitizeFloors([{ name: 'Room', cells: [[0, 0]], seats: [] }]);
  assert.deepEqual(floors[0].dividers, []);
});

test('saveCustomFloors persists dividers under v3', () => {
  saveCustomFloors([
    { name: 'R', cells: [[0, 0], [1, 0]], seats: [], openings: [], dividers: [{ c: 0, r: 0, edge: 'E' }] },
  ], 0);
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
  assert.equal(stored.v, 3);
  assert.deepEqual(stored.places[0].floors[0].dividers, [{ c: 0, r: 0, edge: 'E' }]);
});

test('sanitizeFloors keeps valid backgrounds and drops unknown ids', () => {
  const floors = sanitizeFloors([
    {
      name: 'Room',
      cells: [[0, 0]],
      seats: [],
      background: 'image.png',
      backgroundOpacity: 1.5,
    },
    {
      name: 'Room 2',
      cells: [[0, 0]],
      seats: [],
      background: 'not-real.png',
      backgroundOpacity: -0.2,
    },
  ]);
  assert.equal(floors[0].background, 'image.png');
  assert.equal(floors[0].backgroundOpacity, 1);
  assert.equal(floors[1].background, null);
  assert.equal(floors[1].backgroundOpacity, 0);
});

test('saveCustomFloors persists background settings under v3', () => {
  saveCustomFloors([
    {
      name: 'R',
      cells: [[0, 0], [1, 0]],
      seats: [],
      openings: [],
      dividers: [],
      background: 'image copy 2.png',
      backgroundOpacity: 0.35,
    },
  ], 0);
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
  assert.equal(stored.places[0].floors[0].background, 'image copy 2.png');
  assert.equal(stored.places[0].floors[0].backgroundOpacity, 0.35);
});
