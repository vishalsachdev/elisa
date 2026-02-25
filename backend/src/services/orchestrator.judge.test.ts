import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Orchestrator } from './orchestrator.js';
import { MetaPlanner } from './metaPlanner.js';
import { AgentRunner } from './agentRunner.js';
import { GitService } from './gitService.js';
import { TestRunner } from './testRunner.js';
import { TeachingEngine } from './teachingEngine.js';
import { DeployPhase } from './phases/deployPhase.js';
import { JudgePhase } from './phases/judgePhase.js';
import type { BuildSession } from '../models/session.js';

const SPEC = {
  nugget: { goal: 'Counter', type: 'general' },
  requirements: [{ type: 'feature', description: 'increment count' }],
  deployment: { target: 'preview', auto_flash: false },
  workflow: { testing_enabled: false, review_enabled: false, human_gates: [] },
};

const PLAN = {
  tasks: [
    {
      id: 'task-1',
      name: 'Build counter',
      description: 'implement increment button',
      dependencies: [],
      agent_name: 'Builder Bot',
      acceptance_criteria: ['button increments'],
    },
  ],
  agents: [
    { name: 'Builder Bot', role: 'builder', persona: 'friendly' },
  ],
  plan_explanation: 'Build counter in one step.',
};

function makeSession(): BuildSession {
  return {
    id: randomUUID(),
    state: 'idle',
    spec: SPEC,
    tasks: [],
    agents: [],
  };
}

function waitForEvent(
  events: Record<string, any>[],
  type: string,
  timeoutMs = 8000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (events.some((e) => e.type === type)) {
        clearInterval(timer);
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`Timed out waiting for event: ${type}`));
      }
    }, 10);
  });
}

describe('Orchestrator + Judge gate', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.OPENAI_API_KEY = 'test-key';

    vi.spyOn(MetaPlanner.prototype, 'plan').mockResolvedValue(PLAN as any);
    vi.spyOn(AgentRunner.prototype, 'execute').mockResolvedValue({
      success: true,
      summary: 'done',
      inputTokens: 100,
      outputTokens: 20,
      costUsd: 0.01,
    });
    vi.spyOn(GitService.prototype, 'initRepo').mockResolvedValue(undefined as any);
    vi.spyOn(GitService.prototype, 'commit').mockResolvedValue({
      sha: 'a',
      shortSha: 'a',
      message: 'commit',
      agentName: 'Builder Bot',
      taskId: 'task-1',
      timestamp: new Date().toISOString(),
      filesChanged: ['src/app.ts'],
    });
    vi.spyOn(TestRunner.prototype, 'runTests').mockResolvedValue({
      tests: [],
      passed: 0,
      failed: 0,
      total: 0,
      coverage_pct: null,
      coverage_details: null,
    });
    vi.spyOn(TeachingEngine.prototype, 'getMoment').mockResolvedValue(null);
    vi.spyOn(TeachingEngine.prototype, 'getShownConcepts').mockReturnValue([]);

    vi.spyOn(DeployPhase.prototype, 'shouldDeployWeb').mockReturnValue(false);
    vi.spyOn(DeployPhase.prototype, 'shouldDeployPortals').mockReturnValue(false);
    vi.spyOn(DeployPhase.prototype, 'shouldDeployHardware').mockReturnValue(false);
  });

  it('includes judge payload in session_complete when judge passes', async () => {
    vi.spyOn(JudgePhase.prototype, 'execute').mockResolvedValue({
      score: 88,
      threshold: 70,
      passed: true,
      checks: [],
      blocking_issues: [],
    });

    const events: Record<string, any>[] = [];
    const orchestrator = new Orchestrator(makeSession(), async (event) => { events.push(event); });
    await orchestrator.run(SPEC);

    const complete = events.find((e) => e.type === 'session_complete');
    expect(complete).toBeDefined();
    expect(complete.judge).toBeDefined();
    expect(complete.judge.score).toBe(88);
    expect(complete.judge.passed).toBe(true);
  });

  it('blocks completion when judge fails and user rejects override', async () => {
    vi.spyOn(JudgePhase.prototype, 'execute').mockResolvedValue({
      score: 42,
      threshold: 70,
      passed: false,
      checks: [],
      blocking_issues: ['Traceability is weak'],
    });

    const events: Record<string, any>[] = [];
    const orchestrator = new Orchestrator(makeSession(), async (event) => { events.push(event); });
    const runPromise = orchestrator.run(SPEC);

    await waitForEvent(events, 'human_gate');
    orchestrator.respondToGate(false);
    await runPromise;

    expect(events.some((e) => e.type === 'session_complete')).toBe(false);
    expect(events.some((e) => e.type === 'error' && String(e.message).includes('Judge'))).toBe(true);
  });

  it('allows completion when judge fails but user approves override', async () => {
    vi.spyOn(JudgePhase.prototype, 'execute').mockResolvedValue({
      score: 42,
      threshold: 70,
      passed: false,
      checks: [],
      blocking_issues: ['Traceability is weak'],
    });

    const events: Record<string, any>[] = [];
    const orchestrator = new Orchestrator(makeSession(), async (event) => { events.push(event); });
    const runPromise = orchestrator.run(SPEC);

    await waitForEvent(events, 'human_gate');
    orchestrator.respondToGate(true);
    await runPromise;

    const complete = events.find((e) => e.type === 'session_complete');
    expect(complete).toBeDefined();
    expect(complete.judge.overridden).toBe(true);
    expect(complete.judge.passed).toBe(true);
    expect(complete.judge.raw_passed).toBe(false);
  });
});
