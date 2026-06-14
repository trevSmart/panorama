/**
 * Panorama Workspace Shell
 *
 * Tab/panel management with an adapter boundary so the UI can migrate to
 * Dockview (or similar) later without rewriting view code.
 *
 * Every tab uses the same persisted shape:
 *   { id, viewType, label, config, pinned? }
 *
 * View-specific data (detail item id, anchor, etc.) lives in `config`.
 * Panel types may define matchConfig / resolveLabel for open-or-focus and restore.
 */
import {
  WORKSPACE_VERSION,
  configMatches,
  findMatchingPanel,
  migrateWorkspaceSnapshot,
  normalizePanel,
} from './workspace-state.js';
import { workspaceTabIconHtml } from './ui/sf-icons.js';
import { syncDropdownPanel } from './ui/dropdown-panel.js';
import { devConsole } from './dev/dev-console.js';

const STORAGE_KEY = 'panorama.workspace.v1';
const PANEL_ATTR = 'data-panel-id';

/** @type {Map<string, object>} */
const registry = new Map();

function uid() {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function matchConfigForType(type, a, b) {
  if (typeof type?.matchConfig === 'function') return type.matchConfig(a || {}, b || {});
  return configMatches(a, b);
}

/**
 * Single-column tab workspace.
 * A future DockviewWorkspace would implement the same surface methods.
 */
class TabWorkspace {
  constructor() {
    /** @type {HTMLElement|null} */
    this.tabBarEl = null;
    /** @type {HTMLElement|null} */
    this.stageEl = null;
    /** @type {HTMLElement|null} */
    this.catalogEl = null;
    this.panels = [];
    this.activeId = null;
    /** @type {Map<string, HTMLElement>} */
    this.containers = new Map();
    this.listeners = new Set();
    this.catalogOpen = false;
    this.catalogCloseTimeoutId = null;
    /** @type {object|null} */
    this.homePanel = null;
    this._dragState = null;
    this._suppressClick = false;
    this._onTabPointerMove = this._onTabPointerMove.bind(this);
    this._onTabPointerUp = this._onTabPointerUp.bind(this);
  }

  init({ tabBarEl, stageEl, catalogEl, homePanel }) {
    this.tabBarEl = tabBarEl;
    this.stageEl = stageEl;
    this.catalogEl = catalogEl;
    this.homePanel = normalizePanel(homePanel || {
      id: 'p-operations',
      viewType: 'operations',
      label: 'Home',
      pinned: true,
    });
    this.tabBarEl.addEventListener('click', (e) => this._onTabBarClick(e));
    this.tabBarEl.addEventListener('keydown', (e) => this._onTabBarKeydown(e));
    this.tabBarEl.addEventListener('pointerdown', (e) => this._onTabPointerDown(e));
    if (this.catalogEl) {
      this.catalogEl.addEventListener('click', (e) => this._onCatalogClick(e));
    }
    document.addEventListener('click', (e) => this._onDocumentClick(e));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.catalogOpen) this._setCatalogOpen(false);
    });
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit(event, payload) {
    this.listeners.forEach((fn) => fn(event, payload, this.snapshot()));
  }

  registerPanelType(def) {
    registry.set(def.viewType, {
      catalog: true,
      allowClose: true,
      ...def,
    });
  }

  getRegistry() {
    return registry;
  }

  getType(viewType) {
    return registry.get(viewType);
  }

  /**
   * @param {{ id?: string, viewType: string, label?: string, config?: object, pinned?: boolean, forceNew?: boolean }} descriptor
   */
  openTab(descriptor) {
    const type = registry.get(descriptor.viewType);
    if (!type) throw new Error(`Unknown panel type: ${descriptor.viewType}`);

    if (!descriptor.forceNew) {
      const existing = findMatchingPanel(
        this.panels,
        descriptor.viewType,
        descriptor.config || {},
        (a, b) => matchConfigForType(type, a, b),
      );
      if (existing) {
        if (descriptor.label && descriptor.label !== existing.label) {
          existing.label = descriptor.label;
          this._renderTabBar();
          this._persist();
        }
        this.activate(existing.id);
        return existing.id;
      }
    }

    const panel = normalizePanel({
      id: descriptor.id || uid(),
      viewType: descriptor.viewType,
      label: descriptor.label || this._resolveLabel(descriptor.viewType, descriptor.config) || type.defaultLabel || descriptor.viewType,
      config: descriptor.config ? { ...descriptor.config } : {},
      pinned: Boolean(descriptor.pinned),
    });

    this.panels.push(panel);
    this._ensureContainer(panel);
    this.activate(panel.id);
    this._persist();
    devConsole.action('tab:open', panel.viewType, panel.label);
    this._emit('open', panel);
    return panel.id;
  }

  close(id) {
    const panel = this.panels.find((p) => p.id === id);
    if (!panel || panel.pinned) return false;
    if (this.panels.length <= 1) return false;

    const type = registry.get(panel.viewType);
    const el = this.containers.get(id);
    if (el && type?.unmount) type.unmount(el, panel.config);
    if (el && type?.deactivate) type.deactivate(el, panel.config);

    el?.remove();
    this.containers.delete(id);
    this.panels = this.panels.filter((p) => p.id !== id);

    if (this.activeId === id) {
      const next = this.panels[this.panels.length - 1];
      this.activate(next.id);
    } else {
      this._renderTabBar();
      this._persist();
    }

    this._emit('close', panel);
    devConsole.action('tab:close', panel.viewType, panel.label);
    return true;
  }

  activate(id) {
    const panel = this.panels.find((p) => p.id === id);
    if (!panel || this.activeId === id) return;

    const prev = this.activePanel();
    if (prev) {
      const prevType = registry.get(prev.viewType);
      const prevEl = this.containers.get(prev.id);
      if (prevEl && prevType?.deactivate) prevType.deactivate(prevEl, prev.config);
    }

    this.activeId = id;
    devConsole.action('view:switch', panel.viewType);
    this._ensureContainer(panel);
    const el = this.containers.get(id);
    const type = registry.get(panel.viewType);

    this.containers.forEach((node, pid) => {
      node.hidden = pid !== id;
    });

    if (el && type?.activate) type.activate(el, panel.config);
    this._renderTabBar();
    this._persist();
    this._emit('activate', panel);
  }

  activePanel() {
    return this.panels.find((p) => p.id === this.activeId) || null;
  }

  activeViewType() {
    return this.activePanel()?.viewType ?? null;
  }

  listPanels() {
    return this.panels.map((p) => ({ ...p, config: { ...p.config } }));
  }

  movePanel(id, toIndex) {
    const fromIndex = this.panels.findIndex((p) => p.id === id);
    if (fromIndex < 0) return false;

    let insertAt = toIndex;
    if (fromIndex < insertAt) insertAt -= 1;
    insertAt = Math.max(0, Math.min(insertAt, this.panels.length - 1));
    if (fromIndex === insertAt) return false;

    const [panel] = this.panels.splice(fromIndex, 1);
    this.panels.splice(insertAt, 0, panel);

    this._renderTabBar();
    this._persist();
    devConsole.action('tab:reorder', panel.viewType, String(insertAt));
    this._emit('reorder', panel);
    return true;
  }

  snapshot() {
    return {
      version: WORKSPACE_VERSION,
      activeId: this.activeId,
      panels: this.listPanels(),
    };
  }

  load(snapshot) {
    const migrated = migrateWorkspaceSnapshot(snapshot, {
      knownViewTypes: [...registry.keys()],
      homePanel: this.homePanel,
    });
    if (!migrated) return false;

    this._teardownAll();
    this.panels = migrated.panels;
    this._refreshPanelLabels();

    const active = this.panels.find((p) => p.id === migrated.activeId);
    this.activeId = null;
    this.panels.forEach((p) => this._ensureContainer(p));
    this.activate(active?.id || this.panels[0].id);
    return true;
  }

  refreshLabels() {
    this._refreshPanelLabels();
    this._renderTabBar();
    this._persist();
  }

  catalogEntries() {
    return [...registry.values()]
      .filter((t) => t.catalog !== false)
      .map((t) => ({
        viewType: t.viewType,
        label: t.defaultLabel || t.viewType,
      }));
  }

  _resolveLabel(viewType, config) {
    const type = registry.get(viewType);
    if (typeof type?.resolveLabel !== 'function') return null;
    return type.resolveLabel(config || {}) || null;
  }

  _refreshPanelLabels() {
    this.panels.forEach((panel) => {
      const label = this._resolveLabel(panel.viewType, panel.config);
      if (label) panel.label = label;
    });
  }

  _teardownAll() {
    this.panels.forEach((panel) => {
      const type = registry.get(panel.viewType);
      const el = this.containers.get(panel.id);
      if (el && type?.unmount) type.unmount(el, panel.config);
      el?.remove();
    });
    this.containers.clear();
    this.panels = [];
    this.activeId = null;
  }

  _ensureContainer(panel) {
    if (this.containers.has(panel.id)) return;

    const type = registry.get(panel.viewType);
    const el = document.createElement('div');
    el.className = 'ws-panel';
    el.setAttribute(PANEL_ATTR, panel.id);
    el.hidden = true;
    this.stageEl.appendChild(el);
    this.containers.set(panel.id, el);

    const api = createPanelApi(this, panel.id);
    if (type?.mount) type.mount(el, panel.config, api);
  }

  _renderTabBar() {
    const tabs = this.panels
      .map((p) => {
        const type = registry.get(p.viewType);
        const icon = typeof type?.renderTabIcon === 'function'
          ? type.renderTabIcon(p.config || {})
          : workspaceTabIconHtml(p.viewType);
        const close = p.pinned
          ? ''
          : `<button type="button" class="ws-tab-close" data-action="close" data-id="${p.id}" aria-label="Close tab">×</button>`;
        return `<div class="ws-tab${p.id === this.activeId ? ' on' : ''}" data-action="activate" data-id="${p.id}" role="tab" tabindex="${p.id === this.activeId ? '0' : '-1'}" aria-selected="${p.id === this.activeId}" title="${escapeHtml(p.label)}">
            ${icon ? `<span class="ws-tab-icon" aria-hidden="true">${icon}</span>` : ''}<span class="ws-tab-label"><span class="ws-tab-label-text">${escapeHtml(p.label)}</span>${close}</span>
          </div>`;
      })
      .join('');

    const add = `<button type="button" class="ws-tab-add" data-action="catalog" aria-label="Open panel" aria-expanded="${this.catalogOpen}">+</button>`;

    this.tabBarEl.innerHTML = tabs + add;
    this._renderCatalog();
  }

  _renderCatalog() {
    if (!this.catalogEl) return;
    const items = this.catalogEntries()
      .map((e) => {
        const icon = workspaceTabIconHtml(e.viewType);
        return `<button type="button" class="ws-catalog-item" data-action="add" data-view="${e.viewType}">${icon}<span class="ws-catalog-label">${escapeHtml(e.label)}</span></button>`;
      })
      .join('');
    this.catalogEl.innerHTML = items;
    this._syncCatalogPanel();
  }

  _syncCatalogPanel() {
    this.catalogCloseTimeoutId = syncDropdownPanel(this.catalogEl, this.catalogOpen, {
      closeTimeoutId: this.catalogCloseTimeoutId,
    });
  }

  _setCatalogOpen(open) {
    this.catalogOpen = open;
    const btn = this.tabBarEl.querySelector('[data-action="catalog"]');
    if (btn) btn.setAttribute('aria-expanded', String(open));
    this._renderCatalog();
    if (open) this._positionCatalog(btn);
  }

  _positionCatalog(btn) {
    if (!this.catalogEl || !btn || !this.catalogEl.offsetParent) return;
    const wrapRect = this.catalogEl.offsetParent.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const right = wrapRect.right - btnRect.right;
    this.catalogEl.style.left = 'auto';
    this.catalogEl.style.right = `${Math.max(0, right)}px`;
  }

  _scrollActiveToTop() {
    const el = this.containers.get(this.activeId);
    if (el && el.scrollHeight > el.clientHeight) {
      el.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  _onTabBarClick(e) {
    if (this._suppressClick) {
      this._suppressClick = false;
      return;
    }

    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    if (btn.dataset.action === 'activate') {
      if (btn.dataset.id === this.activeId) {
        this._scrollActiveToTop();
      } else {
        this.activate(btn.dataset.id);
      }
    } else if (btn.dataset.action === 'close') {
      e.stopPropagation();
      this.close(btn.dataset.id);
    } else if (btn.dataset.action === 'catalog') {
      e.stopPropagation();
      this._setCatalogOpen(!this.catalogOpen);
    }
  }

  _onTabBarKeydown(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;

    const close = e.target.closest('.ws-tab-close[data-action="close"]');
    if (close) {
      e.preventDefault();
      this.close(close.dataset.id);
      return;
    }

    const tab = e.target.closest('.ws-tab[data-action="activate"]');
    if (!tab) return;
    e.preventDefault();
    if (tab.dataset.id === this.activeId) {
      this._scrollActiveToTop();
    } else {
      this.activate(tab.dataset.id);
    }
  }

  _onTabPointerDown(e) {
    const tab = e.target.closest('.ws-tab[data-action="activate"]');
    if (!tab || e.target.closest('.ws-tab-close') || e.button !== 0) return;

    const allTabs = [...this.tabBarEl.querySelectorAll('.ws-tab[data-action="activate"]')];
    const dragIndex = allTabs.indexOf(tab);

    this._dragState = {
      id: tab.dataset.id,
      tab,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      pointerId: e.pointerId,
      dropIndex: dragIndex,
    };

    document.addEventListener('pointermove', this._onTabPointerMove);
    document.addEventListener('pointerup', this._onTabPointerUp);
    document.addEventListener('pointercancel', this._onTabPointerUp);
  }

  _onTabPointerMove(e) {
    const drag = this._dragState;
    if (!drag || e.pointerId !== drag.pointerId) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.active) {
      if (Math.hypot(dx, dy) < 6) return;
      drag.active = true;
      drag.tab.classList.add('is-dragging');
      this.tabBarEl.classList.add('is-reordering');
      this._beginTabDrag(drag, e.clientX);
      try {
        drag.tab.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }

    e.preventDefault();

    this._updateDragTabPosition(drag, e.clientX);

    const newIndex = this._dropIndexAt(e.clientX);
    if (newIndex !== drag.dropIndex) {
      drag.dropIndex = newIndex;
      this._movePlaceholderTo(drag.placeholder, newIndex);
    }
  }

  _beginTabDrag(drag, clientX) {
    const tab = drag.tab;
    const rect = tab.getBoundingClientRect();
    drag.grabOffsetX = clientX - rect.left;

    const placeholder = document.createElement('div');
    placeholder.className = 'ws-tab-placeholder';
    placeholder.style.width = `${rect.width}px`;
    placeholder.style.height = `${rect.height}px`;
    placeholder.setAttribute('aria-hidden', 'true');
    drag.placeholder = placeholder;

    tab.parentNode.insertBefore(placeholder, tab);

    tab.style.position = 'fixed';
    tab.style.top = `${rect.top}px`;
    tab.style.left = `${rect.left}px`;
    tab.style.width = `${rect.width}px`;
    tab.style.margin = '0';
    tab.style.zIndex = '50';
    tab.style.pointerEvents = 'none';
  }

  _updateDragTabPosition(drag, clientX) {
    drag.tab.style.left = `${clientX - drag.grabOffsetX}px`;
  }

  _finishTabDrag(drag) {
    const { tab, placeholder } = drag;
    if (placeholder?.isConnected) {
      this.tabBarEl.insertBefore(tab, placeholder);
      placeholder.remove();
    }
    tab.style.position = '';
    tab.style.top = '';
    tab.style.left = '';
    tab.style.width = '';
    tab.style.margin = '';
    tab.style.zIndex = '';
    tab.style.pointerEvents = '';
  }

  _movePlaceholderTo(placeholder, toIndex) {
    const tabs = [...this.tabBarEl.querySelectorAll('.ws-tab[data-action="activate"]:not(.is-dragging)')];
    const addBtn = this.tabBarEl.querySelector('.ws-tab-add');
    const target = toIndex >= tabs.length ? addBtn : tabs[toIndex];
    this.tabBarEl.insertBefore(placeholder, target ?? null);
  }

  _onTabPointerUp(e) {
    const drag = this._dragState;
    if (!drag || e.pointerId !== drag.pointerId) return;

    document.removeEventListener('pointermove', this._onTabPointerMove);
    document.removeEventListener('pointerup', this._onTabPointerUp);
    document.removeEventListener('pointercancel', this._onTabPointerUp);

    if (drag.active) {
      try {
        drag.tab.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      this._finishTabDrag(drag);
      const tabs = [...this.tabBarEl.querySelectorAll('.ws-tab[data-action="activate"]')];
      const newOrder = tabs.map((t) => t.dataset.id);
      this.panels.sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id));
      this._persist();
      this._emit('reorder', this.panels.find((p) => p.id === drag.id));
      this._suppressClick = true;
    }

    drag.tab.classList.remove('is-dragging');
    this.tabBarEl.classList.remove('is-reordering');
    this._dragState = null;
  }

  _dropIndexAt(clientX) {
    const tabs = [...this.tabBarEl.querySelectorAll('.ws-tab[data-action="activate"]')];
    let insertAt = 0;
    for (const tab of tabs) {
      if (tab.classList.contains('is-dragging')) continue;
      const rect = tab.getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) return insertAt;
      insertAt += 1;
    }
    return insertAt;
  }

  _onCatalogClick(e) {
    const btn = e.target.closest('[data-action="add"]');
    if (!btn) return;
    this.openTab({ viewType: btn.dataset.view });
    this._setCatalogOpen(false);
  }

  _onDocumentClick(e) {
    if (!this.catalogOpen) return;
    if (e.target.closest('.ws-tabs-wrap')) return;
    this._setCatalogOpen(false);
  }

  _persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.snapshot()));
    } catch {
      /* quota / private mode */
    }
  }
}

