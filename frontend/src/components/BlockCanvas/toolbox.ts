export const toolbox = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: 'Goals',
      colour: '210',
      contents: [{ kind: 'block', type: 'project_goal' }],
    },
    {
      kind: 'category',
      name: 'Requirements',
      colour: '135',
      contents: [{ kind: 'block', type: 'feature' }],
    },
    {
      kind: 'category',
      name: 'Agents',
      colour: '30',
      contents: [
        { kind: 'block', type: 'agent_builder' },
        { kind: 'block', type: 'agent_tester' },
      ],
    },
    {
      kind: 'category',
      name: 'Deploy',
      colour: '180',
      contents: [
        { kind: 'block', type: 'deploy_web' },
        { kind: 'block', type: 'deploy_esp32' },
      ],
    },
  ],
};
