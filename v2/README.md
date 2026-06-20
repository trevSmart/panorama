# Panorama v2 — UI React + TypeScript

Reescriptura de la interfície de Panorama amb **React + TypeScript + Vite**. Neix per
resoldre el problema de la v1: en cada cicle de _polling_ la UI reescrivia seccions senceres
amb `element.innerHTML = …`, destruint i recreant el DOM. Això **perdia la posició de
l'scroll** i provocava **flickering**. React reconcilia el DOM en lloc de reescriure'l, de
manera que els nodes no canviats es conserven — scroll intacte i sense parpelleig.

## Paquet autònom

`v2/` és **autocontingut**: no importa res de fora de `v2/`.
- La capa agnòstica del framework (dades, providers, auth, config, building-render, floor-editor,
  etc.) està **vendoritzada** a `src/lib/` i s'importa via l'àlies `@core` → `./src/lib`.
- Els assets en temps d'execució (logo, fons de plantes, sprites SLDS) viuen a `public/` i
  s'empaqueten dins `dist/`.
- Porta el **seu propi servidor** ([server.js](server.js) + [server/](server/)) que serveix
  `dist/` i les rutes `/api` (config, OAuth token, proxy de fotos).

## Com s'arrenca

### Amb dades de Salesforce (recomanat) — servidor propi a :3000

L'OAuth de Salesforce té el `redirect_uri` fixat a `http://localhost:3000/oauth/callback`
(registrat a l'ECA). Per això la v2 s'ha de servir des del **mateix origen :3000** — així
comparteix la sessió OAuth i el CORS. El servidor propi de la v2 ho fa:

```bash
cd v2
npm install
npm run serve     # build + servidor propi a :3000 servint dist/ i /api
```

Obre **http://localhost:3000/**. Si tens sessió de Salesforce farà servir dades reals; si no, et
portarà al login OAuth. El `.env` (amb `SF_CLIENT_ID`, etc.) es busca a `v2/.env` i, si no hi és,
a l'arrel del repo.

> Per què no :5173? El dev server de Vite és un **origen diferent** del `redirect_uri` (:3000),
> així que la sessió OAuth guardada a :3000 no és accessible des de :5173 i la v2 cau a mock. Per
> a Salesforce cal :3000 (el servidor propi).

### Només UI / dades simulades — Vite a :5173

```bash
cd v2 && npm install && npm run dev   # Vite :5173 (autocontingut, no cal el server de :3000)
```

Obre **http://localhost:5173/?source=mock** (mode simulació). Per a `/api` real (config/OAuth)
Vite fa proxy a un servidor a :3000 — però per a mock no cal.

> L'`localStorage` és per-origen. L'interval de refresc del mock per defecte és 30 s.

## Arquitectura

| Capa | On | Notes |
|------|----|-------|
| Dades / providers / auth / config | **reutilitzat** de `../src` via alias `@core` | `data/`, `auth/`, `config.js`, `settings/`, `building-render.js` — agnòstics del framework, sense duplicar |
| Store reactiu | `src/store/panoramaStore.ts` + `hooks.ts` | Unifica `provider.subscribe` (Salesforce) i `startSimulation` (mock) en un únic senyal via `useSyncExternalStore`. **És el cor del fix.** |
| Bootstrap | `src/core/bootstrap.ts` | Port de `src/app.js`: config + OAuth + `installDataLayer`, abans de muntar React |
| Lògica de salut | `src/core/health.ts` | Port pur de `health()` / verdict / pillars |
| Render de targetes | `src/render/cardHtml.ts` | Reutilitza els helpers de `@core/ui/sf-icons`, `duration`, `agent-photos` per a fidelitat visual 1:1 |
| Vistes | `src/views/` | Operations, Agents, Queues, Skills, Work |
| Detall | `src/detail/DetailDrawer.tsx` | Drawer per a agent / cua / skill |
| Estils | `src/styles/app.css` | Extret del `<style>` inline de `../index.html` (mateixos noms de classe) |

### Per què es preserva l'scroll

Cada targeta es renderitza amb `key={id}` a nivell de llista. Quan arriben dades noves, React
reconcilia: els nodes amb la mateixa clau es conserven (no es recreen) i només se'n refresca el
contingut intern. Verificat al navegador: amb dades canviant cada 2 s, `scrollTop` es manté i el
mateix node DOM sobreviu entre re-renders.

## Estat

**Fet:**
- Operations (verdict, pillars, sala isomètrica SVG, graella d'agents amb filtres, cues).
- Directoris d'Agents / Cues / Skills / Work amb el **contingut complet de la v1** (les targetes
  de cua inclouen "En espera", "Feina activa" i "Agents assignats").
- **Workspace de pestanyes**: home fixat (Operacions), botó `+` amb catàleg per obrir vistes,
  tancar pestanyes, **reordenar arrossegant**, i persistència (`useWorkspace.ts`, `TabBar.tsx`).
- **Drawer de detall** amb transició d'entrada/sortida; navegació creuada (agent↔cua↔skill) i
  **maximitzar** (obre el detall com a pestanya a pantalla completa).
- Detalls d'agent / cua / skill portats gairebé verbatim de la v1 (`render/v1html.ts`).
- **Cerca global** funcional (agents/cues/skills) amb **registres recents** quan és buida.
- **Menú d'usuari complet**: Panorama Settings, Open Salesforce / Setup (només amb font
  Salesforce), toggle de **Developer mode** (instal·la el panell de consola dev) i Logout.
- **Modal de Settings complet** amb les 6 seccions de la v1 (Connexió, Dades, Aparença,
  Notificacions, Developer, Sobre): selecció de font de dades, estat OAuth, interval/llindars,
  aparença/idioma, notificacions, show-console, info i esborrar dades locals. En desar persisteix
  via `@core/settings/preferences`, reaplica l'interval al provider i gestiona el canvi de font.
- **Floor editor** complet, reutilitzant la implementació vanilla de la v1 muntada
  imperativament (`views/FloorEditorView.tsx`).

**Diferit a la fase 2:**
- Vista 3D interactiva Three.js (`Scene3D`) i tooltips per seient. Ara la sala d'Operations
  mostra el SVG isomètric estàtic via `buildBuildingSVG`.
- Mode no-mock dels detalls (timelines de l'agent, accions reassignar/atendre).

## Desplegament (producció) — pendent, opcional

`npm run build` (a `v2/`) genera `v2/dist/`. Per servir-lo cal decidir l'estratègia per no
trencar la v1 que ja funciona a l'arrel:

- **Opció A:** muntar `v2/dist/` a l'arrel `/` al servidor Node ([../src/index.js](../src/index.js))
  i moure la v1 a un subcamí — manté la `redirectUri` d'OAuth (`/oauth/callback`).
- **Opció B:** servir la v2 sota `/v2` (cal `base: '/v2/'` a `vite.config.ts` i ajustar la
  `redirectUri` d'OAuth a Salesforce).

No s'ha modificat el servidor Node encara, deliberadament, per no arriscar la v1.
