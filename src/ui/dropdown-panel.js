export const DROPDOWN_TRANSITION_MS = 180;

/**
 * Open/close animation shared by header dropdowns (search, tab catalog, user menu).
 * @param {HTMLElement|null|undefined} el
 * @param {boolean} open
 * @param {{ closeTimeoutId?: ReturnType<typeof setTimeout>|null }} [state]
 * @returns {ReturnType<typeof setTimeout>|null}
 */
export function syncDropdownPanel(el, open, state = {}) {
  if (!el) return state.closeTimeoutId ?? null;

  if (open) {
    clearTimeout(state.closeTimeoutId ?? undefined);
    el.hidden = false;
    el.classList.remove('is-open');
    requestAnimationFrame(() => {
      el.classList.add('is-open');
    });
    return null;
  }

  el.classList.remove('is-open');
  clearTimeout(state.closeTimeoutId ?? undefined);
  return setTimeout(() => {
    el.hidden = true;
  }, DROPDOWN_TRANSITION_MS);
}

/** @param {HTMLElement|null|undefined} el */
export function isDropdownPanelOpen(el) {
  return Boolean(el && !el.hidden && el.classList.contains('is-open'));
}
