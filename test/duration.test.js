import assert from 'node:assert/strict';
import test from 'node:test';

import { formatDurationMin, formatDurationSec, formatWorkTimer } from '../src/ui/duration.js';

test('formatDurationSec keeps sub-minute seconds', () => {
  assert.equal(formatDurationSec(45), '45s');
  assert.equal(formatDurationSec(45, { short: true }), '45s');
});

test('formatDurationSec short mode omits seconds from one minute up', () => {
  assert.equal(formatDurationSec(60, { short: true }), '1m');
  assert.equal(formatDurationSec(90, { short: true }), '2m');
  assert.equal(formatDurationSec(90), '1m 30s');
});

test('formatDurationSec short mode shows hours without seconds', () => {
  assert.equal(formatDurationSec(3600, { short: true }), '1h');
  assert.equal(formatDurationSec(3665, { short: true }), '1h 1m');
  assert.equal(formatDurationSec(82772, { short: true }), '23h');
});

test('formatWorkTimer uses m:ss below one hour', () => {
  assert.equal(formatWorkTimer(90), '1:30');
  assert.equal(formatWorkTimer(3599), '59:59');
});

test('formatWorkTimer shows hours above 60 minutes', () => {
  assert.equal(formatWorkTimer(3600), '1h');
  assert.equal(formatWorkTimer(5400), '1h 30m');
});

test('formatDurationMin shows hours above 60 minutes', () => {
  assert.equal(formatDurationMin(45), '45m');
  assert.equal(formatDurationMin(60), '1h');
  assert.equal(formatDurationMin(90), '1h 30m');
});
