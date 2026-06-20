import { useEffect, useMemo, useState } from 'react';
import { useVersion } from '../store/hooks';
import { getProvider } from '../store/panoramaStore';
import { workGroups, workGroupHTML } from '../render/v1html';
import { HtmlReconciledGrid } from '../components/HtmlReconciledGrid';
import type { WorkItem } from '../core/types';

export function WorkDirectory() {
  const version = useVersion();
  const [work, setWork] = useState<WorkItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(getProvider().getWork())
      .then((w) => { if (!cancelled) setWork(w); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [version]);

  const groups = useMemo(() => (work ? workGroups(work) : []), [work]);

  return (
    <div className="view">
      <div className="view-head"><h2>Work</h2><p>Tots els work items viatjant per les cues cap als agents, per cua i canal.</p></div>
      {error && <p style={{ color: 'var(--alert)' }}>No s'ha pogut carregar el work: {error}</p>}
      {!error && !work && <p style={{ color: 'var(--faint)' }}>Carregant work…</p>}
      {!error && work && (
        <HtmlReconciledGrid
          id="workDirList"
          items={groups}
          keyOf={(g) => g.key}
          renderItem={workGroupHTML}
          emptyHTML='<p style="color:var(--faint)">No work items in flight.</p>'
        />
      )}
    </div>
  );
}
