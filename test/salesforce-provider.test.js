import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSalesforceRecordUrl, normalizeCapabilities } from '../src/data/salesforce-provider.js';

test('builds Salesforce record URLs from the instance URL and record id', () => {
  assert.equal(
    buildSalesforceRecordUrl('https://example.my.salesforce.com/', '005000000000001AAA'),
    'https://example.my.salesforce.com/005000000000001AAA',
  );
});

test('returns null when Salesforce record URL parts are missing', () => {
  assert.equal(buildSalesforceRecordUrl('', '005000000000001AAA'), null);
  assert.equal(buildSalesforceRecordUrl('https://example.my.salesforce.com', ''), null);
});

test('normalizeCapabilities coerces present keys to Boolean', () => {
  const caps = normalizeCapabilities({ canChangeSkills: true, canChangeQueues: false });
  assert.equal(caps.canChangeSkills, true);
  assert.equal(caps.canChangeQueues, false);
  assert.equal(caps.canReassignWork, false); // missing -> read-only default
});

test('normalizeCapabilities falls back to read-only on null', () => {
  const caps = normalizeCapabilities(null);
  assert.equal(caps.canChangeSkills, false);
  assert.equal(caps.canChangePresence, false);
  assert.equal(caps.liveUpdates, false);
});
