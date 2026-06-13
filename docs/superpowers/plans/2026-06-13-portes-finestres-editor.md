# Portes i finestres a l'editor de sales — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permetre col·locar portes i finestres a les arestes exteriors de les cel·les d'una planta des de l'editor, persistir-les i renderitzar-les a la vista isomètrica.

**Architecture:** Una obertura és `{ c, r, edge, kind }` ancorada a una cel·la i una aresta exterior (`N/S/E/O`). La lògica d'arestes (quines són exteriors, mapeig quadrícula→pantalla) s'extreu a un mòdul pur `wall-edges.js` testejable. La persistència (`floor-store.js`) puja a `v:2` i sanititza obertures. L'editor (`floor-editor.js`) afegeix dues eines i clic d'aresta. El render (`building-render.js`) sobreposa marcs als polígons de paret existents.

**Tech Stack:** JavaScript ESM, `node --test` per a proves unitàries, SVG per al render. Sense dependències noves.

---

## File Structure

- **Create** `src/data/wall-edges.js` — mòdul pur: convenció d'arestes, càlcul d'arestes exteriors, sanitització d'una llista d'obertures contra un conjunt de cel·les, mapeig aresta-quadrícula → aresta-pantalla per `dir`.
- **Create** `test/wall-edges.test.js` — proves del mòdul pur.
- **Modify** `src/data/floor-store.js` — `v:2`, sanitització d'`openings`, retrocompatibilitat `v:1`.
- **Modify** `test/floor-store.test.js` — proves de sanitització d'obertures i compatibilitat.
- **Modify** `src/data/floor-layout.js` — `buildFloorsForAgents` propaga `openings`; floors base inclouen `openings: []`.
- **Modify** `src/building-render.js` — dibuixa marcs d'obertura sobre les parets posteriors.
- **Modify** `test/building-render.test.js` — proves de render d'obertures.
- **Modify** `src/floor-editor.js` — eines Porta/Finestra, sub-divs d'aresta, clic, render 2D, comptador, (de)serialització.
- **Modify** `index.html` — CSS per `.fe-edge` i marques d'obertura al grid.

---

## Convencions compartides (referència per a totes les tasques)

Aresta = direcció de quadrícula cap a l'exterior:
- `N` → veí `(c, r-1)`
- `S` → veí `(c, r+1)`
- `E` → veí `(c+1, r)`
- `O` → veí `(c-1, r)`

Una aresta `(c,r,edge)` és **exterior** si la cel·la veïna en aquella direcció NO és al conjunt de cel·les.

Obertura: `{ c: number, r: number, edge: 'N'|'S'|'E'|'O', kind: 'door'|'window' }`.

Clau d'obertura (a l'editor): `"c,r,edge"` → `kind` (Map).

---

## Task 1: Mòdul pur `wall-edges.js` — arestes exteriors i sanitització

