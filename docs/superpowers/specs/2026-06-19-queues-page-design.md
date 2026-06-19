# Pàgina Queues dedicada — Disseny

**Data:** 2026-06-19
**Estat:** Aprovat

## Context i problema

La Home (vista `operations`) mostra una secció de cues (`#sec-queues`) i una
d'agents (`#sec-agents`). Els agents, a més, tenen una **vista dedicada**
(`viewType: 'agents'`, `renderAgentsDirectory`), però les cues no en tenen cap.
Aquesta asimetria es nota també als pillars de la Home: els pillars d'espera,
backlog i SLA estan marcats amb `view: 'queues'`
([src/app-main.js](../../../src/app-main.js) línies 111, 115, 123) però
`'queues'` no està registrat com a panel, de manera que la navegació no porta
enlloc.

Tot el necessari per renderitzar cues ja existeix: l'estat global `queueState`,
`provider.getQueues()` ([src/data/salesforce-provider.js:258](../../../src/data/salesforce-provider.js)),
la targeta `queueCard`, el binding de clicks `attachQueueCardClicks` i el drawer
`openQueueDrawer` / `renderQueueDetail`. La feina és, doncs, afegir una vista de
directori anàloga a la d'agents, reutilitzant aquests components.

## Objectiu

Donar a les cues una vista de directori pròpia (pestanya "Queues"), consistent
amb la vista d'agents, sense canvis al data layer ni a l'API.

## Arquitectura

Segueix exactament el patró de `renderAgentsDirectory`. Tots els canvis són a
[src/app-main.js](../../../src/app-main.js). Cap CSS nou, cap endpoint nou.

### Components

1. **Registre del panel** (després del bloc `agents`, ~línia 1388):

   ```js
   PanoramaWorkspace.registerPanelType({
     viewType: 'queues',
     defaultLabel: 'Queues',
     mount(container) { renderQueuesDirectory(container); },
     activate(container) { renderQueuesDirectory(container); },
   });
   ```

   Apareix automàticament al catàleg (`+`) i fa que els pillars `view: 'queues'`
   de la Home naveguin correctament a aquesta vista.

2. **`renderQueuesDirectory(container)`** — còpia estructural de
   `renderAgentsDirectory`:
   - token de re-entrança (`queueDirectoryToken`) per evitar races,
   - HTML inicial amb `.view` / `.view-head` i loader,
   - barra de filtres + grid,
   - càrrega via `provider.getQueues()` amb fallback a `globalThis.queueState`,
   - gestió d'error idèntica (missatge amb `var(--alert)`).

3. **Filtres d'activitat** — estat local `queueFilter` (`'all'` per defecte) amb
   tres chips reutilitzant el patró `[data-st]` dels filtres d'agents:
   - **Totes** (`all`)
   - **Amb backlog** (`backlog`) → `q.backlog > 0`
   - **Buides** (`empty`) → `q.backlog === 0`

   Clicar un chip actualitza `queueFilter` i re-renderitza només el grid (com
   `updateAgents`).

4. **`queueDirectoryGridHTML(list, filter)`** — aplica el filtre d'activitat,
   ordena per pressió descendent (`backlog / (online*5)`, amb la mateixa fórmula
   que `queueCard`) perquè les cues crítiques quedin a dalt, i mapeja amb el
   **`queueCard` existent** sense modificar-lo. Llista buida → missatge amb
   `var(--faint)`, com a agents.

5. **Clicks** — reutilitza `attachQueueCardClicks(grid)`, que ja delega a
   `openQueueDrawer`. Zero codi nou d'interacció.

### Flux de dades

```
provider.getQueues()  →  queueState  →  filtre d'activitat  →  queueCard  →  drawer (openQueueDrawer)
```

Idèntic al d'agents, només canviant l'entitat.

## Fora d'abast (YAGNI)

- Cap endpoint, normalització ni model nou.
- Cap targeta nova: es reutilitza `queueCard` tal qual.
- Cap canvi al drawer de cua (`renderQueueDetail`).
- Cap CSS nou: `.qgrid`, `.view`, `.view-head` i els chips `[data-st]` ja
  existeixen a [index.html](../../../index.html).

## Testing

Verificació manual:
1. Obrir la pestanya "Queues" des del catàleg (`+`).
2. Comprovar els 3 filtres (Totes / Amb backlog / Buides).
3. Clicar una cua → s'obre el drawer de detall de cua.
4. A la Home, clicar els pillars d'espera/backlog/SLA → naveguen a la vista
   Queues.
