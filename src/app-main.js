import { agentPhotoSrc } from './data/agent-photos.js';
import { isLiveDataMode } from './data/mode.js';
import { buildFloorsForAgents } from './data/floor-layout.js';
import { loadCustomRoomDir, saveCustomRoomDir } from './data/floor-store.js';
import { buildBuildingSVG, computeFloorLayout, gridExtents, rgbc } from './building-render.js';
import { registerFloorEditorPanel } from './floor-editor.js';
import { buildAgentQueueSummaries } from './agent-queue-summary.js';
import { channelIconTileHtml, channelIconName, sfIconColor, sfIconTileHtml } from './ui/sf-icons.js';

/* ───────── Helpers ───────── */
const fmtDur = s => { const m = Math.floor(s / 60); return m + ':' + String(s % 60).padStart(2, '0'); };
const fmtWait = s => s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + String(s % 60).padStart(2, '0') + 's';
const fmtWaitShort = s => s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + (s % 60 ? String(s % 60).padStart(2, '0') + 's' : '');
const fmtLogin = m => { const h = Math.floor(m / 60); return h > 0 ? h + 'h ' + (m % 60) + 'm' : m + 'm'; };
const initials = n => n.split(' ').map(w => w[0]).slice(0, 2).join('');
const avGrad = i => [['#6a5be8', '#a98aff'], ['#15a06a', '#3ac88a'], ['#e05641', '#ff8f6b'], ['#d9981f', '#f2c14e'], ['#a98aff', '#e05641']][i % 5];
const qById = id => QUEUES.find(q => q.id === id);
const avatarImgOnError = "this.parentElement.classList.add('av--initials');this.remove()";
function agentAvatarInnerHTML(a) {
  const src = agentPhotoSrc(a);
  const ini = initials(a.name);
  if (!src) return `<span>${ini}</span>`;
  return `<span class="av-ini">${ini}</span><img src="${src}" alt="" loading="lazy" onerror="${avatarImgOnError}">`;
}
function agentRingFaceHTML(a) {
  if (!isLiveDataMode()) {
    const nameIdx = NAMES.findIndex(n => n[0] === a.name);
    const [g1, g2] = avGrad(nameIdx >= 0 ? nameIdx : 0);
    const src = agentPhotoSrc(a);
    return `<div class="face" style="background:linear-gradient(135deg,${g1},${g2})"><span>${initials(a.name)}</span>${src ? `<img src="${src}" alt="" loading="lazy" onerror="this.remove()">` : ''}</div>`;
  }
  const src = agentPhotoSrc(a);
  return `<div class="face${src ? '' : ' av--initials'}">${agentAvatarInnerHTML(a)}</div>`;
}
function agentAvatarHTML(a, className = 'tip-av') {
  if (!isLiveDataMode()) {
    const nameIdx = NAMES.findIndex(n => n[0] === a.name);
    const [g1, g2] = avGrad(nameIdx >= 0 ? nameIdx : 0);
    const src = agentPhotoSrc(a);
    return `<div class="${className}" style="background:linear-gradient(135deg,${g1},${g2})"><span>${initials(a.name)}</span>${src ? `<img src="${src}" alt="" loading="lazy" onerror="this.remove()">` : ''}</div>`;
  }
  const src = agentPhotoSrc(a);
  return `<div class="${className}${src ? '' : ' av--initials'}">${agentAvatarInnerHTML(a)}</div>`;
}
function agentMapTipHTML(a) {
  const st = STATUS[a.status];
  const load = a.max ? Math.round(a.used / a.max * 100) : 0;
  const detail = a.status === 'offline' ? teamOf(a) : `${a.used}/${a.max} · ${load}% · ${teamOf(a)}`;
  const av = agentAvatarHTML(a);
  return `<div class="tip-row">${av}<div><div class="tn">${a.name}${a.flag ? ' ⚑' : ''}</div><div class="tm">${a.role}</div><div class="tip-st" style="color:${st.c}"><i style="background:${st.c}"></i>${st.lbl}</div></div></div><div class="tl">${detail}</div>`;
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
      id: 'wait', view: 'queues', lbl: 'Espera', val: fmtWaitShort(longest), raw: longest, state: lvl(longest, 150, 240),
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
function greet() { const hr = new Date().getHours(); return hr < 6 ? 'Bona nit' : hr < 13 ? 'Bon dia' : hr < 20 ? 'Bona tarda' : 'Bon vespre'; }
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
function legendHTML() { return `<div class="lg-group"><div class="lt">Equips</div><div class="lg-list">${Object.entries(TEAM_COLOR).map(([t, c]) => `<div class="li"><i style="width:11px;height:11px;border-radius:3px;background:${rgbc(c)}"></i>${t}</div>`).join('')}</div></div>`; }
function roomStageHTML(compact) {
  const b = buildBuilding();
  const s = { occ: b.occupied, hot: b.hot };
  const cls = compact ? 'building-stage ops-building' : 'building-stage';
  return {
    html: `<div class="${cls}">
        <div class="bldg-head">
          <span class="bcap">La sala · totes les plantes</span>
          <div style="display:flex;align-items:center;gap:12px">
            <span class="bstats">${statsHTML(s)}</span>
            <div class="bldg-compass">
              <button onclick="rotateBuildDir(-1)" title="Gira 90° a l'esquerra">↺</button>
              <button onclick="rotateBuildDir(1)" title="Gira 90° a la dreta">↻</button>
            </div>
          </div>
        </div>
        <div class="room-legend">${legendHTML()}</div>
        <div class="room-canvas">${b.svg}</div>
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
  canvas.innerHTML = b.svg;
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
        <div class="hello">${greet()}.</div>
        <div class="verdict">${verdictHTML(h)}</div>
        <div class="pillars">${pillarsHTML(h)}</div>
      </header>
      <div class="ops-layout">
        <aside class="ops-room">${room.html}</aside>
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
  container.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { filter.status = b.dataset.st; updateAgents(); });
  container.querySelectorAll('#agentGrid .card').forEach(c => c.onclick = () => openDrawer(c.dataset.id));
  startBuildingAnimation();
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
    el.appendChild(renderer.domElement);
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
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tip = document.getElementById('roomTip');
    const ptrs = new Map(); let moved = 0, lastPinch = 0, hoverId = null;
    const rect = () => renderer.domElement.getBoundingClientRect();
    const pan = (dx, dy) => { const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1), k = radius * 0.0016; target.addScaledVector(right, -dx * k); target.addScaledVector(up, dy * k); };
    let tipAgentId = null;
    const hover = e => {
      const rc = rect(); ndc.x = ((e.clientX - rc.left) / rc.width) * 2 - 1; ndc.y = -((e.clientY - rc.top) / rc.height) * 2 + 1; ray.setFromCamera(ndc, camera); const hit = ray.intersectObjects(pickables, false);
      if (hit.length) {
        const a = AGENTS.find(x => x.id === hit[0].object.userData.id); hoverId = a ? a.id : null;
        if (a) { if (a.id !== tipAgentId) { tip.innerHTML = agentMapTipHTML(a); tipAgentId = a.id; } tip.style.display = 'block'; tip.style.left = (e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 14) + 'px'; el.style.cursor = 'pointer'; }
      } else { hoverId = null; tipAgentId = null; tip.style.display = 'none'; el.style.cursor = 'grab'; }
    };
    const onDown = e => { if (el.setPointerCapture) el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, btn: e.button, shift: e.shiftKey }); moved = 0; };
    const onMove = e => {
      if (!ptrs.has(e.pointerId)) { hover(e); return; } const p = ptrs.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy); tip.style.display = 'none';
      if (ptrs.size >= 2) { const v = [...ptrs.values()], d = Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y); if (lastPinch) radius = clamp(radius * (lastPinch / d), 8, 90); lastPinch = d; pan(dx * 0.5, dy * 0.5); }
      else if (p.btn === 2 || p.shift) pan(dx, dy);
      else { theta -= dx * 0.005; phi = clamp(phi - dy * 0.005, 0.18, 1.45); }
    };
    const onUp = e => { if (ptrs.size === 1 && moved < 5 && hoverId) { tip.style.display = 'none'; openDrawer(hoverId); } ptrs.delete(e.pointerId); if (ptrs.size < 2) lastPinch = 0; };
    const onWheel = e => { e.preventDefault(); radius = clamp(radius * (1 + Math.sign(e.deltaY) * 0.08), 8, 90); };
    const onCtx = e => e.preventDefault(); const onLeave = () => { tip.style.display = 'none'; };
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
    return `<div class="c ${n > 0 ? 'active' : 'zero'}">${channelIconTileHtml(c, { size: 22 })}<div class="n">${n}</div></div>`;
  }).join('');
  const showChans = !isLiveDataMode() || ['veu', 'chat', 'wa', 'cas'].some((c) => (a.chans?.[c] || 0) > 0);
  const segs = Array.from({ length: a.max }).map((_, i) => `<span style="flex:1;background:${i < a.used ? st.c : 'transparent'}"></span>`).join('');
  const workRow = isLiveDataMode()
    ? `<div class="work"><div class="wic wic--sf">${sfIconTileHtml('work', { size: 26 })}</div><div class="wt">${a.used > 0 ? `${a.used} open work item(s)` : 'No active work'}</div></div>`
    : (a.work ? `<div class="work"><div class="wic wic--sf">${channelIconTileHtml(a.work.channelKey, { size: 26 })}</div><div class="wt"><b>${a.work.t}</b> · ${qById(a.work.q).name}</div><div class="timer mono">${fmtDur(a.workSec)}</div></div>` : `<div class="work"><div class="wic wic--sf">${sfIconTileHtml('work', { size: 26, bg: '#C9C7CD' })}</div><div class="wt">Sense feina activa</div></div>`);
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
    <div class="foot"><span>Loguejat <b class="mono">${a.status === 'offline' ? '—' : fmtLogin(a.loginMin)}</b></span>${isLiveDataMode() ? '' : `<span>Última feina <b class="mono">${a.lastAccept == null ? '—' : a.lastAccept + 'm'}</b></span>`}</div>
  </div>`;
}
function queueCard(q) {
  const cap = q.online * 5 || 1, p = Math.min(1, q.backlog / cap);
  return `<div class="qcard" onclick="document.getElementById('sec-agents').scrollIntoView({behavior:'smooth'})">
    <div class="qtop"><span class="qn" style="color:${q.color}">${sfIconTileHtml('queue', { size: 22, bg: q.color })}${q.name}</span><span class="qa"><i></i><b class="mono">${q.online}</b> online</span></div>
    <div class="pressure"><span style="width:${Math.max(6, p * 100)}%;background:${pColor(p)}"></span></div>
    <div class="qmetrics">
      <div class="m"><div class="v ${q.backlog > 8 ? 'warn' : ''}">${q.backlog}</div><div class="k">Backlog</div></div>
      <div class="m"><div class="v ${q.longest > 150 ? 'warn' : ''}">${fmtWaitShort(q.longest)}</div><div class="k">Espera màx</div></div>
      <div class="m"><div class="v">${fmtWaitShort(q.avg)}</div><div class="k">Espera mitj.</div></div>
    </div></div>`;
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

/* ───────── Queues view ───────── */
function pColor(p) { return p < .5 ? 'var(--ok)' : p < .8 ? 'var(--watch)' : 'var(--alert)'; }
function renderPlaceholder(container, v) {
  const P = {
    work: ['Work in progress', 'All work items traveling through queues to agents, with average handling time per queue and channel.'],
    skills: ['Backlog by skills', 'Pending items by skill routing: which skills have queue depth and which qualified agents are available.']
  };
  container.innerHTML = `<div class="view"><div class="placeholder"><h3>${P[v][0]}</h3><p>${P[v][1]}</p><p style="margin-top:14px;color:var(--accent)">Next iteration screen.</p></div></div>`;
}

/* ───────── Drawer ───────── */
function timelineLane(b) { return `<div class="tl-track">${b.map(x => `<div class="tl-block" style="left:${x.l}%;width:${x.w}%;background:${x.c}">${x.w > 9 ? x.t : ''}</div>`).join('')}<div class="tl-now" style="left:88%"></div></div>`; }
function openDrawer(id) {
  const a = AGENTS.find(x => x.id === id); if (!a) return;
  const st = STATUS[a.status];
  const live = isLiveDataMode();
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
      ${age == null ? '' : `<span class="assigned-queue-work-age mono">${age}m</span>`}
    </div>`;
  };
  const assignedQueuesHTML = queueSummaries.length
    ? `<div class="assigned-queue-list">${queueSummaries.map((q) => `<div class="assigned-queue-row">
      <div class="assigned-queue-head">
        <div class="assigned-queue-name">${sfIconTileHtml('queue', { size: 20, bg: q.color })}<span>${esc(q.name)}</span></div>
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
        const queuePill = w.queue ? `<span class="pill-q">${sfIconTileHtml('queue', { size: 14, bg: 'var(--accent)' })}<span style="color:var(--accent)">${esc(w.queue)}</span></span>` : '';
        const subj = w.subject ? `<div class="m">${esc(w.subject)}</div>` : `<div class="m">${esc(chLabel)}</div>`;
        return `<div class="wi"><div class="wic wic--sf">${channelIconTileHtml(w.channelKey, { size: 32 })}</div><div class="info"><div class="t">${esc(w.label)}</div>${subj}</div>${queuePill}<span class="age mono">${w.ageMin}m</span></div>`;
      }).join('')}</div></section>`
      : '')
    : `<section><h4>Feina activa (${items.length})</h4><div class="worklist">${items.map(w => `<div class="wi"><div class="wic wic--sf">${channelIconTileHtml(w.channelKey, { size: 32 })}</div><div class="info"><div class="t">${w.t}</div><div class="m">${CH_LBL[w.channelKey] || 'Canal'}</div></div><span class="pill-q">${sfIconTileHtml('queue', { size: 14, bg: qById(w.q).color })}<span style="color:${qById(w.q).color}">${qById(w.q).name}</span></span><span class="age mono">${w.age}m</span></div>`).join('')}</div></section>`;
  document.getElementById('drawer').innerHTML = `
    <div class="dr-head"><button class="dr-close" onclick="closeDrawer()">✕</button>
      <div class="dr-id"><div class="ring ${a.status === 'busy' ? 'breathe' : ''}" style="--st:${st.c};width:58px;height:58px">${ringSVG(a.used, a.max, st.c, 58)}${agentRingFaceHTML(a)}</div>
        <div><div class="nm">${a.name}</div><div class="rl">${a.role}</div><div class="status-pill" style="color:${st.c};background:color-mix(in srgb,${st.c} 12%,transparent)"><i style="background:${st.c}"></i>${st.lbl}</div></div></div>
    </div>
    <div class="dr-actions">${drawerActions}</div>
    <div class="dr-body">
      <section><h4>Resum d'activitat</h4><div class="stat-grid">
        <div class="s"><div class="v" style="color:${st.c}">${a.used}/${a.max}</div><div class="k">Capacitat</div></div>
        <div class="s"><div class="v">${a.status === 'offline' ? '—' : fmtLogin(a.loginMin)}</div><div class="k">Loguejat</div></div>
        ${live ? '' : `<div class="s"><div class="v">${a.lastAccept == null ? '—' : a.lastAccept + 'm'}</div><div class="k">Última feina</div></div>`}
      </div></section>
      <section><h4>Assigned queues</h4>${assignedQueuesHTML}</section>
      ${timelineSection}
      ${workSection}
    </div>`;
  document.getElementById('drawer').classList.add('show'); document.getElementById('scrim').classList.add('show');
}
function closeDrawer() { document.getElementById('drawer').classList.remove('show'); document.getElementById('scrim').classList.remove('show'); }
document.getElementById('scrim').onclick = closeDrawer;
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

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
  const y = [0];
  for (let i = 0; i < floors.length - 1; i++) {
    y.push(y[y.length - 1] + opts.slabT + opts.maxH + opts.beaconPad + opts.marginMin);
  }
  return y;
}
function getFixedFloorOffsets(dir, gMaxC, gMaxR, minH, maxH, TH) {
  if (fixedFloorLayout.dir === dir && fixedFloorLayout.offsets) return fixedFloorLayout.offsets;
  const { offsets } = computeFloorLayout(FLOORS, dir, gMaxC, gMaxR, {
    minH, maxH, TH, beaconPad: 24, marginMin: 14, marginBase: 28
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
    canvas.innerHTML = b.svg;
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
  const svg = buildBuildingSVG(FLOORS, dir, {
    floorOffsets,
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
  return { svg, occupied, hot };
}
function attachSeats(root) {
  const canvas = root?.querySelector('.room-canvas');
  if (!canvas || canvas.dataset.seatsBound) return;
  canvas.dataset.seatsBound = '1';
  const tip = document.getElementById('roomTip');
  let tipSeatAgentId = null;
  canvas.addEventListener('mousemove', e => {
    const g = e.target.closest('.seat[data-id]');
    if (!g) { tipSeatAgentId = null; return; }
    const a = AGENTS.find(x => x.id === g.dataset.id);
    if (!a) { tipSeatAgentId = null; return; }
    if (a.id !== tipSeatAgentId) { tip.innerHTML = agentMapTipHTML(a); tipSeatAgentId = a.id; }
    tip.style.display = 'block'; tip.style.left = (e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 14) + 'px';
  });
  canvas.addEventListener('mouseleave', () => { tip.style.display = 'none'; tipSeatAgentId = null; });
  canvas.addEventListener('click', e => {
    const g = e.target.closest('.seat[data-id]');
    if (!g) return;
    tip.style.display = 'none';
    openDrawer(g.dataset.id);
  });
}

/* ───────── Workspace shell ───────── */
const LEGACY_VIEW_MAP = { detail: 'operations', overview: 'operations' };

PanoramaWorkspace.registerPanelType({
  viewType: 'operations',
  defaultLabel: 'Operations',
  mount(container) { renderDetail(container); },
  activate(container, config) {
    if (config.anchor) scrollToAnchor(config.anchor);
    startBuildingAnimation();
  },
  deactivate() { Scene3D.dispose(); },
});

PanoramaWorkspace.registerPanelType({
  viewType: 'work',
  defaultLabel: 'Work',
  mount(container) { renderPlaceholder(container, 'work'); },
});

PanoramaWorkspace.registerPanelType({
  viewType: 'skills',
  defaultLabel: 'Skills',
  mount(container) { renderPlaceholder(container, 'skills'); },
});

registerFloorEditorPanel();

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
    };
    const id = opts.newTab
      ? PanoramaWorkspace.open(descriptor)
      : PanoramaWorkspace.openOrFocus(descriptor);
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
  defaults: [{ id: 'p-operations', viewType: 'operations', label: 'Operations', pinned: true }],
});

PanoramaWorkspace.onChange((event, panel) => {
  if (event === 'activate' && panel.viewType !== 'operations') window.scrollTo(0, 0);
});

/* ───────── Global search (header dropdown) ───────── */
const DROPDOWN_TRANSITION_MS = 180;
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
  },

  isOpen() { return this.open; },

  syncAnimation() {
    if (this.open) {
      clearTimeout(this.closeTimeoutId);
      this.drop.hidden = false;
      this.drop.classList.remove('is-open');
      requestAnimationFrame(() => {
        this.drop.classList.add('is-open');
      });
      return;
    }

    this.drop.classList.remove('is-open');
    clearTimeout(this.closeTimeoutId);
    this.closeTimeoutId = setTimeout(() => {
      this.drop.hidden = true;
    }, DROPDOWN_TRANSITION_MS);
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

  run(q) {
    if (!q) return { agents: [], queues: [], skills: [], workItems: [] };
    const agents = AGENTS.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.role.toLowerCase().includes(q) ||
      teamOf(a).toLowerCase().includes(q)
    ).slice(0, 8);
    const queues = queueState.filter(qu => qu.name.toLowerCase().includes(q)).slice(0, 6);
    const skills = isLiveDataMode() ? [] : SKILLS.filter(s => s.name.toLowerCase().includes(q)).slice(0, 6);
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
    const av = isLiveDataMode()
      ? agentAvatarHTML(a, 'si-av')
      : (() => {
        const nameIdx = NAMES.findIndex(n => n[0] === a.name);
        const [g1, g2] = avGrad(nameIdx >= 0 ? nameIdx : 0);
        const src = agentPhotoSrc(a);
        return `<span class="si-av" style="background:linear-gradient(135deg,${g1},${g2})"><span>${initials(a.name)}</span>${src ? `<img src="${src}" alt="" loading="lazy" onerror="this.remove()">` : ''}</span>`;
      })();
    return `<button type="button" class="qsearch-item${idx === this.activeIdx ? ' on' : ''}" role="option" data-kind="agent" data-id="${a.id}">
          ${av}
          <span class="si-main"><div class="si-title">${this.esc(a.name)}${a.flag ? ' ⚑' : ''}</div><div class="si-meta">${this.esc(a.role)}</div></span>
          <span class="si-badge" style="color:${st.c};background:color-mix(in srgb,${st.c} 12%,transparent)">${st.lbl}</span>
        </button>`;
  },

  queueItem(q, idx) {
    return `<button type="button" class="qsearch-item${idx === this.activeIdx ? ' on' : ''}" role="option" data-kind="queue" data-id="${q.id}">
          ${sfIconTileHtml('queue', { size: 30, bg: q.color })}
          <span class="si-main"><div class="si-title">${this.esc(q.name)}</div><div class="si-meta">${q.backlog} backlog · ${q.online} online</div></span>
          <span class="si-kbd">Queue</span>
        </button>`;
  },

  skillItem(s, idx) {
    return `<button type="button" class="qsearch-item${idx === this.activeIdx ? ' on' : ''}" role="option" data-kind="skill" data-id="${s.id}">
          ${sfIconTileHtml('skill', { size: 30, bg: sfIconColor('skill') })}
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

  render() {
    const q = this.query();
    if (!q) {
      this.items = [];
      this.setContent('<div class="qsearch-hint">Search agents, queues, skills, and work items.<br>Your current view stays unchanged.</div>');
      return;
    }
    const { agents, queues, skills, workItems } = this.run(q);
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
    if (kind === 'agent' || kind === 'work') openDrawer(id);
    else if (kind === 'queue') {
      Panorama.open('operations', { anchor: 'queues' });
    } else if (kind === 'skill') Panorama.open('skills');
    this.closePanel(true);
  }
};
GlobalSearch.init();

// ── Settings modal ──────────────────────────────────────────────────────
const SettingsModal = {
  backdrop: document.getElementById('settingsBackdrop'),

  open(runtimeConfig) {
    this._populate(runtimeConfig);
    this.backdrop.classList.add('open');
    document.getElementById('settingsClose').focus();
    document.addEventListener('keydown', this._onKey);
  },

  close() {
    this.backdrop.classList.remove('open');
    document.removeEventListener('keydown', this._onKey);
  },

  _onKey(e) {
    if (e.key === 'Escape') SettingsModal.close();
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
    const dsEl = document.getElementById('settingsDataSource');
    if (dsEl && runtimeConfig && dsEl.value !== runtimeConfig.dataSource) {
      try { localStorage.setItem('panorama.dataSource', dsEl.value); } catch { /* ignore */ }
      globalThis.location.reload();
    }
  },

  init(runtimeConfig) {
    document.getElementById('settingsClose').addEventListener('click', () => this.close());
    document.getElementById('settingsCancel').addEventListener('click', () => this.close());
    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) this.close();
    });

    this.backdrop.querySelectorAll('.settings-nav-item').forEach(btn => {
      btn.addEventListener('click', () => this._navTo(btn.dataset.section));
    });

    document.getElementById('settingsSave').addEventListener('click', () => {
      this._save(runtimeConfig);
      this.close();
    });

    document.getElementById('settingsSfReauth')?.addEventListener('click', () => {
      this.close();
      globalThis.location.href = '/?source=salesforce';
    });

    document.getElementById('settingsClearStorage')?.addEventListener('click', () => {
      if (confirm('S\'esborraran totes les dades locals (sessió, preferències i caché). Continuar?')) {
        localStorage.clear();
        globalThis.location.reload();
      }
    });

    Panorama.openSettings = () => this.open(runtimeConfig);
  },
};

SettingsModal.init(globalThis.__panoramaRuntimeConfig);

Object.assign(globalThis, {
  updateOverviewMetrics,
  updateAgents,
  updateRoomPanel,
  refreshFloors,
  queueCard,
  Scene3D,
  setBuildDir,
  rotateBuildDir,
  closeDrawer,
});
