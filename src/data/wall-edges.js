/**
 * Pure helpers for wall edges and openings.
 *
 * An edge is one of the four grid directions toward the outside of a cell.
 * An opening ({ c, r, edge, kind }) is anchored to a cell and an *exterior*
 * edge (the neighbour in that direction is not a floor cell).
 */

// Grid directions toward the outside of a cell. O = Oest (West).
export const EDGES = ['N', 'S', 'E', 'O'];
export const KINDS = ['door', 'window'];

/** edge → neighbour coords */
export const NEIGHBOR = {
  N: (c, r) => [c, r - 1],
  S: (c, r) => [c, r + 1],
  E: (c, r) => [c + 1, r],
  O: (c, r) => [c - 1, r],
};

const k = (c, r) => `${c},${r}`;

/**
 * @param {number} c
 * @param {number} r
 * @param {Set<string>} cellset  keys "c,r"
 * @returns {string[]} exterior edges of this cell
 */
export function exteriorEdges(c, r, cellset) {
  return EDGES.filter((e) => {
    const [nc, nr] = NEIGHBOR[e](c, r);
    return !cellset.has(k(nc, nr));
  });
}

/**
 * @param {number} c
 * @param {number} r
 * @param {Set<string>} cellset  keys "c,r"
 * @returns {string[]} interior edges of this cell (neighbour in that direction is a floor cell)
 */
export function interiorEdges(c, r, cellset) {
  return EDGES.filter((e) => {
    const [nc, nr] = NEIGHBOR[e](c, r);
    return cellset.has(k(nc, nr));
  });
}

/**
 * Normalize an interior edge to the canonical (E or S) form of the wall it
 * represents, so a wall named from either adjacent cell maps to one record.
 * @param {number} c
 * @param {number} r
 * @param {string} edge  one of N/S/E/O
 * @returns {{ c: number, r: number, edge: string }}
 */
export function canonicalDivider(c, r, edge) {
  if (edge === 'E' || edge === 'S') return { c, r, edge };
  const [nc, nr] = NEIGHBOR[edge](c, r);
  // O -> left neighbour's E ; N -> upper neighbour's S
  return { c: nc, r: nr, edge: edge === 'O' ? 'E' : 'S' };
}

/**
 * Keep only dividers on existing cells whose edge is interior, canonicalized to
 * E/S and deduped per canonical (c,r,edge).
 * @param {unknown} dividers
 * @param {Set<string>} cellset
 * @returns {Array<{ c: number, r: number, edge: string }>}
 */
export function sanitizeDividers(dividers, cellset) {
  if (!Array.isArray(dividers)) return [];
  const seen = new Set();
  const out = [];
  for (const d of dividers) {
    if (!d || typeof d !== 'object') continue;
    const { c, r, edge } = d;
    if (!Number.isInteger(c) || !Number.isInteger(r)) continue;
    if (!EDGES.includes(edge)) continue;
    if (!cellset.has(k(c, r))) continue;
    const [nc, nr] = NEIGHBOR[edge](c, r);
    if (!cellset.has(k(nc, nr))) continue; // not an interior edge
    const canon = canonicalDivider(c, r, edge);
    if (!cellset.has(k(canon.c, canon.r))) continue;
    const dedupe = `${canon.c},${canon.r},${canon.edge}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push(canon);
  }
  return out;
}

/**
 * Keep only openings on existing cells whose edge is exterior, with a valid
 * kind, deduped per (c,r,edge).
 * @param {unknown} openings
 * @param {Set<string>} cellset
 * @returns {Array<{ c: number, r: number, edge: string, kind: string }>}
 */
export function sanitizeOpenings(openings, cellset) {
  if (!Array.isArray(openings)) return [];
  const seen = new Set();
  const out = [];
  for (const o of openings) {
    if (!o || typeof o !== 'object') continue;
    const { c, r, edge, kind } = o;
    if (!Number.isInteger(c) || !Number.isInteger(r)) continue;
    if (!EDGES.includes(edge) || !KINDS.includes(kind)) continue;
    if (!cellset.has(k(c, r))) continue;
    const [nc, nr] = NEIGHBOR[edge](c, r);
    if (cellset.has(k(nc, nr))) continue;
    const dedupe = `${c},${r},${edge}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({ c, r, edge, kind });
  }
  return out;
}
