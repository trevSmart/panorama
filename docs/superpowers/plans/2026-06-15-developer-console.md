# Developer mode console — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quan el Developer mode està actiu, els settings mostren una secció "Developer mode" amb un toggle "Show console" que obre un dock inferior redimensionable mostrant l'activitat de l'app (tots els `console.*` més logs d'accions).

**Architecture:** Un mòdul nucli `devConsole` (singleton, buffer FIFO, intercepció de `console.*`, pub/sub) desacoblat de la UI. Un mòdul `consolePanel` rep esdeveniments i pinta el dock. Settings i menú d'usuari es comuniquen amb tots dos via flags de localStorage i un `CustomEvent('panorama:devmode')`.

**Tech Stack:** ESM vanilla JS, `node:test`/`node:assert` per tests, CSS dins d'`index.html`.

---

## File Structure

- **Create** `src/dev/dev-console.js` — nucli: buffer, intercepció `console.*`, API + pub/sub. Sense DOM.
- **Create** `src/dev/console-panel.js` — UI del dock inferior. Depèn de `dev-console.js`.
- **Create** `test/dev-console.test.js` — tests del nucli.
- **Modify** `index.html` — secció "Developer mode" als settings (nav + secció) + CSS del dock.
- **Modify** `src/app.js` — el toggle del menú dispara `panorama:devmode`.
- **Modify** `src/app-main.js` — cablejat de la secció settings + arrencada del devConsole/panel.
- **Modify** `src/ui/detail-panel.js`, `src/workspace-shell.js`, `src/data/mock-provider.js`, `src/data/salesforce-provider.js` — crides `devConsole.action(...)`.

---

## Task 1: Nucli `devConsole` — buffer i nivells

**Files:**
- Create: `src/dev/dev-console.js`
- Test: `test/dev-console.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/dev-console.test.js
import assert from 'node:assert/strict';
import test from 'node:test';

import { createDevConsole } from '../src/dev/dev-console.js';

test('log adds an entry with level and text', () => {
  const dc = createDevConsole();
  dc.setCapturing(true);
  dc.log('info', 'hola', 42);
  const entries = dc.getEntries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].level, 'info');
  assert.equal(entries[0].text, 'hola 42');
  assert.equal(typeof entries[0].ts, 'number');
});

test('convenience methods set their level', () => {
  const dc = createDevConsole();
  dc.setCapturing(true);
  dc.info('a'); dc.warn('b'); dc.error('c'); dc.action('d');
  assert.deepEqual(dc.getEntries().map(e => e.level), ['info', 'warn', 'error', 'action']);
});

test('does not capture when capturing is off', () => {
  const dc = createDevConsole();
  dc.log('info', 'ignored');
  assert.equal(dc.getEntries().length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/dev-console.test.js`
Expected: FAIL — `createDevConsole` no existeix / mòdul no trobat.

- [ ] **Step 3: Write minimal implementation**

```js
// src/dev/dev-console.js
const MAX_ENTRIES = 500;

function safeText(arg) {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return arg.message;
  try {
    return typeof arg === 'object' && arg !== null ? JSON.stringify(arg) : String(arg);
  } catch {
    return String(arg);
  }
}

export function createDevConsole() {
  const entries = [];
  let capturing = false;

  function log(level, ...args) {
    if (!capturing) return;
    const text = args.map(safeText).join(' ');
    entries.push({ ts: Date.now(), level, text });
    if (entries.length > MAX_ENTRIES) entries.shift();
  }

  return {
    log,
    info: (...a) => log('info', ...a),
    warn: (...a) => log('warn', ...a),
    error: (...a) => log('error', ...a),
    action: (...a) => log('action', ...a),
    getEntries: () => entries.slice(),
    setCapturing: (on) => { capturing = !!on; },
    isCapturing: () => capturing,
  };
}

export const devConsole = createDevConsole();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/dev-console.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/dev/dev-console.js test/dev-console.test.js
git commit -m "feat: devConsole core buffer with levels"
```

---

## Task 2: Nucli — límit FIFO, clear i pub/sub

**Files:**
- Modify: `src/dev/dev-console.js`
- Test: `test/dev-console.test.js`

- [ ] **Step 1: Write the failing test (append to file)**

