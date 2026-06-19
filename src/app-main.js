import { agentPhotoSrc } from './data/agent-photos.js';
import { isLiveDataMode } from './data/mode.js';
import { buildFloorsForAgents } from './data/floor-layout.js';
import { loadCustomRoomDir, saveCustomRoomDir } from './data/floor-store.js';
import { getDetailRecents, setDetailRecentResolver } from './data/detail-recent-store.js';
import { buildBuildingSVG, computeFloorLayout, gridExtents, rgbc } from './building-render.js';
import { backgroundUrl } from './data/floor-backgrounds.js';
import { registerFloorEditorPanel } from './floor-editor.js';
import { buildAgentQueueSummaries } from './agent-queue-summary.js';
import { channelIconTileHtml, channelIconName, colorFromString, sfIconColor, sfIconTileHtml, skillIconTileHtml } from './ui/sf-icons.js';
import { formatDurationMin, formatDurationSec, formatWorkTimer } from './ui/duration.js';
import {
  closeDetailDrawer,
  initDetailDrawerChrome,
  openDetailDrawer,
  refreshActiveDetail,
  registerDetailKind,
  registerDetailPanelType,
} from './ui/detail-panel.js';
import { syncDropdownPanel } from './ui/dropdown-panel.js';
import { enhanceAllSelects, syncCustomSelect } from './ui/custom-select.js';
import { devConsole } from './dev/dev-console.js';
import { consolePanel } from './dev/console-panel.js';
import {
  applyPreferencesSideEffects,
  applyPreferencesToForm,
  getRefreshConfig,
  loadPreferences,
  readPreferencesFormState,
  savePreferences,
} from './settings/preferences.js';

/* ───────── Helpers ───────── */
const initials = n => n.split(' ').map(w => w[0]).slice(0, 2).join('');
const qById = id => QUEUES.find(q => q.id === id);
const avatarImgOnError = "this.parentElement.classList.add('av--initials');this.remove()";
function agentAvatarInnerHTML(a) {
  const src = agentPhotoSrc(a);
  const ini = initials(a.name);
  if (!src) return `<span>${ini}</span>`;
  return `<span class="av-ini">${ini}</span><img src="${src}" alt="" loading="lazy" onerror="${avatarImgOnError}">`;
}
function agentRingFaceHTML(a) {
  const src = agentPhotoSrc(a);
  return `<div class="face${src ? '' : ' av--initials'}" style="background:${colorFromString(a.name)}">${agentAvatarInnerHTML(a)}</div>`;
}
function agentAvatarHTML(a, className = 'tip-av') {
  const src = agentPhotoSrc(a);
  return `<div class="${className}${src ? '' : ' av--initials'}" style="background:${colorFromString(a.name)}">${agentAvatarInnerHTML(a)}</div>`;
}
function agentMapTipHTML(a) {
  const st = STATUS[a.status];
  const load = a.max ? Math.round(a.used / a.max * 100) : 0;
  const detail = a.status === 'offline' ? teamOf(a) : `${a.used}/${a.max} · ${load}% · ${teamOf(a)}`;
  const av = agentAvatarHTML(a);
  return `<div class="tip-row">${av}<div><div class="tn">${a.name}${a.flag ? ' ⚑' : ''}</div><div class="tm">${a.role}</div><div class="tip-st" style="color:${st.c}"><i style="background:${st.c}"></i>${st.lbl}</div></div></div><div class="tl">${detail}</div>`;
}
function showRoomTip(tip, clientX, clientY) {
  if (!tip) return;
  if (tip.classList.contains('room-tip--anchored') && tip.offsetParent) {
    const r = tip.offsetParent.getBoundingClientRect();
    tip.style.left = `${clientX - r.left + 14}px`;
    tip.style.top = `${clientY - r.top + 14}px`;
  } else {
    tip.style.left = `${clientX + 14}px`;
    tip.style.top = `${clientY + 14}px`;
  }
  tip.classList.add('is-visible');
}
function hideRoomTip(tip) {
  tip?.classList.remove('is-visible');
}
function ensureRoomTip() {
  let tip = document.getElementById('roomTip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'roomTip';
    tip.className = 'room-tip';
    document.body.appendChild(tip);
  }
  return tip;
}
function mountRoomTip(anchor) {
  const tip = ensureRoomTip();
  if (!anchor) return tip;
  if (tip.parentElement !== anchor) anchor.appendChild(tip);
  tip.classList.add('room-tip--anchored');
  return tip;
}
function roomTipForCanvas(canvas) {
  return mountRoomTip(canvas?.querySelector('.room-canvas-stage'));
}
function ringSVG(used, max, color, size = 48) {
  const r = (size - 6) / 2, c = 2 * Math.PI * r, f = max ? (used || 0) / max : 0;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="3.5"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - f)}" style="transition:stroke-dashoffset .6s var(--ease)"/></svg>`;
}

/* ───────── Health computation ───────── */
function health() {
  const online = AGENTS.filter(a => a.status === 'online').length;
  const backlog = queueState.reduce((s, q) => s + (q.backlog || 0), 0);
  const longest = queueState.length ? Math.max(0, ...queueState.map(q => q.longest || 0)) : 0;
  const totCap = AGENTS.filter(a => a.status !== 'offline').reduce((s, a) => s + (a.max || 0), 0);
  const totUsed = AGENTS.reduce((s, a) => s + (a.used || 0), 0);
  const util = totCap > 0 ? Math.round(totUsed / totCap * 100) : 0;
  const flags = AGENTS.filter(a => a.flag).length;
  const sla = Math.max(70, Math.min(99, 98 - Math.round(backlog * .9) - (longest > 180 ? 6 : 0)));
  const lvl = (v, w, a) => v >= a ? 'alert' : v >= w ? 'watch' : 'ok';
  const allPillars = [
    {
      id: 'wait', view: 'queues', lbl: 'Espera', val: formatDurationSec(longest, { short: true }), raw: longest, state: lvl(longest, 150, 240),
      msg: { ok: 'dins de marge', watch: 'pujant', alert: 'per sobre del llindar' }
    },
    {
      id: 'backlog', view: 'queues', lbl: 'Backlog', val: backlog, raw: backlog, state: lvl(backlog, 18, 30),
      msg: { ok: 'estable', watch: 'creixent', alert: 'acumulant-se' }
    },
    {
      id: 'cover', view: 'agents', lbl: 'Cobertura', val: util + '%', raw: util, state: lvl(util, 82, 93),
      msg: { ok: 'folgada', watch: 'ajustada', alert: 'al límit' }
    },
    {
      id: 'sla', view: 'queues', lbl: 'SLA', val: sla + '%', raw: sla, state: sla >= 90 ? 'ok' : sla >= 80 ? 'watch' : 'alert',
      msg: { ok: 'complint', watch: 'al caire', alert: 'incomplint' }
    },
    {
      id: 'help', view: 'agents', lbl: 'Ajuda', val: flags, raw: flags, state: flags === 0 ? 'ok' : flags <= 1 ? 'watch' : 'alert',
      msg: { ok: 'cap petició', watch: '1 agent espera', alert: flags + ' agents esperen' }
    },
  ];
  const pillars = isLiveDataMode()
    ? allPillars.filter((p) => p.id !== 'sla' && p.id !== 'help')
    : allPillars;
  const worst = pillars.reduce((w, p) => ({ ok: 0, watch: 1, alert: 2 }[p.state] > { ok: 0, watch: 1, alert: 2 }[w] ? p.state : w), 'ok');
  return { online, backlog, longest, util, flags, sla, pillars, worst };
}

