import { useEffect, useMemo, useState } from 'react';
import { useQueues, useStable, useVersion } from '../store/hooks';
import { getProvider } from '../store/panoramaStore';
import { queueDirectoryGridHTML, waitingWorkByQueue } from '../render/v1html';
import type { DetailTarget } from '../detail/DetailDrawer';
import type { WorkItem } from '../core/types';

type QueueFilter = 'all' | 'backlog' | 'empty';
const FILTERS: { id: QueueFilter; lbl: string }[] = [
  { id: 'all', lbl: 'Totes' },
  { id: 'backlog', lbl: 'Amb backlog' },
  { id: 'empty', lbl: 'Buides' },
];

export function QueuesDirectory({ openDetail }: { openDetail: (t: DetailTarget) => void }) {
  const version = useVersion();
  const queues = useQueues();
  const [filter, setFilter] = useState<QueueFilter>('all');
  const [waitingState, setWaiting] = useState<Record<string, WorkItem[]>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(getProvider().getWork())
      .then((w) => { if (!cancelled) setWaiting(waitingWorkByQueue(w)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [version]);

  // Stabilise the per-poll rebuild so an unchanged response doesn't rewrite the grid.
  const waiting = useStable(waitingState);
  const html = useMemo(() => queueDirectoryGridHTML(queues, filter, waiting), [queues, filter, waiting]);

  const onClick = (e: React.MouseEvent) => {
    const agentRow = (e.target as HTMLElement).closest('[data-agent-id]');
    if (agentRow) { openDetail({ kind: 'agent', id: (agentRow as HTMLElement).dataset.agentId! }); return; }
    const head = (e.target as HTMLElement).closest('.qdir-head[data-id]');
    if (head) openDetail({ kind: 'queue', id: (head as HTMLElement).dataset.id! });
  };

  // Keyboard parity with v1: the focusable queue headers open on Enter/Space.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const head = (e.target as HTMLElement).closest('.qdir-head[data-id]');
    if (!head) return;
    e.preventDefault();
    openDetail({ kind: 'queue', id: (head as HTMLElement).dataset.id! });
  };

  return (
    <div className="view">
      <div className="view-head"><h2>Queues</h2><p>Totes les cues d'Omni-Channel i la seva pressió actual.</p></div>
      <div className="chips">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className={`chip ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)}>{f.lbl}</button>
        ))}
      </div>
      <div className="qgrid qdir-grid" onClick={onClick} onKeyDown={onKeyDown} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
