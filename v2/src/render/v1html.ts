// Near-verbatim ports of the v1 detail-panel and directory HTML builders from
// src/app-main.js. They read the same globals installDataLayer populates
// (AGENTS, queueState, QUEUES, STATUS, CH_LBL, SKILLS, …) and reuse the same
// @core helpers, so the rendered markup matches v1 exactly. React injects the
// returned strings and runs the afterMount wiring via effects.
import { isLiveDataMode } from '@core/data/mode.js';
import { buildAgentQueueSummaries } from '@core/agent-queue-summary.js';
import { formatDurationMin, formatDurationSec, formatWorkTimer } from '@core/ui/duration.js';
import { channelIconTileHtml, sfIconTileHtml, skillIconTileHtml, colorFromString } from '@core/ui/sf-icons.js';
import { openSkillEditor } from '@core/ui/skill-edit.js';
import { setHTML } from '@core/ui/reconcile-grid.js';
import { ringSVG, agentRingFaceHTML, agentAvatarHTML } from './cardHtml';
import { getProvider, getWorkShared } from '../store/panoramaStore';
import type { Agent, Queue, Skill, WorkItem } from '../core/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
const G = globalThis as any;

export interface DetailRender {
  head: string;
  body: string;
  actions?: string;
  afterMount?: (root: HTMLElement, ctx: DetailCtx) => void;
}
export interface DetailCtx {
  openAgent: (id: string) => void;
  openQueue: (id: string) => void;
  openSkill: (id: string) => void;
}

