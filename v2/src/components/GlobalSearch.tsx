import { useEffect, useMemo, useRef, useState } from 'react';
import { sfIconTileHtml, skillIconTileHtml, colorFromString } from '@core/ui/sf-icons.js';
import { getDetailRecents } from '@core/data/detail-recent-store.js';
import { agentAvatarHTML } from '../render/cardHtml';
import { ensureSkillCatalog, snapshotIconHTML } from '../render/v1html';
import type { DetailTarget } from '../detail/DetailDrawer';
import type { Agent, Queue, Skill } from '../core/types';

interface RecentEntry { kind: 'agent' | 'queue' | 'skill'; id: string; title: string; meta: string; }

/* eslint-disable @typescript-eslint/no-explicit-any */
const G = globalThis as any;

interface Result { target: DetailTarget; icon: string; title: string; meta: string; }

function search(query: string): { agents: Result[]; queues: Result[]; skills: Result[] } {
  const q = query.trim().toLowerCase();
  const agents: Result[] = (G.AGENTS as Agent[] || [])
    .filter((a) => a.name.toLowerCase().includes(q))
    .slice(0, 6)
    .map((a) => ({ target: { kind: 'agent', id: a.id, name: a.name }, icon: agentAvatarHTML(a, 'si-av'), title: a.name, meta: a.role || 'Agent' }));
  const queues: Result[] = (G.queueState as Queue[] || [])
    .filter((qq) => qq.name.toLowerCase().includes(q))
    .slice(0, 6)
    .map((qq) => ({ target: { kind: 'queue', id: qq.id, name: qq.name }, icon: sfIconTileHtml('queue', { size: 24, bg: colorFromString(qq.name) }), title: qq.name, meta: `${qq.backlog || 0} backlog · ${qq.online || 0} online` }));
  const skills: Result[] = (G.__skillCache as Skill[] || G.SKILLS as Skill[] || [])
    .filter((s) => s.name.toLowerCase().includes(q))
    .slice(0, 6)
    .map((s) => ({ target: { kind: 'skill', id: s.id, name: s.name }, icon: skillIconTileHtml({ size: 24, name: s.name }), title: s.name, meta: s.type || 'Skill' }));
  return { agents, queues, skills };
}

function Group({ label, items, onPick }: { label: string; items: Result[]; onPick: (t: DetailTarget) => void }) {
  if (!items.length) return null;
  return (
    <div className="qsearch-group">
      <div className="qsearch-group-lbl">{label}</div>
      {items.map((r) => (
        <button type="button" className="qsearch-item" key={`${r.target.kind}-${r.target.id}`} onMouseDown={(e) => { e.preventDefault(); onPick(r.target); }}>
          <span className="si-av" dangerouslySetInnerHTML={{ __html: r.icon }} />
          <div className="si-main"><div className="si-title">{r.title}</div><div className="si-meta">{r.meta}</div></div>
        </button>
      ))}
    </div>
  );
}

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4-4" />
  </svg>
);

export function GlobalSearch({ onPick }: { onPick: (t: DetailTarget) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Warm the skill cache so skills are searchable without opening the Skills tab.
  useEffect(() => { ensureSkillCatalog().then((list) => { G.__skillCache = list; }).catch(() => {}); }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  const results = useMemo(() => (q.trim() ? search(q) : { agents: [], queues: [], skills: [] }), [q]);
  const total = results.agents.length + results.queues.length + results.skills.length;

  // Recently opened items, shown when the query is empty (recomputed each open).
  const recents: Result[] = useMemo(() => {
    if (q.trim() || !open) return [];
    return (getDetailRecents() as RecentEntry[]).map((r) => ({
      target: { kind: r.kind, id: r.id, name: r.title },
      icon: snapshotIconHTML(r.kind, r.id, r.title),
      title: r.title,
      meta: r.meta,
    }));
  }, [q, open]);

  const pick = (t: DetailTarget) => { onPick(t); setQ(''); setOpen(false); };
  const hasQuery = Boolean(q.trim());

  return (
    <div className="qsearch" ref={ref}>
      <SearchIcon />
      <input
        placeholder="Search…"
        value={q}
        autoComplete="off"
        spellCheck={false}
        aria-label="Cerca"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      <div className={`qsearch-drop dropdown-panel ${open ? 'is-open' : ''}`} role="listbox">
        <div className="qsearch-drop-body">
          <div className="qsearch-drop-content">
            {!hasQuery
              ? (recents.length
                ? (
                  <>
                    <Group label="Agents" items={recents.filter((r) => r.target.kind === 'agent')} onPick={pick} />
                    <Group label="Cues" items={recents.filter((r) => r.target.kind === 'queue')} onPick={pick} />
                    <Group label="Skills" items={recents.filter((r) => r.target.kind === 'skill')} onPick={pick} />
                  </>
                )
                : <div className="qsearch-hint">Cerca agents, cues o skills.</div>)
              : total === 0
                ? <div className="qsearch-empty">Cap resultat per <b>{q}</b></div>
                : (
                  <>
                    <Group label="Agents" items={results.agents} onPick={pick} />
                    <Group label="Cues" items={results.queues} onPick={pick} />
                    <Group label="Skills" items={results.skills} onPick={pick} />
                  </>
                )}
          </div>
        </div>
      </div>
    </div>
  );
}
