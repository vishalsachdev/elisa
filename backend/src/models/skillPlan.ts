/** Shared types for composable skill plans -- mirrors frontend/src/components/Skills/types.ts */

export interface AskUserStep {
  id: string;
  type: 'ask_user';
  question: string;
  header: string;
  options: string[];
  storeAs: string;
}

export interface BranchStep {
  id: string;
  type: 'branch';
  contextKey: string;
  matchValue: string;
  thenSteps: SkillStep[];
}

export interface InvokeSkillStep {
  id: string;
  type: 'invoke_skill';
  skillId: string;
  storeAs: string;
}

export interface RunAgentStep {
  id: string;
  type: 'run_agent';
  prompt: string;
  storeAs: string;
}

export interface SetContextStep {
  id: string;
  type: 'set_context';
  key: string;
  value: string;
}

export interface OutputStep {
  id: string;
  type: 'output';
  template: string;
}

export type SkillStep =
  | AskUserStep
  | BranchStep
  | InvokeSkillStep
  | RunAgentStep
  | SetContextStep
  | OutputStep;

export interface SkillPlan {
  skillId?: string;
  skillName: string;
  steps: SkillStep[];
}

export interface SkillContext {
  entries: Record<string, string | string[]>;
  parentContext?: SkillContext;
}

export interface SkillSpec {
  id: string;
  name: string;
  prompt: string;
  category: string;
  workspace?: Record<string, unknown>;
}
