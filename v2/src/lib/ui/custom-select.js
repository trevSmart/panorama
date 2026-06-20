import { isDropdownPanelOpen, syncDropdownPanel } from './dropdown-panel.js';

/** @type {Set<CustomSelectInstance>} */
const openSelects = new Set();

/** @typedef {{
 *   root: HTMLElement,
 *   selectEl: HTMLSelectElement,
 *   trigger: HTMLButtonElement,
 *   menu: HTMLElement,
 *   optionBtns: HTMLButtonElement[],
 *   open: boolean,
 *   closeTimeoutId: ReturnType<typeof setTimeout>|null,
 *   setOpen: (open: boolean) => void,
 *   choose: (value: string) => void,
 *   syncFromNative: () => void,
 * }} CustomSelectInstance */

function closeOtherSelects(current) {
  for (const inst of openSelects) {
    if (inst !== current) inst.setOpen(false);
  }
}

document.addEventListener('click', (e) => {
  for (const inst of openSelects) {
    if (!inst.root.contains(e.target)) inst.setOpen(false);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || openSelects.size === 0) return;
  for (const inst of openSelects) inst.setOpen(false);
  e.preventDefault();
  e.stopImmediatePropagation();
}, true);

/** @param {HTMLSelectElement} selectEl */
export function syncCustomSelect(selectEl) {
  const inst = selectEl.closest('.custom-select')?._customSelect;
  if (inst) inst.syncFromNative();
}

/**
 * Replace a native `<select>` with a user-menu-style custom dropdown.
 * The native element stays in the DOM (visually hidden) for `.value` / `change`.
 * @param {HTMLSelectElement} selectEl
 * @returns {CustomSelectInstance}
 */
function enhanceSelect(selectEl) {
  const existing = selectEl.closest('.custom-select')?._customSelect;
  if (existing) return existing;

  const root = document.createElement('div');
  root.className = 'custom-select';
  selectEl.parentNode?.insertBefore(root, selectEl);
  root.appendChild(selectEl);

  selectEl.classList.add('custom-select-native');
  selectEl.tabIndex = -1;
  selectEl.setAttribute('aria-hidden', 'true');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'custom-select-trigger settings-select';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const menuId = selectEl.id ? `${selectEl.id}-menu` : `custom-select-${Math.random().toString(36).slice(2)}`;
  const menu = document.createElement('div');
  menu.id = menuId;
  menu.className = 'user-menu dropdown-panel custom-select-menu';
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;
  trigger.setAttribute('aria-controls', menuId);

  /** @type {HTMLButtonElement[]} */
  const optionBtns = [...selectEl.options].map((opt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'user-menu-item custom-select-option';
    btn.setAttribute('role', 'option');
    btn.dataset.value = opt.value;
    btn.textContent = opt.textContent;
    menu.appendChild(btn);
    return btn;
  });

  root.appendChild(trigger);
  root.appendChild(menu);

  /** @type {CustomSelectInstance} */
  const inst = {
    root,
    selectEl,
    trigger,
    menu,
    optionBtns,
    open: false,
    closeTimeoutId: null,
    setOpen(open) {
      if (this.open === open && open === isDropdownPanelOpen(this.menu)) return;
      this.open = open;
      this.trigger.setAttribute('aria-expanded', String(open));
      this.closeTimeoutId = syncDropdownPanel(this.menu, open, {
        closeTimeoutId: this.closeTimeoutId,
      });
      if (open) openSelects.add(this);
      else openSelects.delete(this);
    },
    choose(value) {
      if (this.selectEl.value !== value) {
        this.selectEl.value = value;
        this.selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
      this.syncFromNative();
      this.setOpen(false);
      this.trigger.focus();
    },
    syncFromNative() {
      const opt = this.selectEl.selectedOptions[0];
      this.trigger.textContent = opt?.textContent || '';
      this.trigger.disabled = this.selectEl.disabled;
      for (const btn of this.optionBtns) {
        const selected = btn.dataset.value === this.selectEl.value;
        btn.setAttribute('aria-selected', selected ? 'true' : 'false');
      }
    },
  };

  root._customSelect = inst;

  for (const btn of optionBtns) {
    btn.addEventListener('click', () => inst.choose(btn.dataset.value || ''));
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (trigger.disabled) return;
    closeOtherSelects(inst);
    inst.setOpen(!inst.open);
  });

  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      closeOtherSelects(inst);
      inst.setOpen(true);
      const selected = inst.optionBtns.find((b) => b.dataset.value === inst.selectEl.value);
      (selected || inst.optionBtns[0])?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      closeOtherSelects(inst);
      inst.setOpen(!inst.open);
    }
  });

  menu.addEventListener('keydown', (e) => {
    const idx = inst.optionBtns.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      inst.optionBtns[Math.min(idx + 1, inst.optionBtns.length - 1)]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      inst.optionBtns[Math.max(idx - 1, 0)]?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const btn = document.activeElement;
      if (btn instanceof HTMLButtonElement && btn.dataset.value != null) {
        inst.choose(btn.dataset.value);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      inst.setOpen(false);
      inst.trigger.focus();
    }
  });

  inst.syncFromNative();
  return inst;
}

/**
 * @param {ParentNode} [scope]
 * @param {string} [selector]
 */
export function enhanceAllSelects(scope = document, selector = 'select.settings-select') {
  scope.querySelectorAll(selector).forEach((el) => {
    if (el instanceof HTMLSelectElement) enhanceSelect(el);
  });
}
