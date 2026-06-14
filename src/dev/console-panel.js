// src/dev/console-panel.js
import { devConsole } from './dev-console.js';

const HEIGHT_KEY = 'panorama.console.height';
const LEVELS = ['log', 'info', 'warn', 'error', 'action'];

function fmtTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function createPanel() {
  let root = null;
  let bodyEl = null;
  let searchEl = null;
  let unsubscribe = null;
  const activeLevels = new Set(LEVELS);

  function passesFilter(entry) {
    if (!activeLevels.has(entry.level)) return false;
    const q = (searchEl?.value || '').toLowerCase();
    return !q || entry.text.toLowerCase().includes(q);
  }

  function appendLine(entry) {
    if (!bodyEl || !passesFilter(entry)) return;
    const atBottom = bodyEl.scrollTop + bodyEl.clientHeight >= bodyEl.scrollHeight - 8;
    const line = document.createElement('div');
    line.className = 'dev-console-line';
    line.innerHTML =
      `<span class="dev-console-ts">${fmtTime(entry.ts)}</span>` +
      `<span class="dev-console-level dev-console-level--${entry.level}">${entry.level}</span>` +
      `<span class="dev-console-msg"></span>`;
    line.querySelector('.dev-console-msg').textContent = entry.text;
    bodyEl.appendChild(line);
    if (atBottom) bodyEl.scrollTop = bodyEl.scrollHeight;
  }

  function rerender() {
    if (!bodyEl) return;
    bodyEl.replaceChildren();
    for (const entry of devConsole.getEntries()) appendLine(entry);
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
        <input class="dev-console-search" type="text" placeholder="Filtra…">
        ${LEVELS.map(l => `<button class="dev-console-filter" data-level="${l}" aria-pressed="true">${l}</button>`).join('')}
        <button class="dev-console-btn" data-action="clear">Neteja</button>
        <button class="dev-console-btn" data-action="close">✕</button>
      </div>
      <div class="dev-console-body"></div>`;
    document.body.appendChild(root);

    bodyEl = root.querySelector('.dev-console-body');
    searchEl = root.querySelector('.dev-console-search');

    searchEl.addEventListener('input', rerender);
    root.querySelectorAll('.dev-console-filter').forEach((btn) => {
      btn.addEventListener('click', () => {
        const lvl = btn.dataset.level;
        if (activeLevels.has(lvl)) { activeLevels.delete(lvl); btn.setAttribute('aria-pressed', 'false'); }
        else { activeLevels.add(lvl); btn.setAttribute('aria-pressed', 'true'); }
        rerender();
      });
    });
    root.querySelector('[data-action="clear"]').addEventListener('click', () => devConsole.clear());
    root.querySelector('[data-action="close"]').addEventListener('click', () => hide());

    attachResize(root.querySelector('.dev-console-resize'), savedHeight);

    unsubscribe = devConsole.subscribe((e) => {
      if (e.type === 'clear') rerender();
      else appendLine(e.entry);
    });
  }

  function attachResize(handle, initial) {
    let startY = 0;
    let startH = initial;
    const onMove = (e) => {
      const h = Math.min(window.innerHeight * 0.6, Math.max(120, startH + (startY - e.clientY)));
      document.body.style.setProperty('--dev-console-height', h + 'px');
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const cur = getComputedStyle(document.body).getPropertyValue('--dev-console-height').trim();
      localStorage.setItem(HEIGHT_KEY, parseInt(cur, 10) || 240);
    };
    handle.addEventListener('mousedown', (e) => {
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
    const h = Number(localStorage.getItem(HEIGHT_KEY)) || 240;
    document.body.style.setProperty('--dev-console-height', h + 'px');
    rerender();
  }

  function hide() {
    if (root) root.hidden = true;
    document.body.style.setProperty('--dev-console-height', '0px');
    try { localStorage.setItem('panorama.console.show', 'false'); } catch { /* ignore */ }
    const cb = document.getElementById('settingsShowConsole');
    if (cb) cb.checked = false;
  }

  return { show, hide, isVisible: () => !!root && !root.hidden };
}

export const consolePanel = createPanel();
