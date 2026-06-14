import {
  clearOAuthSessionStorage,
  getCachedOAuthSession,
  initOAuthSessionStorage,
  persistOAuthSession,
} from './oauth-session-storage.js';

const STORAGE_PREFIX = 'panorama.oauth.';
const PKCE_VERIFIER_KEY = `${STORAGE_PREFIX}pkce_verifier`;
const STATE_KEY = `${STORAGE_PREFIX}state`;

/** @typedef {{ accessToken: string, refreshToken?: string, instanceUrl: string, expiresAt: number }} OAuthSession */

function storageGet(key, persistent = false) {
  try {
    if (persistent) {
      const value = localStorage.getItem(key);
      if (value != null) return value;
      const legacy = sessionStorage.getItem(key);
      if (legacy != null) {
        localStorage.setItem(key, legacy);
        sessionStorage.removeItem(key);
      }
      return legacy;
    }
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value, persistent = false) {
  try {
    if (persistent) {
      localStorage.setItem(key, value);
      sessionStorage.removeItem(key);
      return;
    }
    sessionStorage.setItem(key, value);
  } catch (err) {
    console.warn('[Panorama] storage write failed', key, err);
  }
}

function storageRemove(key, persistent = false) {
  try {
    if (persistent) {
      localStorage.removeItem(key);
    }
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function base64UrlEncode(bytes) {
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomVerifier(length = 64) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function pkceChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

export { initOAuthSessionStorage };

/** @returns {OAuthSession|null} */
export function getOAuthSession() {
  return getCachedOAuthSession();
}

function isSessionValid(session) {
  return Boolean(session?.accessToken && session?.instanceUrl && session.expiresAt > Date.now() + 60_000);
}

/**
 * @param {{ sfClientId: string, sfLoginUrl: string, sfRedirectUri: string }} config
 */
export function beginLogin(config) {
  const verifier = randomVerifier();
  const state = randomVerifier(32);
  storageSet(PKCE_VERIFIER_KEY, verifier, true);
  storageSet(STATE_KEY, state, true);

  return pkceChallenge(verifier).then((challenge) => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.sfClientId,
      redirect_uri: config.sfRedirectUri,
      scope: 'api refresh_token offline_access',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    globalThis.location.assign(`${config.sfLoginUrl.replace(/\/$/, '')}/services/oauth2/authorize?${params}`);
  });
}

/**
 * @param {{ sfClientId: string, sfLoginUrl: string, sfRedirectUri: string }} config
 * @returns {Promise<OAuthSession>}
 */
export async function handleOAuthCallback(config) {
  const params = new URLSearchParams(globalThis.location.search);
  const error = params.get('error');
  if (error) {
    throw new Error(params.get('error_description') || error);
  }

  const code = params.get('code');
  const state = params.get('state');
  const expectedState = storageGet(STATE_KEY, true);
  const verifier = storageGet(PKCE_VERIFIER_KEY, true);

  if (!code || !state || !verifier || state !== expectedState) {
    storageRemove(STATE_KEY, true);
    storageRemove(PKCE_VERIFIER_KEY, true);
    throw new Error('Invalid OAuth callback (missing or mismatched state).');
  }

  storageRemove(STATE_KEY, true);
  storageRemove(PKCE_VERIFIER_KEY, true);

  const payload = await requestTokenExchange({
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    redirect_uri: config.sfRedirectUri,
  });

  /** @type {OAuthSession} */
  const session = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    instanceUrl: payload.instance_url,
    expiresAt: Date.now() + (Number(payload.expires_in) || 7200) * 1000,
  };
  await persistOAuthSession(session);
  return session;
}

async function requestTokenExchange(body) {
  const res = await fetch('/api/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = payload.error_description || payload.error || `Token exchange failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.code = payload.error;
    throw err;
  }
  return payload;
}

function isRefreshAuthFailure(err) {
  return err?.code === 'invalid_grant'
    || err?.status === 401
    || /invalid.?grant|expired|revoked/i.test(err?.message || '');
}

/**
 * Force a refresh_token exchange even when local expiresAt still looks valid.
 * @param {{ sfClientId: string, sfLoginUrl: string, sfRedirectUri: string }} config
 * @returns {Promise<OAuthSession>}
 */
export async function recoverAccessSession(config) {
  const session = getOAuthSession();
  if (!session?.refreshToken) {
    logout();
    throw new Error('Not authenticated.');
  }
  return refreshAccessToken(config, session);
}

/**
 * @param {{ sfClientId: string, sfLoginUrl: string, sfRedirectUri: string }} config
 * @param {OAuthSession} session
 * @returns {Promise<OAuthSession>}
 */
async function refreshAccessToken(config, session) {
  if (!session.refreshToken) {
    throw new Error('No refresh token available.');
  }

  let payload;
  try {
    payload = await requestTokenExchange({
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
    });
  } catch (err) {
    if (isRefreshAuthFailure(err)) {
      clearOAuthSessionStorage();
    }
    throw err;
  }

  const next = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || session.refreshToken,
    instanceUrl: payload.instance_url || session.instanceUrl,
    expiresAt: Date.now() + (Number(payload.expires_in) || 7200) * 1000,
  };
  await persistOAuthSession(next);
  return next;
}

/**
 * @param {{ sfClientId: string, sfLoginUrl: string, sfRedirectUri: string }} config
 * @returns {Promise<OAuthSession>}
 */
export async function ensureAuthenticated(config) {
  if (!config.sfClientId) {
    throw new Error('SF_CLIENT_ID is not configured. Add it to .env and restart the server.');
  }

  let session = getOAuthSession();
  if (isSessionValid(session)) return session;

  if (session?.refreshToken) {
    try {
      return await refreshAccessToken(config, session);
    } catch (err) {
      console.warn('[Panorama] Session refresh failed, starting new login.', err);
      if (!isRefreshAuthFailure(err) && session && isSessionValid(session)) {
        return session;
      }
    }
  }

  console.info('[Panorama] No valid OAuth session — redirecting to Salesforce login.');
  await beginLogin(config);
  return new Promise(() => { /* redirect in progress */ });
}

/**
 * @param {{ sfClientId: string, sfLoginUrl: string, sfRedirectUri: string }} config
 * @returns {Promise<OAuthSession>}
 */
export async function getValidAccessSession(config) {
  const session = getOAuthSession();
  if (isSessionValid(session)) return session;
  if (session?.refreshToken) {
    return refreshAccessToken(config, session);
  }
  throw new Error('Not authenticated.');
}

export function logout() {
  clearOAuthSessionStorage();
  storageRemove(PKCE_VERIFIER_KEY, true);
  storageRemove(STATE_KEY, true);
}

export function isOAuthCallbackPath() {
  return globalThis.location.pathname === '/oauth/callback';
}

/** @returns {string|null} */
export function getOAuthCallbackError() {
  if (!isOAuthCallbackPath()) return null;
  const params = new URLSearchParams(globalThis.location.search);
  const error = params.get('error');
  if (!error) return null;
  return params.get('error_description')?.replace(/\+/g, ' ') || error;
}
