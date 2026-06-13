import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSalesforceRecordUrl } from '../src/data/salesforce-provider.js';

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
