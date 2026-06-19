import assert from 'node:assert/strict';
import test from 'node:test';
import { diffSkills } from '../src/ui/skill-edit.js';

test('diffSkills detects add, remove, and level change', () => {
  const current = [
    { skillId: 'A', level: 1 },
    { skillId: 'B', level: 3 },
  ];
  const selected = [
    { skillId: 'A', level: 5 }, // level change
    { skillId: 'C', level: 2 }, // added (B dropped)
  ];
  const changes = diffSkills(current, selected);
  // Order-independent assertions
  const byId = Object.fromEntries(changes.map((c) => [c.skillId, c]));
  assert.deepEqual(byId.A, { skillId: 'A', level: 5 });
  assert.deepEqual(byId.C, { skillId: 'C', level: 2 });
  assert.deepEqual(byId.B, { skillId: 'B', remove: true });
  assert.equal(changes.length, 3);
});

test('diffSkills returns empty when nothing changed', () => {
  const same = [{ skillId: 'A', level: 1 }];
  assert.deepEqual(diffSkills(same, [{ skillId: 'A', level: 1 }]), []);
});
