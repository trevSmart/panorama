// Developer mode + console panel wiring, ported from src/app-main.js (isDevModeOn,
// bootDevConsole, the panorama:devmode listener). The console panel and devConsole
// are @core singletons that manage their own DOM.
import { consolePanel } from '@core/dev/console-panel.js';
import { devConsole } from '@core/dev/dev-console.js';

const DEV_MODE_KEY = 'panorama.developerMode';
const CONSOLE_SHOW_KEY = 'panorama.console.show';

export function isDevModeOn(): boolean {
  return localStorage.getItem(DEV_MODE_KEY) === 'true';
}

export function bootDevConsole(): void {
  if (!isDevModeOn()) return;
  devConsole.install();
  devConsole.setCapturing(true);
  if (localStorage.getItem(CONSOLE_SHOW_KEY) === 'true') consolePanel.show();
}

export function installDevModeListener(): void {
  window.addEventListener('panorama:devmode', (e: Event) => {
    const on = Boolean((e as CustomEvent).detail?.on);
    if (on) {
      devConsole.install();
      devConsole.setCapturing(true);
    } else {
      devConsole.setCapturing(false);
      consolePanel.hide({ persist: false });
    }
  });
}

/** Toggle dev mode, persist it and broadcast — returns the new state. */
export function toggleDevMode(): boolean {
  const next = !isDevModeOn();
  localStorage.setItem(DEV_MODE_KEY, next ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent('panorama:devmode', { detail: { on: next } }));
  return next;
}

export { consolePanel };
