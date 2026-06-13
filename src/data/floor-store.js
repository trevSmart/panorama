/**
 * Persistence for user-customized floor layouts.
 *
 * Stored shape: { v: 2, dir: 0-3, floors: [{ name, cells: [[c,r]], seats: [[c,r]], openings: [{ c, r, edge, kind }] }] }
 * Seats must sit on floor cells; openings must sit on an exterior edge of an
 * existing cell. Invalid entries are dropped on load. v1 layouts load with
 * openings: [].
 */
import { sanitizeOpenings } from './wall-edges.js';

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
    floors.push({ name, cells, seats, openings });
  }
  return floors;
}

/**
 * @param {unknown} raw
 * @returns {{ dir: number, floors: Array<{ name: string, cells: number[][], seats: number[][], openings: Array<{ c: number, r: number, edge: string, kind: string }> }> }|null}
 */
export function sanitizeRoomDefinition(raw) {
  if (!raw || typeof raw !== 'object' || (raw.v !== 1 && raw.v !== 2)) return null;
  const floors = sanitizeFloors(raw.floors);
  if (!floors) return null;
  return { dir: sanitizeDir(raw.dir), floors };
}

function loadRoomDefinition() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  return sanitizeRoomDefinition(JSON.parse(raw));
}

/** @returns {Array<{ name: string, cells: number[][], seats: number[][] }>|null} */
export function loadCustomFloors() {
  try {
    return loadRoomDefinition()?.floors || null;
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
 * @param {Array<{ name: string, cells: number[][], seats: number[][], openings: Array<{ c: number, r: number, edge: string, kind: string }> }>} floors
 * @param {number} [dir]
 */
export function saveCustomFloors(floors, dir = loadCustomRoomDir()) {
  const clean = sanitizeFloors(floors);
  if (!clean) throw new Error('Invalid floor layout');
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 2, dir: sanitizeDir(dir), floors: clean }));
  return clean;
}

/**
 * @param {number} dir
 * @param {Array<{ name: string, cells: number[][], seats: number[][], openings: Array<{ c: number, r: number, edge: string, kind: string }> }>} [fallbackFloors]
 */
export function saveCustomRoomDir(dir, fallbackFloors) {
  const cleanDir = sanitizeDir(dir);
  const room = loadRoomDefinition();
  const floors = room?.floors || (fallbackFloors ? sanitizeFloors(fallbackFloors) : null);
  if (!floors) return null;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 2, dir: cleanDir, floors }));
  return cleanDir;
}

export function clearCustomFloors() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function hasCustomFloors() {
  return loadCustomFloors() != null;
}
