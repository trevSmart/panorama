/** @typedef {'online'|'busy'|'away'|'offline'} PresenceStatus */

/**
 * @typedef {Object} PanoramaCapabilities
 * @property {boolean} canChangePresence
 * @property {boolean} canReassignWork
 * @property {boolean} canChangeQueues
 * @property {boolean} canChangeSkills
 * @property {boolean} canFlagAgent
 * @property {boolean} liveUpdates
 */

/**
 * Domain agent — UI-facing shape, not a Salesforce record.
 * @typedef {Object} Agent
 * @property {string} id
 * @property {string} name
 * @property {string} [role]
 * @property {string|null} [recordUrl]
 * @property {PresenceStatus} status
 * @property {number} max
 * @property {number} used
 * @property {Record<string, number>} [chans]
 * @property {string[]} [queueIds]
 * @property {string[]} [queues]
 * @property {string} [photo]
 * @property {object|null} [work]
 * @property {number} [workSec]
 * @property {number} [loginMin]
 * @property {number|null} [lastAccept]
 * @property {boolean} [flag]
 * @property {string|null} [flagReason]
 */

/**
 * @typedef {Object} Queue
 * @property {string} id
 * @property {string} name
 * @property {string} [color]
 * @property {number} [backlog]
 * @property {number} [longest]
 * @property {number} [avg]
 * @property {number} [online]
 */

/** @typedef {'mock'|'salesforce'} DataSource */

export const READ_ONLY_CAPABILITIES = Object.freeze({
  canChangePresence: false,
  canReassignWork: false,
  canChangeQueues: false,
  canChangeSkills: false,
  canFlagAgent: false,
  liveUpdates: false,
});

export const MOCK_CAPABILITIES = Object.freeze({
  ...READ_ONLY_CAPABILITIES,
  canChangePresence: true,
  canReassignWork: true,
  canChangeQueues: true,
  canChangeSkills: true,
  canFlagAgent: true,
  liveUpdates: true,
});
