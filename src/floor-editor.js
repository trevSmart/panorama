import { basePlaces } from './data/floor-layout.js';
import { devConsole } from './dev/dev-console.js';
import {
  saveCustomRoom,
  loadCustomRoomDir,
  loadActivePlaceId,
  makePlaceId,
} from './data/floor-store.js';
import { buildBuildingSVG } from './building-render.js';
import {
  DEFAULT_BG_OPACITY,
  FLOOR_BACKGROUNDS,
  backgroundUrl,
} from './data/floor-backgrounds.js';
import { rotateLeftIconHtml, rotateRightIconHtml } from './ui/rotate-icons.js';
import { exteriorEdges, interiorEdges, canonicalDivider, sanitizeOpenings, sanitizeDividers } from './data/wall-edges.js';

/**
 * Floor editor workspace panel: top-down 2D grid editing (cells + seats +
 * floor management) with a live read-only isometric preview. Persists via
 * floor-store and notifies the running views through globalThis.refreshFloors.
 */

const GRID_C = 23, GRID_R = 16;
const SEED_BLOCK = 4; // new floors start as a SEED_BLOCK × SEED_BLOCK patch
const EDGE_TOOLS = ['door', 'window', 'divider', 'erase'];
const UNDO_LIMIT = 10;

const FE_SPLIT_KEY = 'panorama.feSplit';
const FE_SPLIT_DEFAULT = 64;
const FE_SPLIT_MIN = 40;
const FE_SPLIT_MAX = 82;

const key = (c, r) => `${c},${r}`;
const parseKey = (k) => k.split(',').map(Number);
const openingsToMap = (arr) => new Map((arr || []).map((o) => [`${o.c},${o.r},${o.edge}`, o.kind]));
const openingsToArray = (map) => [...map].map(([k, kind]) => {
  const [c, r, edge] = k.split(',');
  return { c: Number(c), r: Number(r), edge, kind };
});
const dividersToSet = (arr) => new Set((arr || []).map((d) => `${d.c},${d.r},${d.edge}`));
const dividersToArray = (set) => [...set].map((kk) => {
  const [c, r, edge] = kk.split(',');
  return { c: Number(c), r: Number(r), edge };
});

function toSetFloor(f) {
  return {
    name: f.name,
    cells: new Set(f.cells.map(([c, r]) => key(c, r))),
    seats: new Set(f.seats.map(([c, r]) => key(c, r))),
    openings: openingsToMap(f.openings),
    dividers: dividersToSet(f.dividers),
    background: f.background || null,
    backgroundOpacity: f.backgroundOpacity ?? DEFAULT_BG_OPACITY,
  };
}
function toArrayFloor(f) {
  const openings = openingsToArray(f.openings);
  const dividers = dividersToArray(f.dividers);
  return {
    name: f.name,
    cells: [...f.cells].map(parseKey),
    seats: [...f.seats].map(parseKey),
    openings,
    dividers,
    background: f.background || null,
    backgroundOpacity: f.backgroundOpacity ?? DEFAULT_BG_OPACITY,
  };
}
function cloneFloor(f) {
  return {
    name: f.name,
    cells: new Set(f.cells),
    seats: new Set(f.seats),
    openings: new Map(f.openings),
    dividers: new Set(f.dividers),
    background: f.background || null,
    backgroundOpacity: f.backgroundOpacity ?? DEFAULT_BG_OPACITY,
  };
}
function duplicateFloorName(name, floors) {
  const names = new Set(floors.map((fl) => fl.name));
  let candidate = `${name} (còpia)`;
  if (!names.has(candidate)) return candidate;
  for (let n = 2; n < 100; n++) {
    candidate = `${name} (còpia ${n})`;
    if (!names.has(candidate)) return candidate;
  }
  return `${name} (còpia ${Date.now()})`;
}
function clonePlace(p) {
  return { id: p.id, name: p.name, floors: p.floors.map(cloneFloor) };
}
function toArrayPlace(p) {
  return { id: p.id, name: p.name, floors: p.floors.map(toArrayFloor) };
}
function seedFloorCells() {
  const cells = new Set();
  for (let r = 0; r < SEED_BLOCK; r++) for (let c = 0; c < SEED_BLOCK; c++) cells.add(key(c, r));
  return cells;
}
function loadWorkingPlaces() {
  const places = basePlaces();
  return {
    places: places.map((p) => ({
      id: p.id,
      name: p.name,
      floors: p.floors.map(toSetFloor),
    })),
    activePlaceId: loadActivePlaceId() || places[0].id,
  };
}

export function registerFloorEditorPanel() {
  PanoramaWorkspace.registerPanelType({
    viewType: 'floor-editor',
    defaultLabel: 'Floor editor',
    mount(container) { mountEditor(container); },
  });
}

function loadFeSplit() {
  try {
    const v = parseFloat(localStorage.getItem(FE_SPLIT_KEY));
    if (Number.isFinite(v)) return Math.min(FE_SPLIT_MAX, Math.max(FE_SPLIT_MIN, v));
  } catch { /* ignore */ }
  return FE_SPLIT_DEFAULT;
}

