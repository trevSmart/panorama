/**
 * Persistence for user-customized floor layouts.
 *
 * Stored shape (v3): {
 *   v: 3,
 *   dir: 0-3,
 *   activePlaceId: string,
 *   places: [{ id, name, floors: [{ name, cells, seats, openings, dividers, background?, backgroundOpacity? }] }]
 * }
 *
 * v1/v2 stored a flat `floors` array and migrate into a single default place.
 * Seats must sit on floor cells; openings must sit on an exterior edge of an
 * existing cell; dividers must sit on an interior edge between two existing
 * cells, stored in canonical form (E/S only). Invalid entries are dropped on
 * load.
 */
import { sanitizeBackgroundId, sanitizeBackgroundOpacity } from './floor-backgrounds.js';
import { sanitizeOpenings, sanitizeDividers } from './wall-edges.js';

// Storage slot id; the document's own schema version lives in the JSON `v` field.
const STORAGE_KEY = 'panorama.customFloors.v1';

function validPair(p) {
  return Array.isArray(p) && p.length === 2
    && Number.isInteger(p[0]) && Number.isInteger(p[1])
    && p[0] >= 0 && p[1] >= 0;
}

function sanitizeDir(dir) {
  return Number.isInteger(dir) && dir >= 0 && dir <= 3 ? dir : 0;
}

export function makePlaceId() {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * @param {unknown} raw
 * @returns {Array<{ name: string, cells: number[][], seats: number[][], openings: Array<{ c: number, r: number, edge: string, kind: string }> }>|null}
 */
export function sanitizeFloors(raw) {
  if (!Array.isArray(raw) || !raw.length) return null;
  const floors = [];
  for (const f of raw) {
    if (!f || typeof f !== 'object') return null;
    const seen = new Set();
    const cells = [];
    for (const p of Array.isArray(f.cells) ? f.cells : []) {
      if (!validPair(p)) continue;
      const k = `${p[0]},${p[1]}`;
      if (seen.has(k)) continue;
      seen.add(k);
      cells.push([p[0], p[1]]);
    }
    if (!cells.length) return null;
    const seatSeen = new Set();
    const seats = [];
    for (const p of Array.isArray(f.seats) ? f.seats : []) {
      if (!validPair(p)) continue;
      const k = `${p[0]},${p[1]}`;
      if (!seen.has(k) || seatSeen.has(k)) continue;
      seatSeen.add(k);
      seats.push([p[0], p[1]]);
    }
    const name = typeof f.name === 'string' && f.name.trim() ? f.name.trim() : `Planta ${floors.length + 1}`;
    const cellset = new Set(cells.map(([cc, rr]) => `${cc},${rr}`));
    const openings = sanitizeOpenings(f.openings, cellset);
    const dividers = sanitizeDividers(f.dividers, cellset);
    const background = sanitizeBackgroundId(f.background);
    const backgroundOpacity = sanitizeBackgroundOpacity(f.backgroundOpacity);
    floors.push({ name, cells, seats, openings, dividers, background, backgroundOpacity });
  }
  return floors;
}

/**
 * @param {unknown} raw
 * @returns {Array<{ id: string, name: string, floors: Array<{ name: string, cells: number[][], seats: number[][], openings: Array<{ c: number, r: number, edge: string, kind: string }> }> }>|null}
 */
export function sanitizePlaces(raw) {
  if (!Array.isArray(raw) || !raw.length) return null;
  const places = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') return null;
    const floors = sanitizeFloors(p.floors);
    if (!floors) return null;
    const id = typeof p.id === 'string' && p.id.trim() ? p.id.trim() : makePlaceId();
    const name = typeof p.name === 'string' && p.name.trim() ? p.name.trim() : `Lloc ${places.length + 1}`;
    places.push({ id, name, floors });
  }
  return places.length ? places : null;
}

/**
 * @param {unknown} raw
 * @returns {{ v: number, dir: number, activePlaceId: string, places: Array<{ id: string, name: string, floors: Array<{ name: string, cells: number[][], seats: number[][], openings: Array<{ c: number, r: number, edge: string, kind: string }> }> }> }|null}
 */
