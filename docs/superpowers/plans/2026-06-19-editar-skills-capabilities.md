# Editar skills d'un agent amb capabilities reals — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permetre que un supervisor editi els skills d'un agent des de Panorama (afegir, treure, canviar nivell), amb el botó governat pels permisos reals de l'usuari de Salesforce connectat.

**Architecture:** Apex calcula capabilities a partir del CRUD d'objecte de l'usuari connectat i exposa `GET /capabilities` + `PUT /agents/:id/skills`. El provider carrega capabilities un cop a `init()` (fallback read-only) i les exposa a la UI, que mostra el botó "Canviar skills" només si `canChangeSkills`. Un editor modal calcula un diff i el desa via el provider.

**Tech Stack:** Apex (REST resource + servei), JavaScript ESM (vanilla, sense framework), `node:test`.

## Global Constraints

- Provider mai mostra un botó d'acció per defecte: si `/capabilities` falla o falta una clau → `READ_ONLY_CAPABILITIES`.
- Capabilities globals per sessió, carregades **un cop a `init()`**, **no** a cada poll.
- CRUD-check defensiu a Apex abans de qualsevol DML; sense permís → resposta d'error, no excepció no controlada.
- L'objecte JSON de capabilities té exactament les claus de `PanoramaCapabilities` ([src/data/types.js:3](../../../src/data/types.js#L3)): `canChangePresence`, `canReassignWork`, `canChangeQueues`, `canChangeSkills`, `canFlagAgent`, `liveUpdates`.
- Tests Apex: `Skill` no és insertable → lògica de diff en mètode pur `@TestVisible`, cobert amb `JSON.deserialize` (patró ja usat a `PanoramaAgentServiceTest.buildResourceSkill`).
- Tests JS: provar funcions pures exportades (patró de [test/salesforce-provider.test.js](../../../test/salesforce-provider.test.js)); no instanciar fàbriques que depenen de `fetch`.
- Còpia d'UI en català (coherent amb el codi existent del drawer).
- Verificat a l'org: `ServiceResourceSkill` create+update+delete = true.

---

## File Structure

**Apex (backend):**
- Create: `force-app/main/default/classes/PanoramaCapabilityService.cls` (+ `.cls-meta.xml`) — calcula capabilities des de CRUD.
- Create: `force-app/main/default/classes/PanoramaCapabilityServiceTest.cls` (+ meta).
- Modify: `force-app/main/default/classes/PanoramaSkillService.cls` — diff pur + `updateAgentSkills`.
- Modify: `force-app/main/default/classes/PanoramaAgentServiceTest.cls` — tests del diff (ja té helpers `buildResourceSkill`). *(o un test nou; aquí reusem els helpers existents)*
- Modify: `force-app/main/default/classes/PanoramaApi.cls` — `GET /capabilities`, `@HttpPut` `/agents/:id/skills`.

**Provider (client):**
- Modify: `src/data/salesforce-provider.js` — `normalizeCapabilities` (pur, exportat), càrrega a `init()`, `updateAgentSkills`.
- Test: `test/salesforce-provider.test.js` — `normalizeCapabilities`.
- Modify: `src/data/mock-provider.js` — `updateAgentSkills` no-op resolt.

**UI:**
- Modify: `src/app-main.js` — gate del botó per `canChangeSkills`; obrir editor; càlcul de diff; cridar provider.
- Test: `test/skill-edit-diff.test.js` (nou) — `diffSkills` pur.

---

## Task 1: Capability service (Apex) — calcular flags des de CRUD

**Files:**
- Create: `force-app/main/default/classes/PanoramaCapabilityService.cls`
- Create: `force-app/main/default/classes/PanoramaCapabilityService.cls-meta.xml`
- Create: `force-app/main/default/classes/PanoramaCapabilityServiceTest.cls`
- Create: `force-app/main/default/classes/PanoramaCapabilityServiceTest.cls-meta.xml`

**Interfaces:**
- Produces: `PanoramaCapabilityService.CapabilitiesDto` amb camps `Boolean canChangePresence, canReassignWork, canChangeQueues, canChangeSkills, canFlagAgent, liveUpdates`; i `static CapabilitiesDto getCapabilities()`.

- [ ] **Step 1: Write the failing test**

