/** @returns {boolean} */
export function isLiveDataMode() {
  return globalThis.PanoramaProvider?.source === 'salesforce';
}
