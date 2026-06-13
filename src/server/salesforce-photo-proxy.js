const ALLOWED_PHOTO_HOST = /^(?:[a-z0-9-]+\.)*(?:salesforce\.com|force\.com)$/i;

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

  const photoUrl = new URL(req.url, 'http://localhost').searchParams.get('url');
  const auth = req.headers.authorization;

  if (!photoUrl || !auth?.startsWith('Bearer ')) {
    res.writeHead(400).end('Bad request');
    return;
  }

  let parsed;
  try {
    parsed = new URL(photoUrl);
  } catch {
    res.writeHead(400).end('Invalid url');
    return;
  }

  if (
    parsed.protocol !== 'https:' ||
    !ALLOWED_PHOTO_HOST.test(parsed.hostname) ||
    !parsed.pathname.startsWith('/profilephoto/') ||
    parsed.pathname.includes('..')
  ) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  const sfRes = await fetch(parsed.toString(), {
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
