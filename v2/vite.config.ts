import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// The framework-agnostic data/auth/config layers are vendored into src/lib so v2
// is a fully self-contained package (nothing imported from outside v2/).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/lib', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // /assets and /docs are bundled in v2/public (self-contained), so Vite
    // serves them locally. Only /api (runtime config, OAuth, photo proxy) needs
    // the Node server.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
    // Emit bundled assets under /static so they don't collide with the shared
    // /assets path (logo, floor backgrounds) the Node server serves from root.
    assetsDir: 'static',
  },
});
