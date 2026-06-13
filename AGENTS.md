# Panorama — Project Guide

## Language

**The entire project must be in English.** This applies to:

- UI copy and labels
- Code (identifiers, comments, error messages)
- Documentation (`AGENTS.md`, README, inline docs)
- Commit messages and PR descriptions
- Agent / AI responses when working on this repo

The current UI prototype (`index.html`) is in Catalan and will be migrated to English as part of the transition to production.

## What is Panorama

**Panorama** is a call center operations supervisor app for **Salesforce Service Cloud with Omni-Channel**. It will replace (and extend) the native **Omni Supervisor** that team leads use to monitor agents, queues, workload, and SLA.

The goal is not a 1:1 copy: first we need to **replicate the minimum functionality** of the native supervisor, then add capabilities the standard product does not cover well (UX, operational visibility, alerts, team map, etc.).

## Current state

| Area | Status |
|------|--------|
| UI / visual concept | Working prototype in `index.html` with mock data |
| Salesforce integration | Not started |
| Backend / APIs | None — static dev server only |
| AppExchange packaging | Not defined yet |

### UI prototype (`index.html`)

Views implemented with mock data:

- **Overview** — live KPIs (wait time, backlog, coverage, SLA, help requests) and isometric team map by floor
- **Operations** — queue and agent lists with presence status filters
- **Work / Skills** — placeholders for the next iteration
- **Agent drawer** — detail, assigned queues, timeline, active work, and actions (flag, reassign, change queues/skills)

The prototype uses fictional data (`AGENTS`, `QUEUES`, `FLOORS`) and a real-time simulator to validate UX before connecting to Salesforce.

### Local development

```bash
npm start   # Node dev server (OAuth + Apex REST proxy) → http://localhost:3000
npm run dev # same server with file watch + browser reload on save
```

`src/index.js` is only a static file server; there is no business logic or Salesforce calls.

## Functional goal (Omni Supervisor parity)

Each native supervisor capability must be mapped to a data source or API. Some features have documented APIs; others will require investigating how Salesforce implements them (reverse engineering, Platform Events, Tooling API, etc.).

### Core features to replicate

| Omni Supervisor capability | Likely direction |
|--------------------------|----------------|
| Agent presence status (online, busy, away, offline) | `UserServicePresence`, `ServicePresenceStatus` |
| Agent workload | `AgentWork` (Status, CapacityWeight, CapacityPercentage) |
| Queues and backlog | `Group` (queues), `PendingServiceRouting`, Omni metrics |
| Change agent status | Omni Supervisor / Presence APIs |
| Reassign work items | AgentWork update / Omni routing APIs |
| Skills and routing | `Skill`, `ServiceResourceSkill`, `SkillRequirement` |
| Real-time updates | Platform Events, Streaming API, or controlled polling |
| SLA / wait time metrics | Reports, custom metrics, or service APIs |

### Extra features (Panorama differentiation)

- Visual team map by floor/team (already in the prototype)
- Proactive alerts and agent help "flags"
- Per-agent activity timeline
- Unified UX and fast agent search
- Work and backlog views by skills (design pending)

## Target architecture (current decision)

**Phase 1 — Standalone SPA + Apex REST.** One product surface: the Panorama UI stays a standalone web app (evolved from `index.html`); Salesforce hosts only the **API layer** (Apex REST). No LWC UI, no hybrid bridge components.

Rationale: validate the product with real data and full UI freedom (dense dashboards, team map) without managing multiple deployment surfaces. If the product is not viable, we stop without sunk cost in a Lightning migration.

**Deferred (not ruled out):** hybrid (SPA + thin in-org LWC bridge for write actions), full LWC, AppExchange packaging.

```
┌─────────────────────────────────────────────────────────┐
│  Panorama SPA (standalone web app)                      │
│  · Overview · Operations · Work · Skills                │
│  · UI knows domain models only — not Salesforce shapes  │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS + OAuth 2.0 PKCE (External Client App)
┌──────────────────────▼──────────────────────────────────┐
│  Apex REST API (`force-app/`)                           │
│  · Aggregates SOQL · Maps to Panorama domain JSON       │
│  · Single deploy unit in Salesforce                     │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│  Salesforce Org (Omni-Channel, Service Cloud)         │
│  AgentWork · UserServicePresence · Groups · Skills · PE │
└─────────────────────────────────────────────────────────┘
```

### Stack decision (important)

| Approach | Phase 1 | Notes |
|----------|---------|-------|
| **Standalone SPA + Apex REST** | **Selected** | Rich UI, one frontend deploy + one SF metadata deploy; read-first |
| **Hybrid SPA + LWC bridge** | Deferred | Best of both worlds for write actions; more deploy surfaces |
| **LWC + Apex (full in-org UI)** | Deferred | AppExchange-friendly; UI constraints for Panorama |
| **Node as production runtime** | Not planned | Dev server only; no business logic in Node |

Node remains a **local static dev server** only (`src/index.js`). Production data access goes through Apex REST, never direct SOQL from the browser.

### Flexibility rules (keep architecture swappable)

The UI must not depend on Salesforce field names, SOQL shapes, or auth mechanics. Use these boundaries:

