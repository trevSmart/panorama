# Separadors d'espais a l'editor de sales

**Data:** 2026-06-13
**Estat:** Disseny aprovat, pendent de pla d'implementació

## Resum

Afegir a l'editor de sales la possibilitat de col·locar **separadors d'espais**: parets
interiors que divideixen una mateixa sala en zones. Són un element **purament visual**
(no afecten seients, circulació ni assignació d'agents). Reaprofiten el patró d'interacció
de portes/finestres, però s'apliquen a arestes **interiors** (entre dues cel·les de terra)
en comptes d'exteriors, i es desen en una llista de dades pròpia i independent.

## Concepte i model de dades

Un **separador** és un costat d'una cel·la (N/S/E/O) que és una **aresta interior**: el veí
en aquella direcció també és cel·la de terra. La unitat mínima és un sol costat d'una cel·la,
igual que una porta o finestra; per fer divisions més llargues se'n posen uns quants de seguits.

### Estructura

```
divider: { c, r, edge }   // edge ∈ {N, S, E, O}; sense kind (un sol tipus de separador)
```

Es desa en una **llista pròpia, separada de les openings**. Decisió deliberada: portes/finestres
(exteriors) i separadors (interiors) són conceptes diferents i poden divergir en el futur
(p. ex. funcionalitat que només apliqui a un dels dos). No es barregen en una sola llista per
evitar acoblament.

### Persistència

Format v2 de `floor-store` estès amb un camp `dividers` per planta:

```
{ v: 2, dir: 0-3, floors: [{ name, cells, seats, openings, dividers: [{ c, r, edge }] }] }
```

Els layouts existents (v1, o v2 sense el camp) carreguen amb `dividers: []`. No cal bump de
versió perquè és un camp additiu i opcional, com ho va ser `openings`.

### Canonicalització

La paret entre `(c,r)·E` i `(c+1,r)·O` és físicament la mateixa, i igual amb `(c,r)·S` /
`(c,r+1)·N`. Per garantir un únic registre per paret es desa sempre amb una sola convenció:
**només es permeten les arestes `E` i `S`**. Una aresta `N` es normalitza al `S` del veí de
dalt, i una `O` al `E` del veí de l'esquerra.

### Mòduls pures nous (a `wall-edges.js`)

- `interiorEdges(c, r, cellset)` — germana d'`exteriorEdges`; retorna els costats el veí
  dels quals SÍ que és cel·la de terra.
- `canonicalDivider(c, r, edge)` — normalitza qualsevol aresta interior a la forma canònica
  (E/S) de la paret corresponent.
- `sanitizeDividers(dividers, cellset)` — germana de `sanitizeOpenings`; valida que cada
  divider sigui sobre una aresta interior d'una cel·la existent, el canonicalitza i el
  dedup per `(c,r,edge)` canònic. Descarta entrades invàlides.

## Interacció (graella 2D)

Nova eina **«Separador»** al toolbar (`data-tool="divider"`), al costat de Porta/Finestra.

- S'afegeix `'divider'` a `EDGE_TOOLS`.
- Amb l'eina activa, s'il·luminen les **arestes interiors** de les cel·les (avui els elements
  `.fe-edge` només es marquen com a `exterior`). Cal marcar també les interiors quan l'eina
  activa és el separador.
- Clicar una aresta interior hi posa/treu el separador, amb el mateix gest que portes/finestres
  (`applyEdgeTool` adaptat per acceptar arestes interiors quan `tool === 'divider'`).
- La canonicalització fa que clicar des de qualsevol de les dues cel·les adjacents afecti el
  mateix separador.

## Aspecte

### Graella 2D

Línia sòlida gruixuda **teal** sobre l'aresta interior. Nova classe CSS `.fe-edge.divider`.
El color teal distintiu evita confusió amb les parets exteriors (grises) i amb portes/finestres.

### Vista isomètrica 3D

**Mur baix** teal sobre la vora compartida del diamant de la cel·la: un quad curt que puja
poc des de l'aresta del terra (molt més baix que `WALL_H`).

Detall geomètric clau: dues cel·les veïnes per N/S/E/O **no** queden de costat horitzontal a la
pantalla isomètrica, sinó una **davant l'altra en diagonal**. La cel·la frontal es dibuixa
després i tapa parcialment la de darrere. Per tant el mur del separador s'ha de dibuixar
**integrat al bucle de cel·les, que ja està ordenat per profunditat** (no en una capa a part),
perquè la cel·la frontal n'oculti correctament el peu i l'oclusió quedi natural.

`building-render.js` llegeix `f.dividers` i, per a cada cel·la que dibuixa, emet el quad del
mur baix dels seus separadors canònics (E/S) just després de la geometria de terra d'aquella
cel·la.

## Flux de dades

`floor-editor.js`:

- El model intern de planta guanya `dividers` (com `openings`): `Set`/`Map` mentre s'edita,
  `Array` en serialitzar. Helpers `dividersToMap`/`dividersToArray` paral·lels als d'openings.
- `applyTool`/sanitització recanonicalitzen els dividers quan canvien les cel·les (esborrar una
  cel·la ha de descartar els seus separadors, com passa amb les openings).
- `decorated` passa `dividers` cap a `buildBuildingSVG` i cap als thumbnails de planta.
- `saveCustomFloors` persisteix els dividers.
- El comptador meta de cada fila de planta mostra també el nombre de separadors.

## Tests

A `test/floor-store.test.js`:

- `sanitizeDividers`: canonicalització E/S, rebuig d'arestes exteriors, rebuig de cel·les
  inexistents, dedup per paret canònica (clicar des de les dues cel·les → un sol registre).
- Càrrega v1 i v2-sense-camp → `dividers: []`.
- Round-trip de desat/càrrega d'una planta amb separadors.

## Fora d'abast (YAGNI)

- Cap efecte sobre seients, circulació, pathfinding o agents (només visual).
- Cap concepte de "zona" amb nom o identitat lògica.
- Cap eina d'arrossegar per traçar trams llargs (es posen costat a costat).
- Cap renderitzat de separador a alçada de paret completa.
