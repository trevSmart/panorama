import {
  agents,
  queueState,
  workItems,
  QUEUES,
  SKILLS,
  CH_LBL,
  STATUS,
  NAMES,
  WORK_KINDS,
  TEAM_COLOR,
  FLOORS,
  teamOf,
  rnd,
  pick,
} from './mock-seed.js';
import { formatWorkTimer } from '../ui/duration.js';
import { MOCK_CAPABILITIES } from './types.js';
import { devConsole } from '../dev/dev-console.js';
import { getRefreshConfig } from '../settings/preferences.js';

/** @type {ReturnType<typeof setInterval>[]} */
let simTimers = [];
/** Re-run the simulation timers with the current refresh config. Set by startSimulation. */
let restartSimTimers = null;

/**
 * @typedef {import('./types.js').PanoramaCapabilities} PanoramaCapabilities
 */

/**
 * @param {{ scope?: 'connected'|'all' }} [opts]
 * In mock mode every agent is already available, so scope 'all' resolves to the
 * same roster (as a promise, matching the Salesforce provider contract).
 * @returns {import('./types.js').Agent[]|Promise<import('./types.js').Agent[]>}
 */
function getAgents(opts) {
  // Embed each agent's skills so the client has them up front, mirroring the
  // Salesforce /agents payload (skills are no longer fetched lazily per drawer).
  const hydrate = (a) => ({ ...a, skills: agentSkillRows(a.id) });
  if (opts?.scope === 'all') return Promise.resolve(agents.map(hydrate));
  return agents.map(hydrate);
}

/** @param {string} id */
function getAgentById(id) {
  if (!id) return null;
  return agents.find((a) => a.id === id) ?? null;
}

/** @returns {import('./types.js').Queue[]} */
function getQueues() {
  return queueState;
}

/**
 * @returns {Promise<import('./types.js').Skill[]>}
 * Resolved as a promise to match the Salesforce provider contract.
 */
function getSkills() {
  return Promise.resolve(SKILLS.slice());
}

/**
 * Stable roster slice qualified for a skill (sync helper). Seeds a rotation
 * offset from the skill id so each skill picks a different but reproducible
 * slice; count comes from skill.agents, capped at roster size.
 * @param {object} skill
 * @returns {import('./types.js').Agent[]}
 */
function skillAgentSlice(skill) {
  const want = Math.min(Number(skill?.agents) || 0, agents.length);
  if (!want || !skill) return [];
  let seed = 0;
  for (let i = 0; i < String(skill.id).length; i++) seed = (seed * 31 + String(skill.id).charCodeAt(i)) % agents.length;
  const picked = [];
  for (let i = 0; i < want; i++) picked.push(agents[(seed + i) % agents.length]);
  return picked;
}

/**
 * Agents qualified for a skill. The mock roster has no skill links, so derive a
 * stable subset deterministically from the skill id. Resolved as a promise to
 * match the Salesforce provider contract.
 * @param {string} skillId
 * @returns {Promise<import('./types.js').Agent[]>}
 */
function getSkillAgents(skillId) {
  return Promise.resolve(skillAgentSlice(SKILLS.find((s) => s.id === skillId)));
}

// Deterministic synthetic timestamps for mock skill assignments, anchored to a
// fixed epoch so the drawer renders stable dates without Date.now().
const MOCK_SKILL_EPOCH = Date.UTC(2025, 0, 1);

/**
 * Skills assigned to an agent, the inverse of getSkillAgents so the mock stays
 * internally consistent: an agent's skills are exactly those whose qualified
 * slice contains them. Assignment metadata (level/dates/modifier) is synthetic
 * but stable. Resolved as a promise to match the Salesforce provider contract.
 * @param {string} agentId
 * @returns {Promise<import('./types.js').AgentSkill[]>}
 */
function agentSkillRows(agentId) {
  const out = [];
  SKILLS.forEach((skill, si) => {
    if (!skillAgentSlice(skill).some((a) => a.id === agentId)) return;
    // Stable per (agent, skill): offset the epoch by a deterministic amount.
    const span = ((String(agentId).length + si) * 37 % 240) + 5; // 5..244 days
    const start = MOCK_SKILL_EPOCH + span * 86400000;
    out.push({
      id: `${agentId}-${skill.id}`,
      skillId: skill.id,
      name: skill.name,
      type: skill.type || null,
      level: (si % 5) + 1,
      startDate: new Date(start).toISOString(),
      lastModifiedDate: new Date(start + 86400000 * (si + 1)).toISOString(),
      lastModifiedBy: 'Sistema (mock)',
    });
  });
  return out;
}

function getAgentSkills(agentId) {
  return Promise.resolve(agentSkillRows(agentId));
}