export function detailEsc(s: unknown): string {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const esc = detailEsc;

function pColor(p: number): string {
  return p < 0.5 ? 'var(--ok)' : p < 0.8 ? 'var(--watch)' : 'var(--alert)';
}
function timelineLane(b: any[]): string {
  return `<div class="tl-track">${b.map((x) => `<div class="tl-block" style="left:${x.l}%;width:${x.w}%;background:${x.c}">${x.w > 9 ? x.t : ''}</div>`).join('')}<div class="tl-now" style="left:88%"></div></div>`;
}
function qById(id: string): Queue | undefined {
  return (G.QUEUES as Queue[]).find((q) => q.id === id);
}
export function findAgent(id: string): Agent | undefined {
  return getProvider().getAgentById(id) || (G.AGENTS as Agent[]).find((x) => x.id === id);
}

/* ───────── Agent detail ───────── */
export function renderAgentDetail(config: { id: string }): DetailRender | null {
  const a = findAgent(config.id);
  if (!a) return null;
  const st = G.STATUS[a.status];
  const live = isLiveDataMode();
  const queueSummaries = buildAgentQueueSummaries(a, G.QUEUES);
  const assignedQueueWorkItemHTML = (w: any) => {
    const label = live ? (w.label || 'Work item') : (w.t || 'Work item');
    const channelKey = w.channelKey || 'cas';
    const detail = live ? (w.subject || G.CH_LBL[channelKey] || w.channel || 'Work item') : (G.CH_LBL[channelKey] || 'Work item');
    const age = live ? w.ageMin : w.age;
    return `<div class="assigned-queue-work-item">
      <div class="assigned-queue-work-icon">${channelIconTileHtml(channelKey, { size: 24 })}</div>
      <div class="assigned-queue-work-copy"><div class="assigned-queue-work-title">${esc(label)}</div><div class="assigned-queue-work-meta">${esc(detail)}</div></div>
      ${age == null ? '' : `<span class="assigned-queue-work-age mono">${formatDurationMin(age)}</span>`}
    </div>`;
  };
  const assignedQueuesHTML = queueSummaries.length
    ? `<div class="assigned-queue-list">${queueSummaries.map((q: any) => `<div class="assigned-queue-row">
      <div class="assigned-queue-head">
        <div class="assigned-queue-name">${sfIconTileHtml('queue', { size: 20, bg: colorFromString(q.name) })}<span>${esc(q.name)}</span></div>
        <span class="assigned-queue-count">${q.workItems.length} active</span>
      </div>
      <div class="assigned-queue-work">${q.workItems.length ? q.workItems.map(assignedQueueWorkItemHTML).join('') : '<div class="assigned-queue-empty">No active work in this queue</div>'}</div>
    </div>`).join('')}</div>`
    : '<span style="color:var(--faint)">No queue membership data</span>';
  const salesforceLink = a.recordUrl
    ? `<a class="dr-action-link" href="${esc(a.recordUrl)}" target="_blank" rel="noopener noreferrer">View in Salesforce</a>`
    : '';
  const caps = getProvider().capabilities || ({} as any);
  const skillsBtn = caps.canChangeSkills ? `<button class="js-edit-skills" data-agent="${esc(a.id)}">✦ Canviar skills</button>` : '';
  // Reassign / flag / queues have no backend yet → mock-only, mirroring v1.
  const mockActions = live ? '' : '<button class="primary">⚑ Atendre bandera</button><button>↪ Reassignar</button><button>≋ Canviar cues</button>';
  const drawerActions = live ? `${salesforceLink}${skillsBtn}` : `${salesforceLink}${mockActions}${skillsBtn}`;
  const liveItems = live && Array.isArray(a.work) ? (a.work as any[]) : [];
  const workSection = liveItems.length > 0
    ? `<section><h4>Active work (${liveItems.length})</h4><div class="worklist">${liveItems.map((w) => {
      const chLabel = G.CH_LBL[w.channelKey] || w.channel || 'Channel';
      const queuePill = w.queue ? `<span class="pill-q">${sfIconTileHtml('queue', { size: 14, bg: colorFromString(w.queue) })}<span style="color:${colorFromString(w.queue)}">${esc(w.queue)}</span></span>` : '';
      const subj = w.subject ? `<div class="m">${esc(w.subject)}</div>` : `<div class="m">${esc(chLabel)}</div>`;
      return `<div class="wi"><div class="wic wic--sf">${channelIconTileHtml(w.channelKey, { size: 32 })}</div><div class="info"><div class="t">${esc(w.label)}</div>${subj}</div>${queuePill}<span class="age mono">${formatDurationMin(w.ageMin)}</span></div>`;
    }).join('')}</div></section>`
    : '';

  return {
    head: `<div class="dr-id"><div class="ring ${a.status === 'busy' ? 'breathe' : ''}" style="--st:${st.c};width:58px;height:58px">${ringSVG(a.used, a.max, st.c, 58)}${agentRingFaceHTML(a)}</div>
        <div><div class="nm">${esc(a.name)}</div><div class="rl">${esc(a.role)}</div><div class="status-pill" style="color:${st.c};background:color-mix(in srgb,${st.c} 12%,transparent)"><i style="background:${st.c}"></i>${st.lbl}</div></div></div>`,
    actions: drawerActions,
    body: `<section><h4>Resum d'activitat</h4><div class="stat-grid">
        <div class="s"><div class="v" style="color:${st.c}">${a.used}/${a.max}</div><div class="k">Capacitat</div></div>
        <div class="s"><div class="v">${a.status === 'offline' ? '—' : formatDurationMin(a.loginMin || 0)}</div><div class="k">Loguejat</div></div>
        ${live ? '' : `<div class="s"><div class="v">${a.lastAccept == null ? '—' : formatDurationMin(a.lastAccept)}</div><div class="k">Última feina</div></div>`}
      </div></section>
      <section><h4>Skills</h4><div class="skill-list" id="agentSkillList"><div class="assigned-queue-empty">Carregant skills…</div></div></section>
      <section><h4>Assigned queues</h4>${assignedQueuesHTML}</section>
      ${workSection}`,
    afterMount(root) {
      const editBtn = root.querySelector('.js-edit-skills') as HTMLElement | null;
      if (editBtn) editBtn.addEventListener('click', () => openSkillEditor(editBtn.dataset.agent, { onSaved: () => {} }));
      const list = root.querySelector('#agentSkillList');
      if (!list) return;
      if (Array.isArray(a.skills)) { setHTML(list, agentSkillRowsHTML(a.skills)); return; }
      Promise.resolve(getProvider().getAgentSkills(config.id))
        .then((skills) => { setHTML(list, agentSkillRowsHTML(skills || [])); })
        .catch((err) => { setHTML(list, `<div class="assigned-queue-empty" style="color:var(--alert)">No s'han pogut carregar els skills: ${esc(err.message)}</div>`); });
    },
  };
}

const SKILL_DATE_FMT = new Intl.DateTimeFormat('ca-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
function formatSkillDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : SKILL_DATE_FMT.format(d);
}
function agentSkillRowsHTML(list: any[]): string {
  if (!list.length) return '<div class="assigned-queue-empty">Aquest agent no té cap skill assignat</div>';
  return list.map((s) => {
    const level = s.level == null ? null : Number(s.level);
    const levelPill = level == null ? '' : `<span class="skill-level-pill">Nivell ${esc(String(level))}</span>`;
    return `<div class="skill-row">
      <div class="skill-row-head">
        <div class="skill-row-name">${skillIconTileHtml({ size: 20, name: s.name })}<span>${esc(s.name)}</span>${s.type ? `<span class="skill-type-tag">${esc(s.type)}</span>` : ''}</div>
        ${levelPill}
      </div>
      <dl class="skill-meta">
        <div><dt>Data d'inici</dt><dd class="mono">${esc(formatSkillDate(s.startDate))}</dd></div>
        <div><dt>Última modificació</dt><dd class="mono">${esc(formatSkillDate(s.lastModifiedDate))}</dd></div>
        <div><dt>Modificat per</dt><dd>${esc(s.lastModifiedBy || '—')}</dd></div>
      </dl>
    </div>`;
  }).join('');
}

/* ───────── Queue helpers + detail ───────── */
function agentsInQueue(queueId: string): Agent[] {
  return (G.AGENTS as Agent[]).filter((a) => (a.queues || []).includes(queueId));
}
function activeWorkInQueue(q: Queue, live: boolean): any[] {
  const members = agentsInQueue(q.id);
  if (live) {
    const items: any[] = [];
    members.forEach((a) => {
      (Array.isArray(a.work) ? (a.work as any[]) : []).forEach((w) => {
        if (w.queueId === q.id || w.queue === q.name) items.push({ ...w, agent: a });
      });
    });
    return items;
  }
  return members.filter((a: any) => a.work && a.work.q === q.id).map((a: any) => ({ agent: a, work: a.work, ageMin: a.workSec }));
}
function queuedWorkForQueue(list: WorkItem[], queueId: string): WorkItem[] {
  return (list || []).filter((w) => w.status === 'queued' && w.queueId === queueId).sort((a, b) => (Number(b.ageSec) || 0) - (Number(a.ageSec) || 0));
}
function queueWaitingWorkRowHTML(w: WorkItem): string {
  const channelKey = w.channelKey || 'cas';
  const label = w.subject || 'Work item';
  const detail = G.CH_LBL[channelKey] || 'Work item';
  return `<div class="queue-agent-row queue-waiting-row">
    <div class="assigned-queue-work-icon">${channelIconTileHtml(channelKey, { size: 24 })}</div>
    <div class="queue-agent-copy"><div class="queue-agent-name">${esc(label)}</div><div class="queue-agent-role">${esc(detail)}</div></div>
    <span class="assigned-queue-work-age mono">${formatWorkTimer(Number(w.ageSec) || 0)}</span>
  </div>`;
}
export function queueWaitingWorkListHTML(items: WorkItem[]): string {
  if (!items.length) return '<div class="assigned-queue-empty">No items waiting in this queue</div>';
  return items.map(queueWaitingWorkRowHTML).join('');
}
function sortedQueueMembers(queueId: string): Agent[] {
  const order: Record<string, number> = { online: 0, busy: 1, away: 2, offline: 3 };
  return agentsInQueue(queueId).slice().sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.name.localeCompare(b.name));
}
function queueMemberRowsHTML(members: Agent[]): string {
  if (!members.length) return '<div class="assigned-queue-empty">No agents assigned to this queue</div>';
  return members.map((a) => {
    const st = G.STATUS[a.status] || G.STATUS.offline;
    return `<button type="button" class="queue-agent-row" data-agent-id="${esc(a.id)}">
      <div class="queue-agent-av">${agentAvatarHTML(a, 'ag-av')}<i class="ag-dot" style="background:${st.c}"></i></div>
      <div class="queue-agent-copy"><div class="queue-agent-name">${esc(a.name)}</div><div class="queue-agent-role">${esc(a.role)}</div></div>
      <span class="status-pill" style="color:${st.c};background:color-mix(in srgb,${st.c} 12%,transparent)"><i style="background:${st.c}"></i>${st.lbl}</span>
    </button>`;
  }).join('');
}
function queueActiveWorkRowsHTML(workItems: any[], live: boolean): string {
  if (!workItems.length) return '<div class="assigned-queue-empty">No active work in this queue</div>';
  return workItems.map((item) => {
    const w = live ? item : item.work;
    const a = item.agent;
    const channelKey = w.channelKey || 'cas';
    const label = live ? (w.label || 'Work item') : (w.t || 'Work item');
    const detail = live ? (w.subject || G.CH_LBL[channelKey] || w.channel || 'Work item') : (G.CH_LBL[channelKey] || 'Work item');
    const age = live ? w.ageMin : item.ageMin;
    return `<button type="button" class="queue-agent-row" data-agent-id="${esc(a.id)}">
      <div class="assigned-queue-work-icon">${channelIconTileHtml(channelKey, { size: 24 })}</div>
      <div class="queue-agent-copy"><div class="queue-agent-name">${esc(label)}</div><div class="queue-agent-role">${esc(a.name)} · ${esc(detail)}</div></div>
      ${age == null ? '' : `<span class="assigned-queue-work-age mono">${formatDurationMin(age)}</span>`}
    </button>`;
  }).join('');
}
export function renderQueueDetail(config: { id: string }): DetailRender | null {
  const q = (G.queueState as Queue[]).find((x) => x.id === config.id);
  if (!q) return null;
  const live = isLiveDataMode();
  const cap = (q.online || 0) * 5 || 1;
  const pressure = Math.min(1, (q.backlog || 0) / cap);
  const members = sortedQueueMembers(q.id);
  const workItems = activeWorkInQueue(q, live);
  return {
    head: `<div class="dr-id">${sfIconTileHtml('queue', { size: 58, bg: colorFromString(q.name) })}
        <div><div class="nm">${esc(q.name)}</div><div class="rl">Queue</div>
          <div class="status-pill" style="color:${colorFromString(q.name)};background:color-mix(in srgb,${colorFromString(q.name)} 12%,transparent)"><i style="background:${colorFromString(q.name)}"></i>${q.online} agents online</div>
        </div>
      </div>`,
    body: `<section><h4>Queue health</h4>
        <div class="pressure queue-drawer-pressure"><span style="width:${Math.max(6, pressure * 100)}%;background:${pColor(pressure)}"></span></div>
        <div class="stat-grid" style="margin-top:14px">
          <div class="s"><div class="v ${(q.backlog || 0) > 8 ? 'warn' : ''}">${q.backlog}</div><div class="k">Backlog</div></div>
          <div class="s"><div class="v ${(q.longest || 0) > 150 ? 'warn' : ''}">${formatDurationSec(q.longest || 0, { short: true })}</div><div class="k">Longest wait</div></div>
          <div class="s"><div class="v">${formatDurationSec(q.avg || 0, { short: true })}</div><div class="k">Average wait</div></div>
          <div class="s"><div class="v">${q.online}</div><div class="k">Online agents</div></div>
        </div>
      </section>
      <section><h4>Waiting in queue (<span id="queueWaitingCount">${q.backlog}</span>)</h4><div class="queue-agent-list" id="queueWaitingList"><div class="assigned-queue-empty">Loading…</div></div></section>
      <section><h4>Active work (${workItems.length})</h4><div class="queue-agent-list">${queueActiveWorkRowsHTML(workItems, live)}</div></section>
      <section><h4>Assigned agents (${members.length})</h4><div class="queue-agent-list">${queueMemberRowsHTML(members)}</div></section>`,
    afterMount(root, ctx) {
      root.querySelectorAll('[data-agent-id]').forEach((el) => el.addEventListener('click', () => ctx.openAgent((el as HTMLElement).dataset.agentId!)));
      const listEl = root.querySelector('#queueWaitingList');
      const countEl = root.querySelector('#queueWaitingCount');
      if (!listEl) return;
      getWorkShared()
        .then((all) => {
          const waiting = queuedWorkForQueue(all, config.id);
          // setHTML: a re-poll that returns identical waiting items leaves the
          // list (and its entity icons) untouched instead of rebuilding it.
          setHTML(listEl, queueWaitingWorkListHTML(waiting));
          if (countEl) { const n = String(waiting.length); if (countEl.textContent !== n) countEl.textContent = n; }
        })
        .catch((err) => { setHTML(listEl, `<div class="assigned-queue-empty" style="color:var(--alert)">Could not load waiting items: ${esc(err.message)}</div>`); });
    },
  };
}

