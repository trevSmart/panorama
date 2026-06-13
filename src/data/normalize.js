/**
 * Maps Apex REST agent DTOs to the UI domain shape expected by app-main.js.
 * @param {object} agent
 */
export function normalizeAgent(agent) {
  return {
    id: agent.id,
    name: agent.name || 'Agent',
    role: agent.role || 'Agent · Operations',
    status: agent.status || 'offline',
    max: Number(agent.max) || 5,
    used: Number(agent.used) || 0,
    chans: agent.chans || { veu: 0, chat: 0, email: 0, wa: 0, cas: 0 },
    queues: agent.queues || agent.queueIds || [],
    photo: agent.photo || '',
    work: Array.isArray(agent.work) ? agent.work.map(normalizeWorkItem) : (agent.work ?? null),
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