**Files:**
- Create: `src/data/wall-edges.js`
- Test: `test/wall-edges.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/wall-edges.test.js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EDGES,
  NEIGHBOR,
  exteriorEdges,
  sanitizeOpenings,
} from '../src/data/wall-edges.js';

test('EDGES lists the four grid directions', () => {
  assert.deepEqual([...EDGES].sort(), ['E', 'N', 'O', 'S']);
});

test('NEIGHBOR maps an edge to the neighbour offset', () => {
  assert.deepEqual(NEIGHBOR.N(2, 3), [2, 2]);
  assert.deepEqual(NEIGHBOR.S(2, 3), [2, 4]);
  assert.deepEqual(NEIGHBOR.E(2, 3), [3, 3]);
  assert.deepEqual(NEIGHBOR.O(2, 3), [1, 3]);
});

test('exteriorEdges returns edges whose neighbour is absent', () => {
  // single cell at origin → all four edges are exterior
  const cellset = new Set(['0,0']);
  assert.deepEqual(exteriorEdges(0, 0, cellset).sort(), ['E', 'N', 'O', 'S']);
});

test('exteriorEdges excludes edges with a present neighbour', () => {
  // (0,0) with a neighbour to the east at (1,0): E is interior
  const cellset = new Set(['0,0', '1,0']);
  assert.deepEqual(exteriorEdges(0, 0, cellset).sort(), ['N', 'O', 'S']);
});

test('sanitizeOpenings keeps only valid exterior openings', () => {
  const cellset = new Set(['0,0', '1,0']);
  const input = [
    { c: 0, r: 0, edge: 'N', kind: 'door' },     // valid (N exterior)
    { c: 0, r: 0, edge: 'E', kind: 'window' },    // dropped: E is interior
    { c: 5, r: 5, edge: 'N', kind: 'door' },      // dropped: cell absent
    { c: 0, r: 0, edge: 'X', kind: 'door' },      // dropped: bad edge
    { c: 0, r: 0, edge: 'S', kind: 'gate' },      // dropped: bad kind
    { c: 1, r: 0, edge: 'N', kind: 'window' },    // valid
  ];
  assert.deepEqual(sanitizeOpenings(input, cellset), [
    { c: 0, r: 0, edge: 'N', kind: 'door' },
    { c: 1, r: 0, edge: 'N', kind: 'window' },
  ]);
});

test('sanitizeOpenings dedupes per (c,r,edge) keeping the first', () => {
  const cellset = new Set(['0,0']);
  const input = [
    { c: 0, r: 0, edge: 'N', kind: 'door' },
    { c: 0, r: 0, edge: 'N', kind: 'window' }, // dup edge → dropped
  ];
  assert.deepEqual(sanitizeOpenings(input, cellset), [
    { c: 0, r: 0, edge: 'N', kind: 'door' },
  ]);
});

test('sanitizeOpenings tolerates non-array input', () => {
  assert.deepEqual(sanitizeOpenings(undefined, new Set(['0,0'])), []);
  assert.deepEqual(sanitizeOpenings(null, new Set(['0,0'])), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/wall-edges.test.js`
Expected: FAIL — `Cannot find module '../src/data/wall-edges.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/data/wall-edges.js
/**
 * Pure helpers for wall edges and openings.
 *
 * An edge is one of the four grid directions toward the outside of a cell.
 * An opening ({ c, r, edge, kind }) is anchored to a cell and an *exterior*
 * edge (the neighbour in that direction is not a floor cell).
 */

export const EDGES = ['N', 'S', 'E', 'O'];
export const KINDS = ['door', 'window'];

/** edge → neighbour coords */
export const NEIGHBOR = {
  N: (c, r) => [c, r - 1],
  S: (c, r) => [c, r + 1],
  E: (c, r) => [c + 1, r],
  O: (c, r) => [c - 1, r],
};

const k = (c, r) => `${c},${r}`;

/**
 * @param {number} c
 * @param {number} r
 * @param {Set<string>} cellset  keys "c,r"
 * @returns {string[]} exterior edges of this cell
 */
export function exteriorEdges(c, r, cellset) {
  return EDGES.filter((e) => {
    const [nc, nr] = NEIGHBOR[e](c, r);
    return !cellset.has(k(nc, nr));
  });
}

/**
 * Keep only openings on existing cells whose edge is exterior, with a valid
 * kind, deduped per (c,r,edge).
 * @param {unknown} openings
 * @param {Set<string>} cellset
 * @returns {Array<{ c: number, r: number, edge: string, kind: string }>}
 */
export function sanitizeOpenings(openings, cellset) {
  if (!Array.isArray(openings)) return [];
  const seen = new Set();
  const out = [];
  for (const o of openings) {
    if (!o || typeof o !== 'object') continue;
    const { c, r, edge, kind } = o;
    if (!Number.isInteger(c) || !Number.isInteger(r)) continue;
    if (!EDGES.includes(edge) || !KINDS.includes(kind)) continue;
    if (!cellset.has(k(c, r))) continue;
    const [nc, nr] = NEIGHBOR[edge](c, r);
    if (cellset.has(k(nc, nr))) continue; // interior edge
    const dedupe = `${c},${r},${edge}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({ c, r, edge, kind });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/wall-edges.test.js`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/wall-edges.js test/wall-edges.test.js
git commit -m "Add pure wall-edges module for exterior edges and opening sanitization"
```

---