```js
test('buffer is capped at 500 entries (FIFO)', () => {
  const dc = createDevConsole();
  dc.setCapturing(true);
  for (let i = 0; i < 510; i++) dc.log('log', `m${i}`);
  const entries = dc.getEntries();
  assert.equal(entries.length, 500);
  assert.equal(entries[0].text, 'm10');
  assert.equal(entries[499].text, 'm509');
});

test('clear empties buffer and emits clear event', () => {
  const dc = createDevConsole();
  dc.setCapturing(true);
  dc.log('log', 'x');
  const events = [];
  dc.subscribe((e) => events.push(e));
  dc.clear();
  assert.equal(dc.getEntries().length, 0);
  assert.deepEqual(events, [{ type: 'clear' }]);
});

test('subscribe receives entry events and unsubscribe stops them', () => {
  const dc = createDevConsole();
  dc.setCapturing(true);
  const events = [];
  const off = dc.subscribe((e) => events.push(e));
  dc.log('info', 'one');
  off();
  dc.log('info', 'two');
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'entry');
  assert.equal(events[0].entry.text, 'one');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/dev-console.test.js`
Expected: FAIL — `dc.subscribe`/`dc.clear` no existeixen.

- [ ] **Step 3: Write minimal implementation**

Substitueix el cos de `createDevConsole` per:

```js
export function createDevConsole() {
  const entries = [];
  const subscribers = new Set();
  let capturing = false;

  function emit(event) {
    for (const fn of subscribers) {
      try { fn(event); } catch { /* ignore subscriber errors */ }
    }
  }

  function log(level, ...args) {
    if (!capturing) return;
    const entry = { ts: Date.now(), level, text: args.map(safeText).join(' ') };
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) entries.shift();
    emit({ type: 'entry', entry });
  }

  return {
    log,
    info: (...a) => log('info', ...a),
    warn: (...a) => log('warn', ...a),
    error: (...a) => log('error', ...a),
    action: (...a) => log('action', ...a),
    getEntries: () => entries.slice(),
    clear() { entries.length = 0; emit({ type: 'clear' }); },
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
    setCapturing: (on) => { capturing = !!on; },
    isCapturing: () => capturing,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/dev-console.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/dev/dev-console.js test/dev-console.test.js
git commit -m "feat: devConsole FIFO cap, clear and pub/sub"
```

---

## Task 3: Nucli — intercepció idempotent de `console.*`

**Files:**
- Modify: `src/dev/dev-console.js`
- Test: `test/dev-console.test.js`

- [ ] **Step 1: Write the failing test (append to file)**

```js
test('install captures console.* and still calls originals', () => {
  const calls = [];
  const fakeConsole = {
    log: (...a) => calls.push(['log', ...a]),
    info: (...a) => calls.push(['info', ...a]),
    warn: (...a) => calls.push(['warn', ...a]),
    error: (...a) => calls.push(['error', ...a]),
  };
  const dc = createDevConsole();
  dc.setCapturing(true);
  dc.install(fakeConsole);
  fakeConsole.log('hi');
  fakeConsole.error('boom');
  assert.equal(dc.getEntries().length, 2);
  assert.equal(dc.getEntries()[0].text, 'hi');
  assert.deepEqual(calls, [['log', 'hi'], ['error', 'boom']]);
});

test('install is idempotent (no double-wrapping)', () => {
  const calls = [];
  const fakeConsole = { log: (...a) => calls.push(a), info() {}, warn() {}, error() {} };
  const dc = createDevConsole();
  dc.setCapturing(true);
  dc.install(fakeConsole);
  dc.install(fakeConsole);
  fakeConsole.log('once');
  assert.equal(dc.getEntries().length, 1);
});

test('uninstall restores original console methods', () => {
  const original = () => {};
  const fakeConsole = { log: original, info() {}, warn() {}, error() {} };
  const dc = createDevConsole();
  dc.install(fakeConsole);
  dc.uninstall(fakeConsole);
  assert.equal(fakeConsole.log, original);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/dev-console.test.js`
Expected: FAIL — `dc.install` no existeix.

- [ ] **Step 3: Write minimal implementation**

Dins `createDevConsole`, abans del `return`, afegeix:

```js
  let installed = false;
  let originals = null;
  const LEVELS = ['log', 'info', 'warn', 'error'];

  function install(target = globalThis.console) {
    if (installed || !target) return;
    originals = {};
    for (const level of LEVELS) {
      originals[level] = target[level];
      const orig = target[level];
      target[level] = (...args) => {
        log(level, ...args);
        if (typeof orig === 'function') orig.apply(target, args);
      };
    }
    installed = true;
  }

  function uninstall(target = globalThis.console) {
    if (!installed || !originals || !target) return;
    for (const level of LEVELS) target[level] = originals[level];
    originals = null;
    installed = false;
  }
```

