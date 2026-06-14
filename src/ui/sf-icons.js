/** Salesforce Lightning Design System standard icons (local copy in docs/). */
const SLDS_SPRITE = '/docs/salesforce-lightning-design-system-icons/standard-sprite/svg/symbols.svg';
const SLDS_CUSTOM_SPRITE = '/docs/salesforce-lightning-design-system-icons/custom-sprite/svg/symbols.svg';

/** Workspace nav tab icons (standard:… and custom:… SLDS sprite refs). */
export const WORKSPACE_TAB_ICONS = {
  operations: { ref: 'custom:custom107', bg: '#5867E8' },
  'floor-editor': { ref: 'custom:custom24', bg: '#939393' },
  agents: { ref: 'custom:custom103', bg: '#34BECD' },
  work: { ref: 'standard:work_order_item', bg: '#6E4534' },
  skills: { ref: 'standard:skill', bg: '#F88962' },
};

/** @type {Record<string, string>} Symbol id in standard-sprite (same as SLDS icon name). */
export const SF_ICON_SYMBOLS = {
  queue: 'queue',
  skill: 'skill',
  user: 'user',
  case: 'case',
  voice: 'voice_call',
  chat: 'live_chat',
  email: 'email',
  whatsapp: 'whatsapp',
  work: 'work_order',
};

/** Background colors aligned with Salesforce Lightning object icons. */
export const SF_ICON_COLORS = {
  queue: '#5867E8',
  skill: '#F88962',
  user: '#34BECD',
  case: '#FF538A',
  voice: '#9050E9',
  chat: '#FF538A',
  email: '#95AEC5',
  whatsapp: '#1FA076',
  work: '#6CA1E9',
};

/** Omni / work channel keys → SLDS standard icon name. */
export const CHANNEL_SF_ICON = {
  veu: 'voice',
  chat: 'chat',
  email: 'email',
  wa: 'whatsapp',
  cas: 'case',
};

/** @param {string} name */
export function sfIconSymbolId(name) {
  return SF_ICON_SYMBOLS[name] ?? SF_ICON_SYMBOLS.case;
}

/** @param {string} name */
export function sfIconColor(name) {
  return SF_ICON_COLORS[name] ?? '#5867E8';
}

/**
 * @param {string} ref SLDS icon ref, e.g. `standard:skill` or `custom:custom107`
 * @returns {{ sprite: string, symbol: string }}
 */
export function parseSldsIconRef(ref) {
  const sep = ref.indexOf(':');
  if (sep === -1) return { sprite: SLDS_SPRITE, symbol: ref };
  const category = ref.slice(0, sep);
  return {
    sprite: category === 'custom' ? SLDS_CUSTOM_SPRITE : SLDS_SPRITE,
    symbol: ref.slice(sep + 1),
  };
}

/**
 * Inline SVG from an SLDS sprite ref.
 * @param {string} ref
 * @param {string} [className]
 */
export function sldsIconRefHtml(ref, className = 'sf-icon') {
  const { sprite, symbol } = parseSldsIconRef(ref);
  return `<svg class="${className}" aria-hidden="true"><use href="${sprite}#${symbol}"></use></svg>`;
}

/**
 * Colored tile with an SLDS icon from a sprite ref.
 * @param {string} ref
 * @param {{ size?: number, bg?: string, className?: string }} [opts]
 */
export function sldsIconRefTileHtml(ref, { size = 30, bg, className = 'sf-icon-tile' } = {}) {
  const { symbol } = parseSldsIconRef(ref);
  const color = bg ?? sfIconColor(symbol);
  return `<span class="${className}" style="width:${size}px;height:${size}px;background:${color}">${sldsIconRefHtml(ref)}</span>`;
}

/** @param {string} viewType */
export function workspaceTabIconHtml(viewType) {
  const def = WORKSPACE_TAB_ICONS[viewType];
  if (!def) return '';
  return sldsIconRefTileHtml(def.ref, {
    size: 18,
    bg: def.bg,
    className: 'sf-icon-tile ws-tab-icon-tile',
  });
}

/**
 * Inline SVG from the SLDS standard sprite — same pattern as slds-icon + use.
 * @param {string} name
 * @param {string} [className]
 */
export function sfIconHtml(name, className = 'sf-icon') {
  const id = sfIconSymbolId(name);
  return `<svg class="${className}" aria-hidden="true"><use href="${SLDS_SPRITE}#${id}"></use></svg>`;
}

/**
 * Colored tile with an SLDS standard icon (slds-icon_container treatment).
 * The SVG fills the tile; internal padding comes from the sprite artwork only.
 * @param {string} name
 * @param {{ size?: number, bg?: string, className?: string }} [opts]
 */
export function sfIconTileHtml(name, { size = 30, bg, className = 'sf-icon-tile' } = {}) {
  const color = bg ?? sfIconColor(name);
  return `<span class="${className}" style="width:${size}px;height:${size}px;background:${color}">${sfIconHtml(name)}</span>`;
}

/** @param {string} channelKey */
export function channelIconName(channelKey) {
  return CHANNEL_SF_ICON[channelKey] ?? 'case';
}

/**
 * @param {string} channelKey
 * @param {{ size?: number, bg?: string, className?: string }} [opts]
 */
export function channelIconTileHtml(channelKey, opts = {}) {
  return sfIconTileHtml(channelIconName(channelKey), opts);
}

/** Skill entity tiles — accent matches tabs, drawers, and directory cards. */
export function skillIconTileHtml(opts = {}) {
  return sfIconTileHtml('skill', { bg: 'var(--accent)', ...opts });
}