/* ───────── Skill catalog + detail ───────── */
let skillCache: Skill[] = [];
let skillCatalogPromise: Promise<Skill[]> | null = null;
export function ensureSkillCatalog(): Promise<Skill[]> {
  if (skillCatalogPromise) return skillCatalogPromise;
  skillCatalogPromise = Promise.resolve(getProvider().getSkills()).then((list) => {
    skillCache = Array.isArray(list) ? list.slice() : [];
    return skillCache;
  }).catch((err) => { skillCatalogPromise = null; throw err; });
  return skillCatalogPromise;
}
function findSkill(id: string): Skill | null {
  return skillCache.find((s) => s.id === id) || (G.SKILLS as Skill[] || []).find((s) => s.id === id) || null;
}
function skillAgentRowsHTML(list: Agent[]): string {
  if (!list.length) return '<div class="assigned-queue-empty">Cap agent qualificat per aquest skill</div>';
  const order: Record<string, number> = { online: 0, busy: 1, away: 2, offline: 3 };
  const sorted = list.slice().sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.name.localeCompare(b.name));
  return sorted.map((a) => {
    const st = G.STATUS[a.status] || G.STATUS.offline;
    return `<button type="button" class="queue-agent-row" data-agent-id="${esc(a.id)}">
      <div class="queue-agent-av">${agentAvatarHTML(a, 'ag-av')}<i class="ag-dot" style="background:${st.c}"></i></div>
      <div class="queue-agent-copy"><div class="queue-agent-name">${esc(a.name)}</div><div class="queue-agent-role">${esc(a.role || 'Agent')}</div></div>
      <span class="status-pill" style="color:${st.c};background:color-mix(in srgb,${st.c} 12%,transparent)"><i style="background:${st.c}"></i>${st.lbl}</span>
    </button>`;
  }).join('');
}
export function renderSkillDetail(config: { id: string; name?: string }): DetailRender {
  const s = findSkill(config.id);
  if (!s) {
    const title = config.name || 'Skill';
    return {
      head: `<div class="dr-id">${skillIconTileHtml({ size: 58, name: title })}<div><div class="nm">${esc(title)}</div><div class="rl">Skill</div></div></div>`,
      body: '<p style="color:var(--faint)">Loading skill…</p>',
    };
  }
  const backlog = Number(s.backlog) || 0;
  const agentCount = Number(s.agents) || 0;
  const bColor = backlog === 0 ? 'var(--ok)' : backlog < 4 ? 'var(--watch)' : 'var(--alert)';
  return {
    head: `<div class="dr-id">${skillIconTileHtml({ size: 58, name: s.name })}
        <div><div class="nm">${esc(s.name)}</div><div class="rl">${s.type ? esc(s.type) : 'Skill'}</div>
          <div class="status-pill" style="color:${bColor};background:color-mix(in srgb,${bColor} 12%,transparent)"><i style="background:${bColor}"></i>${backlog} pendent${backlog === 1 ? '' : 's'}</div>
        </div>
      </div>`,
    body: `<section><h4>Resum</h4><div class="stat-grid">
        <div class="s"><div class="v">${agentCount}</div><div class="k">Agents qualificats</div></div>
        <div class="s"><div class="v ${backlog > 4 ? 'warn' : ''}" style="color:${bColor}">${backlog}</div><div class="k">Backlog</div></div>
      </div></section>
      <section><h4>Agents qualificats</h4><div class="queue-agent-list" id="skillAgentList"><div class="assigned-queue-empty">Carregant agents…</div></div></section>`,
    afterMount(root, ctx) {
      const list = root.querySelector('#skillAgentList');
      if (!list) return;
      Promise.resolve(getProvider().getSkillAgents(config.id))
        .then((agentsList) => {
          // Only re-wire row clicks when setHTML actually rebuilt the list; an
          // unchanged poll keeps the existing nodes and their listeners.
          if (setHTML(list, skillAgentRowsHTML(agentsList || []))) {
            list.querySelectorAll('[data-agent-id]').forEach((el) => el.addEventListener('click', () => ctx.openAgent((el as HTMLElement).dataset.agentId!)));
          }
        })
        .catch((err) => { setHTML(list, `<div class="assigned-queue-empty" style="color:var(--alert)">No s'han pogut carregar els agents: ${esc(err.message)}</div>`); });
    },
  };
}

