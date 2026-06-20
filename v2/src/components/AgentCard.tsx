import { memo } from 'react';
import type { CSSProperties } from 'react';
import { agentCardInner, statusColor } from '../render/cardHtml';
import type { Agent } from '../core/types';

interface Props {
  agent: Agent;
  onOpen: (id: string) => void;
}

// Keyed by agent id at the list level, so this node survives across polls and the
// container's scroll position is never reset. Only the inner markup is refreshed
// when the agent's data changes — that is the flicker/scroll fix in one component.
function AgentCardImpl({ agent, onOpen }: Props) {
  return (
    <div
      className={`card ${agent.flag ? 'flagged' : ''}`}
      style={{ '--st': statusColor(agent) } as CSSProperties}
      data-id={agent.id}
      onClick={() => onOpen(agent.id)}
      dangerouslySetInnerHTML={{ __html: agentCardInner(agent) }}
    />
  );
}

export const AgentCard = memo(AgentCardImpl);
