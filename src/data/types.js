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
 * @property {AgentSkill[]|null} [skills] skills assigned to the agent, embedded on the /agents payload
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

/**
 * @typedef {Object} Skill
 * @property {string} id
 * @property {string} name
 * @property {string|null} [type] SkillType label (e.g. 'Language', 'Expertise')
 * @property {number} [agents] number of qualified agents
 * @property {number} [backlog] pending work items routed to this skill
 */

/**
 * A skill assigned to an agent, with the ServiceResourceSkill relationship data.
 * @typedef {Object} AgentSkill
 * @property {string} id ServiceResourceSkill record id
 * @property {string|null} [skillId]
 * @property {string} name
 * @property {string|null} [type]
 * @property {number|null} [level] skill level
 * @property {string|null} [startDate] ISO datetime — effective start
 * @property {string|null} [lastModifiedDate] ISO datetime
 * @property {string|null} [lastModifiedBy] name of the last modifier
 */

/**
 * @typedef {Object} WorkItem
 * @property {string} id
 * @property {string} subject
 * @property {string} [channelKey]
 * @property {string|null} [queueId]
 * @property {string|null} [agentId]
 * @property {'queued'|'assigned'|string} [status]
 * @property {number} [ageSec] seconds since the item entered its current state
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