I afegeix `install,` i `uninstall,` a l'objecte retornat.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/dev-console.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/dev/dev-console.js test/dev-console.test.js
git commit -m "feat: devConsole idempotent console.* interception"
```

---

## Task 4: Secció "Developer mode" als settings (HTML + CSS)

**Files:**
- Modify: `index.html` (nav a la zona `~4297`, seccions a la zona `~4482`, CSS a la zona `~696`)

- [ ] **Step 1: Afegir l'entrada de nav** — després del botó nav `data-section="sobre"` (acaba a `index.html:4304`), insereix abans de `</nav>`:

```html
          <button class="settings-nav-item" data-section="developer" id="settingsNavDeveloper" hidden>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
            Developer mode
          </button>
```

- [ ] **Step 2: Afegir la secció de contingut** — després de la secció `#settings-notificacions` (busca el seu `</div>` de tancament de secció) i abans de la secció `#settings-sobre`, insereix:

```html
          <!-- Developer mode -->
          <div class="settings-section" id="settings-developer">
            <div class="settings-group">
              <div class="settings-group-label">Developer mode</div>
              <div class="settings-row">
                <div class="settings-row-label">
                  <strong>Show console</strong>
                  <span>Mostra un panell de consola a la part inferior amb l'activitat de l'app</span>
                </div>
                <label class="settings-toggle">
                  <input type="checkbox" id="settingsShowConsole">
                  <span class="settings-toggle-track"></span>
                </label>
              </div>
            </div>
          </div>
```

- [ ] **Step 3: Afegir el CSS del dock** — després de la regla `.user-menu-item--danger svg { opacity: .7 }` (acaba a `index.html:700`) afegeix:

```css
    .dev-console {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      height: var(--dev-console-height, 240px);
      background: #1a1916;
      color: #e8e6e2;
      display: flex;
      flex-direction: column;
      z-index: 9000;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      box-shadow: 0 -4px 16px rgba(0, 0, 0, .3)
    }

    .dev-console[hidden] { display: none }

    .dev-console-resize {
      height: 6px;
      cursor: ns-resize;
      background: transparent;
      flex-shrink: 0
    }

    .dev-console-resize:hover { background: rgba(255, 255, 255, .1) }

    .dev-console-head {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 8px;
      border-bottom: 1px solid rgba(255, 255, 255, .1);
      flex-shrink: 0
    }

    .dev-console-title { font-weight: 600; margin-right: 4px }

    .dev-console-search {
      background: rgba(255, 255, 255, .08);
      border: none;
      color: inherit;
      border-radius: 4px;
      padding: 3px 6px;
      font: inherit;
      width: 160px
    }

    .dev-console-filter {
      background: rgba(255, 255, 255, .08);
      border: none;
      color: inherit;
      border-radius: 4px;
      padding: 3px 7px;
      cursor: pointer;
      font: inherit;
      opacity: .5
    }

    .dev-console-filter[aria-pressed="true"] { opacity: 1; background: rgba(255, 255, 255, .2) }

    .dev-console-btn {
      margin-left: auto;
      background: none;
      border: none;
      color: inherit;
      cursor: pointer;
      padding: 3px 7px;
      border-radius: 4px
    }

    .dev-console-btn:hover { background: rgba(255, 255, 255, .12) }

    .dev-console-body {
      flex: 1;
      overflow-y: auto;
      padding: 4px 8px
    }

    .dev-console-line { display: flex; gap: 8px; padding: 1px 0; white-space: pre-wrap; word-break: break-word }
    .dev-console-ts { color: #6b6862; flex-shrink: 0 }
    .dev-console-level { flex-shrink: 0; width: 48px; text-transform: uppercase; font-size: 10px }
    .dev-console-level--log { color: #9aa0a6 }
    .dev-console-level--info { color: #6cb6ff }
    .dev-console-level--warn { color: #f0b429 }
    .dev-console-level--error { color: #ff6b6b }
    .dev-console-level--action { color: #7ee787 }
```

