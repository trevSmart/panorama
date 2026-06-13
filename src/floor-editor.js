import { baseFloors } from './data/floor-layout.js';
import { saveCustomFloors, clearCustomFloors, loadCustomRoomDir } from './data/floor-store.js';
import { buildBuildingSVG } from './building-render.js';
import { exteriorEdges, sanitizeOpenings } from './data/wall-edges.js';

/**
 * Floor editor workspace panel: top-down 2D grid editing (cells + seats +
 * floor management) with a live read-only isometric preview. Persists via
 * floor-store and notifies the running views through globalThis.refreshFloors.
 */

const GRID_C = 24, GRID_R = 16;
const SEED_BLOCK = 4; // new floors start as a SEED_BLOCK × SEED_BLOCK patch
const EDGE_TOOLS = ['door', 'window', 'erase'];

const key = (c, r) => `${c},${r}`;
const parseKey = (k) => k.split(',').map(Number);
const openingsToMap = (arr) => new Map((arr || []).map((o) => [`${o.c},${o.r},${o.edge}`, o.kind]));
const openingsToArray = (map) => [...map].map(([k, kind]) => {
  const [c, r, edge] = k.split(',');
  return { c: Number(c), r: Number(r), edge, kind };
});

function toSetFloor(f) {
  return {
    name: f.name,
    cells: new Set(f.cells.map(([c, r]) => key(c, r))),
    seats: new Set(f.seats.map(([c, r]) => key(c, r))),
    openings: openingsToMap(f.openings),
  };
}
function toArrayFloor(f) {
  const openings = openingsToArray(f.openings);
  return {
    name: f.name,
    cells: [...f.cells].map(parseKey),
    seats: [...f.seats].map(parseKey),
    openings,
  };
}
function loadWorkingFloors() {
  return baseFloors().map(toSetFloor);
}

export function registerFloorEditorPanel() {
  PanoramaWorkspace.registerPanelType({
    viewType: 'floor-editor',
    defaultLabel: 'Editor de plantes',
    mount(container) { mountEditor(container); },
  });
}

