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
