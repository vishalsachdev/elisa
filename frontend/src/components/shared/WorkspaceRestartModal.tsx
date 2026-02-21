import { useEffect } from 'react';

export interface WorkspaceInspection {
  exists: boolean;
  is_empty: boolean;
  file_count: number;
  src_file_count: number;
  test_file_count: number;
  has_git: boolean;
  top_files: string[];
}

interface WorkspaceRestartModalProps {
  inspection: WorkspaceInspection;
  busyMode: 'continue' | 'clean' | null;
  errorMessage: string | null;
  onContinue: () => void;
  onClean: () => void;
  onCancel: () => void;
}

export default function WorkspaceRestartModal({
  inspection,
  busyMode,
  errorMessage,
  onContinue,
  onClean,
  onCancel,
}: WorkspaceRestartModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyMode) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busyMode, onCancel]);

  return (
    <div
      className="fixed inset-0 modal-backdrop z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-restart-title"
      onClick={() => { if (!busyMode) onCancel(); }}
    >
      <div
        className="glass-elevated rounded-2xl shadow-2xl p-6 max-w-xl w-full mx-4 animate-float-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="workspace-restart-title" className="text-xl font-display font-bold text-atelier-text">
          Continue Learning From Existing Work?
        </h2>
        <p className="text-sm text-atelier-text-secondary mt-2">
          This folder already has project files. Choose whether Elisa should continue from prior implementation
          or start clean from your current specification.
        </p>

        <div className="mt-4 rounded-xl border border-border-subtle bg-atelier-surface/60 p-4">
          <p className="text-sm text-atelier-text">
            Workspace summary: <span className="text-atelier-text-secondary">
              {inspection.file_count} file{inspection.file_count === 1 ? '' : 's'} total,
              {' '}{inspection.src_file_count} in <code>src/</code>,
              {' '}{inspection.test_file_count} in <code>tests/</code>
            </span>
          </p>
          {inspection.top_files.length > 0 && (
            <p className="text-xs text-atelier-text-muted mt-2 truncate" title={inspection.top_files.join(', ')}>
              Top-level: {inspection.top_files.join(', ')}
            </p>
          )}
        </div>

        {errorMessage && (
          <div className="mt-3 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {errorMessage}
          </div>
        )}

        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={onContinue}
            disabled={!!busyMode}
            className="go-btn w-full px-4 py-2.5 rounded-lg text-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busyMode === 'continue' ? 'Starting Build...' : 'Continue From Existing Files (Recommended)'}
          </button>
          <button
            onClick={onClean}
            disabled={!!busyMode}
            className="w-full px-4 py-2.5 rounded-lg text-sm cursor-pointer border border-amber-400/40 text-amber-200 hover:bg-amber-500/10 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busyMode === 'clean' ? 'Cleaning Workspace...' : 'Start Clean From Spec (clears src/tests)'}
          </button>
          <button
            onClick={onCancel}
            disabled={!!busyMode}
            className="w-full px-4 py-2.5 rounded-lg text-sm cursor-pointer text-atelier-text-secondary hover:bg-atelier-surface/80 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
