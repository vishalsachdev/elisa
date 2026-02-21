/** Manages Git operations for build sessions. */

import fs from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import type { CommitInfo } from '../models/session.js';

export class GitService {
  async initRepo(repoPath: string, nuggetGoal: string): Promise<void> {
    const git = simpleGit(repoPath);
    let isRepo = false;
    try {
      isRepo = await git.checkIsRepo();
    } catch {
      isRepo = false;
    }
    if (!isRepo) {
      await git.init();
      await git.addConfig('user.name', 'Elisa');
      await git.addConfig('user.email', 'elisa@local');
    }

    // Write .gitignore to prevent staging sensitive/generated files
    const gitignorePath = path.join(repoPath, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, [
        '.elisa/logs/',
        '.elisa/status/',
        '__pycache__/',
        '',
      ].join('\n'), 'utf-8');
    }

    const readmePath = path.join(repoPath, 'README.md');
    if (!fs.existsSync(readmePath)) {
      fs.writeFileSync(readmePath, `# ${nuggetGoal}\n\nBuilt with Elisa.\n`, 'utf-8');
    }

    await git.add(['README.md', '.gitignore']);
    const status = await git.status();
    if (status.staged.length > 0) {
      await git.commit('Nugget started!');
    }
  }

  async commit(
    repoPath: string,
    message: string,
    agentName: string,
    taskId: string,
  ): Promise<CommitInfo> {
    const empty: CommitInfo = {
      sha: '',
      shortSha: '',
      message: '',
      agentName: '',
      taskId: '',
      timestamp: '',
      filesChanged: [],
    };

    const git = simpleGit(repoPath);

    try {
      await git.checkIsRepo();
    } catch {
      return empty;
    }

    await git.add('-A');

    const status = await git.status();
    if (status.staged.length === 0) {
      return empty;
    }

    const result = await git.commit(message);
    const sha = result.commit || '';

    let filesChanged: string[] = [];
    if (sha) {
      try {
        const diff = await git.diffSummary([`${sha}~1`, sha]);
        filesChanged = diff.files.map((f) => f.file);
      } catch {
        // first commit has no parent
      }
    }

    return {
      sha,
      shortSha: sha.slice(0, 7),
      message,
      agentName,
      taskId,
      timestamp: new Date().toISOString(),
      filesChanged,
    };
  }
}
