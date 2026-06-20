import { OperationsView } from '../views/OperationsView';
import { AgentsDirectory } from '../views/AgentsDirectory';
import { QueuesDirectory } from '../views/QueuesDirectory';
import { SkillsDirectory } from '../views/SkillsDirectory';
import { WorkDirectory } from '../views/WorkDirectory';
import { FloorEditorView } from '../views/FloorEditorView';
import { DetailPanelView } from '../views/DetailPanelView';
import type { DetailTarget } from '../detail/DetailDrawer';
import type { Tab } from './useWorkspace';

function ViewFor({ tab, openDetail }: { tab: Tab; openDetail: (t: DetailTarget) => void }) {
  switch (tab.viewType) {
    case 'operations': return <OperationsView openDetail={openDetail} />;
    case 'agents': return <AgentsDirectory openDetail={openDetail} />;
    case 'queues': return <QueuesDirectory openDetail={openDetail} />;
    case 'skills': return <SkillsDirectory openDetail={openDetail} />;
    case 'work': return <WorkDirectory />;
    case 'floor-editor': return <FloorEditorView />;
    case 'detail': return tab.config ? <DetailPanelView target={tab.config} openDetail={openDetail} /> : null;
    default: return null;
  }
}

// Every open tab stays mounted; inactive ones are hidden. This preserves each
// tab's scroll position and component state across activations (and the keyed
// React trees keep the live-data reconciliation benefit).
export function Workspace({ tabs, activeId, openDetail }: { tabs: Tab[]; activeId: string; openDetail: (t: DetailTarget) => void }) {
  return (
    <div className="ws-stage">
      {tabs.map((tab) => (
        <div key={tab.id} className="ws-panel" data-panel-id={tab.id} hidden={tab.id !== activeId}>
          <ViewFor tab={tab} openDetail={openDetail} />
        </div>
      ))}
    </div>
  );
}
