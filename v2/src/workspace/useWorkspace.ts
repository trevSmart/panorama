import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveDetailSnapshot } from '../render/v1html';
import type { DetailTarget } from '../detail/DetailDrawer';

export type ViewType = 'operations' | 'agents' | 'queues' | 'skills' | 'work' | 'floor-editor' | 'detail';

export interface Tab {
  id: string;
  viewType: ViewType;
  label: string;
  config?: DetailTarget; // for viewType 'detail'
  pinned?: boolean;
}

export type CatalogViewType = 'operations' | 'agents' | 'queues' | 'skills' | 'work' | 'floor-editor';

export interface ViewDef {
  viewType: CatalogViewType;
  label: string;
}

// Catalog entries for the "+" button — mirrors v1's registration order. Home
// (operations) is offered too; opening it focuses the existing pinned tab.
export const CATALOG: ViewDef[] = [
  { viewType: 'operations', label: 'Home' },
  { viewType: 'agents', label: 'Agents' },
  { viewType: 'queues', label: 'Cues' },
  { viewType: 'work', label: 'Work' },
  { viewType: 'skills', label: 'Skills' },
  { viewType: 'floor-editor', label: 'Floor editor' },
];

const STORAGE_KEY = 'panorama.v2.workspace';
const HOME: Tab = { id: 'p-operations', viewType: 'operations', label: 'Home', pinned: true };

let counter = 0;
function uid() {
  counter += 1;
  return `p-${counter}-${Math.round(performance.now())}`;
}

interface Persisted { activeId: string; tabs: Tab[]; }

function load(): Persisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Persisted;
    if (!parsed?.tabs?.length) return null;
    // ensure the pinned home tab is present and labelled "Home"
    const home = parsed.tabs.find((t) => t.viewType === 'operations');
    if (!home) parsed.tabs.unshift(HOME);
    else { home.label = 'Home'; home.pinned = true; }
    return parsed;
  } catch {
    return null;
  }
}

function sameTarget(a?: DetailTarget, b?: DetailTarget) {
  return a && b && a.kind === b.kind && a.id === b.id;
}

export function useWorkspace() {
  const [tabs, setTabs] = useState<Tab[]>(() => load()?.tabs ?? [HOME]);
  const [activeId, setActiveId] = useState<string>(() => load()?.activeId ?? HOME.id);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ activeId, tabs })); } catch { /* ignore */ }
  }, [tabs, activeId]);

  const activate = useCallback((id: string) => setActiveId(id), []);

  // Open-or-focus a view tab (one tab per directory view type).
  const openView = useCallback((viewType: CatalogViewType) => {
    const def = CATALOG.find((c) => c.viewType === viewType);
    const existing = tabsRef.current.find((t) => t.viewType === viewType);
    if (existing) { setActiveId(existing.id); return; }
    const tab: Tab = { id: uid(), viewType, label: def?.label ?? viewType };
    setTabs((prev) => [...prev, tab]);
    setActiveId(tab.id);
  }, []);

  // Open-or-focus a detail tab (from drawer maximize).
  const openDetailTab = useCallback((target: DetailTarget) => {
    const existing = tabsRef.current.find((t) => t.viewType === 'detail' && sameTarget(t.config, target));
    if (existing) { setActiveId(existing.id); return; }
    // Resolve a proper label (agent/queue/skill name) rather than falling back to the kind.
    const name = target.name || resolveDetailSnapshot(target)?.title || target.kind;
    const tab: Tab = { id: uid(), viewType: 'detail', label: name, config: { ...target, name } };
    setTabs((prev) => [...prev, tab]);
    setActiveId(tab.id);
  }, []);

  const close = useCallback((id: string) => {
    setTabs((prev) => {
      const tab = prev.find((t) => t.id === id);
      if (!tab || tab.pinned || prev.length <= 1) return prev;
      const next = prev.filter((t) => t.id !== id);
      setActiveId((cur) => (cur === id ? next[next.length - 1].id : cur));
      return next;
    });
  }, []);

  // Reorder: move tab `id` to index `toIndex` in the visual order.
  const move = useCallback((id: string, toIndex: number) => {
    setTabs((prev) => {
      const from = prev.findIndex((t) => t.id === id);
      if (from < 0) return prev;
      const next = prev.slice();
      const [t] = next.splice(from, 1);
      const clamped = Math.max(0, Math.min(toIndex, next.length));
      next.splice(clamped, 0, t);
      return next;
    });
  }, []);

  const relabel = useCallback((id: string, label: string) => {
    setTabs((prev) => prev.map((t) => (t.id === id && t.label !== label ? { ...t, label } : t)));
  }, []);

  return { tabs, activeId, activate, openView, openDetailTab, close, move, relabel };
}
