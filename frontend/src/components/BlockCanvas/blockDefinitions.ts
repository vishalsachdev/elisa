import * as Blockly from 'blockly';

const blockDefs = [
  {
    type: 'project_goal',
    message0: 'I want to build... %1',
    args0: [
      {
        type: 'field_multilinetext',
        name: 'GOAL_TEXT',
        text: 'describe your project here',
      },
    ],
    nextStatement: null,
    colour: 210,
    tooltip: 'Describe what you want to build',
    helpUrl: '',
  },
  {
    type: 'feature',
    message0: 'It should be able to... %1',
    args0: [
      {
        type: 'field_input',
        name: 'FEATURE_TEXT',
        text: 'do something cool',
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 135,
    tooltip: 'Add a feature requirement',
    helpUrl: '',
  },
  {
    type: 'agent_builder',
    message0: 'Add a builder named %1 who is %2',
    args0: [
      {
        type: 'field_input',
        name: 'AGENT_NAME',
        text: 'Builder Bot',
      },
      {
        type: 'field_input',
        name: 'AGENT_PERSONA',
        text: 'a careful coder',
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 30,
    tooltip: 'Add a builder agent to your team',
    helpUrl: '',
  },
  {
    type: 'agent_tester',
    message0: 'Add a tester named %1 who is %2',
    args0: [
      {
        type: 'field_input',
        name: 'AGENT_NAME',
        text: 'Test Bot',
      },
      {
        type: 'field_input',
        name: 'AGENT_PERSONA',
        text: 'a thorough checker',
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 30,
    tooltip: 'Add a tester agent to your team',
    helpUrl: '',
  },
  {
    type: 'deploy_web',
    message0: 'Put it on the web',
    previousStatement: null,
    nextStatement: null,
    colour: 180,
    tooltip: 'Deploy your project to the web',
    helpUrl: '',
  },
  {
    type: 'deploy_esp32',
    message0: 'Flash it to my board',
    previousStatement: null,
    nextStatement: null,
    colour: 180,
    tooltip: 'Flash your project to an ESP32 board',
    helpUrl: '',
  },
];

let registered = false;

export function registerBlocks(): void {
  if (registered) return;
  Blockly.common.defineBlocks(
    Blockly.common.createBlockDefinitionsFromJsonArray(blockDefs)
  );
  registered = true;
}
