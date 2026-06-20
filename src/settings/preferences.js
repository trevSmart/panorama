const STORAGE_KEY = 'panorama.preferences.v1';
const CONSOLE_SHOW_KEY = 'panorama.console.show';

/** @type {Record<string, string | boolean>} */
const SETTINGS_DEFAULTS = {
  settingsRefreshInterval: '30',
  settingsAutoRefresh: true,
  settingsMaxWait: '180',
  settingsSlaTarget: '80',
  settingsAlertPct: '30',
  settingsDefaultFloorView: '2d',
  settingsShowAvatars: true,
  settingsAnimations: true,
  settingsLang: 'ca',
  settingsTimeFormat: '24h',
  settingsBrowserNotifs: false,
  settingsQueueAlert: true,
  settingsAgentOfflineAlert: true,
  settingsSoundAlert: false,
  settingsShowConsole: false,
};

const PERSISTED_IDS = Object.keys(SETTINGS_DEFAULTS);

/**
 * @returns {Record<string, string | boolean>}
 */
export function loadPreferences() {
  /** @type {Record<string, string | boolean>} */
  let stored = {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) stored = JSON.parse(raw);
  } catch { /* ignore */ }

  const merged = { ...SETTINGS_DEFAULTS, ...stored };
  if (stored.settingsShowConsole === undefined) {
    try {
      merged.settingsShowConsole = localStorage.getItem(CONSOLE_SHOW_KEY) === 'true';
    } catch { /* ignore */ }
  }
  return merged;
}

/**
 * Resolve the data-refresh cadence from saved preferences.
 * @returns {{ intervalMs: number, autoRefresh: boolean }}
 */
export function getRefreshConfig() {
  const prefs = loadPreferences();
  const seconds = Number(prefs.settingsRefreshInterval) || Number(SETTINGS_DEFAULTS.settingsRefreshInterval);
  return {
    intervalMs: Math.max(1, seconds) * 1000,
    autoRefresh: !!prefs.settingsAutoRefresh,
  };
}

/**
 * @param {Record<string, string | boolean>} state
 */
export function savePreferences(state) {
  /** @type {Record<string, string | boolean>} */
  const toSave = {};
  for (const id of PERSISTED_IDS) {
    if (id in state) toSave[id] = state[id];
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    localStorage.setItem(CONSOLE_SHOW_KEY, toSave.settingsShowConsole ? 'true' : 'false');
  } catch { /* ignore */ }
}

/**
 * @param {ParentNode} root
 * @param {Record<string, string | boolean>} prefs
 * @param {(el: HTMLSelectElement) => void} [syncSelect]
 */
export function applyPreferencesToForm(root, prefs, syncSelect) {
  for (const id of PERSISTED_IDS) {
    const el = root.querySelector(`#${id}`);
    if (!el) continue;
    const value = prefs[id];
    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      el.checked = !!value;
    } else if ('value' in el) {
      el.value = String(value);
      if (el.classList.contains('settings-select') && syncSelect) syncSelect(el);
    }
  }
}

/**
 * @param {ParentNode} root
 * @returns {Record<string, string | boolean>}
 */
export function readPreferencesFormState(root) {
  /** @type {Record<string, string | boolean>} */
  const state = {};
  for (const id of PERSISTED_IDS) {
    const el = root.querySelector(`#${id}`);
    if (!el) continue;
    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      state[id] = el.checked;
    } else if ('value' in el) {
      state[id] = el.value;
    }
  }
  return state;
}

/**
 * @param {Record<string, string | boolean>} state
 * @param {{ consolePanel: { show: () => void, hide: (opts?: { persist?: boolean }) => void }, isDevModeOn: () => boolean }} deps
 */
export function applyPreferencesSideEffects(state, deps) {
  if (!deps.isDevModeOn()) return;
  if (state.settingsShowConsole) deps.consolePanel.show();
  else deps.consolePanel.hide({ persist: false });
}