1. **Domain models** — stable types (`Agent`, `Queue`, `WorkItem`, …) defined in `src/data/`, shared by all views.
2. **DataProvider interface** — UI calls `getAgents()`, `getQueues()`, `subscribe()`, etc. Implementations: `mock` (simulator) and `salesforce` (Apex REST client).
3. **Capability flags** — provider exposes what it can do (`canChangePresence: false` in phase 1). UI disables actions instead of branching on architecture.
4. **Apex maps, UI does not** — REST responses already match domain models; mapping from `UserServicePresence` / `AgentWork` lives in Apex only.
5. **Auth adapter** — separate from DataProvider (`mock` needs none; `salesforce` uses **External Client App** OAuth with PKCE). Swapping auth does not touch views.

### External auth (External Client App)

Panorama uses **External Client Apps (ECA)**, not legacy Connected Apps. New Connected App creation is blocked from Spring '26; ECA is the long-term Salesforce model.

| Item | Choice |
|------|--------|
| App type | External Client App (Local, single org) |
| OAuth flow | Authorization Code + **PKCE** (public SPA — no client secret in browser) |
| Scopes | `api`, `refresh_token`, `offline_access` |
| Access control | ECA is closed by default → Permission Set + App Policies |
| CORS | Setup → CORS: allow SPA origin + enable OAuth endpoints |
| Endpoints | Same as always: `/services/oauth2/authorize`, `/services/oauth2/token`, then Apex REST |

Do **not** use Username-Password OAuth (unsupported on ECA). Do **not** store consumer secret in the SPA or git — only the Consumer Key (`client_id`) in env config.

This lets a later move to hybrid (add an `ActionBridge` provider) or full LWC (replace SPA, keep Apex) without rewriting the domain layer or view logic.

## Salesforce integration — agent guidelines

1. **Always use Salesforce MCP tools** (`IBM Salesforce Context`) for queries, DML, deployments, and org audit. Do not use Salesforce CLI when an MCP equivalent exists.
2. **Discover schema before writing SOQL** — use `describe_object` to confirm field and object API names.
3. **Do not deploy entire metadata folders** — deploy only the minimum required components.
4. **To see what changed in the org**, use `get_setup_audit_trail`, not Git.
5. **Batch operations** when possible (`execute_queries_and_dml`).

### Key objects to investigate

- `AgentWork` — work items assigned to agents
- `UserServicePresence` — current presence
- `ServicePresenceStatus` — available statuses (Online, Busy, etc.)
- `Group` / `GroupMember` — queues and members
- `Skill`, `ServiceResource`, `ServiceResourceSkill` — skills and qualifications
- `PendingServiceRouting` — work pending routing
- Platform Events related to Omni-Channel

## Repository structure (planned)

```
panorama/
├── AGENTS.md              ← this file
├── index.html             ← UI (migrating to use src/data/ providers)
├── assets/                ← logos, images
├── src/
│   ├── index.js           ← static dev server (local only)
│   ├── config.js          ← dataSource: mock | salesforce
│   ├── ui/
│   │   └── sf-icons.js    ← SLDS icon paths + HTML helpers
│   └── data/
│       ├── types.js       ← domain models
│       ├── provider.js    ← DataProvider factory + contract
│       ├── mock-provider.js
│       └── salesforce-provider.js
├── force-app/             ← Salesforce DX (API layer only in phase 1)
│   └── main/default/
│       ├── classes/       ← Panorama REST controllers + services
│       └── permissionsets/
└── docs/
    ├── salesforce-lightning-design-system-icons/  ← SLDS standard + utility icons
    └── (future) Omni feature ↔ API mapping
```

## Development conventions

- **Language:** English everywhere (see Language section above)
- **Minimal changes:** do not refactor outside the scope of the task
- **Prototype vs production:** do not mix mock data with real API calls; mark the transition clearly
- **Security:** respect Omni Supervisor permissions (`Manage Queue Membership`, `View Agent Queue Stats`, etc.)
- **Salesforce visual language:** when the UI references a Salesforce concept (Queue, Case, Skill, Agent/User, Omni channels, work items, etc.), use the **standard SLDS object icons** from `docs/salesforce-lightning-design-system-icons/` — not emoji or unrelated symbols. Use `src/ui/sf-icons.js`, which renders icons via the **standard sprite** (`standard-sprite/svg/symbols.svg` + `<use href="#symbol">`) like `slds-icon_container` / `slds-icon` in Lightning. The SVG fills the colored tile; padding is only what the sprite artwork includes.

| Panorama concept | SLDS icon (`standard/`) |
|------------------|-------------------------|
| Queue | `queue.svg` |
| Skill | `skill.svg` |
| Case / case channel | `case.svg` |
| Voice | `voice_call.svg` |
| Chat | `live_chat.svg` |
| Email | `email.svg` |
| WhatsApp | `whatsapp.svg` |
| User / Agent | `user.svg` |
| Work item (generic) | `work_order.svg` |

## Next steps

1. ~~Extract mock data~~ → done (`src/data/`)
2. ~~Scaffold Apex REST~~ → done (`PanoramaApi`, agents + queues)
3. Wire Operations view to provider refresh (real data re-render)
4. **External Client App** in org + `src/auth/` PKCE flow + Bearer token in `salesforce-provider.js`
5. Permission Set for Panorama supervisors (ECA App Policies)
6. Later: action audit, AppExchange / hybrid / LWC

## Useful references

- [Omni-Channel Supervisor](https://help.salesforce.com/s/articleView?id=service.omnichannel_supervisor.htm) — native documentation
- [Omni-Channel Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.omnichannel_dev.meta/omnichannel_dev/) — APIs and objects
- [AgentWork object](https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_agentwork.htm)
- [UserServicePresence object](https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_userservicepresence.htm)
