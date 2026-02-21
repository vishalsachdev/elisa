/** Workspace route handlers: /api/workspace/* */

import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { validateWorkspacePath } from '../utils/pathValidator.js';

const DESIGN_FILES = new Set(['workspace.json', 'skills.json', 'rules.json', 'portals.json', 'nugget.json']);
const INSPECT_IGNORED_DIRS = new Set(['node_modules', '.git']);
const INSPECT_IGNORED_FILES = new Set(['.DS_Store']);

interface WorkspaceInspectSummary {
  exists: boolean;
  is_empty: boolean;
  file_count: number;
  src_file_count: number;
  test_file_count: number;
  has_git: boolean;
  top_files: string[];
}

function inspectWorkspace(dir: string): WorkspaceInspectSummary {
  if (!fs.existsSync(dir)) {
    return {
      exists: false,
      is_empty: true,
      file_count: 0,
      src_file_count: 0,
      test_file_count: 0,
      has_git: false,
      top_files: [],
    };
  }

  const topFiles = fs.readdirSync(dir).sort().slice(0, 12);
  const stack: string[] = [dir];
  let fileCount = 0;
  let srcFileCount = 0;
  let testFileCount = 0;
  let inspectedNodes = 0;
  const MAX_NODES = 8000;

  while (stack.length > 0 && inspectedNodes < MAX_NODES) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      inspectedNodes++;
      if (inspectedNodes >= MAX_NODES) break;

      if (entry.name === '.elisa' || entry.name.startsWith('.elisa')) continue;
      if (INSPECT_IGNORED_FILES.has(entry.name)) continue;
      const fullPath = path.join(current, entry.name);
      const relPath = path.relative(dir, fullPath);

      if (entry.isDirectory()) {
        if (INSPECT_IGNORED_DIRS.has(entry.name)) continue;
        stack.push(fullPath);
        continue;
      }

      if (!relPath.includes(path.sep) && DESIGN_FILES.has(entry.name)) {
        continue;
      }

      fileCount++;
      if (relPath.startsWith(`src${path.sep}`) || relPath === 'src') srcFileCount++;
      if (relPath.startsWith(`tests${path.sep}`) || relPath === 'tests') testFileCount++;
    }
  }

  return {
    exists: true,
    is_empty: fileCount <= 0 && srcFileCount === 0 && testFileCount === 0,
    file_count: Math.max(0, fileCount),
    src_file_count: srcFileCount,
    test_file_count: testFileCount,
    has_git: fs.existsSync(path.join(dir, '.git')),
    top_files: topFiles,
  };
}

export function createWorkspaceRouter(): Router {
  const router = Router();

  /**
   * POST /api/workspace/save
   * Write design files to a workspace directory (pre-build save).
   */
  router.post('/save', (req, res) => {
    const { workspace_path, workspace_json, skills, rules, portals } = req.body;

    if (!workspace_path || typeof workspace_path !== 'string') {
      res.status(400).json({ detail: 'workspace_path is required' });
      return;
    }

    const validation = validateWorkspacePath(workspace_path);
    if (!validation.valid) {
      res.status(400).json({ detail: validation.reason });
      return;
    }
    const resolved = validation.resolved;
    try {
      fs.mkdirSync(resolved, { recursive: true });
    } catch (err: any) {
      res.status(400).json({ detail: `Cannot create directory: ${err.message}` });
      return;
    }

    const artifacts: Record<string, string> = {
      'workspace.json': JSON.stringify(workspace_json ?? {}, null, 2),
      'skills.json': JSON.stringify(skills ?? [], null, 2),
      'rules.json': JSON.stringify(rules ?? [], null, 2),
      'portals.json': JSON.stringify(portals ?? [], null, 2),
    };

    try {
      for (const [name, content] of Object.entries(artifacts)) {
        fs.writeFileSync(path.join(resolved, name), content, 'utf-8');
      }
    } catch (err: any) {
      res.status(500).json({ detail: `Failed to write files: ${err.message}` });
      return;
    }

    res.json({ status: 'saved' });
  });

  /**
   * POST /api/workspace/load
   * Read design files from a workspace directory.
   */
  router.post('/load', (req, res) => {
    const { workspace_path } = req.body;

    if (!workspace_path || typeof workspace_path !== 'string') {
      res.status(400).json({ detail: 'workspace_path is required' });
      return;
    }

    const validation = validateWorkspacePath(workspace_path);
    if (!validation.valid) {
      res.status(400).json({ detail: validation.reason });
      return;
    }
    const resolved = validation.resolved;
    if (!fs.existsSync(resolved)) {
      res.status(404).json({ detail: 'Directory not found' });
      return;
    }

    const readJson = (filename: string): unknown => {
      const filePath = path.join(resolved, filename);
      if (!fs.existsSync(filePath)) return null;
      try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch {
        return null;
      }
    };

    res.json({
      workspace: readJson('workspace.json') ?? {},
      skills: readJson('skills.json') ?? [],
      rules: readJson('rules.json') ?? [],
      portals: readJson('portals.json') ?? [],
    });
  });

  /**
   * POST /api/workspace/inspect
   * Inspect workspace contents to drive restart UX decisions.
   */
  router.post('/inspect', (req, res) => {
    const { workspace_path } = req.body;

    if (!workspace_path || typeof workspace_path !== 'string') {
      res.status(400).json({ detail: 'workspace_path is required' });
      return;
    }

    const validation = validateWorkspacePath(workspace_path);
    if (!validation.valid) {
      res.status(400).json({ detail: validation.reason });
      return;
    }

    res.json(inspectWorkspace(validation.resolved));
  });

  /**
   * POST /api/workspace/reset
   * Clear generated build artifacts while keeping design files.
   */
  router.post('/reset', (req, res) => {
    const { workspace_path, mode } = req.body;

    if (!workspace_path || typeof workspace_path !== 'string') {
      res.status(400).json({ detail: 'workspace_path is required' });
      return;
    }
    if (mode !== 'clean_generated') {
      res.status(400).json({ detail: 'mode must be clean_generated' });
      return;
    }

    const validation = validateWorkspacePath(workspace_path);
    if (!validation.valid) {
      res.status(400).json({ detail: validation.reason });
      return;
    }
    const resolved = validation.resolved;
    if (!fs.existsSync(resolved)) {
      res.status(404).json({ detail: 'Directory not found' });
      return;
    }

    const targets = [
      path.join(resolved, 'src'),
      path.join(resolved, 'tests'),
      path.join(resolved, '.elisa', 'comms'),
      path.join(resolved, '.elisa', 'context'),
      path.join(resolved, '.elisa', 'status'),
    ];
    const removed: string[] = [];
    for (const target of targets) {
      if (fs.existsSync(target)) {
        fs.rmSync(target, { recursive: true, force: true });
        removed.push(path.relative(resolved, target));
      }
    }

    res.json({ status: 'reset', mode, removed });
  });

  return router;
}
