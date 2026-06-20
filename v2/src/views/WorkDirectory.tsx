import { useEffect, useMemo, useState } from 'react';
import { useStable, useVersion } from '../store/hooks';
import { getProvider } from '../store/panoramaStore';
import { workListHTML } from '../render/v1html';
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

  const stableWork = useStable(work);
  const html = useMemo(() => (stableWork ? workListHTML(stableWork) : ''), [stableWork]);

  return (
    <div className="view">
      <div className="view-head"><h2>Work</h2><p>Tots els work items viatjant per les cues cap als agents, per cua i canal.</p></div>
      {error && <p style={{ color: 'var(--alert)' }}>No s'ha pogut carregar el work: {error}</p>}
      {!error && !work && <p style={{ color: 'var(--faint)' }}>Carregant work…</p>}
      {!error && work && <div id="workDirList" dangerouslySetInnerHTML={{ __html: html }} />}
    </div>
  );
}
