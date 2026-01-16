/**
 * Differential Analysis Module
 * [ENH: DIFF] Main entry point for incremental verification
 */

import { DiffResult, DifferentialConfig, ChangedFile, VerificationBaseline, DEFAULT_DIFFERENTIAL_CONFIG } from './types.js';
import { isGitRepository, getGitDiff, getGitCommitHash, getGitBranch } from './git.js';
import { computeContextHashes, compareHashes, computeFileHash } from './hash.js';
import { loadBaseline, saveBaseline, createBaselineFromSession, getProjectIndex } from './baseline.js';
import { FileContext } from '../types/index.js';

// Re-export all types and functions
export * from './types.js';
export * from './git.js';
export * from './hash.js';
export * from './baseline.js';

/**
 * Main entry point for differential analysis
 */
export async function getDiffForSession(
  workingDir: string,
  config: DifferentialConfig,
  currentFiles: Map<string, FileContext>
): Promise<DiffResult | null> {
  if (!config.enabled) return null;

  // Determine base reference
  const baseRef = await resolveBaseRef(workingDir, config.baseRef);
  if (!baseRef) {
    if (config.fallbackToFullIfNoBaseline) {
      console.log('[Elenchus] No baseline found, falling back to full verification');
      return null;
    }
    throw new Error('No verification baseline found and fallback disabled');
  }

  // Try git diff first
  const isGit = await isGitRepository(workingDir);

  let changedFiles: ChangedFile[];
  let method: 'git' | 'hash' | 'hybrid' = 'hash';

  if (isGit && baseRef.commit) {
    // Git-based diff
    changedFiles = await getGitDiff(workingDir, baseRef.commit, {
      includeHunks: config.includeLineContext
    });
    method = 'git';
  } else if (baseRef.hashes) {
    // Hash-based diff
    const currentHashes = computeContextHashes(currentFiles);
    changedFiles = compareHashes(currentHashes, baseRef.hashes);
    method = 'hash';
  } else {
    return null;
  }

  // Categorize files
  const addedFiles = changedFiles.filter(f => f.status === 'added').map(f => f.path);
  const modifiedFiles = changedFiles.filter(f => f.status === 'modified').map(f => f.path);
  const deletedFiles = changedFiles.filter(f => f.status === 'deleted').map(f => f.path);
  const renamedFiles = changedFiles
    .filter(f => f.status === 'renamed')
    .map(f => ({ from: f.oldPath!, to: f.path }));

  // Calculate summary
  const totalLinesChanged = changedFiles.reduce(
    (sum, f) => sum + f.linesAdded + f.linesDeleted,
    0
  );

  return {
    method,
    baseRef: baseRef.ref,
    baseTimestamp: baseRef.timestamp,
    changedFiles,
    addedFiles,
    modifiedFiles,
    deletedFiles,
    renamedFiles,
    summary: {
      totalChanged: changedFiles.length,
      totalAdded: addedFiles.length,
      totalModified: modifiedFiles.length,
      totalDeleted: deletedFiles.length,
      totalLinesChanged
    }
  };
}

/**
 * Resolve base reference to actual commit/hashes
 */
async function resolveBaseRef(
  workingDir: string,
  baseRef?: string
): Promise<{
  ref: string;
  commit?: string;
  hashes?: Record<string, string>;
  timestamp?: string;
} | null> {
  // If explicit commit/branch reference
  if (baseRef && baseRef !== 'last-verified') {
    const isGit = await isGitRepository(workingDir);
    if (isGit) {
      return { ref: baseRef, commit: baseRef };
    }
  }

  // Load baseline for "last-verified" or fallback
  const baseline = await loadBaseline(workingDir);
  if (!baseline) return null;

  return {
    ref: baseline.gitCommit || 'baseline-' + baseline.sessionId,
    commit: baseline.gitCommit,
    hashes: baseline.fileHashes,
    timestamp: baseline.timestamp
  };
}

/**
 * Find files affected by changes through dependencies
 */
export function findAffectedDependencies(
  changedFiles: string[],
  allFiles: Map<string, FileContext>,
  maxDepth: number = 2
): string[] {
  const affected = new Set<string>();
  const toCheck = [...changedFiles];
  let depth = 0;

  while (toCheck.length > 0 && depth < maxDepth) {
    const currentBatch = [...toCheck];
    toCheck.length = 0;
    depth++;

    for (const [filePath, fileCtx] of allFiles) {
      if (changedFiles.includes(filePath) || affected.has(filePath)) continue;

      // Check if this file imports any changed file
      const importsChanged = fileCtx.dependencies.some(dep => {
        const normalizedDep = dep.replace(/^\.\//, '').replace(/\.(ts|js|tsx|jsx)$/, '');
        return currentBatch.some(changed => {
          const normalizedChanged = changed.replace(/\.(ts|js|tsx|jsx)$/, '');
          return normalizedChanged.endsWith(normalizedDep) || normalizedDep.endsWith(normalizedChanged);
        });
      });

      if (importsChanged) {
        affected.add(filePath);
        toCheck.push(filePath);
      }
    }
  }

  return Array.from(affected);
}

/**
 * Generate differential analysis summary for LLM
 */
export function generateDiffSummary(diffResult: DiffResult): string {
  const { summary, changedFiles, renamedFiles } = diffResult;

  let text = `## Differential Analysis Summary

**Method**: ${diffResult.method}
**Base Reference**: ${diffResult.baseRef}
${diffResult.baseTimestamp ? `**Baseline Timestamp**: ${diffResult.baseTimestamp}` : ''}

### Changes Detected
- **Total Changed**: ${summary.totalChanged} files
- **Added**: ${summary.totalAdded} files
- **Modified**: ${summary.totalModified} files
- **Deleted**: ${summary.totalDeleted} files
- **Lines Changed**: ~${summary.totalLinesChanged}

### Files to Verify
`;

  // List changed files with their status
  for (const file of changedFiles.slice(0, 20)) {
    const statusIcon = {
      'added': '+',
      'modified': 'M',
      'deleted': '-',
      'renamed': 'R',
      'unchanged': ' '
    }[file.status] || '?';

    text += `- [${statusIcon}] ${file.path}`;
    if (file.oldPath) text += ` (from ${file.oldPath})`;
    text += '\n';
  }

  if (changedFiles.length > 20) {
    text += `- ... and ${changedFiles.length - 20} more files\n`;
  }

  return text;
}

/**
 * Check if differential mode should be used
 */
export async function shouldUseDifferentialMode(
  workingDir: string,
  config?: Partial<DifferentialConfig>
): Promise<{ canUse: boolean; reason: string; baseline?: VerificationBaseline }> {
  const fullConfig = { ...DEFAULT_DIFFERENTIAL_CONFIG, ...config };

  if (!fullConfig.enabled) {
    return { canUse: false, reason: 'Differential mode not enabled' };
  }

  const baseline = await loadBaseline(workingDir);
  if (!baseline) {
    return { canUse: false, reason: 'No verification baseline found' };
  }

  return {
    canUse: true,
    reason: `Baseline from ${baseline.timestamp} (${baseline.totalFiles} files)`,
    baseline
  };
}