/**
 * @returns {Promise<import('./types.js').WorkItem[]>}
 * Resolved as a promise to match the Salesforce provider contract.
 */
function getWork() {
  return Promise.resolve(workItems.slice());
}

function getLegacyBindings() {
  return {
    AGENTS: agents,
    queueState,
    QUEUES,
    SKILLS,
    CH_LBL,
    STATUS,
    NAMES,
    WORK_KINDS,
    TEAM_COLOR,
    FLOORS,
    teamOf,
    rnd,
    pick,
  };
}

/**
 * Live simulator for prototype UX. Calls view hooks supplied by the UI layer.
 * @param {{ isView: (v: string) => boolean, updateOverviewMetrics?: () => void, updateAgents?: () => void, updateRoomPanel?: () => void, Scene3D?: { update: (dt: number) => void }, activePanelEl?: () => HTMLElement|null, queueCard?: (q: object) => string }} hooks
 */
function startSimulation(hooks) {
  devConsole.action('data:load', 'mock');
  function tickWork() {
    agents.forEach((a) => {
      if (a.work) a.workSec++;
    });
    document.querySelectorAll('.card').forEach((c) => {
      const a = agents.find((x) => x.id === c.dataset.id);
      if (a?.work) {
        const t = c.querySelector('.timer');
        if (t) t.textContent = formatWorkTimer(a.workSec);
      }
    });
  }

  function tickAgents() {
    agents.forEach((a) => {
      if (a.status === 'offline' || a.status === 'away') return;
      if (Math.random() < 0.42) {
        const delta = Math.random() < 0.52 ? 1 : -1;
        a.used = Math.max(0, Math.min(a.max, a.used + delta));
      }
      a.status = a.used >= a.max ? 'busy' : 'online';
    });
    if (hooks.isView('operations')) {
      hooks.updateOverviewMetrics?.();
      hooks.updateAgents?.();
    }
    hooks.refreshActiveDetail?.();
    hooks.Scene3D?.update(16);
  }

  function tickQueues() {
    queueState.forEach((q) => {
      if (q.backlog > 0) q.longest += rnd(1, 4);
      q.avg = Math.max(15, q.avg + rnd(-3, 3));
      if (Math.random() < 0.35) q.backlog = Math.max(0, q.backlog + rnd(-1, 1));
      if (Math.random() < 0.2) q.online = Math.max(1, q.online + (Math.random() < 0.5 ? -1 : 1));
    });
    if (hooks.isView('operations')) {
      hooks.updateOverviewMetrics?.();
      const root = hooks.activePanelEl?.();
      const qg = root?.querySelector('#sec-queues .qgrid');
      if (qg && hooks.queueCard) qg.innerHTML = queueState.map(hooks.queueCard).join('');
    }
    hooks.refreshActiveDetail?.();
  }

  function maybeFlag() {
    const on = agents.filter((a) => a.status === 'online' && !a.flag);
    if (Math.random() < 0.4 && on.length) {
      const a = pick(on);
      a.flag = true;
      a.flagReason = pick([
        'Client irat — demana responsable',
        'Dubte sobre devolucions',
        'Cas fora del seu skill',
        'Aprovació de descompte',
      ]);
      if (hooks.isView('operations')) {
        hooks.updateOverviewMetrics?.();
        hooks.updateAgents?.();
        hooks.updateRoomPanel?.();
      }
      hooks.refreshActiveDetail?.();
    }
  }

  /**
   * @param {{ intervalMs: number, autoRefresh: boolean }} [cfg]
   */
  function startTimers(cfg) {
    simTimers.forEach(clearInterval);
    simTimers = [];
    const { intervalMs, autoRefresh } = cfg || getRefreshConfig();
    if (!autoRefresh) return;
    // Per user preference, every simulation timer uses the configured interval.
    simTimers.push(setInterval(tickWork, intervalMs));
    simTimers.push(setInterval(tickAgents, intervalMs));
    simTimers.push(setInterval(tickQueues, intervalMs));
    simTimers.push(setInterval(maybeFlag, intervalMs));
  }

  restartSimTimers = startTimers;
  startTimers();
}

export function createMockProvider() {
  return {
    source: 'mock',
    capabilities: MOCK_CAPABILITIES,
    getAgents,
    getAgentById,
    getQueues,
    getSkills,
    getSkillAgents,
    getAgentSkills,
    getWork,
    getLegacyBindings,
    startSimulation,
    /**
     * Apply a new simulation cadence live (from settings).
     * @param {{ intervalMs: number, autoRefresh: boolean }} [cfg]
     */
    setRefreshInterval(cfg) {
      restartSimTimers?.(cfg);
    },
  };
}
