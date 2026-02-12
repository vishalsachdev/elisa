import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WorkspaceSidebar from './WorkspaceSidebar';

const defaultProps = {
  onOpen: vi.fn(),
  onSave: vi.fn(),
  onSkills: vi.fn(),
  onPortals: vi.fn(),
  onExamples: vi.fn(),
  onHelp: vi.fn(),
  saveDisabled: false,
};

describe('WorkspaceSidebar', () => {
  it('renders all six buttons', () => {
    render(<WorkspaceSidebar {...defaultProps} />);
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Skills')).toBeInTheDocument();
    expect(screen.getByText('Portals')).toBeInTheDocument();
    expect(screen.getByText('Examples')).toBeInTheDocument();
    expect(screen.getByText('Help')).toBeInTheDocument();
  });

  it('fires onOpen when Open is clicked', () => {
    const onOpen = vi.fn();
    render(<WorkspaceSidebar {...defaultProps} onOpen={onOpen} />);
    fireEvent.click(screen.getByText('Open'));
    expect(onOpen).toHaveBeenCalled();
  });

  it('fires onSave when Save is clicked', () => {
    const onSave = vi.fn();
    render(<WorkspaceSidebar {...defaultProps} onSave={onSave} />);
    fireEvent.click(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalled();
  });

  it('fires onSkills when Skills is clicked', () => {
    const onSkills = vi.fn();
    render(<WorkspaceSidebar {...defaultProps} onSkills={onSkills} />);
    fireEvent.click(screen.getByText('Skills'));
    expect(onSkills).toHaveBeenCalled();
  });

  it('fires onPortals when Portals is clicked', () => {
    const onPortals = vi.fn();
    render(<WorkspaceSidebar {...defaultProps} onPortals={onPortals} />);
    fireEvent.click(screen.getByText('Portals'));
    expect(onPortals).toHaveBeenCalled();
  });

  it('fires onExamples when Examples is clicked', () => {
    const onExamples = vi.fn();
    render(<WorkspaceSidebar {...defaultProps} onExamples={onExamples} />);
    fireEvent.click(screen.getByText('Examples'));
    expect(onExamples).toHaveBeenCalled();
  });

  it('Save is disabled when saveDisabled is true', () => {
    render(<WorkspaceSidebar {...defaultProps} saveDisabled={true} />);
    expect(screen.getByText('Save')).toBeDisabled();
  });
});
