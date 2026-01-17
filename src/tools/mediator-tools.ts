/**
 * Mediator Tools
 * Dependency graph analysis and ripple effect detection
 */

import { z } from 'zod';
import {
  analyzeRippleEffect,
  getMediatorSummary
} from '../mediator/index.js';
import {
  RippleEffectSchema,
  MediatorSummarySchema
} from './schemas.js';

/**
 * Analyze ripple effect of a change
 */
export async function rippleEffect(
  args: z.infer<typeof RippleEffectSchema>
): Promise<object | null> {
  const result = analyzeRippleEffect(args.sessionId, args.changedFile, args.changedFunction);
  if (!result) return null;

  return {
    changedFile: result.changedFile,
    changedFunction: result.changedFunction,
    totalAffected: result.totalAffected,
    maxDepth: result.depth,
    affectedFiles: result.affectedFiles.map(f => ({
      path: f.path,
      depth: f.depth,
      impactType: f.impactType,
      affectedFunctions: f.affectedFunctions,
      reason: f.reason
    }))
  };
}

/**
 * Get mediator summary
 */
export async function mediatorSummary(
  args: z.infer<typeof MediatorSummarySchema>
): Promise<object | null> {
  return getMediatorSummary(args.sessionId);
}

// =============================================================================
// Export Tool Definitions
// =============================================================================

export const mediatorTools = {
  elenchus_ripple_effect: {
    description: 'Analyze ripple effect of a code change. Shows which files and functions will be affected by modifying a specific file.',
    schema: RippleEffectSchema,
    handler: rippleEffect
  },
  elenchus_mediator_summary: {
    description: 'Get mediator summary including dependency graph stats, verification coverage, and intervention history.',
    schema: MediatorSummarySchema,
    handler: mediatorSummary
  }
};
