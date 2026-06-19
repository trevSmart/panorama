# Pàgina Queues dedicada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afegir una vista de directori dedicada per a cues (pestanya "Queues"), anàloga a la d'agents, reutilitzant els components de cua existents.

**Architecture:** Es registra un nou `viewType: 'queues'` al workspace i s'afegeix `renderQueuesDirectory(container)` seguint el patró exacte de `renderAgentsDirectory`. Es reutilitzen `queueCard`, `attachQueueCardClicks` i `provider.getQueues()`. S'afegeix una barra de filtres d'activitat (Totes / Amb backlog / Buides) amb el mateix patró de chips `[data-st]` dels filtres d'agents. Cap canvi al data layer, API ni CSS.

**Tech Stack:** JavaScript vanilla (script global de browser, sense mòduls), Node.js HTTP server.

## Global Constraints

- `src/app-main.js` és un script global carregat via `<script>`: **no** té `module.exports` ni `import/export`. Les funcions noves són funcions globals dins el fitxer, no exportades.
- Reutilitzar components existents; no duplicar `queueCard` ni crear CSS nou.
- Idioma de la UI: català (etiquetes visibles), seguint la convenció ja present (`queueCard` mostra "Backlog", "Espera màx", "Espera mitj.").
- Verificació manual al navegador (com agents/skills directory): aquestes vistes de directori no tenen tests unitaris perquè les funcions de render no són importables.

---

### Task 1: Vista de directori de cues amb filtres d'activitat

**Files:**
- Modify: `src/app-main.js` — afegir funcions de render a la secció "Queues view" (després de la línia 594) i registrar el panel (després de la línia 1388).

**Interfaces:**
- Consumes (ja existents al fitxer):
  - `queueCard(q)` → string HTML d'una targeta de cua (usa `.qcard[data-id]`).
  - `attachQueueCardClicks(container)` → enllaça clicks/teclat de `.qcard[data-id]` a `openQueueDrawer`.
  - `globalThis.PanoramaProvider.getQueues()` → `Array<Queue>` (síncron; retorna `queueState`).
  - `globalThis.queueState` → `Array<Queue>` (fallback).
  - `PanoramaWorkspace.registerPanelType({...})`.
  - Estructura `Queue`: `{ id, name, backlog, longest, avg, online }`.
- Produces:
  - `renderQueuesDirectory(container)` → render asíncron de la vista.
  - `queueDirectoryGridHTML(list, filter)` → string HTML del grid filtrat i ordenat.
  - Panel `viewType: 'queues'` amb `defaultLabel: 'Queues'`.

- [ ] **Step 1: Afegir les funcions de render de la vista de cues**

A `src/app-main.js`, localitzar la secció:

```js
/* ───────── Queues view ───────── */
function pColor(p) { return p < .5 ? 'var(--ok)' : p < .8 ? 'var(--watch)' : 'var(--alert)'; }
```

Afegir, **just després** de la línia de `pColor`, dins la mateixa secció:

