/**
 * Builds the UI-facing queue rows for an agent, including the work items
 * currently sitting in each queue for that agent.
 *
 * @param {object} agent
 * @param {Array<{ id?: string, name: string, color?: string }>} queues
 * @returns {Array<{ id?: string, name: string, color: string, workItems: object[] }>}
 */
export function buildAgentQueueSummaries(agent, queues) {
  const queueById = new Map((queues || []).filter((q) => q?.id).map((q) => [q.id, q]));
  const queueByName = new Map((queues || []).filter((q) => q?.name).map((q) => [q.name, q]));
  const summaries = [];
  const seen = new Set();

  const addQueue = (queue) => {
    if (!queue?.name) return null;
    const key = queue.id || queue.name;
    if (seen.has(key)) return summaries.find((summary) => (summary.id || summary.name) === key) || null;
    seen.add(key);
    const summary = {
      id: queue.id,
      name: queue.name,
      color: queue.color || 'var(--accent)',
      workItems: [],
    };
    summaries.push(summary);
    return summary;
  };

  for (const queueId of [...new Set(agent?.queues || [])]) {
    addQueue(queueById.get(queueId));
  }

  const workItems = Array.isArray(agent?.work)
    ? agent.work
    : agent?.work
      ? [agent.work]
      : [];

  for (const item of workItems) {
    const queue = queueById.get(item.queueId || item.q)
      || queueByName.get(item.queue)
      || (item.queue ? { name: item.queue, color: 'var(--accent)' } : null)
      || queueById.get(item.q);
    const summary = addQueue(queue);
    if (summary) summary.workItems.push(item);
  }

  return summaries;
}
