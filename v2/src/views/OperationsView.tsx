import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConnectedAgents, useQueues } from '../store/hooks';
import { computeHealth, computeVerdict } from '../core/health';
import { AgentCard } from '../components/AgentCard';
import { QueueCard } from '../components/QueueCard';
import { RoomCanvas } from '../components/RoomCanvas';
import { sfIconTileHtml } from '../render/cardHtml';
import type { Agent } from '../core/types';

type StatusFilter = 'all' | 'online' | 'busy' | 'away';

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return <span dangerouslySetInnerHTML={{ __html: sfIconTileHtml(name, { size }) }} />;
}

import type { DetailTarget } from '../detail/DetailDrawer';

// Drag-to-resize splitter between the room (left) and data (right) columns —
// ported from v1's attachOpsResizer. The split is a % of the layout width,
// persisted to localStorage and clamped to a sensible range.
const OPS_SPLIT_KEY = 'panorama.opsSplit';
const OPS_SPLIT_DEFAULT = 40;
const OPS_SPLIT_MIN = 24; // % of layout width
const OPS_SPLIT_MAX = 64;
const clampSplit = (v: number) => Math.min(OPS_SPLIT_MAX, Math.max(OPS_SPLIT_MIN, v));

function loadOpsSplit() {
  try {
    const v = parseFloat(localStorage.getItem(OPS_SPLIT_KEY) || '');
    if (Number.isFinite(v)) return clampSplit(v);
  } catch { /* ignore */ }
  return OPS_SPLIT_DEFAULT;
}

function useOpsResizer() {
  const layoutRef = useRef<HTMLDivElement>(null);
  const apply = useCallback((pct: number) => {
    layoutRef.current?.style.setProperty('--ops-split', pct + '%');
  }, []);

  // Restore the saved split once the layout is mounted.
  useEffect(() => { apply(loadOpsSplit()); }, [apply]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const layout = layoutRef.current;
    if (!layout) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.classList.add('dragging');
    document.body.classList.add('ops-resizing');
    const pctFromX = (clientX: number) => {
      const r = layout.getBoundingClientRect();
      return clampSplit(((clientX - r.left) / r.width) * 100);
    };
    const onMove = (ev: PointerEvent) => { apply(pctFromX(ev.clientX)); ev.preventDefault(); };
    const onUp = () => {
      handle.classList.remove('dragging');
      document.body.classList.remove('ops-resizing');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const cur = parseFloat(layout.style.getPropertyValue('--ops-split'));
      try { if (Number.isFinite(cur)) localStorage.setItem(OPS_SPLIT_KEY, String(cur)); } catch { /* ignore */ }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [apply]);

  // Keyboard support: arrow keys nudge the split by 2%.
  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowLeft' ? -2 : e.key === 'ArrowRight' ? 2 : 0;
    if (!step) return;
    const layout = layoutRef.current;
    if (!layout) return;
    const cur = parseFloat(layout.style.getPropertyValue('--ops-split')) || loadOpsSplit();
    const next = clampSplit(cur + step);
    apply(next);
    try { localStorage.setItem(OPS_SPLIT_KEY, String(next)); } catch { /* ignore */ }
    e.preventDefault();
  }, [apply]);

  const onDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    apply(OPS_SPLIT_DEFAULT);
    try { localStorage.removeItem(OPS_SPLIT_KEY); } catch { /* ignore */ }
  }, [apply]);

  return { layoutRef, resizerProps: { onPointerDown, onKeyDown, onDoubleClick } };
}

interface Props {
  openDetail: (t: DetailTarget) => void;
}