`PanoramaCapabilityServiceTest.cls`:
```apex
@IsTest
private class PanoramaCapabilityServiceTest {
    @IsTest
    static void getCapabilitiesReturnsAllKeys() {
        Test.startTest();
        PanoramaCapabilityService.CapabilitiesDto dto = PanoramaCapabilityService.getCapabilities();
        Test.stopTest();
        System.assertNotEquals(null, dto);
        // canChangeSkills must mirror ServiceResourceSkill CRUD for the running user.
        Boolean expectedSkills =
            Schema.sObjectType.ServiceResourceSkill.isCreateable()
            && Schema.sObjectType.ServiceResourceSkill.isUpdateable()
            && Schema.sObjectType.ServiceResourceSkill.isDeletable();
        System.assertEquals(expectedSkills, dto.canChangeSkills);
        // Reassign and presence are never backend-supported.
        System.assertEquals(false, dto.canReassignWork);
        System.assertEquals(false, dto.canChangePresence);
    }
}
```

`PanoramaCapabilityServiceTest.cls-meta.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<ApexClass xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <status>Active</status>
</ApexClass>
```

- [ ] **Step 2: Run test to verify it fails**

Run: `mcp__ibm-salesforce-context-local__run_apex_test` for class `PanoramaCapabilityServiceTest` (after deploy of the test alone, or rely on the deploy step failing because `PanoramaCapabilityService` does not exist).
Expected: compile/deploy FAIL — `PanoramaCapabilityService` does not exist.

- [ ] **Step 3: Write minimal implementation**

`PanoramaCapabilityService.cls`:
```apex
/**
 * Write capabilities for the connected Panorama supervisor, derived from the
 * running user's object-level CRUD permissions. Shape mirrors the client's
 * PanoramaCapabilities object (src/data/types.js).
 *
 * Verified against the org (2026-06-19): reassigning work and forcing another
 * agent's presence have no supported Apex/REST path, so those flags are always
 * false here (see docs/PENDING-TASKS.md).
 */
public with sharing class PanoramaCapabilityService {
    public class CapabilitiesDto {
        public Boolean canChangePresence = false;
        public Boolean canReassignWork = false;
        public Boolean canChangeQueues = false;
        public Boolean canChangeSkills = false;
        public Boolean canFlagAgent = false;
        public Boolean liveUpdates = false;
    }

    public static CapabilitiesDto getCapabilities() {
        CapabilitiesDto dto = new CapabilitiesDto();
        Schema.DescribeSObjectResult srs = Schema.sObjectType.ServiceResourceSkill;
        dto.canChangeSkills = srs.isCreateable() && srs.isUpdateable() && srs.isDeletable();
        Schema.DescribeSObjectResult gm = Schema.sObjectType.GroupMember;
        dto.canChangeQueues = gm.isCreateable() && gm.isDeletable();
        // canReassignWork / canChangePresence: no backend path → stay false.
        return dto;
    }
}
```

`PanoramaCapabilityService.cls-meta.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<ApexClass xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <status>Active</status>
</ApexClass>
```

- [ ] **Step 4: Deploy and run test to verify it passes**

