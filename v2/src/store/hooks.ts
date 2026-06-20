import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { panoramaStore, getProvider, getBindings } from './panoramaStore';
import type { Agent, Queue, Skill, AgentSkill, WorkItem } from '../core/types';

/** Re-renders the caller whenever the underlying data changes (poll/sim tick). */
export function useVersion(): number {
  return useSyncExternalStore(panoramaStore.subscribe, panoramaStore.getVersion);
}

/**
 * Identity-stabilise a value across polls. Every poll rebuilds the data arrays
 * (a Salesforce response, a mock tick) into fresh references even when nothing
 * actually changed. Those new references cascade through `useMemo`, `React.memo`
 * and `dangerouslySetInnerHTML`, forcing React to rewrite whole HTML blocks and
 * recreate their external-sprite icons — the flicker. By returning the *previous*
 * reference whenever the value is structurally identical, downstream memos see no
 * change and the DOM is left untouched. Structural comparison via JSON is cheap
 * at these list sizes and the data is plain/serialisable.
 */
export function useStable<T>(value: T): T {
  const ref = useRef<{ key: string; value: T } | null>(null);
  const key = JSON.stringify(value) ?? '';
  if (!ref.current || ref.current.key !== key) {
    ref.current = { key, value };
  }
  return ref.current.value;
}

/** Connected roster (synchronous in both providers), recomputed each version. */
export function useConnectedAgents(): Agent[] {
  const version = useVersion();
  const list = useMemo(() => {
    const res = getProvider().getAgents();
    return Array.isArray(res) ? res : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  return useStable(list);
}

export function useQueues(): Queue[] {
  const version = useVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const list = useMemo(() => getProvider().getQueues(), [version]);
  return useStable(list);
}

export function useBindings() {
  return getBindings();
}

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Runs an async provider call, re-running when `version` (or extra deps) change,
 * with cancellation so a late response never overwrites a newer one — replacing
 * the original `*Token` guards.
 */
function useAsyncData<T>(factory: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const version = useVersion();
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  const keyRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Background refresh: only show the loading state before the first load.
    // Re-polling keeps the current data on screen so the list doesn't blink to a
    // placeholder and back.
    setState((s) => (s.data === null && !s.error ? { ...s, loading: true } : s));
    factory()
      .then((data) => {
        if (cancelled) return;
        const key = JSON.stringify(data) ?? '';
        setState((s) => {
          // Identical payload: keep the existing reference so memoised consumers
          // (and their dangerouslySetInnerHTML) don't re-render at all.
          if (keyRef.current === key && s.data !== null) {
            return s.loading || s.error ? { data: s.data, loading: false, error: null } : s;
          }
          keyRef.current = key;
          return { data, loading: false, error: null };
        });
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ data: null, loading: false, error });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps]);

  return state;
}

export function useAllAgents(): AsyncState<Agent[]> {
  return useAsyncData(() => Promise.resolve(getProvider().getAgents({ scope: 'all' })), []);
}

export function useSkills(): AsyncState<Skill[]> {
  return useAsyncData(() => getProvider().getSkills(), []);
}

export function useWork(): AsyncState<WorkItem[]> {
  return useAsyncData(() => getProvider().getWork(), []);
}

export function useAgentSkills(agentId: string | null): AsyncState<AgentSkill[]> {
  return useAsyncData(
    () => (agentId ? getProvider().getAgentSkills(agentId) : Promise.resolve([])),
    [agentId],
  );
}

export function useSkillAgents(skillId: string | null): AsyncState<Agent[]> {
  return useAsyncData(
    () => (skillId ? getProvider().getSkillAgents(skillId) : Promise.resolve([])),
    [skillId],
  );
}
