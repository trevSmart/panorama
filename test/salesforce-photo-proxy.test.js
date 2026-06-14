import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAllowedPhotoUrl } from '../src/server/salesforce-photo-proxy.js';

test('buildAllowedPhotoUrl accepts Salesforce profile photo paths', () => {
  const url = buildAllowedPhotoUrl(
    'acme.my.salesforce.com',
    '/profilephoto/005/F',
  );
  assert.equal(url, 'https://acme.my.salesforce.com/profilephoto/005/F');
});

test('buildAllowedPhotoUrl rejects non-Salesforce hosts', () => {
  assert.equal(buildAllowedPhotoUrl('evil.example.com', '/profilephoto/005/F'), null);
});

test('buildAllowedPhotoUrl rejects path traversal', () => {
  assert.equal(
    buildAllowedPhotoUrl('acme.my.salesforce.com', '/profilephoto/../secret'),
    null,
  );
});

test('buildAllowedPhotoUrl rejects non-profile paths', () => {
  assert.equal(buildAllowedPhotoUrl('acme.my.salesforce.com', '/services/data'), null);
});
