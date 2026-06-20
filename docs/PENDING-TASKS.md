# Panorama — Pending Tasks (Omni Supervisor Parity)

This file tracks **native Omni Supervisor functionality** that Panorama must replicate before adding differentiation features (team map, alerts UX, etc.).

**Reference:** [Omni Supervisor (Salesforce Help PDF)](https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/omnichannel_supervisor.pdf)

**Status legend**

| Status | Meaning |
|--------|---------|
| `[ ]` | Not started |
| `[~]` | Partial (mock UI, scaffold, or incomplete API) |
| `[x]` | Done for parity scope |

**Current baseline (for context)**

| Area | Status |
|------|--------|
| Mock UI prototype | `[~]` Overview, Operations (agents + queues), Work/Skills placeholders, agent drawer |
| Apex REST | `[~]` `GET /agents`, `GET /queues` only |
| OAuth / ECA | `[~]` Client-side PKCE scaffold; org setup pending |
| Write actions | `[ ]` All disabled in live mode (`READ_ONLY_CAPABILITIES`) |

---

## 1. Agents tab

Native Omni Supervisor has **All Agents** and **Agents by Queue** views, plus agent drill-down.

### 1.1 All Agents — list view

- [ ] **Agent list** — all agents logged into Omni-Channel (respect Supervisor Configuration scope)
  - Likely: `UserServicePresence` (`IsCurrentState = true`)
  - Panorama: `[~]` partial via `GET /agents` (name, status, capacity, login time, photo)

- [ ] **Presence status** — Online, Busy, Away, Offline (org-defined `ServicePresenceStatus`)
  - Likely: `UserServicePresence`, `ServicePresenceStatus`
  - Panorama: `[~]` mapped in Apex; no offline agents yet

- [ ] **Flag indicator** — agent-raised help flag or conversation-intelligence alert
  - Likely: Omni flag API / Platform Events / Einstein Conversation Insights
  - Panorama: `[~]` mock only in UI

- [ ] **Change presence status** (Action column) — force status while agent is not offline
  - Likely: Omni Supervisor presence API / `UserServicePresence` update
  - Panorama: `[ ]` capability flag exists; not wired
  - ⚠️ **Verified not viable from backend (2026-06-19):** `UserServicePresence` is not
    insertable. `sforce.console.presence.setServicePresenceStatus` is Console JS
    (Integration Toolkit) — runs in-browser inside a Salesforce Console and sets the
    agent's **own** presence, not a third party's from an external app. No supported
    Apex/REST path to force another agent's presence.

- [ ] **Work summary** — assigned + open work popover per agent
  - Likely: `AgentWork` by `UserId`
  - Panorama: `[~]` mock single `work` field on agent

- [ ] **State duration** — time in current presence status
  - Likely: `UserServicePresence.StatusStartDate`
  - Panorama: `[~]` `loginMin` uses status start; separate “state” column missing

- [ ] **Login duration** — entire Omni session until offline / browser close
  - Likely: `UserServicePresence` session fields
  - Panorama: `[ ]`

- [ ] **Time since last accept** — since agent last accepted work (manual or auto-accept)
  - Likely: `AgentWork` max `AcceptDateTime` per user
  - Panorama: `[~]` mock `lastAccept` only

- [ ] **Primary capacity %** — uninterruptible work capacity (green / yellow / red thresholds)
  - Likely: `AgentWork` + presence configuration
  - Panorama: `[ ]`

- [ ] **Interruptible capacity %** — interruptible work capacity with same thresholds
  - Likely: `AgentWork.CapacityWeight`, routing config
  - Panorama: `[ ]`

- [ ] **ACW (After Conversation Work)** — wrap-up time after voice/messaging
  - Likely: `AgentWork` / voice-specific fields
  - Panorama: `[ ]`

- [ ] **Workload** — total assigned + open work size vs configured capacity
  - Likely: `AgentWork`, `PresenceConfig`, routing configuration
  - Panorama: `[~]` simple `used` / `max` count only

- [ ] **Channels** — service channels associated with agent’s online status
  - Likely: `ServiceChannel`, presence config, `UserServicePresence`
  - Panorama: `[~]` mock `chans` only

- [ ] **Assigned queues** — Omni-enabled queues the agent can receive work from
  - Likely: `GroupMember` on queue `Group`s
  - Panorama: `[~]` `queueIds` empty in Apex; mock has names

- [ ] **Skills** — skills assigned to agent (skills-based routing orgs)
  - Likely: `ServiceResource`, `ServiceResourceSkill`, `Skill`
  - Panorama: `[ ]`

- [ ] **Show all offline agents** — optional visibility of offline agents
  - Likely: org setting + query without `IsCurrentState` filter
  - Panorama: `[ ]`

