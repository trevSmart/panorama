/** Salesforce Lightning Design System standard icons (local copy in docs/). */
const SLDS_SPRITE = '/docs/salesforce-lightning-design-system-icons/standard-sprite/svg/symbols.svg';

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
