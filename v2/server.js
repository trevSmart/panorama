import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPublicRuntimeConfig } from './server/load-env.js';
import { handleOAuthTokenRequest } from './server/oauth-token-proxy.js';
import { handleSalesforcePhotoRequest } from './server/salesforce-photo-proxy.js';

// Standalone server for the self-contained v2 package. Serves the built SPA from
// dist/ (which bundles its own /assets and /docs) and the /api endpoints. Runs on
// :3000 by default so it matches the Salesforce ECA redirect URI / CORS origin.
const dist = join(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const port = Number(process.env.PORT) || 3000;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// Client-routed paths that should fall back to the SPA shell.
const spaPaths = new Set(['/', '/oauth/callback']);

createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);

  if (pathname === '/api/config') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(getPublicRuntimeConfig()));
    return;
  }
  if (pathname === '/api/oauth/token') {
    await handleOAuthTokenRequest(req, res);
    return;
  }
  if (pathname === '/api/salesforce/photo') {
    await handleSalesforcePhotoRequest(req, res);
    return;
  }

  const relativePath = spaPaths.has(pathname) ? '/index.html' : pathname;
  const filePath = join(dist, relativePath);
  if (!filePath.startsWith(dist)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const body = await readFile(filePath);
    const type = mimeTypes[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type }).end(body);
  } catch {
    // Unknown path → SPA shell (client handles routing) or 404 for assets.
    if (extname(pathname)) {
      res.writeHead(404).end('Not found');
    } else {
      try {
        res.writeHead(200, { 'Content-Type': mimeTypes['.html'] }).end(await readFile(join(dist, 'index.html')));
      } catch {
        res.writeHead(404).end('Build missing — run `npm run build` first.');
      }
    }
  }
}).listen(port, () => {
  console.log(`panorama v2: http://localhost:${port}`);
  console.log('panorama v2: ECA redirect URI path /oauth/callback');
});