/* ───────── Overview ───────── */
function verdictHTML(h) {
  const attn = h.pillars.filter(p => p.state !== 'ok'); let title, sub, dot;
  if (h.worst === 'ok') { dot = 'ok'; title = 'Tot va bé.'; sub = 'Cap cosa que requereixi la teva atenció ara mateix. Pots dedicar-te a una altra cosa amb tranquil·litat.'; }
  else if (h.worst === 'watch') { dot = 'watch'; title = 'Tot bé, amb un ull a sobre.'; sub = 'Res urgent, però hi ha ' + attn.length + (attn.length === 1 ? ' indicador' : ' indicadors') + ' que val la pena vigilar: ' + attn.map(p => p.lbl.toLowerCase()).join(', ') + '.'; }
  else { const al = h.pillars.filter(p => p.state === 'alert'); dot = 'alert'; title = al.length === 1 ? 'Una cosa necessita la teva atenció.' : 'Hi ha coses per atendre.'; sub = 'Mira ' + al.map(p => p.lbl.toLowerCase()).join(' i ') + '. Toca per anar directe al detall.'; }
  return `<span class="vdot ${dot}"></span><div><h1>${title}</h1><div class="vsub">${sub}</div><div class="vmeta"><span class="live"><i></i>en directe</span><span>·</span><span><b class="mono">${h.online}</b> agents online</span><span>·</span><span><b class="mono">${QUEUES.length}</b> cues actives</span><span>·</span><span>actualitzat ara mateix</span></div></div>`;
}
function pillarsHTML(h) { return h.pillars.map(p => `<button class="pillar ${p.state !== 'ok' ? 'attn ' + p.state : ''}" onclick="Panorama.scrollTo('${p.view}')"><span class="arrow">→</span><div class="pl">${p.lbl}</div><div class="pv${String(p.val).includes(' ') ? ' long' : ''}">${p.val}</div><div class="ps"><i style="background:var(--${p.state})"></i><span>${p.msg[p.state]}</span></div></button>`).join(''); }
function roomStats() { let occ = 0, hot = 0; FLOORS.forEach(f => f.assigned.forEach(s => { const a = s.agent; if (a && a.status !== 'offline') { occ++; const L = a.max ? a.used / a.max : 0; if (L >= .8) hot++; } })); return { occ, hot }; }
function statsHTML(s) { return `<b class="mono">${s.occ}</b> ocupats · <b class="mono" style="color:${s.hot ? 'var(--alert)' : 'var(--ink)'}">${s.hot}</b> punts calents`; }
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function buildingCanvasHTML(b) {
  if (!b.viewBox) return b.svg;
  const { x, y, w, h } = b.viewBox;
  const labels = (b.anchors || []).map((a) => {
    const left = ((a.x - x) / w) * 100;
    const top = ((a.y - y) / h) * 100;
    return `<span class="floor-label" style="left:${left}%;top:${top}%">${escapeHtml(String(a.name).toUpperCase())}</span>`;
  }).join('');
  return `<div class="room-canvas-stage" style="aspect-ratio:${w} / ${h}">${b.svg}<div class="floor-labels" aria-hidden="true">${labels}</div></div>`;
}
function legendHTML() { return `<div class="lg-group"><div class="lt">Equips</div><div class="lg-list">${Object.entries(TEAM_COLOR).map(([t, c]) => `<div class="li"><i style="width:11px;height:11px;border-radius:3px;background:${rgbc(c)}"></i>${t}</div>`).join('')}</div></div>`; }
function roomStageHTML(compact) {
  const b = buildBuilding();
  const s = { occ: b.occupied, hot: b.hot };
  const cls = compact ? 'building-stage ops-building' : 'building-stage';
  return {
    html: `<div class="${cls}">
        <div class="bldg-head">
          <span class="bcap">La sala · totes les plantes</span>
          <span class="bstats">${statsHTML(s)}</span>
        </div>
        <div class="room-canvas">${buildingCanvasHTML(b)}</div>
        <div class="room-legend">${legendHTML()}</div>
      </div>`,
    stats: s
  };
}
function updateRoomPanel() {
  const root = activePanelEl();
  const canvas = root?.querySelector('.room-canvas');
  if (!canvas) return;
  syncTowerDisplayH();
  const b = buildBuilding();
  canvas.innerHTML = buildingCanvasHTML(b);
  roomTipForCanvas(canvas);
  const statsEl = root.querySelector('.bldg-head .bstats');
  if (statsEl) statsEl.innerHTML = statsHTML({ occ: b.occupied, hot: b.hot });
  attachSeats(root);
}
function activeViewType() { return PanoramaWorkspace.activeViewType(); }
function isView(type) { return activeViewType() === type; }
function activePanelEl() {
  const p = PanoramaWorkspace.activePanel();
  return p ? document.querySelector(`[data-panel-id="${p.id}"]`) : null;
}
function updateOverviewMetrics() {
  const root = activePanelEl();
  const h = health();
  const pillars = root?.querySelector('.pillars');
  if (pillars) pillars.innerHTML = pillarsHTML(h);
  const verdict = root?.querySelector('.verdict');
  if (verdict) verdict.innerHTML = verdictHTML(h);
}
function scrollToAnchor(anchor) {
  const root = activePanelEl();
  const el = root?.querySelector('#sec-' + anchor);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function runBuildingAnimation(ts) {
  buildingAnimFrame = requestAnimationFrame(runBuildingAnimation);
  if (!isView('operations')) return;
  if (!activePanelEl()?.querySelector('.room-canvas')) return;
  const dt = animLastTs ? Math.min(ts - animLastTs, 50) : 16;
  animLastTs = ts;
  if (!stepBuildingAnimation(dt)) { Scene3D.update(dt); return; }
  updateRoomPanel();
  Scene3D.update(dt);
}
function startBuildingAnimation() {
  if (!buildingAnimFrame) runBuildingAnimation();
}

function renderDetail(container) {
  const h = health();
  const c = { all: AGENTS.length }; Object.keys(STATUS).forEach(s => c[s] = AGENTS.filter(a => a.status === s).length);
  const room = roomStageHTML(true);
  container.innerHTML = `
    <div class="view view-ops">
      <header class="ops-summary">
        <div class="verdict">${verdictHTML(h)}</div>
        <div class="pillars">${pillarsHTML(h)}</div>
      </header>
      <div class="ops-layout">
        <aside class="ops-room">${room.html}</aside>
        <div class="ops-resizer" role="separator" aria-orientation="vertical" tabindex="0" title="Arrossega per ajustar l'amplada"></div>
        <div class="ops-data">
          <section id="sec-queues">
            <div class="sec-title">${sfIconTileHtml('queue', { size: 20 })} Cues <span class="cnt">${QUEUES.length}</span></div>
            <div class="qgrid">${queueState.map(queueCard).join('')}</div>
          </section>
          <section id="sec-agents">
            <div class="sec-title">${sfIconTileHtml('user', { size: 20 })} Agents <span class="cnt">${AGENTS.length}</span></div>
            <div class="toolbar"><div class="chips">
              <button class="chip ${filter.status === 'all' ? 'on' : ''}" data-st="all">Tots <b class="mono">${c.all}</b></button>
              <button class="chip ${filter.status === 'online' ? 'on' : ''}" data-st="online"><i style="background:var(--ok)"></i>Online ${c.online}</button>
              <button class="chip ${filter.status === 'busy' ? 'on' : ''}" data-st="busy"><i style="background:var(--alert)"></i>Ocupat ${c.busy}</button>
              <button class="chip ${filter.status === 'away' ? 'on' : ''}" data-st="away"><i style="background:var(--watch)"></i>Absent ${c.away}</button>
            </div></div>
            <div class="grid" id="agentGrid">${agentGridHTML()}</div>
          </section>
        </div>
      </div>
    </div>`;
  attachSeats(container);
  attachOpsResizer(container);
  attachQueueCardClicks(container);
  container.querySelectorAll('[data-st]').forEach(b => b.onclick = () => {
    filter.status = b.dataset.st;
    devConsole.action('agents:filter', filter.status);
    updateAgents();
  });
  container.querySelectorAll('#agentGrid .card').forEach(c => c.onclick = () => openDrawer(c.dataset.id));
  startBuildingAnimation();
}

/** Drag-to-resize splitter between the room (left) and data (right) columns. */
const OPS_SPLIT_KEY = 'panorama.opsSplit';
const OPS_SPLIT_DEFAULT = 40;
const OPS_SPLIT_MIN = 24; // % of layout width
const OPS_SPLIT_MAX = 64;

function loadOpsSplit() {
  try {
    const v = parseFloat(localStorage.getItem(OPS_SPLIT_KEY));
    if (Number.isFinite(v)) return Math.min(OPS_SPLIT_MAX, Math.max(OPS_SPLIT_MIN, v));
  } catch { /* ignore */ }
  return OPS_SPLIT_DEFAULT;
}

function attachOpsResizer(container) {
  const layout = container.querySelector('.ops-layout');
  const handle = container.querySelector('.ops-resizer');
  if (!layout || !handle) return;

  const apply = (pct) => layout.style.setProperty('--ops-split', pct + '%');
  apply(loadOpsSplit());

  const pctFromEvent = (clientX) => {
    const r = layout.getBoundingClientRect();
    const pct = ((clientX - r.left) / r.width) * 100;
    return Math.min(OPS_SPLIT_MAX, Math.max(OPS_SPLIT_MIN, pct));
  };

  let dragging = false;
  const onMove = (e) => {
    if (!dragging) return;
    apply(pctFromEvent(e.clientX));
    e.preventDefault();
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.classList.remove('ops-resizing');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    const cur = parseFloat(layout.style.getPropertyValue('--ops-split'));
    try { localStorage.setItem(OPS_SPLIT_KEY, String(cur)); } catch { /* ignore */ }
  };

  handle.addEventListener('pointerdown', (e) => {
    dragging = true;
    handle.classList.add('dragging');
    document.body.classList.add('ops-resizing');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    e.preventDefault();
  });

  // Keyboard support: arrow keys nudge the split by 2%.
  handle.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowLeft' ? -2 : e.key === 'ArrowRight' ? 2 : 0;
    if (!step) return;
    const cur = parseFloat(layout.style.getPropertyValue('--ops-split')) || loadOpsSplit();
    const next = Math.min(OPS_SPLIT_MAX, Math.max(OPS_SPLIT_MIN, cur + step));
    apply(next);
    try { localStorage.setItem(OPS_SPLIT_KEY, String(next)); } catch { /* ignore */ }
    e.preventDefault();
  });

  handle.addEventListener('dblclick', (e) => {
    e.preventDefault();
    apply(OPS_SPLIT_DEFAULT);
    try { localStorage.removeItem(OPS_SPLIT_KEY); } catch { /* ignore */ }
  });
}

/** Rebuild FLOORS from the persisted layout and re-render every building view. */
function refreshFloors() {
  globalThis.FLOORS = buildFloorsForAgents(globalThis.AGENTS || []);
  buildDir = loadCustomRoomDir();
  fixedFloorLayout.offsets = null;
  fixedFloorLayout.dir = null;
  PanoramaWorkspace.listPanels().forEach(p => {
    const el = document.querySelector(`[data-panel-id="${p.id}"]`);
    if (!el) return;
    if (p.viewType === 'operations') renderDetail(el);
  });
}

/* ───────── 3D scene (Three.js) ───────── */
const Scene3D = {
  mounted: false, _: null,
  mount(el) {
    if (typeof THREE === 'undefined') { el.innerHTML = "<div style='padding:46px;text-align:center;color:var(--faint)'>No s'ha pogut carregar el motor 3D.</div>"; return; }
    this.dispose();
    const W = el.clientWidth || 820, H = el.clientHeight || 540;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 2000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(W, H);
    el.style.position = 'relative';
    el.appendChild(renderer.domElement);
    mountRoomTip(el);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xc7cad2, 1.0));
    const dir = new THREE.DirectionalLight(0xffffff, 0.55); dir.position.set(10, 22, 14); scene.add(dir);
    scene.add(new THREE.AmbientLight(0xffffff, 0.22));
    const CELL = 1.05, SEAT = 0.8, SLAB_T = 0.14, minH = 0.6, maxH = 5.2, baseH = SLAB_T, capH = SLAB_T;
    let minc = 1e9, maxc = -1e9, minr = 1e9, maxr = -1e9;
    FLOORS.forEach(f => f.cells.forEach(([c, r]) => { minc = Math.min(minc, c); maxc = Math.max(maxc, c); minr = Math.min(minr, r); maxr = Math.max(maxr, r); }));
    const floorY = computeFloorStack(FLOORS, { minH, maxH, slabT: SLAB_T, beaconPad: 0.5, marginMin: 0.3, marginBase: 0.55 });
    const cx = (minc + maxc) / 2 * CELL, cz = (minr + maxr) / 2 * CELL;
    const tcol = t => { const c = TEAM_COLOR[t] || [140, 140, 150]; return new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255); };
    const mc = {};
    const opaqueMat = t => mc['o' + t] || (mc['o' + t] = new THREE.MeshStandardMaterial({ color: tcol(t), roughness: .55 }));
    const capMat = t => mc['c' + t] || (mc['c' + t] = new THREE.MeshStandardMaterial({ color: tcol(t), roughness: .55, transparent: true, opacity: .72 }));
    const shaftMat = t => mc['s' + t] || (mc['s' + t] = new THREE.MeshStandardMaterial({ color: tcol(t), roughness: .4, transparent: true, opacity: .26, depthWrite: false }));
    const idleMat = t => mc['i' + t] || (mc['i' + t] = new THREE.LineBasicMaterial({ color: tcol(t), transparent: true, opacity: .5 }));
    const slabMat = new THREE.MeshStandardMaterial({ color: 0xece9e4, roughness: .9, transparent: true, opacity: .34, depthWrite: false });
    const offMat = new THREE.LineBasicMaterial({ color: 0x9b97a6, transparent: true, opacity: .55 });
    const pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const beaconMat = new THREE.MeshStandardMaterial({ color: 0xE05641, emissive: 0xE05641, emissiveIntensity: .6 });
    const beaconGeo = new THREE.SphereGeometry(0.18, 16, 16);
    const makeBeacon = h => { const m = new THREE.Mesh(beaconGeo, beaconMat); m.position.y = h + 0.5; return m; };
    const seg = (b, t, m) => { const h = t - b, g = new THREE.BoxGeometry(SEAT, h, SEAT); g.translate(0, b + h / 2, 0); return new THREE.Mesh(g, m); };
    const lineBox = (h, m) => { const g = new THREE.BoxGeometry(SEAT, h, SEAT); g.translate(0, h / 2, 0); return new THREE.LineSegments(new THREE.EdgesGeometry(g), m); };
    const root = new THREE.Group(); scene.add(root);
    const pickables = [], beacons = [], towerGroups = [], towers = new Map();
    FLOORS.forEach((f, i) => {
      const fy = floorY[i];
      f.cells.forEach(([c, r]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.94, SLAB_T, CELL * 0.94), slabMat); m.position.set(c * CELL - cx, fy, r * CELL - cz); root.add(m); });
      const topY = fy + SLAB_T / 2;
      f.assigned.forEach(s => {
        const a = s.agent; if (!a) return;
        const tg = new THREE.Group(); tg.position.set(s.c * CELL - cx, topY, s.r * CELL - cz);
        const team = teamOf(a); let Hh;
        if (a.status === 'offline') { Hh = 0.45; tg.add(lineBox(Hh, offMat)); }
        else {
          const L = a.max ? a.used / a.max : 0;
          if (L < 0.1) {
            Hh = minH;
            if (Hh <= baseH + capH) tg.add(seg(0, Hh, opaqueMat(team)));
            else tg.add(seg(0, baseH, opaqueMat(team)), seg(baseH, Hh - capH, shaftMat(team)), seg(Hh - capH, Hh, capMat(team)));
          } else {
            Hh = minH + L * (maxH - minH);
            if (Hh <= baseH + capH) { tg.add(seg(0, Hh, opaqueMat(team))); }
            else { tg.add(seg(0, baseH, opaqueMat(team)), seg(baseH, Hh - capH, shaftMat(team)), seg(Hh - capH, Hh, capMat(team))); }
          }
        }
        const pb = new THREE.Mesh((() => { const g = new THREE.BoxGeometry(SEAT, Hh, SEAT); g.translate(0, Hh / 2, 0); return g; })(), pickMat);
        pb.userData.id = a.id; tg.add(pb); pickables.push(pb);
        let bref = null; if (a.flag) { bref = makeBeacon(Hh); tg.add(bref); beacons.push(bref); }
        tg.userData.delay = (s.c + s.r) * 0.05; tg.scale.y = 0.001;
        root.add(tg); towerGroups.push(tg);
        towers.set(a.id, { group: tg, height: Hh, baseH: Hh, beacon: bref, agent: a });
      });
    });
    const target = new THREE.Vector3(0, (floorY[floorY.length - 1] + maxH) / 2, 0);
    let radius = Math.max(26, (maxc - minc) * CELL * 1.5), theta = 0.7, phi = 0.92;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const applyCam = () => { camera.position.set(target.x + radius * Math.sin(phi) * Math.sin(theta), target.y + radius * Math.cos(phi), target.z + radius * Math.sin(phi) * Math.cos(theta)); camera.lookAt(target); };
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const roomTip3d = () => mountRoomTip(el);
    const ptrs = new Map(); let moved = 0, lastPinch = 0, hoverId = null;
    const rect = () => renderer.domElement.getBoundingClientRect();
    const pan = (dx, dy) => { const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1), k = radius * 0.0016; target.addScaledVector(right, -dx * k); target.addScaledVector(up, dy * k); };
    let tipAgentId = null;
    const hover = e => {
      const tip = roomTip3d();
      const rc = rect(); ndc.x = ((e.clientX - rc.left) / rc.width) * 2 - 1; ndc.y = -((e.clientY - rc.top) / rc.height) * 2 + 1; ray.setFromCamera(ndc, camera); const hit = ray.intersectObjects(pickables, false);
      if (hit.length) {
        const a = AGENTS.find(x => x.id === hit[0].object.userData.id); hoverId = a ? a.id : null;
        if (a) { if (a.id !== tipAgentId) { tip.innerHTML = agentMapTipHTML(a); tipAgentId = a.id; } showRoomTip(tip, e.clientX, e.clientY); el.style.cursor = 'pointer'; }
      } else { hoverId = null; tipAgentId = null; hideRoomTip(tip); el.style.cursor = 'grab'; }
    };
    const onDown = e => { if (el.setPointerCapture) el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, btn: e.button, shift: e.shiftKey }); moved = 0; };
    const onMove = e => {
      if (!ptrs.has(e.pointerId)) { hover(e); return; } const p = ptrs.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy); hideRoomTip(roomTip3d());
      if (ptrs.size >= 2) { const v = [...ptrs.values()], d = Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y); if (lastPinch) radius = clamp(radius * (lastPinch / d), 8, 90); lastPinch = d; pan(dx * 0.5, dy * 0.5); }
      else if (p.btn === 2 || p.shift) pan(dx, dy);
      else { theta -= dx * 0.005; phi = clamp(phi - dy * 0.005, 0.18, 1.45); }
    };
    const onUp = e => { if (ptrs.size === 1 && moved < 5 && hoverId) { hideRoomTip(roomTip3d()); openDrawer(hoverId); } ptrs.delete(e.pointerId); if (ptrs.size < 2) lastPinch = 0; };
    const onWheel = e => { e.preventDefault(); radius = clamp(radius * (1 + Math.sign(e.deltaY) * 0.08), 8, 90); };
    const onCtx = e => e.preventDefault(); const onLeave = () => { hideRoomTip(roomTip3d()); };
    el.addEventListener('pointerdown', onDown); el.addEventListener('pointermove', onMove); el.addEventListener('pointerup', onUp); el.addEventListener('pointercancel', onUp); el.addEventListener('wheel', onWheel, { passive: false }); el.addEventListener('contextmenu', onCtx); el.addEventListener('pointerleave', onLeave);
    const onResize = () => { const w = el.clientWidth, hh = el.clientHeight; if (!w || !hh) return; camera.aspect = w / hh; camera.updateProjectionMatrix(); renderer.setSize(w, hh); };
    window.addEventListener('resize', onResize);
    const clock = new THREE.Clock(); let raf;
    const animate = () => {
      raf = requestAnimationFrame(animate); const t = clock.getElapsedTime();
      towerGroups.forEach(g => { const p = clamp((t - g.userData.delay) / 0.7, 0, 1); g.scale.y = Math.max(0.001, 1 - Math.pow(1 - p, 3)); });
      const pulse = 1 + 0.35 * Math.sin(t * 4); beacons.forEach(b => b.scale.setScalar(pulse));
      applyCam(); renderer.render(scene, camera);
    };
    applyCam(); animate();
    this.mounted = true;
    this._ = { renderer, el, onResize, stop: () => cancelAnimationFrame(raf), towers, beacons, makeBeacon };
  },
  update(dt) {
    if (!this.mounted) return;
    const { towers, beacons, makeBeacon } = this._;
    const minH = 0.6, maxH = 5.2;
    towers.forEach(t => {
      const a = t.agent;
      const target = towerTargetH(a, minH, maxH);
      const cur = towerDisplayH.get(a.id);
      const next = smoothToward(cur, target, dt);
      towerDisplayH.set(a.id, next);
      t.group.scale.y = next / t.baseH;
      const bh = next;
      if (a.flag && !t.beacon) { t.beacon = makeBeacon(bh); t.group.add(t.beacon); beacons.push(t.beacon); t.beacon.position.y = bh + 0.5; }
      else if (!a.flag && t.beacon) { t.group.remove(t.beacon); const i = beacons.indexOf(t.beacon); if (i >= 0) beacons.splice(i, 1); t.beacon = null; }
      else if (t.beacon) t.beacon.position.y = bh + 0.5;
    });
  },
  dispose() { if (!this.mounted) return; const s = this._; try { s.stop(); window.removeEventListener('resize', s.onResize); s.renderer.dispose(); if (s.renderer.domElement && s.renderer.domElement.parentNode) s.renderer.domElement.parentNode.removeChild(s.renderer.domElement); } catch (e) { } this.mounted = false; this._ = null; }
};

