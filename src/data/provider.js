import { createMockProvider } from './mock-provider.js';
import { createSalesforceProviderFromConfig } from './salesforce-provider.js';

/**
 * @param {import('../config.js').RuntimeConfig} runtimeConfig
 */
export function createDataProvider(runtimeConfig) {
  if (runtimeConfig.dataSource === 'salesforce') {
    return createSalesforceProviderFromConfig({ runtimeConfig });
  }
  return createMockProvider();
}
