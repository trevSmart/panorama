import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Look for .env in the v2 package first, then the repository root, so v2 runs
// standalone but also reuses an existing root .env without duplicating secrets.
const here = dirname(fileURLToPath(import.meta.url));
const CANDIDATES = [join(here, '..', '.env'), join(here, '..', '..', '.env')];

/** @returns {Record<string, string>} */
function loadEnvFile() {
  const path = CANDIDATES.find((p) => existsSync(p));
  if (!path) return {};

  const vars = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

export function getPublicRuntimeConfig() {
  const env = { ...process.env, ...loadEnvFile() };
  return {
    sfClientId: env.SF_CLIENT_ID || '',
    sfLoginUrl: env.SF_LOGIN_URL || 'https://login.salesforce.com',
    sfRedirectUri: env.SF_REDIRECT_URI || 'http://localhost:3000/oauth/callback',
  };
}
