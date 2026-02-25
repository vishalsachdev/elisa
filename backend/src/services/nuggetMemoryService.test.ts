import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NuggetMemoryService } from './nuggetMemoryService.js';

function makeSpec(goal: string): Record<string, unknown> {
  return {
    nugget: { goal, type: 'software' },
    deployment: { target: 'web' },
    requirements: [
      { type: 'feature', description: 'Add and remove todo items' },
      { type: 'feature', description: 'Persist tasks to local storage' },
    ],
  };
}

describe('NuggetMemoryService', () => {
  let tmpDir: string;
  let memoryPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nugget-memory-test-'));
    memoryPath = path.join(tmpDir, 'memory.json');
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('records runs and returns similar planner context', () => {
    const memory = new NuggetMemoryService(memoryPath);

    memory.recordRun({
      sessionId: 's1',
      spec: makeSpec('Build a todo app'),
      tasks: [
        { id: 'task-1', name: 'Build UI', status: 'done' },
        { id: 'task-2', name: 'Write tests', status: 'done' },
      ],
      commits: [
        {
          sha: 'a',
          shortSha: 'a',
          message: 'Builder Bot: Added todo list UI',
          agentName: 'Builder Bot',
          taskId: 'task-1',
          timestamp: new Date().toISOString(),
          filesChanged: ['src/app.js'],
        },
      ],
      testResults: { passed: 4, failed: 0, coverage_pct: 92 },
      tokenSnapshot: { total: 12000, cost_usd: 0.24 },
    });

    const context = memory.getPlannerContext(makeSpec('Create a todo list website'));
    expect(context).not.toBeNull();
    expect(context?.similar_runs.length).toBeGreaterThan(0);
    expect(context?.similar_runs[0].goal).toContain('todo');
  });

  it('suggests reusable skills and rules from successful similar runs', () => {
    const memory = new NuggetMemoryService(memoryPath);

    const spec = {
      ...makeSpec('Portfolio site'),
      skills: [
        {
          id: 'skill-a',
          name: 'Responsive polish',
          prompt: 'Make layouts adapt to mobile screens with a single-column fallback.',
          category: 'style',
        },
      ],
      rules: [
        {
          id: 'rule-a',
          name: 'No debug logs',
          prompt: 'Remove console.log and debug statements before finishing.',
          trigger: 'always',
        },
      ],
    };

    memory.recordRun({
      sessionId: 's2',
      spec,
      tasks: [{ id: 'task-1', name: 'Build', status: 'done' }],
      commits: [],
      testResults: { passed: 1, failed: 0 },
      tokenSnapshot: { total: 8000, cost_usd: 0.12 },
    });

    const suggestions = memory.suggestReusablePatterns({
      ...makeSpec('Personal portfolio website'),
      skills: [],
      rules: [],
    });

    expect(suggestions.some((s) => s.kind === 'skill' && s.name === 'Responsive polish')).toBe(true);
    expect(suggestions.some((s) => s.kind === 'rule' && s.name === 'No debug logs')).toBe(true);
  });

  it('enforces max record cap', () => {
    const memory = new NuggetMemoryService(memoryPath, 2);

    memory.recordRun({
      sessionId: 's1',
      spec: makeSpec('One'),
      tasks: [{ id: 'task-1', name: 'Build', status: 'done' }],
      commits: [],
    });
    memory.recordRun({
      sessionId: 's2',
      spec: makeSpec('Two'),
      tasks: [{ id: 'task-1', name: 'Build', status: 'done' }],
      commits: [],
    });
    memory.recordRun({
      sessionId: 's3',
      spec: makeSpec('Three'),
      tasks: [{ id: 'task-1', name: 'Build', status: 'done' }],
      commits: [],
    });

    const raw = JSON.parse(fs.readFileSync(memoryPath, 'utf-8')) as { records: Array<{ sessionId: string }> };
    expect(raw.records).toHaveLength(2);
    expect(raw.records.map((r) => r.sessionId)).toEqual(['s2', 's3']);
  });
});