export function sanitizeRoomDefinition(raw) {
  if (!raw || typeof raw !== 'object') return null;

  if (raw.v === 3) {
    const places = sanitizePlaces(raw.places);
    if (!places) return null;
    const activePlaceId = typeof raw.activePlaceId === 'string' && places.some((p) => p.id === raw.activePlaceId)
      ? raw.activePlaceId
      : places[0].id;
    return { v: 3, dir: sanitizeDir(raw.dir), places, activePlaceId };
  }

  if (raw.v === 1 || raw.v === 2) {
    const floors = sanitizeFloors(raw.floors);
    if (!floors) return null;
    const id = 'default';
    return {
      v: 3,
      dir: sanitizeDir(raw.dir),
      activePlaceId: id,
      places: [{ id, name: 'Lloc 1', floors }],
    };
  }

  return null;
}

function loadRoomDefinition() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  return sanitizeRoomDefinition(JSON.parse(raw));
}


/** @returns {Array<{ id: string, name: string, floors: Array<{ name: string, cells: number[][], seats: number[][], openings: Array<{ c: number, r: number, edge: string, kind: string }> }> }>|null} */
export function loadCustomPlaces() {
  try {
    return loadRoomDefinition()?.places || null;
  } catch {
    return null;
  }
}

export function loadActivePlaceId() {
  try {
    const room = loadRoomDefinition();
    if (!room?.places?.length) return null;
    return room.activePlaceId || room.places[0].id;
  } catch {
    return null;
  }
}

/** Floors of the active place — used by the team map and runtime views. */
export function loadCustomFloors() {
  try {
    const room = loadRoomDefinition();
    if (!room?.places?.length) return null;
    const id = room.activePlaceId || room.places[0].id;
    const place = room.places.find((p) => p.id === id) || room.places[0];
    return place.floors;
  } catch {
    return null;
  }
}

export function loadCustomRoomDir() {
  try {
    return loadRoomDefinition()?.dir || 0;
  } catch {
    return 0;
  }
}

/**
 * @param {Array<{ id: string, name: string, floors: Array<{ name: string, cells: number[][], seats: number[][], openings: Array<{ c: number, r: number, edge: string, kind: string }> }> }>} places
 * @param {number} [dir]
 * @param {string} [activePlaceId]
 */
export function saveCustomRoom(places, dir = loadCustomRoomDir(), activePlaceId = loadActivePlaceId()) {
  const cleanPlaces = sanitizePlaces(places);
  if (!cleanPlaces) throw new Error('Invalid places');
  const id = activePlaceId && cleanPlaces.some((p) => p.id === activePlaceId)
    ? activePlaceId
    : cleanPlaces[0].id;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    v: 3,
    dir: sanitizeDir(dir),
    activePlaceId: id,
    places: cleanPlaces,
  }));
  return { places: cleanPlaces, activePlaceId: id };
}

/**
 * Updates floors on the active place; preserves other places.
 * @param {Array<{ name: string, cells: number[][], seats: number[][], openings: Array<{ c: number, r: number, edge: string, kind: string }> }>} floors
 * @param {number} [dir]
 */
export function saveCustomFloors(floors, dir = loadCustomRoomDir()) {
  const clean = sanitizeFloors(floors);
  if (!clean) throw new Error('Invalid floor layout');
  const room = loadRoomDefinition();
  if (room?.places?.length) {
    const activeId = room.activePlaceId || room.places[0].id;
    const places = room.places.map((p) => (p.id === activeId ? { ...p, floors: clean } : p));
    saveCustomRoom(places, dir ?? room.dir, activeId);
    return clean;
  }
  const id = 'default';
  saveCustomRoom([{ id, name: 'Lloc 1', floors: clean }], dir, id);
  return clean;
}

/**
 * @param {number} dir
 * @param {Array<{ name: string, cells: number[][], seats: number[][], openings: Array<{ c: number, r: number, edge: string, kind: string }> }>} [fallbackFloors]
 */
export function saveCustomRoomDir(dir, fallbackFloors) {
  const cleanDir = sanitizeDir(dir);
  const room = loadRoomDefinition();
  if (room?.places?.length) {
    saveCustomRoom(room.places, cleanDir, room.activePlaceId);
    return cleanDir;
  }
  if (fallbackFloors) {
    const clean = sanitizeFloors(fallbackFloors);
    if (!clean) return null;
    const id = 'default';
    saveCustomRoom([{ id, name: 'Lloc 1', floors: clean }], cleanDir, id);
    return cleanDir;
  }
  return null;
}

