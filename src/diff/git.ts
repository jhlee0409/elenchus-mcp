/**
 * Git Diff Integration
 * [ENH: DIFF] Git-based change detection
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { ChangedFile, DiffHunk, FileChangeStatus } from './types.js';

const execAsync = promisify(exec);

/**
 * Check if directory is a git repository
 */
export async function isGitRepository(workingDir: string): Promise<boolean> {
  try {
    await execAsync('git rev-parse --git-dir', { cwd: workingDir });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current git commit hash
 */
export async function getGitCommitHash(workingDir: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git rev-parse HEAD', { cwd: workingDir });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Get current git branch name
 */
export async function getGitBranch(workingDir: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: workingDir });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Get diff between current state and a base reference
 */
export async function getGitDiff(
  workingDir: string,
  baseRef: string,
  options: { includeHunks?: boolean } = {}
): Promise<ChangedFile[]> {
  const changedFiles: ChangedFile[] = [];

  try {
    // Get list of changed files with status
    const { stdout: nameStatus } = await execAsync(
      `git diff --name-status ${baseRef}`,
      { cwd: workingDir, maxBuffer: 10 * 1024 * 1024 }
    );

    const lines = nameStatus.trim().split('\n').filter(Boolean);

    for (const line of lines) {
      const [status, ...paths] = line.split('\t');
      const changedFile = parseGitStatus(status, paths);

      if (changedFile && options.includeHunks && changedFile.status !== 'deleted') {
        // Get detailed diff with hunks
        changedFile.hunks = await getFileHunks(workingDir, baseRef, changedFile.path);
        changedFile.diffContent = await getFileDiffContent(workingDir, baseRef, changedFile.path);
      }

      if (changedFile) {
        changedFiles.push(changedFile);
      }
    }

    // Also get untracked files (new files not yet committed)
    const { stdout: untracked } = await execAsync(
      'git ls-files --others --exclude-standard',
      { cwd: workingDir }
    );

    for (const file of untracked.trim().split('\n').filter(Boolean)) {
      if (!changedFiles.find(f => f.path === file)) {
        changedFiles.push({
          path: file,
          status: 'added',
          linesAdded: 0,
          linesDeleted: 0
        });
      }
    }

    return changedFiles;
  } catch (error) {
    console.error('[Elenchus] Git diff failed:', error);
    return [];
  }
}

/**
 * Parse git status letter to FileChangeStatus
 */
function parseGitStatus(status: string, paths: string[]): ChangedFile | null {
  const statusMap: Record<string, FileChangeStatus> = {
    'A': 'added',
    'M': 'modified',
    'D': 'deleted',
    'R': 'renamed',
    'C': 'modified',  // Copied
    'T': 'modified',  // Type changed
    'U': 'modified',  // Unmerged
  };

  const fileStatus = statusMap[status.charAt(0)];
  if (!fileStatus) return null;

  if (fileStatus === 'renamed' && paths.length >= 2) {
    return {
      path: paths[1],
      oldPath: paths[0],
      status: 'renamed',
      linesAdded: 0,
      linesDeleted: 0
    };
  }

  return {
    path: paths[0],
    status: fileStatus,
    linesAdded: 0,
    linesDeleted: 0
  };
}

/**
 * Get diff hunks for a specific file
 */
async function getFileHunks(
  workingDir: string,
  baseRef: string,
  filePath: string
): Promise<DiffHunk[]> {
  try {
    const { stdout } = await execAsync(
      `git diff -U0 ${baseRef} -- "${filePath}"`,
      { cwd: workingDir }
    );

    return parseHunks(stdout);
  } catch {
    return [];
  }
}

/**
 * Parse diff output into hunks
 */
function parseHunks(diffOutput: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const hunkRegex = /@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/g;

  let match;
  while ((match = hunkRegex.exec(diffOutput)) !== null) {
    hunks.push({
      oldStart: parseInt(match[1], 10),
      oldLines: parseInt(match[2] || '1', 10),
      newStart: parseInt(match[3], 10),
      newLines: parseInt(match[4] || '1', 10)
    });
  }

  return hunks;
}

/**
 * Get raw diff content for context
 */
async function getFileDiffContent(
  workingDir: string,
  baseRef: string,
  filePath: string
): Promise<string> {
  try {
    const { stdout } = await execAsync(
      `git diff ${baseRef} -- "${filePath}" | head -100`,
      { cwd: workingDir }
    );
    return stdout;
  } catch {
    return '';
  }
}

/**
 * Get diff statistics (lines added/deleted)
 */
export async function getGitDiffStats(
  workingDir: string,
  baseRef: string
): Promise<{ added: number; deleted: number }> {
  try {
    const { stdout } = await execAsync(
      `git diff --stat ${baseRef}`,
      { cwd: workingDir }
    );

    const lastLine = stdout.trim().split('\n').pop() || '';
    const addMatch = lastLine.match(/(\d+) insertion/);
    const delMatch = lastLine.match(/(\d+) deletion/);

    return {
      added: addMatch ? parseInt(addMatch[1], 10) : 0,
      deleted: delMatch ? parseInt(delMatch[1], 10) : 0
    };
  } catch {
    return { added: 0, deleted: 0 };
  }
}
