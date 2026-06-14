# Developer mode console — Design

**Data:** 2026-06-15
**Estat:** Aprovat (pendent de revisió de l'usuari)

## Objectiu

Quan el "Developer mode" està actiu (toggle ja existent al menú d'usuari), els
settings mostren una nova secció **"Developer mode"** amb un únic toggle **"Show
console"**. En activar-lo, apareix un panell ancorat a la part inferior de la
pàgina que mostra, en temps real, l'activitat de l'app: tots els `console.*`
existents més logs explícits d'accions clau.

## Flags de localStorage

| Clau | Significat | Per defecte |
|------|-----------|-------------|
| `panorama.developerMode` | Dev mode actiu (ja existeix) | `false` |
| `panorama.console.show` | Dock de consola visible | `false` |
| `panorama.console.height` | Alçada del dock en px | `240` |

### Cadena de visibilitat

- **Dev mode OFF** → secció settings amagada, dock amagat, captura de logs aturada.
- **Dev mode ON** → secció settings visible, captura activa (el buffer s'omple
  encara que el dock estigui tancat). El dock es mostra segons `console.show`.
- En desactivar dev mode amb la consola oberta → es tanca el dock i s'amaga la secció.

## Components

### 1. `src/dev/dev-console.js` — nucli (`devConsole` singleton)

Responsabilitats:

- Buffer FIFO d'entrades amb límit fix (`MAX_ENTRIES = 500`).
- Cada entrada: `{ ts: number, level: 'log'|'info'|'warn'|'error'|'action', text: string }`.
- API pública:
  - `devConsole.log(level, ...args)` — afegeix entrada.
  - `devConsole.info(...args)`, `.warn(...args)`, `.error(...args)`, `.action(...args)` — conveniència.
  - `devConsole.getEntries()` — còpia del buffer.
  - `devConsole.clear()` — buida el buffer i emet `clear`.
  - `devConsole.subscribe(fn)` → retorna funció per desubscriure's. `fn(event)`
    on `event` és `{ type: 'entry', entry }` o `{ type: 'clear' }`.
  - `devConsole.install()` / `devConsole.uninstall()` — intercepta/restaura `console.*`.
  - `devConsole.setCapturing(bool)` — activa/atura la captura segons dev mode.
- **Interceptació de `console.*`**: guarda els mètodes originals, els segueix
  cridant (no perdem la consola del navegador) i reenvia al buffer. Idempotent:
  `install()` cridat dues vegades no fa doble-wrapping (flag intern `installed`).
- **Serialització robusta**: cada argument es converteix a text amb un helper
  que mai llança (objectes via `JSON.stringify` amb fallback a `String(arg)`;
  `Error` → `err.message`). Si el buffer és ple, descarta el més antic.
- Quan la captura està desactivada, `log()` no fa res i els `console.*`
  interceptats només deleguen als originals.

### 2. `src/dev/console-panel.js` — UI del dock

Responsabilitats:

- Renderitza el dock fix a baix, **redimensionable** (arrossegar la vora
  superior) i **col·lapsable**. Mai es renderitza si dev mode està off.
- Empeny el contingut de l'app cap amunt establint
  `document.body.style.setProperty('--dev-console-height', h + 'px')`; el layout
  reserva aquest espai (no overlay). En tancar/col·lapsar, la variable torna a `0`.
- Capçalera: títol "Console", cercador de text, filtres per nivell
  (log/info/warn/error — chips toggle), botó **netejar**, botó **tancar**.
- Cos: una línia per entrada amb `HH:MM:SS` + badge de nivell amb color + text.
  Auto-scroll al final si l'usuari ja és a baix; es respecta l'scroll manual.
- Subscripció a `devConsole`; aplica filtres de nivell + cerca de text en viu.
- Alçada mínima `120px`, màxima `60vh`; es persisteix a `panorama.console.height`.
- API: `consolePanel.show()`, `.hide()`, `.isVisible()`.

### 3. Secció "Developer mode" als settings

- Nova entrada de nav (`data-section="developer"`) i secció
  `#settings-developer` a [index.html](../../../index.html), amagades per defecte.
- Un únic `settings-row` amb toggle `#settingsShowConsole` ("Show console" /
  "Mostra un panell de consola a la part inferior amb l'activitat de l'app").
- L'entrada de nav i la secció es mostren/amaguen segons dev mode en obrir el
  settings i en viu quan canvia el flag.

## Integració

- **Menú d'usuari** ([src/app.js](../../../src/app.js)): el handler existent del
  toggle "Developer mode", a més de persistir `panorama.developerMode`, dispara
  un `CustomEvent('panorama:devmode', { detail: { on } })` a `window`.
- **Settings** ([src/app-main.js](../../../src/app-main.js)): en `open()` mostra/amaga
  la secció segons dev mode; escolta `panorama:devmode`; cableja el toggle
  `#settingsShowConsole` ↔ `panorama.console.show` ↔ `consolePanel.show/hide`.
- **Arrencada** ([src/app-main.js](../../../src/app-main.js) o punt d'entrada): si
  dev mode està actiu a l'inici, `devConsole.install()` + `setCapturing(true)`, i
  si `console.show` està actiu, `consolePanel.show()`.

## Punts d'instrumentació explícits (`devConsole.action`)

La captura de `console.*` cobreix la major part automàticament. A més, logs
explícits a punts d'alt valor ja existents:

- Canvi de vista/secció — [src/workspace-shell.js](../../../src/workspace-shell.js).
- Càrrega de dades del provider — [src/data/salesforce-provider.js](../../../src/data/salesforce-provider.js)
  i [src/data/mock-provider.js](../../../src/data/mock-provider.js).
- Obertura/tancament de panells de detall — [src/ui/detail-panel.js](../../../src/ui/detail-panel.js).

Les crides es fan sempre; `devConsole` les ignora si la captura està desactivada,
així que no cal protegir cada punt amb un `if`.

## Errors i casos límit

- Interceptació idempotent; mai llança si un argument no és serialitzable.
- Buffer amb límit FIFO fix per evitar fuites de memòria.
- El dock no es renderitza ni té cost quan dev mode està off.
- Redimensionat amb límits min/max i alçada persistida.
- `--dev-console-height` torna a `0` quan el dock es tanca/col·lapsa.

## Testing

Framework: `node:test` + `node:assert/strict`, ESM (com la resta de `test/*.test.js`).

`test/dev-console.test.js` cobreix la lògica pura de `devConsole`:

- afegir entrades i nivells de conveniència;
- límit FIFO (descarta el més antic en superar `MAX_ENTRIES`);
- `clear()` buida i emet l'esdeveniment;
- subscripció/desubscripció;
- serialització segura d'objectes, errors i valors no serialitzables;
- `install()` idempotent i `uninstall()` restaura els `console.*` originals;
- `setCapturing(false)` atura l'addició al buffer.

La UI del dock (`console-panel.js`) es verifica manualment executant l'app.

## Fora d'abast (YAGNI)

- Persistència del log entre sessions.
- Exportar/descarregar el log.
- Agrupació o plegat d'entrades repetides.
- Qualsevol comportament del dev mode més enllà de la consola.