### 1.2 Agents by Queue — coverage view

- [ ] **Queue coverage list** — queues with at least one Online or Away agent
  - Likely: aggregate `GroupMember` + `UserServicePresence`

- [ ] **Total agents per queue**

- [ ] **# / % Online**

- [ ] **# Away**

- [ ] **# / % At capacity**

- [ ] **# / % Idle** (0% capacity consumed)

- [ ] **Average capacity** among online + away agents in queue

### 1.3 Agent drill-down

- [ ] **Agent Detail view** — active work items for selected agent
  - Fields: Type, Details (compact layout), Queue, Skills, INTR, Work Size, Status, Requested / Assigned / Accepted time, Handle Time, Speed to Answer
  - Likely: `AgentWork` + related record

- [ ] **Agent Timeline view** — calendar of status changes and `AgentWork` lifecycle (not record status)
  - Likely: `AgentWork` history + presence change events
  - Panorama: `[~]` mock timeline in drawer only

### 1.4 Agents tab — supervisor actions

- [ ] **Change Queues** — bulk update queue membership for selected agents
  - Permissions: Manage Queue Memberships
  - Panorama: `[ ]`

- [~] **Change Skills** — bulk update skills for selected agents
  - Permissions: Service Resource / ServiceResourceSkill edit
  - Panorama: `[~]` In progress (2026-06-19) — single-agent skill edit via DML on
    `ServiceResourceSkill` (verified create/update/delete all = true). Capability derived
    from real user permissions. See spec
    `docs/superpowers/specs/2026-06-19-editar-skills-capabilities-design.md`. Bulk /
    multi-select deferred.

---

## 2. Queues Backlog tab

Shown when queue-based or external routing is enabled.

### 2.1 Queues Summary view

- [ ] **Queue list** with drill-down to queue detail
  - Likely: `Group` (Type = Queue), Omni metrics
  - Panorama: `[~]` `GET /queues` with backlog / wait times (partial)

- [ ] **Priority** — from routing configuration

- [ ] **Work size** — from routing configuration

- [ ] **Work type** — Salesforce object type (Case, Lead, etc.)

- [ ] **Total waiting** — items waiting for an available agent

- [ ] **Longest wait time**

- [ ] **Average wait time**

### 2.2 Queue Detail view

- [ ] **Work item list** for selected queue
  - Fields: Position, Type, Details, INTR, Wait Time, Requested Time
  - Likely: `PendingServiceRouting`, `AgentWork`, queue membership

- [ ] **Queue configuration context** — available agents, wait times (native drill-down panel)

### 2.3 Queues Backlog — supervisor actions

- [ ] **Assign Agents** — add agents to selected queue(s) without removing other queue assignments
  - Note: voice queues may require group assignment via this tab
  - Panorama: `[ ]`

- [ ] **Reassign work item(s)** — route stuck backlog items to another agent, queue, or skill set
  - Likely: Omni routing / `AgentWork` update / Route Work API
  - Panorama: `[ ]`

---

## 3. Assigned Work tab

Work moving through queues onto agents’ screens.

### 3.1 Work Summary view

- [ ] **Per-queue summary**
  - Fields: Queue, Type, Assigned count, Open count, Average Handle Time (AHT), Average Speed to Answer (ASA)
  - Likely: aggregate `AgentWork` by queue

### 3.2 Work Detail view

- [ ] **Work item list** for selected queue
  - Fields: Type, Details, INTR, Agent, Requested Time, Assigned Time, Handle Time, Speed to Answer
  - Likely: `AgentWork` with related records

### 3.3 Assigned Work — supervisor actions

- [ ] **Reassign in-flight work** — manual override while item is assigned/open (with caution: agent may still have tab open)
  - Panorama: `[ ]`

---

## 4. Skills Backlog tab

Shown when skills-based routing is enabled.

### 4.1 Skills Backlog Summary view

- [ ] **Pending unassigned work list**
  - Fields: Type, Details, INTR, Skills, Priority, Work Size, Wait Time, Requested Time
  - Likely: `PendingServiceRouting`, `SkillRequirement`

### 4.2 Skills view (drill-down)

- [ ] **Filter by one or more skills** — show items requiring any/all selected skills

- [ ] **Skill level required** — e.g. Java (2)

- [ ] **Same detail columns** as summary for filtered set

### 4.3 Skills Backlog — supervisor actions

- [ ] **Transfer work to different skill set** — add/replace skills so routing retargets agents
  - Status becomes Transferred; falls back to backlog if no matching agent
  - Panorama: `[ ]`

- [ ] **Reassign backlog work** — to queue, agent, or skills (same family as queue reassign)
  - Panorama: `[ ]`

