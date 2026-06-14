const MAX_ENTRIES = 500;

function safeText(arg) {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return arg.stack ?? arg.message;
  try {
    return typeof arg === 'object' && arg !== null ? JSON.stringify(arg) : String(arg);
  } catch {
    return String(arg);
  }
}

export function createDevConsole() {
  const entries = [];
  const subscribers = new Set();
  let capturing = false;

  function emit(event) {
    for (const fn of [...subscribers]) {
      try { fn(event); } catch { /* ignore subscriber errors */ }
    }
  }

  function log(level, ...args) {
    if (!capturing) return;
    const entry = { ts: Date.now(), level, text: args.map(safeText).join(' ') };
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) entries.shift();
    emit({ type: 'entry', entry });
  }

  let installed = false;
  let originals = null;
  let installedTarget = null;
  const LEVELS = ['log', 'info', 'warn', 'error'];

  function install(target = globalThis.console) {
    if (installed || !target) return;
    originals = {};
    for (const level of LEVELS) {
      originals[level] = target[level];
      const orig = target[level];
      target[level] = (...args) => {
        log(level, ...args);
        if (typeof orig === 'function') orig.apply(target, args);
      };
    }
    installedTarget = target;
    installed = true;
  }

  function uninstall(target = globalThis.console) {
    if (!installed || !originals || target !== installedTarget) return;
    for (const level of LEVELS) target[level] = originals[level];
    originals = null;
    installed = false;
    installedTarget = null;
  }

  return {
    log,
    info: (...a) => log('info', ...a),
    warn: (...a) => log('warn', ...a),
    error: (...a) => log('error', ...a),
    action: (...a) => log('action', ...a),
    getEntries: () => entries.slice(),
    clear() { entries.length = 0; emit({ type: 'clear' }); },
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
    setCapturing: (on) => { capturing = !!on; },
    isCapturing: () => capturing,
    install,
    uninstall,
  };
}

export const devConsole = createDevConsole();
