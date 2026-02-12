import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MainTabBar from './MainTabBar';
import type { Task, Agent } from '../../types';

const defaultProps = {
  activeTab: 'workspace' as const,
  onTabChange: vi.fn(),
  tasks: [] as Task[],
  agents: [] as Agent[],
};

describe('MainTabBar', () => {
  it('renders all three tabs', () => {
    render(<MainTabBar {...defaultProps} />);
    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('Agents')).toBeInTheDocument();
    expect(screen.getByText('Tasks')).toBeInTheDocument();
  });

  it('highlights the active tab', () => {
    render(<MainTabBar {...defaultProps} activeTab="agents" />);
    const agentsTab = screen.getByText('Agents');
    expect(agentsTab.className).toContain('bg-accent-lavender');
  });

  it('calls onTabChange when a tab is clicked', () => {
    const onTabChange = vi.fn();
    render(<MainTabBar {...defaultProps} onTabChange={onTabChange} />);
    fireEvent.click(screen.getByText('Tasks'));
    expect(onTabChange).toHaveBeenCalledWith('tasks');
  });

  it('shows badge count for working agents', () => {
    const agents: Agent[] = [
      { name: 'Builder', role: 'builder', persona: '', status: 'working' },
      { name: 'Tester', role: 'tester', persona: '', status: 'idle' },
    ];
    render(<MainTabBar {...defaultProps} agents={agents} />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('shows badge count for in-progress tasks', () => {
    const tasks: Task[] = [
      { id: '1', name: 'Build UI', description: '', status: 'in_progress', agent_name: 'Builder', dependencies: [] },
      { id: '2', name: 'Write tests', description: '', status: 'pending', agent_name: 'Tester', dependencies: [] },
    ];
    render(<MainTabBar {...defaultProps} tasks={tasks} />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('does not show badges when no active work', () => {
    render(<MainTabBar {...defaultProps} />);
    const badges = document.querySelectorAll('.rounded-full.bg-accent-sky');
    expect(badges).toHaveLength(0);
  });

  it('muted styling for inactive tabs in design mode', () => {
    render(<MainTabBar {...defaultProps} activeTab="workspace" />);
    const agentsTab = screen.getByText('Agents');
    expect(agentsTab.className).toContain('text-atelier-text-muted');
  });
});
