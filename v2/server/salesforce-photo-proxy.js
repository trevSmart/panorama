const ALLOWED_PHOTO_HOST = /^(?:[a-z0-9-]+\.)*(?:salesforce\.com|force\.com)$/i;

/**
 * Builds a fetch URL from allowlisted host and validated path segments.
 * @param {string} host
 * @param {string} path
 * @returns {string|null}
 */
export function buildAllowedPhotoUrl(host, path) {
  const normalizedHost = host.trim().toLowerCase();
  if (!ALLOWED_PHOTO_HOST.test(normalizedHost)) return null;

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!normalizedPath.startsWith('/profilephoto/') || normalizedPath.includes('..')) {
    return null;
  }

  return `https://${normalizedHost}${normalizedPath}`;
}

/**
 * Proxies authenticated Salesforce profile photo requests for the SPA.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
export async function handleSalesforcePhotoRequest(req, res) {
  if (req.method !== 'GET') {
    res.writeHead(405).end('Method not allowed');
    return;
  }

  const requestUrl = new URL(req.url, 'http://localhost');
  const host = requestUrl.searchParams.get('host');
  const path = requestUrl.searchParams.get('path');
  const auth = req.headers.authorization;

  if (!host || !path || !auth?.startsWith('Bearer ')) {
    res.writeHead(400).end('Bad request');
    return;
  }

  const safeUrl = buildAllowedPhotoUrl(host, path);
  if (!safeUrl) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  const sfRes = await fetch(safeUrl, {
    headers: { Authorization: auth, Accept: 'image/*' },
  });

  if (!sfRes.ok) {
    res.writeHead(sfRes.status).end();
    return;
  }

  const contentType = sfRes.headers.get('content-type') || 'image/jpeg';
  const body = Buffer.from(await sfRes.arrayBuffer());
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'private, max-age=300',
  });
  res.end(body);
}
