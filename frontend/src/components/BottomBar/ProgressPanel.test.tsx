import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProgressPanel from './ProgressPanel';
import type { Task } from '../../types';

describe('ProgressPanel', () => {
  it('shows idle message in design mode', () => {
    render(<ProgressPanel uiState="design" tasks={[]} deployProgress={null} />);
    expect(screen.getByText('Progress will appear during a build')).toBeInTheDocument();
  });

  it('shows planning text during build with no tasks', () => {
    render(<ProgressPanel uiState="building" tasks={[]} deployProgress={null} />);
    expect(screen.getByText('Planning...')).toBeInTheDocument();
  });

  it('shows building progress with task counts', () => {
    const tasks: Task[] = [
      { id: '1', name: 'Build UI', description: '', status: 'done', agent_name: 'Builder', dependencies: [] },
      { id: '2', name: 'Write tests', description: '', status: 'in_progress', agent_name: 'Tester', dependencies: [] },
    ];
    render(<ProgressPanel uiState="building" tasks={tasks} deployProgress={null} />);
    expect(screen.getByText(/Building \(1\/2\)/)).toBeInTheDocument();
  });

  it('shows deploy progress step text', () => {
    render(
      <ProgressPanel
        uiState="building"
        tasks={[]}
        deployProgress={{ step: 'Flashing to board...', progress: 60 }}
      />,
    );
    expect(screen.getByText('Flashing to board...')).toBeInTheDocument();
  });

  it('shows done state', () => {
    render(<ProgressPanel uiState="done" tasks={[]} deployProgress={null} />);
    expect(screen.getByText('Done!')).toBeInTheDocument();
  });
});