/* ───────── Directory grids ───────── */
/** Queues page: the filtered + pressure-sorted queue list (one card each). */
export function queueDirectorySorted(list: Queue[], filter: string): Queue[] {
  const match = (q: Queue) => {
    if (filter === 'backlog') return (q.backlog || 0) > 0;
    if (filter === 'empty') return (q.backlog || 0) === 0;
    return true;
  };
  const pressureOf = (q: Queue) => Math.min(1, (q.backlog || 0) / ((q.online || 0) * 5 || 1));
  return (list || []).filter(match).slice().sort((a, b) => pressureOf(b) - pressureOf(a) || a.name.localeCompare(b.name));
}

/** Markup for a single Queues-page card. Carries data-id for keyed reconcile. */
export function queueDirectoryCardHTML(q: Queue, waitingByQueue: Record<string, WorkItem[]>): string {
  const live = isLiveDataMode();
  const cap = (q.online || 0) * 5 || 1;
  const pressure = Math.min(1, (q.backlog || 0) / cap);
  const members = sortedQueueMembers(q.id);
  const workItems = activeWorkInQueue(q, live);
  const waiting = waitingByQueue[q.id] || [];
  return `<div class="qdir-card" data-id="${esc(q.id)}">
      <div class="qdir-head" data-id="${esc(q.id)}" role="button" tabindex="0">
        <span class="qn" style="color:${colorFromString(q.name)}">${sfIconTileHtml('queue', { size: 22, bg: colorFromString(q.name) })}${esc(q.name)}</span>
        <span class="qa"><i></i><b class="mono">${q.online}</b> online</span>
      </div>
      <div class="pressure"><span style="width:${Math.max(6, pressure * 100)}%;background:${pColor(pressure)}"></span></div>
      <div class="qmetrics">
        <div class="m"><div class="v ${(q.backlog || 0) > 8 ? 'warn' : ''}">${q.backlog}</div><div class="k">Backlog</div></div>
        <div class="m"><div class="v ${(q.longest || 0) > 150 ? 'warn' : ''}">${formatDurationSec(q.longest || 0, { short: true })}</div><div class="k">Espera màx</div></div>
        <div class="m"><div class="v">${formatDurationSec(q.avg || 0, { short: true })}</div><div class="k">Espera mitj.</div></div>
      </div>
      <section><h4>En espera (${waiting.length})</h4><div class="queue-agent-list">${queueWaitingWorkListHTML(waiting)}</div></section>
      <section><h4>Feina activa (${workItems.length})</h4><div class="queue-agent-list">${queueActiveWorkRowsHTML(workItems, live)}</div></section>
      <section><h4>Agents assignats (${members.length})</h4><div class="queue-agent-list">${queueMemberRowsHTML(members)}</div></section>
    </div>`;
}

