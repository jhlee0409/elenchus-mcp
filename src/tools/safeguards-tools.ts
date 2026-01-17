/**
 * Quality Safeguards Tools
 * [ENH: SAFEGUARDS] Quality assessment, confidence tracking, and sampling
 */

import { z } from 'zod';
import { Issue } from '../types/index.js';
import {
  getSafeguardsState,
  updateQualityAssessment,
  generateSafeguardsSummary,
  shouldAllowConvergence,
  getPeriodicStatus,
  calculateCacheConfidence,
  calculateChunkConfidence,
  calculateTierConfidence,
  recordSamplingResult,
  getSamplingStats,
  shouldRecommendFullVerification,
  FileConfidence,
  ConfidenceScore
} from '../safeguards/index.js';
import { VerificationTier } from '../pipeline/index.js';
import {
  GetSafeguardsStatusSchema,
  UpdateConfidenceSchema,
  RecordSamplingResultSchema,
  CheckConvergenceAllowedSchema
} from './schemas.js';

/**
 * Get safeguards status for a session
 */
export async function getSafeguardsStatusTool(
  args: z.infer<typeof GetSafeguardsStatusSchema>
): Promise<{
  success: boolean;
  status?: object;
  summary?: string;
  message: string;
}> {
  const state = getSafeguardsState(args.sessionId);
  if (!state) {
    return { success: false, message: 'Safeguards not initialized for this session' };
  }

  const periodicStatus = getPeriodicStatus(args.projectId, state.periodic.config);
  const summary = generateSafeguardsSummary(args.sessionId);

  return {
    success: true,
    status: {
      quality: state.quality,
      periodic: periodicStatus,
      sampling: state.sampling.tracker ? getSamplingStats(state.sampling.tracker) : null,
      confidence: state.confidence.session?.overall || null
    },
    summary,
    message: `Quality: ${state.quality.level} (${Math.round(state.quality.score * 100)}%)`
  };
}

/**
 * Update confidence scores for files
 */
export async function updateConfidenceTool(
  args: z.infer<typeof UpdateConfidenceSchema>
): Promise<{
  success: boolean;
  assessment?: object;
  recommendations?: object[];
  message: string;
}> {
  const state = getSafeguardsState(args.sessionId);
  if (!state) {
    return { success: false, message: 'Safeguards not initialized for this session' };
  }

  // Convert input to FileConfidence format
  const fileConfidences: FileConfidence[] = args.fileConfidences.map(fc => {
    let confidence;
    if (fc.source === 'cache' && fc.cacheAge !== undefined) {
      confidence = calculateCacheConfidence(fc.cacheAge, true, true);
    } else if (fc.source === 'chunk' && fc.chunkCoverage !== undefined) {
      confidence = calculateChunkConfidence(fc.chunkCoverage, false, 0);
    } else if (fc.source === 'tiered' && fc.tierLevel) {
      confidence = calculateTierConfidence(fc.tierLevel as VerificationTier, []);
    } else {
      const level: ConfidenceScore['level'] = fc.score >= 0.85 ? 'HIGH' : fc.score >= 0.7 ? 'MEDIUM' : fc.score >= 0.5 ? 'LOW' : 'UNRELIABLE';
      confidence = {
        score: fc.score,
        level,
        factors: { methodBase: fc.score, freshness: 1, contextMatch: 1, coverage: 1, historicalAccuracy: 0.9 },
        warnings: [],
        calculatedAt: new Date().toISOString()
      } satisfies ConfidenceScore;
    }

    return {
      file: fc.file,
      confidence,
      source: fc.source,
      details: {
        cacheAge: fc.cacheAge,
        chunkCoverage: fc.chunkCoverage,
        tierLevel: fc.tierLevel
      }
    };
  });

  const assessment = updateQualityAssessment(args.sessionId, fileConfidences);

  return {
    success: true,
    assessment: {
      score: assessment.score,
      level: assessment.level,
      metrics: assessment.metrics
    },
    recommendations: assessment.actions.slice(0, 3),
    message: `Quality assessment updated: ${assessment.level} (${Math.round(assessment.score * 100)}%)`
  };
}

/**
 * Record results from random sampling verification
 */
export async function recordSamplingResultTool(
  args: z.infer<typeof RecordSamplingResultSchema>
): Promise<{
  success: boolean;
  stats?: object;
  recommendation?: object;
  message: string;
}> {
  const state = getSafeguardsState(args.sessionId);
  if (!state || !state.sampling.tracker) {
    return { success: false, message: 'Safeguards or sampling not initialized' };
  }

  // Create issue objects for recording (satisfies Issue interface)
  const issues: Issue[] = args.severities.map((sev, i) => ({
    id: `sampled-${i}`,
    severity: sev,
    category: 'CORRECTNESS' as const,
    summary: 'Sampled issue',
    location: args.filePath,
    description: '',
    evidence: '',
    status: 'RAISED' as const,
    raisedBy: 'verifier' as const,
    raisedInRound: 0
  }));

  recordSamplingResult(state.sampling.tracker, args.filePath, issues);
  const stats = getSamplingStats(state.sampling.tracker);
  const recommendation = shouldRecommendFullVerification(state.sampling.tracker);

  return {
    success: true,
    stats,
    recommendation: recommendation.recommend ? {
      recommendFullVerification: true,
      reason: recommendation.reason
    } : undefined,
    message: args.issuesFound > 0
      ? `Recorded ${args.issuesFound} issues in sampled file. Productivity: ${stats.productivityRate}%`
      : `No issues found in sampled file.`
  };
}

/**
 * Check if convergence is allowed based on quality safeguards
 */
export async function checkConvergenceAllowedTool(
  args: z.infer<typeof CheckConvergenceAllowedSchema>
): Promise<{
  allowed: boolean;
  blockers: string[];
  qualityScore?: number;
  message: string;
}> {
  const result = shouldAllowConvergence(args.sessionId, args.strictMode);
  const state = getSafeguardsState(args.sessionId);

  return {
    allowed: result.allow,
    blockers: result.blockers,
    qualityScore: state?.quality.score,
    message: result.allow
      ? 'Convergence allowed - quality safeguards passed'
      : `Convergence blocked: ${result.blockers.join(', ')}`
  };
}

// =============================================================================
// Export Tool Definitions
// =============================================================================

export const safeguardsTools = {
  elenchus_get_safeguards_status: {
    description: 'Get quality safeguards status including periodic verification, confidence, and sampling stats.',
    schema: GetSafeguardsStatusSchema,
    handler: getSafeguardsStatusTool
  },
  elenchus_update_confidence: {
    description: 'Update confidence scores for files based on verification method (cache, chunk, tiered, etc.).',
    schema: UpdateConfidenceSchema,
    handler: updateConfidenceTool
  },
  elenchus_record_sampling_result: {
    description: 'Record results from random sampling verification of a skipped file.',
    schema: RecordSamplingResultSchema,
    handler: recordSamplingResultTool
  },
  elenchus_check_convergence_allowed: {
    description: 'Check if session convergence is allowed based on quality safeguards.',
    schema: CheckConvergenceAllowedSchema,
    handler: checkConvergenceAllowedTool
  }
};
