// The vendored framework-agnostic layer (src/lib, aliased as @core) is plain JS
// with JSDoc. This fallback declaration keeps tsc happy for any @core import the
// path mapping can't resolve to a typed module.
declare module '@core/*';
