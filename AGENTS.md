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
npm start   # static Node server → http://localhost:3000
npm run dev # live-server with hot reload
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

## Target architecture

```
┌─────────────────────────────────────────────────────────┐
│  Panorama UI (LWC or SPA embedded in Lightning)         │
│  · Overview · Operations · Work · Skills                │
└──────────────────────┬──────────────────────────────────┘
                       │ Salesforce APIs (OAuth / Session)
┌──────────────────────▼──────────────────────────────────┐
│  Service layer (Apex +/or approved external middleware) │
│  · Data aggregation · Cache · Real-time subscriptions   │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│  Salesforce Org (Omni-Channel, Service Cloud)         │
│  AgentWork · UserServicePresence · Groups · Skills · PE │
└─────────────────────────────────────────────────────────┘
```

### Stack decision (important)

The current **Node + static HTML** prototype is valid for the **UI concept phase**, but it is **not the final architecture** if the goal is distribution via **Salesforce AppExchange** as a managed package.

| Approach | AppExchange | Notes |
|----------|-------------|-------|
| **LWC + Apex** (Salesforce DX) | Yes — standard path | Frontend inside the org, Apex backend, native APIs |
| **External SPA + Connected App** | Partial — not a classic managed package | Requires own hosting, OAuth, separate security review |
| **Node as production runtime** | Not recommended | AppExchange expects logic to live inside Salesforce or approved services (Heroku, etc.) |

**Recommendation:** keep Node only as a local prototyping tool. When moving to real data, migrate to a **Salesforce DX** project (`force-app/`) with **LWC** for the UI and **Apex** for the service layer. The visual design from the prototype can be ported to LWC component by component.

If an external service is needed (e.g. WebSockets or heavy aggregation), consider **Heroku** or middleware with **Named Credentials** — but that complicates AppExchange Security Review.

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
├── index.html             ← UI prototype (current phase)
├── assets/                ← logos, images
├── src/index.js           ← static dev server
├── force-app/             ← (future) Salesforce DX metadata
│   └── main/default/
│       ├── lwc/           ← Lightning components
│       ├── classes/       ← Apex controllers and services
│       └── permissionsets/
└── docs/                  ← (future) Omni feature ↔ API mapping
```

## Development conventions

- **Language:** English everywhere (see Language section above)
- **Minimal changes:** do not refactor outside the scope of the task
- **Prototype vs production:** do not mix mock data with real API calls; mark the transition clearly
- **Security:** respect Omni Supervisor permissions (`Manage Queue Membership`, `View Agent Queue Stats`, etc.)

## Next steps

1. Inventory native Omni Supervisor features (screen by screen, action by action)
2. For each feature, document whether it has a public API, SOQL, Platform Event, or requires reverse engineering
3. Create a Salesforce DX project and a first LWC that reads real `UserServicePresence` + `AgentWork`
4. Replace prototype mock data with org data, component by component
5. Define AppExchange strategy (managed package 2GP vs external Connected App)

## Useful references

- [Omni-Channel Supervisor](https://help.salesforce.com/s/articleView?id=service.omnichannel_supervisor.htm) — native documentation
- [Omni-Channel Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.omnichannel_dev.meta/omnichannel_dev/) — APIs and objects
- [AgentWork object](https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_agentwork.htm)
- [UserServicePresence object](https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_userservicepresence.htm)
