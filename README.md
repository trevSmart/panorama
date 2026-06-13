# Panorama

Call center operations supervisor for **Salesforce Service Cloud with Omni-Channel**. Panorama replaces and extends the native **Omni Supervisor** with a standalone web UI — dense dashboards, team map, agent detail, and queue visibility — backed by an Apex REST API in your org.

## What it does

| View | Description |
|------|-------------|
| **Overview** | Live KPIs (wait time, backlog, coverage, SLA, help requests) and isometric team map by floor |
| **Operations** | Queue and agent lists with presence status filters |
| **Work / Skills** | Work and skills views (in progress) |
| **Agent drawer** | Detail, assigned queues, timeline, active work, and supervisor actions |

Phase 1 focuses on **read-only parity** with Omni Supervisor (agents, queues, presence, workload). Write actions (reassign, change status, queue membership) follow in later phases.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Panorama SPA (this repo)                               │
│  · Overview · Operations · Work · Skills                │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS + OAuth 2.0 PKCE (External Client App)
┌──────────────────────▼──────────────────────────────────┐
│  Apex REST API (`force-app/`)                           │
│  `/services/apexrest/panorama/v1/agents|queues`         │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│  Salesforce Org (Omni-Channel, Service Cloud)           │
└─────────────────────────────────────────────────────────┘
```

The UI uses **domain models** and a **DataProvider** abstraction (`mock` or `salesforce`). Views never depend on Salesforce field names or SOQL shapes — mapping lives in Apex only.

For architecture decisions, conventions, and agent guidelines, see [`AGENTS.md`](AGENTS.md).

## Getting started

### Prerequisites

- Node.js 18+
- A Salesforce org with Omni-Channel (for live data; optional for mock mode)

### Install and run

```bash
npm install
npm start    # http://localhost:3000
npm run dev  # same server with file watch + browser reload on save
```

By default the app runs with **mock data** — no Salesforce org required. Use this to explore the UI and validate UX.

### Connect to Salesforce

1. Copy `.env.example` to `.env` and set your External Client App **Consumer Key**:

   ```bash
   cp .env.example .env
   ```

   ```env
   SF_CLIENT_ID=your_consumer_key
   SF_LOGIN_URL=https://login.salesforce.com   # or https://test.salesforce.com for sandboxes
   SF_REDIRECT_URI=http://localhost:3000/oauth/callback
   ```

2. In Salesforce Setup, create an **External Client App** (Local, single org) with:
   - OAuth: Authorization Code + **PKCE** (public SPA — no client secret in the browser)
   - Scopes: `api`, `refresh_token`, `offline_access`
   - Callback URL: `http://localhost:3000/oauth/callback`
   - CORS: allow `http://localhost:3000`

3. Deploy the Apex REST layer to your org (see below).

4. Restart the dev server and open `http://localhost:3000?source=sf`, or sign in when prompted.

The local Node server is **dev-only**: it serves static files, exposes public config (`/api/config`), and proxies OAuth token exchange and profile photos. It does not run business logic in production.

### Data source switching

| URL / config | Data source |
|--------------|-------------|
| No `.env` / no `SF_CLIENT_ID` | Mock (default) |
| `?source=mock` | Mock |
| `?source=sf` | Salesforce (requires `.env` + OAuth) |

The choice is persisted in `localStorage` between sessions.

## Project structure

```
panorama/
├── index.html              # SPA shell (views and layout)
├── src/
│   ├── app.js              # View logic and UI wiring
│   ├── config.js           # Runtime config (mock vs salesforce)
│   ├── auth/               # PKCE OAuth flow
│   ├── data/               # Domain types, providers (mock + salesforce)
│   ├── ui/                 # SLDS icon helpers
│   └── server/             # Local dev server (OAuth proxy, config)
├── force-app/              # Salesforce DX — Apex REST API
│   └── main/default/classes/
│       ├── PanoramaApi.cls
│       ├── PanoramaAgentService.cls
│       └── PanoramaQueueService.cls
├── assets/                 # Logos and images
└── docs/                   # SLDS icons, pending tasks, references
```

## Salesforce deployment

Deploy only the Panorama Apex classes to your org (not the entire metadata folder). Use the IBM Salesforce Context MCP tools or your preferred DX workflow.

REST endpoints:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/services/apexrest/panorama/v1/agents` | Agents with presence and workload |
| GET | `/services/apexrest/panorama/v1/queues` | Queues with backlog metrics |

Supervisors need Omni Supervisor–compatible permissions (`View Agent Queue Stats`, `Manage Queue Membership`, etc.) plus access to the External Client App via Permission Set and App Policies.

## Third-Party Assets

Salesforce Lightning Design System icons are used under the [Creative Commons Attribution-NoDerivatives 4.0 International License](https://creativecommons.org/licenses/by-nd/4.0/).

Source: [Salesforce Lightning Design System Icons](https://www.lightningdesignsystem.com/icons/).

The local icon package includes the full license text in `docs/salesforce-lightning-design-system-icons/License-for-icons.txt`. The icons are redistributed as source assets without modified icon artwork; Panorama styles only the surrounding UI containers and rendered presentation. No Salesforce endorsement, sponsorship, or official status is implied.
