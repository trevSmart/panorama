# Portes i finestres a l'editor de sales

**Data:** 2026-06-13
**Estat:** Aprovat per implementar

## Objectiu

Permetre que l'usuari col·loqui **portes** i **finestres** als trams de paret exterior d'una planta, des de l'editor de sales (`floor-editor.js`), i que aquestes obertures es vegin a la previsualització isomètrica i a les vistes del edifici (`building-render.js`).

## Context actual

- Cada planta es defineix amb `cells` (cel·les de terra) i `seats` (seients), en coordenades de quadrícula `[c, r]`.
- Les **parets no són objectes editables**: es deriven automàticament del contorn de les cel·les dins de `building-render.js` (polígons `fWalls`), i només es dibuixen les dues arestes posteriors visibles segons la direcció de càmera (`brVis`/`blVis`).
- L'editor té tres eines: `cell`, `seat`, `erase`, amb interacció de pinta-i-arrossega sobre `.fe-cell`.
- Persistència a `floor-store.js`, format `{ v: 1, dir, floors: [{ name, cells, seats }] }` a localStorage.

## Decisions de disseny

1. **Ancoratge**: cada obertura s'ancora a una **cel·la + una aresta exterior** d'aquella cel·la.
2. **Tria d'aresta**: l'usuari tria explícitament quina aresta (clic directe sobre l'aresta ressaltada).
3. **Eines**: dues eines noves separades — Porta i Finestra.
4. **Render**: marc rectangular sobreposat (no es "forada" la paret); finestra blava translúcida, porta fosca/marró.
5. **Visibilitat**: les obertures només es veuen a les parets que la càmera ja mostra (coherent amb el render de parets actual).

## Model de dades

Cada planta guanya un camp nou:

```js
openings: [{ c, r, edge, kind }]
// edge: 'N' | 'S' | 'E' | 'O'  (direcció de quadrícula cap a l'exterior)
// kind: 'door' | 'window'
```

Convenció d'arestes (sobre coordenades de quadrícula, abans de projecció isomètrica):
- `N` = veí `(c, r-1)`
- `S` = veí `(c, r+1)`
- `E` = veí `(c+1, r)`
- `O` = veí `(c-1, r)`

Una aresta és **exterior** quan el veí en aquella direcció **no** és una cel·la de la planta.

### Persistència (`floor-store.js`)

- Bump de versió: `{ v: 2, dir, floors: [{ name, cells, seats, openings }] }`.
- Sanitització a `sanitizeFloors`:
  - `kind` ha de ser `'door'` o `'window'`, altrament es descarta.
  - `edge` ha de ser una de `N|S|E|O`, altrament es descarta.
  - La cel·la `(c, r)` ha d'existir a `cells`, altrament es descarta.
  - L'aresta ha de ser **exterior** (veí absent), altrament es descarta.
  - Es deduplica per `(c, r, edge)`: una aresta té com a molt una obertura.
- **Retrocompatibilitat**: layouts `v: 1` (o sense `openings`) es carreguen amb `openings: []`. `sanitizeRoomDefinition` accepta `v === 1 || v === 2`.

## Editor (`floor-editor.js`)

### Estat

- `state.floors[i].openings`: `Set` de claus `"c,r,edge,kind"` (mateix patró que `cells`/`seats` que usen `Set` de `"c,r"`), o un `Map` `"c,r,edge" → kind`. **Decisió: `Map` `"c,r,edge" → kind`** perquè una aresta només pot tenir un tipus i facilita el toggle/substitució.
- `state.tool` admet dos valors nous: `'door'`, `'window'`.

Conversió `toSetFloor`/`toArrayFloor` estesa per (de)serialitzar `openings`.

### Barra d'eines

Dos botons nous al grup `.fe-tools`:
- `▯ Porta` (`data-tool="door"`)
- `⊞ Finestra` (`data-tool="window"`)

### Interacció

- Cada `.fe-cell` que és de **vora** (té com a mínim una aresta exterior) conté 4 sub-divs absoluts a les vores (`.fe-edge` amb `data-edge="N|S|E|O"`), un per cada aresta exterior present.
  - Aquests sub-divs només són visibles/clicables quan l'eina activa és `door` o `window` (controlat per `gridEl.dataset.tool`, com ja es fa).
- **Clic sobre una aresta** (`pointerdown` sense arrossegament) amb eina `door`/`window`:
  - Si l'aresta ja té el **mateix** `kind` → es treu (toggle off).
  - Si té un `kind` diferent → es substitueix.
  - Si no en té → s'afegeix amb el `kind` de l'eina activa.
- Eina **`erase`**: clicar una aresta amb obertura la treu (a més del comportament actual sobre cel·les/seients).
- En esborrar o moure una cel·la (eina `cell`, mode remove): s'eliminen totes les obertures ancorades a aquella cel·la (igual que els seients orfes). En afegir/treure cel·les veïnes, una aresta pot deixar de ser exterior → cal **re-sanititzar** les obertures de la planta després de cada canvi de `cells` (treure les que han quedat interiors).

### Render del grid 2D

- Funció `paintCellEl(k)` estesa per dibuixar/actualitzar els sub-divs d'aresta i marcar visualment les que tenen obertura:
  - Porta: barra gruixuda fosca a la vora corresponent.
  - Finestra: barra blava a la vora corresponent.
- Quan canvia el contorn de cel·les, cal regenerar quines arestes són exteriors per a les cel·les afectades (i veïnes). Simplificació acceptable: en qualsevol canvi de `cells`, recalcular les arestes exteriors de la cel·la tocada **i les seves 4 veïnes**.

### Comptador a la llista de plantes

`fe-floor-meta` mostra ara també el nombre d'obertures, p.ex. `12▦ 6▣ 3▭`.

## Render isomètric (`building-render.js`)

### Entrada decorada

Els floors decorats que arriben a `buildBuildingSVG` guanyen `openings` (array `{ c, r, edge, kind }`). Cal decorar-los a:
- `floor-editor.js` → `renderPreview` (afegir `openings` al `decorated`).
- `floor-layout.js` → `buildFloorsForAgents` (propagar `openings` al floor decorat).

### Dibuix

Dins del bucle `f.cells.forEach`, després de dibuixar el polígon de paret d'una aresta posterior visible (`brVis`/`blVis`):
- Mapejar l'aresta de quadrícula (`N/S/E/O`) a l'aresta de pantalla (br/bl) **segons `dir`** — reutilitzar la mateixa lògica direccional que `makeBrVis`/`makeBlVis`.
- Si aquella cel·la+aresta té una obertura *i* aquesta aresta és la que s'està dibuixant ara, sobreposar un marc rectangular sobre el quadrilàter de la paret:
  - **Finestra**: rectangle centrat verticalment a ~mitja alçada de `WALL_H`, ample ~60% de l'aresta; emplenat blau translúcid (`rgba(120,160,220,.35)`) amb marc (`stroke`).
  - **Porta**: rectangle des de la base de la paret (a terra) fins a ~60% de `WALL_H`, ample ~45%; emplenat fosc/marró (`rgba(90,60,40,.55)`) amb marc.
- El marc es construeix interpolant els vèrtexs del quadrilàter de paret ja calculat (els quatre punts `x0,y...` que defineixen `fWalls`), de manera que segueix la perspectiva isomètrica.

### Visibilitat

Una obertura en una aresta que la càmera no mostra (no `brVis`/`blVis` per al `dir` actual) **no es dibuixa**. És el comportament esperat i coherent amb les parets.

## Fora d'abast (YAGNI)

- Obertures a parets interiors (entre dues cel·les).
- Geometria real foradada a la paret (es fa marc sobreposat).
- Múltiples obertures a la mateixa aresta.
- Mida/posició configurable de cada obertura.

## Pla de proves

- **Sanitització** (`floor-store`): obertures amb cel·la inexistent, aresta interior, `kind`/`edge` invàlids, duplicats → descartades. Layout `v:1` → carrega amb `openings: []`.
- **Editor**: afegir/treure/substituir obertura en una aresta; esborrar cel·la elimina les seves obertures; convertir una aresta exterior en interior (omplint el veí) treu l'obertura.
- **Render**: una finestra i una porta es dibuixen a la previsualització en una aresta posterior visible; girant la càmera, l'obertura d'una aresta no visible desapareix i reapareix correctament.
- **Persistència end-to-end**: marcar obertures → Desa → recarregar → es mantenen i es veuen a les vistes (`refreshFloors`).
