import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAgentQueueSummaries } from '../src/agent-queue-summary.js';

test('builds assigned queue summaries with current live work items', () => {
  const queues = [
    { id: 'q-support', name: 'Support', color: '#D9981F' },
    { id: 'q-sales', name: 'Sales', color: '#15A06A' },
  ];
  const agent = {
    queues: ['q-support', 'q-sales'],
    work: [
      { id: 'w-1', label: 'Case 0001', queueId: 'q-support', queue: 'Support' },
      { id: 'w-2', label: 'Chat transcript', queueId: 'q-support', queue: 'Support' },
    ],
  };

  assert.deepEqual(buildAgentQueueSummaries(agent, queues), [
    {
      id: 'q-support',
      name: 'Support',
      color: '#D9981F',
      workItems: agent.work,
    },
    {
      id: 'q-sales',
      name: 'Sales',
      color: '#15A06A',
      workItems: [],
    },
  ]);
});

test('adds live work queues that are missing from assigned queue ids', () => {
  const agent = {
    queues: [],
    work: [
      { id: 'w-1', label: 'Case 0001', queueId: '', queue: 'Escalations' },
    ],
  };

  assert.deepEqual(buildAgentQueueSummaries(agent, []), [
    {
      id: undefined,
      name: 'Escalations',
      color: 'var(--accent)',
      workItems: agent.work,
    },
  ]);
});