/** Drag-to-resize splitter between the grid (left) and sidebar (right). */
function attachFeResizer(container) {
  const layout = container.querySelector('.fe-layout');
  const handle = container.querySelector('.fe-resizer');
  if (!layout || !handle) return;

  const apply = (pct) => layout.style.setProperty('--fe-split', pct + '%');
  apply(loadFeSplit());

  const pctFromEvent = (clientX) => {
    const r = layout.getBoundingClientRect();
    const pct = ((clientX - r.left) / r.width) * 100;
    return Math.min(FE_SPLIT_MAX, Math.max(FE_SPLIT_MIN, pct));
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
    document.body.classList.remove('fe-resizing');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    const cur = parseFloat(layout.style.getPropertyValue('--fe-split'));
    try { localStorage.setItem(FE_SPLIT_KEY, String(cur)); } catch { /* ignore */ }
  };

  handle.addEventListener('pointerdown', (e) => {
    dragging = true;
    handle.classList.add('dragging');
    document.body.classList.add('fe-resizing');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    e.preventDefault();
  });

  handle.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowLeft' ? -2 : e.key === 'ArrowRight' ? 2 : 0;
    if (!step) return;
    const cur = parseFloat(layout.style.getPropertyValue('--fe-split')) || loadFeSplit();
    const next = Math.min(FE_SPLIT_MAX, Math.max(FE_SPLIT_MIN, cur + step));
    apply(next);
    try { localStorage.setItem(FE_SPLIT_KEY, String(next)); } catch { /* ignore */ }
    e.preventDefault();
  });

  handle.addEventListener('dblclick', (e) => {
    e.preventDefault();
    apply(FE_SPLIT_DEFAULT);
    try { localStorage.removeItem(FE_SPLIT_KEY); } catch { /* ignore */ }
  });
}