- [ ] **Step 4: Verify visualment** — obre `index.html` a l'app (Task 9 ho cobrirà del tot); de moment només cal que no trenqui res. Comprova que el settings encara obre.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: developer mode settings section and console dock styles"
```

---

## Task 5: UI `consolePanel` — dock bàsic (render + subscripció)

**Files:**
- Create: `src/dev/console-panel.js`

> Nota: la lògica del dock és DOM-pesada i es verifica manualment (Task 9), no amb tests unitaris.

- [ ] **Step 1: Crear el mòdul amb render bàsic**

```js
// src/dev/console-panel.js
import { devConsole } from './dev-console.js';

const HEIGHT_KEY = 'panorama.console.height';
const LEVELS = ['log', 'info', 'warn', 'error', 'action'];

function fmtTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function createPanel() {
  let root = null;
  let bodyEl = null;
  let searchEl = null;
  let unsubscribe = null;
  const activeLevels = new Set(LEVELS);

  function passesFilter(entry) {
    if (!activeLevels.has(entry.level)) return false;
    const q = (searchEl?.value || '').toLowerCase();
    return !q || entry.text.toLowerCase().includes(q);
  }

  function appendLine(entry) {
    if (!bodyEl || !passesFilter(entry)) return;
    const atBottom = bodyEl.scrollTop + bodyEl.clientHeight >= bodyEl.scrollHeight - 8;
    const line = document.createElement('div');
    line.className = 'dev-console-line';
    line.innerHTML =
      `<span class="dev-console-ts">${fmtTime(entry.ts)}</span>` +
      `<span class="dev-console-level dev-console-level--${entry.level}">${entry.level}</span>` +
      `<span class="dev-console-msg"></span>`;
    line.querySelector('.dev-console-msg').textContent = entry.text;
    bodyEl.appendChild(line);
    if (atBottom) bodyEl.scrollTop = bodyEl.scrollHeight;
  }

  function rerender() {
    if (!bodyEl) return;
    bodyEl.replaceChildren();
    for (const entry of devConsole.getEntries()) appendLine(entry);
  }

  function build() {
    if (root) return;
    const savedHeight = Number(localStorage.getItem(HEIGHT_KEY)) || 240;
    document.body.style.setProperty('--dev-console-height', savedHeight + 'px');

    root = document.createElement('div');
    root.className = 'dev-console';
    root.innerHTML = `
      <div class="dev-console-resize"></div>
      <div class="dev-console-head">
        <span class="dev-console-title">Console</span>
        <input class="dev-console-search" type="text" placeholder="Filtra…">
        ${LEVELS.map(l => `<button class="dev-console-filter" data-level="${l}" aria-pressed="true">${l}</button>`).join('')}
        <button class="dev-console-btn" data-action="clear">Neteja</button>
        <button class="dev-console-btn" data-action="close">✕</button>
      </div>
      <div class="dev-console-body"></div>`;
    document.body.appendChild(root);

    bodyEl = root.querySelector('.dev-console-body');
    searchEl = root.querySelector('.dev-console-search');

    searchEl.addEventListener('input', rerender);
    root.querySelectorAll('.dev-console-filter').forEach((btn) => {
      btn.addEventListener('click', () => {
        const lvl = btn.dataset.level;
        if (activeLevels.has(lvl)) { activeLevels.delete(lvl); btn.setAttribute('aria-pressed', 'false'); }
        else { activeLevels.add(lvl); btn.setAttribute('aria-pressed', 'true'); }
        rerender();
      });
    });
    root.querySelector('[data-action="clear"]').addEventListener('click', () => devConsole.clear());
    root.querySelector('[data-action="close"]').addEventListener('click', () => hide());

    attachResize(root.querySelector('.dev-console-resize'), savedHeight);

    unsubscribe = devConsole.subscribe((e) => {
      if (e.type === 'clear') rerender();
      else appendLine(e.entry);
    });
  }

  function attachResize(handle, initial) {
    let startY = 0;
    let startH = initial;
    const onMove = (e) => {
      const h = Math.min(window.innerHeight * 0.6, Math.max(120, startH + (startY - e.clientY)));
      document.body.style.setProperty('--dev-console-height', h + 'px');
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const cur = getComputedStyle(document.body).getPropertyValue('--dev-console-height').trim();
      localStorage.setItem(HEIGHT_KEY, parseInt(cur, 10) || 240);
    };
    handle.addEventListener('mousedown', (e) => {
      startY = e.clientY;
      startH = parseInt(getComputedStyle(document.body).getPropertyValue('--dev-console-height'), 10) || 240;
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      e.preventDefault();
    });
  }

  function show() {
    build();
    root.hidden = false;
    const h = Number(localStorage.getItem(HEIGHT_KEY)) || 240;
    document.body.style.setProperty('--dev-console-height', h + 'px');
    rerender();
  }

  function hide() {
    if (root) root.hidden = true;
    document.body.style.setProperty('--dev-console-height', '0px');
    try { localStorage.setItem('panorama.console.show', 'false'); } catch { /* ignore */ }
    const cb = document.getElementById('settingsShowConsole');
    if (cb) cb.checked = false;
  }

  return { show, hide, isVisible: () => !!root && !root.hidden };
}

