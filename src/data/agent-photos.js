import { isLiveDataMode } from './mode.js';

/** @type {Map<string, string>} */
const blobUrlsByAgentId = new Map();

export function revokeAgentPhotoBlobs() {
  blobUrlsByAgentId.forEach((url) => URL.revokeObjectURL(url));
  blobUrlsByAgentId.clear();
}

/**
 * Normalizes Salesforce profile photo URLs from the API.
 * @param {string} [photo]
 * @param {string} [instanceUrl]
 */
export function normalizePhotoUrl(photo, instanceUrl) {
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

/**
 * Loads Salesforce profile photos through the local auth proxy.
 * @param {Array<{ id: string, photo?: string }>} agents
 * @param {string} accessToken
 * @param {string} instanceUrl
 */
export async function attachAgentPhotoBlobs(agents, accessToken, instanceUrl) {
  revokeAgentPhotoBlobs();

  await Promise.all(agents.map(async (agent) => {
    const photoUrl = normalizePhotoUrl(agent.photo, instanceUrl);
    if (!photoUrl) return;
    agent.photo = photoUrl;
    try {
      const res = await fetch(
        `/api/salesforce/photo?url=${encodeURIComponent(photoUrl)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) return;
      const blobUrl = URL.createObjectURL(await res.blob());
      blobUrlsByAgentId.set(agent.id, blobUrl);
      agent.photoDisplay = blobUrl;
    } catch (err) {
      console.warn('[Panorama] profile photo fetch failed', agent.id, err);
    }
  }));
}

/** @param {{ photoDisplay?: string, photo?: string }} agent */
export function agentPhotoSrc(agent) {
  if (agent.photoDisplay) return agent.photoDisplay;
  if (isLiveDataMode()) return '';
  return agent.photo || '';
}