/* ───────── Agents view ───────── */
let filter = { status: 'all' };
function agentCard(a) {
  const st = STATUS[a.status];
  const chanCells = ['veu', 'chat', 'wa', 'cas'].map(c => {
    const n = a.chans[c] || 0;
    return `<div class="c ${n > 0 ? 'active' : 'zero'}">${channelIconTileHtml(c, { size: 21 })}<div class="n">${n}</div></div>`;
  }).join('');
  const showChans = !isLiveDataMode() || ['veu', 'chat', 'wa', 'cas'].some((c) => (a.chans?.[c] || 0) > 0);
  const segs = Array.from({ length: a.max }).map((_, i) => `<span style="flex:1;background:${i < a.used ? st.c : 'transparent'}"></span>`).join('');
  const workRow = isLiveDataMode()
    ? `<div class="work"><div class="wic wic--sf">${sfIconTileHtml('work', { size: 26 })}</div><div class="wt">${a.used > 0 ? `${a.used} open work item(s)` : 'No active work'}</div></div>`
    : (a.work ? `<div class="work"><div class="wic wic--sf">${channelIconTileHtml(a.work.channelKey, { size: 26 })}</div><div class="wt"><b>${a.work.t}</b> · ${qById(a.work.q).name}</div><div class="timer mono">${formatWorkTimer(a.workSec)}</div></div>` : `<div class="work"><div class="wic wic--sf">${sfIconTileHtml('work', { size: 26, bg: '#C9C7CD' })}</div><div class="wt">Sense feina activa</div></div>`);
  return `<div class="card ${a.flag ? 'flagged' : ''}" style="--st:${st.c}" data-id="${a.id}">
    ${a.flag ? '<div class="flag-badge">⚑ AJUDA</div>' : ''}
    <div class="card-top">
      <div class="ring ${a.status === 'busy' ? 'breathe' : ''}">${ringSVG(a.used, a.max, st.c)}${agentRingFaceHTML(a)}</div>
      <div class="who"><div class="nm">${a.name}</div><div class="rl">${a.role}</div>
        <div class="status-pill" style="color:${st.c};background:color-mix(in srgb,${st.c} 12%,transparent)"><i style="background:${st.c}"></i>${st.lbl}</div></div>
    </div>
    <div class="cap"><div class="cap-head"><span>Capacitat</span><b>${a.used} / ${a.max}</b></div><div class="cap-bar">${segs}</div></div>
    ${showChans ? `<div class="chan">${chanCells}</div>` : ''}
    ${workRow}
    <div class="foot"><span>Loguejat <b class="mono">${a.status === 'offline' ? '—' : formatDurationMin(a.loginMin)}</b></span>${isLiveDataMode() ? '' : `<span>Última feina <b class="mono">${a.lastAccept == null ? '—' : formatDurationMin(a.lastAccept)}</b></span>`}</div>
  </div>`;
}
function queueCard(q) {
  const cap = q.online * 5 || 1, p = Math.min(1, q.backlog / cap);
  return `<div class="qcard" data-id="${q.id}" role="button" tabindex="0">
    <div class="qtop"><span class="qn" style="color:${colorFromString(q.name)}">${sfIconTileHtml('queue', { size: 22, bg: colorFromString(q.name) })}${q.name}</span><span class="qa"><i></i><b class="mono">${q.online}</b> online</span></div>
    <div class="pressure"><span style="width:${Math.max(6, p * 100)}%;background:${pColor(p)}"></span></div>
    <div class="qmetrics">
      <div class="m"><div class="v ${q.backlog > 8 ? 'warn' : ''}">${q.backlog}</div><div class="k">Backlog</div></div>
      <div class="m"><div class="v ${q.longest > 150 ? 'warn' : ''}">${formatDurationSec(q.longest, { short: true })}</div><div class="k">Espera màx</div></div>
      <div class="m"><div class="v">${formatDurationSec(q.avg, { short: true })}</div><div class="k">Espera mitj.</div></div>
    </div></div>`;
}
function attachQueueCardClicks(container) {
  if (container.dataset.queueClicks) return;
  container.dataset.queueClicks = '1';
  container.addEventListener('click', (e) => {
    const card = e.target.closest('.qcard[data-id]');
    if (card && container.contains(card)) openQueueDrawer(card.dataset.id);
  });
  container.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.qcard[data-id]');
    if (!card || !container.contains(card)) return;
    e.preventDefault();
    openQueueDrawer(card.dataset.id);
  });
}
function agentGridHTML() {
  let list = AGENTS.slice();
  if (filter.status !== 'all') list = list.filter(a => a.status === filter.status);
  list.sort((a, b) => (b.flag - a.flag) || (b.used - a.used));
  return list.map(agentCard).join('') || '<p style="color:var(--faint)">Cap agent coincideix.</p>';
}
function updateAgents() {
  const root = activePanelEl();
  const grid = root?.querySelector('#agentGrid'); if (!grid) return;
  grid.innerHTML = agentGridHTML();
  grid.querySelectorAll('.card').forEach(c => c.onclick = () => openDrawer(c.dataset.id));
  root.querySelectorAll('[data-st]').forEach(b => b.classList.toggle('on', b.dataset.st === filter.status));
}

/* ───────── Agents directory view ───────── */
// Every Omni-enabled agent (connected or not), distinct from Operations which
// only lists currently connected agents.
function agentDirectoryCard(a) {
  const st = STATUS[a.status] || STATUS.offline;
  return `<button type="button" class="ag-card" data-id="${a.id}">
    <div class="ag-card-av">${agentAvatarHTML(a, 'ag-av')}<i class="ag-dot" style="background:${st.c}"></i></div>
    <div class="ag-card-body">
      <div class="ag-card-name">${a.name}</div>
      <div class="ag-card-role">${a.role || 'Agent'}</div>
    </div>
    <span class="ag-card-status" style="color:${st.c};background:color-mix(in srgb,${st.c} 12%,transparent)"><i style="background:${st.c}"></i>${st.lbl}</span>
  </button>`;
}