```js
let queueFilter = 'all';
const QUEUE_FILTERS = [
  { id: 'all', lbl: 'Totes' },
  { id: 'backlog', lbl: 'Amb backlog' },
  { id: 'empty', lbl: 'Buides' },
];
function queueMatchesFilter(q, filter) {
  if (filter === 'backlog') return (q.backlog || 0) > 0;
  if (filter === 'empty') return (q.backlog || 0) === 0;
  return true;
}
function queuePressure(q) {
  const cap = q.online * 5 || 1;
  return Math.min(1, (q.backlog || 0) / cap);
}
function queueDirectoryGridHTML(list, filter) {
  const filtered = (list || []).filter((q) => queueMatchesFilter(q, filter));
  if (!filtered.length) return '<p style="color:var(--faint)">Cap cua coincideix.</p>';
  const sorted = filtered.slice().sort((a, b) => queuePressure(b) - queuePressure(a) || a.name.localeCompare(b.name));
  return sorted.map(queueCard).join('');
}
function queueFiltersHTML() {
  return QUEUE_FILTERS.map((f) =>
    `<button type="button" class="chip${f.id === queueFilter ? ' on' : ''}" data-st="${f.id}">${f.lbl}</button>`
  ).join('');
}
let queueDirectoryToken = 0;
async function renderQueuesDirectory(container) {
  const token = ++queueDirectoryToken;
  container.innerHTML = `<div class="view">
    <div class="view-head"><h2>Queues</h2><p>Totes les cues d'Omni-Channel i la seva pressió actual.</p></div>
    <div class="chips" id="queuesFilters">${queueFiltersHTML()}</div>
    <div class="qgrid" id="queuesDirGrid"><p style="color:var(--faint)">Carregant cues…</p></div>
  </div>`;
  const grid = container.querySelector('#queuesDirGrid');
  const filters = container.querySelector('#queuesFilters');
  try {
    const provider = globalThis.PanoramaProvider;
    const list = provider?.getQueues
      ? await provider.getQueues()
      : (globalThis.queueState || []);
    if (token !== queueDirectoryToken) return; // un render més nou l'ha substituït
    grid.innerHTML = queueDirectoryGridHTML(list || [], queueFilter);
    attachQueueCardClicks(grid);
    filters.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-st]');
      if (!btn) return;
      queueFilter = btn.dataset.st;
      filters.querySelectorAll('[data-st]').forEach((b) => b.classList.toggle('on', b.dataset.st === queueFilter));
      grid.innerHTML = queueDirectoryGridHTML(list || [], queueFilter);
      attachQueueCardClicks(grid);
    });
  } catch (err) {
    if (token !== queueDirectoryToken) return;
    console.warn('[Panorama] failed to load queues directory', err);
    grid.innerHTML = `<p style="color:var(--alert)">No s'han pogut carregar les cues: ${err.message}</p>`;
  }
}
```

Nota sobre `attachQueueCardClicks`: usa un guard `container.dataset.queueClicks` per no enllaçar dues vegades, per tant tornar-lo a cridar després de reescriure el grid és segur i idempotent.

Nota sobre les classes: els filtres d'agents (a `renderDetail`, ~línia 245-248) usen contenidor `.chips` amb botons `.chip` i la classe activa `.on`, tot definit a `index.html` (~línia 1433-1463). Es reutilitzen exactament aquestes classes, per tant no cal CSS nou.

- [ ] **Step 2: Registrar el panel `queues`**

A `src/app-main.js`, localitzar el bloc de registre del panel `agents`:

```js
PanoramaWorkspace.registerPanelType({
  viewType: 'agents',
  defaultLabel: 'Agents',
  mount(container) { renderAgentsDirectory(container); },
  activate(container) { renderAgentsDirectory(container); },
});
```

Afegir **just després** d'aquest bloc:

```js
PanoramaWorkspace.registerPanelType({
  viewType: 'queues',
  defaultLabel: 'Queues',
  mount(container) { renderQueuesDirectory(container); },
  activate(container) { renderQueuesDirectory(container); },
});
```

- [ ] **Step 3: Verificar que la suite de tests existent segueix passant**

Run: `npm test`
Expected: PASS (cap test nou; es confirma que el canvi no trenca res — sintaxi vàlida, etc.).

- [ ] **Step 4: Verificació manual al navegador**

Run: `npm run dev` (servidor a http://localhost:3000)

Comprovar:
1. Obrir el catàleg de vistes (botó `+` a la barra de pestanyes) → hi apareix "Queues". Obrir-la.
2. Es mostra el grid de cues amb les targetes `queueCard` (nom, online, barra de pressió, backlog/espera màx/espera mitj.).
3. Els 3 filtres funcionen: **Totes** mostra totes; **Amb backlog** amaga les de backlog 0; **Buides** mostra només les de backlog 0. El chip actiu queda ressaltat (`.on`).
4. Les cues surten ordenades de més a menys pressió.
5. Clicar una cua → s'obre el drawer de detall de cua (`renderQueueDetail`).
6. (Aclariment) Els pillars d'espera/backlog/SLA de la Home fan `Panorama.scrollTo('queues')` → scroll a `#sec-queues` dins la Home, NO obren la pestanya Queues. Aquest comportament no canvia amb aquesta feina.

- [ ] **Step 5: Commit**

```bash
git add src/app-main.js
git commit -m "feat(ui): dedicated Queues directory page with activity filters"
```

---

## Self-Review

- **Spec coverage:**
  - Registre del panel `queues` → Step 2. ✓
  - `renderQueuesDirectory` amb token de re-entrança, loader, fallback, error → Step 1. ✓
  - Filtres d'activitat Totes / Amb backlog / Buides amb patró `[data-st]` → Step 1 (`QUEUE_FILTERS`, `queueMatchesFilter`, `queueFiltersHTML`, listener). ✓
  - `queueDirectoryGridHTML` filtra + ordena per pressió + reutilitza `queueCard` → Step 1. ✓
  - Clicks via `attachQueueCardClicks` → Step 1. ✓
  - Pillars `view: 'queues'` de la Home: són àncores de scroll (`Panorama.scrollTo`), no navegació de pestanya — comportament inalterat per aquesta feina (premissa inicial corregida). ✓
  - Sense endpoint/CSS/targeta nous → respectat. ✓
- **Placeholder scan:** cap TBD/TODO; tot el codi és complet i literal. ✓
- **Type consistency:** `queueFilter` (string), `queuePressure(q)→number`, `queueMatchesFilter(q,filter)→bool`, `queueDirectoryGridHTML(list,filter)→string`, `renderQueuesDirectory(container)→Promise`. Noms coherents entre passos. `Queue` usa `{id,name,backlog,longest,avg,online}` consistent amb `queueCard`. ✓
