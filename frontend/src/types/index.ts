export type UIState = 'design' | 'building' | 'review' | 'deploy' | 'done';

export interface Task {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  agent_name: string;
  dependencies: string[];
}

export interface Agent {
  name: string;
  role: 'builder' | 'tester' | 'reviewer' | 'custom';
  persona: string;
  status: 'idle' | 'working' | 'done' | 'error';
}

export interface BuildSession {
  id: string;
  status: string;
  tasks: Task[];
  agents: Agent[];
}

export type WSEvent =
  | { type: 'session_started'; session_id: string }
  | { type: 'planning_started' }
  | { type: 'plan_ready'; tasks: Task[] }
  | { type: 'task_started'; task: Task }
  | { type: 'task_completed'; task: Task }
  | { type: 'task_failed'; task: Task; error: string }
  | { type: 'agent_spawned'; agent: Agent }
  | { type: 'agent_status'; agent: Agent }
  | { type: 'agent_message'; agent_name: string; message: string }
  | { type: 'code_generated'; task_id: string; file_path: string; preview: string }
  | { type: 'code_review_started'; task_id: string }
  | { type: 'code_review_complete'; task_id: string; approved: boolean; comments: string[] }
  | { type: 'test_started'; task_id: string }
  | { type: 'test_result'; task_id: string; passed: boolean; output: string }
  | { type: 'deploy_started'; target: string }
  | { type: 'deploy_progress'; target: string; message: string }
  | { type: 'deploy_complete'; target: string; url?: string }
  | { type: 'teaching_moment'; concept: string; explanation: string }
  | { type: 'error'; message: string }
  | { type: 'build_complete'; summary: string };
