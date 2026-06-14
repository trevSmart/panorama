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

test('buffer is capped at 500 entries (FIFO)', () => {
  const dc = createDevConsole();
  dc.setCapturing(true);
  for (let i = 0; i < 510; i++) dc.log('log', `m${i}`);
  const entries = dc.getEntries();
  assert.equal(entries.length, 500);
  assert.equal(entries[0].text, 'm10');
  assert.equal(entries[499].text, 'm509');
});

test('clear empties buffer and emits clear event', () => {
  const dc = createDevConsole();
  dc.setCapturing(true);
  dc.log('log', 'x');
  const events = [];
  dc.subscribe((e) => events.push(e));
  dc.clear();
  assert.equal(dc.getEntries().length, 0);
  assert.deepEqual(events, [{ type: 'clear' }]);
});

test('subscribe receives entry events and unsubscribe stops them', () => {
  const dc = createDevConsole();
  dc.setCapturing(true);
  const events = [];
  const off = dc.subscribe((e) => events.push(e));
  dc.log('info', 'one');
  off();
  dc.log('info', 'two');
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'entry');
  assert.equal(events[0].entry.text, 'one');
});