export function queueDirectoryGridHTML(list: Queue[], filter: string, waitingByQueue: Record<string, WorkItem[]>): string {
  const sorted = queueDirectorySorted(list, filter);
  if (!sorted.length) return '<p style="color:var(--faint)">Cap cua coincideix.</p>';
  return sorted.map((q) => queueDirectoryCardHTML(q, waitingByQueue)).join('');
}
export function waitingWorkByQueue(allWork: WorkItem[]): Record<string, WorkItem[]> {
  const map: Record<string, WorkItem[]> = {};
  (allWork || []).forEach((w) => {
    if (w.status !== 'queued' || !w.queueId) return;
    (map[w.queueId] ||= []).push(w);
  });
  Object.values(map).forEach((items) => items.sort((a, b) => (Number(b.ageSec) || 0) - (Number(a.ageSec) || 0)));
  return map;
}

export function skillCardHTML(s: Skill): string {
  const backlog = Number(s.backlog) || 0;
  const agents = Number(s.agents) || 0;
  const bColor = backlog === 0 ? 'var(--ok)' : backlog < 4 ? 'var(--watch)' : 'var(--alert)';
  return `<button type="button" class="ag-card sk-card" data-skill-id="${esc(s.id)}">
    <div class="ag-card-av">${skillIconTileHtml({ size: 22, name: s.name })}</div>
    <div class="ag-card-body">
      <div class="ag-card-name">${esc(s.name)}</div>
      <div class="ag-card-role">${agents} agent${agents === 1 ? '' : 's'} qualificat${agents === 1 ? '' : 's'}</div>
    </div>
    <span class="ag-card-status" style="color:${bColor};background:color-mix(in srgb,${bColor} 12%,transparent)"><i style="background:${bColor}"></i>${backlog} pendent${backlog === 1 ? '' : 's'}</span>
  </button>`;
}
export interface SkillGroup { key: string; typeName: string; skills: Skill[]; }

