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
  let capturing = false;

  function log(level, ...args) {
    if (!capturing) return;
    const text = args.map(safeText).join(' ');
    entries.push({ ts: Date.now(), level, text });
    if (entries.length > MAX_ENTRIES) entries.shift();
  }

  return {
    log,
    info: (...a) => log('info', ...a),
    warn: (...a) => log('warn', ...a),
    error: (...a) => log('error', ...a),
    action: (...a) => log('action', ...a),
    getEntries: () => entries.slice(),
    setCapturing: (on) => { capturing = !!on; },
    isCapturing: () => capturing,
  };
}

export const devConsole = createDevConsole();