---

## 5. Wallboard tab

At-a-glance metrics; scoped by Supervisor Configuration and optional queue/skill filters (AND logic).

### 5.1 Filters and display

- [ ] **Filter by queues and/or skills** (AND logic)

- [ ] **Chart display types** — metric, donut, horizontal bar, vertical bar

### 5.2 Metrics widgets

- [ ] **Agent Capacity** — Available Capacity, Used Capacity

- [ ] **Agent Capacity Status** — At Capacity, Available, Busy, Idle counts

- [ ] **Agent Presence Statuses** — top N statuses + “other” bucket

- [ ] **Agent Work Status (last hour)** — Assigned, Canceled, Closed, Declined, Opened, Push Timeout, Unavailable

- [ ] **Raised Flags** — count of active agent help flags

- [ ] **Wait Time** — Average Wait Time, Longest Wait Time (current backlog)

- [ ] **Work Item Status** — Assigned, In Progress, Waiting counts

- [ ] **Work Performance (last hour)** — After Conversation Time, Average Active Work Time, Average Speed to Answer, Average Work Handle Time

Panorama mapping: `[~]` Overview KPIs in prototype cover a subset (wait, backlog, coverage, SLA, help requests) but are not wired to real metrics.

---

## 6. Cross-cutting UI behavior

### 6.1 Sort and filter

- [ ] **Column sorting** — ascending / descending on all tab grids

- [ ] **Multi-filter** — agents, queues, work types, capacity ranges, wait time thresholds, etc.

- [ ] **Filter persistence** — per view / session (native persists in Lightning)

### 6.1b Salesforce object icon colors

- [ ] **Match SLDS object icon background colors** — the colored tile behind each Salesforce object icon should use the same background color Salesforce assigns natively to that object/icon (the official SLDS standard color), instead of approximate or hardcoded values
  - Likely: align `sfIconColor` / icon background map in [src/ui/sf-icons.js](../src/ui/sf-icons.js) with official SLDS standard-sprite colors
  - Affects: workspace nav tab tiles and object icon tiles (`sfIconTileHtml`, `sldsIconRefTileHtml`)

### 6.2 Real-time updates

- [ ] **Live refresh** — status, assignments, queue depth update within seconds without full page reload
  - Options: Platform Events, Streaming API, CometD, or controlled polling
  - Panorama: `[ ]` `liveUpdates: false` in salesforce provider

### 6.3 Supervisor Configuration scope

- [ ] **Respect supervisor config** — limit visible agents, queues, skills, and enabled actions
  - Likely: `SupervisorConfig` metadata + permission set
  - Panorama: `[ ]` (Phase 1 may use permission set + Apex filtering)

- [ ] **Conditional tabs** — show/hide tabs based on routing mode:
  - Queue-only: Agents, Queues Backlog, Assigned Work (no Skills column)
  - Skills + queue: all tabs
  - External routing: Agents, Queues Backlog, Assigned Work (no Skills column)

- [ ] **Configurable supervisor actions** — org-defined Flow actions on selections (optional parity; org-specific)
  - Note: document as “supported when configured in org”; not required for MVP

---

## 7. Agent support and monitoring (supervisor ↔ agent)

- [ ] **View raised flags** — Flag column on All Agents + Wallboard widget

- [ ] **Preview flag message**

- [ ] **Lower flag** — supervisor or agent clears flag

- [ ] **Monitor session** — open monitoring window for voice/messaging

- [ ] **Whisper messages** — private supervisor ↔ agent messaging (2-way except Chat standard = 1-way)

- [ ] **Conversation intelligence alerts** — keyword/phrase detection surfaced to supervisor
  - Panorama: `[ ]` (may defer if org lacks Conversation Insights)

- [ ] **Supervisor Monitoring for Voice** — voice-specific monitoring (see Salesforce Help: Supervisor Monitoring for Voice)

---

## 8. Capacity and routing edge cases

Parity requires correct display when org uses advanced Omni settings.

- [ ] **Tab-based vs status-based capacity models** — reflect capacity from tabs or work status correctly

- [ ] **ACW impact on capacity** — voice call 100% capacity; freed after ACW period or tab close

- [ ] **Interruptible vs non-interruptible work** — separate capacity calculations

- [ ] **Push timeout** — work declined/reassigned when not accepted in time (Wallboard + routing)

- [ ] **Auto-accept** — reflect in “time since last accept” and Assigned vs Open states

---

## 9. Permissions and security

- [ ] **Omni Supervisor permission set** — gate Panorama access equivalently

- [ ] **Manage Queue Memberships** — for Change Queues / Assign Agents