function agentDirectoryGridHTML(list) {
  if (!list.length) return '<p style="color:var(--faint)">No agents found.</p>';
  const order = { online: 0, busy: 1, away: 2, offline: 3 };
  const sorted = list.slice().sort((a, b) =>
    (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.name.localeCompare(b.name));
  return sorted.map(agentDirectoryCard).join('');
}

let agentDirectoryToken = 0;
async function renderAgentsDirectory(container) {
  const token = ++agentDirectoryToken;
  container.innerHTML = `<div class="view">
    <div class="view-head"><h2>Agents</h2><p>Every agent enabled for Omni-Channel, connected or not.</p></div>
    <div class="grid ag-grid" id="agentsDirGrid"><p style="color:var(--faint)">Loading agents…</p></div>
  </div>`;
  const grid = container.querySelector('#agentsDirGrid');
  try {
    const provider = globalThis.PanoramaProvider;
    const list = provider?.getAgents
      ? await provider.getAgents({ scope: 'all' })
      : (globalThis.AGENTS || []);
    if (token !== agentDirectoryToken) return; // a newer render superseded this one
    grid.innerHTML = agentDirectoryGridHTML(list || []);
    grid.querySelectorAll('.ag-card').forEach(c => c.onclick = () => openDrawer(c.dataset.id));
  } catch (err) {
    if (token !== agentDirectoryToken) return;
    console.warn('[Panorama] failed to load agents directory', err);
    grid.innerHTML = `<p style="color:var(--alert)">Could not load agents: ${err.message}</p>`;
  }
}

/* ───────── Queues view ───────── */
function pColor(p) { return p < .5 ? 'var(--ok)' : p < .8 ? 'var(--watch)' : 'var(--alert)'; }

/* ───────── Skills directory view ───────── */
function skillCard(s) {
  const backlog = Number(s.backlog) || 0;
  const agents = Number(s.agents) || 0;
  const bColor = backlog === 0 ? 'var(--ok)' : backlog < 4 ? 'var(--watch)' : 'var(--alert)';
  return `<button type="button" class="ag-card sk-card" data-skill-id="${detailEsc(s.id)}">
    <div class="ag-card-av">${skillIconTileHtml({ size: 22, name: s.name })}</div>
    <div class="ag-card-body">
      <div class="ag-card-name">${detailEsc(s.name)}</div>
      <div class="ag-card-role">${agents} agent${agents === 1 ? '' : 's'} qualificat${agents === 1 ? '' : 's'}</div>
    </div>
    <span class="ag-card-status" style="color:${bColor};background:color-mix(in srgb,${bColor} 12%,transparent)"><i style="background:${bColor}"></i>${backlog} pendent${backlog === 1 ? '' : 's'}</span>
  </button>`;
}
function skillsGroupedHTML(list) {
  if (!list.length) return '<p style="color:var(--faint)">No skills found.</p>';
  // Group by SkillType, backlog-heaviest skills first within each type. Types
  // keep first-seen order (the provider already orders skills by type).
  const groups = new Map();
  list.forEach(s => {
    const key = s.type || '_none';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  });
  let html = '';
  for (const [key, skills] of groups) {
    const typeName = key === '_none' ? 'Sense tipus' : key;
    skills.sort((a, b) => (Number(b.backlog) || 0) - (Number(a.backlog) || 0) || a.name.localeCompare(b.name));
    html += `<section class="sk-group">
      <h4>${detailEsc(typeName)} <span class="cnt">${skills.length}</span></h4>
      <div class="grid ag-grid">${skills.map(skillCard).join('')}</div>
    </section>`;
  }
  return html;
}
// Skills loaded by the directory view, kept so the detail drawer can render its
// header (name/type/counts) without re-fetching the whole catalog.
let skillCache = [];
let skillCatalogPromise = null;
let skillCatalogLoaded = false;

function ensureSkillCatalog() {
  if (skillCatalogPromise) return skillCatalogPromise;
  skillCatalogPromise = Promise.resolve().then(async () => {
    const provider = globalThis.PanoramaProvider;
    const list = provider?.getSkills
      ? await provider.getSkills()
      : (globalThis.SKILLS || []);
    skillCache = Array.isArray(list) ? list.slice() : [];
    skillCatalogLoaded = true;
    return skillCache;
  }).catch((err) => {
    skillCatalogPromise = null;
    throw err;
  });
  return skillCatalogPromise;
}

function findSkill(id) {
  if (!id) return null;
  return skillCache.find((s) => s.id === id)
    || (globalThis.SKILLS || []).find((s) => s.id === id)
    || null;
}

function mergeSkillIntoCache(skill) {
  if (!skill?.id) return;
  const idx = skillCache.findIndex((s) => s.id === skill.id);
  if (idx >= 0) skillCache[idx] = skill;
  else skillCache.push(skill);
}

let skillsDirectoryToken = 0;
async function renderSkillsDirectory(container) {
  const token = ++skillsDirectoryToken;
  container.innerHTML = `<div class="view">
    <div class="view-head"><h2>Skills</h2><p>Backlog per skill routing, agrupat per tipus de skill: quins skills tenen profunditat de cua i quants agents qualificats hi ha.</p></div>
    <div id="skillsDirGroups"><p style="color:var(--faint)">Loading skills…</p></div>
  </div>`;
  const groupsEl = container.querySelector('#skillsDirGroups');
  try {
    const list = await ensureSkillCatalog();
    if (token !== skillsDirectoryToken) return; // a newer render superseded this one
    groupsEl.innerHTML = skillsGroupedHTML(list);
    groupsEl.querySelectorAll('.sk-card').forEach(c => c.onclick = () => openSkillDrawer(c.dataset.skillId));
  } catch (err) {
    if (token !== skillsDirectoryToken) return;
    console.warn('[Panorama] failed to load skills directory', err);
    groupsEl.innerHTML = `<p style="color:var(--alert)">Could not load skills: ${detailEsc(err?.message || String(err))}</p>`;
  }
}

/* ───────── Skill detail panel ───────── */
function openSkillDrawer(id) {
  const skill = findSkill(id);
  openDetailDrawer({ kind: 'skill', id, name: skill?.name });
}

// Async fetch of qualified agents into a placeholder; mirrors the loading
// pattern used by the directory views. Re-entrancy is guarded with a token so a
// late response from a previous skill can't overwrite a newer one.
let skillAgentsToken = 0;
function renderSkillDetail(config) {
  const s = findSkill(config.id);
  const esc = detailEsc;
  if (!s) {
    const title = config.name || 'Skill';
    if (skillCatalogLoaded) {
      return {
        head: `<div class="dr-id">${skillIconTileHtml({ size: 58, name: title })}
            <div><div class="nm">${esc(title)}</div><div class="rl">Skill</div></div>
          </div>`,
        body: `<p style="color:var(--alert)">Skill not found.</p>`,
      };
    }
    return {
      head: `<div class="dr-id">${skillIconTileHtml({ size: 58, name: title })}
          <div><div class="nm">${esc(title)}</div><div class="rl">Skill</div></div>
        </div>`,
      body: '<p style="color:var(--faint)">Loading skill…</p>',
      afterMount(_root, cfg) {
        ensureSkillCatalog()
          .then(() => refreshActiveDetail())
          .catch((err) => console.warn('[Panorama] failed to load skill catalog', err));
      },
    };
  }
  const backlog = Number(s.backlog) || 0;
  const agentCount = Number(s.agents) || 0;
  const bColor = backlog === 0 ? 'var(--ok)' : backlog < 4 ? 'var(--watch)' : 'var(--alert)';
  const typeLine = s.type ? esc(s.type) : 'Skill';

  return {
    head: `<div class="dr-id">${skillIconTileHtml({ size: 58, name: s.name })}
        <div><div class="nm">${esc(s.name)}</div><div class="rl">${typeLine}</div>
          <div class="status-pill" style="color:${bColor};background:color-mix(in srgb,${bColor} 12%,transparent)"><i style="background:${bColor}"></i>${backlog} pendent${backlog === 1 ? '' : 's'}</div>
        </div>
      </div>`,
    body: `<section><h4>Resum</h4><div class="stat-grid">
        <div class="s"><div class="v">${agentCount}</div><div class="k">Agents qualificats</div></div>
        <div class="s"><div class="v ${backlog > 4 ? 'warn' : ''}" style="color:${bColor}">${backlog}</div><div class="k">Backlog</div></div>
      </div></section>
      <section><h4>Agents qualificats</h4><div class="queue-agent-list" id="skillAgentList"><div class="assigned-queue-empty">Carregant agents…</div></div></section>`,
    afterMount(root, cfg, ctx) {
      const list = root.querySelector('#skillAgentList');
      if (!list) return;
      const token = ++skillAgentsToken;
      const provider = globalThis.PanoramaProvider;
      Promise.resolve(provider?.getSkillAgents ? provider.getSkillAgents(cfg.id) : [])
        .then((agentsList) => {
          if (token !== skillAgentsToken) return;
          list.innerHTML = skillAgentRowsHTML(agentsList || []);
          list.querySelectorAll('[data-agent-id]').forEach((el) =>
            el.addEventListener('click', () => ctx.openAgent(el.dataset.agentId)));
        })
        .catch((err) => {
          if (token !== skillAgentsToken) return;
          console.warn('[Panorama] failed to load skill agents', err);
          list.innerHTML = `<div class="assigned-queue-empty" style="color:var(--alert)">No s'han pogut carregar els agents: ${esc(err.message)}</div>`;
        });
    },
  };
}

function skillAgentRowsHTML(list) {
  if (!list.length) return '<div class="assigned-queue-empty">Cap agent qualificat per aquest skill</div>';
  const order = { online: 0, busy: 1, away: 2, offline: 3 };
  const sorted = list.slice().sort((a, b) =>
    (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.name.localeCompare(b.name));
  return sorted.map((a) => {
    const st = STATUS[a.status] || STATUS.offline;
    return `<button type="button" class="queue-agent-row" data-agent-id="${detailEsc(a.id)}">
      <div class="queue-agent-av">${agentAvatarHTML(a, 'ag-av')}<i class="ag-dot" style="background:${st.c}"></i></div>
      <div class="queue-agent-copy"><div class="queue-agent-name">${detailEsc(a.name)}</div><div class="queue-agent-role">${detailEsc(a.role || 'Agent')}</div></div>
      <span class="status-pill" style="color:${st.c};background:color-mix(in srgb,${st.c} 12%,transparent)"><i style="background:${st.c}"></i>${st.lbl}</span>
    </button>`;
  }).join('');
}

/* ───────── Work directory view ───────── */
function workItemRow(w) {
  const q = qById(w.queueId);
  const ag = w.agentId ? findAgent(w.agentId) : null;
  const assignee = ag ? ag.name : '<span style="color:var(--faint)">A la cua</span>';
  const qName = q ? q.name : '—';
  const qColor = q ? colorFromString(q.name) : 'var(--faint)';
  return `<div class="wi">
    <div class="wic wic--sf">${channelIconTileHtml(w.channelKey, { size: 32 })}</div>
    <div class="info"><div class="t">${detailEsc(w.subject)}</div><div class="m">${CH_LBL[w.channelKey] || 'Canal'} · ${assignee}</div></div>
    <span class="pill-q">${sfIconTileHtml('queue', { size: 14, bg: qColor })}<span style="color:${qColor}">${detailEsc(qName)}</span></span>
    <span class="age mono">${formatWorkTimer(Number(w.ageSec) || 0)}</span>
  </div>`;
}
function workListHTML(list) {
  if (!list.length) return '<p style="color:var(--faint)">No work items in flight.</p>';
  // Group by queue, queued items before assigned within each group, oldest first.
  const sorted = list.slice().sort((a, b) =>
    (a.queueId || '').localeCompare(b.queueId || '') ||
    (a.status === b.status ? 0 : a.status === 'queued' ? -1 : 1) ||
    (Number(b.ageSec) || 0) - (Number(a.ageSec) || 0));
  const groups = new Map();
  sorted.forEach(w => {
    const key = w.queueId || '_none';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(w);
  });
  let html = '';
  for (const [key, items] of groups) {
    const q = qById(key);
    const qName = q ? q.name : 'Sense cua';
    const qColor = q ? colorFromString(q.name) : 'var(--faint)';
    html += `<section class="wk-group">
      <h4 style="color:${qColor}">${detailEsc(qName)} <span class="cnt">${items.length}</span></h4>
      <div class="worklist">${items.map(workItemRow).join('')}</div>
    </section>`;
  }
  return html;
}
let workDirectoryToken = 0;
async function renderWorkDirectory(container) {
  const token = ++workDirectoryToken;
  container.innerHTML = `<div class="view">
    <div class="view-head"><h2>Work</h2><p>Tots els work items viatjant per les cues cap als agents, per cua i canal.</p></div>
    <div id="workDirList"><p style="color:var(--faint)">Loading work…</p></div>
  </div>`;
  const listEl = container.querySelector('#workDirList');
  try {
    const provider = globalThis.PanoramaProvider;
    const list = provider?.getWork ? await provider.getWork() : [];
    if (token !== workDirectoryToken) return; // a newer render superseded this one
    listEl.innerHTML = workListHTML(list || []);
  } catch (err) {
    if (token !== workDirectoryToken) return;
    console.warn('[Panorama] failed to load work directory', err);
    listEl.innerHTML = `<p style="color:var(--alert)">Could not load work: ${detailEsc(err?.message || String(err))}</p>`;
  }
}

/* ───────── Detail panels (drawer + full-screen tab) ───────── */
function timelineLane(b) { return `<div class="tl-track">${b.map(x => `<div class="tl-block" style="left:${x.l}%;width:${x.w}%;background:${x.c}">${x.w > 9 ? x.t : ''}</div>`).join('')}<div class="tl-now" style="left:88%"></div></div>`; }
function detailEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function findAgent(id) {
  const provider = globalThis.PanoramaProvider;
  if (provider?.getAgentById) return provider.getAgentById(id);
  return AGENTS.find((x) => x.id === id);
}

function renderAgentDetail(config) {
  const a = findAgent(config.id);
  if (!a) return null;
  const st = STATUS[a.status];
  const live = isLiveDataMode();
  const esc = detailEsc;
  const items = live ? [] : Array.from({ length: Math.max(1, a.used || 1) }).map(() => { const w = { ...pick(WORK_KINDS) }; if (w.t === 'Cas #') w.t = 'Cas #' + rnd(48210, 48999); return { ...w, age: rnd(1, 28) }; });
  const stB = [{ l: 0, w: 22, c: '#B7B3C0', t: 'Desconnectat' }, { l: 22, w: 30, c: '#15A06A', t: 'Online' }, { l: 52, w: 14, c: '#D9981F', t: 'Pausa' }, { l: 66, w: 34, c: '#15A06A', t: 'Online' }];
  const wkB = [{ l: 24, w: 16, c: '#6A5BE8', t: 'Cas' }, { l: 42, w: 9, c: '#E05641', t: '☎' }, { l: 55, w: 11, c: '#15A06A', t: '💬' }, { l: 70, w: 18, c: '#6A5BE8', t: '☎' }, { l: 90, w: 8, c: '#D9981F', t: '' }];
  const queueSummaries = buildAgentQueueSummaries(live ? a : { ...a, work: items }, QUEUES);
  const assignedQueueWorkItemHTML = (w) => {
    const label = live ? (w.label || 'Work item') : (w.t || 'Work item');
    const channelKey = w.channelKey || 'cas';
    const detail = live
      ? (w.subject || CH_LBL[channelKey] || w.channel || 'Work item')
      : (CH_LBL[channelKey] || 'Work item');
    const age = live ? w.ageMin : w.age;
    return `<div class="assigned-queue-work-item">
      <div class="assigned-queue-work-icon">${channelIconTileHtml(channelKey, { size: 24 })}</div>
      <div class="assigned-queue-work-copy"><div class="assigned-queue-work-title">${esc(label)}</div><div class="assigned-queue-work-meta">${esc(detail)}</div></div>
      ${age == null ? '' : `<span class="assigned-queue-work-age mono">${formatDurationMin(age)}</span>`}
    </div>`;
  };
  const assignedQueuesHTML = queueSummaries.length
    ? `<div class="assigned-queue-list">${queueSummaries.map((q) => `<div class="assigned-queue-row">
      <div class="assigned-queue-head">
        <div class="assigned-queue-name">${sfIconTileHtml('queue', { size: 20, bg: colorFromString(q.name) })}<span>${esc(q.name)}</span></div>
        <span class="assigned-queue-count">${q.workItems.length} active</span>
      </div>
      <div class="assigned-queue-work">${q.workItems.length ? q.workItems.map(assignedQueueWorkItemHTML).join('') : '<div class="assigned-queue-empty">No active work in this queue</div>'}</div>
    </div>`).join('')}</div>`
    : '<span style="color:var(--faint)">No queue membership data</span>';
  const salesforceLink = a.recordUrl
    ? `<a class="dr-action-link" href="${esc(a.recordUrl)}" target="_blank" rel="noopener noreferrer" aria-label="View ${esc(a.name)} in Salesforce">View in Salesforce</a>`
    : '';
  const drawerActions = live
    ? salesforceLink
    : `${salesforceLink}<button class="primary">⚑ Atendre bandera</button><button>↪ Reassignar</button><button>≋ Canviar cues</button><button>✦ Canviar skills</button>`;
  const timelineSection = live
    ? ''
    : `<section><h4>Timeline — últimes 3 h</h4>
        <div class="tl-axis"><span>-3h</span><span>-2h</span><span>-1h</span><span>ara</span></div>
        <div class="tl-lane-lbl"><i style="width:7px;height:7px;border-radius:50%;background:var(--watch)"></i>Estat de presència</div>${timelineLane(stB)}
        <div class="tl-lane-lbl"><i style="width:7px;height:7px;border-radius:50%;background:var(--accent)"></i>Feina atesa</div>${timelineLane(wkB)}
      </section>`;
  const liveItems = live && Array.isArray(a.work) ? a.work : [];
  const workSection = live
    ? (liveItems.length > 0
      ? `<section><h4>Active work (${liveItems.length})</h4><div class="worklist">${liveItems.map(w => {
        const chLabel = CH_LBL[w.channelKey] || w.channel || 'Channel';
        const queuePill = w.queue ? `<span class="pill-q">${sfIconTileHtml('queue', { size: 14, bg: colorFromString(w.queue) })}<span style="color:${colorFromString(w.queue)}">${esc(w.queue)}</span></span>` : '';
        const subj = w.subject ? `<div class="m">${esc(w.subject)}</div>` : `<div class="m">${esc(chLabel)}</div>`;
        return `<div class="wi"><div class="wic wic--sf">${channelIconTileHtml(w.channelKey, { size: 32 })}</div><div class="info"><div class="t">${esc(w.label)}</div>${subj}</div>${queuePill}<span class="age mono">${formatDurationMin(w.ageMin)}</span></div>`;
      }).join('')}</div></section>`
      : '')
    : `<section><h4>Feina activa (${items.length})</h4><div class="worklist">${items.map(w => `<div class="wi"><div class="wic wic--sf">${channelIconTileHtml(w.channelKey, { size: 32 })}</div><div class="info"><div class="t">${w.t}</div><div class="m">${CH_LBL[w.channelKey] || 'Canal'}</div></div><span class="pill-q">${sfIconTileHtml('queue', { size: 14, bg: colorFromString(qById(w.q).name) })}<span style="color:${colorFromString(qById(w.q).name)}">${qById(w.q).name}</span></span><span class="age mono">${formatDurationMin(w.age)}</span></div>`).join('')}</div></section>`;

  return {
    head: `<div class="dr-id"><div class="ring ${a.status === 'busy' ? 'breathe' : ''}" style="--st:${st.c};width:58px;height:58px">${ringSVG(a.used, a.max, st.c, 58)}${agentRingFaceHTML(a)}</div>
        <div><div class="nm">${esc(a.name)}</div><div class="rl">${esc(a.role)}</div><div class="status-pill" style="color:${st.c};background:color-mix(in srgb,${st.c} 12%,transparent)"><i style="background:${st.c}"></i>${st.lbl}</div></div></div>`,
    actions: drawerActions,
    body: `<section><h4>Resum d'activitat</h4><div class="stat-grid">
        <div class="s"><div class="v" style="color:${st.c}">${a.used}/${a.max}</div><div class="k">Capacitat</div></div>
        <div class="s"><div class="v">${a.status === 'offline' ? '—' : formatDurationMin(a.loginMin)}</div><div class="k">Loguejat</div></div>
        ${live ? '' : `<div class="s"><div class="v">${a.lastAccept == null ? '—' : formatDurationMin(a.lastAccept)}</div><div class="k">Última feina</div></div>`}
      </div></section>
      <section><h4>Skills</h4><div class="skill-list" id="agentSkillList"><div class="assigned-queue-empty">Carregant skills…</div></div></section>
      <section><h4>Assigned queues</h4>${assignedQueuesHTML}</section>
      ${timelineSection}
      ${workSection}`,
    afterMount(root, cfg) {
      const list = root.querySelector('#agentSkillList');
      if (!list) return;
      const token = ++agentSkillsToken;
      // Skills embedded on the /agents payload are already loaded; render them
      // directly and skip the per-agent fetch.
      if (Array.isArray(a.skills)) {
        list.innerHTML = agentSkillRowsHTML(a.skills);
        return;
      }
      const provider = globalThis.PanoramaProvider;
      Promise.resolve(provider?.getAgentSkills ? provider.getAgentSkills(cfg.id) : [])
        .then((skills) => {
          if (token !== agentSkillsToken) return;
          list.innerHTML = agentSkillRowsHTML(skills || []);
        })
        .catch((err) => {
          if (token !== agentSkillsToken) return;
          console.warn('[Panorama] failed to load agent skills', err);
          list.innerHTML = `<div class="assigned-queue-empty" style="color:var(--alert)">No s'han pogut carregar els skills: ${esc(err.message)}</div>`;
        });
    },
  };
}

// Absolute date formatter for skill-assignment metadata. Locale-aware, short.
const SKILL_DATE_FMT = new Intl.DateTimeFormat('ca-ES', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
function formatSkillDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : SKILL_DATE_FMT.format(d);
}

let agentSkillsToken = 0;
function agentSkillRowsHTML(list) {
  if (!list.length) return '<div class="assigned-queue-empty">Aquest agent no té cap skill assignat</div>';
  const esc = detailEsc;
  return list.map((s) => {
    const level = s.level == null ? null : Number(s.level);
    const levelPill = level == null
      ? ''
      : `<span class="skill-level-pill">Nivell ${esc(String(level))}</span>`;
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

function openDrawer(id) {
  openDetailDrawer({ kind: 'agent', id });
}

function resolveDetailSnapshot(config) {
  const { kind, id } = config;
  if (kind === 'agent') {
    const a = AGENTS.find((x) => x.id === id)
      || globalThis.PanoramaProvider?.getAgentById?.(id);
    if (!a) return null;
    return {
      kind: 'agent',
      id: a.id,
      title: a.name,
      meta: a.role || 'Agent',
      status: a.status,
      flag: Boolean(a.flag),
    };
  }
  if (kind === 'queue') {
    const q = queueState.find((x) => x.id === id);
    if (!q) return null;
    return {
      kind: 'queue',
      id: q.id,
      title: q.name,
      meta: `${q.backlog} backlog · ${q.online} online`,
      color: q.color,
      backlog: q.backlog,
      online: q.online,
    };
  }
  if (kind === 'skill') {
    const s = findSkill(id);
    if (s) {
      return {
        kind: 'skill',
        id: s.id,
        title: s.name,
        meta: s.type || `${s.agents} qualified agents`,
        agents: Number(s.agents) || 0,
      };
    }
    if (config.name) {
      return { kind: 'skill', id, title: config.name, meta: 'Skill', agents: 0 };
    }
    return null;
  }
  return null;
}

setDetailRecentResolver(resolveDetailSnapshot);
function agentsInQueue(queueId) {
  return AGENTS.filter((a) => (a.queues || []).includes(queueId));
}
function activeWorkInQueue(q, live) {
  const members = agentsInQueue(q.id);
  if (live) {
    const items = [];
    members.forEach((a) => {
      (Array.isArray(a.work) ? a.work : []).forEach((w) => {
        if (w.queueId === q.id || w.queue === q.name) items.push({ ...w, agent: a });
      });
    });
    return items;
  }
  return members
    .filter((a) => a.work && a.work.q === q.id)
    .map((a) => ({ agent: a, work: a.work, ageMin: a.workSec }));
}

let queueWaitingWorkToken = 0;

function queuedWorkForQueue(list, queueId) {
  return (list || [])
    .filter((w) => w.status === 'queued' && w.queueId === queueId)
    .sort((a, b) => (Number(b.ageSec) || 0) - (Number(a.ageSec) || 0));
}

function queueWaitingWorkRowHTML(w, esc) {
  const channelKey = w.channelKey || 'cas';
  const label = w.subject || 'Work item';
  const detail = CH_LBL[channelKey] || 'Work item';
  const ageSec = Number(w.ageSec) || 0;
  return `<div class="queue-agent-row queue-waiting-row">
    <div class="assigned-queue-work-icon">${channelIconTileHtml(channelKey, { size: 24 })}</div>
    <div class="queue-agent-copy"><div class="queue-agent-name">${esc(label)}</div><div class="queue-agent-role">${esc(detail)}</div></div>
    <span class="assigned-queue-work-age mono">${formatWorkTimer(ageSec)}</span>
  </div>`;
}

function queueWaitingWorkListHTML(items, esc) {
  if (!items.length) return '<div class="assigned-queue-empty">No items waiting in this queue</div>';
  return items.map((w) => queueWaitingWorkRowHTML(w, esc)).join('');
}

function renderQueueDetail(config) {
  const q = queueState.find((x) => x.id === config.id);
  if (!q) return null;
  const live = isLiveDataMode();
  const esc = detailEsc;
  const cap = q.online * 5 || 1;
  const pressure = Math.min(1, q.backlog / cap);
  const members = agentsInQueue(q.id).slice().sort((a, b) => {
    const order = { online: 0, busy: 1, away: 2, offline: 3 };
    return (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.name.localeCompare(b.name);
  });
  const workItems = activeWorkInQueue(q, live);
  const memberRows = members.length
    ? members.map((a) => {
      const st = STATUS[a.status] || STATUS.offline;
      return `<button type="button" class="queue-agent-row" data-agent-id="${esc(a.id)}">
        <div class="queue-agent-av">${agentAvatarHTML(a, 'ag-av')}<i class="ag-dot" style="background:${st.c}"></i></div>
        <div class="queue-agent-copy"><div class="queue-agent-name">${esc(a.name)}</div><div class="queue-agent-role">${esc(a.role)}</div></div>
        <span class="status-pill" style="color:${st.c};background:color-mix(in srgb,${st.c} 12%,transparent)"><i style="background:${st.c}"></i>${st.lbl}</span>
      </button>`;
    }).join('')
    : '<div class="assigned-queue-empty">No agents assigned to this queue</div>';
  const workRows = workItems.length
    ? workItems.map((item) => {
      const w = live ? item : item.work;
      const a = item.agent;
      const channelKey = w.channelKey || 'cas';
      const label = live ? (w.label || 'Work item') : (w.t || 'Work item');
      const detail = live
        ? (w.subject || CH_LBL[channelKey] || w.channel || 'Work item')
        : (CH_LBL[channelKey] || 'Work item');
      const age = live ? w.ageMin : item.ageMin;
      return `<button type="button" class="queue-agent-row" data-agent-id="${esc(a.id)}">
        <div class="assigned-queue-work-icon">${channelIconTileHtml(channelKey, { size: 24 })}</div>
        <div class="queue-agent-copy"><div class="queue-agent-name">${esc(label)}</div><div class="queue-agent-role">${esc(a.name)} · ${esc(detail)}</div></div>
        ${age == null ? '' : `<span class="assigned-queue-work-age mono">${formatDurationMin(age)}</span>`}
      </button>`;
    }).join('')
    : '<div class="assigned-queue-empty">No active work in this queue</div>';

  return {
    head: `<div class="dr-id">${sfIconTileHtml('queue', { size: 58, bg: colorFromString(q.name) })}
        <div><div class="nm">${esc(q.name)}</div><div class="rl">Queue</div>
          <div class="status-pill" style="color:${colorFromString(q.name)};background:color-mix(in srgb,${colorFromString(q.name)} 12%,transparent)"><i style="background:${colorFromString(q.name)}"></i>${q.online} agents online</div>
        </div>
      </div>`,
    body: `<section><h4>Queue health</h4>
        <div class="pressure queue-drawer-pressure"><span style="width:${Math.max(6, pressure * 100)}%;background:${pColor(pressure)}"></span></div>
        <div class="stat-grid" style="margin-top:14px">
          <div class="s"><div class="v ${q.backlog > 8 ? 'warn' : ''}">${q.backlog}</div><div class="k">Backlog</div></div>
          <div class="s"><div class="v ${q.longest > 150 ? 'warn' : ''}">${formatDurationSec(q.longest, { short: true })}</div><div class="k">Longest wait</div></div>
          <div class="s"><div class="v">${formatDurationSec(q.avg, { short: true })}</div><div class="k">Average wait</div></div>
          <div class="s"><div class="v">${q.online}</div><div class="k">Online agents</div></div>
        </div>
      </section>
      <section><h4>Assigned agents (${members.length})</h4><div class="queue-agent-list">${memberRows}</div></section>
      <section><h4>Waiting in queue (<span id="queueWaitingCount">${q.backlog}</span>)</h4><div class="queue-agent-list" id="queueWaitingList"><div class="assigned-queue-empty">Loading…</div></div></section>
      <section><h4>Active work (${workItems.length})</h4><div class="queue-agent-list">${workRows}</div></section>`,
    afterMount(root, cfg, ctx) {
      root.querySelectorAll('[data-agent-id]').forEach((el) => {
        el.addEventListener('click', () => ctx.openAgent(el.dataset.agentId));
      });

      const listEl = root.querySelector('#queueWaitingList');
      const countEl = root.querySelector('#queueWaitingCount');
      if (!listEl) return;
      const token = ++queueWaitingWorkToken;
      Promise.resolve(globalThis.PanoramaProvider?.getWork?.() ?? [])
        .then((all) => {
          if (token !== queueWaitingWorkToken) return;
          const waiting = queuedWorkForQueue(all, cfg.id);
          listEl.innerHTML = queueWaitingWorkListHTML(waiting, detailEsc);
          if (countEl) countEl.textContent = String(waiting.length);
        })
        .catch((err) => {
          if (token !== queueWaitingWorkToken) return;
          console.warn('[Panorama] failed to load queue waiting work', err);
          listEl.innerHTML = `<div class="assigned-queue-empty" style="color:var(--alert)">Could not load waiting items: ${detailEsc(err.message)}</div>`;
        });
    },
  };
}

function openQueueDrawer(id) {
  openDetailDrawer({ kind: 'queue', id });
}

function closeDrawer() {
  closeDetailDrawer();
}

function agentTabIconHTML(a) {
  if (!a) return sfIconTileHtml('user', { size: 18, className: 'sf-icon-tile ws-tab-icon-tile' });
  return agentAvatarHTML(a, 'ws-tab-av');
}

registerDetailKind('agent', {
  resolveLabel: (config) => findAgent(config.id)?.name || 'Agent',
  resolveTabIcon: (config) => agentTabIconHTML(findAgent(config.id)),
  render: renderAgentDetail,
});
registerDetailKind('queue', {
  resolveLabel: (config) => queueState.find((q) => q.id === config.id)?.name || 'Queue',
  resolveTabIcon: (config) => {
    const q = queueState.find((x) => x.id === config.id);
    return sfIconTileHtml('queue', { size: 18, bg: q?.name ? colorFromString(q.name) : undefined, className: 'sf-icon-tile ws-tab-icon-tile' });
  },
  render: renderQueueDetail,
});
registerDetailKind('skill', {
  resolveLabel: (config) => findSkill(config.id)?.name || config.name || null,
  resolveTabIcon: (config) => skillIconTileHtml({ size: 18, name: findSkill(config.id)?.name || config.name, className: 'sf-icon-tile ws-tab-icon-tile' }),
  render: renderSkillDetail,
});
initDetailDrawerChrome();

/* ───────── Room — isometric workload map ───────── */
function floorSeatLoads(f) {
  const loads = [];
  f.assigned.forEach(s => {
    const a = s.agent;
    if (!a || a.status === 'offline') return;
    loads.push(a.max ? a.used / a.max : 0);
  });
  return loads;
}
function towerHeightForLoad(L, minH, maxH) {
  return L < 0.1 ? minH : minH + L * (maxH - minH);
}
const TOWER_TAU = 1.05;
const towerDisplayH = new Map();
let buildingAnimFrame = null;
let animLastTs = 0;
const fixedFloorLayout = { offsets: null, dir: null };

function easeAlpha(dt) {
  return 1 - Math.exp(-dt / (TOWER_TAU * 1000));
}
function smoothToward(cur, target, dt) {
  if (cur == null) return target;
  if (Math.abs(cur - target) < 0.02) return target;
  return cur + (target - cur) * easeAlpha(dt);
}

function towerTargetH(a, minH, maxH) {
  if (!a || a.status === 'offline') return minH * 0.6;
  return towerHeightForLoad(a.max ? a.used / a.max : 0, minH, maxH);
}
function towerDisplayHeight(a, minH, maxH) {
  if (!a || a.status === 'offline') return minH * 0.6;
  const v = towerDisplayH.get(a.id);
  return v != null ? v : towerTargetH(a, minH, maxH);
}
function syncTowerDisplayH(minH = 16, maxH = 88) {
  AGENTS.forEach(a => {
    if (!towerDisplayH.has(a.id)) towerDisplayH.set(a.id, towerTargetH(a, minH, maxH));
  });
}
function stepTowerDisplay(minH = 16, maxH = 88, dt = 16) {
  let dirty = false;
  AGENTS.forEach(a => {
    const target = towerTargetH(a, minH, maxH);
    const cur = towerDisplayH.get(a.id);
    const next = smoothToward(cur, target, dt);
    if (cur == null || next !== cur) { towerDisplayH.set(a.id, next); dirty = true; }
  });
  return dirty;
}
function stepBuildingAnimation(dt) {
  return stepTowerDisplay(16, 88, dt);
}
function computeFloorStack(floors, opts) {
  const step = opts.slabT + opts.maxH + opts.beaconPad + opts.marginMin;
  const y = new Array(floors.length).fill(0);
  for (let i = floors.length - 2; i >= 0; i--) {
    y[i] = y[i + 1] + step;
  }
  return y;
}
function getFixedFloorOffsets(dir, gMaxC, gMaxR, minH, maxH, TH) {
  if (fixedFloorLayout.dir === dir && fixedFloorLayout.offsets) return fixedFloorLayout.offsets;
  const { offsets } = computeFloorLayout(FLOORS, dir, gMaxC, gMaxR, {
    minH, maxH, TH, beaconPad: 28, marginMin: 36, floorGapExtra: 80,
  });
  fixedFloorLayout.offsets = offsets;
  fixedFloorLayout.dir = dir;
  return offsets;
}

let buildDir = loadCustomRoomDir(), dirAnimating = false;
const ROT_CW = { 0: 2, 2: 3, 3: 1, 1: 0 };
const ROT_CCW = { 0: 1, 1: 3, 3: 2, 2: 0 };
function rotateBuildDir(sign) { setBuildDir(sign > 0 ? ROT_CW[buildDir] : ROT_CCW[buildDir]); }
function setBuildDir(d) {
  if (d === buildDir || dirAnimating) return;
  const root = activePanelEl();
  const canvas = root?.querySelector('.room-canvas');
  if (!canvas) {
    buildDir = d;
    saveCustomRoomDir(buildDir, FLOORS);
    fixedFloorLayout.offsets = null;
    if (isView('operations')) {
      updateOverviewMetrics();
      updateRoomPanel();
    }
    return;
  }
  dirAnimating = true;
  const compassDeg = [90, 0, 180, 270];
  let delta = ((compassDeg[d] - compassDeg[buildDir]) + 360) % 360;
  if (delta > 180) delta -= 360;
  const outDeg = delta > 0 ? -90 : 90;
  const inDeg = delta > 0 ? 90 : -90;
  const DUR = 190;
  canvas.style.transformOrigin = 'center 40%';
  canvas.style.transition = `transform ${DUR}ms ease-in, opacity ${DUR}ms ease-in`;
  canvas.style.transform = `perspective(700px) rotateY(${outDeg}deg) scaleX(0.6)`;
  canvas.style.opacity = '0.2';
  setTimeout(() => {
    buildDir = d;
    saveCustomRoomDir(buildDir, FLOORS);
    fixedFloorLayout.offsets = null;
    const b = buildBuilding();
    canvas.innerHTML = buildingCanvasHTML(b);
    attachSeats(root);
    canvas.style.transition = 'none';
    canvas.style.transform = `perspective(700px) rotateY(${inDeg}deg) scaleX(0.6)`;
    canvas.style.opacity = '0.2';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      canvas.style.transition = `transform ${DUR}ms ease-out, opacity ${DUR}ms ease-out`;
      canvas.style.transform = 'perspective(700px) rotateY(0deg) scaleX(1)';
      canvas.style.opacity = '1';
      setTimeout(() => {
        canvas.style.transition = '';
        canvas.style.transform = '';
        canvas.style.opacity = '';
        dirAnimating = false;
      }, DUR);
    }));
  }, DUR);
}

function buildBuilding(dir) {
  if (dir === undefined) dir = buildDir;
  if (!FLOORS?.length) {
    return {
      svg: '<svg viewBox="0 0 480 240" xmlns="http://www.w3.org/2000/svg"><text x="240" y="120" text-anchor="middle" fill="#9C98A6" font-size="14" font-family="Inter,sans-serif">Team map unavailable</text></svg>',
      occupied: 0,
      hot: 0,
    };
  }
  const TH = 17, minH = 16, maxH = 88;
  const { gMaxC, gMaxR } = gridExtents(FLOORS);
  const floorOffsets = getFixedFloorOffsets(dir, gMaxC, gMaxR, minH, maxH, TH);
  let occupied = 0, hot = 0;
  const meta = { anchors: [] };
  const svg = buildBuildingSVG(FLOORS, dir, {
    meta,
    floorOffsets,
    backgroundUrl,
    seatParts(s, ctx) {
      const a = s.agent; const { x, y, TW, TH } = ctx;
      if (!a) return { cube: ctx.vacantCircle(x, y) };
      const T = TEAM_COLOR[teamOf(a)] || [140, 140, 150];
      if (a.status === 'offline') return { cube: ctx.wire(x, y, 10, 'rgba(27,25,36,.18)', a.id, false, a.flag ? ctx.mkBeacon(x, y, 10) : '') };
      const L = a.max ? a.used / a.max : 0; occupied++; if (L >= .8) hot++;
      const H = towerDisplayHeight(a, minH, maxH);
      const beacon = a.flag ? ctx.mkBeacon(x, y, H) : '';
      const glow = L < .1 ? '' : `<ellipse cx="${x}" cy="${y}" rx="${TW * 1.2}" ry="${TH * 1.2}" fill="${rgbc(T, L * .42)}" filter="url(#bg)"/>`;
      return { glow, cube: ctx.tower(x, y, H, T, L, a.id, beacon) };
    },
  });
  return { svg, occupied, hot, anchors: meta.anchors, viewBox: meta.viewBox };
}
function attachSeats(root) {
  const canvas = root?.querySelector('.room-canvas');
  if (!canvas) return;
  roomTipForCanvas(canvas);
  if (canvas.dataset.seatsBound) return;
  canvas.dataset.seatsBound = '1';
  let tipSeatAgentId = null;
  canvas.addEventListener('mousemove', e => {
    const tip = roomTipForCanvas(canvas);
    const g = e.target.closest('.seat[data-id]');
    if (!g) { tipSeatAgentId = null; hideRoomTip(tip); return; }
    const a = AGENTS.find(x => x.id === g.dataset.id);
    if (!a) { tipSeatAgentId = null; hideRoomTip(tip); return; }
    if (a.id !== tipSeatAgentId) { tip.innerHTML = agentMapTipHTML(a); tipSeatAgentId = a.id; }
    showRoomTip(tip, e.clientX, e.clientY);
  });
  canvas.addEventListener('mouseleave', () => { hideRoomTip(roomTipForCanvas(canvas)); tipSeatAgentId = null; });
  canvas.addEventListener('click', e => {
    const g = e.target.closest('.seat[data-id]');
    if (!g) return;
    hideRoomTip(roomTipForCanvas(canvas));
    openDrawer(g.dataset.id);
  });
}

/* ───────── Workspace shell ───────── */
const LEGACY_VIEW_MAP = { overview: 'operations' };

PanoramaWorkspace.registerPanelType({
  viewType: 'operations',
  defaultLabel: 'Home',
  mount(container) { renderDetail(container); },
  activate(container, config) {
    if (config.anchor) scrollToAnchor(config.anchor);
    startBuildingAnimation();
  },
  deactivate() { Scene3D.dispose(); },
});

PanoramaWorkspace.registerPanelType({
  viewType: 'agents',
  defaultLabel: 'Agents',
  mount(container) { renderAgentsDirectory(container); },
  activate(container) { renderAgentsDirectory(container); },
});

PanoramaWorkspace.registerPanelType({
  viewType: 'work',
  defaultLabel: 'Work',
  mount(container) { renderWorkDirectory(container); },
  activate(container) { renderWorkDirectory(container); },
});

PanoramaWorkspace.registerPanelType({
  viewType: 'skills',
  defaultLabel: 'Skills',
  mount(container) { renderSkillsDirectory(container); },
  activate(container) { renderSkillsDirectory(container); },
});

registerFloorEditorPanel();
registerDetailPanelType();

const Panorama = {
  open(viewType, opts = {}) {
    viewType = LEGACY_VIEW_MAP[viewType] || viewType;
    const config = { ...(opts.config || {}) };
    if (opts.anchor) config.anchor = opts.anchor;
    const descriptor = {
      viewType,
      label: opts.label,
      config,
      pinned: opts.pinned,
      forceNew: opts.newTab,
    };
    const id = PanoramaWorkspace.openTab(descriptor);
    if (opts.anchor && isView(viewType)) {
      requestAnimationFrame(() => scrollToAnchor(opts.anchor));
    }
    return id;
  },
  scrollTo(anchor) {
    scrollToAnchor(anchor);
  },
  home() {
    const ops = PanoramaWorkspace.listPanels().find((p) => p.viewType === 'operations');
    if (ops) PanoramaWorkspace.activate(ops.id);
    else PanoramaWorkspace.open({ viewType: 'operations', pinned: true });
  },
  activeViewType() { return PanoramaWorkspace.activeViewType(); },
  activePanelEl() {
    const p = PanoramaWorkspace.activePanel();
    return p ? document.querySelector(`[data-panel-id="${p.id}"]`) : null;
  },
};
window.Panorama = Panorama;
window.go = (viewType, anchor) => Panorama.open(LEGACY_VIEW_MAP[viewType] || viewType, { anchor });

PanoramaWorkspace.init({
  tabBarEl: document.getElementById('wsTabs'),
  stageEl: document.getElementById('wsStage'),
  catalogEl: document.getElementById('wsCatalog'),
  homePanel: { id: 'p-operations', viewType: 'operations', label: 'Home', pinned: true },
});

function bootstrapSkillDetailTabs() {
  const needsSkills = PanoramaWorkspace.listPanels().some(
    (p) => p.viewType === 'detail' && p.config?.kind === 'skill' && p.config?.id,
  );
  if (!needsSkills) return;
  ensureSkillCatalog()
    .then(() => {
      PanoramaWorkspace.refreshLabels();
      refreshActiveDetail();
    })
    .catch((err) => console.warn('[Panorama] skill tab bootstrap failed', err));
}

bootstrapSkillDetailTabs();

PanoramaWorkspace.onChange((event, panel) => {
  if (event === 'activate' && panel.viewType !== 'operations') window.scrollTo(0, 0);
  if (event === 'activate' && panel.viewType === 'detail') refreshActiveDetail();
});

/* ───────── Global search (header dropdown) ───────── */
const CONTENT_TRANSITION_MS = 220;
const GlobalSearch = {
  input: null,
  drop: null,
  body: null,
  content: null,
  blurTimer: null,
  closeTimeoutId: null,
  heightTimer: null,
  activeIdx: -1,
  items: [],
  open: false,
  searchAgents: null,
  searchSkills: null,
  searchAgentsToken: 0,

  init() {
    this.input = document.getElementById('qsearch');
    this.drop = document.getElementById('qsearchResults');
    this.body = document.getElementById('qsearchBody');
    this.content = document.getElementById('qsearchContent');
    this.input.addEventListener('focus', () => this.openPanel());
    this.input.addEventListener('input', () => { this.activeIdx = -1; this.render(); });
    this.input.addEventListener('keydown', e => this.onKey(e));
    this.input.addEventListener('blur', () => {
      this.blurTimer = setTimeout(() => this.closePanel(), 140);
    });
    this.drop.addEventListener('mousedown', e => {
      if (e.target.closest('.qsearch-item')) e.preventDefault();
    });
    this.drop.addEventListener('click', e => {
      const item = e.target.closest('.qsearch-item');
      if (item) this.select(item.dataset.kind, item.dataset.id);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.isOpen()) { e.preventDefault(); this.closePanel(true); }
    });
    globalThis.PanoramaProvider?.subscribe?.(() => {
      this.searchAgents = null;
      this.searchSkills = null;
      if (this.isOpen() && !this.query()) this.renderRecents();
    });
    globalThis.PanoramaWorkspace?.onChange?.((event, panel) => {
      if (event === 'activate' && panel.viewType === 'detail' && this.isOpen() && !this.query()) {
        this.renderRecents();
      }
    });
    this.prefetchSearchAgents();
    this.prefetchSearchSkills();
  },

  prefetchSearchAgents() {
    if (!isLiveDataMode()) return;
    this.ensureSearchAgents().catch((err) => {
      console.warn('[Panorama] search agent directory prefetch failed', err);
    });
  },

  prefetchSearchSkills() {
    if (!isLiveDataMode()) return;
    this.ensureSearchSkills().catch((err) => {
      console.warn('[Panorama] search skill directory prefetch failed', err);
    });
  },

  async ensureSearchAgents() {
    if (!isLiveDataMode()) return AGENTS;
    if (this.searchAgents) return this.searchAgents;
    const provider = globalThis.PanoramaProvider;
    if (!provider?.getAgents) return AGENTS;
    const list = await provider.getAgents({ scope: 'all' });
    this.searchAgents = Array.isArray(list) ? list : [];
    return this.searchAgents;
  },

  searchAgentPool() {
    if (!isLiveDataMode()) return AGENTS;
    const directory = this.searchAgents;
    if (!directory?.length) return AGENTS;
    const byId = new Map(directory.map((a) => [a.id, a]));
    for (const a of AGENTS) byId.set(a.id, a);
    return [...byId.values()];
  },

  async ensureSearchSkills() {
    if (!isLiveDataMode()) return SKILLS;
    if (this.searchSkills) return this.searchSkills;
    const provider = globalThis.PanoramaProvider;
    if (!provider?.getSkills) return [];
    const list = await provider.getSkills();
    this.searchSkills = Array.isArray(list) ? list : [];
    return this.searchSkills;
  },

  searchSkillPool() {
    if (!isLiveDataMode()) return SKILLS;
    return this.searchSkills?.length ? this.searchSkills : (SKILLS || []);
  },

  isOpen() { return this.open; },

  syncAnimation() {
    this.closeTimeoutId = syncDropdownPanel(this.drop, this.open, {
      closeTimeoutId: this.closeTimeoutId,
    });
  },

  openPanel() {
    clearTimeout(this.blurTimer);
    const wasOpen = this.open;
    this.open = true;
    if (!wasOpen) this.syncAnimation();
    this.input.setAttribute('aria-expanded', 'true');
    this.render();
  },

  closePanel(clear) {
    clearTimeout(this.blurTimer);
    clearTimeout(this.heightTimer);
    if (this.body) {
      this.body.style.height = '';
      this.body.style.transition = '';
      this.body.classList.remove('has-scroll');
    }
    if (!this.open && this.drop.hidden) return;
    this.open = false;
    this.syncAnimation();
    this.input.setAttribute('aria-expanded', 'false');
    this.activeIdx = -1;
    if (clear) { this.input.value = ''; this.input.blur(); }
  },

  esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); },

  query() { return this.input.value.trim().toLowerCase(); },

  collectWorkItems() {
    const items = [];
    for (const agent of AGENTS) {
      if (isLiveDataMode()) {
        if (!Array.isArray(agent.work)) continue;
        for (const w of agent.work) {
          items.push({
            agentId: agent.id,
            agentName: agent.name,
            title: w.label || 'Work item',
            meta: w.subject || w.queue || CH_LBL[w.channelKey] || '',
            channelKey: w.channelKey,
            searchText: [w.label, w.subject, w.recordId, w.queue, agent.name]
              .filter(Boolean)
              .join(' ')
              .toLowerCase(),
          });
        }
      } else if (agent.work && agent.used > 0) {
        const w = agent.work;
        const q = qById(w.q);
        items.push({
          agentId: agent.id,
          agentName: agent.name,
          title: w.t,
          meta: q ? q.name : '',
          channelKey: w.channelKey || 'cas',
          searchText: [w.t, q?.name, agent.name].filter(Boolean).join(' ').toLowerCase(),
        });
      }
    }
    return items;
  },

  run(q, agentPool = AGENTS, skillPool = SKILLS) {
    if (!q) return { agents: [], queues: [], skills: [], workItems: [] };
    const agents = agentPool.filter(a =>
      a.name.toLowerCase().includes(q) ||
      (a.role || '').toLowerCase().includes(q) ||
      teamOf(a).toLowerCase().includes(q)
    ).slice(0, 8);
    const queues = queueState.filter(qu => qu.name.toLowerCase().includes(q)).slice(0, 6);
    const skills = skillPool.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.type || '').toLowerCase().includes(q)
    ).slice(0, 6);
    const workItems = this.collectWorkItems()
      .filter(w => w.searchText.includes(q))
      .slice(0, 8);
    return { agents, queues, skills, workItems };
  },

  group(lbl, items) {
    return `<div class="qsearch-group"><div class="qsearch-group-lbl">${lbl}</div>${items}</div>`;
  },

  agentItem(a, idx) {
    const st = STATUS[a.status];
    const av = agentAvatarHTML(a, 'si-av');
    return `<button type="button" class="qsearch-item${idx === this.activeIdx ? ' on' : ''}" role="option" data-kind="agent" data-id="${a.id}">
          ${av}
          <span class="si-main"><div class="si-title">${this.esc(a.name)}${a.flag ? ' ⚑' : ''}</div><div class="si-meta">${this.esc(a.role)}</div></span>
          <span class="si-badge" style="color:${st.c};background:color-mix(in srgb,${st.c} 12%,transparent)">${st.lbl}</span>
        </button>`;
  },

  queueItem(q, idx) {
    return `<button type="button" class="qsearch-item${idx === this.activeIdx ? ' on' : ''}" role="option" data-kind="queue" data-id="${q.id}">
          ${sfIconTileHtml('queue', { size: 30, bg: colorFromString(q.name) })}
          <span class="si-main"><div class="si-title">${this.esc(q.name)}</div><div class="si-meta">${q.backlog} backlog · ${q.online} online</div></span>
          <span class="si-kbd">Queue</span>
        </button>`;
  },

  skillItem(s, idx) {
    return `<button type="button" class="qsearch-item${idx === this.activeIdx ? ' on' : ''}" role="option" data-kind="skill" data-id="${s.id}">
          ${skillIconTileHtml({ size: 30, name: s.name })}
          <span class="si-main"><div class="si-title">${this.esc(s.name)}</div><div class="si-meta">${s.agents} qualified agents</div></span>
          <span class="si-kbd">Skill</span>
        </button>`;
  },

  workItem(w, idx) {
    const iconName = channelIconName(w.channelKey);
    return `<button type="button" class="qsearch-item${idx === this.activeIdx ? ' on' : ''}" role="option" data-kind="work" data-id="${w.agentId}">
          ${sfIconTileHtml(iconName, { size: 30, bg: sfIconColor(iconName) })}
          <span class="si-main"><div class="si-title">${this.esc(w.title)}</div><div class="si-meta">${this.esc(w.agentName)}${w.meta ? ` · ${this.esc(w.meta)}` : ''}</div></span>
          <span class="si-kbd">Work</span>
        </button>`;
  },

  resolveRecentEntry(entry) {
    const live = resolveDetailSnapshot({ kind: entry.kind, id: entry.id, name: entry.title });
    return live || entry;
  },

  recentItem(entry, idx) {
    const resolved = this.resolveRecentEntry(entry);
    if (resolved.kind === 'agent') {
      return this.agentItem({
        id: resolved.id,
        name: resolved.title,
        role: resolved.meta,
        status: resolved.status || 'offline',
        flag: resolved.flag,
      }, idx);
    }
    if (resolved.kind === 'queue') {
      return this.queueItem({
        id: resolved.id,
        name: resolved.title,
        color: resolved.color || sfIconColor('queue'),
        backlog: resolved.backlog ?? 0,
        online: resolved.online ?? 0,
      }, idx);
    }
    return this.skillItem({
      id: resolved.id,
      name: resolved.title,
      agents: resolved.agents ?? 0,
    }, idx);
  },

  renderRecents() {
    const recents = getDetailRecents();
    if (!recents.length) {
      this.items = [];
      this.setContent('<div class="qsearch-hint">Search agents, queues, skills, and work items.<br>Your current view stays unchanged.</div>');
      return;
    }
    const agents = recents.filter((r) => r.kind === 'agent');
    const queues = recents.filter((r) => r.kind === 'queue');
    const skills = recents.filter((r) => r.kind === 'skill');
    this.items = [
      ...agents.map((r) => ({ kind: r.kind, id: r.id })),
      ...queues.map((r) => ({ kind: r.kind, id: r.id })),
      ...skills.map((r) => ({ kind: r.kind, id: r.id })),
    ];
    let html = '', idx = 0;
    if (agents.length) html += this.group('Agents', agents.map((r) => this.recentItem(r, idx++)).join(''));
    if (queues.length) html += this.group('Queues', queues.map((r) => this.recentItem(r, idx++)).join(''));
    if (skills.length) html += this.group('Skills', skills.map((r) => this.recentItem(r, idx++)).join(''));
    this.setContent(html);
  },

  maxBodyHeight() {
    if (!this.body) return 0;
    const max = parseFloat(getComputedStyle(this.body).maxHeight);
    return Number.isFinite(max) ? max : this.body.scrollHeight;
  },

  syncContentHeight(prevHeight) {
    if (!this.body || !this.content) return;

    clearTimeout(this.heightTimer);
    const cap = this.maxBodyHeight();
    const nextHeight = Math.min(this.content.scrollHeight, cap);
    const canAnimate =
      this.isOpen() &&
      this.drop.classList.contains('is-open') &&
      prevHeight > 0 &&
      prevHeight !== nextHeight &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.body.classList.remove('has-scroll');
    this.body.style.transition = '';
    this.body.style.height = '';

    if (!canAnimate) {
      this.body.classList.toggle('has-scroll', this.content.scrollHeight > cap);
      return;
    }

    this.body.style.height = `${prevHeight}px`;
    this.body.offsetHeight;
    this.body.style.transition = `height ${CONTENT_TRANSITION_MS}ms ease`;
    this.body.style.height = `${nextHeight}px`;
    this.heightTimer = setTimeout(() => {
      this.body.style.height = '';
      this.body.style.transition = '';
      this.body.classList.toggle('has-scroll', this.content.scrollHeight > cap);
    }, CONTENT_TRANSITION_MS);
  },

  setContent(html) {
    const prevHeight = this.body?.offsetHeight || 0;
    this.content.innerHTML = html;
    this.syncContentHeight(prevHeight);
  },

  async render() {
    const token = ++this.searchAgentsToken;
    const q = this.query();
    if (!q) {
      this.renderRecents();
      return;
    }
    if (isLiveDataMode() && (!this.searchAgents || !this.searchSkills)) {
      this.setContent('<div class="qsearch-hint">Loading…</div>');
    }
    await Promise.all([this.ensureSearchAgents(), this.ensureSearchSkills()]);
    if (token !== this.searchAgentsToken) return;
    const { agents, queues, skills, workItems } = this.run(q, this.searchAgentPool(), this.searchSkillPool());
    this.items = [
      ...agents.map(a => ({ kind: 'agent', id: a.id })),
      ...queues.map(qu => ({ kind: 'queue', id: qu.id })),
      ...skills.map(s => ({ kind: 'skill', id: s.id })),
      ...workItems.map(w => ({ kind: 'work', id: w.agentId })),
    ];
    if (!this.items.length) {
      this.setContent(`<div class="qsearch-empty">No results for "<b>${this.esc(q)}</b>"</div>`);
      return;
    }
    let html = '', idx = 0;
    if (agents.length) html += this.group('Agents', agents.map(a => this.agentItem(a, idx++)).join(''));
    if (workItems.length) html += this.group('Work', workItems.map(w => this.workItem(w, idx++)).join(''));
    if (queues.length) html += this.group('Queues', queues.map(qu => this.queueItem(qu, idx++)).join(''));
    if (skills.length) html += this.group('Skills', skills.map(s => this.skillItem(s, idx++)).join(''));
    this.setContent(html);
  },

  onKey(e) {
    if (!this.isOpen()) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.activeIdx = Math.min(this.activeIdx + 1, this.items.length - 1);
      this.render();
      this.scrollActive();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.activeIdx = Math.max(this.activeIdx - 1, -1);
      this.render();
      this.scrollActive();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const idx = this.activeIdx >= 0 ? this.activeIdx : 0;
      const item = this.items[idx];
      if (item) this.select(item.kind, item.id);
    }
  },

  scrollActive() {
    const el = this.drop.querySelector('.qsearch-item.on');
    if (el) el.scrollIntoView({ block: 'nearest' });
  },

  select(kind, id) {
    devConsole.action('search:select', kind, id);
    if (kind === 'agent' || kind === 'work') openDrawer(id);
    else if (kind === 'queue') openQueueDrawer(id);
    else if (kind === 'skill') {
      const skill = this.searchSkillPool().find((s) => s.id === id);
      if (skill) mergeSkillIntoCache(skill);
      openSkillDrawer(id);
    }
    this.closePanel(true);
  }
};
GlobalSearch.init();

