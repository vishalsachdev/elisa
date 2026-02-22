/** Tool definitions for OpenAI function calling. */

import type OpenAI from 'openai';

/**
 * Tool definitions compatible with OpenAI's function calling format.
 * These match the tools allowed in executePhase.ts.
 */
export const TOOL_DEFINITIONS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'Read',
      description: 'Read the contents of a file. Returns the file content as a string.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The path to the file to read, relative to the working directory.',
          },
        },
        required: ['file_path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'Write',
      description: 'Write content to a file. Creates the file if it does not exist, overwrites if it does.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The path to the file to write, relative to the working directory.',
          },
          content: {
            type: 'string',
            description: 'The content to write to the file.',
          },
        },
        required: ['file_path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'Edit',
      description: 'Edit a file by replacing an exact string match with new content.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The path to the file to edit.',
          },
          old_string: {
            type: 'string',
            description: 'The exact string to find and replace. Must match exactly.',
          },
          new_string: {
            type: 'string',
            description: 'The replacement string.',
          },
        },
        required: ['file_path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'MultiEdit',
      description: 'Perform multiple edits to a file in a single operation.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The path to the file to edit.',
          },
          edits: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                old_string: { type: 'string' },
                new_string: { type: 'string' },
              },
              required: ['old_string', 'new_string'],
            },
            description: 'Array of {old_string, new_string} edit operations.',
          },
        },
        required: ['file_path', 'edits'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'Glob',
      description: 'Find files matching a glob pattern.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'The glob pattern to match (e.g., "**/*.ts", "src/*.py").',
          },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'Grep',
      description: 'Search for a pattern in files. Returns matching lines with file paths and line numbers.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'The regex pattern to search for.',
          },
          path: {
            type: 'string',
            description: 'The file or directory to search in. Defaults to current directory.',
          },
          include: {
            type: 'string',
            description: 'Glob pattern to filter files (e.g., "*.ts").',
          },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'LS',
      description: 'List files and directories in a path.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The directory to list. Defaults to current directory.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'Bash',
      description: 'Execute a bash command. Use for running tests, builds, or other shell operations.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The bash command to execute.',
          },
          timeout: {
            type: 'number',
            description: 'Timeout in milliseconds. Defaults to 30000 (30 seconds).',
          },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'NotebookEdit',
      description: 'Edit a cell in a Jupyter notebook.',
      parameters: {
        type: 'object',
        properties: {
          notebook_path: {
            type: 'string',
            description: 'Path to the .ipynb file.',
          },
          cell_index: {
            type: 'number',
            description: 'Index of the cell to edit (0-based).',
          },
          new_source: {
            type: 'string',
            description: 'New source code for the cell.',
          },
          cell_type: {
            type: 'string',
            enum: ['code', 'markdown'],
            description: 'Type of the cell.',
          },
        },
        required: ['notebook_path', 'cell_index', 'new_source'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'NotebookRead',
      description: 'Read the contents of a Jupyter notebook.',
      parameters: {
        type: 'object',
        properties: {
          notebook_path: {
            type: 'string',
            description: 'Path to the .ipynb file.',
          },
        },
        required: ['notebook_path'],
      },
    },
  },
];

/**
 * Get tool definitions filtered by allowed tool names.
 */
export function getToolsForAllowedList(
  allowedTools: string[],
): OpenAI.Chat.Completions.ChatCompletionTool[] {
  if (!allowedTools.length) return [];
  const allowedSet = new Set(allowedTools);
  return TOOL_DEFINITIONS.filter((t) => {
    if (t.type !== 'function') return false;
    return allowedSet.has(t.function.name);
  });
}

/**
 * Get a map of tool names to their definitions for quick lookup.
 */
export function getToolMap(): Map<string, OpenAI.Chat.Completions.ChatCompletionTool> {
  const map = new Map<string, OpenAI.Chat.Completions.ChatCompletionTool>();
  for (const tool of TOOL_DEFINITIONS) {
    if (tool.type === 'function') {
      map.set(tool.function.name, tool);
    }
  }
  return map;
}
