import { memo } from 'react';
import { queueCardInner } from '../render/cardHtml';
import type { Queue } from '../core/types';

interface Props {
  queue: Queue;
  onOpen: (id: string) => void;
}

function QueueCardImpl({ queue, onOpen }: Props) {
  return (
    <div
      className="qcard"
      data-id={queue.id}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(queue.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(queue.id);
        }
      }}
      dangerouslySetInnerHTML={{ __html: queueCardInner(queue) }}
    />
  );
}

export const QueueCard = memo(QueueCardImpl);
