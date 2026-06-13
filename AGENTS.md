# Panorama

Panorama is a single-page, fully client-side web app: a contact-center / call-center supervisor dashboard (UI in Catalan). See `README` and `package.json` for the canonical commands.

## Cursor Cloud specific instructions

- **No backend, no database, no API.** The entire app lives in `index.html` (HTML + inline CSS + inline JS). All data is mock data generated in-browser with `Math.random()`; there are no network calls beyond an optional Google Fonts CDN request (the app falls back to system fonts offline). There is nothing to migrate or seed.
- **Running the app (dev):** `npm run dev` serves the app via `live-server` on port `3000` with live reload on `index.html`/`assets`. It passes `--open=/`, which tries to launch a desktop browser — that is harmless in headless environments; the server still serves at `http://127.0.0.1:3000/`. Alternatively, `npm start` runs a zero-dependency Node static server (`src/index.js`) on port `3000` (override with `PORT`). The two servers are interchangeable; you only need one.
- **Tests/lint:** `npm test` runs `node --test`, but there are currently **no test files** (it reports 0 tests). There is no lint config in the repo.
