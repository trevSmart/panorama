import js from '@eslint/js';
import globals from 'globals';

export default [
  // Ignores globals (substitueix .eslintignore, que ja no existeix a flat config)
  {
    ignores: [
      'node_modules/**',
      'force-app/**',
      'assets/**',
      'tmp/**',
      '.sfdx/**',
      '.sf/**',
      // Artefactes de build (bundles minificats generats per Vite)
      'dist/**',
      'v2/dist/**',
    ],
  },

  // Regles recomanades d'ESLint
  js.configs.recommended,

  // Base comuna a tot el codi font (ESM)
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
  },

  // Codi de navegador: UI, data, render…
  {
    files: ['src/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        // Llibreria de tercers carregada globalment (Three.js)
        THREE: 'readonly',
        // Façana del workspace assignada a globalThis a workspace-shell.js
        PanoramaWorkspace: 'readonly',
      },
    },
  },

  // Codi de Node: punt d'entrada, servidor, auth i scripts
  {
    files: [
      'src/index.js',
      'src/server/**/*.js',
      'src/auth/**/*.js',
      'scripts/**/*.js',
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Tests amb node:test
  {
    files: ['test/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // v2: codi de navegador (UI, data, lib…)
  {
    files: ['v2/src/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        // Façana del workspace assignada a globalThis a workspace-shell.js
        PanoramaWorkspace: 'readonly',
      },
    },
  },

  // v2: codi de Node (servidor, proxies, càrrega d'entorn)
  {
    files: ['v2/server.js', 'v2/server/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
