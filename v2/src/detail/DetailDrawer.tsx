import { useEffect, useRef, useState } from 'react';
import { useVersion } from '../store/hooks';
import { renderAgentDetail, renderQueueDetail, renderSkillDetail, ensureSkillCatalog, type DetailRender, type DetailCtx } from '../render/v1html';

export type DetailTarget = { kind: 'agent' | 'queue' | 'skill'; id: string; name?: string };

interface Props {
  target: DetailTarget | null;
  onClose: () => void;
  onNavigate: (t: DetailTarget) => void;
  onMaximize?: (t: DetailTarget) => void;
}

function renderFor(t: DetailTarget): DetailRender | null {
  if (t.kind === 'agent') return renderAgentDetail(t);
  if (t.kind === 'queue') return renderQueueDetail(t);
  return renderSkillDetail(t);
}

// Inner surface (head + actions + body) — mirrors detail-panel.js assembleHTML so
// the drawer CSS applies unchanged. Re-renders on every store version bump so the
// open drawer reflects live data, and re-runs afterMount wiring after each render.
function DetailSurface({ target, onClose, onNavigate, onMaximize }: Props & { target: DetailTarget }) {
  const version = useVersion();
  const bodyRef = useRef<HTMLDivElement>(null);

  // Skill catalog may need loading before its detail resolves.
  const [, setReady] = useState(0);
  useEffect(() => {
    if (target.kind === 'skill') ensureSkillCatalog().then(() => setReady((n) => n + 1)).catch(() => {});
  }, [target.kind, target.id]);

  const content = renderFor(target) || {
    head: '<div class="dr-id"><div><div class="nm">No trobat</div></div></div>',
    body: '<p style="color:var(--dim)">L\'element ja no està disponible.</p>',
  };

  useEffect(() => {
    // Pass the whole drawer (head + actions + body) so afterMount can wire the
    // action buttons in .dr-actions, not just the body.
    const root = (bodyRef.current?.parentElement ?? bodyRef.current) as HTMLElement | null;
    if (!root || !content.afterMount) return;
    const ctx: DetailCtx = {
      openAgent: (id) => onNavigate({ kind: 'agent', id }),
      openQueue: (id) => onNavigate({ kind: 'queue', id }),
      openSkill: (id) => onNavigate({ kind: 'skill', id }),
    };
    content.afterMount(root, ctx);
    // re-run when data or target changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, target.kind, target.id]);

  return (
    <>
      <div className="dr-head">
        <div className="dr-head-actions">
          {onMaximize && (
            <button type="button" className="dr-icon-btn dr-maximize" title="Obre com a pestanya" aria-label="Obre com a pestanya" onClick={() => onMaximize(target)}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 2H2v4M10 2h4v4M10 14h4v-4M6 14H2v-4" /></svg>
            </button>
          )}
          <button type="button" className="dr-icon-btn dr-close" aria-label="Tanca" onClick={onClose}>✕</button>
        </div>
        <div dangerouslySetInnerHTML={{ __html: content.head }} />
      </div>
      {content.actions ? <div className="dr-actions" dangerouslySetInnerHTML={{ __html: content.actions }} /> : null}
      <div className="dr-body" ref={bodyRef} dangerouslySetInnerHTML={{ __html: content.body }} />
    </>
  );
}

export function DetailDrawer({ target, onClose, onNavigate, onMaximize }: Props) {
  // The scrim/aside are ALWAYS in the DOM (off-screen when closed), exactly like
  // v1's persistent #drawer. Toggling `show` then transitions both directions —
  // mounting the aside only on open skipped the enter transition. `rendered`
  // keeps the content alive through the exit animation.
  const [rendered, setRendered] = useState<DetailTarget | null>(target);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (target) {
      setRendered(target);
      // Wait a frame so the off-screen state is painted before animating in.
      const id = requestAnimationFrame(() => setShow(true));
      return () => cancelAnimationFrame(id);
    }
    setShow(false);
    const t = setTimeout(() => setRendered(null), 240);
    return () => clearTimeout(t);
  }, [target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className={`scrim ${show ? 'show' : ''}`} onClick={onClose} aria-hidden={!show} />
      <aside className={`drawer ${show ? 'show' : ''}`} role="dialog" aria-modal="true" aria-hidden={!show}>
        {rendered && <DetailSurface target={rendered} onClose={onClose} onNavigate={onNavigate} onMaximize={onMaximize} />}
      </aside>
    </>
  );
}