## Task 2: Persistència d'obertures a `floor-store.js`

**Files:**
- Modify: `src/data/floor-store.js`
- Test: `test/floor-store.test.js`

- [ ] **Step 1: Write the failing tests**

Afegeix a `test/floor-store.test.js` (després dels tests existents). Actualitza també la importació de dalt afegint `sanitizeFloors` a la llista d'imports si no hi és:

```js
// add to imports at top:
//   sanitizeFloors,

test('sanitizeFloors keeps valid openings and drops invalid ones', () => {
  const floors = sanitizeFloors([
    {
      name: 'Room',
      cells: [[0, 0], [1, 0]],
      seats: [[1, 0]],
      openings: [
        { c: 0, r: 0, edge: 'N', kind: 'door' },     // valid
        { c: 0, r: 0, edge: 'E', kind: 'window' },    // interior → dropped
        { c: 9, r: 9, edge: 'N', kind: 'door' },      // absent cell → dropped
      ],
    },
  ]);
  assert.deepEqual(floors[0].openings, [{ c: 0, r: 0, edge: 'N', kind: 'door' }]);
});

test('sanitizeFloors defaults missing openings to an empty array', () => {
  const floors = sanitizeFloors([{ name: 'Room', cells: [[0, 0]], seats: [] }]);
  assert.deepEqual(floors[0].openings, []);
});

test('room definition accepts both v1 and v2', () => {
  const v1 = sanitizeRoomDefinition({ v: 1, dir: 0, floors: oneFloor() });
  assert.ok(v1);
  assert.deepEqual(v1.floors[0].openings, []);

  const v2 = sanitizeRoomDefinition({
    v: 2,
    dir: 1,
    floors: [{ name: 'R', cells: [[0, 0]], seats: [], openings: [{ c: 0, r: 0, edge: 'N', kind: 'window' }] }],
  });
  assert.equal(v2.dir, 1);
  assert.deepEqual(v2.floors[0].openings, [{ c: 0, r: 0, edge: 'N', kind: 'window' }]);
});

test('saveCustomFloors persists openings under v2', () => {
  saveCustomFloors([
    { name: 'R', cells: [[0, 0], [1, 0]], seats: [], openings: [{ c: 0, r: 0, edge: 'N', kind: 'door' }] },
  ], 0);
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
  assert.equal(stored.v, 2);
  assert.deepEqual(stored.floors[0].openings, [{ c: 0, r: 0, edge: 'N', kind: 'door' }]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/floor-store.test.js`
Expected: FAIL — `sanitizeFloors` undefined import / `openings` is `undefined` / stored `v` is `1`.

- [ ] **Step 3: Implement**

A `src/data/floor-store.js`:

3a. Importa el sanititzador d'obertures (a dalt del fitxer):

```js
import { sanitizeOpenings } from './wall-edges.js';
```

3b. Dins de `sanitizeFloors`, després de construir `seats` i abans de `floors.push(...)`, calcula el conjunt de cel·les i sanititza les obertures. Substitueix el bloc del `push`:

```js
    const name = typeof f.name === 'string' && f.name.trim() ? f.name.trim() : `Planta ${floors.length + 1}`;
    const cellset = new Set(cells.map(([cc, rr]) => `${cc},${rr}`));
    const openings = sanitizeOpenings(f.openings, cellset);
    floors.push({ name, cells, seats, openings });
```

3c. A `sanitizeRoomDefinition`, accepta `v:1` i `v:2`:

```js
export function sanitizeRoomDefinition(raw) {
  if (!raw || typeof raw !== 'object' || (raw.v !== 1 && raw.v !== 2)) return null;
  const floors = sanitizeFloors(raw.floors);
  if (!floors) return null;
  return { dir: sanitizeDir(raw.dir), floors };
}
```

3d. A `saveCustomFloors`, escriu `v: 2`:

```js
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 2, dir: sanitizeDir(dir), floors: clean }));
```

3e. A `saveCustomRoomDir`, escriu `v: 2` també:

```js
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 2, dir: cleanDir, floors }));
```

3f. Actualitza el JSDoc de capçalera del fitxer per reflectir `v: 2` i el camp `openings` (línies 1-6):