export const consolePanel = createPanel();
```

- [ ] **Step 2: Verify import** — comprova que el mòdul carrega sense errors de sintaxi:

Run: `node --check src/dev/console-panel.js`
Expected: sense sortida (OK). (Les referències a `document`/`window` no s'executen en `--check`.)

- [ ] **Step 3: Commit**

```bash
git add src/dev/console-panel.js
git commit -m "feat: console dock panel UI with filters, search and resize"
```

---

## Task 6: Menú d'usuari dispara `panorama:devmode`

**Files:**
- Modify: `src/app.js` (handler del toggle dev mode, ~`src/app.js:140-155`)

- [ ] **Step 1: Modificar el handler** — dins el bloc `if (devModeItem) { … }`, al callback del `click`, després d'`applyDevMode(next);` afegeix:

```js
      window.dispatchEvent(new CustomEvent('panorama:devmode', { detail: { on: next } }));
```

- [ ] **Step 2: Verify syntax**

Run: `node --check src/app.js`
Expected: sense sortida (OK).

- [ ] **Step 3: Commit**

```bash
git add src/app.js
git commit -m "feat: user menu dev mode toggle dispatches panorama:devmode event"
```

---

## Task 7: Cablejat als settings + arrencada (app-main.js)

**Files:**
- Modify: `src/app-main.js`

- [ ] **Step 1: Importar mòduls dev** — a la zona d'imports superior d'`app-main.js`, afegeix:

```js
import { devConsole } from './dev/dev-console.js';
import { consolePanel } from './dev/console-panel.js';
```

- [ ] **Step 2: Afegir helpers de visibilitat** — abans de `SettingsModal.init(...)` (`src/app-main.js:1953`), afegeix:

```js
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
```

- [ ] **Step 3: Cablejar el toggle "Show console"** — dins `SettingsModal.init`, just abans de `Panorama.openSettings = …` (`src/app-main.js:1948`), afegeix:

```js
    const showConsoleCb = document.getElementById('settingsShowConsole');
    if (showConsoleCb) {
      showConsoleCb.addEventListener('change', () => {
        const on = showConsoleCb.checked;
        try { localStorage.setItem('panorama.console.show', on ? 'true' : 'false'); } catch { /* ignore */ }
        if (on) consolePanel.show(); else consolePanel.hide();
      });
    }
```

- [ ] **Step 4: Reflectir estat en obrir settings** — dins `open(runtimeConfig)` (`src/app-main.js:1824`), després de `this._populate(runtimeConfig);` afegeix:

```js
    applyDevModeToSettings(isDevModeOn());
    const showConsoleCb = document.getElementById('settingsShowConsole');
    if (showConsoleCb) showConsoleCb.checked = localStorage.getItem('panorama.console.show') === 'true';
```

- [ ] **Step 5: Verify syntax**

Run: `node --check src/app-main.js`
Expected: sense sortida (OK).

- [ ] **Step 6: Commit**

```bash
git add src/app-main.js
git commit -m "feat: wire dev console settings toggle and boot on startup"
```

---

## Task 8: Logs d'accions explícits

**Files:**
- Modify: `src/ui/detail-panel.js`, `src/workspace-shell.js`, `src/data/mock-provider.js`, `src/data/salesforce-provider.js`

- [ ] **Step 1: detail-panel** — a `src/ui/detail-panel.js`, afegeix l'import al capdamunt:

```js
import { devConsole } from '../dev/dev-console.js';
```

Dins `openDetailDrawer(config)` (`src/ui/detail-panel.js:97`), després de `recordDetailOpen(config);` afegeix:

```js
  devConsole.action('detail:open', config?.kind, config?.id ?? '');
```

I dins `closeDetailDrawer()` (`src/ui/detail-panel.js:109`), després de la primera línia, afegeix:

```js
  devConsole.action('detail:close');
