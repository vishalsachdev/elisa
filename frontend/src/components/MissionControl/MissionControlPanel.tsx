import type { CSSProperties } from 'react';
import type { Task, Agent, WSEvent, NarratorMessage, UIState } from '../../types';
import type { NuggetSpec } from '../BlockCanvas/blockInterpreter';
import TaskDAG from './TaskDAG';
import MinionSquadPanel from './MinionSquadPanel';
import NarratorFeed from './NarratorFeed';
import PlanningIndicator from './PlanningIndicator';

interface MissionControlPanelProps {
  tasks: Task[];
  agents: Agent[];
  events: WSEvent[];
  narratorMessages: NarratorMessage[];
  spec: NuggetSpec | null;
  uiState: UIState;
  isPlanning?: boolean;
  sidePanelWidthPct?: number;
  onResizeSidePanel?: (nextPct: number) => void;
}

export default function MissionControlPanel({
  tasks,
  agents,
  events,
  narratorMessages,
  uiState,
  isPlanning = false,
  sidePanelWidthPct = 40,
  onResizeSidePanel,
}: MissionControlPanelProps) {
  const hasContent = tasks.length > 0;

  const beginResize = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onResizeSidePanel) return;
    e.preventDefault();
    const startX = e.clientX;
    const startPct = sidePanelWidthPct;
    const onMove = (ev: MouseEvent) => {
      const vw = window.innerWidth || 1;
      const deltaPct = ((startX - ev.clientX) / vw) * 100;
      const next = Math.max(25, Math.min(60, startPct + deltaPct));
      onResizeSidePanel(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      className="flex flex-col lg:flex-row h-full overflow-hidden"
      style={{ '--side-panel-width': `${sidePanelWidthPct}%` } as CSSProperties}
    >
      {/* Left panel: Task DAG */}
      <div className="flex-1 min-h-0 overflow-hidden p-4 lg:shrink-0 lg:w-[calc(100%-var(--side-panel-width))]">
        {hasContent ? (
          <TaskDAG tasks={tasks} agents={agents} className="h-full" />
        ) : isPlanning ? (
          <PlanningIndicator />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-atelier-text-muted text-center">
              Mission Control will light up when you press GO
            </p>
          </div>
        )}
      </div>

      {/* Right panel: Squad + Narrator */}
      <div
        className="hidden lg:block w-1 cursor-col-resize bg-border-subtle/60 hover:bg-accent-lavender/60 transition-colors"
        onMouseDown={beginResize}
        role="separator"
        aria-label="Resize side panel"
        aria-orientation="vertical"
      />
      <div
        className="w-full flex flex-col border-t lg:border-t-0 lg:border-l border-border-subtle min-h-0 overflow-hidden lg:shrink-0 lg:w-[var(--side-panel-width)]"
      >
        {/* Top: Minion Squad */}
        <div className="border-b border-border-subtle shrink-0">
          <MinionSquadPanel agents={agents} uiState={uiState} isPlanning={isPlanning} />
        </div>

        {/* Bottom: Narrator Feed */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <NarratorFeed narratorMessages={narratorMessages} events={events} isPlanning={isPlanning} />
        </div>
      </div>
    </div>
  );
}
