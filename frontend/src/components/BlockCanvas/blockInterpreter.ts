export interface ProjectSpec {
  project: {
    goal: string;
    description: string;
    type: string;
  };
  requirements: Array<{
    type: string;
    description: string;
  }>;
  style?: {
    visual: string | null;
    personality: string | null;
  };
  agents: Array<{
    name: string;
    role: string;
    persona: string;
  }>;
  hardware?: {
    target: string;
    components: Array<{ type: string; [key: string]: unknown }>;
  };
  deployment: {
    target: string;
    auto_flash: boolean;
  };
  workflow: {
    review_enabled: boolean;
    testing_enabled: boolean;
    human_gates: string[];
  };
}

interface BlockJson {
  type: string;
  fields?: Record<string, unknown>;
  next?: { block: BlockJson };
}

interface WorkspaceJson {
  blocks?: {
    blocks?: BlockJson[];
  };
}

function walkNextChain(block: BlockJson): BlockJson[] {
  const chain: BlockJson[] = [block];
  let current = block;
  while (current.next?.block) {
    chain.push(current.next.block);
    current = current.next.block;
  }
  return chain;
}

export function interpretWorkspace(json: Record<string, unknown>): ProjectSpec {
  const ws = json as unknown as WorkspaceJson;
  const topBlocks = ws.blocks?.blocks ?? [];

  const spec: ProjectSpec = {
    project: { goal: '', description: '', type: 'general' },
    requirements: [],
    agents: [],
    deployment: { target: 'preview', auto_flash: false },
    workflow: {
      review_enabled: false,
      testing_enabled: false,
      human_gates: [],
    },
  };

  const goalBlock = topBlocks.find((b) => b.type === 'project_goal');
  if (!goalBlock) return spec;

  const chain = walkNextChain(goalBlock);

  let hasWeb = false;
  let hasEsp32 = false;

  for (const block of chain) {
    switch (block.type) {
      case 'project_goal': {
        const text = (block.fields?.GOAL_TEXT as string) ?? '';
        spec.project.goal = text;
        spec.project.description = text;
        break;
      }
      case 'feature': {
        const text = (block.fields?.FEATURE_TEXT as string) ?? '';
        spec.requirements.push({ type: 'feature', description: text });
        break;
      }
      case 'agent_builder': {
        const name = (block.fields?.AGENT_NAME as string) ?? 'Builder';
        const persona = (block.fields?.AGENT_PERSONA as string) ?? '';
        spec.agents.push({ name, role: 'builder', persona });
        break;
      }
      case 'agent_tester': {
        const name = (block.fields?.AGENT_NAME as string) ?? 'Tester';
        const persona = (block.fields?.AGENT_PERSONA as string) ?? '';
        spec.agents.push({ name, role: 'tester', persona });
        spec.workflow.testing_enabled = true;
        break;
      }
      case 'deploy_web':
        hasWeb = true;
        break;
      case 'deploy_esp32':
        hasEsp32 = true;
        spec.project.type = 'hardware';
        break;
    }
  }

  if (hasWeb && hasEsp32) spec.deployment.target = 'both';
  else if (hasWeb) spec.deployment.target = 'web';
  else if (hasEsp32) {
    spec.deployment.target = 'esp32';
    spec.deployment.auto_flash = true;
  }

  return spec;
}
