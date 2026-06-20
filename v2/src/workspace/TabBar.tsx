import { useEffect, useRef, useState } from 'react';
import { workspaceTabIconHtml } from '@core/ui/sf-icons.js';
import { detailTabIconHTML } from '../render/v1html';
import { CATALOG, type Tab, type CatalogViewType } from './useWorkspace';

interface Props {
  tabs: Tab[];
  activeId: string;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onMove: (id: string, toIndex: number) => void;
  onOpenView: (viewType: CatalogViewType) => void;
}

// Icon for a tab: detail tabs reuse the matching view icon; view tabs use their own.
function tabIcon(tab: Tab): string {
  if (tab.viewType === 'detail' && tab.config) return detailTabIconHTML(tab.config);
  return workspaceTabIconHtml(tab.viewType);
}

interface DragState {
  id: string;
  el: HTMLElement;
  startX: number;
  startY: number;
  pointerId: number;
  active: boolean;
  dropIndex: number;
  grabOffsetX: number;
  placeholder: HTMLElement | null;
}

export function TabBar({ tabs, activeId, onActivate, onClose, onMove, onOpenView }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  // Set true on drop so the click that follows pointerup doesn't activate the tab.
  const suppressClick = useRef(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const catalogRef = useRef<HTMLDivElement>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  // Holds the document drag listeners while a drag is in flight, so an unmount
  // mid-drag can detach them (the same render's instances are stored on attach).
  const docDrag = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void } | null>(null);

  useEffect(() => () => {
    if (docDrag.current) {
      document.removeEventListener('pointermove', docDrag.current.move);
      document.removeEventListener('pointerup', docDrag.current.up);
      document.removeEventListener('pointercancel', docDrag.current.up);
    }
  }, []);

  useEffect(() => {
    if (!catalogOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!catalogRef.current?.parentElement?.contains(e.target as Node)) setCatalogOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [catalogOpen]);

  // Align the catalog dropdown's right edge with the "+" button so it opens
  // leftward and never overflows the tab bar's right edge (mirrors v1).
  useEffect(() => {
    if (!catalogOpen) return;
    const add = addBtnRef.current;
    const cat = catalogRef.current;
    const wrap = cat?.parentElement;
    if (!add || !cat || !wrap) return;
    const right = wrap.getBoundingClientRect().right - add.getBoundingClientRect().right;
    cat.style.right = `${Math.max(0, right)}px`;
    cat.style.left = 'auto';
  }, [catalogOpen]);

  // Clicking the already-active tab scrolls it back to the top (v1's
  // _scrollActiveToTop). v2 has two scroll models: directory views scroll the
  // window, while the operations view scrolls an inner container (.ops-data), so
  // scroll both the window and the panel's outermost scrollable descendant.
  const scrollActiveToTop = () => {
    const opts: ScrollToOptions = { top: 0, behavior: 'smooth' };
    window.scrollTo(opts);
    const panel = document.querySelector<HTMLElement>(`[data-panel-id="${activeId}"]`);
    if (!panel) return;
    if (panel.scrollHeight > panel.clientHeight) panel.scrollTo(opts);
    for (const el of panel.querySelectorAll<HTMLElement>('div, section')) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 2) {
        el.scrollTo(opts);
        break; // outermost scrollable (querySelectorAll is in document order)
      }
    }
  };

  const activateOrScroll = (id: string) => {
    if (id === activeId) scrollActiveToTop();
    else onActivate(id);
  };

  // Drop index among the *other* tabs (excludes the dragged one), matching the
  // semantics of useWorkspace.move — mirrors v1's _dropIndexAt.
  const dropIndexAt = (clientX: number) => {
    const els = Array.from(barRef.current?.querySelectorAll<HTMLElement>('.ws-tab[data-id]') ?? []);
    let idx = 0;
    for (const el of els) {
      if (el.classList.contains('is-dragging')) continue;
      const r = el.getBoundingClientRect();
      if (clientX < r.left + r.width / 2) return idx;
      idx += 1;
    }
    return idx;
  };

  // Slide the placeholder to the drop slot among the non-dragged tabs.
  const movePlaceholderTo = (placeholder: HTMLElement, toIndex: number) => {
    const bar = barRef.current;
    if (!bar) return;
    const els = Array.from(bar.querySelectorAll<HTMLElement>('.ws-tab[data-id]:not(.is-dragging)'));
    const addBtn = bar.querySelector('.ws-tab-add');
    const target = toIndex >= els.length ? addBtn : els[toIndex];
    bar.insertBefore(placeholder, target ?? null);
  };

  // Lift the tab out of flow (fixed, following the cursor) and drop a placeholder
  // in its slot, so the tab visibly travels with the pointer until release.
  const beginDrag = (d: DragState, clientX: number) => {
    const tab = d.el;
    const rect = tab.getBoundingClientRect();
    d.grabOffsetX = clientX - rect.left;

    const placeholder = document.createElement('div');
    placeholder.className = 'ws-tab-placeholder';
    placeholder.style.width = `${rect.width}px`;
    placeholder.style.height = `${rect.height}px`;
    placeholder.setAttribute('aria-hidden', 'true');
    d.placeholder = placeholder;
    tab.parentNode?.insertBefore(placeholder, tab);

    tab.classList.add('is-dragging');
    barRef.current?.classList.add('is-reordering');
    tab.style.position = 'fixed';
    tab.style.top = `${rect.top}px`;
    tab.style.left = `${rect.left}px`;
    tab.style.width = `${rect.width}px`;
    tab.style.margin = '0';
    tab.style.zIndex = '50';
    tab.style.pointerEvents = 'none';
  };

  const onDocPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    if (!d.active) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 6) return;
      d.active = true;
      beginDrag(d, e.clientX);
    }
    e.preventDefault();
    d.el.style.left = `${e.clientX - d.grabOffsetX}px`;
    const next = dropIndexAt(e.clientX);
    if (next !== d.dropIndex && d.placeholder) {
      d.dropIndex = next;
      movePlaceholderTo(d.placeholder, next);
    }
  };

  const finishDrag = (d: DragState) => {
    const tab = d.el;
    if (d.placeholder?.isConnected) {
      // Settle the tab into the placeholder's slot before clearing styles so it
      // doesn't flash back to its origin before React re-renders the new order.
      tab.parentNode?.insertBefore(tab, d.placeholder);
      d.placeholder.remove();
    }
    tab.classList.remove('is-dragging');
    barRef.current?.classList.remove('is-reordering');
    tab.style.position = '';
    tab.style.top = '';
    tab.style.left = '';
    tab.style.width = '';
    tab.style.margin = '';
    tab.style.zIndex = '';
    tab.style.pointerEvents = '';
  };

  const onDocPointerUp = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    document.removeEventListener('pointermove', onDocPointerMove);
    document.removeEventListener('pointerup', onDocPointerUp);
    document.removeEventListener('pointercancel', onDocPointerUp);
    docDrag.current = null;
    if (d.active) {
      try { d.el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      finishDrag(d);
      suppressClick.current = true;
      onMove(d.id, d.dropIndex);
    }
    drag.current = null;
  };

  const onPointerDown = (e: React.PointerEvent, tab: Tab) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.ws-tab-close')) return;
    const el = e.currentTarget as HTMLElement;
    const els = Array.from(barRef.current?.querySelectorAll<HTMLElement>('.ws-tab[data-id]') ?? []);
    drag.current = {
      id: tab.id,
      el,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      active: false,
      dropIndex: els.indexOf(el),
      grabOffsetX: 0,
      placeholder: null,
    };
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    docDrag.current = { move: onDocPointerMove, up: onDocPointerUp };
    document.addEventListener('pointermove', onDocPointerMove);
    document.addEventListener('pointerup', onDocPointerUp);
    document.addEventListener('pointercancel', onDocPointerUp);
  };

  return (
    <nav className="ws-tabbar" aria-label="Workspace tabs">
      <div className="ws-tabs-wrap">
        <div className="ws-tabs" role="tablist" ref={barRef}>
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`ws-tab ${tab.id === activeId ? 'on' : ''}`}
              data-id={tab.id}
              role="tab"
              tabIndex={tab.id === activeId ? 0 : -1}
              aria-selected={tab.id === activeId}
              title={tab.label}
              onClick={() => {
                if (suppressClick.current) { suppressClick.current = false; return; }
                activateOrScroll(tab.id);
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                if ((e.target as HTMLElement).closest('.ws-tab-close')) { e.preventDefault(); onClose(tab.id); return; }
                e.preventDefault();
                activateOrScroll(tab.id);
              }}
              onPointerDown={(e) => onPointerDown(e, tab)}
            >
              <span className="ws-tab-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: tabIcon(tab) }} />
              <span className="ws-tab-label">
                <span className="ws-tab-label-text">{tab.label}</span>
                {!tab.pinned && (
                  <button
                    type="button"
                    className="ws-tab-close"
                    aria-label="Tanca la pestanya"
                    onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
                  >
                    ×
                  </button>
                )}
              </span>
            </div>
          ))}
          <button
            ref={addBtnRef}
            type="button"
            className="ws-tab-add"
            aria-label="Obre una vista"
            aria-expanded={catalogOpen}
            onClick={(e) => { e.stopPropagation(); setCatalogOpen((o) => !o); }}
          >
            +
          </button>
        </div>
        <div className={`ws-catalog dropdown-panel ${catalogOpen ? 'is-open' : ''}`} role="menu" ref={catalogRef}>
          {CATALOG.map((c) => (
            <button
              key={c.viewType}
              type="button"
              className="ws-catalog-item"
              onClick={() => { onOpenView(c.viewType); setCatalogOpen(false); }}
            >
              <span dangerouslySetInnerHTML={{ __html: workspaceTabIconHtml(c.viewType) }} />
              <span className="ws-catalog-label">{c.label}</span>
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
