const SESSION_KEY = 'panorama.oauth.session';
const CRYPTO_KEY = 'panorama.oauth.crypto_key';

/** @typedef {{ accessToken: string, refreshToken?: string, instanceUrl: string, expiresAt: number }} OAuthSession */

/** @type {OAuthSession|null} */
let cachedSession = null;

function base64UrlEncode(bytes) {
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getAesKey() {
  let raw = sessionStorage.getItem(CRYPTO_KEY);
  if (!raw) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    raw = base64UrlEncode(bytes);
    sessionStorage.setItem(CRYPTO_KEY, raw);
  }
  return crypto.subtle.importKey('raw', base64UrlDecode(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptPayload(plain) {
  const key = await getAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plain),
  );
  return `${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(cipher))}`;
}

async function decryptPayload(payload) {
  const [ivPart, cipherPart] = payload.split('.');
  if (!ivPart || !cipherPart) return null;
  const key = await getAesKey();
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64UrlDecode(ivPart) },
    key,
    base64UrlDecode(cipherPart),
  );
  return new TextDecoder().decode(plain);
}

async function readStoredSession() {
  const raw = localStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  if (raw.startsWith('{')) {
    try {
      const legacy = JSON.parse(raw);
      await persistOAuthSession(legacy);
      return legacy;
    } catch {
      return null;
    }
  }

  try {
    const plain = await decryptPayload(raw);
    return plain ? JSON.parse(plain) : null;
  } catch {
    return null;
  }
}

export async function initOAuthSessionStorage() {
  cachedSession = await readStoredSession();
}

/** @returns {OAuthSession|null} */
export function getCachedOAuthSession() {
  return cachedSession;
}

/** @param {OAuthSession} session */
export async function persistOAuthSession(session) {
  cachedSession = session;
  const encrypted = await encryptPayload(JSON.stringify(session));
  localStorage.setItem(SESSION_KEY, encrypted);
  sessionStorage.removeItem(SESSION_KEY);
}

export function clearOAuthSessionStorage() {
  cachedSession = null;
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}
