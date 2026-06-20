import { useEffect, useMemo, useState } from 'react';
import { useVersion } from '../store/hooks';
import { ensureSkillCatalog, skillGroups, skillCardHTML } from '../render/v1html';
import { HtmlReconciledGrid } from '../components/HtmlReconciledGrid';
import type { DetailTarget } from '../detail/DetailDrawer';
import type { Skill } from '../core/types';

export function SkillsDirectory({ openDetail }: { openDetail: (t: DetailTarget) => void }) {
  const version = useVersion();
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureSkillCatalog()
      .then((list) => { if (!cancelled) setSkills(list); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [version]);

  const groups = useMemo(() => (skills ? skillGroups(skills) : []), [skills]);

  const onClick = (e: React.MouseEvent) => {
    const card = (e.target as HTMLElement).closest('.sk-card[data-skill-id]');
    if (card) openDetail({ kind: 'skill', id: (card as HTMLElement).dataset.skillId! });
  };

  return (
    <div className="view">
      <div className="view-head"><h2>Skills</h2><p>Backlog per skill routing, agrupat per tipus: quins skills tenen profunditat de cua i quants agents qualificats hi ha.</p></div>
      {error && <p style={{ color: 'var(--alert)' }}>No s'han pogut carregar les skills: {error}</p>}
      {!error && !skills && <p style={{ color: 'var(--faint)' }}>Carregant skills…</p>}
      {!error && skills && (
        <div id="skillsDirGroups" onClick={onClick}>
          {groups.length === 0
            ? <p style={{ color: 'var(--faint)' }}>No skills found.</p>
            : groups.map((g) => (
              <section className="sk-group" key={g.key}>
                <h4>{g.typeName} <span className="cnt">{g.skills.length}</span></h4>
                {/* Section is React; cards inside reconcile by markup so only the
                    changed skill repaints, not the whole type group. */}
                <HtmlReconciledGrid className="grid ag-grid" items={g.skills} keyOf={(s) => s.id} renderItem={skillCardHTML} />
              </section>
            ))}
        </div>
      )}
    </div>
  );
}
