import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { watch } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPublicRuntimeConfig } from "./server/load-env.js";
import { handleOAuthTokenRequest } from "./server/oauth-token-proxy.js";
import { handleSalesforcePhotoRequest } from "./server/salesforce-photo-proxy.js";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const port = Number(process.env.PORT) || 3000;
const devMode = process.env.PANORAMA_DEV === "1";
const devReloadClients = new Set();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const spaPaths = new Set(["/", "/oauth/callback"]);
const devReloadSnippet = devMode
  ? '<script>new EventSource("/api/dev/reload").onmessage=function(){location.reload()};</script>'
  : "";

let devReloadTimer;
function scheduleDevReload() {
  clearTimeout(devReloadTimer);
  devReloadTimer = setTimeout(() => {
    for (const client of devReloadClients) {
      try {
        client.write("data: reload\n\n");
      } catch {
        devReloadClients.delete(client);
      }
    }
  }, 80);
}

createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);

  if (pathname === "/api/config") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(getPublicRuntimeConfig()));
    return;
  }

  if (devMode && pathname === "/api/dev/reload") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    devReloadClients.add(res);
    req.on("close", () => devReloadClients.delete(res));
    return;
  }

  if (pathname === "/api/oauth/token") {
    await handleOAuthTokenRequest(req, res);
    return;
  }

  if (pathname === "/api/salesforce/photo") {
    await handleSalesforcePhotoRequest(req, res);
    return;
  }

  const relativePath = spaPaths.has(pathname) ? "/index.html" : pathname;
  const filePath = join(root, relativePath);

  if (!filePath.startsWith(root)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    let body = await readFile(filePath);
    const type = mimeTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream";
    if (devMode && relativePath === "/index.html") {
      const html = body.toString("utf8").replace("</body>", `${devReloadSnippet}</body>`);
      body = Buffer.from(html, "utf8");
    }
    const headers = { "Content-Type": type };
    if (devMode) headers["Cache-Control"] = "no-store";
    res.writeHead(200, headers).end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(port, () => {
  console.log(`panorama: http://localhost:${port}${devMode ? " (dev reload on)" : ""}`);
  console.log(`panorama: Salesforce OAuth callback → http://localhost:${port}/oauth/callback`);

  if (devMode) {
    // Watch project root for index.html (editors often save via rename).
    watch(root, (_event, filename) => {
      if (filename === "index.html") scheduleDevReload();
    });
    for (const dir of ["assets", "src"]) {
      watch(join(root, dir), { recursive: true }, () => scheduleDevReload());
    }
  }
});