/** Skills page grouped by type, type order preserved, backlog-heaviest first. */
export function skillGroups(list: Skill[]): SkillGroup[] {
  const groups = new Map<string, Skill[]>();
  list.forEach((s) => {
    const key = s.type || '_none';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  });
  return [...groups.entries()].map(([key, skills]) => ({
    key,
    typeName: key === '_none' ? 'Sense tipus' : key,
    skills: skills.slice().sort((a, b) => (Number(b.backlog) || 0) - (Number(a.backlog) || 0) || a.name.localeCompare(b.name)),
  }));
}

/** Markup for one skill-type group. Carries data-id for keyed reconcile. */
export function skillGroupHTML(g: SkillGroup): string {
  return `<section class="sk-group" data-id="${esc(g.key)}"><h4>${esc(g.typeName)} <span class="cnt">${g.skills.length}</span></h4><div class="grid ag-grid">${g.skills.map(skillCardHTML).join('')}</div></section>`;
}

export function skillsGroupedHTML(list: Skill[]): string {
  if (!list.length) return '<p style="color:var(--faint)">No skills found.</p>';
  return skillGroups(list).map(skillGroupHTML).join('');
}

export function workItemRowHTML(w: WorkItem): string {
  const q = w.queueId ? qById(w.queueId) : undefined;
  const ag = w.agentId ? findAgent(w.agentId) : null;
  const assignee = ag ? ag.name : '<span style="color:var(--faint)">A la cua</span>';
  const qName = q ? q.name : '—';
  const qColor = q ? colorFromString(q.name) : 'var(--faint)';
  return `<div class="wi">
    <div class="wic wic--sf">${channelIconTileHtml(w.channelKey || '', { size: 32 })}</div>
    <div class="info"><div class="t">${esc(w.subject)}</div><div class="m">${G.CH_LBL[w.channelKey || ''] || 'Canal'} · ${assignee}</div></div>
    <span class="pill-q">${sfIconTileHtml('queue', { size: 14, bg: qColor })}<span style="color:${qColor}">${esc(qName)}</span></span>
    <span class="age mono">${formatWorkTimer(Number(w.ageSec) || 0)}</span>
  </div>`;
}
export interface WorkGroup { key: string; items: WorkItem[]; name: string; color: string; }

