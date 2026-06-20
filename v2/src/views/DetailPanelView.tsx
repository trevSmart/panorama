import { useEffect, useRef } from 'react';
import { useVersion } from '../store/hooks';
import { renderAgentDetail, renderQueueDetail, renderSkillDetail, ensureSkillCatalog, type DetailRender, type DetailCtx } from '../render/v1html';
import type { DetailTarget } from '../detail/DetailDrawer';

function renderFor(t: DetailTarget): DetailRender | null {
  if (t.kind === 'agent') return renderAgentDetail(t);
  if (t.kind === 'queue') return renderQueueDetail(t);
  return renderSkillDetail(t);
}

// Full-screen detail (a maximized drawer opened as a tab). Same content builders,
// rendered inside .view-detail .detail-panel and without the drawer chrome.
export function DetailPanelView({ target, openDetail }: { target: DetailTarget; openDetail: (t: DetailTarget) => void }) {
  const version = useVersion();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (target.kind === 'skill') ensureSkillCatalog().catch(() => {});
  }, [target.kind, target.id]);

  const content = renderFor(target) || { head: '', body: '<p style="color:var(--dim)">No disponible.</p>' };

  useEffect(() => {
    const root = ref.current;
    if (!root || !content.afterMount) return;
    const ctx: DetailCtx = {
      openAgent: (id) => openDetail({ kind: 'agent', id }),
      openQueue: (id) => openDetail({ kind: 'queue', id }),
      openSkill: (id) => openDetail({ kind: 'skill', id }),
    };
    content.afterMount(root, ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, target.kind, target.id]);

  return (
    <div className="view view-detail">
      <div className="detail-panel" ref={ref}>
        <div className="dr-head" dangerouslySetInnerHTML={{ __html: content.head }} />
        {content.actions ? <div className="dr-actions" dangerouslySetInnerHTML={{ __html: content.actions }} /> : null}
        <div className="dr-body" dangerouslySetInnerHTML={{ __html: content.body }} />
      </div>
    </div>
  );
}