```js
/**
 * Persistence for user-customized floor layouts.
 *
 * Stored shape: { v: 2, dir: 0-3, floors: [{ name, cells: [[c,r]], seats: [[c,r]], openings: [{ c, r, edge, kind }] }] }
 * Seats must sit on floor cells; openings must sit on an exterior edge of an
 * existing cell. Invalid entries are dropped on load. v1 layouts load with
 * openings: [].
 */
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/floor-store.test.js`
Expected: PASS (existing + 4 new tests).

Nota: els tests existents `deepEqual(loadCustomFloors(), oneFloor())` ara compararan objectes amb `openings: []` afegit. `oneFloor()` no té `openings`. Cal actualitzar `oneFloor()` perquè inclogui `openings: []`:

```js
function oneFloor(name = 'Main room') {
  return [{ name, cells: [[0, 0], [1, 0]], seats: [[1, 0]], openings: [] }];
}
```

I el test `room definition stores sanitized floors...` que fa `deepEqual` amb un literal explícit: afegeix `openings: []` a aquell literal:

```js
  assert.deepEqual(clean, {
    dir: 2,
    floors: [{ name: 'Main room', cells: [[0, 0], [1, 0]], seats: [[1, 0]], openings: [] }],
  });
```

Torna a executar fins a PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/floor-store.js test/floor-store.test.js
git commit -m "Persist door/window openings under v2 with sanitization and v1 fallback"
```

---

## Task 3: Propagar `openings` als floors decorats (`floor-layout.js`)

**Files:**
- Modify: `src/data/floor-layout.js`

- [ ] **Step 1: Implement**

A `src/data/floor-layout.js`, dins de `buildFloorsForAgents`, el `forEach` que decora cada floor afegeix `openings`. Substitueix el bloc:

```js
  floors.forEach((f) => {
    f.cellset = new Set(f.cells.map(([c, r]) => `${c},${r}`));
    f.assigned = f.seats.map(([c, r]) => ({ c, r, agent: sorted[k++] || null }));
    f.openings = f.openings || [];
  });
```

(`baseFloors()` ja retorna floors amb `openings` quan venen de `loadCustomFloors`; els floors per defecte `floorBaixa`/`floorPrimera` no tenen `openings`, per això el fallback `|| []`.)

- [ ] **Step 2: Verify no test regressions**

Run: `node --test`
Expected: PASS (cap test trencat; `building-render.test.js` no passa `openings` i el render ha de tolerar-ho — es confirma a la Task 4).

- [ ] **Step 3: Commit**

```bash
git add src/data/floor-layout.js
git commit -m "Propagate openings onto decorated floors for agents"
```

---

## Task 4: Render de marcs d'obertura (`building-render.js`)

**Files:**
- Modify: `src/building-render.js`
- Test: `test/building-render.test.js`

Context render: per a cada cel·la, `brVis(c,r)` dibuixa la paret posterior dreta i `blVis(c,r)` la posterior esquerra. Aquestes corresponen a arestes de quadrícula segons `dir`. El mapeig br/bl → aresta de quadrícula és l'invers de `makeBrVis`/`makeBlVis`:

- `brVis`: dir 0 → `N` (`!has(c, r-1)`); dir 1/2 → `O` (`!has(c-1, r)`); dir 3 → `E` (`!has(c+1, r)`).
- `blVis`: dir 0 → `O` (`!has(c-1, r)`); dir 1 → `E`; dir 2 → `S`; dir 3 → `N`.

(Es deriva directament de les expressions a `building-render.js:85-94`.)

- [ ] **Step 1: Write the failing tests**

Afegeix a `test/building-render.test.js`:

```js
test('a window opening on a visible rear edge draws a window frame', () => {
  // single cell at (0,0): dir 0 → brVis edge is N, blVis edge is O.
  const floor = {
    name: 'Cell',
    cells: [[0, 0]],
    cellset: new Set(['0,0']),
    assigned: [],
    openings: [{ c: 0, r: 0, edge: 'N', kind: 'window' }],
  };
  const svg = buildBuildingSVG([floor], 0, { showLabels: false });
  assert.match(svg, /class="opening opening-window"/);
});