function mountEditor(container) {
  const state = {
    floors: loadWorkingFloors(),
    active: 0,
    tool: 'cell',          // 'cell' | 'seat' | 'door' | 'window' | 'erase'
    dirty: false,
    previewDir: loadCustomRoomDir(),
    paint: null,           // during drag: { mode: 'add' | 'remove' }
  };

  container.innerHTML = `
    <div class="view view-floor-editor">
      <div class="fe-layout">
        <div class="fe-main">
          <div class="fe-toolbar">
            <div class="fe-tools" role="group" aria-label="Eines">
              <button data-tool="cell" class="on" title="Pinta o esborra cel·les de terra">▦ Cel·les</button>
              <button data-tool="seat" title="Col·loca o treu seients (només sobre cel·les)">▣ Seients</button>
              <button data-tool="door" title="Col·loca o treu portes a les arestes exteriors">▯ Porta</button>
              <button data-tool="window" title="Col·loca o treu finestres a les arestes exteriors">⊞ Finestra</button>
              <button data-tool="erase" title="Esborra seients i cel·les">⌫ Esborra</button>
            </div>
            <span class="fe-dirty" hidden>● canvis sense desar</span>
            <span class="fe-msg" hidden></span>
            <div class="fe-actions">
              <button class="fe-reset" title="Torna al disseny per defecte">Restableix</button>
              <button class="fe-save primary" title="Desa el disseny en aquest navegador">Desa</button>
            </div>
          </div>
          <div class="fe-grid-wrap">
            <div class="fe-grid" style="--fe-cols:${GRID_C}" aria-label="Quadrícula de la planta"></div>
          </div>
          <div class="fe-hint">Clica i arrossega per pintar. Amb <b>▦ Cel·les</b> dibuixes la silueta de la planta; amb <b>▣ Seients</b> marques els llocs de treball.</div>
        </div>
        <aside class="fe-side">
          <section class="fe-floors">
            <div class="fe-side-title">Plantes <button class="fe-add">+ Afegeix</button></div>
            <div class="fe-floor-list"></div>
          </section>
          <section class="fe-preview">
            <div class="fe-side-title">Previsualització
              <div class="fe-rotate">
                <button data-rot="left" title="Gira 90° a l'esquerra">↺</button>
                <button data-rot="right" title="Gira 90° a la dreta">↻</button>
              </div>
            </div>
            <div class="fe-preview-canvas"></div>
          </section>
        </aside>
      </div>
    </div>`;

  const gridEl = container.querySelector('.fe-grid');
  const listEl = container.querySelector('.fe-floor-list');
  const previewEl = container.querySelector('.fe-preview-canvas');
  const dirtyEl = container.querySelector('.fe-dirty');
  const msgEl = container.querySelector('.fe-msg');

  /* ── grid ── */
  const cellEls = new Map(); // "c,r" → div
  for (let r = 0; r < GRID_R; r++) {
    for (let c = 0; c < GRID_C; c++) {
      const d = document.createElement('div');
      d.className = 'fe-cell';
      d.dataset.c = c; d.dataset.r = r;
      for (const edge of ['N', 'S', 'E', 'O']) {
        const eEl = document.createElement('div');
        eEl.className = `fe-edge fe-edge-${edge}`;
        eEl.dataset.edge = edge;
        d.appendChild(eEl);
      }
      gridEl.appendChild(d);
      cellEls.set(key(c, r), d);
    }
  }
  function paintCellEl(k) {
    const el = cellEls.get(k);
    if (!el) return;
    const f = state.floors[state.active];
    const isCell = f.cells.has(k);
    el.classList.toggle('cell', isCell);
    el.classList.toggle('seat', f.seats.has(k));
    const [c, r] = parseKey(k);
    const ext = isCell ? new Set(exteriorEdges(c, r, f.cells)) : new Set();
    el.querySelectorAll('.fe-edge').forEach((eEl) => {
      const edge = eEl.dataset.edge;
      const exterior = ext.has(edge);
      eEl.classList.toggle('exterior', exterior);
      const kind = exterior ? f.openings.get(`${c},${r},${edge}`) : undefined;
      eEl.classList.toggle('door', kind === 'door');
      eEl.classList.toggle('window', kind === 'window');
    });
  }
  function renderGrid() {
    cellEls.forEach((_, k) => paintCellEl(k));
  }

  /* ── preview (rAF-batched) ── */
  let previewQueued = false;
  function renderPreview() {
    const decorated = state.floors.map((f) => {
      const arr = toArrayFloor(f);
      return {
        name: arr.name,
        cells: arr.cells,
        cellset: new Set(f.cells),
        assigned: arr.seats.map(([c, r]) => ({ c, r })),
        openings: arr.openings,
      };
    });
    previewEl.innerHTML = buildBuildingSVG(decorated, state.previewDir, { headroom: 10 });
  }
  function schedulePreview() {
    if (previewQueued) return;
    previewQueued = true;
    requestAnimationFrame(() => { previewQueued = false; renderPreview(); });
  }

  /* ── floor list ── */
  function renderFloors() {
    listEl.innerHTML = '';
    state.floors.forEach((f, i) => {
      const row = document.createElement('div');
      row.className = 'fe-floor' + (i === state.active ? ' on' : '');
      const name = document.createElement('span');
      name.className = 'fe-floor-name';
      name.textContent = f.name;
      name.title = 'Doble clic per reanomenar';
      const meta = document.createElement('span');
      meta.className = 'fe-floor-meta mono';
      meta.textContent = `${f.cells.size}▦ ${f.seats.size}▣ ${f.openings.size}▭`;
      const del = document.createElement('button');
      del.className = 'fe-floor-del';
      del.textContent = '✕';
      del.title = 'Elimina la planta';
      del.disabled = state.floors.length <= 1;
      row.append(name, meta, del);
      row.addEventListener('click', () => {
        if (state.active === i) return;
        state.active = i;
        renderFloors(); renderGrid();
      });
      name.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        startRename(name, f);
      });
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.floors.length <= 1) return;
        if (!confirm(`Eliminar la planta «${f.name}»?`)) return;
        state.floors.splice(i, 1);
        if (state.active >= state.floors.length) state.active = state.floors.length - 1;
        markDirty();
        renderFloors(); renderGrid(); schedulePreview();
      });
      listEl.appendChild(row);
    });
  }
  function startRename(nameEl, floor) {
    const input = document.createElement('input');
    input.className = 'fe-floor-rename';
    input.value = floor.name;
    input.maxLength = 40;
    nameEl.replaceWith(input);
    input.focus(); input.select();
    let done = false;
    const commit = () => {
      if (done) return; done = true;
      const v = input.value.trim();
      if (v && v !== floor.name) { floor.name = v; markDirty(); schedulePreview(); }
      renderFloors();
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
      else if (e.key === 'Escape') { done = true; renderFloors(); }
    });
  }
  container.querySelector('.fe-add').addEventListener('click', () => {
    const cells = new Set();
    for (let r = 0; r < SEED_BLOCK; r++) for (let c = 0; c < SEED_BLOCK; c++) cells.add(key(c, r));
    state.floors.push({ name: `Planta ${state.floors.length + 1}`, cells, seats: new Set(), openings: new Map() });
    state.active = state.floors.length - 1;
    markDirty();
    renderFloors(); renderGrid(); schedulePreview();
  });

  /* ── painting ── */
  function applyTool(k, mode) {
    const f = state.floors[state.active];
    let changed = false;
    let cellsChanged = false;
    if (state.tool === 'cell') {
      if (mode === 'add') { if (!f.cells.has(k)) { f.cells.add(k); changed = true; cellsChanged = true; } }
      else if (f.cells.has(k)) {
        f.cells.delete(k);
        f.seats.delete(k);
        changed = true; cellsChanged = true;
      }
    } else if (state.tool === 'seat') {
      if (mode === 'add') { if (f.cells.has(k) && !f.seats.has(k)) { f.seats.add(k); changed = true; } }
      else if (f.seats.has(k)) { f.seats.delete(k); changed = true; }
    } else { // erase (cell/seat part; edge erase handled in pointerdown)
      if (f.seats.has(k)) { f.seats.delete(k); changed = true; }
      else if (f.cells.has(k)) { f.cells.delete(k); changed = true; cellsChanged = true; }
    }
    if (cellsChanged) {
      const kept = sanitizeOpenings(openingsToArray(f.openings), f.cells);
      f.openings = openingsToMap(kept);
      // Only this cell and its 4 orthogonal neighbours can change exterior
      // edges, so repaint just those rather than the whole grid.
      const [cc, rr] = parseKey(k);
      [[cc, rr], [cc, rr - 1], [cc, rr + 1], [cc - 1, rr], [cc + 1, rr]]
        .forEach(([nc, nr]) => paintCellEl(key(nc, nr)));
    }
    if (changed) {
      if (!cellsChanged) paintCellEl(k);
      markDirty();
      schedulePreview();
    }
  }
  function applyEdgeTool(cellEl, edgeEl) {
    if (!EDGE_TOOLS.includes(state.tool)) return false;
    if (!edgeEl.classList.contains('exterior')) return false;
    const c = Number(cellEl.dataset.c), r = Number(cellEl.dataset.r);
    const edge = edgeEl.dataset.edge;
    const f = state.floors[state.active];
    const k = `${c},${r},${edge}`;
    const cur = f.openings.get(k);
    if (state.tool === 'erase') {
      if (!cur) return false;
      f.openings.delete(k);
    } else if (cur === state.tool) {
      f.openings.delete(k);
    } else {
      f.openings.set(k, state.tool);
    }
    paintCellEl(`${c},${r}`);
    markDirty();
    schedulePreview();
    return true;
  }
  function cellFromEvent(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.fe-cell');
    return el ? key(el.dataset.c, el.dataset.r) : null;
  }
  gridEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const edgeEl = e.target.closest('.fe-edge');
    if (edgeEl && EDGE_TOOLS.includes(state.tool)) {
      const cellEl = edgeEl.closest('.fe-cell');
      if (applyEdgeTool(cellEl, edgeEl)) { e.preventDefault(); return; }
      if (state.tool !== 'erase') return; // door/window on non-opening edge: nothing else to do
      // erase with no opening on this edge: fall through to cell/seat erase
    }
    const k = cellFromEvent(e);
    if (!k) return;
    if (state.tool === 'door' || state.tool === 'window') return; // these tools only act on edges
    const f = state.floors[state.active];
    let mode = 'add';
    if (state.tool === 'cell') mode = f.cells.has(k) ? 'remove' : 'add';
    else if (state.tool === 'seat') mode = f.seats.has(k) ? 'remove' : 'add';
    else mode = 'remove';
    state.paint = { mode };
    gridEl.setPointerCapture(e.pointerId);
    applyTool(k, mode);
  });
  gridEl.addEventListener('pointermove', (e) => {
    if (!state.paint) return;
    const k = cellFromEvent(e);
    if (k) applyTool(k, state.paint.mode);
  });
  const endPaint = () => { state.paint = null; };
  gridEl.addEventListener('pointerup', endPaint);
  gridEl.addEventListener('pointercancel', endPaint);

  /* ── toolbar ── */
  container.querySelectorAll('.fe-tools button').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.tool = btn.dataset.tool;
      container.querySelectorAll('.fe-tools button').forEach((b) => b.classList.toggle('on', b === btn));
      gridEl.dataset.tool = state.tool;
    });
  });
  gridEl.dataset.tool = state.tool;

  // Camera directions in clockwise screen order (compassDeg 90→180→270→0).
  const ROT_CW = { 0: 2, 2: 3, 3: 1, 1: 0 };
  const ROT_CCW = { 0: 1, 1: 3, 3: 2, 2: 0 };
  container.querySelectorAll('.fe-rotate button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const map = btn.dataset.rot === 'right' ? ROT_CW : ROT_CCW;
      state.previewDir = map[state.previewDir];
      markDirty();
      schedulePreview();
    });
  });

  /* ── dirty + messages ── */
  let msgTimer = null;
  function showMsg(text, kind) {
    msgEl.textContent = text;
    msgEl.className = `fe-msg ${kind}`;
    msgEl.hidden = false;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { msgEl.hidden = true; }, 3200);
  }
  function markDirty() {
    state.dirty = true;
    dirtyEl.hidden = false;
  }
  function clearDirty() {
    state.dirty = false;
    dirtyEl.hidden = true;
  }

  /* ── save / reset ── */
  container.querySelector('.fe-save').addEventListener('click', () => {
    try {
      const clean = saveCustomFloors(state.floors.map(toArrayFloor), state.previewDir);
      state.floors = clean.map(toSetFloor);
      if (state.active >= state.floors.length) state.active = state.floors.length - 1;
      clearDirty();
      renderFloors(); renderGrid(); schedulePreview();
      globalThis.refreshFloors?.();
      showMsg('✓ Desat. Les vistes ja mostren el nou disseny.', 'ok');
    } catch {
      showMsg('No s\'ha pogut desar: cada planta necessita almenys una cel·la.', 'error');
    }
  });
  container.querySelector('.fe-reset').addEventListener('click', () => {
    if (!confirm('Restablir el disseny per defecte? Es perdrà la personalització desada.')) return;
    clearCustomFloors();
    state.floors = loadWorkingFloors();
    state.active = 0;
    state.previewDir = loadCustomRoomDir();
    clearDirty();
    renderFloors(); renderGrid(); schedulePreview();
    globalThis.refreshFloors?.();
    showMsg('Disseny per defecte restablert.', 'ok');
  });

  /* ── initial paint ── */
  renderFloors();
  renderGrid();
  renderPreview();
}
