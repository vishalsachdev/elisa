import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TaskMapPanel from './TaskMapPanel';
import type { Task } from '../../types';

// Mock ReactFlow since it needs DOM measurements
vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ nodes }: any) => <div data-testid="react-flow">{nodes?.length ?? 0} nodes</div>,
  ReactFlowProvider: ({ children }: any) => <div>{children}</div>,
  useReactFlow: () => ({ fitView: vi.fn() }),
}));

import { vi } from 'vitest';

describe('TaskMapPanel', () => {
  it('shows empty state when no tasks', () => {
    render(<TaskMapPanel tasks={[]} />);
    expect(screen.getByText('Tasks will appear here during a build')).toBeInTheDocument();
  });

  it('renders TaskDAG when tasks exist', () => {
    const tasks: Task[] = [
      { id: '1', name: 'Build UI', description: '', status: 'in_progress', agent_name: 'Builder', dependencies: [] },
    ];
    render(<TaskMapPanel tasks={tasks} />);
    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
  });
});