// ── Settings modal ──────────────────────────────────────────────────────
const SettingsModal = {
  backdrop: document.getElementById('settingsBackdrop'),
  _snapshot: null,

  open(runtimeConfig) {
    devConsole.action('settings:open');
    this._populate(runtimeConfig);
    applyPreferencesToForm(this.backdrop, loadPreferences(), syncCustomSelect);
    applyDevModeToSettings(isDevModeOn());
    this._snapshot = this._readFormState();
    this.backdrop.querySelectorAll('select.settings-select').forEach((el) => syncCustomSelect(el));
    this.backdrop.classList.add('open');
    document.getElementById('settingsClose').focus();
    document.addEventListener('keydown', this._onKey);
  },

  close() {
    this.backdrop.classList.remove('open');
    this._snapshot = null;
    document.removeEventListener('keydown', this._onKey);
  },

  requestClose(force = false) {
    if (!force && this._isDirty()) {
      const discard = confirm('You have unsaved changes. Close without saving?');
      if (!discard) return false;
      devConsole.action('settings:discard');
      this._restoreFormState(this._snapshot);
      applyPreferencesSideEffects(this._snapshot, {
        consolePanel,
        isDevModeOn,
      });
    }
    this.close();
    return true;
  },

  _restoreFormState(state) {
    if (!state) return;
    Object.entries(state).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!value;
      else el.value = String(value);
      if (el.classList.contains('settings-select')) syncCustomSelect(el);
    });
  },

  _readFormState() {
    const state = readPreferencesFormState(this.backdrop);
    const dsEl = document.getElementById('settingsDataSource');
    if (dsEl) state.settingsDataSource = dsEl.value;
    return state;
  },

  _isDirty() {
    if (!this._snapshot) return false;
    const current = this._readFormState();
    return Object.keys(this._snapshot).some((key) => this._snapshot[key] !== current[key]);
  },

  _onKey(e) {
    if (e.key === 'Escape') SettingsModal.requestClose();
  },

  _populate(runtimeConfig) {
    const cfg = runtimeConfig || {};

    const dsEl = document.getElementById('settingsDataSource');
    if (dsEl) dsEl.value = cfg.dataSource || 'mock';

    const connStatus = document.getElementById('settingsConnStatus');
    if (connStatus) {
      if (cfg.dataSource === 'salesforce') {
        connStatus.className = 'settings-badge ok';
        connStatus.textContent = 'Salesforce';
      } else {
        connStatus.className = 'settings-badge watch';
        connStatus.textContent = 'Simulació';
      }
    }

    const sfClientEl = document.getElementById('settingsSfClientId');
    if (sfClientEl) {
      if (cfg.sfClientId) {
        sfClientEl.className = 'settings-badge ok';
        sfClientEl.textContent = `…${cfg.sfClientId.slice(-8)}`;
      } else {
        sfClientEl.className = 'settings-badge off';
        sfClientEl.textContent = 'No configurat';
      }
    }

    const sfLoginEl = document.getElementById('settingsSfLoginUrl');
    if (sfLoginEl) {
      sfLoginEl.className = 'settings-badge off';
      sfLoginEl.textContent = cfg.sfLoginUrl || '—';
    }

    const sfSessionEl = document.getElementById('settingsSfSession');
    if (sfSessionEl) {
      try {
        const raw = localStorage.getItem('panorama.oauthSession');
        const session = raw ? JSON.parse(raw) : null;
        if (session?.accessToken) {
          sfSessionEl.className = 'settings-badge ok';
          sfSessionEl.textContent = 'Activa';
        } else {
          sfSessionEl.className = 'settings-badge off';
          sfSessionEl.textContent = 'No autenticat';
        }
      } catch {
        sfSessionEl.className = 'settings-badge off';
        sfSessionEl.textContent = '—';
      }
    }

    const envEl = document.getElementById('settingsEnvLabel');
    if (envEl) envEl.textContent = cfg.dataSource === 'salesforce' ? 'Salesforce' : 'Simulació (mock)';

    const userEl = document.getElementById('settingsActiveUser');
    if (userEl) {
      const nameEl = document.getElementById('userMenuName');
      userEl.textContent = (nameEl?.textContent || '').trim() || '—';
    }
  },

  _navTo(section) {
    this.backdrop.querySelectorAll('.settings-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.section === section);
    });
    this.backdrop.querySelectorAll('.settings-section').forEach(sec => {
      sec.classList.toggle('active', sec.id === `settings-${section}`);
    });
  },

  _save(runtimeConfig) {
    const state = this._readFormState();
    const dsEl = document.getElementById('settingsDataSource');
    const dataSourceChanged = dsEl && runtimeConfig && dsEl.value !== runtimeConfig.dataSource;
    devConsole.action('settings:save', dataSourceChanged ? 'dataSource' : 'preferences');
    savePreferences(state);
    applyPreferencesSideEffects(state, {
      consolePanel,
      isDevModeOn,
    });
    globalThis.PanoramaProvider?.setRefreshInterval?.(getRefreshConfig());

    if (dataSourceChanged) {
      try { localStorage.setItem('panorama.dataSource', dsEl.value); } catch { /* ignore */ }
      globalThis.location.reload();
    }
  },

  init(runtimeConfig) {
    document.getElementById('settingsClose').addEventListener('click', () => this.requestClose());
    document.getElementById('settingsCancel').addEventListener('click', () => this.requestClose());
    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) this.requestClose();
    });

    this.backdrop.querySelectorAll('.settings-nav-item').forEach(btn => {
      btn.addEventListener('click', () => this._navTo(btn.dataset.section));
    });

    document.getElementById('settingsSave').addEventListener('click', () => {
      this._save(runtimeConfig);
      this.requestClose(true);
    });

    document.getElementById('settingsSfReauth')?.addEventListener('click', () => {
      if (!this.requestClose()) return;
      devConsole.action('settings:reauth');
      globalThis.location.href = '/?source=salesforce';
    });

    document.getElementById('settingsClearStorage')?.addEventListener('click', () => {
      if (confirm('S\'esborraran totes les dades locals (sessió, preferències i caché). Continuar?')) {
        devConsole.action('settings:clear-storage');
        localStorage.clear();
        globalThis.location.reload();
      }
    });

    Panorama.openSettings = () => this.open(runtimeConfig);
    enhanceAllSelects(this.backdrop);
  },
};

