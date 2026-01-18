/**
 * LLM-based Evaluator Types
 *
 * These types support MCP Sampling for intelligent evaluation
 * instead of rigid pattern matching.
 */

import type { SamplingFunction, SamplingRequest, SamplingResponse } from '../roles/dynamic-generator.js';

// Re-export for convenience
export type { SamplingFunction, SamplingRequest, SamplingResponse };

/**
 * LLM evaluation confidence level
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'uncertain';

/**
 * Base evaluation result
 */
export interface EvaluationResult {
  /** Whether the evaluation passed */
  passed: boolean;
  /** Confidence in the evaluation */
  confidence: ConfidenceLevel;
  /** Detailed reasoning from the LLM */
  reasoning: string;
  /** Specific evidence supporting the evaluation */
  evidence: string[];
  /** Suggestions for improvement if not passed */
  suggestions?: string[];
}

/**
 * Convergence evaluation result
 */
export interface ConvergenceEvaluation extends EvaluationResult {
  /** Overall verification quality score (0-100) */
  qualityScore: number;
  /** Category-specific scores */
  categoryScores: Record<string, number>;
  /** Identified gaps in verification */
  gaps: string[];
  /** Whether more rounds are recommended */
  moreRoundsRecommended: boolean;
  /** Recommended focus areas if more rounds needed */
  recommendedFocusAreas?: string[];
}

/**
 * Severity evaluation result
 */
export interface SeverityEvaluation extends EvaluationResult {
  /** Assessed severity level */
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  /** Impact assessment */
  impact: {
    exploitability: 'easy' | 'moderate' | 'difficult' | 'theoretical';
    scope: 'widespread' | 'limited' | 'isolated';
    businessImpact: 'critical' | 'significant' | 'moderate' | 'minimal';
  };
  /** Whether severity should be escalated or downgraded */
  adjustment?: {
    direction: 'escalate' | 'downgrade';
    reason: string;
  };
}

/**
 * Edge case coverage evaluation result
 */
export interface EdgeCaseEvaluation extends EvaluationResult {
  /** List of edge cases actually analyzed */
  analyzedCases: Array<{
    description: string;
    category: string;
    adequatelyHandled: boolean;
  }>;
  /** Missing edge cases that should be considered */
  missingCases: Array<{
    description: string;
    category: string;
    importance: 'critical' | 'important' | 'nice-to-have';
  }>;
  /** Overall coverage completeness (0-100) */
  coverageScore: number;
}

/**
 * False positive evaluation result
 */
export interface FalsePositiveEvaluation extends EvaluationResult {
  /** Verdict on the issue */
  verdict: 'valid' | 'false_positive' | 'partially_valid' | 'needs_context';
  /** Evidence quality assessment */
  evidenceQuality: 'strong' | 'moderate' | 'weak' | 'missing';
  /** Whether the issue reasoning is sound */
  reasoningSound: boolean;
  /** Alternative interpretation if false positive */
  alternativeInterpretation?: string;
  /** Recommended action */
  recommendedAction: 'keep' | 'dismiss' | 'modify' | 'investigate';
}

/**
 * Configuration for LLM evaluators
 */
export interface LLMEvaluatorConfig {
  /** Enable LLM-based evaluation (vs pattern matching fallback) */
  enabled: boolean;
  /** Temperature for LLM calls (lower = more deterministic) */
  temperature: number;
  /** Maximum tokens for evaluation response */
  maxTokens: number;
  /** Whether to cache evaluation results */
  cacheEnabled: boolean;
  /** Cache TTL in milliseconds */
  cacheTTL: number;
  /** Fallback to pattern matching if LLM fails */
  fallbackToPatterns: boolean;
}

export const DEFAULT_EVALUATOR_CONFIG: LLMEvaluatorConfig = {
  enabled: true,
  temperature: 0.3, // Lower temperature for more consistent evaluations
  maxTokens: 2000,
  cacheEnabled: true,
  cacheTTL: 1800000, // 30 minutes
  fallbackToPatterns: true,
};

/**
 * Context provided to evaluators
 */
export interface EvaluatorContext {
  /** Project/domain type if known */
  projectType?: string;
  /** Target files being verified */
  targetFiles: string[];
  /** All verification outputs so far */
  allOutputs: string;
  /** Current round number */
  currentRound: number;
  /** Issue history */
  issues: Array<{
    id: string;
    category: string;
    severity: string;
    status: string;
    description: string;
  }>;
  /** User requirements */
  requirements: string;
}
