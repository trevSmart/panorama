import { useMemo } from 'react';
import { useAllAgents } from '../store/hooks';
import { agentDirCardInner } from '../render/cardHtml';
import type { Agent } from '../core/types';

import type { DetailTarget } from '../detail/DetailDrawer';

const ORDER: Record<string, number> = { online: 0, busy: 1, away: 2, offline: 3 };

interface Props {
  openDetail: (t: DetailTarget) => void;
}

export function AgentsDirectory({ openDetail }: Props) {
  const { data, loading, error } = useAllAgents();

  const sorted = useMemo(() => {
    const list: Agent[] = (data || []).slice();
    list.sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || a.name.localeCompare(b.name));
    return list;
  }, [data]);

  return (
    <div className="view">
      <div className="view-head">
        <h2>Agents</h2>
        <p>Tots els agents habilitats per Omni-Channel, connectats o no.</p>
      </div>
      <div className="grid ag-grid" id="agentsDirGrid">
        {error && <p style={{ color: 'var(--alert)' }}>No s'han pogut carregar els agents: {error.message}</p>}
        {!error && loading && !data && <p style={{ color: 'var(--faint)' }}>Carregant agents…</p>}
        {!error && sorted.map((a) => (
          <button type="button" className="ag-card" key={a.id} data-id={a.id} onClick={() => openDetail({ kind: 'agent', id: a.id })}
            dangerouslySetInnerHTML={{ __html: agentDirCardInner(a) }} />
        ))}
        {!error && !loading && sorted.length === 0 && <p style={{ color: 'var(--faint)' }}>No s'ha trobat cap agent.</p>}
      </div>
    </div>
  );
}
