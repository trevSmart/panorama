import { execSync } from 'node:child_process';

const port = Number(process.env.PORT) || 3000;

function freePort(targetPort) {
  if (process.platform === 'win32') {
    try {
      execSync(
        `for /f "tokens=5" %a in ('netstat -ano ^| findstr :${targetPort}') do taskkill /F /PID %a`,
        { stdio: 'ignore', shell: 'cmd.exe' },
      );
    } catch {
      // nothing listening
    }
    return;
  }

  try {
    const pids = execSync(`lsof -ti tcp:${targetPort}`, { encoding: 'utf8' })
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    for (const pid of pids) {
      try {
        process.kill(Number(pid), 'SIGTERM');
        console.log(`panorama: freed port ${targetPort} (pid ${pid})`);
      } catch {
        // already gone
      }
    }
  } catch {
    // nothing listening
  }
}

freePort(port);