/** Work page grouped by queue, queued-before-active, oldest first. */
export function workGroups(list: WorkItem[]): WorkGroup[] {
  const sorted = list.slice().sort((a, b) =>
    (a.queueId || '').localeCompare(b.queueId || '') ||
    (a.status === b.status ? 0 : a.status === 'queued' ? -1 : 1) ||
    (Number(b.ageSec) || 0) - (Number(a.ageSec) || 0));
  const groups = new Map<string, WorkItem[]>();
  sorted.forEach((w) => {
    const key = w.queueId || '_none';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(w);
  });
  return [...groups.entries()].map(([key, items]) => {
    const q = qById(key);
    return { key, items, name: q ? q.name : 'Sense cua', color: q ? colorFromString(q.name) : 'var(--faint)' };
  });
}

/** Markup for one work queue-group. Carries data-id for keyed reconcile. */
export function workGroupHTML(g: WorkGroup): string {
  return `<section class="wk-group" data-id="${esc(g.key)}"><h4 style="color:${g.color}">${esc(g.name)} <span class="cnt">${g.items.length}</span></h4><div class="worklist">${g.items.map(workItemRowHTML).join('')}</div></section>`;
}

export function workListHTML(list: WorkItem[]): string {
  if (!list.length) return '<p style="color:var(--faint)">No work items in flight.</p>';
  return workGroups(list).map(workGroupHTML).join('');
}

