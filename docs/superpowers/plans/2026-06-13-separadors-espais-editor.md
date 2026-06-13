# Separadors d'espais a l'editor de sales — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permetre col·locar separadors visuals (parets interiors) que divideixen una sala en zones a l'editor de sales, reaprofitant el patró de portes/finestres però sobre arestes interiors.

**Architecture:** Un separador és `{ c, r, edge }` desat en una llista `dividers` pròpia per planta (separada d'`openings`), canonicalitzada a arestes E/S perquè cada paret tingui un sol registre. Helpers purs nous a `wall-edges.js`; persistència estesa a `floor-store.js`; eina nova i pintat a `floor-editor.js`; mur baix teal a la vista isomètrica de `building-render.js`.

**Tech Stack:** JavaScript ES modules, `node:test` per als tests, SVG per al render isomètric, CSS dins `index.html`.

---

## File Structure

- `src/data/wall-edges.js` — **modificar**: afegir `interiorEdges`, `canonicalDivider`, `sanitizeDividers`.
- `src/data/floor-store.js` — **modificar**: persistir/sanititzar `dividers` dins el format v2.
- `src/floor-editor.js` — **modificar**: model intern, eina «Separador», pintat d'arestes interiors, flux cap a preview/thumbnails/desat.
- `src/building-render.js` — **modificar**: dibuixar el mur baix dels dividers dins el bucle de cel·les.
- `index.html` — **modificar**: botó de toolbar, CSS de `.fe-edge.divider` i d'arestes interiors interactives.
- `test/floor-store.test.js` — **modificar**: tests de `sanitizeDividers` i persistència.
- `test/wall-edges.test.js` — **crear** si no existeix: tests unitaris dels helpers purs.

---

## Task 1: Helper `interiorEdges` (arestes interiors d'una cel·la)

**Files:**
- Modify: `src/data/wall-edges.js`
- Test: `test/wall-edges.test.js` (crear)

- [ ] **Step 1: Write the failing test**

Crear `test/wall-edges.test.js`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { interiorEdges } from '../src/data/wall-edges.js';

test('interiorEdges returns edges whose neighbour IS a floor cell', () => {
  // Cells: (0,0) and (1,0). For (0,0), only E is interior (neighbour (1,0) exists).
  const cellset = new Set(['0,0', '1,0']);
  assert.deepEqual(interiorEdges(0, 0, cellset).sort(), ['E']);
  assert.deepEqual(interiorEdges(1, 0, cellset).sort(), ['O']);
});

test('interiorEdges returns empty for an isolated cell', () => {
  assert.deepEqual(interiorEdges(0, 0, new Set(['0,0'])), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/wall-edges.test.js`
Expected: FAIL amb "interiorEdges is not a function" (o export no trobat).

- [ ] **Step 3: Write minimal implementation**

A `src/data/wall-edges.js`, després de la funció `exteriorEdges` (línia ~34), afegir:

```js
/**
 * @param {number} c
 * @param {number} r
 * @param {Set<string>} cellset  keys "c,r"
 * @returns {string[]} interior edges of this cell (neighbour in that direction is a floor cell)
 */
export function interiorEdges(c, r, cellset) {
  return EDGES.filter((e) => {
    const [nc, nr] = NEIGHBOR[e](c, r);
    return cellset.has(k(nc, nr));
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/wall-edges.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/wall-edges.js test/wall-edges.test.js
git commit -m "Add interiorEdges helper for floor cells"
```

---

## Task 2: Helper `canonicalDivider` (normalització a E/S)

**Files:**
- Modify: `src/data/wall-edges.js`
- Test: `test/wall-edges.test.js`

La paret entre dues cel·les es pot anomenar des de qualsevol de les dues. La forma canònica
usa sempre l'aresta `E` (paret vertical) o `S` (paret horitzontal) de la cel·la d'origen:
una aresta `O` es reescriu com l'`E` del veí de l'esquerra, i una `N` com la `S` del veí de dalt.

- [ ] **Step 1: Write the failing test**

Afegir a `test/wall-edges.test.js`:

```js
import { canonicalDivider } from '../src/data/wall-edges.js';

test('canonicalDivider keeps E and S as-is', () => {
  assert.deepEqual(canonicalDivider(2, 3, 'E'), { c: 2, r: 3, edge: 'E' });
  assert.deepEqual(canonicalDivider(2, 3, 'S'), { c: 2, r: 3, edge: 'S' });
});

test('canonicalDivider rewrites O to the E of the left neighbour', () => {
  // (2,3) O is the same wall as (1,3) E
  assert.deepEqual(canonicalDivider(2, 3, 'O'), { c: 1, r: 3, edge: 'E' });
});

test('canonicalDivider rewrites N to the S of the upper neighbour', () => {
  // (2,3) N is the same wall as (2,2) S
  assert.deepEqual(canonicalDivider(2, 3, 'N'), { c: 2, r: 2, edge: 'S' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/wall-edges.test.js`
Expected: FAIL amb "canonicalDivider is not a function".

- [ ] **Step 3: Write minimal implementation**

A `src/data/wall-edges.js`, afegir després d'`interiorEdges`:

```js
/**
 * Normalize an interior edge to the canonical (E or S) form of the wall it
 * represents, so a wall named from either adjacent cell maps to one record.
 * @param {number} c
 * @param {number} r
 * @param {string} edge  one of N/S/E/O
 * @returns {{ c: number, r: number, edge: string }}
 */
export function canonicalDivider(c, r, edge) {
  if (edge === 'E' || edge === 'S') return { c, r, edge };
  const [nc, nr] = NEIGHBOR[edge](c, r);
  // O -> left neighbour's E ; N -> upper neighbour's S
  return { c: nc, r: nr, edge: edge === 'O' ? 'E' : 'S' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/wall-edges.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/wall-edges.js test/wall-edges.test.js
git commit -m "Add canonicalDivider for E/S wall normalization"
```

---

## Task 3: Helper `sanitizeDividers`

**Files:**
- Modify: `src/data/wall-edges.js`
- Test: `test/wall-edges.test.js`

Valida cada divider: ha d'estar sobre una cel·la existent, ser una aresta interior, i es
canonicalitza i dedup per `(c,r,edge)` canònic. Les arestes exteriors es descarten.

- [ ] **Step 1: Write the failing test**

Afegir a `test/wall-edges.test.js`:

```js
import { sanitizeDividers } from '../src/data/wall-edges.js';

test('sanitizeDividers keeps interior edges, canonicalized and deduped', () => {
  const cellset = new Set(['0,0', '1,0']);
  const out = sanitizeDividers([
    { c: 0, r: 0, edge: 'E' },   // interior, canonical
    { c: 1, r: 0, edge: 'O' },   // same wall named from the other cell -> dedup
  ], cellset);
  assert.deepEqual(out, [{ c: 0, r: 0, edge: 'E' }]);
});

test('sanitizeDividers drops exterior edges and unknown cells', () => {
  const cellset = new Set(['0,0', '1,0']);
  const out = sanitizeDividers([
    { c: 0, r: 0, edge: 'N' },   // exterior (no neighbour above) -> drop
    { c: 9, r: 9, edge: 'E' },   // cell does not exist -> drop
    { c: 0, r: 0, edge: 'x' },   // invalid edge -> drop
  ], cellset);
  assert.deepEqual(out, []);
});

test('sanitizeDividers returns [] for non-array input', () => {
  assert.deepEqual(sanitizeDividers(undefined, new Set(['0,0'])), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/wall-edges.test.js`
Expected: FAIL amb "sanitizeDividers is not a function".

- [ ] **Step 3: Write minimal implementation**

A `src/data/wall-edges.js`, afegir al final del fitxer:

```js
/**
 * Keep only dividers on existing cells whose edge is interior, canonicalized to
 * E/S and deduped per canonical (c,r,edge).
 * @param {unknown} dividers
 * @param {Set<string>} cellset
 * @returns {Array<{ c: number, r: number, edge: string }>}
 */
export function sanitizeDividers(dividers, cellset) {
  if (!Array.isArray(dividers)) return [];
  const seen = new Set();
  const out = [];
  for (const d of dividers) {
    if (!d || typeof d !== 'object') continue;
    const { c, r, edge } = d;
    if (!Number.isInteger(c) || !Number.isInteger(r)) continue;
    if (!EDGES.includes(edge)) continue;
    if (!cellset.has(k(c, r))) continue;
    const [nc, nr] = NEIGHBOR[edge](c, r);
    if (!cellset.has(k(nc, nr))) continue; // not an interior edge
    const canon = canonicalDivider(c, r, edge);
    // both cells of a canonical wall must exist (origin already checked above;
    // the neighbour relationship guarantees the other side for E/S too)
    if (!cellset.has(k(canon.c, canon.r))) continue;
    const dedupe = `${canon.c},${canon.r},${canon.edge}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push(canon);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/wall-edges.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/wall-edges.js test/wall-edges.test.js
git commit -m "Add sanitizeDividers with canonicalization and dedup"
```

---

## Task 4: Persistir `dividers` a `floor-store.js`

**Files:**
- Modify: `src/data/floor-store.js`
- Test: `test/floor-store.test.js`

- [ ] **Step 1: Write the failing test**

Afegir a `test/floor-store.test.js`:

```js
test('sanitizeFloors keeps valid dividers, canonicalized and deduped', () => {
  const floors = sanitizeFloors([
    {
      name: 'Room',
      cells: [[0, 0], [1, 0]],
      seats: [],
      openings: [],
      dividers: [
        { c: 0, r: 0, edge: 'E' },
        { c: 1, r: 0, edge: 'O' }, // same wall -> dedup
        { c: 0, r: 0, edge: 'N' }, // exterior -> drop
      ],
    },
  ]);
  assert.deepEqual(floors[0].dividers, [{ c: 0, r: 0, edge: 'E' }]);
});

test('sanitizeFloors defaults missing dividers to an empty array', () => {
  const floors = sanitizeFloors([{ name: 'Room', cells: [[0, 0]], seats: [] }]);
  assert.deepEqual(floors[0].dividers, []);
});

test('saveCustomFloors persists dividers under v2', () => {
  saveCustomFloors([
    { name: 'R', cells: [[0, 0], [1, 0]], seats: [], openings: [], dividers: [{ c: 0, r: 0, edge: 'E' }] },
  ], 0);
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
  assert.equal(stored.v, 2);
  assert.deepEqual(stored.floors[0].dividers, [{ c: 0, r: 0, edge: 'E' }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/floor-store.test.js`
Expected: FAIL — `floors[0].dividers` és `undefined`.

- [ ] **Step 3: Write minimal implementation**

A `src/data/floor-store.js`:

1. Estendre l'import (línia 9):

```js
import { sanitizeOpenings, sanitizeDividers } from './wall-edges.js';
```

2. Dins `sanitizeFloors`, just després de calcular `openings` (línia ~54), afegir:

```js
    const dividers = sanitizeDividers(f.dividers, cellset);
    floors.push({ name, cells, seats, openings, dividers });
```

   Substituint el `floors.push({ name, cells, seats, openings });` existent.

3. Actualitzar el comentari de capçalera (línia 4) per esmentar `dividers` al costat d'`openings`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/floor-store.test.js`
Expected: PASS (tots, inclosos els d'openings anteriors).

- [ ] **Step 5: Commit**

```bash
git add src/data/floor-store.js test/floor-store.test.js
git commit -m "Persist dividers per floor under v2 layout"
```

---

## Task 5: Model intern de dividers a `floor-editor.js`

**Files:**
- Modify: `src/floor-editor.js`

Afegir helpers Set/Array per a `dividers` paral·lels als d'`openings`, i incloure'ls als
convertidors de planta. Un divider canònic s'identifica per la clau `"c,r,edge"`.

- [ ] **Step 1: Afegir helpers de conversió i import**

A `src/floor-editor.js`:

1. Estendre l'import (línia 4):

```js
import { exteriorEdges, interiorEdges, canonicalDivider, sanitizeOpenings, sanitizeDividers } from './data/wall-edges.js';
```

2. Després de `openingsToArray` (línia ~22), afegir:

```js
const dividersToSet = (arr) => new Set((arr || []).map((d) => `${d.c},${d.r},${d.edge}`));
const dividersToArray = (set) => [...set].map((kk) => {
  const [c, r, edge] = kk.split(',');
  return { c: Number(c), r: Number(r), edge };
});
```

3. Dins `toSetFloor` (línia ~24), afegir al return:

```js
    dividers: dividersToSet(f.dividers),
```

4. Dins `toArrayFloor` (línia ~32), afegir:

```js
    dividers: dividersToArray(f.dividers),
```

   (afegint `dividers` a l'objecte retornat, al costat de `openings`).

- [ ] **Step 2: Verificar que el mòdul carrega sense errors**

Run: `node -e "import('./src/floor-editor.js').catch(e => { if (String(e).includes('PanoramaWorkspace')) process.exit(0); console.error(e); process.exit(1); })"`
Expected: surt net (codi 0). El mòdul referencia `PanoramaWorkspace`/`document` globals; només validem que el parsing i els imports són correctes.

- [ ] **Step 3: Commit**

```bash
git add src/floor-editor.js
git commit -m "Add divider set/array model helpers in floor editor"
```

---

## Task 6: Eina «Separador» — toolbar i CSS

**Files:**
- Modify: `src/floor-editor.js`
- Modify: `index.html`

- [ ] **Step 1: Afegir el botó al toolbar**

A `src/floor-editor.js`, dins el bloc `.fe-tools` (després del botó `window`, línia ~72), afegir:

```html
              <button data-tool="divider" title="Col·loca o treu separadors a les arestes interiors">┊ Separador</button>
```

- [ ] **Step 2: Afegir 'divider' a EDGE_TOOLS**

A `src/floor-editor.js` línia 14:

```js
const EDGE_TOOLS = ['door', 'window', 'divider', 'erase'];
```

- [ ] **Step 3: Afegir el tipus a l'estat i comentari**

A `src/floor-editor.js` línia ~57, actualitzar el comentari del camp `tool`:

```js
    tool: 'cell',          // 'cell' | 'seat' | 'door' | 'window' | 'divider' | 'erase'
```

- [ ] **Step 4: Afegir CSS de l'aresta interior interactiva i del separador col·locat**

A `index.html`, després del bloc `.fe-edge.window` (línia ~2423), afegir:

```css
    .fe-grid[data-tool="divider"] .fe-edge.interior {
      pointer-events: auto;
      background: rgba(47, 158, 143, .25);
      cursor: pointer
    }

    .fe-grid[data-tool="divider"] .fe-edge.interior:hover {
      background: rgba(47, 158, 143, .6)
    }

    /* Placed dividers are always shown, regardless of the active tool. */
    .fe-edge.divider {
      background: rgba(47, 158, 143, .85) !important;
      pointer-events: auto
    }
```

   I afegir el selector `divider` a la regla d'arestes interactives de l'eina erase (línia ~2403), perquè erase també pugui treure separadors sobre arestes interiors:

```css
    .fe-grid[data-tool="erase"] .fe-edge.interior {
      pointer-events: auto;
      background: rgba(47, 158, 143, .25);
      cursor: pointer
    }
```

- [ ] **Step 5: Commit**

```bash
git add src/floor-editor.js index.html
git commit -m "Add divider tool button and edge CSS"
```

---

## Task 7: Pintar arestes interiors i dividers col·locats a la graella

**Files:**
- Modify: `src/floor-editor.js`

Estendre `paintCellEl` perquè, a més de les arestes exteriors (porta/finestra), marqui les
**interiors** i hi mostri els separadors col·locats. Cada aresta interior es marca `.interior`;
si el seu divider canònic és al set de la planta, també `.divider`.

- [ ] **Step 1: Estendre `paintCellEl`**

A `src/floor-editor.js`, dins `paintCellEl` (línia ~128), substituir el cos del `forEach` sobre `.fe-edge` per:

```js
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
```

   Nota: `f.openings` és un `Map`; `f.dividers` és un `Set` (de claus canòniques). El divider
   d'una paret es pinta des de les DUES cel·les adjacents (la canònica i la veïna), de manera
   que la línia teal és visible sigui quina sigui la cel·la sobre la qual s'ha repintat.

- [ ] **Step 2: Verificar parsing del mòdul**

Run: `node -e "import('./src/floor-editor.js').catch(e => { if (String(e).includes('PanoramaWorkspace')) process.exit(0); console.error(e); process.exit(1); })"`
Expected: codi 0.

- [ ] **Step 3: Commit**

```bash
git add src/floor-editor.js
git commit -m "Paint interior edges and placed dividers in grid"
```

---

## Task 8: Col·locar/treure separadors amb l'eina

**Files:**
- Modify: `src/floor-editor.js`

Estendre `applyEdgeTool` perquè, quan l'eina és `divider` (o `erase` sobre aresta interior),
afegeixi/tregui el divider canònic. Estendre `pointerdown` perquè `divider` (com door/window)
només actuï sobre arestes i no caigui al pintat de cel·les.

- [ ] **Step 1: Estendre `applyEdgeTool`**

A `src/floor-editor.js`, substituir tot el cos de `applyEdgeTool` (línia ~293) per:

```js
  function applyEdgeTool(cellEl, edgeEl) {
    if (!EDGE_TOOLS.includes(state.tool)) return false;
    const c = Number(cellEl.dataset.c), r = Number(cellEl.dataset.r);
    const edge = edgeEl.dataset.edge;
    const f = state.floors[state.active];

    if (edgeEl.classList.contains('interior') && (state.tool === 'divider' || state.tool === 'erase')) {
      const canon = canonicalDivider(c, r, edge);
      const dk = `${canon.c},${canon.r},${canon.edge}`;
      if (state.tool === 'erase') {
        if (!f.dividers.has(dk)) return false;
        f.dividers.delete(dk);
      } else if (f.dividers.has(dk)) {
        f.dividers.delete(dk);
      } else {
        f.dividers.add(dk);
      }
      // repaint both adjacent cells so the line updates from either side
      paintCellEl(`${c},${r}`);
      const [nc, nr] = { N: [c, r - 1], S: [c, r + 1], E: [c + 1, r], O: [c - 1, r] }[edge];
      paintCellEl(`${nc},${nr}`);
      markDirty();
      schedulePreview();
      return true;
    }

    if (!edgeEl.classList.contains('exterior')) return false;
    const k = `${c},${r},${edge}`;
    const cur = f.openings.get(k);
    if (state.tool === 'erase') {
      if (!cur) return false;
      f.openings.delete(k);
    } else if (state.tool === 'divider') {
      return false; // divider on a non-interior edge: nothing to do
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
```

- [ ] **Step 2: Estendre el `pointerdown` perquè divider només actuï sobre arestes**

A `src/floor-editor.js`, línia ~329, substituir:

```js
    if (state.tool === 'door' || state.tool === 'window') return; // these tools only act on edges
```

   per:

```js
    if (state.tool === 'door' || state.tool === 'window' || state.tool === 'divider') return; // these tools only act on edges
```

- [ ] **Step 3: Assegurar que esborrar una cel·la neteja els seus dividers**

A `src/floor-editor.js`, dins `applyTool`, al bloc `if (cellsChanged)` (línia ~278), després de recalcular openings afegir el recàlcul de dividers:

```js
    if (cellsChanged) {
      const kept = sanitizeOpenings(openingsToArray(f.openings), f.cells);
      f.openings = openingsToMap(kept);
      const keptDiv = sanitizeDividers(dividersToArray(f.dividers), f.cells);
      f.dividers = dividersToSet(keptDiv);
```

   (mantenint la resta del bloc — el repintat dels veïns — igual). `openingsToMap` ja existeix;
   `dividersToSet`/`dividersToArray` són de la Task 5.

- [ ] **Step 4: Verificar parsing**

Run: `node -e "import('./src/floor-editor.js').catch(e => { if (String(e).includes('PanoramaWorkspace')) process.exit(0); console.error(e); process.exit(1); })"`
Expected: codi 0.

- [ ] **Step 5: Commit**

```bash
git add src/floor-editor.js
git commit -m "Place and erase dividers via the divider tool"
```

---

## Task 9: Comptador de separadors a la fila de planta

**Files:**
- Modify: `src/floor-editor.js`

- [ ] **Step 1: Afegir el comptador al meta**

A `src/floor-editor.js`, línia ~201, substituir:

```js
      meta.textContent = `${f.cells.size}▦ ${f.seats.size}▣ ${f.openings.size}▭`;
```

   per:

```js
      meta.textContent = `${f.cells.size}▦ ${f.seats.size}▣ ${f.openings.size}▭ ${f.dividers.size}┊`;
```

- [ ] **Step 2: Verificar parsing**

Run: `node -e "import('./src/floor-editor.js').catch(e => { if (String(e).includes('PanoramaWorkspace')) process.exit(0); console.error(e); process.exit(1); })"`
Expected: codi 0.

- [ ] **Step 3: Commit**

```bash
git add src/floor-editor.js
git commit -m "Show divider count in floor list meta"
```

---

## Task 10: Passar dividers cap a la previsualització i thumbnails

**Files:**
- Modify: `src/floor-editor.js`

`renderPreview`, `makeFloorThumb` i el nou flux `add` de planta han d'incloure `dividers` a
l'objecte `decorated` perquè `buildBuildingSVG` (Task 11) els pugui dibuixar.

- [ ] **Step 1: Incloure dividers a `renderPreview`**

A `src/floor-editor.js`, dins `renderPreview` (línia ~153), afegir `dividers` al return del map:

```js
      return {
        name: arr.name,
        cells: arr.cells,
        cellset: new Set(f.cells),
        assigned: arr.seats.map(([c, r]) => ({ c, r })),
        openings: arr.openings,
        dividers: arr.dividers,
      };
```

- [ ] **Step 2: Incloure dividers a `makeFloorThumb`**

A `src/floor-editor.js`, dins `makeFloorThumb` (línia ~174), afegir al `decorated`:

```js
      openings: arr.openings,
      dividers: arr.dividers,
```

- [ ] **Step 3: Inicialitzar dividers en afegir planta**

A `src/floor-editor.js`, dins el handler de `.fe-add` (línia ~253), substituir:

```js
    state.floors.push({ name: `Planta ${state.floors.length + 1}`, cells, seats: new Set(), openings: new Map() });
```

   per:

```js
    state.floors.push({ name: `Planta ${state.floors.length + 1}`, cells, seats: new Set(), openings: new Map(), dividers: new Set() });
```

- [ ] **Step 4: Verificar parsing**

Run: `node -e "import('./src/floor-editor.js').catch(e => { if (String(e).includes('PanoramaWorkspace')) process.exit(0); console.error(e); process.exit(1); })"`
Expected: codi 0.

- [ ] **Step 5: Commit**

```bash
git add src/floor-editor.js
git commit -m "Feed dividers into preview and thumbnails"
```

---

## Task 11: Dibuixar el mur baix dels dividers a la vista isomètrica

**Files:**
- Modify: `src/building-render.js`

Per a cada cel·la del bucle (ja ordenat per profunditat), dibuixar un mur baix teal per a
cada un dels seus dividers. La cel·la s'ha de fixar en les arestes que toquen al divider en
qualsevol de les dues cel·les adjacents (la canònica i la veïna), per dibuixar el mur sobre
la vora compartida del diamant. El quad s'emet dins `fGround` (la mateixa capa per-cel·la ja
ordenada) perquè la cel·la frontal n'oculti el peu de forma natural.

**Geometria de les vores del diamant** (centre `(x0,y)`, `TW=34`, `TH=17`):
- Vèrtex top `(x0, y-TH)`, right `(x0+TW, y)`, bottom `(x0, y+TH)`, left `(x0-TW, y)`.
- Aresta **E** (cap a `c+1`): vora top→right, de `(x0,y-TH)` a `(x0+TW,y)`.
- Aresta **S** (cap a `r+1`): vora right→bottom? No: la projecció depèn de `dir`. Per simplicitat
  i correcció, es deriva la posició de l'aresta a partir del **punt mig entre el centre de la
  cel·la i el centre del veí**, projectats amb `getPos`, i la línia del terra perpendicular.

Per robustesa amb les 4 direccions de càmera, es calcula la vora compartida a partir de les
posicions de pantalla dels dos centres de cel·la adjacents.

- [ ] **Step 1: Construir el mapa de dividers per cel·la i la funció de mur baix**

A `src/building-render.js`, dins el `floors.forEach` (després de construir `openingAt`, línia ~145), afegir:

```js
    // Dividers are canonical (E/S). Index by the two cells they border so we can
    // draw the low wall while drawing either cell.
    const dividerEdges = []; // { c, r, edge } canonical
    (f.dividers || []).forEach((d) => dividerEdges.push(d));
```

   I, just abans del `f.cells.forEach` que dibuixa el terra (línia ~181), definir l'alçada del mur baix:

```js
    const DIV_H = 14; // low wall height in screen px (well below WALL_H)
```

- [ ] **Step 2: Implementar el dibuix del mur sobre la vora compartida**

Dins el `f.cells.forEach(([c, r]) => { ... })`, **just després** de la línia que afegeix la cel·la
a `fGround` (`fGround += `<g class="iso-cell">${cellG}</g>`;`, línia ~224), afegir:

```js
      // Low interior dividers anchored to this cell (canonical E/S) and also
      // those whose canonical cell is our N/O neighbour (so the wall is drawn
      // by whichever of the two cells is rendered — order already by depth).
      const cellDividers = dividerEdges.filter((d) => {
        if (d.c === c && d.r === r) return true;            // E or S from here
        if (d.edge === 'E' && d.c === c - 1 && d.r === r) return true; // our O side
        if (d.edge === 'S' && d.c === c && d.r === r - 1) return true; // our N side
        return false;
      });
      cellDividers.forEach((d) => {
        // neighbour cell coords of the canonical wall
        const [n2c, n2r] = d.edge === 'E' ? [d.c + 1, d.r] : [d.c, d.r + 1];
        // the wall sits between cell (d.c,d.r) and (n2c,n2r): use their two
        // shared diamond vertices. Compute both cell centres in screen space.
        const [ax, ay0] = getPos(d.c, d.r); const ax0 = ax + xShift; const ay = ay0 + yOff;
        const [bx, by0] = getPos(n2c, n2r); const bx0 = bx + xShift; const by = by0 + yOff;
        // The two shared ground vertices are the midpoints offset perpendicular.
        // Shared edge endpoints = the two diamond vertices common to both cells:
        // they are at the average of the centres ± half the diamond's cross axis.
        const mx = (ax0 + bx0) / 2, my = (ay + by) / 2;
        // Half-diagonal of the diamond perpendicular to the centre-to-centre line.
        // For E/S neighbours the shared edge is one diamond side; its two vertices
        // are mx±TW/2 horizontally and my∓TH/2 vertically depending on orientation.
        const dx = bx0 - ax0, dy = by - ay;
        // perpendicular unit-ish vector scaled to the diamond half-side
        const px = -(dy) * (TW / TH) / 2, py = (dx) * (TH / TW) / 2;
        const g0 = [mx + px, my + py];
        const g1 = [mx - px, my - py];
        const t0 = [g0[0], g0[1] - DIV_H];
        const t1 = [g1[0], g1[1] - DIV_H];
        const teal = 'rgba(47,158,143,';
        fGround += `<polygon points="${g0[0]},${g0[1]} ${g1[0]},${g1[1]} ${t1[0]},${t1[1]} ${t0[0]},${t0[1]}" fill="${teal}.30)" stroke="${teal}.75)" stroke-width="1.2"/>`;
      });
```

- [ ] **Step 3: Actualitzar el comentari de capçalera de l'API decorada**

A `src/building-render.js`, al JSDoc de `buildBuildingSVG` (línia ~52-56), afegir `dividers` a la
descripció dels floors decorats, al costat d'`openings`/`assigned`.

- [ ] **Step 4: Verificar parsing del mòdul**

Run: `node -e "import('./src/building-render.js').then(m => console.log(typeof m.buildBuildingSVG === 'function' ? 'ok' : 'bad'))"`
Expected: imprimeix `ok`.

- [ ] **Step 5: Smoke test del render amb un divider**

Run:
```bash
node -e "import('./src/building-render.js').then(({buildBuildingSVG}) => {
  const svg = buildBuildingSVG([{ name:'R', cells:[[0,0],[1,0]], cellset:new Set(['0,0','1,0']), assigned:[], openings:[], dividers:[{c:0,r:0,edge:'E'}] }], 0);
  if (!svg.includes('47,158,143')) { console.error('teal divider missing'); process.exit(1); }
  console.log('divider rendered');
})"
```
Expected: imprimeix `divider rendered` (el color teal apareix al SVG).

- [ ] **Step 6: Commit**

```bash
git add src/building-render.js
git commit -m "Render low teal walls for interior dividers in isometric view"
```

---

## Task 12: Verificació final i visual

**Files:** cap (verificació)

- [ ] **Step 1: Executar tota la suite de tests**

Run: `node --test test/`
Expected: tots els tests passen (wall-edges + floor-store), cap fallida.

- [ ] **Step 2: Verificació visual a l'app**

Obrir l'editor de sales a l'app, seleccionar l'eina «Separador», i comprovar:
- En passar el ratolí, les arestes **interiors** s'il·luminen en teal (les exteriors no).
- Clicar una aresta interior hi posa el separador (línia teal); tornar-hi a clicar el treu.
- Clicar la mateixa paret des de la cel·la veïna afecta el mateix separador (no en crea un de duplicat).
- La previsualització isomètrica mostra un mur baix teal sense tapar seients de darrere.
- Desar i recarregar manté els separadors.
- L'eina «Esborra» també treu separadors d'arestes interiors.

- [ ] **Step 3: Commit final si cal (només si la verificació visual ha requerit ajustos)**

```bash
git add -A
git commit -m "Polish divider rendering after visual verification"
```

---

## Notes d'implementació

- **Canonicalització**: tota la lògica de "una paret = un registre" viu a `canonicalDivider`/
  `sanitizeDividers`. L'editor sempre converteix a canònic abans de desar al `Set`, i pinta des
  de les dues cel·les. Mai s'ha de comparar dividers sense canonicalitzar.
- **Oclusió isomètrica**: el mur del divider s'emet dins `fGround` (capa per-cel·la ja ordenada
  per profunditat via el `f.cells.forEach`), no en una capa global, perquè la cel·la frontal
  n'oculti el peu. `DIV_H=14` és prou baix per no envair l'espai dels seients.
- **YAGNI**: cap efecte sobre seients/agents/circulació; cap concepte de zona amb nom; cap eina
  d'arrossegar.
