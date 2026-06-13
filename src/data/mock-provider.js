import {
  agents,
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
} from './mock-seed.js';
import { MOCK_CAPABILITIES } from './types.js';

/**
 * @typedef {import('./types.js').PanoramaCapabilities} PanoramaCapabilities
 */

/** @returns {import('./types.js').Agent[]} */
function getAgents() {
  return agents;
}

/** @returns {import('./types.js').Queue[]} */
function getQueues() {
  return queueState;
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
  function tickWork() {
    agents.forEach((a) => {
      if (a.work) a.workSec++;
    });
    document.querySelectorAll('.card').forEach((c) => {
      const a = agents.find((x) => x.id === c.dataset.id);
      if (a?.work) {
        const t = c.querySelector('.timer');
        if (t) t.textContent = formatDuration(a.workSec);
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
    if (hooks.isView('overview')) hooks.updateOverviewMetrics?.();
    else if (hooks.isView('operations')) hooks.updateAgents?.();
    hooks.Scene3D?.update(16);
  }

  function tickQueues() {
    queueState.forEach((q) => {
      if (q.backlog > 0) q.longest += rnd(1, 4);
      q.avg = Math.max(15, q.avg + rnd(-3, 3));
      if (Math.random() < 0.35) q.backlog = Math.max(0, q.backlog + rnd(-1, 1));
      if (Math.random() < 0.2) q.online = Math.max(1, q.online + (Math.random() < 0.5 ? -1 : 1));
    });
    if (hooks.isView('overview')) hooks.updateOverviewMetrics?.();
    else if (hooks.isView('operations')) {
      const root = hooks.activePanelEl?.();
      const qg = root?.querySelector('#sec-queues .qgrid');
      if (qg && hooks.queueCard) qg.innerHTML = queueState.map(hooks.queueCard).join('');
    }
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
        hooks.updateAgents?.();
        hooks.updateRoomPanel?.();
      } else if (hooks.isView('overview')) {
        hooks.updateRoomPanel?.();
      }
    }
  }

  setInterval(tickWork, 1000);
  setInterval(tickAgents, 3000);
  setInterval(tickQueues, 5000);
  setInterval(maybeFlag, 16000);
}

function formatDuration(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function createMockProvider() {
  return {
    source: 'mock',
    capabilities: MOCK_CAPABILITIES,
    getAgents,
    getQueues,
    getLegacyBindings,
    startSimulation,
  };
}
