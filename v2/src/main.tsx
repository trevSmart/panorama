import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';
import { boot } from './core/bootstrap';
import { initStore } from './store/panoramaStore';
import { bootDevConsole, installDevModeListener } from './dev/devmode';
import { App } from './App';

function fatal(title: string, message: string) {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `<pre style="padding:24px;font-family:monospace;white-space:pre-wrap">${title}: ${message}</pre>`;
  }
}

// Resolve config/auth and install the provider before mounting React, so the
// store has live data from the first render (mirrors src/app.js ordering).
boot()
  .then(({ provider, runtimeConfig }) => {
    initStore(provider);
    // Expose runtime config (like v1's globalThis.__panoramaRuntimeConfig) so the
    // Settings modal can show connection/about details.
    (globalThis as unknown as { __panoramaRuntimeConfig?: unknown }).__panoramaRuntimeConfig = runtimeConfig;
    installDevModeListener();
    bootDevConsole();
    const root = createRoot(document.getElementById('root')!);
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    console.info(`[Panorama v2] data source: ${provider.source}`);
  })
  .catch((err: Error) => {
    console.error('[Panorama v2] boot failed', err);
    fatal('Boot failed', err.message);
  });
