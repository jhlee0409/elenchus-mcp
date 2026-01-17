/**
 * Issue Management Tools
 * Issue retrieval, checkpoints, rollback, and fix application
 */

import { z } from 'zod';
import { Issue } from '../types/index.js';
import {
  getSession,
  createCheckpoint,
  rollbackToCheckpoint,
  upsertIssue
} from '../state/session.js';
import {
  expandContext,
  analyzeContextForIssues
} from '../state/context.js';
import {
  GetIssuesSchema,
  CheckpointSchema,
  RollbackSchema,
  ApplyFixSchema
} from './schemas.js';

/**
 * Get issues with optional filtering
 */
export async function getIssues(
  args: z.infer<typeof GetIssuesSchema>
): Promise<Issue[] | null> {
  const session = await getSession(args.sessionId);
  if (!session) return null;

  switch (args.status) {
    case 'unresolved':
      return session.issues.filter(i => i.status !== 'RESOLVED');
    case 'critical':
      return session.issues.filter(i => i.severity === 'CRITICAL');
    default:
      return session.issues;
  }
}

/**
 * Create manual checkpoint
 */
export async function checkpoint(
  args: z.infer<typeof CheckpointSchema>
): Promise<{ success: boolean; roundNumber: number } | null> {
  const cp = await createCheckpoint(args.sessionId);
  if (!cp) return null;

  return {
    success: true,
    roundNumber: cp.roundNumber
  };
}

/**
 * Rollback to previous checkpoint
 */
export async function rollback(
  args: z.infer<typeof RollbackSchema>
): Promise<{ success: boolean; restoredToRound: number } | null> {
  const session = await rollbackToCheckpoint(args.sessionId, args.toRound);
  if (!session) return null;

  return {
    success: true,
    restoredToRound: session.currentRound
  };
}

/**
 * [ENH: ONE-SHOT] Apply fix and optionally trigger re-verification
 * Keeps fix application within the same session for continuity
 */
export async function applyFix(
  args: z.infer<typeof ApplyFixSchema>
): Promise<{
  success: boolean;
  issueId: string;
  status: 'RESOLVED' | 'PENDING_VERIFY';
  nextAction: string;
  reVerifyRequired: boolean;
} | null> {
  const session = await getSession(args.sessionId);
  if (!session) return null;

  // Find the issue
  const issue = session.issues.find(i => i.id === args.issueId);
  if (!issue) {
    return {
      success: false,
      issueId: args.issueId,
      status: 'PENDING_VERIFY',
      nextAction: `Issue ${args.issueId} not found`,
      reVerifyRequired: false
    };
  }

  // Create checkpoint before fix
  await createCheckpoint(args.sessionId);

  // Update issue with fix information
  issue.resolution = args.fixDescription;
  issue.status = args.triggerReVerify ? 'RAISED' : 'RESOLVED';  // Keep as RAISED if re-verify needed

  // Add transition record
  if (!issue.transitions) {
    issue.transitions = [];
  }
  issue.transitions.push({
    type: 'REFINED',
    fromStatus: 'RAISED',
    toStatus: args.triggerReVerify ? 'RAISED' : 'RESOLVED',
    round: session.currentRound,
    reason: `Fix applied: ${args.fixDescription}`,
    triggeredBy: 'verifier',
    timestamp: new Date().toISOString()
  });

  await upsertIssue(args.sessionId, issue);

  // Refresh context for modified files
  if (args.filesModified.length > 0) {
    const updatedSession = await getSession(args.sessionId);
    if (updatedSession) {
      // Re-read modified files into context
      for (const filePath of args.filesModified) {
        // Remove old content
        updatedSession.context.files.delete(filePath);
      }
      // Re-add with updated content
      await expandContext(args.sessionId, args.filesModified, session.currentRound);

      // Run pre-analysis on modified files
      const preAnalysis = analyzeContextForIssues(updatedSession.context);
      const newFindings = preAnalysis
        .filter(r => args.filesModified.some((f: string) => r.file.includes(f)))
        .reduce((sum, r) => sum + r.findings.length, 0);

      if (newFindings > 0) {
        return {
          success: true,
          issueId: args.issueId,
          status: 'PENDING_VERIFY',
          nextAction: `Fix applied but pre-analysis found ${newFindings} new potential issues in modified files. Re-verification recommended.`,
          reVerifyRequired: true
        };
      }
    }
  }

  const nextAction = args.triggerReVerify
    ? 'Submit a Verifier round to verify the fix is complete and correct'
    : 'Issue marked as resolved. Continue with remaining issues or end session.';

  return {
    success: true,
    issueId: args.issueId,
    status: args.triggerReVerify ? 'PENDING_VERIFY' : 'RESOLVED',
    nextAction,
    reVerifyRequired: args.triggerReVerify ?? true
  };
}

// =============================================================================
// Export Tool Definitions
// =============================================================================

export const issueManagementTools = {
  elenchus_get_issues: {
    description: 'Get issues from the current session with optional filtering.',
    schema: GetIssuesSchema,
    handler: getIssues
  },
  elenchus_checkpoint: {
    description: 'Create a checkpoint for potential rollback.',
    schema: CheckpointSchema,
    handler: checkpoint
  },
  elenchus_rollback: {
    description: 'Rollback session to a previous checkpoint.',
    schema: RollbackSchema,
    handler: rollback
  },
  elenchus_apply_fix: {
    description: 'Apply a fix for an issue within the current session. Creates checkpoint, updates issue status, refreshes file context, and optionally triggers re-verification. Use this to maintain fix-verify continuity without starting new sessions.',
    schema: ApplyFixSchema,
    handler: applyFix
  }
};
