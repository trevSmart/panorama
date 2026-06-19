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
