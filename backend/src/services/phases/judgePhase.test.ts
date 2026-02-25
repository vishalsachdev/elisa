/** Unit tests for JudgePhase. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JudgePhase } from './judgePhase.js';
import type { PhaseContext } from './types.js';

function makeCtx(spec: Record<string, any>, nuggetDir: string): PhaseContext {
  return {
    session: { id: 'session-1', state: 'testing', spec, tasks: [], agents: [] } as any,
    send: vi.fn().mockResolvedValue(undefined),
    logger: { phase: vi.fn() } as any,
    nuggetDir,
    nuggetType: 'software',
    abortSignal: new AbortController().signal,
  };
}

describe('JudgePhase', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    tmpDirs.length = 0;
  });

  it('passes when task completion, tests, and requirement traceability are strong', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'judge-pass-'));
    tmpDirs.push(dir);
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src', 'app.ts'),
      'export function addTodo(items){ return [...items]; } // persist local storage',
      'utf-8',
    );

    const spec = {
      nugget: { goal: 'Todo app', type: 'software' },
      requirements: [{ type: 'feature', description: 'add todo items and persist local storage' }],
      workflow: {
        testing_enabled: true,
        behavioral_tests: [{ when: 'user adds todo', then: 'list updates' }],
      },
    };

    const ctx = makeCtx(spec, dir);
    const phase = new JudgePhase(70);

    const result = await phase.execute(ctx, {
      tasks: [{ id: 'task-1', name: 'Add todo feature', description: 'Implement add todo', status: 'done' }],
      commits: [
        {
          sha: 'a',
          shortSha: 'a',
          message: 'Added todo list updates with local storage',
          agentName: 'Builder Bot',
          taskId: 'task-1',
          timestamp: new Date().toISOString(),
          filesChanged: ['src/app.ts'],
        },
      ],
      testResults: {
        tests: [{ test_name: 'test user adds todo list updates', passed: true, details: 'PASSED' }],
        passed: 1,
        failed: 0,
        total: 1,
      },
    });

    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(vi.mocked(ctx.send).mock.calls.map(([event]) => event.type)).toEqual([
      'judge_started',
      'judge_result',
    ]);
  });

  it('fails when behavioral/requirement evidence is missing', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'judge-fail-'));
    tmpDirs.push(dir);
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'app.ts'), 'export const x = 1;', 'utf-8');

    const spec = {
      nugget: { goal: 'Weather app', type: 'software' },
      requirements: [{ type: 'feature', description: 'render seven day humidity trend chart' }],
      workflow: {
        testing_enabled: true,
        behavioral_tests: [{ when: 'user clicks humidity trend', then: 'seven day chart appears' }],
      },
    };

    const ctx = makeCtx(spec, dir);
    const phase = new JudgePhase(70);

    const result = await phase.execute(ctx, {
      tasks: [{ id: 'task-1', name: 'Scaffold', description: 'setup app', status: 'done' }],
      commits: [],
      testResults: { tests: [], passed: 0, failed: 0, total: 0 },
    });

    expect(result.passed).toBe(false);
    expect(result.score).toBeLessThan(70);
    expect(result.blocking_issues.length).toBeGreaterThan(0);
  });
});

