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

test('formatDurationSec rolls over to days past 24 hours', () => {
  assert.equal(formatDurationSec(86400, { short: true }), '1d');
  assert.equal(formatDurationSec(90000, { short: true }), '1d 1h');
  assert.equal(formatDurationSec(586800, { short: true }), '6d 19h');
  // 163h -> 6d 19h
  assert.equal(formatDurationSec(163 * 3600, { short: true }), '6d 19h');
  // minutes are kept past a day
  assert.equal(formatDurationSec(86400 + 1800, { short: true }), '1d 30m');
  assert.equal(formatDurationSec(90000 + 1800, { short: true }), '1d 1h 30m');
});

test('formatDurationSec long mode rolls over to days, keeping minutes', () => {
  assert.equal(formatDurationSec(86400), '1d');
  assert.equal(formatDurationSec(90061), '1d 1h 1m');
  // only seconds are dropped once we reach days
  assert.equal(formatDurationSec(90130), '1d 1h 2m');
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

test('formatDurationMin rolls over to days past 24 hours', () => {
  assert.equal(formatDurationMin(1440), '1d');
  assert.equal(formatDurationMin(1500), '1d 1h');
  assert.equal(formatDurationMin(9780), '6d 19h');
  // minutes are kept once we reach days
  assert.equal(formatDurationMin(1470), '1d 30m');
  assert.equal(formatDurationMin(1530), '1d 1h 30m');
});
