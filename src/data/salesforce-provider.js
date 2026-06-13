import { getValidAccessSession } from '../auth/salesforce-oauth.js';
import { CH_LBL } from './channel-labels.js';
import { buildFloorsForAgents, TEAM_COLOR, teamOf } from './floor-layout.js';
import { attachAgentPhotoBlobs, revokeAgentPhotoBlobs } from './agent-photos.js';
import { normalizeAgent, normalizeQueue } from './normalize.js';
import { READ_ONLY_CAPABILITIES } from './types.js';

/**
 * @param {string} apiBaseUrl
 * @param {string} accessToken
 * @param {RequestInit} [init]
 */
async function apiFetch(apiBaseUrl, accessToken, path, init) {
  const url = `${apiBaseUrl.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, {
    credentials: 'omit',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers || {}),
    },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Panorama API ${res.status}: ${body || res.statusText}`);
  }
  return res.json();
}

export function buildSalesforceRecordUrl(instanceUrl, recordId) {
  if (!instanceUrl || !recordId) return null;
  return `${instanceUrl.replace(/\/$/, '')}/${recordId}`;
}

/**
 * @param {{ runtimeConfig: import('../config.js').RuntimeConfig, getSession: () => Promise<import('../auth/salesforce-oauth.js').OAuthSession> }} options
 */
export function createSalesforceProvider({ runtimeConfig, getSession }) {
  /** @type {import('./types.js').Agent[]} */
  let agents = [];
  /** @type {import('./types.js').Queue[]} */
  let queueState = [];
  /** @type {ReturnType<typeof buildFloorsForAgents>} */
  let floors = buildFloorsForAgents([]);
  const listeners = new Set();
  /** @type {ReturnType<typeof setInterval>|null} */
  let pollTimer = null;
  /** @type {string} */
  let apiBaseUrl = runtimeConfig.apiBaseUrl;

  function notify() {
    listeners.forEach((fn) => fn());
  }

  function syncLegacyGlobals() {
    if (typeof globalThis === 'undefined') return;
    Object.assign(globalThis, getLegacyBindings());
  }

  async function refresh() {
    const session = await getSession();
    apiBaseUrl = `${session.instanceUrl.replace(/\/$/, '')}/services/apexrest/panorama/v1`;

    const [agentsRes, queuesRes] = await Promise.all([
      apiFetch(apiBaseUrl, session.accessToken, '/agents'),
      apiFetch(apiBaseUrl, session.accessToken, '/queues'),
    ]);
    agents.splice(0, agents.length, ...(agentsRes.agents ?? []).map((agent) => {
      const normalized = normalizeAgent(agent);
      return {
        ...normalized,
        recordUrl: normalized.recordUrl || buildSalesforceRecordUrl(session.instanceUrl, normalized.id),
      };
    }));
    await attachAgentPhotoBlobs(agents, session.accessToken, session.instanceUrl);
    queueState.splice(0, queueState.length, ...(queuesRes.queues ?? []).map(normalizeQueue));
    floors = buildFloorsForAgents(agents);
    notify();
    syncLegacyGlobals();
    return { agents, queueState };
  }

  function getLegacyBindings() {
    return {
      AGENTS: agents,
      queueState,
      QUEUES: queueState,
      SKILLS: [],
      CH_LBL,
      STATUS: {
        online: { c: 'var(--ok)', lbl: 'Online' },
        busy: { c: 'var(--alert)', lbl: 'Busy' },
        away: { c: 'var(--watch)', lbl: 'Away' },
        offline: { c: 'var(--off)', lbl: 'Offline' },
      },
      NAMES: agents.map((a) => [a.name, a.role || 'Agent']),
      WORK_KINDS: [],
      TEAM_COLOR,
      FLOORS: floors,
      teamOf,
      pick: () => { throw new Error('Mock pick() is not available in Salesforce mode'); },
      rnd: () => { throw new Error('Mock rnd() is not available in Salesforce mode'); },
    };
  }

  return {
    source: 'salesforce',
    capabilities: READ_ONLY_CAPABILITIES,

    async init() {
      await refresh();
      pollTimer = setInterval(() => {
        refresh().catch((err) => console.warn('[Panorama] poll failed', err));
      }, 15000);
    },

    destroy() {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      listeners.clear();
      revokeAgentPhotoBlobs();
    },

    getAgents: () => agents,
    getQueues: () => queueState,
    refresh,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getLegacyBindings,
  };
}

/**
 * Factory helper used by provider.js
 * @param {{ runtimeConfig: import('../config.js').RuntimeConfig, apiBaseUrl?: string }} options
 */
export function createSalesforceProviderFromConfig({ runtimeConfig }) {
  return createSalesforceProvider({
    runtimeConfig,
    getSession: () => getValidAccessSession(runtimeConfig),
  });
}