Deploy both classes via `mcp__ibm-salesforce-context-local__deploy_metadata`, then run `PanoramaCapabilityServiceTest`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add force-app/main/default/classes/PanoramaCapabilityService.cls force-app/main/default/classes/PanoramaCapabilityService.cls-meta.xml force-app/main/default/classes/PanoramaCapabilityServiceTest.cls force-app/main/default/classes/PanoramaCapabilityServiceTest.cls-meta.xml
git commit -m "feat(apex): capability service derived from user CRUD permissions"
```

---

## Task 2: Skill diff + updateAgentSkills (Apex)

**Files:**
- Modify: `force-app/main/default/classes/PanoramaSkillService.cls`
- Modify: `force-app/main/default/classes/PanoramaAgentServiceTest.cls` (reuse `buildResourceSkill`)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `PanoramaSkillService.SkillChange` — `{ String skillId; Double level; Boolean remove; }`.
  - `@TestVisible static SkillDiff diffSkills(List<ServiceResourceSkill> current, List<SkillChange> desired, Id resourceId)` returning `SkillDiff { List<ServiceResourceSkill> toInsert; List<ServiceResourceSkill> toUpdate; List<ServiceResourceSkill> toDelete; }`.
  - `static void updateAgentSkills(Id userId, List<SkillChange> changes)` — resolves ServiceResource, runs diff, CRUD-checks, executes DML.

- [ ] **Step 1: Write the failing test**

Add to `PanoramaAgentServiceTest.cls` (it already has `buildResourceSkill(skillId, resourceId)`):
```apex
@IsTest
static void diffSkillsAddsRemovesAndUpdates() {
    Id resourceId = '0Hn000000000001AAA';
    Id skillKeep = '0C5000000000001AAA';
    Id skillDrop = '0C5000000000002AAA';
    Id skillAdd  = '0C5000000000003AAA';

    ServiceResourceSkill keep = buildResourceSkill(skillKeep, resourceId); // level change
    ServiceResourceSkill drop = buildResourceSkill(skillDrop, resourceId); // removed
    // give the existing rows ids + level via JSON so update/delete can target them
    keep = (ServiceResourceSkill) JSON.deserialize(
        '{"attributes":{"type":"ServiceResourceSkill"},"Id":"0Hq000000000001AAA","SkillId":"' + skillKeep + '","ServiceResourceId":"' + resourceId + '","SkillLevel":1}',
        ServiceResourceSkill.class);
    drop = (ServiceResourceSkill) JSON.deserialize(
        '{"attributes":{"type":"ServiceResourceSkill"},"Id":"0Hq000000000002AAA","SkillId":"' + skillDrop + '","ServiceResourceId":"' + resourceId + '","SkillLevel":3}',
        ServiceResourceSkill.class);

    List<ServiceResourceSkill> current = new List<ServiceResourceSkill>{ keep, drop };
    List<PanoramaSkillService.SkillChange> desired = new List<PanoramaSkillService.SkillChange>();
    PanoramaSkillService.SkillChange c1 = new PanoramaSkillService.SkillChange();
    c1.skillId = skillKeep; c1.level = 5; c1.remove = false;        // update level 1 -> 5
    PanoramaSkillService.SkillChange c2 = new PanoramaSkillService.SkillChange();
    c2.skillId = skillDrop; c2.remove = true;                       // delete
    PanoramaSkillService.SkillChange c3 = new PanoramaSkillService.SkillChange();
    c3.skillId = skillAdd; c3.level = 2; c3.remove = false;         // insert
    desired.add(c1); desired.add(c2); desired.add(c3);

    PanoramaSkillService.SkillDiff diff = PanoramaSkillService.diffSkills(current, desired, resourceId);

    System.assertEquals(1, diff.toInsert.size(), 'one new skill');
    System.assertEquals(skillAdd, diff.toInsert[0].SkillId);
    System.assertEquals(1, diff.toUpdate.size(), 'one level change');
    System.assertEquals(5, diff.toUpdate[0].SkillLevel);
    System.assertEquals(1, diff.toDelete.size(), 'one removal');
    System.assertEquals('0Hq000000000002AAA', String.valueOf(diff.toDelete[0].Id));
}
```

- [ ] **Step 2: Run test to verify it fails**

Deploy test + run `PanoramaAgentServiceTest.diffSkillsAddsRemovesAndUpdates`.
Expected: compile FAIL — `PanoramaSkillService.SkillChange` / `diffSkills` not defined.

- [ ] **Step 3: Write minimal implementation**

Add to `PanoramaSkillService.cls`:
```apex
    public class SkillChange {
        public Id skillId;
        public Double level;
        public Boolean remove = false;
    }

    public class SkillDiff {
        public List<ServiceResourceSkill> toInsert = new List<ServiceResourceSkill>();
        public List<ServiceResourceSkill> toUpdate = new List<ServiceResourceSkill>();
        public List<ServiceResourceSkill> toDelete = new List<ServiceResourceSkill>();
    }

    /**
     * Pure diff between an agent's current ServiceResourceSkill rows and the
     * desired set of changes. No SOQL/DML so it stays unit-testable without
     * inserting Skill (which is not insertable).
     */
    @TestVisible
    private static SkillDiff diffSkills(
        List<ServiceResourceSkill> current, List<SkillChange> desired, Id resourceId
    ) {
        Map<Id, ServiceResourceSkill> currentBySkill = new Map<Id, ServiceResourceSkill>();
        for (ServiceResourceSkill srs : current) {
            if (srs.SkillId != null) {
                currentBySkill.put(srs.SkillId, srs);
            }
        }
        SkillDiff diff = new SkillDiff();
        for (SkillChange ch : desired) {
            if (ch.skillId == null) { continue; }
            ServiceResourceSkill existing = currentBySkill.get(ch.skillId);
            if (ch.remove == true) {
                if (existing != null) { diff.toDelete.add(existing); }
                continue;
            }
            if (existing == null) {
                diff.toInsert.add(new ServiceResourceSkill(
                    ServiceResourceId = resourceId, SkillId = ch.skillId, SkillLevel = ch.level));
            } else if (ch.level != null && ch.level != existing.SkillLevel) {
                existing.SkillLevel = ch.level;
                diff.toUpdate.add(existing);
            }
        }
        return diff;
    }

    /**
     * Apply skill changes for an agent. Resolves the ServiceResource from the
     * User, computes the diff against current assignments, CRUD-checks, and runs
     * the DML. Throws AuraHandledException-style message via PanoramaApiException
     * if the running user lacks permission.
     */
    public static void updateAgentSkills(Id userId, List<SkillChange> changes) {
        Schema.DescribeSObjectResult d = Schema.sObjectType.ServiceResourceSkill;
        if (!(d.isCreateable() && d.isUpdateable() && d.isDeletable())) {
            throw new PanoramaSkillException('Insufficient permissions to edit skills');
        }
        List<ServiceResource> resources = [
            SELECT Id FROM ServiceResource WHERE RelatedRecordId = :userId LIMIT 1
        ];
        if (resources.isEmpty()) {
            throw new PanoramaSkillException('No ServiceResource found for user ' + userId);
        }
        Id resourceId = resources[0].Id;
        List<ServiceResourceSkill> current = [
            SELECT Id, SkillId, SkillLevel FROM ServiceResourceSkill
            WHERE ServiceResourceId = :resourceId LIMIT 10000
        ];
        SkillDiff diff = diffSkills(current, changes, resourceId);
        if (!diff.toInsert.isEmpty()) { insert diff.toInsert; }
        if (!diff.toUpdate.isEmpty()) { update diff.toUpdate; }
        if (!diff.toDelete.isEmpty()) { delete diff.toDelete; }
    }

    public class PanoramaSkillException extends Exception {}
