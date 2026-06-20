import { recoverAccessSession, getValidAccessSession } from '../auth/salesforce-oauth.js';
import { CH_LBL } from './channel-labels.js';
import { buildFloorsForAgents, TEAM_COLOR, teamOf } from './floor-layout.js';
import { attachAgentPhotoBlobs, revokeAgentPhotoBlobs } from './agent-photos.js';
import { normalizeAgent, normalizeAgentSkill, normalizeQueue, normalizeSkill, normalizeWorkRecord } from './normalize.js';
import { READ_ONLY_CAPABILITIES } from './types.js';
import { devConsole } from '../dev/dev-console.js';
import { getRefreshConfig } from '../settings/preferences.js';

/**
 * @param {string} apiBaseUrl
 * @param {string} accessToken
 * @param {string} path
 * @param {() => Promise<import('../auth/salesforce-oauth.js').OAuthSession>} recoverSession
 * @param {RequestInit} [init]
 * @param {boolean} [retried]
 */
async function apiFetch(apiBaseUrl, accessToken, path, recoverSession, init, retried = false) {
  const method = (init?.method || 'GET').toUpperCase();
  devConsole.api(method, path);
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
    if (!retried && /INVALID_SESSION_ID|Session expired or invalid/i.test(body)) {
      const session = await recoverSession();
      return apiFetch(apiBaseUrl, session.accessToken, path, recoverSession, init, true);
    }
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
function createSalesforceProvider({ runtimeConfig, getSession }) {
  /** @type {import('./types.js').Agent[]} */
  let agents = [];
  /** @type {import('./types.js').Queue[]} */
  let queueState = [];
  /** @type {ReturnType<typeof buildFloorsForAgents>} */
  let floors = buildFloorsForAgents([]);
  const listeners = new Set();
  /** @type {ReturnType<typeof setInterval>|null} */
  let pollTimer = null;
  let { intervalMs: pollIntervalMs, autoRefresh } = getRefreshConfig();
  /** @type {string} */
  let apiBaseUrl = runtimeConfig.apiBaseUrl;
  const recoverSession = () => recoverAccessSession(runtimeConfig);
  /** All Omni-enabled agents (connected or not), populated on demand. */
  /** @type {import('./types.js').Agent[]} */
  let allAgents = [];

  function notify() {
    listeners.forEach((fn) => fn());
  }

  function syncLegacyGlobals() {
    if (typeof globalThis === 'undefined') return;
    Object.assign(globalThis, getLegacyBindings());
  }

  async function refresh({ poll = false } = {}) {
    devConsole.action(poll ? 'data:poll' : 'data:load', 'salesforce');
    const session = await getSession();
    apiBaseUrl = `${session.instanceUrl.replace(/\/$/, '')}/services/apexrest/panorama/v1`;

    const [agentsRes, queuesRes] = await Promise.all([
      apiFetch(apiBaseUrl, session.accessToken, '/agents', recoverSession),
      apiFetch(apiBaseUrl, session.accessToken, '/queues', recoverSession),
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

  /**
   * Fetch every Omni-enabled agent (connected or not). Kept in a cache
   * separate from the connected-only `agents` list used by Operations.
   * @returns {Promise<import('./types.js').Agent[]>}
   */
  async function refreshAllAgents() {
    const session = await getSession();
    const base = `${session.instanceUrl.replace(/\/$/, '')}/services/apexrest/panorama/v1`;
    const res = await apiFetch(base, session.accessToken, '/agents?scope=all', recoverSession);
    const list = (res.agents ?? []).map((agent) => {
      const normalized = normalizeAgent(agent);
      return {
        ...normalized,
        recordUrl: normalized.recordUrl || buildSalesforceRecordUrl(session.instanceUrl, normalized.id),
      };
    });
    await attachAgentPhotoBlobs(list, session.accessToken, session.instanceUrl);
    allAgents = list;
    return allAgents;
  }

  /**
   * Fetch the skill catalog with backlog/qualified-agent counts.
   * @returns {Promise<import('./types.js').Skill[]>}
   */
  async function refreshSkills() {
    const session = await getSession();
    const base = `${session.instanceUrl.replace(/\/$/, '')}/services/apexrest/panorama/v1`;
    const res = await apiFetch(base, session.accessToken, '/skills', recoverSession);
    return (res.skills ?? []).map(normalizeSkill);
  }

  /**
   * Fetch the agents qualified for a skill. Same agent shape as /agents, so the
   * UI reuses the agent card and drawer.
   * @param {string} skillId
   * @returns {Promise<import('./types.js').Agent[]>}
   */
  async function refreshSkillAgents(skillId) {
    const session = await getSession();
    const base = `${session.instanceUrl.replace(/\/$/, '')}/services/apexrest/panorama/v1`;
    const res = await apiFetch(
      base, session.accessToken, `/skills/${encodeURIComponent(skillId)}/agents`, recoverSession);
    const list = (res.agents ?? []).map((agent) => {
      const normalized = normalizeAgent(agent);
      return {
        ...normalized,
        recordUrl: normalized.recordUrl || buildSalesforceRecordUrl(session.instanceUrl, normalized.id),
      };
    });
    await attachAgentPhotoBlobs(list, session.accessToken, session.instanceUrl);
    return list;
  }

  /**
   * Fetch the skills assigned to an agent, with the assignment metadata
   * (level, start date, last-modified audit).
   * @param {string} agentId the agent's User Id
   * @returns {Promise<import('./types.js').AgentSkill[]>}
   */
  async function refreshAgentSkills(agentId) {
    const session = await getSession();
    const base = `${session.instanceUrl.replace(/\/$/, '')}/services/apexrest/panorama/v1`;
    const res = await apiFetch(
      base, session.accessToken, `/agents/${encodeURIComponent(agentId)}/skills`, recoverSession);
    return (res.skills ?? []).map(normalizeAgentSkill);
  }

  /**
   * Fetch work items currently traveling through queues to agents.
   * @returns {Promise<import('./types.js').WorkItem[]>}
   */
  async function refreshWork() {
    const session = await getSession();
    const base = `${session.instanceUrl.replace(/\/$/, '')}/services/apexrest/panorama/v1`;
    const res = await apiFetch(base, session.accessToken, '/work', recoverSession);
    return (res.work ?? res.workItems ?? []).map(normalizeWorkRecord);
  }

  /** Connected roster first, then the full Omni-enabled directory cache. */
  function getAgentById(id) {
    if (!id) return null;
    return agents.find((a) => a.id === id) ?? allAgents.find((a) => a.id === id) ?? null;
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

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    if (!autoRefresh) return;
    pollTimer = setInterval(() => {
      refresh({ poll: true }).catch((err) => console.warn('[Panorama] poll failed', err));
    }, pollIntervalMs);
  }

  return {
    source: 'salesforce',
    capabilities: READ_ONLY_CAPABILITIES,

    async init() {
      await refresh();
      await refreshAllAgents().catch((err) => console.warn('[Panorama] all-agents prefetch failed', err));
      startPolling();
    },

    destroy() {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      listeners.clear();
      revokeAgentPhotoBlobs();
    },

    /**
     * Apply a new polling cadence live (from settings).
     * @param {{ intervalMs: number, autoRefresh: boolean }} cfg
     */
    setRefreshInterval(cfg) {
      pollIntervalMs = Math.max(1000, cfg.intervalMs);
      autoRefresh = cfg.autoRefresh;
      startPolling();
    },

    /**
     * @param {{ scope?: 'connected'|'all' }} [opts]
     * scope 'all' returns every Omni-enabled agent (async fetch); the default
     * returns the connected-only list used by Operations (synchronous).
     */
    getAgents(opts) {
      if (opts?.scope === 'all') {
        if (allAgents.length) return Promise.resolve(allAgents.slice());
        return refreshAllAgents();
      }
      return agents;
    },
    getAgentById,
    getQueues: () => queueState,
    getSkills: () => refreshSkills(),
    getSkillAgents: (skillId) => refreshSkillAgents(skillId),
    getAgentSkills: (agentId) => refreshAgentSkills(agentId),
    getWork: () => refreshWork(),
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