```

- [ ] **Step 2: workspace-shell (canvi de vista)** — a `src/workspace-shell.js`, afegeix l'import:

```js
import { devConsole } from './dev/dev-console.js';
```

Localitza el mètode/funció que activa una vista (cerca on s'usa `data-view` o l'`adapter.activeViewType`). Afegeix una crida al punt on una vista passa a ser activa:

```js
  devConsole.action('view:switch', viewType);
```

> Si el nom de la variable de la vista no és `viewType`, usa la variable local existent que conté l'identificador de la vista activada.

- [ ] **Step 3: providers** — a `src/data/mock-provider.js` i `src/data/salesforce-provider.js`, afegeix l'import:

```js
import { devConsole } from './dev/dev-console.js';
```

A cada provider, a la funció principal de càrrega de dades (la que retorna el snapshot del centre), afegeix al començament:

```js
  devConsole.action('data:load', 'mock'); // a salesforce-provider.js usa 'salesforce'
```

> Posa la crida a la funció exportada de càrrega principal. Si n'hi ha diverses, instrumenta la d'entrada (la que la resta de l'app crida per refrescar dades).

- [ ] **Step 4: Verify syntax dels quatre fitxers**

Run: `node --check src/ui/detail-panel.js && node --check src/workspace-shell.js && node --check src/data/mock-provider.js && node --check src/data/salesforce-provider.js`
Expected: sense sortida (OK).

- [ ] **Step 5: Run full test suite** (cap test no s'ha de trencar)

Run: `npm test`
Expected: tots els tests passen, inclosos els 9 de `dev-console.test.js`.

- [ ] **Step 6: Commit**

```bash
git add src/ui/detail-panel.js src/workspace-shell.js src/data/mock-provider.js src/data/salesforce-provider.js
git commit -m "feat: log key app actions to dev console"
```

---

## Task 9: Verificació manual end-to-end

**Files:** cap (verificació)

- [ ] **Step 1: Arrencar l'app**

Run: `npm start`
Obre la URL que mostri al navegador.

- [ ] **Step 2: Activar dev mode** — avatar → menú d'usuari → toggle "Developer mode" ON. Verifica que el toggle s'omple amb el color d'accent.

- [ ] **Step 3: Obrir settings** — menú d'usuari → "Panorama Settings". Verifica que apareix l'entrada de nav **"Developer mode"** i que conté el toggle "Show console".

- [ ] **Step 4: Activar la consola** — toggle "Show console" ON. Verifica que apareix el dock a baix i que el contingut de l'app es desplaça cap amunt (no queda tapat).

- [ ] **Step 5: Generar activitat** — navega entre vistes, obre un detall d'agent/sala. Verifica que apareixen línies amb `HH:MM:SS` + nivell + text (p.ex. `view:switch`, `detail:open`, `data:load`).

- [ ] **Step 6: Provar filtres i cerca** — desactiva el filtre "action", escriu text al cercador. Verifica que la llista es filtra. Prova "Neteja" (buida) i redimensiona arrossegant la vora superior.

- [ ] **Step 7: Persistència** — recarrega la pàgina amb dev mode + console ON. Verifica que el dock reapareix automàticament amb l'alçada desada.

- [ ] **Step 8: Desactivar dev mode** — menú d'usuari → "Developer mode" OFF. Verifica que el dock es tanca i que la secció settings "Developer mode" desapareix.

- [ ] **Step 9: Commit final** (si calgués qualsevol ajust durant la verificació)

```bash
git add -A
git commit -m "fix: dev console verification adjustments"
```

---

## Self-Review notes

- **Cobertura del spec:** buffer FIFO (T1-T2), `console.*` idempotent (T3), pub/sub (T2), secció settings + toggle (T4, T7), dock redimensionable no-overlay amb timestamp/nivell/filtres/cerca (T4-T5), 3 flags localStorage (T5, T7), `CustomEvent('panorama:devmode')` (T6-T7), arrencada (T7), logs d'accions (T8), tests `node:test` (T1-T3), verificació manual de la UI (T9).
- **Noms consistents:** `devConsole` / `consolePanel`, mètodes `log/info/warn/error/action/getEntries/clear/subscribe/install/uninstall/setCapturing/isCapturing`, `show/hide/isVisible`. Flags: `panorama.developerMode`, `panorama.console.show`, `panorama.console.height`.
- **Punts a confirmar durant l'execució (T8):** el nom exacte de la variable de vista a `workspace-shell.js` i la funció de càrrega principal de cada provider — el pla indica com identificar-los.
