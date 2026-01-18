/**
 * Integration layer for LLM Evaluators
 *
 * Provides seamless integration with existing convergence and validation logic,
 * allowing gradual adoption with fallback to pattern-based evaluation.
 */

import type { Session, Issue } from '../types/index.js';
import type {
  SamplingFunction,
  ConvergenceEvaluation,
  SeverityEvaluation,
  EdgeCaseEvaluation,
  FalsePositiveEvaluation,
  EvaluatorContext,
  LLMEvaluatorConfig,
} from './types.js';
import { DEFAULT_EVALUATOR_CONFIG } from './types.js';
import { evaluateConvergenceLLM } from './convergence-evaluator.js';
import { evaluateSeverityLLM, type SeverityEvaluationInput } from './severity-evaluator.js';
import { evaluateEdgeCasesLLM } from './edge-case-evaluator.js';
import { evaluateFalsePositiveLLM, quickFalsePositiveCheck, type FalsePositiveInput } from './false-positive-evaluator.js';

/**
 * Configuration for integrated LLM evaluation
 */
export interface IntegratedEvalConfig {
  /** Enable LLM evaluation (if false, uses pattern-based only) */
  enabled: boolean;
  /** Which evaluations to enable */
  convergence: boolean;
  severity: boolean;
  edgeCases: boolean;
  falsePositives: boolean;
  /** LLM configuration */
  llmConfig: LLMEvaluatorConfig;
  /** Minimum confidence to trust LLM over patterns */
  minConfidenceForOverride: 'high' | 'medium' | 'low';
  /** Log evaluation decisions for debugging */
  debugLog: boolean;
}

export const DEFAULT_INTEGRATED_CONFIG: IntegratedEvalConfig = {
  enabled: true,
  convergence: true,
  severity: true,
  edgeCases: true,
  falsePositives: true,
  llmConfig: DEFAULT_EVALUATOR_CONFIG,
  minConfidenceForOverride: 'medium',
  debugLog: false,
};

/**
 * Build evaluator context from session
 */
export function buildEvaluatorContext(session: Session): EvaluatorContext {
  // Convert Map to array of file paths
  const filePaths = Array.from(session.context.files.keys());

  return {
    projectType: session.dynamicRoles?.domain || detectProjectType(session),
    targetFiles: filePaths,
    allOutputs: session.rounds.map(r => r.output).join('\n\n---\n\n'),
    currentRound: session.currentRound,
    issues: session.issues.map(i => ({
      id: i.id,
      category: i.category,
      severity: i.severity,
      status: i.status,
      description: i.description,
    })),
    requirements: session.requirements,
  };
}

/**
 * Simple heuristic to detect project type from file paths
 */
function detectProjectType(session: Session): string {
  // Convert Map keys to array for iteration
  const files = Array.from(session.context.files.keys()).map(f => f.toLowerCase());

  if (files.some(f => f.includes('auth') || f.includes('login') || f.includes('session'))) {
    return 'authentication';
  }
  if (files.some(f => f.includes('api') || f.includes('endpoint') || f.includes('route'))) {
    return 'api';
  }
  if (files.some(f => f.includes('crypto') || f.includes('encrypt') || f.includes('hash'))) {
    return 'cryptography';
  }
  if (files.some(f => f.includes('payment') || f.includes('billing') || f.includes('checkout'))) {
    return 'payment';
  }
  if (files.some(f => f.includes('test') || f.includes('spec'))) {
    return 'testing';
  }
  if (files.some(f => f.includes('component') || f.includes('.tsx') || f.includes('.jsx'))) {
    return 'frontend';
  }
  if (files.some(f => f.includes('model') || f.includes('schema') || f.includes('migration'))) {
    return 'database';
  }

  return 'general';
}

/**
 * Evaluate convergence with LLM enhancement
 */
