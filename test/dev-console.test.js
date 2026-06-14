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

test('install captures console.* and still calls originals', () => {
  const calls = [];
  const fakeConsole = {
    log: (...a) => calls.push(['log', ...a]),
    info: (...a) => calls.push(['info', ...a]),
    warn: (...a) => calls.push(['warn', ...a]),
    error: (...a) => calls.push(['error', ...a]),
  };
  const dc = createDevConsole();
  dc.setCapturing(true);
  dc.install(fakeConsole);
  fakeConsole.log('hi');
  fakeConsole.error('boom');
  assert.equal(dc.getEntries().length, 2);
  assert.equal(dc.getEntries()[0].text, 'hi');
  assert.deepEqual(calls, [['log', 'hi'], ['error', 'boom']]);
});

test('install is idempotent (no double-wrapping)', () => {
  const calls = [];
  const fakeConsole = { log: (...a) => calls.push(a), info() {}, warn() {}, error() {} };
  const dc = createDevConsole();
  dc.setCapturing(true);
  dc.install(fakeConsole);
  dc.install(fakeConsole);
  fakeConsole.log('once');
  assert.equal(dc.getEntries().length, 1);
});

test('uninstall restores original console methods', () => {
  const original = () => {};
  const fakeConsole = { log: original, info() {}, warn() {}, error() {} };
  const dc = createDevConsole();
  dc.install(fakeConsole);
  dc.uninstall(fakeConsole);
  assert.equal(fakeConsole.log, original);
});
