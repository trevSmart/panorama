/**
 * Last detail panels the supervisor opened (agent, queue, skill).
 * Persisted in localStorage for the global search "Recent" list.
 */

const STORAGE_KEY = 'panorama.detailRecents.v1';
const MAX_RECENTS = 10;

/** @typedef {'agent'|'queue'|'skill'} DetailRecentKind */

/**
 * @typedef {Object} DetailRecentEntry
 * @property {DetailRecentKind} kind
 * @property {string} id
 * @property {string} title
 * @property {string} meta
 * @property {import('./types.js').PresenceStatus} [status]
 * @property {boolean} [flag]
 * @property {string} [color]
 * @property {number} [backlog]
 * @property {number} [online]
 * @property {number} [agents]
 * @property {number} viewedAt
 */

/** @type {((config: { kind: string, id: string, name?: string }) => Omit<DetailRecentEntry, 'viewedAt'>|null)|null} */
let resolver = null;

/** @param {typeof resolver} fn */
export function setDetailRecentResolver(fn) {
  resolver = fn;
}

const VALID_KINDS = new Set(['agent', 'queue', 'skill']);

/**
 * @param {unknown} raw
 * @returns {DetailRecentEntry|null}
 */
function sanitizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = raw.kind;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!VALID_KINDS.has(kind) || !id || !title) return null;
  const meta = typeof raw.meta === 'string' ? raw.meta : '';
  const viewedAt = Number(raw.viewedAt);
  return {
    kind,
    id,
    title,
    meta,
    status: raw.status === 'online' || raw.status === 'busy' || raw.status === 'away' || raw.status === 'offline'
      ? raw.status
      : undefined,
    flag: raw.flag === true,
    color: typeof raw.color === 'string' ? raw.color : undefined,
    backlog: Number.isFinite(Number(raw.backlog)) ? Number(raw.backlog) : undefined,
    online: Number.isFinite(Number(raw.online)) ? Number(raw.online) : undefined,
    agents: Number.isFinite(Number(raw.agents)) ? Number(raw.agents) : undefined,
    viewedAt: Number.isFinite(viewedAt) ? viewedAt : Date.now(),
  };
}

/** @returns {DetailRecentEntry[]} */
function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeEntry).filter(Boolean);
  } catch {
    return [];
  }
}

/** @param {DetailRecentEntry[]} entries */
function saveEntries(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_RECENTS)));
  } catch {
    /* ignore quota / private mode */
  }
}

/** @returns {DetailRecentEntry[]} */
export function getDetailRecents() {
  return loadEntries();
}

/**
 * Record a detail view. Dedupes by kind+id and keeps the newest MAX_RECENTS.
 * @param {{ kind: string, id: string, name?: string }} config
 */
export function recordDetailOpen(config) {
  if (!config?.kind || !config?.id || !VALID_KINDS.has(config.kind)) return;
  const snapshot = resolver?.(config);
  if (!snapshot) return;

  const key = `${snapshot.kind}:${snapshot.id}`;
  const next = loadEntries().filter((e) => `${e.kind}:${e.id}` !== key);
  next.unshift({ ...snapshot, viewedAt: Date.now() });
  saveEntries(next);
}
