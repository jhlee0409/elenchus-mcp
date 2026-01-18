/**
 * LLM-based Evaluators
 *
 * This module provides intelligent evaluation capabilities that leverage
 * LLM reasoning instead of rigid pattern matching.
 *
 * Key improvements over pattern-based evaluation:
 * 1. Context-sensitive convergence assessment
 * 2. Nuanced severity classification considering impact
 * 3. Actual edge case analysis verification (not just keyword detection)
 * 4. Evidence-based false positive detection
 */

// Types
export type {
  SamplingFunction,
  SamplingRequest,
  SamplingResponse,
  ConfidenceLevel,
  EvaluationResult,
  ConvergenceEvaluation,
  SeverityEvaluation,
  EdgeCaseEvaluation,
  FalsePositiveEvaluation,
  LLMEvaluatorConfig,
  EvaluatorContext,
} from './types.js';

export { DEFAULT_EVALUATOR_CONFIG } from './types.js';

// Convergence Evaluator
export { evaluateConvergenceLLM } from './convergence-evaluator.js';

// Severity Evaluator
export {
  evaluateSeverityLLM,
  evaluateSeveritiesBatch,
  type SeverityEvaluationInput,
} from './severity-evaluator.js';

// Edge Case Evaluator
export {
  evaluateEdgeCasesLLM,
  getRecommendedEdgeCases,
} from './edge-case-evaluator.js';

// False Positive Evaluator
export {
  evaluateFalsePositiveLLM,
  evaluateFalsePositivesBatch,
  quickFalsePositiveCheck,
  type FalsePositiveInput,
} from './false-positive-evaluator.js';

/**
 * Unified evaluator that combines all evaluation types
 */
export interface UnifiedEvaluator {
  evaluateConvergence: typeof import('./convergence-evaluator.js').evaluateConvergenceLLM;
  evaluateSeverity: typeof import('./severity-evaluator.js').evaluateSeverityLLM;
  evaluateEdgeCases: typeof import('./edge-case-evaluator.js').evaluateEdgeCasesLLM;
  evaluateFalsePositive: typeof import('./false-positive-evaluator.js').evaluateFalsePositiveLLM;
}

/**
 * Create a unified evaluator instance with a shared sampling function
 */
export function createUnifiedEvaluator(
  samplingFn: SamplingFunction,
  config?: Partial<LLMEvaluatorConfig>
): UnifiedEvaluator {
  const { evaluateConvergenceLLM } = require('./convergence-evaluator.js');
  const { evaluateSeverityLLM } = require('./severity-evaluator.js');
  const { evaluateEdgeCasesLLM } = require('./edge-case-evaluator.js');
  const { evaluateFalsePositiveLLM } = require('./false-positive-evaluator.js');
  const { DEFAULT_EVALUATOR_CONFIG } = require('./types.js');

  const mergedConfig = { ...DEFAULT_EVALUATOR_CONFIG, ...config };

  return {
    evaluateConvergence: (context: EvaluatorContext) =>
      evaluateConvergenceLLM(context, samplingFn, mergedConfig),
    evaluateSeverity: (input: SeverityEvaluationInput) =>
      evaluateSeverityLLM(input, samplingFn, mergedConfig),
    evaluateEdgeCases: (context: EvaluatorContext) =>
      evaluateEdgeCasesLLM(context, samplingFn, mergedConfig),
    evaluateFalsePositive: (input: FalsePositiveInput) =>
      evaluateFalsePositiveLLM(input, samplingFn, mergedConfig),
  };
}

// Import types for the unified evaluator
import type { SamplingFunction, LLMEvaluatorConfig, EvaluatorContext } from './types.js';
import type { SeverityEvaluationInput } from './severity-evaluator.js';
import type { FalsePositiveInput } from './false-positive-evaluator.js';
