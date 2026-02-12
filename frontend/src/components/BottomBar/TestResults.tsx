import type { TestResult, UIState } from '../../types';

interface Props {
  results: TestResult[];
  coveragePct: number | null;
  uiState?: UIState;
}

export default function TestResults({ results, coveragePct, uiState }: Props) {
  if (results.length === 0) {
    if (uiState === 'building') {
      return <p className="text-sm text-accent-sky p-4">Tests will run after tasks complete...</p>;
    }
    return <p className="text-sm text-atelier-text-muted p-4">No test results yet</p>;
  }

  const passedCount = results.filter(r => r.passed).length;

  return (
    <div className="p-4 space-y-3">
      <p className="text-sm font-medium text-atelier-text">
        {passedCount}/{results.length} tests passing
      </p>
      {coveragePct !== null && (
        <div>
          <p className="text-xs text-atelier-text-muted mb-1">Coverage: {coveragePct.toFixed(1)}%</p>
          <div className="w-full h-1.5 bg-atelier-surface rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent-sky to-accent-lavender transition-all duration-300 rounded-full"
              role="progressbar"
              style={{ width: `${Math.min(coveragePct, 100)}%` }}
            />
          </div>
        </div>
      )}
      <ul className="text-xs space-y-1">
        {results.map((r, i) => (
          <li key={i} className="flex items-center gap-2 px-2.5 py-1.5 bg-atelier-surface/50 rounded-lg border border-border-subtle">
            <span className={`font-semibold ${r.passed ? 'text-accent-mint' : 'text-accent-coral'}`}>
              {r.passed ? 'PASS' : 'FAIL'}
            </span>
            <span className="font-mono text-atelier-text-secondary">{r.test_name}</span>
            {r.details && r.details !== 'PASSED' && r.details !== 'FAILED' && (
              <span className="text-atelier-text-muted ml-auto">{r.details}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
