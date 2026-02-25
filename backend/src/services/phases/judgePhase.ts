/** Judge phase: objective acceptance scoring based on spec, outputs, and tests. */

import fs from 'node:fs';
import path from 'node:path';
import type { CommitInfo } from '../../models/session.js';
import type { PhaseContext } from './types.js';

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'if', 'in', 'is', 'it',
  'of', 'on', 'or', 'that', 'the', 'then', 'this', 'to', 'when', 'with', 'without',
]);

const MAX_SCAN_FILES = 80;
const MAX_SCAN_BYTES = 180_000;
const SCAN_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.html', '.css', '.md', '.json', '.txt',
]);

export interface JudgeCheck {
  id: string;
  title: string;
  score: number;
  max_score: number;
  passed: boolean;
  details: string;
}

export interface JudgeResult {
  score: number;
  threshold: number;
  passed: boolean;
  checks: JudgeCheck[];
  blocking_issues: string[];
}

interface JudgeInput {
  tasks: Record<string, any>[];
  commits: CommitInfo[];
  testResults: Record<string, any>;
}

export class JudgePhase {
  private threshold: number;

  constructor(threshold?: number) {
    this.threshold = threshold ?? this.readThreshold();
  }

  async execute(ctx: PhaseContext, input: JudgeInput): Promise<JudgeResult> {
    await ctx.send({ type: 'judge_started', threshold: this.threshold });

    const spec = (ctx.session.spec ?? {}) as Record<string, any>;
    const requirements = this.getRequirements(spec);
    const behavioralTests = this.getBehavioralTests(spec);

    const artifactCorpus = this.buildArtifactCorpus(ctx.nuggetDir, input.tasks, input.commits, input.testResults);
    const artifactTokens = this.tokenize(artifactCorpus);
    const testCorpus = this.buildTestCorpus(input.testResults);
    const testTokens = this.tokenize(testCorpus);

    const checks: JudgeCheck[] = [];

    const completionCheck = this.scoreTaskCompletion(input.tasks);
    checks.push(completionCheck);

    const testingCheck = this.scoreTesting(spec, input.testResults);
    checks.push(testingCheck);

    const requirementCheck = this.scoreRequirements(requirements, artifactTokens);
    checks.push(requirementCheck);

    const behavioralCheck = this.scoreBehavioralTests(behavioralTests, testTokens, artifactTokens);
    checks.push(behavioralCheck);

    const totalPossible = checks.reduce((sum, check) => sum + check.max_score, 0);
    const totalEarned = checks.reduce((sum, check) => sum + check.score, 0);
    const score = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : 100;

    const blockingIssues = checks
      .filter((check) => !check.passed && (check.id === 'task_completion' || check.id === 'behavioral_traceability'))
      .map((check) => check.details);

    const passed = score >= this.threshold && blockingIssues.length === 0;

    const result: JudgeResult = {
      score,
      threshold: this.threshold,
      passed,
      checks,
      blocking_issues: blockingIssues,
    };

    await ctx.send({ type: 'judge_result', ...result });
    return result;
  }

  private readThreshold(): number {
    const raw = process.env.ELISA_JUDGE_MIN_SCORE;
    if (!raw) return 70;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return 70;
    return Math.max(0, Math.min(100, Math.round(parsed)));
  }

  private scoreTaskCompletion(tasks: Record<string, any>[]): JudgeCheck {
    const max = 35;
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === 'done').length;
    const failed = tasks.filter((t) => t.status === 'failed').length;

    if (total === 0) {
      return {
        id: 'task_completion',
        title: 'Task Completion',
        score: max,
        max_score: max,
        passed: true,
        details: 'No tasks were planned, so completion check is neutral-pass.',
      };
    }

    const completionRatio = done / total;
    const failPenalty = failed > 0 ? Math.min(0.4, failed / total) : 0;
    const normalized = Math.max(0, completionRatio - failPenalty);
    const score = Number((max * normalized).toFixed(1));
    const passed = done === total && failed === 0;