```

- [ ] **Step 4: Deploy and run test to verify it passes**

Deploy `PanoramaSkillService` + `PanoramaAgentServiceTest`, run the new test.
Expected: PASS — insert=1, update=1 (level 5), delete=1.

- [ ] **Step 5: Commit**

```bash
git add force-app/main/default/classes/PanoramaSkillService.cls force-app/main/default/classes/PanoramaAgentServiceTest.cls
git commit -m "feat(apex): diff + updateAgentSkills on ServiceResourceSkill"
```

---

## Task 3: Wire endpoints in PanoramaApi

**Files:**
- Modify: `force-app/main/default/classes/PanoramaApi.cls`

**Interfaces:**
- Consumes: `PanoramaCapabilityService.getCapabilities()` (Task 1), `PanoramaSkillService.updateAgentSkills(Id, List<SkillChange>)` (Task 2).
- Produces: `GET /capabilities`; `PUT /agents/:id/skills` accepting body `{ "changes": [ { "skillId": "...", "level": 2, "remove": false } ] }`.

- [ ] **Step 1: Write the failing test**

Add to `PanoramaApiTest` if it exists, else create `PanoramaApiTest.cls`. Minimal routing test:
```apex
@IsTest
static void getCapabilitiesRoute() {
    RestRequest req = new RestRequest();
    req.requestURI = '/services/apexrest/panorama/v1/capabilities';
    req.httpMethod = 'GET';
    RestContext.request = req;
    RestContext.response = new RestResponse();
    Test.startTest();
    PanoramaApi.handleGet();
    Test.stopTest();
    System.assertEquals(200, RestContext.response.statusCode);
    Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(
        RestContext.response.responseBody.toString());
    System.assert(body.containsKey('canChangeSkills'), 'capabilities payload');
}
```
*(If no `PanoramaApiTest` exists, create it with the standard `-meta.xml` from Task 1 Step 1.)*

- [ ] **Step 2: Run test to verify it fails**

Deploy test, run it.
Expected: FAIL — `/capabilities` returns 404 (not yet routed).

- [ ] **Step 3: Write minimal implementation**

In `PanoramaApi.handleGet()`, add before the `else` 404 branch:
```apex
            } else if (path == '/capabilities') {
                writeJson(res, 200, PanoramaCapabilityService.getCapabilities());
```

Add a new method to `PanoramaApi`:
```apex
    @HttpPut
    global static void handlePut() {
        RestRequest req = RestContext.request;
        RestResponse res = RestContext.response;
        String path = normalizePath(req.requestURI);
        try {
            if (path.startsWith('/agents/') && path.endsWith('/skills')) {
                String userId = path.substring('/agents/'.length(), path.length() - '/skills'.length());
                Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(req.requestBody.toString());
                List<Object> raw = (List<Object>) body.get('changes');
                List<PanoramaSkillService.SkillChange> changes = new List<PanoramaSkillService.SkillChange>();
                if (raw != null) {
                    for (Object o : raw) {
                        Map<String, Object> m = (Map<String, Object>) o;
                        PanoramaSkillService.SkillChange ch = new PanoramaSkillService.SkillChange();
                        ch.skillId = (Id) (String) m.get('skillId');
                        ch.level = m.get('level') == null ? null : Double.valueOf(m.get('level'));
                        ch.remove = m.get('remove') == true;
                        changes.add(ch);
                    }
                }
                PanoramaSkillService.updateAgentSkills((Id) userId, changes);
                writeJson(res, 200, new Map<String, Object>{ 'ok' => true });
            } else {
                writeJson(res, 404, new Map<String, Object>{ 'error' => 'Not found', 'path' => path });
            }
        } catch (PanoramaSkillService.PanoramaSkillException ex) {
            writeJson(res, 403, new Map<String, Object>{ 'error' => ex.getMessage() });
        } catch (Exception ex) {
            writeJson(res, 500, new Map<String, Object>{ 'error' => ex.getMessage() });
        }
    }
```

- [ ] **Step 4: Deploy and run test to verify it passes**

Deploy `PanoramaApi` + test, run `getCapabilitiesRoute`.
Expected: PASS (200, body has `canChangeSkills`).

- [ ] **Step 5: Commit**

```bash
git add force-app/main/default/classes/PanoramaApi.cls force-app/main/default/classes/PanoramaApiTest.cls force-app/main/default/classes/PanoramaApiTest.cls-meta.xml
git commit -m "feat(apex): GET /capabilities and PUT /agents/:id/skills routes"
```

---

## Task 4: Provider — normalizeCapabilities (pure, exported) + tests

**Files:**
- Modify: `src/data/salesforce-provider.js`
- Test: `test/salesforce-provider.test.js`

**Interfaces:**
- Produces: `export function normalizeCapabilities(raw)` → returns an object with all 6 `PanoramaCapabilities` keys, coercing each to Boolean, defaulting any missing/invalid key to the `READ_ONLY_CAPABILITIES` value (all `false`).

- [ ] **Step 1: Write the failing test**

Add to `test/salesforce-provider.test.js`:
```javascript
import { buildSalesforceRecordUrl, normalizeCapabilities } from '../src/data/salesforce-provider.js';

test('normalizeCapabilities coerces present keys to Boolean', () => {
  const caps = normalizeCapabilities({ canChangeSkills: true, canChangeQueues: false });
  assert.equal(caps.canChangeSkills, true);
  assert.equal(caps.canChangeQueues, false);
  assert.equal(caps.canReassignWork, false); // missing -> read-only default
});

test('normalizeCapabilities falls back to read-only on null', () => {
  const caps = normalizeCapabilities(null);
  assert.equal(caps.canChangeSkills, false);
  assert.equal(caps.canChangePresence, false);
  assert.equal(caps.liveUpdates, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/salesforce-provider.test.js`
Expected: FAIL — `normalizeCapabilities` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/data/salesforce-provider.js`, add near the top (after imports):
```javascript
/**
 * Coerce a raw /capabilities payload into a full PanoramaCapabilities object.
 * Any missing or non-boolean key falls back to its READ_ONLY value, so a
 * partial or malformed response can never enable an action button.
 * @param {any} raw
 * @returns {import('./types.js').PanoramaCapabilities}
 */
export function normalizeCapabilities(raw) {
  const out = { ...READ_ONLY_CAPABILITIES };
  if (raw && typeof raw === 'object') {
    for (const key of Object.keys(READ_ONLY_CAPABILITIES)) {
      if (typeof raw[key] === 'boolean') {
        out[key] = raw[key];
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/salesforce-provider.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/salesforce-provider.js test/salesforce-provider.test.js
git commit -m "feat(provider): normalizeCapabilities with read-only fallback"
```

---

## Task 5: Provider — load capabilities at init + updateAgentSkills

**Files:**
- Modify: `src/data/salesforce-provider.js`
- Modify: `src/data/mock-provider.js`

**Interfaces:**
- Consumes: `normalizeCapabilities` (Task 4); existing `apiFetch`, `getSession`, `recoverSession`.
- Produces (on both providers): `capabilities` field populated; `updateAgentSkills(agentId, changes)` → `Promise` resolving when saved. `changes` is `Array<{ skillId: string, level?: number, remove?: boolean }>`.

- [ ] **Step 1: Write the failing test**

No new unit test (requires `fetch`/session — out of scope for the pure-function test suite, per Global Constraints). Manual verification covered in Step 4. Skip directly to implementation; verification is the deploy + smoke run.

- [ ] **Step 2: Implement capability loading in init()**

In `salesforce-provider.js`, replace the static field and load in `init()`. Change the returned object so `capabilities` is mutable:
```javascript
  let capabilities = { ...READ_ONLY_CAPABILITIES };

  async function refreshCapabilities() {
    try {
      const session = await getSession();
      const base = `${session.instanceUrl.replace(/\/$/, '')}/services/apexrest/panorama/v1`;
      const res = await apiFetch(base, session.accessToken, '/capabilities', recoverSession);
      capabilities = normalizeCapabilities(res);
    } catch (err) {
      console.warn('[Panorama] capabilities fetch failed, staying read-only', err);
      capabilities = { ...READ_ONLY_CAPABILITIES };
    }
  }
```
Replace line `capabilities: READ_ONLY_CAPABILITIES,` in the returned object with a getter:
```javascript
    get capabilities() { return capabilities; },
```
In `init()`, call `await refreshCapabilities();` before `startPolling()`.

- [ ] **Step 3: Implement updateAgentSkills on the provider**

Add this function and expose it on the returned object:
```javascript
  /**
   * Persist skill changes for an agent.
   * @param {string} agentId the agent's User Id
   * @param {Array<{skillId: string, level?: number, remove?: boolean}>} changes
   */
  async function updateAgentSkills(agentId, changes) {
    const session = await getSession();
    const base = `${session.instanceUrl.replace(/\/$/, '')}/services/apexrest/panorama/v1`;
    return apiFetch(
      base, session.accessToken,
      `/agents/${encodeURIComponent(agentId)}/skills`, recoverSession,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changes }) });
  }
```
Add `updateAgentSkills,` to the returned object.

- [ ] **Step 4: Mock provider parity**

In `src/data/mock-provider.js`, add to the returned object of `createMockProvider`:
```javascript
    updateAgentSkills(_agentId, _changes) { return Promise.resolve({ ok: true }); },
```

- [ ] **Step 5: Run full JS test suite + manual smoke**

Run: `node --test test/*.test.js`
Expected: all PASS (no regressions).
Manual: start app in live mode, confirm no console error on init and `globalThis.PanoramaProvider.capabilities` has `canChangeSkills`.

- [ ] **Step 6: Commit**

```bash
git add src/data/salesforce-provider.js src/data/mock-provider.js
git commit -m "feat(provider): load capabilities at init, add updateAgentSkills"
```

---

## Task 6: UI — gate the skills button on capabilities

**Files:**
- Modify: `src/app-main.js:881-883`

**Interfaces:**
- Consumes: `globalThis.PanoramaProvider.capabilities.canChangeSkills`.

- [ ] **Step 1: Read current code**

The current code at [src/app-main.js:881-883](../../../src/app-main.js#L881-L883):
```javascript
  const drawerActions = live
    ? salesforceLink
    : `${salesforceLink}<button class="primary">⚑ Atendre bandera</button><button>↪ Reassignar</button><button>≋ Canviar cues</button><button>✦ Canviar skills</button>`;
```

- [ ] **Step 2: Replace with capability-gated actions**

```javascript
  const caps = globalThis.PanoramaProvider?.capabilities || {};
  const skillsBtn = caps.canChangeSkills
    ? `<button class="js-edit-skills" data-agent="${esc(a.id)}">✦ Canviar skills</button>`
    : '';
  // Reassign / queues / flag have no backend path yet → mock-only.
  const mockActions = live
    ? ''
    : `<button class="primary">⚑ Atendre bandera</button><button>↪ Reassignar</button><button>≋ Canviar cues</button>`;
  const drawerActions = live
    ? `${salesforceLink}${skillsBtn}`
    : `${salesforceLink}${mockActions}<button class="js-edit-skills" data-agent="${esc(a.id)}">✦ Canviar skills</button>`;
```

- [ ] **Step 3: Manual verification**

Run app in mock mode: all four buttons present (skills via `.js-edit-skills`).
Run app in live mode with a user that has skill permissions: only "View in Salesforce" + "Canviar skills".
Run app in live mode with a user without permissions: only "View in Salesforce".

- [ ] **Step 4: Commit**

```bash
git add src/app-main.js
git commit -m "feat(ui): gate Canviar skills button on canChangeSkills capability"
```

---

## Task 7: UI — diffSkills pure helper + tests

**Files:**
- Create: `test/skill-edit-diff.test.js`
- Modify: `src/app-main.js` (export `diffSkills`) OR a new small module `src/ui/skill-edit.js`

**Decision:** put the pure helper in a new focused module `src/ui/skill-edit.js` (keeps `app-main.js` from growing and is unit-testable in isolation).

**Files (revised):**
- Create: `src/ui/skill-edit.js`
- Create: `test/skill-edit-diff.test.js`

**Interfaces:**
- Produces: `export function diffSkills(current, selected)` where `current` is `Array<{ skillId, level }>` (the agent's current skills) and `selected` is `Array<{ skillId, level }>` (the editor's desired state). Returns `Array<{ skillId, level?, remove? }>` — only the changes (added, removed, level-changed).

- [ ] **Step 1: Write the failing test**

`test/skill-edit-diff.test.js`:
```javascript
import assert from 'node:assert/strict';
import test from 'node:test';
import { diffSkills } from '../src/ui/skill-edit.js';

test('diffSkills detects add, remove, and level change', () => {
  const current = [
    { skillId: 'A', level: 1 },
    { skillId: 'B', level: 3 },
  ];
  const selected = [
    { skillId: 'A', level: 5 }, // level change
    { skillId: 'C', level: 2 }, // added (B dropped)
  ];
  const changes = diffSkills(current, selected);
  // Order-independent assertions
  const byId = Object.fromEntries(changes.map((c) => [c.skillId, c]));
  assert.deepEqual(byId.A, { skillId: 'A', level: 5 });
  assert.deepEqual(byId.C, { skillId: 'C', level: 2 });
  assert.deepEqual(byId.B, { skillId: 'B', remove: true });
  assert.equal(changes.length, 3);
});

test('diffSkills returns empty when nothing changed', () => {
  const same = [{ skillId: 'A', level: 1 }];
  assert.deepEqual(diffSkills(same, [{ skillId: 'A', level: 1 }]), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/skill-edit-diff.test.js`
Expected: FAIL — module `src/ui/skill-edit.js` not found.

- [ ] **Step 3: Write minimal implementation**

`src/ui/skill-edit.js`:
```javascript
/**
 * Compute the minimal set of skill changes between an agent's current skills
 * and the editor's selected skills. Returned shape matches the PUT body the
 * provider sends: { skillId, level? } for add/update, { skillId, remove: true }
 * for removal.
 * @param {Array<{skillId: string, level: (number|null)}>} current
 * @param {Array<{skillId: string, level: (number|null)}>} selected
 * @returns {Array<{skillId: string, level?: number, remove?: boolean}>}
 */
export function diffSkills(current, selected) {
  const currentById = new Map(current.map((s) => [s.skillId, s]));
  const selectedById = new Map(selected.map((s) => [s.skillId, s]));
  const changes = [];
  for (const sel of selected) {
    const cur = currentById.get(sel.skillId);
    if (!cur) {
      changes.push({ skillId: sel.skillId, level: sel.level });
    } else if (sel.level !== cur.level) {
      changes.push({ skillId: sel.skillId, level: sel.level });
    }
  }
  for (const cur of current) {
    if (!selectedById.has(cur.skillId)) {
      changes.push({ skillId: cur.skillId, remove: true });
    }
  }
  return changes;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/skill-edit-diff.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/skill-edit.js test/skill-edit-diff.test.js
git commit -m "feat(ui): diffSkills pure helper for skill editor"
```

---

## Task 8: UI — skill editor modal wired to the provider

**Files:**
- Modify: `src/ui/skill-edit.js` (add `openSkillEditor`)
- Modify: `src/app-main.js` (bind `.js-edit-skills` click → `openSkillEditor`)

**Interfaces:**
- Consumes: `diffSkills` (Task 7); `provider.getSkills()` (catalog), `provider.getAgentSkills(id)` (current), `provider.updateAgentSkills(id, changes)` (Task 5).
- Produces: `export function openSkillEditor(agentId, { onSaved })` — opens an overlay; on save computes diff, calls `updateAgentSkills`, then `onSaved()`.

- [ ] **Step 1: Implement the editor (no unit test — DOM/IO; verified manually)**

Add to `src/ui/skill-edit.js` (same file as `diffSkills` — no import needed):
```javascript
/**
 * Open a modal editor for an agent's skills. Loads the catalog and the agent's
 * current skills, lets the user toggle skills and set levels, then persists the
 * diff via the provider.
 * @param {string} agentId
 * @param {{ onSaved?: () => void }} [opts]
 */
export async function openSkillEditor(agentId, opts = {}) {
  const provider = globalThis.PanoramaProvider;
  if (!provider?.updateAgentSkills) return;
  const [catalog, current] = await Promise.all([
    provider.getSkills ? provider.getSkills() : [],
    provider.getAgentSkills ? provider.getAgentSkills(agentId) : [],
  ]);
  const currentMap = new Map(current.map((s) => [s.skillId || s.id, { skillId: s.skillId || s.id, level: s.level }]));

  const overlay = document.createElement('div');
  overlay.className = 'skill-editor-overlay';
  overlay.innerHTML = `
    <div class="skill-editor" role="dialog" aria-label="Editar skills">
      <header><h3>Editar skills</h3><button class="se-close" aria-label="Tancar">✕</button></header>
      <div class="se-list">${catalog.map((s) => {
        const sel = currentMap.get(s.id);
        const level = sel?.level ?? 1;
        return `<label class="se-row">
          <input type="checkbox" class="se-check" data-skill="${s.id}" ${sel ? 'checked' : ''}>
          <span class="se-name">${s.name}</span>
          <input type="number" min="1" max="10" class="se-level" data-skill="${s.id}" value="${level}" ${sel ? '' : 'disabled'}>
        </label>`;
      }).join('')}</div>
      <footer><button class="se-cancel">Cancel·la</button><button class="se-save primary">Desa</button>
        <span class="se-error" style="color:var(--alert)"></span></footer>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.se-close').onclick = close;
  overlay.querySelector('.se-cancel').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelectorAll('.se-check').forEach((chk) => {
    chk.onchange = () => {
      const lvl = overlay.querySelector(`.se-level[data-skill="${chk.dataset.skill}"]`);
      if (lvl) lvl.disabled = !chk.checked;
    };
  });

  overlay.querySelector('.se-save').onclick = async () => {
    const selected = [];
    overlay.querySelectorAll('.se-check:checked').forEach((chk) => {
      const lvl = overlay.querySelector(`.se-level[data-skill="${chk.dataset.skill}"]`);
      selected.push({ skillId: chk.dataset.skill, level: lvl ? Number(lvl.value) : null });
    });
    const currentArr = Array.from(currentMap.values());
    const changes = diffSkills(currentArr, selected);
    const errEl = overlay.querySelector('.se-error');
    errEl.textContent = '';
    if (changes.length === 0) { close(); return; }
    try {
      await provider.updateAgentSkills(agentId, changes);
      close();
      opts.onSaved?.();
    } catch (err) {
      errEl.textContent = `No s'ha pogut desar: ${err.message}`;
    }
  };
}
```

- [ ] **Step 2: Bind the button in app-main.js**

In the agent drawer's `afterMount(root, cfg)` ([src/app-main.js:916](../../../src/app-main.js#L916)), after the existing skill list logic, add a binding. First import at top of `app-main.js`:
```javascript
import { openSkillEditor } from './ui/skill-edit.js';
```
Then inside `afterMount`, before its closing brace:
```javascript
      const editBtn = root.querySelector('.js-edit-skills');
      if (editBtn) {
        editBtn.onclick = () => openSkillEditor(editBtn.dataset.agent, {
          onSaved: () => openDrawer(editBtn.dataset.agent), // re-render drawer with fresh skills
        });
      }
```

- [ ] **Step 3: Add minimal styles**

Add to the stylesheet used by the drawer (locate via `grep -rn "dr-action-link" index.html src/`). Add:
```css
.skill-editor-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.skill-editor { background: var(--bg, #fff); border-radius: 12px; width: min(420px, 90vw); max-height: 80vh; display: flex; flex-direction: column; }
.skill-editor header, .skill-editor footer { display: flex; align-items: center; gap: 8px; padding: 12px 16px; }
.skill-editor .se-list { overflow: auto; padding: 8px 16px; }
.se-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
.se-row .se-name { flex: 1; }
.se-level { width: 56px; }
```

- [ ] **Step 4: Manual verification**

- Mock mode: open an agent drawer → "Canviar skills" → editor lists catalog with current skills checked; toggle one, change a level, Desa → editor closes (mock no-op), drawer re-renders.
- Live mode (with permissions): same flow; verify in Salesforce that `ServiceResourceSkill` rows changed.
- Live mode error path: simulate a 403 (user without permission) → error message shown, editor stays open.

- [ ] **Step 5: Run full test suite**

Run: `node --test test/*.test.js`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/skill-edit.js src/app-main.js index.html
git commit -m "feat(ui): skill editor modal wired to updateAgentSkills"
```

---

## Self-Review notes

- **Spec coverage:** capability service (T1), skill diff+DML (T2), endpoints (T3), provider normalize+fallback (T4), provider load+update (T5), button gate (T6), pure diff (T7), editor (T8). Reassign/presence explicitly excluded per spec; queues capability computed in T1 but no write endpoint (per spec "deferred").
- **`diffSkills` exists in two layers** by design: Apex `diffSkills` (server source of truth, operates on `ServiceResourceSkill`) and JS `diffSkills` (client, builds the PUT body). Different inputs/outputs, named the same for traceability — documented here to avoid confusion.
- **Test strategy honors constraints:** Apex diff tested via `JSON.deserialize` (Skill not insertable); JS via pure-function tests; DOM/IO verified manually.
- **No placeholders**; all code blocks complete.
