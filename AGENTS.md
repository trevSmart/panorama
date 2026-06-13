# Panorama

Panorama is a static, client-side single-page operations supervisor dashboard for a contact center. The entire app lives in `index.html` (inline CSS + JS) and is served by a tiny Node static server in `src/index.js`. All data is mock data generated in the browser; there is no backend, database, or authentication.

## Cursor Cloud specific instructions

- Run the app with `npm start` (serves `index.html` + `assets/` on port 3000 via `src/index.js`, override with `PORT`). `npm start` uses only Node built-ins and needs no `node_modules`.
- `npm run dev` runs `live-server` with live reload on port 3000; it requires `npm install` first (`live-server` is the only dependency).
- `npm test` runs `node --test`, but there are currently no test files, so it is a no-op (exits 0). There is no lint setup and no build step.
- The dev server auto-opens a browser via `--open=/`; in a headless cloud VM, just browse to `http://localhost:3000/` instead.