function isDevModeOn() {
  return localStorage.getItem('panorama.developerMode') === 'true';
}

function applyDevModeToSettings(on) {
  const nav = document.getElementById('settingsNavDeveloper');
  if (nav) nav.hidden = !on;
  if (!on) {
    const sec = document.getElementById('settings-developer');
    if (sec && sec.classList.contains('active')) {
      document.querySelector('.settings-nav-item[data-section="connexio"]')?.click();
    }
    consolePanel.hide();
  }
}

function bootDevConsole() {
  if (!isDevModeOn()) return;
  devConsole.install();
  devConsole.setCapturing(true);
  if (localStorage.getItem('panorama.console.show') === 'true') {
    consolePanel.show();
  }
}

window.addEventListener('panorama:devmode', (e) => {
  const on = !!e.detail?.on;
  if (on) { devConsole.install(); devConsole.setCapturing(true); }
  else { devConsole.setCapturing(false); }
  applyDevModeToSettings(on);
});

bootDevConsole();

SettingsModal.init(globalThis.__panoramaRuntimeConfig);

Object.assign(globalThis, {
  updateOverviewMetrics,
  updateAgents,
  updateRoomPanel,
  refreshFloors,
  refreshActiveDetail,
  queueCard,
  Scene3D,
  setBuildDir,
  rotateBuildDir,
  closeDrawer,
});
