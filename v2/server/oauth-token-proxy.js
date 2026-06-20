import { getPublicRuntimeConfig } from './load-env.js';

/**
 * Server-side OAuth token exchange (avoids browser CORS on /services/oauth2/token).
 * @param {Record<string, string>} fields
 */
async function exchangeSalesforceToken(fields) {
  const { sfClientId, sfLoginUrl } = getPublicRuntimeConfig();
  if (!sfClientId) {
    throw new Error('SF_CLIENT_ID is not configured in .env');
  }

  const body = new URLSearchParams({
    client_id: sfClientId,
    ...fields,
  });

  const tokenUrl = `${sfLoginUrl.replace(/\/$/, '')}/services/oauth2/token`;
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = payload.error_description || payload.error || `Token request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  return payload;
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<unknown>}
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
export async function handleOAuthTokenRequest(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = /** @type {{ grant_type?: string, code?: string, code_verifier?: string, redirect_uri?: string, refresh_token?: string }} */ (
      await readJsonBody(req)
    );

    if (body.grant_type === 'authorization_code') {
      if (!body.code || !body.code_verifier || !body.redirect_uri) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Missing code, code_verifier, or redirect_uri' }));
        return;
      }
      const payload = await exchangeSalesforceToken({
        grant_type: 'authorization_code',
        code: body.code,
        code_verifier: body.code_verifier,
        redirect_uri: body.redirect_uri,
      });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(payload));
      return;
    }

    if (body.grant_type === 'refresh_token') {
      if (!body.refresh_token) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Missing refresh_token' }));
        return;
      }
      const payload = await exchangeSalesforceToken({
        grant_type: 'refresh_token',
        refresh_token: body.refresh_token,
      });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(payload));
      return;
    }

    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Unsupported grant_type' }));
  } catch (err) {
    const status = err.status || 500;
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: err.message || 'Token exchange failed' }));
  }
}
