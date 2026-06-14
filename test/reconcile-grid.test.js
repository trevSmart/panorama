import assert from 'node:assert/strict';
import test from 'node:test';

import { reconcileGrid } from '../src/ui/reconcile-grid.js';

// Minimal DOM stand-in: just enough surface for reconcileGrid to operate on.
// Tracks node identity so tests can assert which nodes were reused vs recreated.
let nodeSeq = 0;
function makeEl(html = '') {
  const el = {
    _id: ++nodeSeq,
    children: [],
    _html: html,
    dataset: {},
    setAttribute(name, value) { if (name.startsWith('data-')) this.dataset[name.slice(5)] = value; },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; this.children = []; },
    get firstChild() { return this.children[0] || null; },
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    insertBefore(child, ref) {
      const i = ref ? this.children.indexOf(ref) : this.children.length;
      this.children.splice(i < 0 ? this.children.length : i, 0, child);
      child.parentNode = this;
      return child;
    },
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i >= 0) this.children.splice(i, 1);
      child.parentNode = null;
      return child;
    },
    querySelector() { return null; },
  };
  return el;
}

// reconcileGrid builds new nodes through an injectable createNode(html);
// the fake builds a node whose innerHTML is the card markup and parses the
// data-id out of it so the test can assert on dataset.id.
function createNode(html) {
  const el = makeEl(html);
  const m = /data-id="([^"]+)"/.exec(html);
  if (m) el.dataset.id = m[1];
  return el;
}

function setup(container, items, keyOf, renderItem) {
  return reconcileGrid(container, items, { keyOf, renderItem, createNode });
}

const keyOf = (a) => a.id;
const renderItem = (a) => `<div class="card" data-id="${a.id}">${a.name}</div>`;

test('first render creates one node per item in order', () => {
  const grid = makeEl();
  setup(grid, [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob' }], keyOf, renderItem);

  assert.equal(grid.children.length, 2);
  assert.equal(grid.children[0].dataset.id, 'a');
  assert.equal(grid.children[1].dataset.id, 'b');
});

test('re-render with identical data reuses the same nodes (no recreation)', () => {
  const grid = makeEl();
  const items = [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob' }];
  setup(grid, items, keyOf, renderItem);
  const before = grid.children.map((c) => c._id);

  setup(grid, items, keyOf, renderItem);
  const after = grid.children.map((c) => c._id);

  assert.deepEqual(after, before, 'node identities must be preserved when nothing changed');
});

test('re-render reuses unchanged node and only refreshes the changed one', () => {
  const grid = makeEl();
  setup(grid, [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob' }], keyOf, renderItem);
  const beforeA = grid.children[0]._id;
  const beforeB = grid.children[1]._id;

  setup(grid, [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Bobby' }], keyOf, renderItem);

  assert.equal(grid.children[0]._id, beforeA, 'unchanged item keeps its node');
  assert.equal(grid.children[1]._id, beforeB, 'changed item keeps its node, content updated in place');
  assert.match(grid.children[1].innerHTML, /Bobby/);
});

test('removed items drop their node, surviving items keep theirs', () => {
  const grid = makeEl();
  setup(grid, [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob' }], keyOf, renderItem);
  const beforeA = grid.children[0]._id;

  setup(grid, [{ id: 'a', name: 'Ann' }], keyOf, renderItem);

  assert.equal(grid.children.length, 1);
  assert.equal(grid.children[0]._id, beforeA);
});

test('new items are appended without recreating existing ones', () => {
  const grid = makeEl();
  setup(grid, [{ id: 'a', name: 'Ann' }], keyOf, renderItem);
  const beforeA = grid.children[0]._id;

  setup(grid, [{ id: 'a', name: 'Ann' }, { id: 'c', name: 'Cara' }], keyOf, renderItem);

  assert.equal(grid.children.length, 2);
  assert.equal(grid.children[0]._id, beforeA);
  assert.equal(grid.children[1].dataset.id, 'c');
});

test('reordered items are moved (reused), not recreated', () => {
  const grid = makeEl();
  setup(grid, [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob' }], keyOf, renderItem);
  const idA = grid.children[0]._id;
  const idB = grid.children[1]._id;

  setup(grid, [{ id: 'b', name: 'Bob' }, { id: 'a', name: 'Ann' }], keyOf, renderItem);

  assert.equal(grid.children[0]._id, idB, 'b moved to front, same node');
  assert.equal(grid.children[1]._id, idA, 'a moved to back, same node');
});

test('empty item list renders the provided empty placeholder', () => {
  const grid = makeEl();
  setup(grid, [{ id: 'a', name: 'Ann' }], keyOf, renderItem);

  reconcileGrid(grid, [], {
    keyOf,
    renderItem,
    emptyHTML: '<p>Cap agent</p>',
    createNode,
  });

  assert.equal(grid.children.length, 0);
  assert.match(grid.innerHTML, /Cap agent/);
});
