/** Tool executor for running agent tools with proper sandboxing. */

import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { glob } from 'glob';

export interface ToolInput {
  [key: string]: unknown;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  durationMs: number;
}

/**
 * Execute a tool by name with given arguments.
 * All tools are sandboxed to the working directory.
 */
export async function executeTool(
  toolName: string,
  args: ToolInput,
  workingDir: string,
): Promise<ToolResult> {
  const startTime = Date.now();

  try {
    const result = await executeToolImpl(toolName, args, workingDir);
    return {
      success: true,
      output: result,
      durationMs: Date.now() - startTime,
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      output: '',
      error: errorMessage,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Execute multiple tools in parallel.
 * Per Attractor spec: "Launch all tool execute handlers concurrently"
 */
export async function executeToolsParallel(
  tools: Array<{ name: string; args: ToolInput; id: string }>,
  workingDir: string,
): Promise<Map<string, ToolResult>> {
  const results = new Map<string, ToolResult>();

  const promises = tools.map(async (tool) => {
    const result = await executeTool(tool.name, tool.args, workingDir);
    results.set(tool.id, result);
  });

  await Promise.all(promises);
  return results;
}

async function executeToolImpl(
  toolName: string,
  args: ToolInput,
  workingDir: string,
): Promise<string> {
  switch (toolName) {
    case 'Read':
      return toolRead(args, workingDir);
    case 'Write':
      return toolWrite(args, workingDir);
    case 'Edit':
      return toolEdit(args, workingDir);
    case 'MultiEdit':
      return toolMultiEdit(args, workingDir);
    case 'Glob':
      return toolGlob(args, workingDir);
    case 'Grep':
      return toolGrep(args, workingDir);
    case 'LS':
      return toolLS(args, workingDir);
    case 'Bash':
      return toolBash(args, workingDir);
    case 'NotebookRead':
      return toolNotebookRead(args, workingDir);
    case 'NotebookEdit':
      return toolNotebookEdit(args, workingDir);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

function resolvePath(filePath: string, workingDir: string): string {
  const resolved = path.resolve(workingDir, filePath);
  // Security: ensure path is within working directory
  if (!resolved.startsWith(path.resolve(workingDir))) {
    throw new Error(`Path escapes working directory: ${filePath}`);
  }
  return resolved;
}

function toolRead(args: ToolInput, workingDir: string): string {
  const filePath = resolvePath(String(args.file_path), workingDir);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${args.file_path}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

function toolWrite(args: ToolInput, workingDir: string): string {
  const filePath = resolvePath(String(args.file_path), workingDir);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, String(args.content), 'utf-8');
  return `File written: ${args.file_path}`;
}

function toolEdit(args: ToolInput, workingDir: string): string {
  const filePath = resolvePath(String(args.file_path), workingDir);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${args.file_path}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const oldString = String(args.old_string);
  const newString = String(args.new_string);

  if (!content.includes(oldString)) {
    throw new Error(`String not found in file: "${oldString.slice(0, 50)}..."`);
  }

  const newContent = content.replace(oldString, newString);
  fs.writeFileSync(filePath, newContent, 'utf-8');
  return `File edited: ${args.file_path}`;
}

function toolMultiEdit(args: ToolInput, workingDir: string): string {
  const filePath = resolvePath(String(args.file_path), workingDir);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${args.file_path}`);
  }

  let content = fs.readFileSync(filePath, 'utf-8');
  const edits = args.edits as Array<{ old_string: string; new_string: string }>;

  for (const edit of edits) {
    if (!content.includes(edit.old_string)) {
      throw new Error(`String not found: "${edit.old_string.slice(0, 50)}..."`);
    }
    content = content.replace(edit.old_string, edit.new_string);
  }

  fs.writeFileSync(filePath, content, 'utf-8');
  return `File edited with ${edits.length} changes: ${args.file_path}`;
}

async function toolGlob(args: ToolInput, workingDir: string): Promise<string> {
  const pattern = String(args.pattern);
  const matches = await glob(pattern, { cwd: workingDir, nodir: true });
  if (matches.length === 0) {
    return 'No files matched the pattern.';
  }
  return matches.join('\n');
}

function toolGrep(args: ToolInput, workingDir: string): string {
  const pattern = String(args.pattern);
  const searchPath = args.path ? resolvePath(String(args.path), workingDir) : workingDir;
  const include = args.include ? `--include="${args.include}"` : '';

  try {
    const result = execSync(
      `grep -rn ${include} -E "${pattern.replace(/"/g, '\\"')}" "${searchPath}" 2>/dev/null || true`,
      { cwd: workingDir, encoding: 'utf-8', maxBuffer: 1024 * 1024 },
    );
    return result.trim() || 'No matches found.';
  } catch {
    return 'No matches found.';
  }
}

function toolLS(args: ToolInput, workingDir: string): string {
  const dirPath = args.path ? resolvePath(String(args.path), workingDir) : workingDir;
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory not found: ${args.path || '.'}`);
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries
    .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
    .join('\n');
}

function toolBash(args: ToolInput, workingDir: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const command = String(args.command);
    const timeout = typeof args.timeout === 'number' ? args.timeout : 30000;

    // Security: block dangerous commands
    const blocked = [
      /\bcurl\b/, /\bwget\b/, /\bssh\b/, /\bscp\b/,
      /\bgit\s+push\b/, /\bgit\s+remote\b/,
      /\bpip\s+install\b/, /\bnpm\s+install\b/,
      /\benv\b/, /\bprintenv\b/, /\bexport\b/,
      /\$\w+/, /\$\{/, // environment variable access
    ];
    for (const pattern of blocked) {
      if (pattern.test(command)) {
        reject(new Error(`Command blocked by security policy: ${command.slice(0, 50)}`));
        return;
      }
    }

    const child = spawn('bash', ['-c', command], {
      cwd: workingDir,
      timeout,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH }, // minimal env
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim() || '(no output)');
      } else {
        resolve(`Exit code ${code}\n${stderr}\n${stdout}`.trim());
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

function toolNotebookRead(args: ToolInput, workingDir: string): string {
  const nbPath = resolvePath(String(args.notebook_path), workingDir);
  if (!fs.existsSync(nbPath)) {
    throw new Error(`Notebook not found: ${args.notebook_path}`);
  }

  const content = JSON.parse(fs.readFileSync(nbPath, 'utf-8'));
  const cells = content.cells || [];

  return cells
    .map((cell: { cell_type: string; source: string[] }, i: number) => {
      const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
      return `[Cell ${i} - ${cell.cell_type}]\n${source}`;
    })
    .join('\n\n');
}

function toolNotebookEdit(args: ToolInput, workingDir: string): string {
  const nbPath = resolvePath(String(args.notebook_path), workingDir);
  if (!fs.existsSync(nbPath)) {
    throw new Error(`Notebook not found: ${args.notebook_path}`);
  }

  const content = JSON.parse(fs.readFileSync(nbPath, 'utf-8'));
  const cellIndex = Number(args.cell_index);

  if (cellIndex < 0 || cellIndex >= content.cells.length) {
    throw new Error(`Cell index out of range: ${cellIndex}`);
  }

  content.cells[cellIndex].source = String(args.new_source).split('\n').map((l, i, arr) =>
    i < arr.length - 1 ? l + '\n' : l,
  );

  if (args.cell_type) {
    content.cells[cellIndex].cell_type = String(args.cell_type);
  }

  fs.writeFileSync(nbPath, JSON.stringify(content, null, 2), 'utf-8');
  return `Notebook cell ${cellIndex} updated: ${args.notebook_path}`;
}