    return {
      id: 'task_completion',
      title: 'Task Completion',
      score,
      max_score: max,
      passed,
      details: `${done}/${total} tasks completed (${failed} failed).`,
    };
  }

  private scoreTesting(spec: Record<string, any>, testResults: Record<string, any>): JudgeCheck {
    const max = 25;
    const passed = Number(testResults.passed ?? 0);
    const failed = Number(testResults.failed ?? 0);
    const total = Number(testResults.total ?? 0);
    const testingExpected = Boolean(spec.workflow?.testing_enabled) || this.getBehavioralTests(spec).length > 0;

    if (total <= 0 && !testingExpected) {
      return {
        id: 'test_health',
        title: 'Test Health',
        score: max,
        max_score: max,
        passed: true,
        details: 'No tests required by the spec.',
      };
    }

    if (total <= 0 && testingExpected) {
      return {
        id: 'test_health',
        title: 'Test Health',
        score: 0,
        max_score: max,
        passed: false,
        details: 'Spec requested testing but no test results were produced.',
      };
    }

    const ratio = total > 0 ? passed / total : 0;
    const score = Number((max * ratio).toFixed(1));
    return {
      id: 'test_health',
      title: 'Test Health',
      score,
      max_score: max,
      passed: failed === 0,
      details: `${passed}/${total} tests passed.`,
    };
  }

  private scoreRequirements(requirements: Array<{ type: string; description: string }>, corpusTokens: Set<string>): JudgeCheck {
    const max = 25;
    if (requirements.length === 0) {
      return {
        id: 'requirement_traceability',
        title: 'Requirement Traceability',
        score: max,
        max_score: max,
        passed: true,
        details: 'No explicit requirements to trace.',
      };
    }

    const perRequirement = requirements.map((req) => {
      const tokens = this.extractKeywords(req.description);
      if (tokens.length === 0) return 1;
      const matched = tokens.filter((token) => corpusTokens.has(token)).length;
      return matched / tokens.length;
    });

    const avg = perRequirement.reduce((sum, value) => sum + value, 0) / perRequirement.length;
    const score = Number((max * avg).toFixed(1));
    const covered = perRequirement.filter((value) => value >= 0.5).length;

    return {
      id: 'requirement_traceability',
      title: 'Requirement Traceability',
      score,
      max_score: max,
      passed: avg >= 0.6,
      details: `${covered}/${requirements.length} requirements have strong trace evidence.`,
    };
  }

  private scoreBehavioralTests(
    behavioralTests: Array<{ when: string; then: string }>,
    testTokens: Set<string>,
    artifactTokens: Set<string>,
  ): JudgeCheck {
    const max = 15;
    if (behavioralTests.length === 0) {
      return {
        id: 'behavioral_traceability',
        title: 'Behavioral Traceability',
        score: max,
        max_score: max,
        passed: true,
        details: 'No behavioral tests defined in the spec.',
      };
    }

    const mergedTokens = new Set<string>([...testTokens, ...artifactTokens]);
    const perBehavior = behavioralTests.map((test) => {
      const tokens = this.extractKeywords(`${test.when} ${test.then}`);
      if (tokens.length === 0) return 1;
      const matched = tokens.filter((token) => mergedTokens.has(token)).length;
      return matched / tokens.length;
    });

    const avg = perBehavior.reduce((sum, value) => sum + value, 0) / perBehavior.length;
    const score = Number((max * avg).toFixed(1));
    const covered = perBehavior.filter((value) => value >= 0.5).length;

    return {
      id: 'behavioral_traceability',
      title: 'Behavioral Traceability',
      score,
      max_score: max,
      passed: avg >= 0.5,
      details: `${covered}/${behavioralTests.length} behavioral checks are strongly represented.`,
    };
  }

  private getRequirements(spec: Record<string, any>): Array<{ type: string; description: string }> {
    if (!Array.isArray(spec.requirements)) return [];
    return spec.requirements
      .map((r: any) => ({
        type: typeof r?.type === 'string' ? r.type : 'feature',
        description: typeof r?.description === 'string' ? r.description : '',
      }))
      .filter((r) => r.description.trim().length > 0);
  }

  private getBehavioralTests(spec: Record<string, any>): Array<{ when: string; then: string }> {
    const tests = spec.workflow?.behavioral_tests;
    if (!Array.isArray(tests)) return [];
    return tests
      .map((t: any) => ({
        when: typeof t?.when === 'string' ? t.when : '',
        then: typeof t?.then === 'string' ? t.then : '',
      }))
      .filter((t) => (t.when + t.then).trim().length > 0);
  }

  private buildArtifactCorpus(
    nuggetDir: string,
    tasks: Record<string, any>[],
    commits: CommitInfo[],
    testResults: Record<string, any>,
  ): string {
    const taskText = tasks.map((task) => (
      `${task.name ?? ''} ${task.description ?? ''} ${(task.acceptance_criteria ?? []).join(' ')}`
    )).join('\n');
    const commitText = commits.map((c) => c.message).join('\n');
    const testText = this.buildTestCorpus(testResults);
    const sourceText = this.readWorkspaceText(nuggetDir);
    return `${taskText}\n${commitText}\n${testText}\n${sourceText}`;
  }

  private buildTestCorpus(testResults: Record<string, any>): string {
    const tests = Array.isArray(testResults.tests) ? testResults.tests : [];
    return tests
      .map((t: any) => `${t?.test_name ?? ''} ${t?.details ?? ''}`)
      .join('\n');
  }

  private readWorkspaceText(rootDir: string): string {
    if (!fs.existsSync(rootDir)) return '';
    const queue = [rootDir];
    const chunks: string[] = [];
    let scannedFiles = 0;
    let scannedBytes = 0;

    while (queue.length > 0 && scannedFiles < MAX_SCAN_FILES && scannedBytes < MAX_SCAN_BYTES) {
      const current = queue.shift() as string;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (scannedFiles >= MAX_SCAN_FILES || scannedBytes >= MAX_SCAN_BYTES) break;
        if (entry.name.startsWith('.git') || entry.name === 'node_modules' || entry.name === '.elisa') continue;
        const abs = path.join(current, entry.name);
        if (entry.isDirectory()) {
          queue.push(abs);
          continue;
        }
        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (!SCAN_EXTENSIONS.has(ext)) continue;
        try {
          const content = fs.readFileSync(abs, 'utf-8');
          const clipped = content.slice(0, 4000);
          chunks.push(clipped);
          scannedFiles += 1;
          scannedBytes += clipped.length;
        } catch {
          // Ignore unreadable files
        }
      }
    }

    return chunks.join('\n');
  }

  private tokenize(text: string): Set<string> {
    return new Set(this.extractKeywords(text));
  }

  private extractKeywords(text: string): string[] {
    if (!text) return [];
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
  }
}

