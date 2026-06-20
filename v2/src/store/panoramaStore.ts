// Reactive bridge between the framework-agnostic data provider and React.
//
// The original app re-rendered by calling DOM-mutating hooks on every poll. Here
// instead we expose a single external store: every data change (a Salesforce poll
// via provider.subscribe, or a mock simulation tick via startSimulation) bumps a
// version counter and notifies React through useSyncExternalStore. React then
// reconciles the virtual DOM — keyed lists keep their nodes, so scroll position
// is preserved and there is no flicker. That is the whole point of the rewrite.
import type {
  Agent,
  Queue,
  WorkItem,
  PanoramaProvider,
  StatusMeta,
} from '../core/types';

interface LegacyBindings {
  STATUS: Record<string, StatusMeta>;
  QUEUES: Queue[];
  CH_LBL: Record<string, string>;
  TEAM_COLOR: Record<string, [number, number, number]>;
  teamOf: (a: Agent) => string;
  [k: string]: unknown;
}

let provider: PanoramaProvider | null = null;
let bindings: LegacyBindings | null = null;
let version = 0;
const listeners = new Set<() => void>();

function notify(): void {
  version += 1;
  listeners.forEach((l) => l());
}

/** Wire the provider's change signal(s) into our version counter. */
export function initStore(p: PanoramaProvider): void {
  provider = p;
  bindings = p.getLegacyBindings() as unknown as LegacyBindings;

  // Salesforce: real polling exposed through subscribe().
  if (p.subscribe) {
    p.subscribe(notify);
  }

  // Mock: data changes are driven by the simulation timers. We pass hooks that
  // only signal a change — no DOM work — so React owns all rendering.
  if (p.startSimulation) {
    p.startSimulation({
      isView: () => true,
      updateOverviewMetrics: notify,
      updateAgents: notify,
      updateRoomPanel: notify,
      refreshActiveDetail: notify,
      queueCard: () => '',
      activePanelEl: () => null,
    });
  }
}

export const panoramaStore = {
  subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  getVersion(): number {
    return version;
  },
};

/**
 * Manually re-poll the data source (topbar refresh button). Salesforce providers
 * re-poll and notify subscribers themselves; for everything else we still bump
 * the version so views re-read the latest simulated data.
 */
export async function refreshData(): Promise<void> {
  if (provider?.refresh) {
    await provider.refresh({ poll: true });
  }
  notify();
}

/**
 * Shared, per-poll work fetch. The Queues page, the Work page and the open
 * queue detail all need the work list; without this each fired its own
 * `getWork()` on every poll (the duplicate `GET /work` calls seen in the
 * console). Caching the promise by store version collapses them into one
 * request per poll, invalidated automatically when the next poll bumps version.
 */
let workCache: { version: number; promise: Promise<WorkItem[]> } | null = null;
export function getWorkShared(): Promise<WorkItem[]> {
  if (!workCache || workCache.version !== version) {
    workCache = { version, promise: Promise.resolve(getProvider().getWork()) };
  }
  return workCache.promise;
}

export function getProvider(): PanoramaProvider {
  if (!provider) throw new Error('panoramaStore: provider not initialised');
  return provider;
}

export function getBindings(): LegacyBindings {
  if (!bindings) throw new Error('panoramaStore: bindings not initialised');
  return bindings;
}
