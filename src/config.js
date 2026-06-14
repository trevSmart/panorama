import { devConsole } from './dev/dev-console.js';

/** @typedef {import('./data/types.js').DataSource} DataSource */

/**
 * @typedef {Object} RuntimeConfig
 * @property {DataSource} dataSource
 * @property {string} apiBaseUrl
 * @property {string} sfClientId
 * @property {string} sfLoginUrl
 * @property {string} sfRedirectUri
 */

let cachedConfig = null;

const DATA_SOURCE_KEY = 'panorama.dataSource';

/**
 * Loads runtime config from the dev server (`/api/config`) and URL overrides.
 * @returns {Promise<RuntimeConfig>}
 */
export async function loadRuntimeConfig() {
  if (cachedConfig) return cachedConfig;

  const params = new URLSearchParams(globalThis.location?.search ?? '');
  const sourceParam = params.get('source');
  const isSfParam = sourceParam === 'sf' || sourceParam === 'salesforce';
  if (isSfParam) {
    try { localStorage.setItem(DATA_SOURCE_KEY, 'salesforce'); } catch { /* ignore */ }
  } else if (sourceParam === 'mock') {
    try { localStorage.setItem(DATA_SOURCE_KEY, 'mock'); } catch { /* ignore */ }
  }

  let storedSource = null;
  try { storedSource = localStorage.getItem(DATA_SOURCE_KEY); } catch { /* ignore */ }

  /** @type {Partial<RuntimeConfig>} */
  let serverConfig = {};
  try {
    devConsole.api('GET', '/api/config');
    const res = await fetch('/api/config', { headers: { Accept: 'application/json' } });
    if (res.ok) {
      serverConfig = await res.json();
    } else {
      console.warn('[Panorama] /api/config unavailable — run `npm start` or `npm run dev` (not a static file server).');
    }
  } catch {
    console.warn('[Panorama] /api/config unavailable — run `npm start` or `npm run dev` (not a static file server).');
  }

  const sfConfigured = Boolean(serverConfig.sfClientId);
  const wantsSalesforce = isSfParam || storedSource === 'salesforce';
  let dataSource = sourceParam === 'mock' || (sourceParam === null && storedSource === 'mock')
    ? 'mock'
    : wantsSalesforce
      ? 'salesforce'
      : sfConfigured
        ? 'salesforce'
        : 'mock';

  if (dataSource === 'salesforce' && !sfConfigured) {
    if (wantsSalesforce) {
      console.warn('[Panorama] SF_CLIENT_ID missing — add it to .env and restart the server.');
    } else {
      console.warn('[Panorama] SF_CLIENT_ID not configured — using mock data. Add ?source=sf after configuring .env.');
      dataSource = 'mock';
    }
  }

  cachedConfig = {
    dataSource,
    apiBaseUrl: params.get('api') || '/services/apexrest/panorama/v1',
    sfClientId: serverConfig.sfClientId || '',
    sfLoginUrl: serverConfig.sfLoginUrl || 'https://login.salesforce.com',
    sfRedirectUri: serverConfig.sfRedirectUri || `${globalThis.location.origin}/oauth/callback`,
  };

  return cachedConfig;
}

/** @deprecated Use loadRuntimeConfig() */
export function getConfig() {
  const params = new URLSearchParams(globalThis.location?.search ?? '');
  return {
    dataSource: params.get('source') === 'mock' ? 'mock' : 'salesforce',
    apiBaseUrl: params.get('api') || '/services/apexrest/panorama/v1',
  };
}
