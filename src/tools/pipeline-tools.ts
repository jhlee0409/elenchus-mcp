/**
 * Pipeline Management Tools
 * [ENH: TIERED] Tiered verification pipeline management
 */

import { z } from 'zod';
import { getSession } from '../state/session.js';
import {
  getPipelineState,
  completeTier,
  escalateTier,
  generatePipelineSummary,
  DEFAULT_PIPELINE_CONFIG,
  VerificationTier
} from '../pipeline/index.js';
import {
  GetPipelineStatusSchema,
  EscalateTierSchema,
  CompleteTierSchema
} from './schemas.js';

/**
 * Get pipeline status for a session
 */
export async function getPipelineStatusTool(
  args: z.infer<typeof GetPipelineStatusSchema>
): Promise<{
  hasPipeline: boolean;
  state?: {
    currentTier: VerificationTier;
    completedTiers: VerificationTier[];
    totalTokensUsed: number;
    totalTimeMs: number;
    escalations: number;
  };
  summary?: string;
}> {
  const state = getPipelineState(args.sessionId);

  if (!state) {
    return { hasPipeline: false };
  }

  return {
    hasPipeline: true,
    state: {
      currentTier: state.currentTier,
      completedTiers: state.completedTiers,
      totalTokensUsed: state.totalTokensUsed,
      totalTimeMs: state.totalTimeMs,
      escalations: state.escalations.length
    },
    summary: generatePipelineSummary(args.sessionId) || undefined
  };
}

/**
 * Manually escalate to a higher tier
 */
export async function escalateTierTool(
  args: z.infer<typeof EscalateTierSchema>
): Promise<{
  success: boolean;
  previousTier?: VerificationTier;
  newTier?: VerificationTier;
  message: string;
}> {
  const state = getPipelineState(args.sessionId);
  if (!state) {
    return {
      success: false,
      message: 'No pipeline found for this session'
    };
  }

  const previousTier = state.currentTier;
  const success = escalateTier(args.sessionId, args.targetTier, args.reason, args.scope);

  if (!success) {
    return {
      success: false,
      previousTier,
      message: `Cannot escalate from ${previousTier} to ${args.targetTier}`
    };
  }

  return {
    success: true,
    previousTier,
    newTier: args.targetTier,
    message: `Escalated from ${previousTier} to ${args.targetTier}: ${args.reason}`
  };
}

/**
 * Complete current tier and check for escalation
 */
export async function completeTierTool(
  args: z.infer<typeof CompleteTierSchema>
): Promise<{
  success: boolean;
  tier?: VerificationTier;
  shouldEscalate?: boolean;
  nextTier?: VerificationTier;
  escalationReason?: string;
  message: string;
}> {
  const session = await getSession(args.sessionId);
  if (!session) {
    return { success: false, message: 'Session not found' };
  }

  const state = getPipelineState(args.sessionId);
  if (!state) {
    return { success: false, message: 'No pipeline found for this session' };
  }

  const result = completeTier(
    args.sessionId,
    {
      tier: state.currentTier,
      filesVerified: args.filesVerified,
      issuesFound: args.issuesFound,
      criticalIssues: args.criticalIssues,
      highIssues: args.highIssues,
      tokensUsed: args.tokensUsed,
      timeMs: args.timeMs
    },
    session.issues,
    DEFAULT_PIPELINE_CONFIG
  );

  return {
    success: true,
    tier: result.tierResult.tier,
    shouldEscalate: result.shouldEscalate,
    nextTier: result.nextTier,
    escalationReason: result.escalationReason,
    message: result.shouldEscalate
      ? `Tier ${result.tierResult.tier} completed. Escalating to ${result.nextTier}: ${result.escalationReason}`
      : `Tier ${result.tierResult.tier} completed. No escalation needed.`
  };
}

// =============================================================================
// Export Tool Definitions
// =============================================================================

export const pipelineTools = {
  elenchus_get_pipeline_status: {
    description: 'Get current tier pipeline status including completed tiers, escalations, and token usage.',
    schema: GetPipelineStatusSchema,
    handler: getPipelineStatusTool
  },
  elenchus_escalate_tier: {
    description: 'Manually escalate to a higher verification tier (screen → focused → exhaustive).',
    schema: EscalateTierSchema,
    handler: escalateTierTool
  },
  elenchus_complete_tier: {
    description: 'Mark the current tier as complete and check for auto-escalation based on issues found.',
    schema: CompleteTierSchema,
    handler: completeTierTool
  }
};