- [ ] **View Agent Queue Stats** — for queue metrics

- [ ] **Service Resource / Skill edit** — for Change Skills

- [ ] **Record-level access** — reassign and drill-down respect sharing on underlying work records

- [ ] **ECA + Permission Set + App Policies** — External Client App auth for SPA supervisors

---

## 10. API and domain layer (implementation backlog)

Tasks to support the UI parity above through Apex REST + `salesforce-provider.js`.

### 10.1 Read endpoints

- [~] `GET /agents` — extend with channels, queues, skills, capacity breakdown, flags, last accept
- [~] `GET /queues` — extend with priority, work size, type, waiting counts
- [ ] `GET /agents/:id/work` — agent detail work list
- [ ] `GET /agents/:id/timeline` — agent timeline events
- [ ] `GET /agents/by-queue` — Agents by Queue aggregation
- [ ] `GET /work/assigned` — Assigned Work summary + detail
- [ ] `GET /work/skills-backlog` — Skills Backlog summary + skill-filtered view
- [ ] `GET /metrics/wallboard` — wallboard metric bundle with filters
- [ ] `GET /capabilities` — what write actions current user/org supports

### 10.2 Write endpoints (Phase 1+ / hybrid)

- [ ] `GET /capabilities` — derive write capabilities from connected supervisor's object
  CRUD permissions. In progress (2026-06-19, skills only). See
  `docs/superpowers/specs/2026-06-19-editar-skills-capabilities-design.md`.
- [ ] `PATCH /agents/:id/presence` — change presence status
  - ❌ **Not viable from backend (verified 2026-06-19):** `UserServicePresence` not
    insertable; no supported Apex/REST to set another agent's presence (see §1.1).
- [ ] `PUT /agents/queues` — change queue membership (bulk)
  - `GroupMember` verified create+delete (no update). Viable via DML; deferred this round.
- [~] `PUT /agents/:id/skills` — change skills for one agent
  - In progress (2026-06-19). `ServiceResourceSkill` verified create+update+delete = true.
- [ ] `POST /work/reassign` — reassign work items
  - ❌ **Not viable from backend (verified 2026-06-19):** all relevant `AgentWork` fields
    (`UserId`, `Status`, `PendingServiceRoutingId`, `OriginalQueueId`,
    `ServiceChannelId`) are `updateable = false`; no Omni supervisor Apex class exists in
    the org.
- [ ] `POST /work/transfer-skills` — transfer to skill set
- [ ] `POST /flags/:id/lower` — lower agent flag

**Verified org capabilities (2026-06-19)** — via `Schema.getGlobalDescribe()` on the
connected org:

| Object | create | update | delete | Note |
|---|---|---|---|---|
| `ServiceResourceSkill` | ✅ | ✅ | ✅ | skill edit viable |
| `GroupMember` | ✅ | ❌ | ✅ | queue membership viable (no update) |
| `AgentWork` | ✅ | obj=✅ | ✅ | all reassign-relevant **fields** not updateable |
| `UserServicePresence` | ❌ | ✅ | ✅ | not insertable → no force-presence |
| `ServicePresenceStatus` | ❌ | ❌ | ❌ | read-only catalog |
| `ServiceResource` | ✅ | ✅ | ❌ | — |
| `Skill` | ❌ | ❌ | ❌ | read-only catalog |

### 10.3 Frontend integration

- [~] Wire Operations view to provider refresh (real data re-render)
- [ ] Replace mock Work / Skills placeholders with live data
- [ ] Map Overview KPIs to wallboard metrics API
- [ ] Enable actions via `PanoramaCapabilities` when API supports them
- [ ] Migrate UI copy from Catalan to English

---

## 11. Explicitly out of scope (native but not supervisor parity)

These appear in Omni Supervisor docs but are **agent-side** or **admin setup**, not supervisor monitoring parity:

- Omni-Channel component / sidebar (agent inbox UX)
- Omni Inbox mobile app
- Supervisor Configuration admin UI (Setup)
- Custom Omni Supervisor Lightning tabs (App Builder)
- AppExchange packaging

Track separately if Panorama later needs admin or agent surfaces.

---

## 12. Suggested implementation order

1. **Read parity:** agents (full columns) → queues backlog → assigned work → skills backlog → wallboard metrics
2. **Real-time:** polling or streaming for Operations + Overview
3. **Drill-down:** agent detail, queue detail, work detail
4. **Write actions:** presence → queue membership → reassign → skills → flags/monitor
5. **Scope + permissions:** supervisor config filtering, capability flags

---

*Last updated: 2026-06-13 — initial inventory from Salesforce Omni Supervisor (Summer ’25) documentation and current Panorama codebase.*