export async function evaluateConvergenceIntegrated(
  session: Session,
  samplingFn: SamplingFunction | null,
  patternResult: { isConverged: boolean; reason: string },
  config: IntegratedEvalConfig = DEFAULT_INTEGRATED_CONFIG
): Promise<{
  isConverged: boolean;
  reason: string;
  llmEvaluation?: ConvergenceEvaluation;
  source: 'pattern' | 'llm' | 'combined';
}> {
  // If LLM evaluation disabled or no sampling function, use pattern result
  if (!config.enabled || !config.convergence || !samplingFn) {
    return {
      ...patternResult,
      source: 'pattern',
    };
  }

  try {
    const context = buildEvaluatorContext(session);
    const llmEval = await evaluateConvergenceLLM(context, samplingFn, config.llmConfig);

    // Determine final decision
    const llmConfidentEnough = meetsConfidenceThreshold(
      llmEval.confidence,
      config.minConfidenceForOverride
    );

    // If LLM is confident, prefer its decision
    if (llmConfidentEnough) {
      // If LLM and pattern agree, use combined
      if (llmEval.passed === patternResult.isConverged) {
        return {
          isConverged: llmEval.passed,
          reason: `${patternResult.reason}\n\nLLM Assessment (${llmEval.confidence} confidence, score: ${llmEval.qualityScore}/100): ${llmEval.reasoning}`,
          llmEvaluation: llmEval,
          source: 'combined',
        };
      }

      // LLM disagrees - use LLM with explanation
      return {
        isConverged: llmEval.passed,
        reason: `LLM Override (${llmEval.confidence} confidence, score: ${llmEval.qualityScore}/100): ${llmEval.reasoning}\n\nPattern-based result was: ${patternResult.isConverged ? 'converged' : 'not converged'}`,
        llmEvaluation: llmEval,
        source: 'llm',
      };
    }

    // LLM not confident enough, use pattern but include LLM insights
    return {
      ...patternResult,
      reason: `${patternResult.reason}\n\n[LLM Insights (${llmEval.confidence} confidence): ${llmEval.gaps.length > 0 ? 'Potential gaps: ' + llmEval.gaps.join(', ') : 'No additional gaps identified'}]`,
      llmEvaluation: llmEval,
      source: 'pattern',
    };
  } catch (error) {
    // Fallback to pattern on error
    if (config.debugLog) {
      console.error('[LLM-EVAL] Convergence evaluation failed:', error);
    }
    return {
      ...patternResult,
      source: 'pattern',
    };
  }
}

/**
 * Evaluate issue severity with LLM enhancement
 */
export async function evaluateSeverityIntegrated(
  issue: Issue,
  codeContext: string,
  session: Session,
  samplingFn: SamplingFunction | null,
  config: IntegratedEvalConfig = DEFAULT_INTEGRATED_CONFIG
): Promise<{
  severity: string;
  adjusted: boolean;
  llmEvaluation?: SeverityEvaluation;
}> {
  if (!config.enabled || !config.severity || !samplingFn) {
    return {
      severity: issue.severity,
      adjusted: false,
    };
  }

  try {
    const input: SeverityEvaluationInput = {
      issueId: issue.id,
      issueDescription: issue.description,
      codeContext,
      filePath: issue.location.split(':')[0], // Extract file path from location (file:line format)
      projectType: session.dynamicRoles?.domain || detectProjectType(session),
      currentSeverity: issue.severity,
    };

    const llmEval = await evaluateSeverityLLM(input, samplingFn, config.llmConfig);

    // Only adjust if LLM is confident and suggests change
    if (
      llmEval.adjustment &&
      meetsConfidenceThreshold(llmEval.confidence, config.minConfidenceForOverride)
    ) {
      return {
        severity: llmEval.severity,
        adjusted: true,
        llmEvaluation: llmEval,
      };
    }

    return {
      severity: issue.severity,
      adjusted: false,
      llmEvaluation: llmEval,
    };
  } catch (error) {
    if (config.debugLog) {
      console.error('[LLM-EVAL] Severity evaluation failed:', error);
    }
    return {
      severity: issue.severity,
      adjusted: false,
    };
  }
}

/**
 * Evaluate edge case coverage with LLM enhancement
 */