export { timelineLane };

/* ───────── Recents resolver (for the search "Recent" list) ───────── */
export interface DetailSnapshot {
  kind: 'agent' | 'queue' | 'skill';
  id: string;
  title: string;
  meta: string;
  status?: string;
  flag?: boolean;
  color?: string;
  backlog?: number;
  online?: number;
  agents?: number;
}
export function resolveDetailSnapshot(config: { kind: string; id: string; name?: string }): DetailSnapshot | null {
  const { kind, id } = config;
  if (kind === 'agent') {
    const a = findAgent(id);
    if (!a) return null;
    return { kind: 'agent', id: a.id, title: a.name, meta: a.role || 'Agent', status: a.status, flag: Boolean(a.flag) };
  }
  if (kind === 'queue') {
    const q = (G.queueState as Queue[]).find((x) => x.id === id);
    if (!q) return null;
    return { kind: 'queue', id: q.id, title: q.name, meta: `${q.backlog || 0} backlog · ${q.online || 0} online`, backlog: q.backlog, online: q.online };
  }
  if (kind === 'skill') {
    const s = findSkill(id);
    if (s) return { kind: 'skill', id: s.id, title: s.name, meta: s.type || `${s.agents || 0} agents`, agents: Number(s.agents) || 0 };
    if (config.name) return { kind: 'skill', id, title: config.name, meta: 'Skill', agents: 0 };
  }
  return null;
}

/** Tab-bar icon for a detail tab — matches v1 (agent → avatar, queue/skill → tile). */
export function detailTabIconHTML(target: { kind: string; id: string; name?: string }): string {
  if (target.kind === 'agent') {
    const a = findAgent(target.id);
    return a ? agentAvatarHTML(a, 'ws-tab-av') : sfIconTileHtml('user', { size: 18, className: 'sf-icon-tile ws-tab-icon-tile' });
  }
  if (target.kind === 'queue') {
    const q = (G.queueState as Queue[]).find((x) => x.id === target.id);
    const name = q?.name || target.name || '';
    return sfIconTileHtml('queue', { size: 18, bg: colorFromString(name), className: 'sf-icon-tile ws-tab-icon-tile' });
  }
  const s = findSkill(target.id);
  return skillIconTileHtml({ size: 18, name: s?.name || target.name || '', className: 'sf-icon-tile ws-tab-icon-tile' });
}

/** Icon markup for a recent/search entry by kind. */
export function snapshotIconHTML(kind: string, id: string, title: string): string {
  if (kind === 'agent') {
    const a = findAgent(id);
    return a ? agentAvatarHTML(a, 'si-av') : sfIconTileHtml('user', { size: 24 });
  }
  if (kind === 'queue') return sfIconTileHtml('queue', { size: 24, bg: colorFromString(title) });
  return skillIconTileHtml({ size: 24, name: title });
}
