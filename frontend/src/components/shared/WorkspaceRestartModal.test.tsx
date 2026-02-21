import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WorkspaceRestartModal, { type WorkspaceInspection } from './WorkspaceRestartModal';

const inspection: WorkspaceInspection = {
  exists: true,
  is_empty: false,
  file_count: 8,
  src_file_count: 4,
  test_file_count: 2,
  has_git: true,
  top_files: ['README.md', 'src', 'tests', 'workspace.json'],
};

describe('WorkspaceRestartModal', () => {
  it('renders workspace summary details', () => {
    render(
      <WorkspaceRestartModal
        inspection={inspection}
        busyMode={null}
        errorMessage={null}
        onContinue={vi.fn()}
        onClean={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('Continue Learning From Existing Work?')).toBeInTheDocument();
    expect(screen.getByText(/8 files total/i)).toBeInTheDocument();
    expect(screen.getByText(/4 in/i)).toBeInTheDocument();
    expect(screen.getByText(/2 in/i)).toBeInTheDocument();
  });

  it('calls handlers for primary actions', () => {
    const onContinue = vi.fn();
    const onClean = vi.fn();
    const onCancel = vi.fn();
    render(
      <WorkspaceRestartModal
        inspection={inspection}
        busyMode={null}
        errorMessage={null}
        onContinue={onContinue}
        onClean={onClean}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByText('Continue From Existing Files (Recommended)'));
    fireEvent.click(screen.getByText('Start Clean From Spec (clears src/tests)'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onClean).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('closes on escape when idle', () => {
    const onCancel = vi.fn();
    render(
      <WorkspaceRestartModal
        inspection={inspection}
        busyMode={null}
        errorMessage={null}
        onContinue={vi.fn()}
        onClean={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
