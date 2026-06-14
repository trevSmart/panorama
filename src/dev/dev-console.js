const MAX_ENTRIES = 500;

function safeText(arg) {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return arg.message;
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
    for (const fn of subscribers) {
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
  };
}

export const devConsole = createDevConsole();
