/**
 * Whitelisted room backgrounds served from /assets/backgrounds/.
 * Browser cannot list the directory; add new files here when assets change.
 */

export const DEFAULT_BG_OPACITY = 0.45;

/** @type {Array<{ id: string, label: string, url: string }>} */
export const FLOOR_BACKGROUNDS = [
  { id: 'image.png', label: 'Office A', url: '/assets/backgrounds/image.png' },
  { id: 'image copy.png', label: 'Office B', url: '/assets/backgrounds/image copy.png' },
  { id: 'image copy 2.png', label: 'Office C', url: '/assets/backgrounds/image copy 2.png' },
];

const BY_ID = new Map(FLOOR_BACKGROUNDS.map((b) => [b.id, b]));

/** @param {unknown} raw */
export function sanitizeBackgroundId(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  return BY_ID.has(id) ? id : null;
}

/** @param {unknown} raw */
export function sanitizeBackgroundOpacity(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_BG_OPACITY;
  return Math.min(1, Math.max(0, Math.round(n * 100) / 100));
}

/** @param {string|null} id */
export function backgroundUrl(id) {
  const entry = id ? BY_ID.get(id) : null;
  if (!entry) return null;
  return encodeURI(entry.url);
}
