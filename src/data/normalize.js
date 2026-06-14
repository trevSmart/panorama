/**
 * Maps Apex REST agent DTOs to the UI domain shape expected by app-main.js.
 * @param {object} agent
 */
export function normalizeAgent(agent) {
  return {
    id: agent.id,
    name: agent.name || 'Agent',
    role: agent.role || 'Agent · Operations',
    recordUrl: agent.recordUrl || null,
    status: agent.status || 'offline',
    max: Number(agent.max) || 5,
    used: Number(agent.used) || 0,
    chans: agent.chans || { veu: 0, chat: 0, email: 0, wa: 0, cas: 0 },
    queues: agent.queues || agent.queueIds || [],
    photo: agent.photo || '',
    work: Array.isArray(agent.work) ? agent.work.map(normalizeWorkItem) : (agent.work ?? null),
    skills: Array.isArray(agent.skills) ? agent.skills.map(normalizeAgentSkill) : (agent.skills ?? null),
    workSec: agent.workSec ?? 0,
    loginMin: agent.loginMin ?? 0,
    lastAccept: agent.lastAccept ?? null,
    flag: agent.flag ?? false,
    flagReason: agent.flagReason ?? null,
  };
}

/**
 * Maps an Apex work item DTO to the UI shape used by the agent drawer.
 * @param {object} item
 */
export function normalizeWorkItem(item) {
  return {
    id: item.id,
    recordId: item.recordId || null,
    label: item.label || 'Work item',
    subject: item.subject || '',
    channel: item.channel || '',
    channelKey: item.channelKey || 'cas',
    status: item.status || '',
    queue: item.queue || '',
    queueId: item.queueId || '',
    ageMin: Number(item.ageMin) || 0,
  };
}

/**
 * Maps an Apex skill DTO to the UI shape used by the Skills page.
 * @param {object} skill
 */
export function normalizeSkill(skill) {
  return {
    id: skill.id,
    name: skill.name || 'Skill',
    type: skill.type || null,
    agents: Number(skill.agents) || 0,
    backlog: Number(skill.backlog) || 0,
  };
}

/**
 * Maps an Apex ServiceResourceSkill DTO to the UI shape used by the agent
 * drawer — the skill plus its assignment metadata.
 * @param {object} s
 */
export function normalizeAgentSkill(s) {
  return {
    id: s.id,
    skillId: s.skillId || null,
    name: s.name || 'Skill',
    type: s.type || null,
    level: s.level == null ? null : Number(s.level),
    startDate: s.startDate || null,
    lastModifiedDate: s.lastModifiedDate || null,
    lastModifiedBy: s.lastModifiedBy || null,
  };
}

/**
 * Maps an Apex work-record DTO to the UI shape used by the Work page.
 * Distinct from normalizeWorkItem (the agent-drawer shape).
 * @param {object} item
 */
export function normalizeWorkRecord(item) {
  return {
    id: item.id,
    subject: item.subject || item.label || 'Work item',
    channelKey: item.channelKey || 'cas',
    queueId: item.queueId || null,
    agentId: item.agentId || null,
    status: item.status || (item.agentId ? 'assigned' : 'queued'),
    ageSec: Number(item.ageSec) || (Number(item.ageMin) || 0) * 60,
  };
}

/** @param {object} queue */
export function normalizeQueue(queue) {
  return {
    id: queue.id,
    name: queue.name || 'Queue',
    color: queue.color || '#6A5BE8',
    backlog: Number(queue.backlog) || 0,
    longest: Number(queue.longest) || 0,
    avg: Number(queue.avg) || 0,
    online: Number(queue.online) || 0,
  };
}
