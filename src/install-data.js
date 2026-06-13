import { loadRuntimeConfig } from './config.js';
import { createDataProvider } from './data/provider.js';

/**
 * @param {import('./config.js').RuntimeConfig} runtimeConfig
 * @returns {Promise<ReturnType<typeof createDataProvider>>}
 */
export async function installDataLayer(runtimeConfig) {
  let provider = createDataProvider(runtimeConfig);

  if (provider.init) {
    try {
      await provider.init();
    } catch (err) {
      if (runtimeConfig.dataSource === 'salesforce') {
        throw err;
      }
      console.warn('[Panorama] Salesforce data source unavailable, using mock.', err);
      provider = createDataProvider({ ...runtimeConfig, dataSource: 'mock' });
    }
  }

  const bindings = provider.getLegacyBindings();
  Object.assign(globalThis, bindings);

  globalThis.PanoramaProvider = provider;
  globalThis.PanoramaConfig = { ...runtimeConfig, dataSource: provider.source };

  return provider;
}

/** @returns {Promise<import('./config.js').RuntimeConfig>} */
export async function loadAppConfig() {
  return loadRuntimeConfig();
}