function createPanelApi(workspace, panelId) {
  return {
    getConfig() {
      const panel = workspace.panels.find((p) => p.id === panelId);
      return panel ? { ...panel.config } : {};
    },
    setConfig(patch) {
      const panel = workspace.panels.find((p) => p.id === panelId);
      if (!panel) return;
      panel.config = { ...panel.config, ...patch };
      workspace._persist();
    },
    relabel(label) {
      const panel = workspace.panels.find((p) => p.id === panelId);
      if (!panel) return;
      panel.label = label;
      workspace._renderTabBar();
      workspace._persist();
    },
  };
}

const adapter = new TabWorkspace();

/** Public API — keep stable for Dockview migration. */
const PanoramaWorkspace = {
  registerPanelType(def) {
    adapter.registerPanelType(def);
  },

  getRegistry() {
    return adapter.getRegistry();
  },

  init(opts) {
    adapter.init(opts);
    const saved = loadPersisted();
    if (saved && adapter.load(saved)) return;
    const defaults = opts.defaults?.length ? opts.defaults : [opts.homePanel || adapter.homePanel];
    defaults.forEach((d) => adapter.openTab({ ...d, forceNew: true }));
  },

  open(descriptor) {
    return adapter.openTab(descriptor);
  },

  openOrFocus(descriptor) {
    return adapter.openTab(descriptor);
  },

  openTab(descriptor) {
    return adapter.openTab(descriptor);
  },

  close(id) {
    return adapter.close(id);
  },

  activate(id) {
    adapter.activate(id);
  },

  activePanel() {
    return adapter.activePanel();
  },

  activeViewType() {
    return adapter.activeViewType();
  },

  listPanels() {
    return adapter.listPanels();
  },

  refreshLabels() {
    adapter.refreshLabels();
  },

  onChange(fn) {
    return adapter.onChange(fn);
  },

  snapshot() {
    return adapter.snapshot();
  },

  reset(defaults) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    adapter._teardownAll();
    (defaults || [adapter.homePanel]).forEach((d) => adapter.openTab({ ...d, forceNew: true }));
  },

  adapterKind: 'tabs',
};

globalThis.PanoramaWorkspace = PanoramaWorkspace;

export { PanoramaWorkspace };
