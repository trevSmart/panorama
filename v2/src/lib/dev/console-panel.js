// src/dev/console-panel.js
import { devConsole } from './dev-console.js';

const HEIGHT_KEY = 'panorama.console.height';
const MINIMIZED_KEY = 'panorama.console.minimized';
const MINIMIZED_HEIGHT = 32;
const TRANSITION_MS = 180;
const LEVELS = ['log', 'info', 'warn', 'error', 'action', 'api'];

function fmtTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function createPanel() {
  let root = null;
  let bodyEl = null;
  let searchEl = null;
  let previewEl = null;
  let minimized = false;
  let transitioning = false;
  const activeLevels = new Set(LEVELS);

  function passesFilter(entry) {
    if (!activeLevels.has(entry.level)) return false;
    const q = (searchEl?.value || '').toLowerCase();
    return !q || entry.text.toLowerCase().includes(q);
  }

  function updatePreview(entry) {
    if (!previewEl) return;
    const tsEl = previewEl.querySelector('.dev-console-ts');
    const levelEl = previewEl.querySelector('.dev-console-level');
    const msgEl = previewEl.querySelector('.dev-console-msg');
    if (!entry) {
      tsEl.textContent = '';
      levelEl.textContent = '';
      levelEl.className = 'dev-console-level';
      msgEl.textContent = 'No output';
      return;
    }
    tsEl.textContent = fmtTime(entry.ts);
    levelEl.textContent = entry.level;
    levelEl.className = `dev-console-level dev-console-level--${entry.level}`;
    msgEl.textContent = entry.text;
  }

  function updatePreviewFromLastEntry() {
    const entries = devConsole.getEntries();
    updatePreview(entries[entries.length - 1]);
  }

  function applyMinimizedChrome() {
    if (!root) return;
    root.classList.toggle('dev-console--minimized', minimized);
    const expandBtn = root.querySelector('[data-action="expand"]');
    if (expandBtn) expandBtn.hidden = !minimized;
    if (previewEl) previewEl.setAttribute('aria-hidden', String(!minimized));
  }

  function finishTransition(done) {
    let finished = false;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      transitioning = false;
      document.body.classList.remove('dev-console-transitioning');
      document.body.removeEventListener('transitionend', onEnd);
      done();
    };
    const onEnd = (e) => {
      if (e.target !== document.body || e.propertyName !== '--dev-console-height') return;
      cleanup();
    };
    document.body.addEventListener('transitionend', onEnd);
    setTimeout(cleanup, TRANSITION_MS + 40);
  }

  function setMinimized(next, { animate = true } = {}) {
    if (next === minimized || transitioning) return;
    minimized = !!next;
    if (!root) return;

    const targetH = minimized
      ? MINIMIZED_HEIGHT
      : (Number(localStorage.getItem(HEIGHT_KEY)) || 240);

    try { localStorage.setItem(MINIMIZED_KEY, minimized ? 'true' : 'false'); } catch { /* ignore */ }

    if (!animate) {
      applyMinimizedChrome();
      document.body.style.setProperty('--dev-console-height', targetH + 'px');
      return;
    }

    transitioning = true;
    document.body.classList.add('dev-console-transitioning');
    document.body.style.setProperty('--dev-console-height', targetH + 'px');
    finishTransition(() => applyMinimizedChrome());
  }

  function createLine(entry) {
    const line = document.createElement('div');
    line.className = 'dev-console-line';
    line.innerHTML =
      `<span class="dev-console-ts">${fmtTime(entry.ts)}</span>` +
      `<span class="dev-console-level dev-console-level--${entry.level}">${entry.level}</span>` +
      `<span class="dev-console-msg"></span>`;
    line.querySelector('.dev-console-msg').textContent = entry.text;
    return line;
  }

  function prependLine(entry) {
    if (!bodyEl || !passesFilter(entry)) return;
    const atTop = bodyEl.scrollTop <= 8;
    bodyEl.prepend(createLine(entry));
    if (atTop) bodyEl.scrollTop = 0;
  }

  function rerender() {
    if (!bodyEl) return;
    bodyEl.replaceChildren();
    for (const entry of [...devConsole.getEntries()].reverse()) {
      if (passesFilter(entry)) bodyEl.appendChild(createLine(entry));
    }
  }

  function build() {
    if (root) return;
    const savedHeight = Number(localStorage.getItem(HEIGHT_KEY)) || 240;
    document.body.style.setProperty('--dev-console-height', savedHeight + 'px');

    root = document.createElement('div');
    root.className = 'dev-console';
    root.innerHTML = `
      <div class="dev-console-resize"></div>
      <div class="dev-console-head">
        <span class="dev-console-title">Console</span>
        <div class="dev-console-preview" aria-hidden="true">
          <span class="dev-console-ts"></span>
          <span class="dev-console-level"></span>
          <span class="dev-console-msg"></span>
        </div>
        <div class="dev-console-head-hit" aria-hidden="true"></div>
        <div class="dev-console-toolbar">
          <input class="dev-console-search" type="text" placeholder="Filter…">
          ${LEVELS.map(l => `<button class="dev-console-filter" data-level="${l}" aria-pressed="true">${l}</button>`).join('')}
          <div class="dev-console-actions">
            <button class="dev-console-btn" data-action="clear">Clear</button>
            <button class="dev-console-btn" data-action="expand" title="Expand" hidden>▲</button>
            <button class="dev-console-btn" data-action="close" title="Close">✕</button>
          </div>
        </div>
      </div>
      <div class="dev-console-body"></div>`;
    document.body.appendChild(root);

    bodyEl = root.querySelector('.dev-console-body');
    searchEl = root.querySelector('.dev-console-search');
    previewEl = root.querySelector('.dev-console-preview');

    searchEl.addEventListener('input', rerender);
    root.querySelector('.dev-console-head-hit').addEventListener('click', () => {
      if (!minimized && !transitioning) setMinimized(true);
    });
    root.querySelector('.dev-console-head').addEventListener('click', (e) => {
      if (minimized && !transitioning && !e.target.closest('button')) setMinimized(false);
    });
    root.querySelectorAll('.dev-console-filter').forEach((btn) => {
      btn.addEventListener('click', () => {
        const lvl = btn.dataset.level;
        if (activeLevels.has(lvl)) { activeLevels.delete(lvl); btn.setAttribute('aria-pressed', 'false'); }
        else { activeLevels.add(lvl); btn.setAttribute('aria-pressed', 'true'); }
        rerender();
      });
    });
    root.querySelector('[data-action="clear"]').addEventListener('click', () => devConsole.clear());
    root.querySelector('[data-action="expand"]').addEventListener('click', (e) => {
      e.stopPropagation();
      setMinimized(false);
    });
    root.querySelector('[data-action="close"]').addEventListener('click', () => hide());

    attachResize(root.querySelector('.dev-console-resize'), savedHeight);

    devConsole.subscribe((e) => {
      if (e.type === 'clear') {
        updatePreview();
        rerender();
      } else {
        updatePreview(e.entry);
        prependLine(e.entry);
      }
    });

    updatePreviewFromLastEntry();
    if (localStorage.getItem(MINIMIZED_KEY) === 'true') setMinimized(true, { animate: false });
  }

  function attachResize(handle, initial) {
    let startY = 0;
    let startH = initial;
    const onMove = (e) => {
      if (minimized) return;
      document.body.classList.remove('dev-console-transitioning');
      const h = Math.min(window.innerHeight * 0.6, Math.max(120, startH + (startY - e.clientY)));
      document.body.style.setProperty('--dev-console-height', h + 'px');
    };
    const onUp = () => {
      if (minimized) return;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const cur = getComputedStyle(document.body).getPropertyValue('--dev-console-height').trim();
      localStorage.setItem(HEIGHT_KEY, parseInt(cur, 10) || 240);
    };
    handle.addEventListener('mousedown', (e) => {
      if (minimized) return;
      startY = e.clientY;
      startH = parseInt(getComputedStyle(document.body).getPropertyValue('--dev-console-height'), 10) || 240;
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      e.preventDefault();
    });
  }

  function show() {
    build();
    root.hidden = false;
    const targetH = minimized
      ? MINIMIZED_HEIGHT
      : (Number(localStorage.getItem(HEIGHT_KEY)) || 240);
    applyMinimizedChrome();
    document.body.style.setProperty('--dev-console-height', targetH + 'px');
    updatePreviewFromLastEntry();
    rerender();
  }

  function hide({ persist = true } = {}) {
    if (root) root.hidden = true;
    document.body.style.setProperty('--dev-console-height', '0px');
    if (!persist) return;
    try { localStorage.setItem('panorama.console.show', 'false'); } catch { /* ignore */ }
    const cb = document.getElementById('settingsShowConsole');
    if (cb) cb.checked = false;
  }

  return { show, hide, isVisible: () => !!root && !root.hidden };
}

export const consolePanel = createPanel();
