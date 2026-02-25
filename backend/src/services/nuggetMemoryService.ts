/** Persistent build memory for plan retrieval and reusable skill/rule suggestions. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { CommitInfo } from '../models/session.js';

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'i',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'was',
  'we',
  'with',
  'you',
  'your',
]);

const MAX_KEYWORDS = 24;

interface MemorySkill {
  name: string;
  prompt: string;
  category: 'agent' | 'feature' | 'style' | 'composite';
}

interface MemoryRule {
  name: string;
  prompt: string;
  trigger: 'always' | 'on_task_complete' | 'on_test_fail' | 'before_deploy';
}

interface MemoryOutcome {
  success: boolean;
  tasksTotal: number;
  tasksCompleted: number;
  failedTasks: number;
  testsPassed: number;
  testsFailed: number;
  coveragePct: number | null;
  tokenTotal: number;
  costUsd: number;
  judgeScore: number | null;
  judgePassed: boolean;
  judgeOverridden: boolean;
}

interface MemoryRecord {
  id: string;
  sessionId: string;
  createdAt: string;
  goal: string;
  nuggetType: string;
  deploymentTarget: string;
  requirements: string[];
  keywords: string[];
  skills: MemorySkill[];
  rules: MemoryRule[];
  highlights: string[];
  outcome: MemoryOutcome;
}

interface MemoryDatabase {
  version: 1;
  records: MemoryRecord[];
}

export interface RecordRunInput {
  sessionId: string;
  spec: Record<string, unknown>;
  tasks: Array<Record<string, unknown>>;
  commits: CommitInfo[];
  testResults?: Record<string, unknown>;
  tokenSnapshot?: Record<string, unknown>;
  judge?: {
    score: number;
    threshold: number;
    passed: boolean;
    overridden?: boolean;
  };
}

export interface PlannerMemoryRun {
  goal: string;
  nugget_type: string;
  deployment_target: string;
  similarity: number;
  outcomes: string;
  skills_that_helped: string[];
  rules_that_helped: string[];
  what_worked: string[];
  pitfalls: string[];
}

export interface PlannerMemoryContext {
  similar_runs: PlannerMemoryRun[];
}

export interface MemorySuggestion {
  id: string;
  kind: 'skill' | 'rule';
  name: string;
  prompt: string;
  category?: 'agent' | 'feature' | 'style' | 'composite';
  trigger?: 'always' | 'on_task_complete' | 'on_test_fail' | 'before_deploy';
  rationale: string;
  confidence: number;
}

interface SimilarMatch {
  record: MemoryRecord;
  score: number;
}

interface SuggestionAccumulator {
  suggestion: Omit<MemorySuggestion, 'id' | 'rationale' | 'confidence'>;
  weightedScore: number;
  supportCount: number;
}

function defaultMemoryPath(): string {
  if (process.env.ELISA_MEMORY_PATH) return process.env.ELISA_MEMORY_PATH;
  if (process.env.NODE_ENV === 'test') {
    return path.join(os.tmpdir(), `.elisa-memory-test-${process.pid}-${randomUUID()}.json`);
  }
  return path.join(os.tmpdir(), '.elisa-memory', 'nugget-memory.json');
}

export class NuggetMemoryService {
  private readonly filePath: string;
  private readonly maxRecords: number;

  constructor(filePath?: string, maxRecords = 200) {
    this.filePath = filePath ?? defaultMemoryPath();
    this.maxRecords = maxRecords;
  }

  recordRun(input: RecordRunInput): MemoryRecord {
    const record = this.buildRecord(input);
    const db = this.loadDb();
    db.records = db.records.filter((r) => r.sessionId !== record.sessionId);
    db.records.push(record);
    if (db.records.length > this.maxRecords) {
      db.records = db.records.slice(db.records.length - this.maxRecords);
    }
    this.saveDb(db);
    return record;
  }

  getPlannerContext(spec: Record<string, unknown>, limit = 3): PlannerMemoryContext | null {
    const matches = this.findSimilar(spec, { limit, minScore: 0.2, onlySuccessful: false });
    if (matches.length === 0) return null;

    const similarRuns = matches.map(({ record, score }) => {
      const taskRatio = `${record.outcome.tasksCompleted}/${record.outcome.tasksTotal}`;
      const outcomes =
        `${taskRatio} tasks done` +
        (record.outcome.testsPassed + record.outcome.testsFailed > 0
          ? `, ${record.outcome.testsPassed}/${record.outcome.testsPassed + record.outcome.testsFailed} tests passed`
          : '') +
        (record.outcome.judgeScore != null
          ? `, judge ${record.outcome.judgeScore}/100`
          : '');

      const whatWorked: string[] = [];
      if (record.skills.length) {
        whatWorked.push(`Used skills: ${record.skills.slice(0, 3).map((s) => s.name).join(', ')}`);
      }
      if (record.rules.length) {
        whatWorked.push(`Applied rules: ${record.rules.slice(0, 3).map((r) => r.name).join(', ')}`);
      }
      if (record.outcome.testsFailed === 0 && record.outcome.testsPassed > 0) {
        whatWorked.push('Test suite passed cleanly');
      }
      if (record.highlights.length) {
        whatWorked.push(record.highlights[0]);
      }

      const pitfalls: string[] = [];
      if (record.outcome.failedTasks > 0) pitfalls.push(`${record.outcome.failedTasks} failed task(s)`);
      if (record.outcome.testsFailed > 0) pitfalls.push(`${record.outcome.testsFailed} failed test(s)`);

      return {
        goal: record.goal,
        nugget_type: record.nuggetType,
        deployment_target: record.deploymentTarget,
        similarity: Number(score.toFixed(2)),
        outcomes,
        skills_that_helped: record.skills.slice(0, 3).map((s) => s.name),
        rules_that_helped: record.rules.slice(0, 3).map((r) => r.name),
        what_worked: whatWorked,
        pitfalls,
      };
    });

    return { similar_runs: similarRuns };
  }

  suggestReusablePatterns(spec: Record<string, unknown>, limit = 4): MemorySuggestion[] {
    const matches = this.findSimilar(spec, { limit: 16, minScore: 0.18, onlySuccessful: true });
    if (matches.length === 0) return [];

    const currentSkills = this.extractSkills(spec.skills).map((s) => this.patternKey('skill', s.name, s.prompt));
    const currentRules = this.extractRules(spec.rules).map((r) => this.patternKey('rule', r.name, r.prompt));
    const existing = new Set<string>([...currentSkills, ...currentRules]);

    const aggregate = new Map<string, SuggestionAccumulator>();
    for (const match of matches) {
      const completionRate =
        match.record.outcome.tasksTotal > 0
          ? match.record.outcome.tasksCompleted / match.record.outcome.tasksTotal
          : 1;
      const judgeQuality =
        match.record.outcome.judgeScore != null
          ? Math.max(0, Math.min(1, match.record.outcome.judgeScore / 100))
          : (match.record.outcome.judgePassed ? 1 : 0.6);
      const weight = match.score * (0.35 + 0.65 * completionRate) * (0.4 + 0.6 * judgeQuality);

      for (const skill of match.record.skills) {
        if (!skill.prompt) continue;
        const key = this.patternKey('skill', skill.name, skill.prompt);
        if (existing.has(key)) continue;
        this.bumpSuggestion(aggregate, key, {
          kind: 'skill',
          name: skill.name,
          prompt: skill.prompt,
          category: skill.category,
        }, weight);
      }

      for (const rule of match.record.rules) {
        if (!rule.prompt) continue;
        const key = this.patternKey('rule', rule.name, rule.prompt);
        if (existing.has(key)) continue;
        this.bumpSuggestion(aggregate, key, {
          kind: 'rule',
          name: rule.name,
          prompt: rule.prompt,
          trigger: rule.trigger,
        }, weight);
      }
    }

    const ranked = [...aggregate.values()]
      .sort((a, b) => {
        if (b.weightedScore !== a.weightedScore) return b.weightedScore - a.weightedScore;
        return b.supportCount - a.supportCount;
      })
      .slice(0, limit);

    return ranked.map((entry, idx) => {
      const avgScore = entry.weightedScore / Math.max(1, entry.supportCount);
      return {
        id: `memory-suggestion-${idx + 1}`,
        ...entry.suggestion,
        rationale: `Worked in ${entry.supportCount} similar successful run(s).`,
        confidence: Number(Math.max(0.05, Math.min(1, avgScore)).toFixed(2)),
      };
    });
  }

  private bumpSuggestion(
    aggregate: Map<string, SuggestionAccumulator>,
    key: string,
    suggestion: Omit<MemorySuggestion, 'id' | 'rationale' | 'confidence'>,
    weight: number,
  ): void {
    const existing = aggregate.get(key);
    if (!existing) {
      aggregate.set(key, {
        suggestion,
        weightedScore: weight,
        supportCount: 1,
      });
      return;
    }
    existing.weightedScore += weight;
    existing.supportCount += 1;
  }

  private findSimilar(
    spec: Record<string, unknown>,
    opts: { limit: number; minScore: number; onlySuccessful: boolean },
  ): SimilarMatch[] {
    const db = this.loadDb();
    if (db.records.length === 0) return [];

    const current = this.profileSpec(spec);
    return db.records
      .map((record) => ({ record, score: this.similarityScore(current, record) }))
      .filter((match) => match.score >= opts.minScore)
      .filter((match) => (opts.onlySuccessful ? match.record.outcome.success : true))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (Number(b.record.outcome.success) !== Number(a.record.outcome.success)) {
          return Number(b.record.outcome.success) - Number(a.record.outcome.success);
        }
        return b.record.createdAt.localeCompare(a.record.createdAt);
      })
      .slice(0, opts.limit);
  }

  private profileSpec(spec: Record<string, unknown>): {
    nuggetType: string;
    deploymentTarget: string;
    keywords: string[];
  } {
    const goal = this.getString((spec.nugget as Record<string, unknown> | undefined)?.goal, 200);
    const requirements = this.getRequirementTexts(spec);
    const text = `${goal} ${requirements.join(' ')}`;
    return {
      nuggetType: this.getString((spec.nugget as Record<string, unknown> | undefined)?.type, 40) || 'software',
      deploymentTarget: this.getString((spec.deployment as Record<string, unknown> | undefined)?.target, 40) || 'preview',
      keywords: this.extractKeywords(text),
    };
  }

  private similarityScore(
    current: { nuggetType: string; deploymentTarget: string; keywords: string[] },
    record: MemoryRecord,
  ): number {
    const keywordScore = this.jaccard(current.keywords, record.keywords);
    const typeScore = current.nuggetType === record.nuggetType ? 1 : 0;
    const deployScore = current.deploymentTarget === record.deploymentTarget ? 1 : 0;
    const successBonus = record.outcome.success ? 0.05 : 0;
    return Number(Math.min(1, keywordScore * 0.6 + typeScore * 0.25 + deployScore * 0.15 + successBonus).toFixed(4));
  }

  private jaccard(a: string[], b: string[]): number {
    if (a.length === 0 || b.length === 0) return 0;
    const aSet = new Set(a);
    const bSet = new Set(b);
    let intersection = 0;
    for (const token of aSet) {
      if (bSet.has(token)) intersection += 1;
    }
    const union = new Set([...aSet, ...bSet]).size;
    return union === 0 ? 0 : intersection / union;
  }

  private patternKey(kind: 'skill' | 'rule', name: string, prompt: string): string {
    return `${kind}:${this.normalize(name)}:${this.normalize(prompt)}`;
  }

  private normalize(input: string): string {
    return input.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private buildRecord(input: RecordRunInput): MemoryRecord {
    const spec = input.spec;
    const requirements = this.getRequirementTexts(spec);
    const goal = this.getString((spec.nugget as Record<string, unknown> | undefined)?.goal, 200);
    const nuggetType = this.getString((spec.nugget as Record<string, unknown> | undefined)?.type, 40) || 'software';
    const deploymentTarget = this.getString((spec.deployment as Record<string, unknown> | undefined)?.target, 40) || 'preview';

    const tasksTotal = input.tasks.length;
    const tasksCompleted = input.tasks.filter((t) => this.getString(t.status, 20) === 'done').length;
    const failedTasks = input.tasks.filter((t) => this.getString(t.status, 20) === 'failed').length;

    const testsPassed = this.getNumber(input.testResults?.passed) ?? 0;
    const testsFailed = this.getNumber(input.testResults?.failed) ?? 0;
    const coveragePct = this.getNumber(input.testResults?.coverage_pct) ?? null;
    const tokenTotal = this.getNumber(input.tokenSnapshot?.total) ?? 0;
    const costUsd = this.getNumber(input.tokenSnapshot?.cost_usd) ?? 0;
    const judgeScore = this.getNumber(input.judge?.score) ?? null;
    const judgePassed = input.judge?.passed ?? true;
    const judgeOverridden = input.judge?.overridden ?? false;

    const success =
      failedTasks === 0 &&
      (tasksTotal === 0 || tasksCompleted === tasksTotal) &&
      testsFailed === 0 &&
      judgePassed;

    return {
      id: randomUUID(),
      sessionId: input.sessionId,
      createdAt: new Date().toISOString(),
      goal: goal || 'Untitled nugget',
      nuggetType,
      deploymentTarget,
      requirements: requirements.slice(0, 8),
      keywords: this.extractKeywords(`${goal} ${requirements.join(' ')}`),
      skills: this.extractSkills(spec.skills),
      rules: this.extractRules(spec.rules),
      highlights: this.extractHighlights(input.commits, input.tasks),
      outcome: {
        success,
        tasksTotal,
        tasksCompleted,
        failedTasks,
        testsPassed,
        testsFailed,
        coveragePct,
        tokenTotal,
        costUsd,
        judgeScore,
        judgePassed,
        judgeOverridden,
      },
    };
  }

  private extractHighlights(commits: CommitInfo[], tasks: Array<Record<string, unknown>>): string[] {
    const commitMessages = [...new Set(
      commits
        .map((c) => this.getString(c.message, 120))
        .filter((msg) => msg.length > 0),
    )];
    if (commitMessages.length > 0) return commitMessages.slice(0, 4);
    return tasks
      .filter((t) => this.getString(t.status, 20) === 'done')
      .map((t) => this.getString(t.name, 120))
      .filter((name) => name.length > 0)
      .slice(0, 4);
  }

  private getRequirementTexts(spec: Record<string, unknown>): string[] {
    const reqs = Array.isArray(spec.requirements) ? spec.requirements : [];
    return reqs
      .map((req) => {
        if (!req || typeof req !== 'object') return '';
        return this.getString((req as Record<string, unknown>).description, 200);
      })
      .filter((text) => text.length > 0);
  }

  private extractSkills(value: unknown): MemorySkill[] {
    const items = Array.isArray(value) ? value : [];
    const skills: MemorySkill[] = [];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const name = this.getString(rec.name, 80);
      const prompt = this.getString(rec.prompt, 500);
      const category = this.getString(rec.category, 20);
      if (!name || !prompt) continue;
      const safeCategory: MemorySkill['category'] =
        category === 'feature' || category === 'style' || category === 'composite'
          ? category
          : 'agent';
      skills.push({ name, prompt, category: safeCategory });
    }
    return skills.slice(0, 16);
  }

  private extractRules(value: unknown): MemoryRule[] {
    const items = Array.isArray(value) ? value : [];
    const rules: MemoryRule[] = [];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const name = this.getString(rec.name, 80);
      const prompt = this.getString(rec.prompt, 500);
      const trigger = this.getString(rec.trigger, 40);
      if (!name || !prompt) continue;
      const safeTrigger: MemoryRule['trigger'] =
        trigger === 'on_task_complete' || trigger === 'on_test_fail' || trigger === 'before_deploy'
          ? trigger
          : 'always';
      rules.push({ name, prompt, trigger: safeTrigger });
    }
    return rules.slice(0, 16);
  }

  private extractKeywords(text: string): string[] {
    if (!text) return [];
    const tokens = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));

    return [...new Set(tokens)].slice(0, MAX_KEYWORDS);
  }

  private getString(value: unknown, maxLen: number): string {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/\s+/g, ' ').slice(0, maxLen);
  }

  private getNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }

  private loadDb(): MemoryDatabase {
    try {
      if (!fs.existsSync(this.filePath)) return { version: 1, records: [] };
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<MemoryDatabase>;
      if (parsed.version === 1 && Array.isArray(parsed.records)) {
        return { version: 1, records: parsed.records };
      }
    } catch {
      // Corrupt file or parse error: continue with empty memory.
    }
    return { version: 1, records: [] };
  }

  private saveDb(db: MemoryDatabase): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmpFile = `${this.filePath}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
    fs.copyFileSync(tmpFile, this.filePath);
    fs.unlinkSync(tmpFile);
  }
}