function mountEditor(container) {
  const initial = loadWorkingPlaces();
  const state = {
    places: initial.places,
    activePlaceId: initial.activePlaceId,
    active: 0,
    tool: 'cell',          // 'cell' | 'seat' | 'door' | 'window' | 'divider' | 'erase'
    dirty: false,
    previewDir: loadCustomRoomDir(),
    paint: null,           // during drag: { mode: 'add' | 'remove' }
  };

  function curPlace() {
    return state.places.find((p) => p.id === state.activePlaceId) || state.places[0];
  }
  function curFloors() {
    return curPlace().floors;
  }
  function curFloor() {
    return curFloors()[state.active];
  }

  container.innerHTML = `
    <div class="view view-floor-editor">
      <div class="fe-layout">
        <div class="fe-main">
          <div class="fe-toolbar">
            <div class="fe-tools" role="group" aria-label="Eines">
              <button data-tool="cell" class="on" title="Afegeix cel·les d'àrea de terra"><svg class="fe-tool-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path d="M160 96L480 96C515.3 96 544 124.7 544 160L544 480C544 515.3 515.3 544 480 544L160 544C124.7 544 96 515.3 96 480L96 160C96 124.7 124.7 96 160 96z"/></svg> Àrea</button>
              <button data-tool="seat" title="Col·loca o treu agents (només sobre cel·les)"><svg class="fe-tool-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path d="M320 312C386.3 312 440 258.3 440 192C440 125.7 386.3 72 320 72C253.7 72 200 125.7 200 192C200 258.3 253.7 312 320 312zM290.3 368C191.8 368 112 447.8 112 546.3C112 562.7 125.3 576 141.7 576L498.3 576C514.7 576 528 562.7 528 546.3C528 447.8 448.2 368 349.7 368L290.3 368z"/></svg> Agent</button>
              <button data-tool="door" title="Afegeix portes a les arestes exteriors"><svg class="fe-tool-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path d="M384 128L448 128L448 544C448 561.7 462.3 576 480 576L512 576C529.7 576 544 561.7 544 544C544 526.3 529.7 512 512 512L512 128C512 92.7 483.3 64 448 64L352 64L352 64L192 64C156.7 64 128 92.7 128 128L128 512C110.3 512 96 526.3 96 544C96 561.7 110.3 576 128 576L352 576C369.7 576 384 561.7 384 544L384 128zM256 320C256 302.3 270.3 288 288 288C305.7 288 320 302.3 320 320C320 337.7 305.7 352 288 352C270.3 352 256 337.7 256 320z"/></svg> Porta</button>
              <button data-tool="window" title="Afegeix finestres a les arestes exteriors"><svg class="fe-tool-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M1.5 6a2.25 2.25 0 0 1 2.25-2.25h16.5A2.25 2.25 0 0 1 22.5 6v12a2.25 2.25 0 0 1-2.25 2.25H3.75A2.25 2.25 0 0 1 1.5 18V6ZM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0 0 21 18v-1.94l-2.69-2.689a1.5 1.5 0 0 0-2.12 0l-.88.879.97.97a.75.75 0 1 1-1.06 1.06l-5.16-5.159a1.5 1.5 0 0 0-2.12 0L3 16.061Zm10.125-7.81a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0Z" clip-rule="evenodd"/></svg> Finestra</button>
              <button data-tool="divider" title="Afegeix separadors a les arestes interiors"><svg class="fe-tool-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path d="M288 96C288 78.3 302.3 64 320 64C337.7 64 352 78.3 352 96L352 544C352 561.7 337.7 576 320 576C302.3 576 288 561.7 288 544L288 96z"/></svg> Separador</button>
              <button data-tool="erase" title="Esborra àrea, agents, portes i finestres"><svg class="fe-tool-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path d="M210.5 480L333.5 480L398.8 414.7L225.3 241.2L98.6 367.9L210.6 479.9zM256 544L210.5 544C193.5 544 177.2 537.3 165.2 525.3L49 409C38.1 398.1 32 383.4 32 368C32 352.6 38.1 337.9 49 327L295 81C305.9 70.1 320.6 64 336 64C351.4 64 366.1 70.1 377 81L559 263C569.9 273.9 576 288.6 576 304C576 319.4 569.9 334.1 559 345L424 480L544 480C561.7 480 576 494.3 576 512C576 529.7 561.7 544 544 544L256 544z"/></svg> Esborra</button>
            </div>
            <span class="fe-msg" hidden></span>
            <div class="fe-actions">
              <button class="fe-undo fe-icon-btn" disabled title="Desfer l'últim canvi (fins a ${UNDO_LIMIT} passos)" aria-label="Desfer">↩</button>
              <button class="fe-redo fe-icon-btn" disabled title="Refer el canvi des fet" aria-label="Refer">↪</button>
              <button class="fe-reset" disabled title="Descarta els canvis no desats i torna a l'última versió guardada">Restableix</button>
              <button class="fe-save primary" disabled title="Desa el disseny en aquest navegador">Desa</button>
            </div>
          </div>
          <div class="fe-grid-wrap">
            <div class="fe-grid" style="--fe-cols:${GRID_C}" aria-label="Quadrícula de la planta"></div>
          </div>
          <div class="fe-hint">Amb <b>Àrea</b> arrossega per afegir. <b>Agent</b> afegeix o treu en clicar. Només <b>Esborra</b> elimina la resta.</div>
        </div>
        <div class="fe-resizer" role="separator" aria-orientation="vertical" tabindex="0" title="Arrossega per ajustar l'amplada"></div>
        <aside class="fe-side">
          <section class="fe-places">
            <div class="fe-side-title">Llocs <button class="fe-add-place">+ Lloc</button></div>
            <div class="fe-place-list"></div>
          </section>
          <section class="fe-background">
            <div class="fe-side-title">Room background</div>
            <div class="fe-bg-picker" role="radiogroup" aria-label="Room background"></div>
            <label class="fe-bg-opacity">
              <span>Opacity</span>
              <input type="range" class="fe-bg-opacity-range" min="0" max="100" step="1" value="45" />
              <span class="fe-bg-opacity-val mono">45%</span>
            </label>
          </section>
          <section class="fe-preview">
            <div class="fe-side-title">Previsualització
              <div class="fe-rotate">
                <button data-rot="left" title="Gira 90° a l'esquerra">${rotateLeftIconHtml()}</button>
                <button data-rot="right" title="Gira 90° a la dreta">${rotateRightIconHtml()}</button>
              </div>
            </div>
            <div class="fe-preview-canvas"></div>
          </section>
        </aside>
      </div>
    </div>`;

  const bgPickerEl = container.querySelector('.fe-bg-picker');
  const bgOpacityRange = container.querySelector('.fe-bg-opacity-range');
  const bgOpacityVal = container.querySelector('.fe-bg-opacity-val');
  const gridEl = container.querySelector('.fe-grid');
  const listEl = container.querySelector('.fe-place-list');
  const previewEl = container.querySelector('.fe-preview-canvas');
  const msgEl = container.querySelector('.fe-msg');
  const undoBtn = container.querySelector('.fe-undo');
  const redoBtn = container.querySelector('.fe-redo');
  const resetBtn = container.querySelector('.fe-reset');
  const saveBtn = container.querySelector('.fe-save');

  attachFeResizer(container);

  let savedSignature = '';
  let savedSnapshot = null;
  const undoStack = [];
  const redoStack = [];
  let restoring = false;

  function layoutSignature() {
    return JSON.stringify({
      places: state.places.map(toArrayPlace),
      activePlaceId: state.activePlaceId,
      active: state.active,
      previewDir: state.previewDir,
    });
  }
  function captureSnapshot() {
    return {
      places: state.places.map(clonePlace),
      activePlaceId: state.activePlaceId,
      active: state.active,
      previewDir: state.previewDir,
    };
  }
  function restoreSnapshot(snap) {
    state.places = snap.places.map(clonePlace);
    state.activePlaceId = snap.activePlaceId;
    state.active = Math.min(snap.active, Math.max(0, curFloors().length - 1));
    state.previewDir = snap.previewDir;
    syncDirty();
    renderPlaces();
    renderGrid();
    renderBackgroundControls();
    schedulePreview();
    updateHistoryButtons();
  }
  function pushUndo() {
    if (restoring) return;
    undoStack.push(captureSnapshot());
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack.length = 0;
    updateHistoryButtons();
  }
  function undo() {
    if (!undoStack.length) return;
    restoring = true;
    redoStack.push(captureSnapshot());
    restoreSnapshot(undoStack.pop());
    restoring = false;
  }
  function redo() {
    if (!redoStack.length) return;
    restoring = true;
    undoStack.push(captureSnapshot());
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    restoreSnapshot(redoStack.pop());
    restoring = false;
  }
  function updateHistoryButtons() {
    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
  }

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
    const f = curFloor();
    const isCell = f.cells.has(k);
    el.classList.toggle('cell', isCell);
    el.classList.toggle('seat', f.seats.has(k));
    const [c, r] = parseKey(k);
    const ext = isCell ? new Set(exteriorEdges(c, r, f.cells)) : new Set();
    const intr = isCell ? new Set(interiorEdges(c, r, f.cells)) : new Set();
    el.querySelectorAll('.fe-edge').forEach((eEl) => {
      const edge = eEl.dataset.edge;
      const exterior = ext.has(edge);
      eEl.classList.toggle('exterior', exterior);
      const kind = exterior ? f.openings.get(`${c},${r},${edge}`) : undefined;
      eEl.classList.toggle('door', kind === 'door');
      eEl.classList.toggle('window', kind === 'window');
      const interior = intr.has(edge);
      eEl.classList.toggle('interior', interior);
      const canon = interior ? canonicalDivider(c, r, edge) : null;
      const hasDivider = canon ? f.dividers.has(`${canon.c},${canon.r},${canon.edge}`) : false;
      eEl.classList.toggle('divider', hasDivider);
    });
  }
  function renderGrid() {
    cellEls.forEach((_, k) => paintCellEl(k));
  }

  /* ── preview (rAF-batched) ── */
  let previewQueued = false;
  function buildPreviewOpts(extra = {}) {
    return { backgroundUrl, ...extra };
  }
  function floorDecorated(f) {
    const arr = toArrayFloor(f);
    return [{
      name: arr.name,
      cells: arr.cells,
      cellset: new Set(f.cells),
      assigned: arr.seats.map(([c, r]) => ({ c, r })),
      openings: arr.openings,
      dividers: arr.dividers,
      background: arr.background,
      backgroundOpacity: arr.backgroundOpacity,
    }];
  }
  function renderPreview() {
    const f = curFloor();
    previewEl.innerHTML = buildBuildingSVG(floorDecorated(f), state.previewDir, buildPreviewOpts({ headroom: 10 }));
  }
  function schedulePreview() {
    if (previewQueued) return;
    previewQueued = true;
    requestAnimationFrame(() => { previewQueued = false; renderPreview(); });
  }

  /* ── place + floor list ── */
  function makeFloorThumb(f) {
    const thumb = document.createElement('div');
    thumb.className = 'fe-floor-thumb';
    thumb.innerHTML = buildBuildingSVG(floorDecorated(f), state.previewDir, buildPreviewOpts({ headroom: 4 }));
    return thumb;
  }

  function renderBackgroundControls() {
    const f = curFloor();
    const activeId = f.background || '';
    const pct = Math.round((f.backgroundOpacity ?? DEFAULT_BG_OPACITY) * 100);
    bgOpacityRange.value = String(pct);
    bgOpacityVal.textContent = `${pct}%`;
    const disabled = !f.background;
    bgOpacityRange.disabled = disabled;
    bgOpacityRange.classList.toggle('disabled', disabled);
    bgPickerEl.innerHTML = '';
    const noneBtn = document.createElement('button');
    noneBtn.type = 'button';
    noneBtn.className = 'fe-bg-option' + (activeId ? '' : ' on');
    noneBtn.dataset.bg = '';
    noneBtn.title = 'No background';
    noneBtn.setAttribute('aria-label', 'No background');
    noneBtn.innerHTML = '<span class="fe-bg-none">None</span>';
    bgPickerEl.appendChild(noneBtn);
    FLOOR_BACKGROUNDS.forEach((bg) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fe-bg-option' + (activeId === bg.id ? ' on' : '');
      btn.dataset.bg = bg.id;
      btn.title = bg.label;
      btn.setAttribute('aria-label', bg.label);
      btn.innerHTML = `<img src="${encodeURI(bg.url)}" alt="" loading="lazy"/>`;
      bgPickerEl.appendChild(btn);
    });
  }

  function startRename(nameEl, target, onDone) {
    const input = document.createElement('input');
    input.className = 'fe-floor-rename';
    input.value = target.name;
    input.maxLength = 40;
    nameEl.replaceWith(input);
    input.focus(); input.select();
    let done = false;
    const commit = () => {
      if (done) return; done = true;
      const v = input.value.trim();
      if (v && v !== target.name) {
        pushUndo();
        target.name = v;
        syncDirty();
        schedulePreview();
      }
      onDone();
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
      else if (e.key === 'Escape') { done = true; onDone(); }
    });
  }

  function addFloorToPlace(place) {
    pushUndo();
    place.floors.push({
      name: `Planta ${place.floors.length + 1}`,
      cells: seedFloorCells(),
      seats: new Set(),
      openings: new Map(),
      dividers: new Set(),
      background: null,
      backgroundOpacity: DEFAULT_BG_OPACITY,
    });
    state.activePlaceId = place.id;
    state.active = place.floors.length - 1;
    syncDirty();
    renderPlaces();
    renderGrid();
    renderBackgroundControls();
    schedulePreview();
  }

  function floorDropIndex(listEl, clientY) {
    const rows = [...listEl.querySelectorAll('.fe-floor')];
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return rows.length;
  }

  function clearFloorDropMarks() {
    listEl.querySelectorAll('.fe-floor-drop-before, .fe-floor-dragging').forEach((el) => {
      el.classList.remove('fe-floor-drop-before', 'fe-floor-dragging');
    });
  }

  function markFloorDropTarget(listEl, dropIndex) {
    clearFloorDropMarks();
    const rows = [...listEl.querySelectorAll('.fe-floor')];
    if (dropIndex < rows.length) rows[dropIndex].classList.add('fe-floor-drop-before');
  }

  function updateActiveAfterFloorReorder(from, to) {
    if (state.active === from) state.active = to;
    else if (from < state.active && to > state.active) state.active--;
    else if (from > state.active && to <= state.active) state.active++;
  }

  function endFloorDrag() {
    document.removeEventListener('pointermove', onFloorDragMove);
    document.removeEventListener('pointerup', onFloorDragEnd);
    document.removeEventListener('pointercancel', onFloorDragEnd);
  }

  function onFloorDragMove(e) {
    if (!floorDrag) return;
    const dropIndex = floorDropIndex(floorDrag.floorList, e.clientY);
    if (dropIndex !== floorDrag.dropIndex) {
      floorDrag.dropIndex = dropIndex;
      markFloorDropTarget(floorDrag.floorList, dropIndex);
    }
  }

  function onFloorDragEnd() {
    if (!floorDrag) return;
    const { place, from, dropIndex, row } = floorDrag;
    row.classList.remove('fe-floor-dragging');
    endFloorDrag();
    floorDrag = null;
    clearFloorDropMarks();
    const to = dropIndex;
    if (from === to) return;
    pushUndo();
    const [item] = place.floors.splice(from, 1);
    place.floors.splice(to, 0, item);
    if (place.id === state.activePlaceId) updateActiveAfterFloorReorder(from, to);
    // Reordering persists immediately so the floor order survives across
    // sessions without needing an explicit Save. commitToStore re-renders.
    if (!commitToStore()) {
      syncDirty();
      renderPlaces();
      renderGrid();
      schedulePreview();
    }
  }

  function bindFloorDrag(grab, row, place, index, floorList) {
    grab.disabled = place.floors.length <= 1;
    grab.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || grab.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      floorDrag = { place, from: index, row, floorList, dropIndex: index };
      row.classList.add('fe-floor-dragging');
      markFloorDropTarget(floorList, index);
      document.addEventListener('pointermove', onFloorDragMove);
      document.addEventListener('pointerup', onFloorDragEnd);
      document.addEventListener('pointercancel', onFloorDragEnd);
    });
    grab.addEventListener('click', (e) => e.stopPropagation());
  }

  function renderPlaces() {
    listEl.innerHTML = '';
    state.places.forEach((place, pi) => {
      const group = document.createElement('div');
      group.className = 'fe-place' + (place.id === state.activePlaceId ? ' on' : '');

      const header = document.createElement('div');
      header.className = 'fe-place-header';

      const placeName = document.createElement('span');
      placeName.className = 'fe-place-name';
      placeName.textContent = place.name;
      placeName.title = 'Doble clic per reanomenar el lloc';

      const placeMeta = document.createElement('span');
      placeMeta.className = 'fe-place-meta mono';
      placeMeta.textContent = `${place.floors.length} planta${place.floors.length === 1 ? '' : 'es'}`;

      const placeInfo = document.createElement('div');
      placeInfo.className = 'fe-place-info';
      placeInfo.append(placeName, placeMeta);

      const placeActions = document.createElement('div');
      placeActions.className = 'fe-place-actions';
      const addFloorBtn = document.createElement('button');
      addFloorBtn.className = 'fe-place-add-floor';
      addFloorBtn.textContent = '+';
      addFloorBtn.title = 'Afegeix una planta a aquest lloc';
      addFloorBtn.setAttribute('aria-label', 'Afegeix planta');
      const delPlaceBtn = document.createElement('button');
      delPlaceBtn.className = 'fe-place-del';
      delPlaceBtn.textContent = '✕';
      delPlaceBtn.title = 'Elimina el lloc';
      delPlaceBtn.setAttribute('aria-label', 'Elimina el lloc');
      delPlaceBtn.disabled = state.places.length <= 1;
      placeActions.append(addFloorBtn, delPlaceBtn);
      header.append(placeInfo, placeActions);

      header.addEventListener('click', () => {
        if (place.id === state.activePlaceId) return;
        state.activePlaceId = place.id;
        state.active = Math.min(state.active, place.floors.length - 1);
        renderPlaces();
        renderGrid();
        renderBackgroundControls();
        schedulePreview();
      });
      placeName.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        startRename(placeName, place, renderPlaces);
      });
      addFloorBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        addFloorToPlace(place);
      });
      delPlaceBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.places.length <= 1) return;
        if (!confirm(`Eliminar el lloc «${place.name}» i totes les seves plantes?`)) return;
        pushUndo();
        state.places.splice(pi, 1);
        if (state.activePlaceId === place.id) {
          state.activePlaceId = state.places[0].id;
          state.active = 0;
        }
        syncDirty();
        renderPlaces();
        renderGrid();
        renderBackgroundControls();
        schedulePreview();
      });

      const floorList = document.createElement('div');
      floorList.className = 'fe-floor-list';
      place.floors.forEach((f, i) => {
        const row = document.createElement('div');
        const isActive = place.id === state.activePlaceId && i === state.active;
        row.className = 'fe-floor' + (isActive ? ' on' : '');
        const grab = document.createElement('button');
        grab.type = 'button';
        grab.className = 'fe-floor-grab';
        grab.title = 'Arrossega per reordenar';
        grab.setAttribute('aria-label', 'Arrossega per reordenar');
        grab.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5" cy="4" r="1.25"/><circle cx="11" cy="4" r="1.25"/><circle cx="5" cy="8" r="1.25"/><circle cx="11" cy="8" r="1.25"/><circle cx="5" cy="12" r="1.25"/><circle cx="11" cy="12" r="1.25"/></svg>';
        const thumb = makeFloorThumb(f);
        const info = document.createElement('div');
        info.className = 'fe-floor-info';
        const name = document.createElement('span');
        name.className = 'fe-floor-name';
        name.textContent = f.name;
        name.title = 'Doble clic per reanomenar';
        const meta = document.createElement('span');
        meta.className = 'fe-floor-meta mono';
        meta.textContent = `${f.cells.size}▦ ${f.seats.size}▣ ${f.openings.size}▭ ${f.dividers.size}┊`;
        info.append(name, meta);
        const actions = document.createElement('div');
        actions.className = 'fe-floor-actions';
        const cloneBtn = document.createElement('button');
        cloneBtn.className = 'fe-floor-clone';
        cloneBtn.textContent = '⧉';
        cloneBtn.title = 'Clona la planta';
        cloneBtn.setAttribute('aria-label', 'Clona la planta');
        const del = document.createElement('button');
        del.className = 'fe-floor-del';
        del.textContent = '✕';
        del.title = 'Elimina la planta';
        del.setAttribute('aria-label', 'Elimina la planta');
        del.disabled = place.floors.length <= 1;
        actions.append(cloneBtn, del);
        row.append(grab, thumb, info, actions);
        bindFloorDrag(grab, row, place, i, floorList);
        row.addEventListener('click', () => {
          if (isActive) return;
          state.activePlaceId = place.id;
          state.active = i;
          renderPlaces();
          renderGrid();
          renderBackgroundControls();
          schedulePreview();
        });
        name.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          startRename(name, f, renderPlaces);
        });
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          if (place.floors.length <= 1) return;
          if (!confirm(`Eliminar la planta «${f.name}»?`)) return;
          pushUndo();
          place.floors.splice(i, 1);
          if (place.id === state.activePlaceId && state.active >= place.floors.length) {
            state.active = place.floors.length - 1;
          }
          syncDirty();
          renderPlaces();
          renderGrid();
          renderBackgroundControls();
          schedulePreview();
        });
        cloneBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          pushUndo();
          const copy = cloneFloor(f);
          copy.name = duplicateFloorName(f.name, place.floors);
          place.floors.splice(i + 1, 0, copy);
          state.activePlaceId = place.id;
          state.active = i + 1;
          syncDirty();
          renderPlaces();
          renderGrid();
          renderBackgroundControls();
          schedulePreview();
        });
        floorList.appendChild(row);
      });

      group.append(header, floorList);
      listEl.appendChild(group);
    });
  }

  container.querySelector('.fe-add-place').addEventListener('click', () => {
    pushUndo();
    const names = new Set(state.places.map((p) => p.name));
    let n = state.places.length + 1;
    let placeName = `Lloc ${n}`;
    while (names.has(placeName)) { n++; placeName = `Lloc ${n}`; }
    const id = makePlaceId();
    state.places.push({
      id,
      name: placeName,
      floors: [{
        name: 'Planta 1',
        cells: seedFloorCells(),
        seats: new Set(),
        openings: new Map(),
        dividers: new Set(),
        background: null,
        backgroundOpacity: DEFAULT_BG_OPACITY,
      }],
    });
    state.activePlaceId = id;
    state.active = 0;
    syncDirty();
    renderPlaces();
    renderGrid();
    renderBackgroundControls();
    schedulePreview();
  });

  /* ── painting ── */
  function rectCellKeys(c0, r0, c1, r1) {
    const minC = Math.min(c0, c1), maxC = Math.max(c0, c1);
    const minR = Math.min(r0, r1), maxR = Math.max(r0, r1);
    const keys = [];
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) keys.push(key(c, r));
    }
    return keys;
  }

  function clearCellRectPreview() {
    cellEls.forEach((el) => el.classList.remove('fe-cell-rect-preview'));
    delete gridEl.dataset.rectMode;
  }

  function updateCellRectPreview(start, end) {
    clearCellRectPreview();
    gridEl.dataset.rectMode = 'add';
    rectCellKeys(start[0], start[1], end[0], end[1]).forEach((k) => {
      cellEls.get(k)?.classList.add('fe-cell-rect-preview');
    });
  }

  function applyCellRect(start, end) {
    const f = curFloor();
    let changed = false;
    for (const k of rectCellKeys(start[0], start[1], end[0], end[1])) {
      if (!f.cells.has(k)) { f.cells.add(k); changed = true; }
    }
    if (!changed) return;
    f.openings = openingsToMap(sanitizeOpenings(openingsToArray(f.openings), f.cells));
    renderGrid();
    syncDirty();
    schedulePreview();
  }

  function applyTool(k) {
    const f = curFloor();
    let changed = false;
    let cellsChanged = false;
    if (state.tool === 'cell') {
      if (!f.cells.has(k)) { f.cells.add(k); changed = true; cellsChanged = true; }
    } else if (state.tool === 'seat') {
      if (state.paint?.touched?.has(k) || !f.cells.has(k)) return;
      state.paint.touched.add(k);
      if (f.seats.has(k)) f.seats.delete(k);
      else f.seats.add(k);
      changed = true;
    } else { // erase (cell/seat part; edge erase handled in pointerdown)
      if (state.paint?.touched?.has(k)) return;
      if (f.seats.has(k)) {
        f.seats.delete(k);
        state.paint?.touched?.add(k);
        changed = true;
      } else if (f.cells.has(k)) {
        f.cells.delete(k);
        state.paint?.touched?.add(k);
        changed = true;
        cellsChanged = true;
      }
    }
    if (cellsChanged) {
      const kept = sanitizeOpenings(openingsToArray(f.openings), f.cells);
      f.openings = openingsToMap(kept);
      const keptDiv = sanitizeDividers(dividersToArray(f.dividers), f.cells);
      f.dividers = dividersToSet(keptDiv);
      // Only this cell and its 4 orthogonal neighbours can change exterior
      // edges, so repaint just those rather than the whole grid.
      const [cc, rr] = parseKey(k);
      [[cc, rr], [cc, rr - 1], [cc, rr + 1], [cc - 1, rr], [cc + 1, rr]]
        .forEach(([nc, nr]) => paintCellEl(key(nc, nr)));
    }
    if (changed) {
      if (!cellsChanged) paintCellEl(k);
      syncDirty();
      schedulePreview();
    }
  }
  function applyEdgeTool(cellEl, edgeEl) {
    if (!EDGE_TOOLS.includes(state.tool)) return false;
    const c = Number(cellEl.dataset.c), r = Number(cellEl.dataset.r);
    const edge = edgeEl.dataset.edge;
    const f = curFloor();

    // Interior edges: divider tool places/removes; erase removes.
    if (edgeEl.classList.contains('interior') && (state.tool === 'divider' || state.tool === 'erase')) {
      const canon = canonicalDivider(c, r, edge);
      const dk = `${canon.c},${canon.r},${canon.edge}`;
      const has = f.dividers.has(dk);
      const willChange = state.tool === 'erase' ? has : true; // divider toggles, so it always changes
      if (!willChange) return false;
      pushUndo();
      if (has) f.dividers.delete(dk);
      else f.dividers.add(dk);
      // repaint both adjacent cells so the line updates from either side
      paintCellEl(`${c},${r}`);
      const nb = { N: [c, r - 1], S: [c, r + 1], E: [c + 1, r], O: [c - 1, r] }[edge];
      if (nb) paintCellEl(`${nb[0]},${nb[1]}`);
      syncDirty();
      schedulePreview();
      return true;
    }

    if (!edgeEl.classList.contains('exterior')) return false;
    if (state.tool === 'divider') return false; // divider only acts on interior edges
    const k = `${c},${r},${edge}`;
    const cur = f.openings.get(k);
    const willChange = state.tool === 'erase' ? !!cur : cur !== state.tool;
    if (!willChange) return false;
    pushUndo();
    if (state.tool === 'erase') {
      f.openings.delete(k);
    } else {
      f.openings.set(k, state.tool);
    }
    paintCellEl(`${c},${r}`);
    syncDirty();
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
    if (state.tool === 'door' || state.tool === 'window' || state.tool === 'divider') return; // these tools only act on edges
    if (state.tool === 'cell') {
      pushUndo();
      const [c, r] = parseKey(k);
      state.paint = { tool: 'cell', start: [c, r], end: [c, r] };
      gridEl.setPointerCapture(e.pointerId);
      updateCellRectPreview(state.paint.start, state.paint.end);
      return;
    }
    if (state.tool === 'seat') {
      pushUndo();
      state.paint = { tool: 'seat', touched: new Set() };
      gridEl.setPointerCapture(e.pointerId);
      applyTool(k);
      return;
    }
    pushUndo();
    state.paint = { tool: 'erase', touched: new Set() };
    gridEl.setPointerCapture(e.pointerId);
    applyTool(k);
  });
  gridEl.addEventListener('pointermove', (e) => {
    if (!state.paint) return;
    if (state.paint.tool === 'cell') {
      const k = cellFromEvent(e);
      if (!k) return;
      state.paint.end = parseKey(k);
      updateCellRectPreview(state.paint.start, state.paint.end);
      return;
    }
    if (state.paint.tool === 'seat') {
      const k = cellFromEvent(e);
      if (k) applyTool(k);
      return;
    }
    const k = cellFromEvent(e);
    if (k) applyTool(k);
  });
  const endPaint = () => {
    if (state.paint?.tool === 'cell') {
      applyCellRect(state.paint.start, state.paint.end);
      clearCellRectPreview();
    }
    state.paint = null;
  };
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
      pushUndo();
      const map = btn.dataset.rot === 'right' ? ROT_CW : ROT_CCW;
      state.previewDir = map[state.previewDir];
      syncDirty();
      schedulePreview();
    });
  });

  bgPickerEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.fe-bg-option');
    if (!btn) return;
    const next = btn.dataset.bg || null;
    const f = curFloor();
    if ((f.background || null) === next) return;
    pushUndo();
    f.background = next;
    syncDirty();
    renderBackgroundControls();
    renderPlaces();
    schedulePreview();
  });

  bgOpacityRange.addEventListener('input', () => {
    const f = curFloor();
    const pct = Number(bgOpacityRange.value);
    bgOpacityVal.textContent = `${pct}%`;
    if (!f.background) return;
    f.backgroundOpacity = pct / 100;
    schedulePreview();
  });
  bgOpacityRange.addEventListener('change', () => {
    if (!curFloor().background) return;
    pushUndo();
    syncDirty();
    renderPlaces();
  });

  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);

  /* ── dirty + messages ── */
  let msgTimer = null;
  function showMsg(text, kind) {
    msgEl.textContent = text;
    msgEl.className = `fe-msg ${kind}`;
    msgEl.hidden = false;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { msgEl.hidden = true; }, 3200);
  }
  function syncDirty() {
    state.dirty = layoutSignature() !== savedSignature;
    resetBtn.disabled = !state.dirty;
    saveBtn.disabled = !state.dirty;
  }
  function setSavedBaseline() {
    savedSignature = layoutSignature();
    savedSnapshot = captureSnapshot();
    syncDirty();
  }

  /* ── save / reset ── */

  // Persist the current places to localStorage and refresh dependent views.
  // Returns true on success; on failure shows a message and leaves state dirty.
  function commitToStore() {
    try {
      const saved = saveCustomRoom(
        state.places.map((p) => ({ id: p.id, name: p.name, floors: p.floors.map(toArrayFloor) })),
        state.previewDir,
        state.activePlaceId,
      );
      state.places = saved.places.map((p) => ({
        id: p.id,
        name: p.name,
        floors: p.floors.map(toSetFloor),
      }));
      state.activePlaceId = saved.activePlaceId;
      state.active = Math.min(state.active, curFloors().length - 1);
      setSavedBaseline();
      renderPlaces(); renderGrid(); renderBackgroundControls(); schedulePreview();
      globalThis.refreshFloors?.();
      devConsole.action('floor:save', String(state.places.length), state.previewDir);
      return true;
    } catch {
      showMsg('No s\'ha pogut desar: cada planta necessita almenys una cel·la.', 'error');
      return false;
    }
  }

  container.querySelector('.fe-save').addEventListener('click', () => {
    commitToStore();
  });
  container.querySelector('.fe-reset').addEventListener('click', () => {
    if (!state.dirty || !savedSnapshot) return;
    if (!confirm('Descartar els canvis no desats i tornar a l\'última versió guardada?')) return;
    devConsole.action('floor:reset');
    undoStack.length = 0;
    redoStack.length = 0;
    restoring = true;
    restoreSnapshot(savedSnapshot);
    restoring = false;
    updateHistoryButtons();
    globalThis.refreshFloors?.();
  });

  /* ── initial paint ── */
  setSavedBaseline();
  updateHistoryButtons();
  renderPlaces();
  renderGrid();
  renderBackgroundControls();
  renderPreview();
}
