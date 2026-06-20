// Port of src/app.js bootstrap, minus the DOM wiring. Resolves runtime config,
// handles the OAuth callback / auth gate, and installs the data provider. The UI
// (React) mounts only after this resolves with a ready provider.
import {
  handleOAuthCallback,
  ensureAuthenticated,
  isOAuthCallbackPath,
  getOAuthCallbackError,
  logout,
  initOAuthSessionStorage,
} from '@core/auth/salesforce-oauth.js';
import { installDataLayer, loadAppConfig } from '@core/install-data.js';
import type { PanoramaProvider } from './types';

export interface BootResult {
  provider: PanoramaProvider;
  runtimeConfig: { dataSource: string; [k: string]: unknown };
}

/**
 * Returns a ready provider, or throws / redirects for the OAuth flow.
 * Mirrors the control flow of src/app.js so auth behaviour is unchanged.
 */
export async function boot(): Promise<BootResult> {
  await initOAuthSessionStorage();
  const runtimeConfig = await loadAppConfig();

  // OAuth callback leg: exchange the code, then bounce back to the app root.
  if (isOAuthCallbackPath()) {
    const params = new URLSearchParams(globalThis.location.search);
    const oauthError = getOAuthCallbackError();
    if (!oauthError && !params.has('code') && !params.has('error')) {
      globalThis.location.replace('/');
    } else if (oauthError) {
      throw new Error(oauthError);
    } else {
      try {
        await handleOAuthCallback(runtimeConfig);
        globalThis.location.replace('/');
      } catch (err) {
        const msg = (err as Error)?.message || '';
        if (/mismatched state|missing.*state|missing or mismatched/i.test(msg)) {
          logout();
          globalThis.location.replace('/');
        } else {
          throw err;
        }
      }
    }
    // A redirect is in flight; never resolves meaningfully.
    return new Promise<BootResult>(() => {});
  }

  if (runtimeConfig.dataSource === 'salesforce') {
    await ensureAuthenticated(runtimeConfig);
  }

  let provider: PanoramaProvider;
  try {
    provider = (await installDataLayer(runtimeConfig)) as PanoramaProvider;
  } catch (err) {
    const msg = (err as Error)?.message || '';
    const authError = /401|INVALID_SESSION|Not authenticated|invalid_grant/i.test(msg);
    if (runtimeConfig.dataSource === 'salesforce' && authError) {
      logout();
      await ensureAuthenticated(runtimeConfig);
      throw err;
    }
    throw err;
  }

  return { provider, runtimeConfig: runtimeConfig as BootResult['runtimeConfig'] };
}
