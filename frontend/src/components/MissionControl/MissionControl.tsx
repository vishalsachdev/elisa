import { useState } from 'react';
import type { ProjectSpec } from '../BlockCanvas/blockInterpreter';
import type { UIState, WSEvent } from '../../types';

interface MissionControlProps {
  spec: ProjectSpec | null;
  events: WSEvent[];
  uiState: UIState;
}

export default function MissionControl({ spec, events, uiState }: MissionControlProps) {
  const [debugOpen, setDebugOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4 p-4">
      <h2 className="text-lg font-semibold">Mission Control</h2>

      <section>
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-1">Agent Team</h3>
        {spec?.agents.length ? (
          <ul className="text-sm space-y-1">
            {spec.agents.map((a, i) => (
              <li key={i} className="px-2 py-1 bg-orange-50 rounded">
                {a.name} ({a.role})
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400">No agents added yet</p>
        )}
      </section>

      <section>
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-1">Task Map</h3>
        <p className="text-sm text-gray-400">Tasks will appear here during a build</p>
      </section>

      <section>
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-1">Progress</h3>
        <p className="text-sm text-gray-400">
          State: <span className="font-mono">{uiState}</span>
        </p>
      </section>

      <section>
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-1">Comms Feed</h3>
        {events.length > 0 ? (
          <ul className="text-xs space-y-1 max-h-48 overflow-y-auto">
            {events.map((e, i) => (
              <li key={i} className="px-2 py-1 bg-gray-50 rounded font-mono">
                {e.type}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400">No events yet</p>
        )}
      </section>

      <section>
        <button
          onClick={() => setDebugOpen(!debugOpen)}
          className="text-xs text-gray-400 hover:text-gray-600 underline"
        >
          {debugOpen ? 'Hide' : 'Show'} Debug Spec
        </button>
        {debugOpen && spec && (
          <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto max-h-64">
            {JSON.stringify(spec, null, 2)}
          </pre>
        )}
      </section>
    </div>
  );
}
