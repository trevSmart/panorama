// Faithful ports of the card inner-markup builders from src/app-main.js, reusing
// the very same @core render helpers (icons, durations, photos) so the visual
// output matches the v1 app exactly. React owns the keyed outer element (which is
// what preserves scroll across polls); these build the inner HTML it injects.
import { agentPhotoSrc } from '@core/data/agent-photos.js';
import { teamOf } from '@core/data/floor-layout.js';
import { colorFromString, sfIconTileHtml, channelIconTileHtml } from '@core/ui/sf-icons.js';
import { formatDurationMin, formatDurationSec, formatWorkTimer } from '@core/ui/duration.js';
import { isLiveDataMode } from '@core/data/mode.js';
import { getBindings } from '../store/panoramaStore';
import type { Agent, Queue, StatusMeta } from '../core/types';

const initials = (n: string): string => n.split(' ').map((w) => w[0]).slice(0, 2).join('');

function statusOf(a: Agent): StatusMeta {
  const STATUS = getBindings().STATUS;
  return STATUS[a.status] || STATUS.offline;
}

/** Status accent colour for an agent (drives the card's --st CSS var). */
export const statusColor = (a: Agent): string => statusOf(a).c;
export const statusMeta = (status: string): StatusMeta => {
  const STATUS = getBindings().STATUS;
  return STATUS[status] || STATUS.offline;
};

function queueName(id: string): string {
  const QUEUES = getBindings().QUEUES;
  return QUEUES.find((q) => q.id === id)?.name ?? id;
}

const avatarImgOnError = "this.parentElement.classList.add('av--initials');this.remove()";

function agentAvatarInnerHTML(a: Agent): string {
  const src = agentPhotoSrc(a);
  const ini = initials(a.name);
  if (!src) return `<span>${ini}</span>`;
  return `<span class="av-ini">${ini}</span><img src="${src}" alt="" loading="lazy" onerror="${avatarImgOnError}">`;
}

export function agentRingFaceHTML(a: Agent): string {
  const src = agentPhotoSrc(a);
  return `<div class="face${src ? '' : ' av--initials'}" style="background:${colorFromString(a.name)}">${agentAvatarInnerHTML(a)}</div>`;
}

export function ringSVG(used: number, max: number, color: string, size = 48): string {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const f = max ? (used || 0) / max : 0;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="3.5"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - f)}" style="transition:stroke-dashoffset .6s var(--ease)"/></svg>`;
}

/** Inner markup of an Operations agent card. Outer `.card` is the React element. */
export function agentCardInner(a: Agent): string {
  const st = statusOf(a);
  const chans = a.chans || {};
  const chanCells = ['veu', 'chat', 'wa', 'cas'].map((c) => {
    const n = chans[c] || 0;
    return `<div class="c ${n > 0 ? 'active' : 'zero'}">${channelIconTileHtml(c, { size: 21 })}<div class="n">${n}</div></div>`;
  }).join('');
  const showChans = !isLiveDataMode() || ['veu', 'chat', 'wa', 'cas'].some((c) => (chans[c] || 0) > 0);
  const segs = Array.from({ length: a.max }).map((_, i) => `<span style="flex:1;background:${i < a.used ? st.c : 'transparent'}"></span>`).join('');
  const work = a.work as { channelKey?: string; t?: string; q?: string } | null | undefined;
  const workRow = isLiveDataMode()
    ? `<div class="work"><div class="wic wic--sf">${sfIconTileHtml('work', { size: 26 })}</div><div class="wt">${a.used > 0 ? `${a.used} open work item(s)` : 'No active work'}</div></div>`
    : (work
      ? `<div class="work"><div class="wic wic--sf">${channelIconTileHtml(work.channelKey || '', { size: 26 })}</div><div class="wt"><b>${work.t}</b> · ${queueName(work.q as string)}</div><div class="timer mono">${formatWorkTimer(a.workSec || 0)}</div></div>`
      : `<div class="work"><div class="wic wic--sf">${sfIconTileHtml('work', { size: 26, bg: '#C9C7CD' })}</div><div class="wt">Sense feina activa</div></div>`);
  return `
    ${a.flag ? '<div class="flag-badge">⚑ AJUDA</div>' : ''}
    <div class="card-top">
      <div class="ring ${a.status === 'busy' ? 'breathe' : ''}">${ringSVG(a.used, a.max, st.c)}${agentRingFaceHTML(a)}</div>
      <div class="who"><div class="nm">${a.name}</div><div class="rl">${a.role || ''}</div>
        <div class="status-pill" style="color:${st.c};background:color-mix(in srgb,${st.c} 12%,transparent)"><i style="background:${st.c}"></i>${st.lbl}</div></div>
    </div>
    <div class="cap"><div class="cap-head"><span>Capacitat</span><b>${a.used} / ${a.max}</b></div><div class="cap-bar">${segs}</div></div>
    ${showChans ? `<div class="chan">${chanCells}</div>` : ''}
    ${workRow}
    <div class="foot"><span>Loguejat <b class="mono">${a.status === 'offline' ? '—' : formatDurationMin(a.loginMin || 0)}</b></span>${isLiveDataMode() ? '' : `<span>Última feina <b class="mono">${a.lastAccept == null ? '—' : formatDurationMin(a.lastAccept)}</b></span>`}</div>`;
}

