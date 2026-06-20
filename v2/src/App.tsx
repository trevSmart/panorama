import { useCallback, useState } from 'react';
import { recordDetailOpen, setDetailRecentResolver } from '@core/data/detail-recent-store.js';
import { TopBar } from './components/TopBar';
import { TabBar } from './workspace/TabBar';
import { Workspace } from './workspace/Workspace';
import { useWorkspace } from './workspace/useWorkspace';
import { resolveDetailSnapshot } from './render/v1html';
import { DetailDrawer, type DetailTarget } from './detail/DetailDrawer';

// Teach the recents store how to turn a {kind,id} into a titled snapshot.
setDetailRecentResolver(resolveDetailSnapshot);

export function App() {
  const ws = useWorkspace();
  const [detail, setDetail] = useState<DetailTarget | null>(null);

  const openDetail = useCallback((t: DetailTarget) => {
    recordDetailOpen(t);
    setDetail(t);
  }, []);
  const closeDetail = useCallback(() => setDetail(null), []);
  // Maximize: promote the drawer to a workspace tab.
  const maximize = useCallback((t: DetailTarget) => {
    setDetail(null);
    ws.openDetailTab(t);
  }, [ws]);

  return (
    <>
      {/* .app-chrome is the sticky header (topbar + tab bar); .workspace is a
          sibling below it, mirroring v1's DOM so the layout sizing works. */}
      <div className="app-chrome">
        <header className="topbar">
          <div className="brand" onClick={() => ws.activate(ws.tabs[0].id)}>
            <img src="/assets/panorama-logo.png" alt="Panorama" className="brand-logo" />
          </div>
          <TopBar onSearchPick={openDetail} />
        </header>

        <TabBar
          tabs={ws.tabs}
          activeId={ws.activeId}
          onActivate={ws.activate}
          onClose={ws.close}
          onMove={ws.move}
          onOpenView={ws.openView}
        />
      </div>

      <main className="workspace">
        <Workspace tabs={ws.tabs} activeId={ws.activeId} openDetail={openDetail} />
      </main>

      <DetailDrawer target={detail} onClose={closeDetail} onNavigate={openDetail} onMaximize={maximize} />
    </>
  );
}
