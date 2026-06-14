import test from 'node:test';
import assert from 'node:assert/strict';
import {
  configMatches,
  findMatchingPanel,
  migrateWorkspaceSnapshot,
} from '../src/workspace-state.js';

const HOME = {
  id: 'p-operations',
  viewType: 'operations',
  label: 'Home',
  pinned: true,
  config: {},
};

const KNOWN = ['operations', 'agents', 'detail'];

test('migrate keeps detail tabs and active tab across sessions', () => {
  const migrated = migrateWorkspaceSnapshot({
    version: 1,
    activeId: 'p-agent-1',
    panels: [
      HOME,
      { id: 'p-agent-1', viewType: 'detail', label: 'Jane Doe', config: { kind: 'agent', id: 'a1' } },
      { id: 'p-queue-1', viewType: 'detail', label: 'Support', config: { kind: 'queue', id: 'q1' } },
    ],
  }, { knownViewTypes: KNOWN, homePanel: HOME });

  assert.equal(migrated.activeId, 'p-agent-1');
  assert.equal(migrated.panels.length, 3);
  assert.deepEqual(migrated.panels[1].config, { kind: 'agent', id: 'a1' });
});

test('migrate converts legacy overview and misfiled detail tabs', () => {
  const migrated = migrateWorkspaceSnapshot({
    version: 1,
    activeId: 'p-bad',
    panels: [
      { id: 'p-old', viewType: 'overview', label: 'Overview', config: {} },
      { id: 'p-bad', viewType: 'operations', label: 'Jane Doe', config: { kind: 'agent', id: 'a1' }, pinned: false },
    ],
  }, { knownViewTypes: KNOWN, homePanel: HOME });

  assert.equal(migrated.panels[0].viewType, 'operations');
  assert.equal(migrated.panels[0].label, 'Home');
  assert.equal(migrated.panels[1].viewType, 'detail');
  assert.equal(migrated.activeId, 'p-bad');
});

test('migrate drops unknown view types but keeps valid tabs', () => {
  const migrated = migrateWorkspaceSnapshot({
    version: 1,
    activeId: 'p-agent-1',
    panels: [
      HOME,
      { id: 'p-agent-1', viewType: 'detail', label: 'Jane', config: { kind: 'agent', id: 'a1' } },
      { id: 'p-ghost', viewType: 'unknown-view', label: 'Ghost', config: {} },
    ],
  }, { knownViewTypes: KNOWN, homePanel: HOME });

  assert.equal(migrated.panels.length, 2);
});

test('findMatchingPanel uses matcher for detail tabs', () => {
  const panels = [
    { id: '1', viewType: 'detail', config: { kind: 'agent', id: 'a1' } },
    { id: '2', viewType: 'detail', config: { kind: 'agent', id: 'a2' } },
  ];
  const match = (a, b) => a.kind === b.kind && a.id === b.id;
  const found = findMatchingPanel(panels, 'detail', { kind: 'agent', id: 'a2' }, match);
  assert.equal(found.id, '2');
});

test('configMatches compares all config keys', () => {
  assert.equal(configMatches({ anchor: 'queues' }, { anchor: 'queues' }), true);
  assert.equal(configMatches({ anchor: 'queues' }, { anchor: 'agents' }), false);
  assert.equal(configMatches({}, {}), true);
});