export async function evaluateEdgeCasesIntegrated(
  session: Session,
  samplingFn: SamplingFunction | null,
  patternResult: { hasEdgeCaseCoverage: boolean },
  config: IntegratedEvalConfig = DEFAULT_INTEGRATED_CONFIG
): Promise<{
  hasEdgeCaseCoverage: boolean;
  coverageScore?: number;
  missingCritical?: string[];
  llmEvaluation?: EdgeCaseEvaluation;
}> {
  if (!config.enabled || !config.edgeCases || !samplingFn) {
    return patternResult;
  }

  try {
    const context = buildEvaluatorContext(session);
    const llmEval = await evaluateEdgeCasesLLM(context, samplingFn, config.llmConfig);

    const criticalMissing = llmEval.missingCases
      .filter(c => c.importance === 'critical')
      .map(c => c.description);

    // Use LLM result if confident
    if (meetsConfidenceThreshold(llmEval.confidence, config.minConfidenceForOverride)) {
      return {
        hasEdgeCaseCoverage: llmEval.passed && criticalMissing.length === 0,
        coverageScore: llmEval.coverageScore,
        missingCritical: criticalMissing,
        llmEvaluation: llmEval,
      };
    }

    // Augment pattern result with LLM insights
    return {
      ...patternResult,
      coverageScore: llmEval.coverageScore,
      missingCritical: criticalMissing.length > 0 ? criticalMissing : undefined,
      llmEvaluation: llmEval,
    };
  } catch (error) {
    if (config.debugLog) {
      console.error('[LLM-EVAL] Edge case evaluation failed:', error);
    }
    return patternResult;
  }
}

/**
 * Evaluate potential false positive with LLM
 */
export async function evaluateFalsePositiveIntegrated(
  issue: Issue,
  verifierOutput: string,
  criticChallenge: string | undefined,
  codeContext: string,
  samplingFn: SamplingFunction | null,
  config: IntegratedEvalConfig = DEFAULT_INTEGRATED_CONFIG
): Promise<{
  verdict: 'valid' | 'false_positive' | 'partially_valid' | 'needs_context';
  recommendedAction: 'keep' | 'dismiss' | 'modify' | 'investigate';
  llmEvaluation?: FalsePositiveEvaluation;
}> {
  // Quick heuristic check first
  const quickCheck = quickFalsePositiveCheck({
    issueId: issue.id,
    category: issue.category,
    severity: issue.severity,
    description: issue.description,
    evidence: issue.evidence || '',
    codeContext,
    verifierReasoning: verifierOutput,
    criticChallenge,
  });

  // If not suspicious and LLM disabled, treat as valid
  if (!quickCheck.suspicious && (!config.enabled || !config.falsePositives || !samplingFn)) {
    return {
      verdict: 'valid',
      recommendedAction: 'keep',
    };
  }

  // If LLM disabled but suspicious, flag for investigation
  if (!config.enabled || !config.falsePositives || !samplingFn) {
    return {
      verdict: 'needs_context',
      recommendedAction: 'investigate',
    };
  }

  try {
    const input: FalsePositiveInput = {
      issueId: issue.id,
      category: issue.category,
      severity: issue.severity,
      description: issue.description,
      evidence: issue.evidence || '',
      codeContext,
      verifierReasoning: verifierOutput,
      criticChallenge,
    };

    const llmEval = await evaluateFalsePositiveLLM(input, samplingFn, config.llmConfig);

    return {
      verdict: llmEval.verdict,
      recommendedAction: llmEval.recommendedAction,
      llmEvaluation: llmEval,
    };
  } catch (error) {
    if (config.debugLog) {
      console.error('[LLM-EVAL] False positive evaluation failed:', error);
    }
    return {
      verdict: quickCheck.suspicious ? 'needs_context' : 'valid',
      recommendedAction: quickCheck.suspicious ? 'investigate' : 'keep',
    };
  }
}

/**
 * Check if confidence meets threshold
 */
function meetsConfidenceThreshold(
  confidence: 'high' | 'medium' | 'low' | 'uncertain',
  threshold: 'high' | 'medium' | 'low'
): boolean {
  const levels = { high: 3, medium: 2, low: 1, uncertain: 0 };
  return levels[confidence] >= levels[threshold];
}
