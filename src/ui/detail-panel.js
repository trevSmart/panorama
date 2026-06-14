/**
 * Generalized detail panels (drawer + full-screen workspace tab).
 *
 * Register kinds with `registerDetailKind(kind, { resolveLabel, resolveTabIcon, render })`.
 * `render(config, ctx)` returns `{ head, actions?, body, afterMount? }`.
 */

const kinds = new Map();

/** @type {{ kind: string, id: string } | null} */
let drawerConfig = null;

const MAXIMIZE_ICON = `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2H2v4M10 2h4v4M10 14h4v-4M6 14H2v-4"/></svg>`;

export function registerDetailKind(kind, def) {
  kinds.set(kind, {
    resolveLabel: () => 'Detail',
    ...def,
  });
}

function kindDef(config) {
  return config?.kind ? kinds.get(config.kind) : null;
}

function resolveDetailLabel(config) {
  const def = kindDef(config);
  if (!def) return 'Detail';
  return def.resolveLabel(config) || 'Detail';
}

export function resolveDetailTabIcon(config) {
  const def = kindDef(config);
  if (!def?.resolveTabIcon) return '';
  return def.resolveTabIcon(config) || '';
}

function detailMatchConfig(a, b) {
  return a?.kind === b?.kind && a?.id === b?.id;
}

function renderContent(config, ctx) {
  const def = kindDef(config);
  if (!def) {
    return {
      head: '<div class="dr-id"><div><div class="nm">Detail unavailable</div></div></div>',
      body: '<p style="color:var(--dim)">This detail panel type is not registered.</p>',
    };
  }
  const content = def.render(config, ctx);
  if (!content) {
    return {
      head: '<div class="dr-id"><div><div class="nm">Not found</div></div></div>',
      body: '<p style="color:var(--dim)">The selected item is no longer available.</p>',
    };
  }
  return content;
}

function assembleHTML(content, mode) {
  const headActions = mode === 'drawer'
    ? `<div class="dr-head-actions">
        <button type="button" class="dr-icon-btn dr-maximize" data-detail-action="maximize" aria-label="Open as full-screen tab" title="Open as tab">${MAXIMIZE_ICON}</button>
        <button type="button" class="dr-icon-btn dr-close" data-detail-action="close" aria-label="Close panel">✕</button>
      </div>`
    : '';
  const head = `<div class="dr-head">${headActions}${content.head}</div>`;
  const actions = content.actions ? `<div class="dr-actions">${content.actions}</div>` : '';
  const body = `<div class="dr-body">${content.body}</div>`;
  return head + actions + body;
}

function detailCtx(mode) {
  return {
    mode,
    openAgent: (id) => openDetailDrawer({ kind: 'agent', id }),
    openQueue: (id) => openDetailDrawer({ kind: 'queue', id }),
  };
}

function mountDetailSurface(root, config, mode) {
  const ctx = detailCtx(mode);
  const content = renderContent(config, ctx);
  root.innerHTML = assembleHTML(content, mode);
  content.afterMount?.(root, config, ctx);

  root.querySelector('[data-detail-action="maximize"]')?.addEventListener('click', () => {
    maximizeDetailPanel(config);
  });
  root.querySelector('[data-detail-action="close"]')?.addEventListener('click', () => {
    closeDetailDrawer();
  });
}

export function openDetailDrawer(config) {
  const drawer = drawerEl();
  const scrim = scrimEl();
  if (!drawer || !scrim) return;

  drawerConfig = { ...config };
  mountDetailSurface(drawer, drawerConfig, 'drawer');
  drawer.classList.add('show');
  scrim.classList.add('show');
}

export function closeDetailDrawer() {
  drawerEl()?.classList.remove('show');
  scrimEl()?.classList.remove('show');
  drawerConfig = null;
}

export function maximizeDetailPanel(config) {
  const label = resolveDetailLabel(config);
  closeDetailDrawer();
  globalThis.Panorama?.open('detail', {
    config: { ...config },
    label,
  });
}

export function mountDetailPanel(container, config) {
  container.innerHTML = '<div class="view view-detail"><div class="detail-panel"></div></div>';
  const panel = container.querySelector('.detail-panel');
  if (panel) mountDetailSurface(panel, config, 'full');
}

function drawerEl() {
  return document.getElementById('drawer');
}

function scrimEl() {
  return document.getElementById('scrim');
}

export function isDetailDrawerOpen() {
  return Boolean(drawerEl()?.classList.contains('show'));
}

export function refreshActiveDetail() {
  if (drawerConfig && isDetailDrawerOpen()) {
    openDetailDrawer(drawerConfig);
  }

  globalThis.PanoramaWorkspace?.refreshLabels?.();

  const ws = globalThis.PanoramaWorkspace;
  const active = ws?.activePanel?.();
  if (active?.viewType !== 'detail') return;

  const el = document.querySelector(`[data-panel-id="${active.id}"]`);
  if (el) mountDetailPanel(el, active.config);
}

export function registerDetailPanelType() {
  globalThis.PanoramaWorkspace.registerPanelType({
    viewType: 'detail',
    defaultLabel: 'Detail',
    catalog: false,
    allowClose: true,
    matchConfig: detailMatchConfig,
    resolveLabel: resolveDetailLabel,
    renderTabIcon: resolveDetailTabIcon,
    mount(container, config) {
      mountDetailPanel(container, config);
    },
    activate(container, config) {
      mountDetailPanel(container, config);
    },
  });
}

export function initDetailDrawerChrome() {
  scrimEl()?.addEventListener('click', closeDetailDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isDetailDrawerOpen()) closeDetailDrawer();
  });
}
