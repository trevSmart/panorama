import { spawn } from "node:child_process";
import net from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT) || 3000;
const devMode = process.argv.includes("--dev") || process.env.PANORAMA_DEV === "1";
const indexPath = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "index.js");

function isPortInUse(targetPort) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port: targetPort, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function isPanoramaRunning() {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/config`, {
      signal: AbortSignal.timeout(1000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function isDevServerRunning() {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/config`, {
      signal: AbortSignal.timeout(1000),
    });
    if (!res.ok) return false;
    const config = await res.json();
    return config.devReload === true;
  } catch {
    return false;
  }
}

function printStartupMessages(runningDev) {
  console.log(`panorama: http://localhost:${port}${runningDev ? " (dev reload on)" : ""}`);
  console.log(`panorama: ECA redirect URI path /oauth/callback (configure in Salesforce, do not open manually)`);
}

async function main() {
  if (await isPanoramaRunning()) {
    printStartupMessages(await isDevServerRunning());
    return;
  }

  if (await isPortInUse(port)) {
    console.error(`panorama: port ${port} is already in use by another process`);
    process.exit(1);
  }

  const env = { ...process.env };
  if (devMode) env.PANORAMA_DEV = "1";

  const nodeArgs = devMode ? ["--watch", indexPath] : [indexPath];
  const child = spawn(process.execPath, nodeArgs, { stdio: "inherit", env });
  child.on("exit", (code) => process.exit(code ?? 0));
}

main();
