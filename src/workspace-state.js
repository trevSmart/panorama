/** @typedef {{ id: string, viewType: string, label: string, config: object, pinned?: boolean }} WorkspacePanel */

export const WORKSPACE_VERSION = 2;

/**
 * Normalize a persisted panel record into the canonical tab shape.
 * @param {Partial<WorkspacePanel>} panel
 * @returns {WorkspacePanel}
 */
export function normalizePanel(panel) {
  return {
    id: panel.id || `p-${Date.now().toString(36)}`,
    viewType: panel.viewType || 'operations',
    label: panel.label || panel.viewType || 'Panel',
    config: { ...(panel.config || {}) },
    pinned: Boolean(panel.pinned),
  };
}

/**
 * Migrate and sanitize persisted workspace tabs.
 * All tabs share the same shape; view-specific data lives in `config`.
 *
 * @param {{ version?: number, activeId?: string, panels?: Partial<WorkspacePanel>[] } | null | undefined} snapshot
 * @param {{ knownViewTypes: string[], homePanel: WorkspacePanel }} opts
 * @returns {{ version: number, activeId: string, panels: WorkspacePanel[] } | null}
 */
export function migrateWorkspaceSnapshot(snapshot, { knownViewTypes, homePanel }) {
  if (!snapshot?.panels?.length) return null;

  const known = new Set(knownViewTypes);
  /** @type {WorkspacePanel[]} */
  let panels = snapshot.panels.map(normalizePanel).map((panel) => {
    if (panel.viewType === 'overview') {
      return {
        ...panel,
        viewType: 'operations',
        label: panel.label === 'Overview' ? 'Home' : panel.label,
        pinned: true,
      };
    }

    if (panel.viewType === 'operations' && (panel.label === 'Operations' || panel.label === 'Overview')) {
      return { ...panel, label: 'Home' };
    }

    // Legacy bug: detail items saved as operations tabs.
    if (panel.viewType === 'operations' && panel.config?.kind && panel.config?.id) {
      return { ...panel, viewType: 'detail', pinned: false };
    }

    return panel;
  }).filter((panel) => known.has(panel.viewType));

  if (!panels.some((p) => p.viewType === 'operations')) {
    panels.unshift(normalizePanel(homePanel));
  } else {
    let homePinned = false;
    panels = panels.map((panel) => {
      if (panel.viewType !== 'operations') return panel;
      if (!homePinned) {
        homePinned = true;
        return { ...panel, pinned: true };
      }
      return { ...panel, pinned: false };
    });
  }

  if (!panels.length) return null;

  const activeId = panels.some((p) => p.id === snapshot.activeId)
    ? snapshot.activeId
    : panels[0].id;

  return {
    version: WORKSPACE_VERSION,
    activeId,
    panels,
  };
}

/**
 * Shallow equality for tab configs (default matcher).
 * @param {object} a
 * @param {object} b
 */
export function configMatches(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) {
    if ((a || {})[k] !== (b || {})[k]) return false;
  }
  return true;
}

/**
 * Find an open tab matching a descriptor.
 * @param {WorkspacePanel[]} panels
 * @param {string} viewType
 * @param {object} config
 * @param {(a: object, b: object) => boolean} matchConfig
 */
export function findMatchingPanel(panels, viewType, config, matchConfig) {
  const nextConfig = config || {};
  return panels.find(
    (p) => p.viewType === viewType && matchConfig(p.config || {}, nextConfig),
  ) || null;
}
