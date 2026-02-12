import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AgentTeamPanel from './AgentTeamPanel';
import type { Agent, WSEvent } from '../../types';

const defaultProps = {
  spec: null,
  agents: [] as Agent[],
  events: [] as WSEvent[],
};

describe('AgentTeamPanel', () => {
  it('shows empty state when no agents', () => {
    render(<AgentTeamPanel {...defaultProps} />);
    expect(screen.getByText('No agents added yet')).toBeInTheDocument();
  });

  it('renders agent cards with name and role', () => {
    const agents: Agent[] = [
      { name: 'Builder Bot', role: 'builder', persona: 'careful', status: 'working' },
      { name: 'Test Bot', role: 'tester', persona: 'thorough', status: 'idle' },
    ];
    render(<AgentTeamPanel {...defaultProps} agents={agents} />);
    expect(screen.getByText('Builder Bot')).toBeInTheDocument();
    expect(screen.getByText('Test Bot')).toBeInTheDocument();
    expect(screen.getByText('builder')).toBeInTheDocument();
    expect(screen.getByText('tester')).toBeInTheDocument();
  });

  it('renders agents from spec when no active agents', () => {
    const spec = {
      nugget: { goal: 'test', description: '', type: 'general' },
      requirements: [],
      agents: [{ name: 'Rev', role: 'reviewer', persona: 'strict' }],
      deployment: { target: 'web', auto_flash: false },
      workflow: { review_enabled: true, testing_enabled: false, human_gates: [] },
    };
    render(<AgentTeamPanel {...defaultProps} spec={spec} />);
    expect(screen.getByText('Rev')).toBeInTheDocument();
  });

  it('renders Comms Feed section', () => {
    render(<AgentTeamPanel {...defaultProps} />);
    expect(screen.getByText('Comms Feed')).toBeInTheDocument();
  });

  it('renders agent messages in comms feed', () => {
    const events: WSEvent[] = [
      { type: 'agent_message', from: 'Builder', to: 'all', content: 'Starting work' },
    ];
    render(<AgentTeamPanel {...defaultProps} events={events} />);
    expect(screen.getByText('Starting work')).toBeInTheDocument();
  });
});
