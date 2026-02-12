import { useRef, useEffect } from 'react';
import type { WSEvent } from '../../types';

interface Props {
  events: WSEvent[];
  fullHeight?: boolean;
}

type CommEvent =
  | Extract<WSEvent, { type: 'agent_output' }>
  | Extract<WSEvent, { type: 'agent_message' }>;

function isCommEvent(e: WSEvent): e is CommEvent {
  return e.type === 'agent_output' || e.type === 'agent_message';
}

function getAgentName(e: CommEvent): string {
  if (e.type === 'agent_output') return e.agent_name;
  return e.from;
}

function getContent(e: CommEvent): string {
  if (e.type === 'agent_output') return e.content;
  return e.content;
}

export default function CommsFeed({ events, fullHeight = false }: Props) {
  const feedRef = useRef<HTMLDivElement>(null);
  const commEvents = events.filter(isCommEvent);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [commEvents.length]);

  if (commEvents.length === 0) {
    return <p className="text-sm text-atelier-text-muted">No messages yet</p>;
  }

  return (
    <div ref={feedRef} className={fullHeight ? 'h-full overflow-y-auto' : 'max-h-48 overflow-y-auto'}>
      <ul className="text-xs space-y-1">
        {commEvents.map((e, i) => (
          <li key={i} className="px-2.5 py-1.5 bg-atelier-surface/50 rounded-lg font-mono border border-border-subtle">
            <span className={`font-semibold ${e.type === 'agent_message' ? 'text-accent-sky' : 'text-accent-coral'}`}>
              {getAgentName(e)}:{' '}
            </span>
            <span className="text-atelier-text-secondary">{getContent(e)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
