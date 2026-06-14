import assert from 'node:assert/strict';
import test from 'node:test';

import { createDevConsole } from '../src/dev/dev-console.js';

test('log adds an entry with level and text', () => {
  const dc = createDevConsole();
  dc.setCapturing(true);
  dc.log('info', 'hola', 42);
  const entries = dc.getEntries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].level, 'info');
  assert.equal(entries[0].text, 'hola 42');
  assert.equal(typeof entries[0].ts, 'number');
});

test('convenience methods set their level', () => {
  const dc = createDevConsole();
  dc.setCapturing(true);
  dc.info('a'); dc.warn('b'); dc.error('c'); dc.action('d');
  assert.deepEqual(dc.getEntries().map(e => e.level), ['info', 'warn', 'error', 'action']);
});

test('does not capture when capturing is off', () => {
  const dc = createDevConsole();
  dc.log('info', 'ignored');
  assert.equal(dc.getEntries().length, 0);
});
