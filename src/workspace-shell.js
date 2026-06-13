/**
 * Panorama Workspace Shell
 *
 * Tab/panel management with an adapter boundary so the UI can migrate to
 * Dockview (or similar) later without rewriting view code.
 *
 * Contract for panel types (PanelTypeDefinition):
 *   viewType      — stable id, e.g. "overview", "operations"
 *   defaultLabel  — tab title when none is provided
 *   catalog       — show in the "+" picker (default true)
 *   allowClose    — tab can be closed (default true)
 *   mount(el, config, api)    — render into panel container
 *   unmount(el, config)       — optional teardown
 *   activate(el, config)      — optional, panel became visible
 *   deactivate(el, config)    — optional, panel hidden
 *
 * Serialized workspace state is adapter-agnostic:
 *   { version, activeId, panels: [{ id, viewType, label, config, pinned }] }
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'panorama.workspace.v1';
  const PANEL_ATTR = 'data-panel-id';

  /** @type {Map<string, PanelTypeDefinition>} */
  const registry = new Map();

  function uid() {
    return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
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
      /** @type {{ id: string, tab: HTMLElement, startX: number, startY: number, active: boolean, pointerId: number, dropIndex: number }|null} */
      this._dragState = null;
      this._suppressClick = false;
      this._onTabPointerMove = this._onTabPointerMove.bind(this);
      this._onTabPointerUp = this._onTabPointerUp.bind(this);
    }

    init({ tabBarEl, stageEl, catalogEl }) {
      this.tabBarEl = tabBarEl;
      this.stageEl = stageEl;
      this.catalogEl = catalogEl;
      this.tabBarEl.addEventListener('click', (e) => this._onTabBarClick(e));
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
     * @param {{ id?: string, viewType: string, label?: string, config?: object, pinned?: boolean }} descriptor
     */
    open(descriptor) {
      const type = registry.get(descriptor.viewType);
      if (!type) throw new Error(`Unknown panel type: ${descriptor.viewType}`);

      const panel = {
        id: descriptor.id || uid(),
        viewType: descriptor.viewType,
        label: descriptor.label || type.defaultLabel || descriptor.viewType,
        config: descriptor.config ? { ...descriptor.config } : {},
        pinned: Boolean(descriptor.pinned),
      };

      this.panels.push(panel);
      this._ensureContainer(panel);
      this.activate(panel.id);
      this._persist();
      this._emit('open', panel);
      return panel.id;
    }

    close(id) {
      const panel = this.panels.find((p) => p.id === id);
      if (!panel || panel.pinned) return false;
      if (this.panels.length <= 1) return false;

      const type = registry.get(panel.viewType);
      if (type?.allowClose === false) {
        const sameType = this.panels.filter((p) => p.viewType === panel.viewType).length;
        if (sameType <= 1) return false;
      }
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

    /**
     * Open or focus a panel matching viewType + config (shallow).
     */
    openOrFocus(descriptor) {
      const match = this.panels.find(
        (p) => p.viewType === descriptor.viewType && configMatches(p.config, descriptor.config || {}),
      );
      if (match) {
        this.activate(match.id);
        return match.id;
      }
      return this.open(descriptor);
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

    /**
     * @param {string} id
     * @param {number} toIndex — insertion index in the tab strip
     */
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
      this._emit('reorder', panel);
      return true;
    }

    snapshot() {
      return {
        version: 1,
        activeId: this.activeId,
        panels: this.listPanels(),
      };
    }

    load(snapshot) {
      if (!snapshot?.panels?.length) return false;

      this._teardownAll();
      this.panels = snapshot.panels.map((p) => ({
        id: p.id,
        viewType: p.viewType,
        label: p.label,
        config: { ...(p.config || {}) },
        pinned: Boolean(p.pinned),
      }));
      this._normalizePanelPins();

      const active = this.panels.find((p) => p.id === snapshot.activeId);
      this.activeId = null;
      this.panels.forEach((p) => this._ensureContainer(p));
      this.activate(active?.id || this.panels[0].id);
      return true;
    }

    catalogEntries() {
      return [...registry.values()]
        .filter((t) => t.catalog !== false)
        .map((t) => ({
          viewType: t.viewType,
          label: t.defaultLabel || t.viewType,
        }));
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
          const close = p.pinned
            ? ''
            : `<button type="button" class="ws-tab-close" data-action="close" data-id="${p.id}" aria-label="Close tab">×</button>`;
          return `<button type="button" class="ws-tab${p.id === this.activeId ? ' on' : ''}" data-action="activate" data-id="${p.id}" role="tab" aria-selected="${p.id === this.activeId}">
            <span class="ws-tab-label">${escapeHtml(p.label)}</span>${close}
          </button>`;
        })
        .join('');

      const add = `<button type="button" class="ws-tab-add" data-action="catalog" aria-label="Open panel" aria-expanded="${this.catalogOpen}">+</button>`;

      this.tabBarEl.innerHTML = tabs + add;
      this._renderCatalog();
    }

    _renderCatalog() {
      if (!this.catalogEl) return;
      const items = this.catalogEntries()
        .map(
          (e) =>
            `<button type="button" class="ws-catalog-item" data-action="add" data-view="${e.viewType}">${escapeHtml(e.label)}</button>`,
        )
        .join('');
      this.catalogEl.innerHTML = items;
      this.catalogEl.hidden = !this.catalogOpen;
    }

    _setCatalogOpen(open) {
      this.catalogOpen = open;
      const btn = this.tabBarEl.querySelector('[data-action="catalog"]');
      if (btn) btn.setAttribute('aria-expanded', String(open));
      this._renderCatalog();
    }

    _onTabBarClick(e) {
      if (this._suppressClick) {
        this._suppressClick = false;
        return;
      }

      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      if (btn.dataset.action === 'activate') {
        this.activate(btn.dataset.id);
      } else if (btn.dataset.action === 'close') {
        e.stopPropagation();
        this.close(btn.dataset.id);
      } else if (btn.dataset.action === 'catalog') {
        e.stopPropagation();
        this._setCatalogOpen(!this.catalogOpen);
      }
    }

    _onTabPointerDown(e) {
      const tab = e.target.closest('.ws-tab[data-action="activate"]');
      if (!tab || e.target.closest('.ws-tab-close') || e.button !== 0) return;

      const allTabs = [...this.tabBarEl.querySelectorAll('.ws-tab[data-action="activate"]')];
      const dragIndex = allTabs.indexOf(tab);
      // snapshot midpoints of all OTHER tabs in their natural positions
      const tabMidpoints = allTabs
        .filter((t) => t !== tab)
        .map((t) => {
          const r = t.getBoundingClientRect();
          return r.left + r.width / 2;
        });

      this._dragState = {
        id: tab.dataset.id,
        tab,
        startX: e.clientX,
        startY: e.clientY,
        active: false,
        pointerId: e.pointerId,
        dropIndex: dragIndex,
        tabMidpoints,
        originalIndex: dragIndex,
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
      }

      const newIndex = this._dropIndexAt(e.clientX, drag.tabMidpoints);
      if (newIndex !== drag.dropIndex) {
        drag.dropIndex = newIndex;
        this._moveDomTabTo(drag.tab, newIndex);
      }
    }

    _moveDomTabTo(tab, toIndex) {
      const tabs = [...this.tabBarEl.querySelectorAll('.ws-tab[data-action="activate"]')];
      const currentIndex = tabs.indexOf(tab);
      if (currentIndex === toIndex) return;

      // find the reference node to insert before
      const refTab = tabs[toIndex] ?? null;
      if (refTab && refTab !== tab) {
        this.tabBarEl.insertBefore(tab, refTab);
      } else if (!refTab) {
        // insert after the last ws-tab (before the add button if any)
        const addBtn = this.tabBarEl.querySelector('.ws-tab-add');
        this.tabBarEl.insertBefore(tab, addBtn ?? null);
      }
    }

    _onTabPointerUp(e) {
      const drag = this._dragState;
      if (!drag || e.pointerId !== drag.pointerId) return;

      document.removeEventListener('pointermove', this._onTabPointerMove);
      document.removeEventListener('pointerup', this._onTabPointerUp);
      document.removeEventListener('pointercancel', this._onTabPointerUp);

      if (drag.active) {
        // sync the data model to match the DOM order we've built during drag
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

    _dropIndexAt(clientX, midpoints) {
      // midpoints: sorted array of center-X of every tab except the dragged one
      for (let i = 0; i < midpoints.length; i++) {
        if (clientX < midpoints[i]) return i;
      }
      return midpoints.length;
    }

    _normalizePanelPins() {
      let overviewKept = false;
      this.panels.forEach((p) => {
        if (p.viewType !== 'overview') return;
        if (!overviewKept) {
          overviewKept = true;
          p.pinned = true;
        } else {
          p.pinned = false;
        }
      });
    }

    _onCatalogClick(e) {
      const btn = e.target.closest('[data-action="add"]');
      if (!btn) return;
      this.openOrFocus({ viewType: btn.dataset.view });
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

  function configMatches(a, b) {
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    for (const k of keys) {
      if ((a || {})[k] !== (b || {})[k]) return false;
    }
    return true;
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

  const adapter = new TabWorkspace();

  /** Public API — keep stable for Dockview migration. */
  const PanoramaWorkspace = {
    /** Register a view type. Call before init(). */
    registerPanelType(def) {
      adapter.registerPanelType(def);
    },

    getRegistry() {
      return adapter.getRegistry();
    },

    /**
     * @param {{ tabBarEl: HTMLElement, stageEl: HTMLElement, catalogEl?: HTMLElement, defaults?: object[] }} opts
     */
    init(opts) {
      adapter.init(opts);
      const saved = loadPersisted();
      if (saved && adapter.load(saved)) return;
      const defaults = opts.defaults?.length
        ? opts.defaults
        : [{ viewType: 'overview', pinned: true }];
      defaults.forEach((d) => adapter.open(d));
    },

    open(descriptor) {
      return adapter.open(descriptor);
    },

    openOrFocus(descriptor) {
      return adapter.openOrFocus(descriptor);
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
      (defaults || [{ viewType: 'overview', pinned: true }]).forEach((d) => adapter.open(d));
    },

    /** Adapter kind — useful when swapping implementations later. */
    adapterKind: 'tabs',
  };

  global.PanoramaWorkspace = PanoramaWorkspace;
})(typeof window !== 'undefined' ? window : globalThis);