export function OperationsView({ openDetail }: Props) {
  // Stable handler identity so memoised AgentCard/QueueCard skip unchanged rows.
  const onOpenAgent = useCallback((id: string) => openDetail({ kind: 'agent', id }), [openDetail]);
  const onOpenQueue = useCallback((id: string) => openDetail({ kind: 'queue', id }), [openDetail]);
  const agents = useConnectedAgents();
  const queues = useQueues();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const rootRef = useRef<HTMLDivElement>(null);
  const { layoutRef, resizerProps } = useOpsResizer();

  // Pillars jump to their related section (queues/agents), mirroring v1's
  // Panorama.scrollTo. Scoped to this view so hidden tabs aren't matched.
  const scrollToSection = (view: string) =>
    rootRef.current?.querySelector(`#sec-${view}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const health = useMemo(() => computeHealth(agents, queues), [agents, queues]);
  const verdict = useMemo(() => computeVerdict(health), [health]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: agents.length, online: 0, busy: 0, away: 0, offline: 0 };
    agents.forEach((a) => { c[a.status] = (c[a.status] || 0) + 1; });
    return c;
  }, [agents]);

  const visibleAgents = useMemo(() => {
    const list: Agent[] = filter === 'all' ? agents.slice() : agents.filter((a) => a.status === filter);
    list.sort((a, b) => (Number(b.flag) - Number(a.flag)) || (b.used - a.used));
    return list;
  }, [agents, filter]);

  return (
    <div className="view view-ops" ref={rootRef}>
      <header className="ops-summary">
        <div className="verdict">
          <span className={`vdot ${verdict.dot}`} />
          <div>
            <h1>{verdict.title}</h1>
            <div className="vsub">{verdict.sub}</div>
            <div className="vmeta">
              <span className="live"><i />en directe</span>
              <span>·</span>
              <span><b className="mono">{health.online}</b> agents online</span>
              <span>·</span>
              <span><b className="mono">{queues.length}</b> cues actives</span>
              <span>·</span>
              <span>actualitzat ara mateix</span>
            </div>
          </div>
        </div>
        <div className="pillars">
          {health.pillars.map((p) => (
            <button key={p.id} className={`pillar ${p.state !== 'ok' ? `attn ${p.state}` : ''}`} onClick={() => scrollToSection(p.view)}>
              <span className="arrow">→</span>
              <div className="pl">{p.lbl}</div>
              <div className={`pv${String(p.val).includes(' ') ? ' long' : ''}`}>{p.val}</div>
              <div className="ps"><i style={{ background: `var(--${p.state})` }} /><span>{p.msg[p.state]}</span></div>
            </button>
          ))}
        </div>
      </header>

      <div className="ops-layout" ref={layoutRef}>
        <aside className="ops-room"><RoomCanvas onOpenAgent={onOpenAgent} /></aside>
        {/* The CSS grid expects three children (room · resizer · data). Drag,
            arrow keys, or double-click (reset) adjust the split. */}
        <div
          className="ops-resizer"
          role="separator"
          aria-orientation="vertical"
          tabIndex={0}
          {...resizerProps}
        />
        <div className="ops-data">
          <section id="sec-queues">
            <div className="sec-title"><Icon name="queue" /> Cues <span className="cnt">{queues.length}</span></div>
            <div className="qgrid">
              {queues.map((q) => <QueueCard key={q.id} queue={q} onOpen={onOpenQueue} />)}
            </div>
          </section>
          <section id="sec-agents">
            <div className="sec-title"><Icon name="user" /> Agents <span className="cnt">{agents.length}</span></div>
            <div className="toolbar">
              <div className="chips">
                <button className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>Tots <b className="mono">{counts.all}</b></button>
                <button className={`chip ${filter === 'online' ? 'on' : ''}`} onClick={() => setFilter('online')}><i style={{ background: 'var(--ok)' }} />Online {counts.online}</button>
                <button className={`chip ${filter === 'busy' ? 'on' : ''}`} onClick={() => setFilter('busy')}><i style={{ background: 'var(--alert)' }} />Ocupat {counts.busy}</button>
                <button className={`chip ${filter === 'away' ? 'on' : ''}`} onClick={() => setFilter('away')}><i style={{ background: 'var(--watch)' }} />Absent {counts.away}</button>
              </div>
            </div>
            <div className="grid" id="agentGrid">
              {visibleAgents.length
                ? visibleAgents.map((a) => <AgentCard key={a.id} agent={a} onOpen={onOpenAgent} />)
                : <p style={{ color: 'var(--faint)' }}>Cap agent coincideix.</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
