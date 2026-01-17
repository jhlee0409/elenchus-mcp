/**
 * Differential Analysis Tools
 * [ENH: DIFF] Baseline management and diff analysis
 */

import { z } from 'zod';
import { getSession } from '../state/session.js';
import {
  getDiffForSession,
  shouldUseDifferentialMode,
  saveBaseline,
  loadBaseline,
  createBaselineFromSession,
  getProjectIndex,
  getGitCommitHash,
  getGitBranch,
  DifferentialConfig,
  DEFAULT_DIFFERENTIAL_CONFIG
} from '../diff/index.js';
import {
  SaveBaselineSchema,
  GetDiffSummarySchema,
  GetProjectHistorySchema
} from './schemas.js';

/**
 * Save verification baseline for future differential analysis
 */
export async function saveBaselineTool(
  args: z.infer<typeof SaveBaselineSchema>
): Promise<{
  success: boolean;
  projectPath: string;
  baselineInfo?: {
    timestamp: string;
    sessionId: string;
    totalFiles: number;
    gitCommit?: string;
    gitBranch?: string;
  };
  error?: string;
}> {
  const session = await getSession(args.sessionId);
  if (!session) {
    return {
      success: false,
      projectPath: args.workingDir,
      error: `Session not found: ${args.sessionId}`
    };
  }

  // Get git info
  const gitCommit = await getGitCommitHash(args.workingDir);
  const gitBranch = await getGitBranch(args.workingDir);

  // Create baseline from session
  const baseline = createBaselineFromSession(session, args.workingDir, {
    commit: gitCommit || undefined,
    branch: gitBranch || undefined
  });

  // Save baseline
  await saveBaseline(args.workingDir, baseline);

  return {
    success: true,
    projectPath: args.workingDir,
    baselineInfo: {
      timestamp: baseline.timestamp,
      sessionId: baseline.sessionId,
      totalFiles: baseline.totalFiles,
      gitCommit: baseline.gitCommit,
      gitBranch: baseline.gitBranch
    }
  };
}

/**
 * Get differential analysis summary
 */
export async function getDiffSummaryTool(
  args: z.infer<typeof GetDiffSummarySchema>
): Promise<{
  hasDiff: boolean;
  canUseDifferential: boolean;
  reason: string;
  summary?: {
    method: string;
    baseRef: string;
    baseTimestamp?: string;
    totalChanged: number;
    totalAdded: number;
    totalModified: number;
    totalDeleted: number;
    totalLinesChanged: number;
    changedFiles: Array<{ path: string; status: string; lines: number }>;
    estimatedTokenSavings: string;
  };
  baseline?: {
    timestamp: string;
    sessionId: string;
    gitCommit?: string;
  };
}> {
  // Check if differential mode can be used
  const checkResult = await shouldUseDifferentialMode(args.workingDir, {
    enabled: true,
    baseRef: args.baseRef || 'last-verified'
  });

  if (!checkResult.canUse) {
    return {
      hasDiff: false,
      canUseDifferential: false,
      reason: checkResult.reason
    };
  }

  // Get the diff
  const diffConfig: DifferentialConfig = {
    ...DEFAULT_DIFFERENTIAL_CONFIG,
    enabled: true,
    baseRef: args.baseRef || 'last-verified'
  };

  // We need a dummy files map for getDiffForSession - use loadBaseline hashes
  const baseline = await loadBaseline(args.workingDir);
  if (!baseline) {
    return {
      hasDiff: false,
      canUseDifferential: false,
      reason: 'No baseline found'
    };
  }

  // Create a minimal files map from baseline
  const filesMap = new Map<string, any>();
  for (const [path, _hash] of Object.entries(baseline.fileHashes)) {
    filesMap.set(path, { content: '', dependencies: [], layer: 'base' as const });
  }

  const diffResult = await getDiffForSession(args.workingDir, diffConfig, filesMap);

  if (!diffResult) {
    return {
      hasDiff: false,
      canUseDifferential: true,
      reason: 'No changes detected since last verification',
      baseline: {
        timestamp: baseline.timestamp,
        sessionId: baseline.sessionId,
        gitCommit: baseline.gitCommit
      }
    };
  }

  const totalFiles = Object.keys(baseline.fileHashes).length;
  const estimatedSavings = Math.round((1 - diffResult.summary.totalChanged / totalFiles) * 100);

  return {
    hasDiff: true,
    canUseDifferential: true,
    reason: `${diffResult.summary.totalChanged} files changed since ${baseline.timestamp}`,
    summary: {
      method: diffResult.method,
      baseRef: diffResult.baseRef,
      baseTimestamp: diffResult.baseTimestamp,
      totalChanged: diffResult.summary.totalChanged,
      totalAdded: diffResult.summary.totalAdded,
      totalModified: diffResult.summary.totalModified,
      totalDeleted: diffResult.summary.totalDeleted,
      totalLinesChanged: diffResult.summary.totalLinesChanged,
      changedFiles: diffResult.changedFiles.map(f => ({
        path: f.path,
        status: f.status,
        lines: f.linesAdded + f.linesDeleted
      })),
      estimatedTokenSavings: `~${estimatedSavings}% context reduction`
    },
    baseline: {
      timestamp: baseline.timestamp,
      sessionId: baseline.sessionId,
      gitCommit: baseline.gitCommit
    }
  };
}

/**
 * Get project verification history
 */
export async function getProjectHistoryTool(
  args: z.infer<typeof GetProjectHistorySchema>
): Promise<{
  hasHistory: boolean;
  projectPath: string;
  history?: Array<{
    sessionId: string;
    timestamp: string;
    verdict: string;
    target: string;
  }>;
  lastVerified?: {
    sessionId: string;
    timestamp: string;
    gitCommit?: string;
  };
}> {
  const index = await getProjectIndex(args.workingDir);

  if (!index) {
    return {
      hasHistory: false,
      projectPath: args.workingDir
    };
  }

  return {
    hasHistory: true,
    projectPath: args.workingDir,
    history: index.history,
    lastVerified: index.lastVerifiedSession ? {
      sessionId: index.lastVerifiedSession,
      timestamp: index.lastVerifiedTimestamp || '',
      gitCommit: index.lastVerifiedCommit
    } : undefined
  };
}

// =============================================================================
// Export Tool Definitions
// =============================================================================

export const diffTools = {
  elenchus_save_baseline: {
    description: 'Save verification baseline after a successful session. This baseline is used for differential analysis in future verifications to only check changed code.',
    schema: SaveBaselineSchema,
    handler: saveBaselineTool
  },
  elenchus_get_diff_summary: {
    description: 'Get differential analysis summary for a project. Shows what has changed since the last verification and estimates token savings.',
    schema: GetDiffSummarySchema,
    handler: getDiffSummaryTool
  },
  elenchus_get_project_history: {
    description: 'Get verification history for a project including past sessions and baselines.',
    schema: GetProjectHistorySchema,
    handler: getProjectHistoryTool
  }
};
