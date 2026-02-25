/** Orchestrates the build pipeline: planning, execution, testing, deployment. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import type { BuildSession, CommitInfo } from '../models/session.js';
import type { PhaseContext } from './phases/types.js';
import { PlanPhase } from './phases/planPhase.js';
import { ExecutePhase } from './phases/executePhase.js';
import { TestPhase } from './phases/testPhase.js';
import { DeployPhase } from './phases/deployPhase.js';
import { JudgePhase, type JudgeResult } from './phases/judgePhase.js';
import { AgentRunner } from './agentRunner.js';
import { GitService } from './gitService.js';
import { HardwareService } from './hardwareService.js';
import { MetaPlanner } from './metaPlanner.js';
import { PortalService } from './portalService.js';
import { TeachingEngine } from './teachingEngine.js';
import { TestRunner } from './testRunner.js';
import { NarratorService } from './narratorService.js';
import { PermissionPolicy } from './permissionPolicy.js';
import { NuggetMemoryService, type MemorySuggestion } from './nuggetMemoryService.js';
import { ContextManager } from '../utils/contextManager.js';
import { SessionLogger } from '../utils/sessionLogger.js';
import { TokenTracker } from '../utils/tokenTracker.js';

type SendEvent = (event: Record<string, any>) => Promise<void>;

export class Orchestrator {
  private session: BuildSession;
  private send: SendEvent;
  private logger: SessionLogger | null = null;
  nuggetDir: string;
  private nuggetType = 'software';
  private testResults: Record<string, any> = {};
  private commits: CommitInfo[] = [];
  private serialHandle: { close: () => void } | null = null;
  private webServerProcess: ChildProcess | null = null;
  private userWorkspace: boolean;
  private workspaceRestartMode: 'continue' | 'clean';

  // Cancellation
  private abortController = new AbortController();

  // Gate: Promise-based blocking
  private gateResolver: { current: ((value: Record<string, any>) => void) | null } = { current: null };

  // Question: Promise-based blocking for interactive questions
  private questionResolvers = new Map<string, (answers: Record<string, any>) => void>();

  // Services
  private agentRunner = new AgentRunner();
  private git: GitService | null = new GitService();
  private context = new ContextManager();
  private tokenTracker = new TokenTracker();
  private teachingEngine = new TeachingEngine();
  private testRunner = new TestRunner();
  private nuggetMemory = new NuggetMemoryService();
  private hardwareService: HardwareService;
  private portalService: PortalService;
  private narratorService = new NarratorService();
  private permissionPolicy: PermissionPolicy | null = null;

  // Phase handlers
  private planPhase: PlanPhase;
  private testPhase: TestPhase;
  private deployPhase: DeployPhase;
  private judgePhase: JudgePhase;

  constructor(
    session: BuildSession,
    sendEvent: SendEvent,
    hardwareService?: HardwareService,
    workspacePath?: string,
    workspaceRestartMode: 'continue' | 'clean' = 'continue',
  ) {
    this.session = session;
    this.send = sendEvent;
    this.nuggetDir = workspacePath || path.join(os.tmpdir(), `elisa-nugget-${session.id}`);
    this.userWorkspace = !!workspacePath;
    this.workspaceRestartMode = workspaceRestartMode;
    this.hardwareService = hardwareService ?? new HardwareService();
    this.portalService = new PortalService(this.hardwareService);

    this.planPhase = new PlanPhase(new MetaPlanner(), this.teachingEngine, this.nuggetMemory);
    this.testPhase = new TestPhase(this.testRunner, this.teachingEngine);
    this.deployPhase = new DeployPhase(
      this.hardwareService,
      this.portalService,
      this.teachingEngine,
    );
    this.judgePhase = new JudgePhase();
  }

  private makeContext(): PhaseContext {
    return {
      session: this.session,
      send: this.send,
      logger: this.logger,
      nuggetDir: this.nuggetDir,
      nuggetType: this.nuggetType,
      abortSignal: this.abortController.signal,
    };
  }

  async run(spec: Record<string, any>): Promise<void> {
    try {
      const ctx = this.makeContext();

      // Plan
      const planResult = await this.planPhase.execute(ctx, spec);
      this.nuggetType = planResult.nuggetType;

      // Initialize portals if needed
      const updatedCtx = this.makeContext();
      if (this.deployPhase.shouldDeployPortals(updatedCtx)) {
        await this.deployPhase.initializePortals(updatedCtx);
      }

      // Execute
      this.permissionPolicy = new PermissionPolicy(
        this.nuggetDir,
        (spec as any).permissions ?? {},
      );
      this.narratorService.reset();

      const executePhase = new ExecutePhase({
        agentRunner: this.agentRunner,
        git: this.git,
        teachingEngine: this.teachingEngine,
        tokenTracker: this.tokenTracker,
        portalService: this.portalService,
        context: this.context,
        tasks: planResult.tasks,
        agents: planResult.agents,
        taskMap: planResult.taskMap,
        agentMap: planResult.agentMap,
        dag: planResult.dag,
        questionResolvers: this.questionResolvers,
        gateResolver: this.gateResolver,
        narratorService: this.narratorService,
        permissionPolicy: this.permissionPolicy,
        workspaceRestartMode: this.workspaceRestartMode,
      });

      // Initialize logger before execute so plan and execute phases get logging
      this.logger = new SessionLogger(this.nuggetDir);

      const executeResult = await executePhase.execute(this.makeContext());
      this.commits = executeResult.commits;

      // Test
      const testResult = await this.testPhase.execute(this.makeContext());
      this.testResults = testResult.testResults;

      // Deploy
      const deployCtx = this.makeContext();
      if (this.deployPhase.shouldDeployWeb(deployCtx)) {
        const { process: webProc } = await this.deployPhase.deployWeb(deployCtx);
        this.webServerProcess = webProc;
      }
      if (this.deployPhase.shouldDeployPortals(deployCtx)) {
        const { serialHandle } = await this.deployPhase.deployPortals(deployCtx);
        this.serialHandle = serialHandle;
      } else if (this.deployPhase.shouldDeployHardware(deployCtx)) {
        const { serialHandle } = await this.deployPhase.deployHardware(deployCtx);
        this.serialHandle = serialHandle;
      }

      const judgeResult = await this.judgePhase.execute(this.makeContext(), {
        tasks: planResult.tasks,
        commits: this.commits,
        testResults: this.testResults,
      });

      let judgeOverride = false;
      if (!judgeResult.passed) {
        judgeOverride = await this.requestJudgeOverride(judgeResult);
      }

      // Complete
      await this.complete(planResult.tasks, planResult.agents, judgeResult, judgeOverride);
    } catch (err: any) {
      console.error('Orchestrator error:', err);
      this.logger?.error('Orchestrator error', {
        message: String(err.message || err),
        stack: err.stack,
      });
      this.session.state = 'done';
      await this.send({
        type: 'error',
        message: String(err.message || err),
        recoverable: false,
      });
    } finally {
      await this.deployPhase.teardown();
      this.logger?.close();
    }
  }

  // -- Completion --

  private async complete(
    tasks: Record<string, any>[],
    agents: Record<string, any>[],
    judgeResult?: JudgeResult,
    judgeOverride = false,
  ): Promise<void> {
    // Close serial monitor immediately so the COM port is free for the next session
    if (this.serialHandle) {
      try { this.serialHandle.close(); } catch { /* ignore */ }
      this.serialHandle = null;
    }

    this.session.state = 'done';
    this.logger?.phase('done');
    for (const agent of agents) agent.status = 'done';

    const doneCount = tasks.filter((t) => t.status === 'done').length;
    const total = tasks.length;
    const failedCount = tasks.filter((t) => t.status === 'failed').length;

    this.logger?.sessionSummary(doneCount, failedCount, total);

    const summaryParts = [`Completed ${doneCount}/${total} tasks.`];
    if (failedCount) summaryParts.push(`${failedCount} task(s) failed.`);

    const shown = this.teachingEngine.getShownConcepts();
    if (shown.length) {
      const conceptNames = shown.map((c) => c.split(':')[0]);
      const unique = [...new Set(conceptNames)];
      summaryParts.push(`Concepts learned: ${unique.join(', ')}`);
    }
    if (judgeResult) {
      summaryParts.push(`Judge score: ${judgeResult.score}/${100}.`);
      if (judgeOverride) summaryParts.push('Shipped with human override.');
    }

    const suggestions = this.buildMemorySuggestions(tasks, judgeResult, judgeOverride);

    await this.send({
      type: 'session_complete',
      summary: summaryParts.join(' '),
      suggestions,
      ...(judgeResult
        ? {
            judge: {
              ...judgeResult,
              overridden: judgeOverride,
              raw_passed: judgeResult.passed,
              passed: judgeResult.passed || judgeOverride,
            },
          }
        : {}),
    });
  }

  private async requestJudgeOverride(judgeResult: JudgeResult): Promise<boolean> {
    const shortIssues = judgeResult.blocking_issues.slice(0, 3).join(' ');
    const question = `Nugget Judge scored ${judgeResult.score}/${judgeResult.threshold}. Ship anyway?`;
    const context =
      shortIssues ||
      'Objective checks found quality gaps. Approve to continue shipping, or reject to stop.';

    this.session.state = 'reviewing';
    await this.send({
      type: 'human_gate',
      task_id: '__judge__',
      question,
      context,
    });

    const response = await new Promise<Record<string, any>>((resolve) => {
      this.gateResolver.current = resolve;
    });
    this.gateResolver.current = null;

    if (!response.approved) {
      throw new Error('Build stopped: Nugget Judge score below threshold and override was rejected.');
    }
    return true;
  }

  private buildMemorySuggestions(
    tasks: Record<string, any>[],
    judgeResult?: JudgeResult,
    judgeOverride = false,
  ): MemorySuggestion[] {
    try {
      this.nuggetMemory.recordRun({
        sessionId: this.session.id,
        spec: (this.session.spec ?? {}) as Record<string, unknown>,
        tasks: tasks as Array<Record<string, unknown>>,
        commits: this.commits,
        testResults: this.testResults as Record<string, unknown>,
        tokenSnapshot: this.tokenTracker.snapshot() as Record<string, unknown>,
        ...(judgeResult
          ? {
              judge: {
                score: judgeResult.score,
                threshold: judgeResult.threshold,
                passed: judgeResult.passed || judgeOverride,
                overridden: judgeOverride,
              },
            }
          : {}),
      });

      return this.nuggetMemory.suggestReusablePatterns(
        (this.session.spec ?? {}) as Record<string, unknown>,
        4,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger?.warn(`Nugget memory update failed: ${message}`);
      return [];
    }
  }

  /** Signal cancellation to the execution loop and release resources. */
  cancel(): void {
    this.abortController.abort();
  }

  /** Clean up the nugget temp directory immediately (skipped for user workspaces). */
  cleanup(): void {
    // Kill web server process if running
    if (this.webServerProcess) {
      try { this.webServerProcess.kill(); } catch { /* ignore */ }
      this.webServerProcess = null;
    }
    // Close serial monitor so the COM port is released for the next flash
    if (this.serialHandle) {
      try { this.serialHandle.close(); } catch { /* ignore */ }
      this.serialHandle = null;
    }
    // Skip directory cleanup for user-chosen workspaces
    if (this.userWorkspace) return;
    try {
      if (fs.existsSync(this.nuggetDir)) {
        fs.rmSync(this.nuggetDir, { recursive: true, force: true });
      }
    } catch {
      // Best-effort cleanup
    }
  }

  respondToGate(approved: boolean, feedback = ''): void {
    if (this.gateResolver.current) {
      this.gateResolver.current({ approved, feedback });
      this.gateResolver.current = null;
    }
  }

  respondToQuestion(taskId: string, answers: Record<string, any>): void {
    const resolver = this.questionResolvers.get(taskId);
    if (resolver) {
      resolver(answers);
      this.questionResolvers.delete(taskId);
    }
  }

  // -- Public accessors --

  getCommits(): Record<string, any>[] {
    return this.commits.map((c) => ({
      sha: c.sha,
      short_sha: c.shortSha,
      message: c.message,
      agent_name: c.agentName,
      task_id: c.taskId,
      timestamp: c.timestamp,
      files_changed: c.filesChanged,
    }));
  }

  getTestResults(): Record<string, any> {
    return this.testResults;
  }
}
