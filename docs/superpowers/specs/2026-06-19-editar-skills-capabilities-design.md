# Editar skills d'un agent amb capabilities derivades de permisos

**Data:** 2026-06-19
**Estat:** Disseny aprovat, pendent de pla d'implementació

## Problema

Al drawer d'un agent, els botons d'acció ("Atendre bandera", "Reassignar", "Canviar
cues", "Canviar skills") apareixen amb dades **mock** però desapareixen amb dades
**reals** de Salesforce.

La causa és a [src/app-main.js:881-883](../../../src/app-main.js#L881-L883): `drawerActions`
bifurca per `isLiveDataMode()` i, en mode real, només mostra l'enllaç "View in
Salesforce" sense cap botó.

El contracte ja preveu controlar-ho amb capabilities
([src/data/types.js](../../../src/data/types.js)): `MOCK_CAPABILITIES` (tot `true`) i
`READ_ONLY_CAPABILITIES` (tot `false`). Però el camp `capabilities` que retornen els
providers **no es llegeix enlloc** — és codi mort. La UI bifurca directament per
`isLiveDataMode()`.

## Objectiu

Que les capabilities en mode real **es derivin dels permisos de l'usuari supervisor de
Panorama connectat** (l'usuari OAuth amb qui s'executa Apex). Si aquest usuari pot editar
skills a Salesforce, ha de poder fer-ho a la UI de Panorama; si no, el botó no apareix.

Aquest spec acota l'abast a **editar skills d'un agent**. Reassignar work, canviar cues i
canviar presència queden fora (vegeu "Fora d'abast").

## Verificació contra l'org real

Executat via Apex anònim (`Schema.getGlobalDescribe()` + describe de camps) sobre l'org
connectada, l'usuari `sonata-peixater-8j...@agentforce.com`:

| Objecte | accessible | create | update | delete | Conclusió |
|---|---|---|---|---|---|
| `ServiceResourceSkill` | ✅ | ✅ | ✅ | ✅ | **Skills: viable complet per DML** |
| `GroupMember` | ✅ | ✅ | ❌ | ✅ | Cues: viable (create+delete), no update |
| `AgentWork` | ✅ | ✅ | obj=✅ | ✅ | **Camps no editables** (sota) |
| `UserServicePresence` | ✅ | ❌ | ✅ | ✅ | **No insertable** |
| `ServicePresenceStatus` | ✅ | ❌ | ❌ | ❌ | Catàleg read-only |
| `ServiceResource` | ✅ | ✅ | ✅ | ❌ | — |
| `Skill` | ✅ | ❌ | ❌ | ❌ | Catàleg read-only |

Camps d'`AgentWork` (rellevants per a reassignar):
`UserId`, `Status`, `PendingServiceRoutingId`, `OriginalQueueId`, `ServiceChannelId` →
**tots `updateable = false`**. Tot i que l'objecte diu `isUpdateable = true`, cap camp
necessari per reassignar és editable.

Cap classe Apex d'Omni supervisor existeix a l'org (`Type.forName` retorna `false` per a
`OmniSupervisorController`, `ConnectApi.OmniSupervisor`, `System.AgentWork`, etc.).

**Conclusió:**
- Editar skills és viable per DML net sobre `ServiceResourceSkill`.
- **Reassignar work no és possible des d'Apex/REST** (camps d'`AgentWork` no editables; sense API de supervisor exposada).
- **Canviar presència d'un altre agent no és possible des del backend.** L'API
  `sforce.console.presence.setServicePresenceStatus` és Console JS (Integration Toolkit):
  corre al navegador dins una Salesforce Console i actua sobre la **pròpia** presència de
  l'agent, no la d'un tercer des d'una app externa.

## Arquitectura

Tres capes, una direcció de dades:

```
Apex (PanoramaApi.cls)  →  salesforce-provider.js  →  UI (app-main.js)
   permisos reals            capabilities object        botons condicionals
```

Les capabilities són **globals per sessió** (permisos del supervisor connectat),
calculades a Apex i cridades **un sol cop a `init()`** via endpoint `/capabilities`
dedicat. No es recalculen a cada poll (els permisos no canvien a mitja sessió).

### Backend Apex

**`PanoramaCapabilityService.cls` (nou)** — `getCapabilities()` retorna un objecte amb les
mateixes claus que `PanoramaCapabilities` de
[types.js](../../../src/data/types.js#L3):

```apex
canChangePresence = false;  // sense via backend suportada (verificat)
canReassignWork   = false;  // AgentWork camps no editables (verificat)
canChangeQueues   = Schema.sObjectType.GroupMember.isCreateable()
                 && Schema.sObjectType.GroupMember.isDeletable();
canChangeSkills   = Schema.sObjectType.ServiceResourceSkill.isCreateable()
                 && Schema.sObjectType.ServiceResourceSkill.isUpdateable()
                 && Schema.sObjectType.ServiceResourceSkill.isDeletable();
canFlagAgent      = false;  // fora d'abast
liveUpdates       = false;
```

Nota: `canChangeQueues` es calcula però no s'hi connecta escriptura encara (només skills
té endpoint d'escriptura en aquest abast).

**`PanoramaSkillService.cls`** — afegir `updateAgentSkills(String userId, ...changes)`:
1. Resol el `ServiceResource` del `User` (`RelatedRecordId = userId`).
2. Calcula el diff respecte als `ServiceResourceSkill` actuals.
3. Insert dels nous, delete dels trets, update del `SkillLevel` dels modificats.
4. CRUD-check defensiu (`Schema...isCreateable()` etc.) abans de cada DML; si falta
   permís, retorna error 403 en lloc de deixar petar el DML.

**`PanoramaApi.cls`** — dos casos nous a `handleGet` / nou `@HttpPut`:
- `GET /capabilities` → `PanoramaCapabilityService.getCapabilities()`
- `PUT /agents/:id/skills` → `PanoramaSkillService.updateAgentSkills(...)`

### Provider (`salesforce-provider.js`)

- A `init()`: cridar `GET /capabilities`, normalitzar i guardar a estat intern.
  **Fallback a `READ_ONLY_CAPABILITIES`** si la crida falla o falta una clau (mai mostrar
  un botó per defecte).
- Substituir `capabilities: READ_ONLY_CAPABILITIES`
  ([línia 220](../../../src/data/salesforce-provider.js#L220)) per l'estat carregat.
- Nou mètode `updateAgentSkills(agentId, changes)` → `PUT /agents/:id/skills`.
- El mock-provider segueix retornant `MOCK_CAPABILITIES` sense canvis.

### UI (`app-main.js`)

- El botó "✦ Canviar skills" ([línia 883](../../../src/app-main.js#L883)) deixa de
  dependre de `!live` i passa a llegir `capabilities.canChangeSkills`. Cal fer arribar
  l'objecte `capabilities` del provider a la funció que renderitza el drawer.
- Els altres tres botons (Reassignar / Canviar cues / Atendre bandera) queden **només en
  mock** per ara (les seves capabilities són `false` en real).
- Connectar el botó a un editor de skills que cridi `provider.updateAgentSkills`.

### UI de l'editor de skills

Modal simple que combina dues fonts ja existents:
- Catàleg de skills: `GET /skills` (ja implementat).
- Skills actuals de l'agent: `GET /agents/:id/skills` (ja implementat,
  `normalizeAgentSkill`).

Permet afegir, treure i editar el nivell de cada skill. En desar, calcula el diff i crida
`provider.updateAgentSkills`. El detall fi d'aquest modal es concreta al pla.

## Flux de dades

1. `init()` del provider → `GET /capabilities` → capabilities a estat (fallback read-only).
2. UI renderitza el botó "Canviar skills" només si `capabilities.canChangeSkills`.
3. Usuari obre l'editor → carrega catàleg + skills de l'agent.
4. Usuari desa → diff → `PUT /agents/:id/skills` → Apex valida CRUD i fa DML.
5. Refresh del drawer amb les skills actualitzades.

## Gestió d'errors

- Provider: si `/capabilities` falla → `READ_ONLY_CAPABILITIES` (botons amagats, app
  segueix funcionant en lectura).
- Apex: CRUD-check abans de DML → 403 amb missatge clar si el supervisor no té permís.
- UI: error del `PUT` → missatge a l'usuari, no es tanca l'editor, no es perd la selecció.

## Tests

- **Apex:** `ServiceResourceSkill` és insertable en context de test (a diferència
  d'`AgentWork`), així que `updateAgentSkills` i `getCapabilities` es poden cobrir amb DML
  real. Cobrir: afegir, treure, canviar nivell, i el cas sense permís (CRUD-check).
- **Provider/UI:** test que el fallback a read-only s'activa quan `/capabilities` falla, i
  que el botó respecta la flag.

## Fora d'abast (anotat a PENDING-TASKS.md)

- **Reassignar work** — `AgentWork` té tots els camps clau `updateable = false`; sense API
  de supervisor exposada a Apex/REST. No viable des del backend.
- **Canviar presència d'un altre agent** — `UserServicePresence` no insertable;
  `setServicePresenceStatus` és Console JS (pròpia presència, dins consola). No viable des
  del backend.
- **Canviar cues** — `GroupMember` és viable (create+delete) i la capability es calcula,
  però l'endpoint d'escriptura es deixa per a una iteració posterior.