test('a door opening on a visible rear edge draws a door frame', () => {
  const floor = {
    name: 'Cell',
    cells: [[0, 0]],
    cellset: new Set(['0,0']),
    assigned: [],
    openings: [{ c: 0, r: 0, edge: 'O', kind: 'door' }],
  };
  const svg = buildBuildingSVG([floor], 0, { showLabels: false });
  assert.match(svg, /class="opening opening-door"/);
});

test('an opening on a non-visible edge is not drawn', () => {
  // dir 0: visible rear edges are N and O. An opening on S must not render.
  const floor = {
    name: 'Cell',
    cells: [[0, 0]],
    cellset: new Set(['0,0']),
    assigned: [],
    openings: [{ c: 0, r: 0, edge: 'S', kind: 'window' }],
  };
  const svg = buildBuildingSVG([floor], 0, { showLabels: false });
  assert.doesNotMatch(svg, /class="opening/);
});

test('rendering without openings field is tolerated', () => {
  const floor = {
    name: 'Cell',
    cells: [[0, 0]],
    cellset: new Set(['0,0']),
    assigned: [],
  };
  assert.doesNotThrow(() => buildBuildingSVG([floor], 0, { showLabels: false }));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/building-render.test.js`
Expected: FAIL — no hi ha cap `class="opening ..."` al SVG.

- [ ] **Step 3: Implement**

A `src/building-render.js`:

3a. Dins de `buildBuildingSVG`, després de definir `makeBrVis`/`makeBlVis` (cap a la línia 94), afegeix helpers que retornen *quina aresta de quadrícula* dibuixa cada paret posterior segons `dir`, i una funció que cerca una obertura:

```js
  // Which grid edge (N/S/E/O) each visible rear wall corresponds to, per dir.
  // Inverse of makeBrVis/makeBlVis above.
  const brEdge = dir === 0 ? 'N' : dir === 3 ? 'E' : 'O';
  const blEdge = dir === 0 ? 'O' : dir === 1 ? 'E' : dir === 2 ? 'S' : 'N';
```

3b. Dins del `floors.forEach`, després de `const has = ...` (línia ~139), construeix un índex d'obertures per a aquesta planta:

```js
    const openingAt = new Map(); // "c,r,edge" → kind
    (f.openings || []).forEach((o) => openingAt.set(`${o.c},${o.r},${o.edge}`, o.kind));
```

3c. Afegeix un helper local que, donat el quadrilàter de paret (els quatre vèrtexs ja calculats) i el `kind`, retorni el marc SVG. Posa'l just abans del `f.cells.forEach` del floor (té accés a `WALL_H` per coherència, però treballa amb els punts passats):

```js
    // Overlay a frame on the wall quad. p0/p1 are the two ground vertices,
    // p0t/p1t the two top vertices (p0→p0t is the rising edge). Window sits at
    // mid-height; door rises from the ground. Interpolated so it follows the
    // isometric perspective. No hole is cut.
    const openingFrame = (p0, p1, p0t, p1t, kind) => {
      const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      // horizontal inset (along the ground edge)
      const wIn = kind === 'door' ? 0.275 : 0.2;   // door ~45% wide, window ~60%
      const g0 = lerp(p0, p1, wIn), g1 = lerp(p0, p1, 1 - wIn);
      const t0 = lerp(p0t, p1t, wIn), t1 = lerp(p0t, p1t, 1 - wIn);
      // vertical band (0 = ground, 1 = top)
      const vLo = kind === 'door' ? 0 : 0.32;
      const vHi = kind === 'door' ? 0.62 : 0.7;
      const bl = lerp(g0, t0, vLo), tl = lerp(g0, t0, vHi);
      const br = lerp(g1, t1, vLo), tr = lerp(g1, t1, vHi);
      const fill = kind === 'door' ? 'rgba(90,60,40,.55)' : 'rgba(120,160,220,.35)';
      const stroke = kind === 'door' ? 'rgba(60,40,26,.8)' : 'rgba(70,110,180,.85)';
      return `<polygon class="opening opening-${kind}" points="${bl[0]},${bl[1]} ${br[0]},${br[1]} ${tr[0]},${tr[1]} ${tl[0]},${tl[1]}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
    };
```

3d. Dins del `f.cells.forEach`, on es dibuixen les parets posteriors. El polígon br actual (línia ~165) usa els punts `(x0,y-TH)`, `(x0+TW,y)`, `(x0+TW,y-WALL_H)`, `(x0,y-TH-WALL_H)`. Els dos primers són a terra (ground), els dos últims a dalt (top). Després d'afegir el polígon de paret br, afegeix l'obertura si n'hi ha:

```js
      if (brVis(c, r) && !hasRearCellBeyond(x0, y, TW)) {
        fWalls += `<polygon points="${x0},${y - TH} ${x0 + TW},${y} ${x0 + TW},${y - WALL_H} ${x0},${y - TH - WALL_H}" fill="rgba(27,25,36,.032)" stroke="rgba(27,25,36,.045)" stroke-width=".5"/>`;
        const brKind = openingAt.get(`${c},${r},${brEdge}`);
        if (brKind) {
          fWalls += openingFrame([x0, y - TH], [x0 + TW, y], [x0, y - TH - WALL_H], [x0 + TW, y - WALL_H], brKind);
        }
        if (y - TH - WALL_H < fTopY) fTopY = y - TH - WALL_H;
        ext(x0 + TW, y - TH - WALL_H);
      }
```

I, anàlogament, per la paret bl (línia ~169). Els punts bl són `(x0,y-TH)`, `(x0-TW,y)`, `(x0-TW,y-WALL_H)`, `(x0,y-TH-WALL_H)`:

```js
      if (blVis(c, r) && !hasRearCellBeyond(x0, y, -TW)) {
        fWalls += `<polygon points="${x0},${y - TH} ${x0 - TW},${y} ${x0 - TW},${y - WALL_H} ${x0},${y - TH - WALL_H}" fill="rgba(27,25,36,.052)" stroke="rgba(27,25,36,.045)" stroke-width=".5"/>`;
        const blKind = openingAt.get(`${c},${r},${blEdge}`);
        if (blKind) {
          fWalls += openingFrame([x0, y - TH], [x0 - TW, y], [x0, y - TH - WALL_H], [x0 - TW, y - WALL_H], blKind);
        }
        if (y - TH - WALL_H < fTopY) fTopY = y - TH - WALL_H;
        ext(x0 - TW, y - TH - WALL_H);
      }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/building-render.test.js`
Expected: PASS. Verifica també que el test existent `rotated room walls follow the screen-space rear perimeter` segueix passant (la regex de paret no casa amb els polígons `class="opening"` perquè aquests no tenen el patró `fill="rgba(27,25,36,...`).

- [ ] **Step 5: Commit**

```bash
git add src/building-render.js test/building-render.test.js
git commit -m "Render door/window opening frames on visible rear walls"
```

---

## Task 5: Editor — (de)serialització i eines Porta/Finestra

**Files:**
- Modify: `src/floor-editor.js`

Aquesta tasca és UI de navegador: `node --test` no la cobreix. La verificació és manual (Step final). Implementa-ho en un sol commit perquè les peces són interdependents.

- [ ] **Step 1: (De)serialització d'obertures**

A `src/floor-editor.js`, importa el mòdul pur (a dalt):

```js
import { exteriorEdges, sanitizeOpenings } from './data/wall-edges.js';
```

`toSetFloor`: afegeix un `Map` d'obertures `"c,r,edge" → kind`:

```js
function toSetFloor(f) {
  const opMap = new Map();
  (f.openings || []).forEach((o) => opMap.set(`${o.c},${o.r},${o.edge}`, o.kind));
  return {
    name: f.name,
    cells: new Set(f.cells.map(([c, r]) => key(c, r))),
    seats: new Set(f.seats.map(([c, r]) => key(c, r))),
    openings: opMap,
  };
}
```

`toArrayFloor`: serialitza el `Map` a array d'objectes:

```js
function toArrayFloor(f) {
  const openings = [...f.openings].map(([k, kind]) => {
    const [c, r, edge] = k.split(',');
    return { c: Number(c), r: Number(r), edge, kind };
  });
  return {
    name: f.name,
    cells: [...f.cells].map(parseKey),
    seats: [...f.seats].map(parseKey),
    openings,
  };
}
```

El floor nou que crea `.fe-add` també necessita `openings`:

```js
    state.floors.push({ name: `Planta ${state.floors.length + 1}`, cells, seats: new Set(), openings: new Map() });
```

- [ ] **Step 2: Eines noves a la barra**

Afegeix dos botons al grup `.fe-tools` dins de `container.innerHTML` (després del botó `seat`, abans de `erase`):

```html
              <button data-tool="door" title="Col·loca o treu portes a les arestes exteriors">▯ Porta</button>
              <button data-tool="window" title="Col·loca o treu finestres a les arestes exteriors">⊞ Finestra</button>
```

(El comentari de `state.tool` passa a `'cell' | 'seat' | 'door' | 'window' | 'erase'`.)

- [ ] **Step 3: Sub-divs d'aresta a cada cel·la de vora**

Reescriu la construcció de cel·les del grid perquè cada `.fe-cell` contingui els seus sub-divs d'aresta. Substitueix el bloc de creació de cel·les (línies ~104-113):

```js
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
```

- [ ] **Step 4: `paintCellEl` actualitza arestes i obertures**

Substitueix `paintCellEl`:

```js
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
```

- [ ] **Step 5: Clic d'aresta**

Afegeix un handler a `gridEl` que processi clics sobre `.fe-edge` quan l'eina és `door`/`window`/`erase`. Posa'l just abans del handler `pointerdown` existent del grid:

```js
  function applyEdgeTool(cellEl, edgeEl) {
    if (!['door', 'window', 'erase'].includes(state.tool)) return false;
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
      f.openings.delete(k); // toggle off same kind
    } else {
      f.openings.set(k, state.tool); // add or replace
    }
    paintCellEl(`${c},${r}`);
    markDirty();
    schedulePreview();
    return true;
  }
```

Al `pointerdown` del grid, intercepta primer el clic d'aresta. Modifica l'inici del handler `gridEl.addEventListener('pointerdown', ...)`:

```js
  gridEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const edgeEl = e.target.closest('.fe-edge');
    if (edgeEl && ['door', 'window', 'erase'].includes(state.tool)) {
      const cellEl = edgeEl.closest('.fe-cell');
      if (applyEdgeTool(cellEl, edgeEl)) { e.preventDefault(); return; }
      // erase falls through to cell/seat erase if the edge had no opening
      if (state.tool === 'erase') { /* continue to cell erase below */ }
      else return; // door/window on a non-opening edge: nothing more to do
    }
    const k = cellFromEvent(e);
    if (!k) return;
    // ... rest unchanged
```

Important: quan l'eina és `door`/`window`, el `pointerdown` que NO toca una aresta exterior no ha de pintar cel·les. Afegeix una guarda després d'obtenir `k`:

```js
    const k = cellFromEvent(e);
    if (!k) return;
    if (state.tool === 'door' || state.tool === 'window') return; // only edges act
    const f = state.floors[state.active];
    // ... rest unchanged (mode computation for cell/seat/erase)
```

- [ ] **Step 6: Re-sanititzar obertures en canviar cel·les**

Quan s'afegeix o es treu una cel·la, una aresta exterior pot tornar-se interior (o a l'inrevés). Dins de `applyTool`, al final del bloc `if (state.tool === 'cell')` (tant add com remove), re-sanititza les obertures de la planta i repinta les cel·les afectades. Substitueix el cos d'`applyTool` per la versió amb re-sanitització després d'un canvi de cel·la:

```js
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
      // Drop openings that are no longer on an exterior edge of an existing cell.
      const arr = [...f.openings].map(([kk, kind]) => {
        const [c, r, edge] = kk.split(',');
        return { c: Number(c), r: Number(r), edge, kind };
      });
      const kept = sanitizeOpenings(arr, f.cells);
      f.openings = new Map(kept.map((o) => [`${o.c},${o.r},${o.edge}`, o.kind]));
      renderGrid(); // edges of neighbours may have changed
    }
    if (changed) {
      if (!cellsChanged) paintCellEl(k);
      markDirty();
      schedulePreview();
    }
  }
```

- [ ] **Step 7: Decorar `openings` a la previsualització**

A `renderPreview`, afegeix `openings` al floor decorat:

```js
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
```

- [ ] **Step 8: Comptador d'obertures a la llista de plantes**

A `renderFloors`, actualitza el `meta.textContent`:

```js
      meta.textContent = `${f.cells.size}▦ ${f.seats.size}▣ ${f.openings.size}▭`;
```

- [ ] **Step 9: Verificació manual**

Run: `npm start` i obre l'editor de plantes al navegador.

Comprova:
1. Apareixen els botons **▯ Porta** i **⊞ Finestra**.
2. Amb Porta activa, en passar per una cel·la de vora se'n ressalten les arestes exteriors; clic en una hi posa una porta (marca fosca). Clic de nou la treu.
3. Amb Finestra, marca blava; clicar sobre una aresta amb porta la substitueix per finestra.
4. La previsualització isomètrica mostra el marc de porta/finestra a les parets posteriors visibles; girant amb ↺/↻ apareix/desapareix segons la cara visible.
5. Esborra treu obertures en clicar-hi.
6. Omplir el veí d'una aresta amb obertura (eina Cel·les) fa desaparèixer l'obertura (ara és interior).
7. El comptador `▭` de la planta reflecteix el nombre d'obertures.

- [ ] **Step 10: Commit**

```bash
git add src/floor-editor.js
git commit -m "Add door/window tools and edge interaction to floor editor"
```

---

## Task 6: CSS de l'editor (`index.html`)

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Implement**

Afegeix CSS després de la regla `.fe-cell.seat::after` (cap a la línia 2236). `.fe-cell` ha de ser `position: relative` perquè els sub-divs d'aresta s'hi posicionin (afegeix-ho a la regla `.fe-cell` existent si no hi és):

```css
    .fe-cell { position: relative; }

    /* Edge handles — only interactive when a door/window/erase tool is active. */
    .fe-edge { position: absolute; pointer-events: none; }
    .fe-edge-N { top: -2px; left: 10%; right: 10%; height: 4px; }
    .fe-edge-S { bottom: -2px; left: 10%; right: 10%; height: 4px; }
    .fe-edge-E { right: -2px; top: 10%; bottom: 10%; width: 4px; }
    .fe-edge-O { left: -2px; top: 10%; bottom: 10%; width: 4px; }

    .fe-grid[data-tool="door"] .fe-edge.exterior,
    .fe-grid[data-tool="window"] .fe-edge.exterior,
    .fe-grid[data-tool="erase"] .fe-edge.exterior {
      pointer-events: auto;
      background: rgba(106, 91, 232, .25);
      cursor: pointer;
    }
    .fe-grid[data-tool="door"] .fe-edge.exterior:hover,
    .fe-grid[data-tool="window"] .fe-edge.exterior:hover {
      background: rgba(106, 91, 232, .6);
    }
    /* Openings are always shown (regardless of active tool). */
    .fe-edge.door { background: rgba(60, 40, 26, .85) !important; pointer-events: auto; }
    .fe-edge.window { background: rgba(70, 110, 180, .85) !important; pointer-events: auto; }
```

- [ ] **Step 2: Verificació manual**

Run: `npm start`. Confirma que les arestes només es ressalten amb Porta/Finestra/Esborra actives, que les obertures col·locades es veuen sempre, i que el clic d'aresta funciona (pas de Task 5 ja ho cobreix).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "Style floor editor edge handles and opening markers"
```

---

## Final verification

- [ ] Run: `node --test`
Expected: tots els tests PASS (wall-edges, floor-store, building-render).

- [ ] Verificació manual end-to-end: marca portes i finestres → **Desa** → recarrega la pàgina → les obertures es mantenen i es veuen a les vistes del edifici (no només a la previsualització de l'editor). Comprova que `globalThis.refreshFloors()` propaga els canvis.

- [ ] Retrocompatibilitat: si tens un layout `v:1` desat (de abans), carrega sense errors i amb `openings` buits.
