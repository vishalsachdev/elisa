import type { Task } from '../../types';
import TaskDAG from '../MissionControl/TaskDAG';

interface TaskMapPanelProps {
  tasks: Task[];
}

export default function TaskMapPanel({ tasks }: TaskMapPanelProps) {
  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-atelier-text-muted">
        <p className="text-sm">Tasks will appear here during a build</p>
      </div>
    );
  }

  return (
    <div className="h-full p-4">
      <TaskDAG tasks={tasks} className="h-full" />
    </div>
  );
}