export function agentAvatarHTML(a: Agent, className = 'tip-av'): string {
  const src = agentPhotoSrc(a);
  return `<div class="${className}${src ? '' : ' av--initials'}" style="background:${colorFromString(a.name)}">${agentAvatarInnerHTML(a)}</div>`;
}

/** Hover-tooltip markup for a seat (agent column) on the room render — port of v1's agentMapTipHTML. */
export function agentMapTipHTML(a: Agent): string {
  const st = statusOf(a);
  const load = a.max ? Math.round((a.used / a.max) * 100) : 0;
  const detail = a.status === 'offline' ? teamOf(a) : `${a.used}/${a.max} · ${load}% · ${teamOf(a)}`;
  return `<div class="tip-row">${agentAvatarHTML(a)}<div><div class="tn">${a.name}${a.flag ? ' ⚑' : ''}</div><div class="tm">${a.role || ''}</div><div class="tip-st" style="color:${st.c}"><i style="background:${st.c}"></i>${st.lbl}</div></div></div><div class="tl">${detail}</div>`;
}

/** Inner markup of an Agents-directory card. Outer `.ag-card` is the React element. */
export function agentDirCardInner(a: Agent): string {
  const st = statusOf(a);
  return `<div class="ag-card-av">${agentAvatarHTML(a, 'ag-av')}<i class="ag-dot" style="background:${st.c}"></i></div>
    <div class="ag-card-body">
      <div class="ag-card-name">${a.name}</div>
      <div class="ag-card-role">${a.role || 'Agent'}</div>
    </div>
    <span class="ag-card-status" style="color:${st.c};background:color-mix(in srgb,${st.c} 12%,transparent)"><i style="background:${st.c}"></i>${st.lbl}</span>`;
}

function pColor(p: number): string {
  return p < 0.5 ? 'var(--ok)' : p < 0.8 ? 'var(--watch)' : 'var(--alert)';
}

/** Inner markup of a queue card. Outer `.qcard` is the React element. */
export function queueCardInner(q: Queue): string {
  const online = q.online || 0;
  const backlog = q.backlog || 0;
  const cap = online * 5 || 1;
  const p = Math.min(1, backlog / cap);
  return `
    <div class="qtop"><span class="qn" style="color:${colorFromString(q.name)}">${sfIconTileHtml('queue', { size: 22, bg: colorFromString(q.name) })}${q.name}</span><span class="qa"><i></i><b class="mono">${online}</b> online</span></div>
    <div class="pressure"><span style="width:${Math.max(6, p * 100)}%;background:${pColor(p)}"></span></div>
    <div class="qmetrics">
      <div class="m"><div class="v ${backlog > 8 ? 'warn' : ''}">${backlog}</div><div class="k">Backlog</div></div>
      <div class="m"><div class="v ${(q.longest || 0) > 150 ? 'warn' : ''}">${formatDurationSec(q.longest || 0, { short: true })}</div><div class="k">Espera màx</div></div>
      <div class="m"><div class="v">${formatDurationSec(q.avg || 0, { short: true })}</div><div class="k">Espera mitj.</div></div>
    </div>`;
}

export { colorFromString, sfIconTileHtml };
