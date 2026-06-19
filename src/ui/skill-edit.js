/**
 * Compute the minimal set of skill changes between an agent's current skills
 * and the editor's selected skills. Returned shape matches the PUT body the
 * provider sends: { skillId, level? } for add/update, { skillId, remove: true }
 * for removal.
 * @param {Array<{skillId: string, level: (number|null)}>} current
 * @param {Array<{skillId: string, level: (number|null)}>} selected
 * @returns {Array<{skillId: string, level?: number, remove?: boolean}>}
 */
export function diffSkills(current, selected) {
  const currentById = new Map(current.map((s) => [s.skillId, s]));
  const selectedById = new Map(selected.map((s) => [s.skillId, s]));
  const changes = [];
  for (const sel of selected) {
    const cur = currentById.get(sel.skillId);
    if (!cur) {
      changes.push({ skillId: sel.skillId, level: sel.level });
    } else if (sel.level !== cur.level) {
      changes.push({ skillId: sel.skillId, level: sel.level });
    }
  }
  for (const cur of current) {
    if (!selectedById.has(cur.skillId)) {
      changes.push({ skillId: cur.skillId, remove: true });
    }
  }
  return changes;
}

/**
 * Open a modal editor for an agent's skills. Loads the catalog and the agent's
 * current skills, lets the user toggle skills and set levels, then persists the
 * diff via the provider.
 * @param {string} agentId
 * @param {{ onSaved?: () => void }} [opts]
 */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function openSkillEditor(agentId, opts = {}) {
  const provider = globalThis.PanoramaProvider;
  if (!provider?.updateAgentSkills) return;
  const [catalog, current] = await Promise.all([
    provider.getSkills ? provider.getSkills() : [],
    provider.getAgentSkills ? provider.getAgentSkills(agentId) : [],
  ]);
  const currentMap = new Map(current.map((s) => [s.skillId || s.id, { skillId: s.skillId || s.id, level: s.level }]));

  const overlay = document.createElement('div');
  overlay.className = 'skill-editor-overlay';
  overlay.innerHTML = `
    <div class="skill-editor" role="dialog" aria-label="Editar skills">
      <header><h3>Editar skills</h3><button class="se-close" aria-label="Tancar">✕</button></header>
      <div class="se-list">${catalog.map((s) => {
        const sel = currentMap.get(s.id);
        const level = sel?.level ?? 1;
        return `<label class="se-row">
          <input type="checkbox" class="se-check" data-skill="${esc(s.id)}" ${sel ? 'checked' : ''}>
          <span class="se-name">${esc(s.name)}</span>
          <input type="number" min="1" max="10" class="se-level" data-skill="${esc(s.id)}" value="${level}" ${sel ? '' : 'disabled'}>
        </label>`;
      }).join('')}</div>
      <footer><button class="se-cancel">Cancel·la</button><button class="se-save primary">Desa</button>
        <span class="se-error" style="color:var(--alert)"></span></footer>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.se-close').onclick = close;
  overlay.querySelector('.se-cancel').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelectorAll('.se-check').forEach((chk) => {
    chk.onchange = () => {
      const lvl = overlay.querySelector(`.se-level[data-skill="${chk.dataset.skill}"]`);
      if (lvl) lvl.disabled = !chk.checked;
    };
  });

  overlay.querySelector('.se-save').onclick = async () => {
    const selected = [];
    overlay.querySelectorAll('.se-check:checked').forEach((chk) => {
      const lvl = overlay.querySelector(`.se-level[data-skill="${chk.dataset.skill}"]`);
      selected.push({ skillId: chk.dataset.skill, level: lvl ? Number(lvl.value) : null });
    });
    const currentArr = Array.from(currentMap.values());
    const changes = diffSkills(currentArr, selected);
    const errEl = overlay.querySelector('.se-error');
    errEl.textContent = '';
    if (changes.length === 0) { close(); return; }
    try {
      await provider.updateAgentSkills(agentId, changes);
      close();
      opts.onSaved?.();
    } catch (err) {
      errEl.textContent = `No s'ha pogut desar: ${err.message}`;
    }
  };
}
