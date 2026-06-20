import { isLiveDataMode } from './mode.js';
import { devConsole } from '../dev/dev-console.js';

/** @type {Map<string, string>} */
const blobUrlsByAgentId = new Map();

/** Source photo URL behind each cached blob, so we only refetch when it changes. */
const loadedPhotoUrlByAgentId = new Map();

/** @type {Map<string, Promise<void>>} */
const attachInFlightByAgentId = new Map();

function revokeAgentBlob(agentId) {
  const url = blobUrlsByAgentId.get(agentId);
  if (!url) return;
  URL.revokeObjectURL(url);
  blobUrlsByAgentId.delete(agentId);
  loadedPhotoUrlByAgentId.delete(agentId);
}

export function revokeAgentPhotoBlobs() {
  blobUrlsByAgentId.forEach((url) => URL.revokeObjectURL(url));
  blobUrlsByAgentId.clear();
  loadedPhotoUrlByAgentId.clear();
  attachInFlightByAgentId.clear();
}

/**
 * Normalizes Salesforce profile photo URLs from the API.
 * @param {string} [photo]
 * @param {string} [instanceUrl]
 */
function normalizePhotoUrl(photo, instanceUrl) {
  if (!photo) return '';
  const trimmed = photo.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^https\/\//i.test(trimmed)) return `https://${trimmed.slice(7)}`;
  if (/^http\/\//i.test(trimmed)) return `http://${trimmed.slice(6)}`;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  const base = (instanceUrl || '').replace(/\/$/, '');
  if (!base) return trimmed;
  if (trimmed.startsWith('/')) return `${base}${trimmed}`;
  return `${base}/${trimmed}`;
}

/** @param {string} photoUrl */
export function buildPhotoProxyParams(photoUrl) {
  const parsed = new URL(photoUrl);
  return new URLSearchParams({
    host: parsed.hostname,
    path: `${parsed.pathname}${parsed.search}`,
  });
}

/**
 * @param {string} agentId
 * @param {string} photoUrl
 * @param {string} accessToken
 */
async function loadAgentPhotoBlob(agentId, photoUrl, accessToken) {
  const existing = attachInFlightByAgentId.get(agentId);
  if (existing) return existing;

  const task = (async () => {
    try {
      devConsole.api('GET', '/api/salesforce/photo');
      const res = await fetch(
        `/api/salesforce/photo?${buildPhotoProxyParams(photoUrl)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) {
        revokeAgentBlob(agentId);
        return;
      }
      const blobUrl = URL.createObjectURL(await res.blob());
      revokeAgentBlob(agentId);
      blobUrlsByAgentId.set(agentId, blobUrl);
      loadedPhotoUrlByAgentId.set(agentId, photoUrl);
    } catch (err) {
      revokeAgentBlob(agentId);
      console.warn('[Panorama] profile photo fetch failed', agentId, err);
    } finally {
      attachInFlightByAgentId.delete(agentId);
    }
  })();

  attachInFlightByAgentId.set(agentId, task);
  return task;
}

/**
 * Loads Salesforce profile photos through the local auth proxy.
 * @param {Array<{ id: string, photo?: string }>} agents
 * @param {string} accessToken
 * @param {string} instanceUrl
 */
export async function attachAgentPhotoBlobs(agents, accessToken, instanceUrl) {
  await Promise.all(agents.map(async (agent) => {
    const photoUrl = normalizePhotoUrl(agent.photo, instanceUrl);
    if (!photoUrl) {
      revokeAgentBlob(agent.id);
      return;
    }
    agent.photo = photoUrl;
    // Already holding a blob for this exact source photo: keep the same object
    // URL so the rendered <img src> is byte-identical across polls and the card
    // reconciles to a no-op instead of re-decoding the image (a visible flash).
    if (blobUrlsByAgentId.has(agent.id) && loadedPhotoUrlByAgentId.get(agent.id) === photoUrl) {
      return;
    }
    await loadAgentPhotoBlob(agent.id, photoUrl, accessToken);
  }));
}

/** @param {{ id?: string, photo?: string }} agent */
export function agentPhotoSrc(agent) {
  if (agent.id && blobUrlsByAgentId.has(agent.id)) {
    return blobUrlsByAgentId.get(agent.id);
  }
  if (isLiveDataMode()) return '';
  return agent.photo || '';
}
