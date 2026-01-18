/**
 * Convergence Check Helper Functions
 *
 * Extracted from checkConvergence() for better maintainability and testability.
 * Each function handles a single responsibility in the convergence check process.
 */

import { Session, Issue, IssueCategory, IssueStatus, Round } from '../types/index.js';
import { CONVERGENCE_CONSTANTS } from '../config/constants.js';
import {
  EDGE_CASE_STRUCTURAL_INDICATORS as PATTERN_EDGE_CASES,
  NEGATIVE_ASSERTION_PATTERNS as PATTERN_NEGATIVES
} from '../utils/patterns.js';

// =============================================================================
// Types
// =============================================================================

export interface IssueAggregation {
  categoryCounts: Record<IssueCategory, number>;
  unresolvedIssues: number;
  criticalUnresolved: number;
  highUnresolved: number;
  dismissedCount: number;
  mergedCount: number;
  recentTransitions: number;
}

export interface CategoryCoverageResult {
  categoryCoverage: Record<IssueCategory, { checked: number; total: number }>;
  allCategoriesExamined: boolean;
  uncoveredCategories: IssueCategory[];
}

export interface EdgeCaseAnalysisResult {
  hasEdgeCaseCoverage: boolean;
  hasComprehensiveEdgeCaseCoverage: boolean;
  edgeCaseCategoryCoverage: Record<string, boolean>;
  coveredEdgeCaseCategories: string[];
  missingEdgeCaseCategories: string[];
}

export interface ImpactCoverageResult {
  totalImpactedFiles: number;
  reviewedImpactedFiles: number;
  unreviewedImpactedFiles: string[];
  coverageRate: number;
  hasHighRiskCoverage: boolean;
  unreviewedHighRisk: string[];
}

// [ENH: LLM-EVAL] LLM-enhanced evaluation result
export interface LLMEnhancedConvergenceResult {
  // Traditional pattern-based result
  patternBased: {
    isConverged: boolean;
    hasEdgeCaseCoverage: boolean;
    hasNegativeAssertions: boolean;
    allCategoriesExamined: boolean;
  };
  // LLM evaluation result (if enabled)
  llmEvaluation?: {
    qualityScore: number;
    categoryScores: Record<string, number>;
    gaps: string[];
    moreRoundsRecommended: boolean;
    confidence: 'high' | 'medium' | 'low' | 'uncertain';
    reasoning: string;
  };
  // Final decision (LLM takes precedence if enabled and confident)
  finalDecision: {
    isConverged: boolean;
    source: 'pattern' | 'llm' | 'combined';
    reason: string;
  };
}

// =============================================================================
// Constants (moved from inline)
// =============================================================================

// Re-export from central config for backward compatibility
export const CATEGORY_TOTALS = CONVERGENCE_CONSTANTS.CATEGORY_TOTALS as Record<IssueCategory, number>;

export const EDGE_CASE_CATEGORY_NAMES = [
  'codeLevel',
  'userBehavior',
  'externalDependencies',
  'businessLogic',
  'dataState',
  'environment',
  'scale',
  'security',
  'sideEffects'
] as const;

// Re-export from central patterns for backward compatibility
export const EDGE_CASE_STRUCTURAL_INDICATORS = PATTERN_EDGE_CASES;
export const NEGATIVE_ASSERTION_PATTERNS = PATTERN_NEGATIVES;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Single-pass aggregation over all issues
 * Computes category counts, unresolved counts, and transition counts in O(n)
 */
export function aggregateIssues(
  issues: Issue[],
  currentRound: number
): IssueAggregation {
  const categoryCounts: Record<IssueCategory, number> = {
    SECURITY: 0, CORRECTNESS: 0, RELIABILITY: 0, MAINTAINABILITY: 0, PERFORMANCE: 0
  };

  let unresolvedIssues = 0;
  let criticalUnresolved = 0;
  let highUnresolved = 0;
  let dismissedCount = 0;
  let mergedCount = 0;
  let recentTransitions = 0;

  const inactiveStatuses: IssueStatus[] = ['RESOLVED', 'DISMISSED', 'MERGED'];
  const transitionCutoff = currentRound - 1;

  for (const issue of issues) {
    categoryCounts[issue.category]++;

    if (issue.status === 'DISMISSED') {
      dismissedCount++;
    } else if (issue.status === 'MERGED') {
      mergedCount++;
    }

    if (!inactiveStatuses.includes(issue.status)) {
      unresolvedIssues++;
      if (issue.severity === 'CRITICAL') criticalUnresolved++;
      if (issue.severity === 'HIGH') highUnresolved++;
    }

    if (issue.transitions) {
      for (const t of issue.transitions) {
        if (t.round >= transitionCutoff) {
          recentTransitions++;
        }
      }
    }
  }

  return {
    categoryCounts,
    unresolvedIssues,
    criticalUnresolved,
    highUnresolved,
    dismissedCount,
    mergedCount,
    recentTransitions
  };
}

/**
 * Calculate category coverage from aggregated counts
 * [ENH: CAT-CACHE] Uses session.mentionedCategories cache if available for O(1) lookup
 */
export function calculateCategoryCoverage(
  categoryCounts: Record<IssueCategory, number>,
  rounds: Round[],
  issues: Issue[],
  mentionedCategoriesCache?: Set<IssueCategory>
): CategoryCoverageResult {
  const categories: IssueCategory[] = [
    'SECURITY', 'CORRECTNESS', 'RELIABILITY', 'MAINTAINABILITY', 'PERFORMANCE'
  ];

  const categoryCoverage: Record<IssueCategory, { checked: number; total: number }> =
    {} as Record<IssueCategory, { checked: number; total: number }>;

  for (const cat of categories) {
    categoryCoverage[cat] = { checked: categoryCounts[cat], total: CATEGORY_TOTALS[cat] };
  }

  const uncoveredCategories: IssueCategory[] = [];
  for (const cat of categories) {
    const hasIssueInCategory = issues.some(i => i.category === cat);

    // [ENH: CAT-CACHE] Use cache if available, otherwise scan rounds
    const categoryMentionedExplicitly = mentionedCategoriesCache
      ? mentionedCategoriesCache.has(cat)
      : rounds.some(r => r.output.toUpperCase().includes(cat));

    if (!hasIssueInCategory && !categoryMentionedExplicitly) {
      uncoveredCategories.push(cat);
    }
  }

  return {
    categoryCoverage,
    allCategoriesExamined: uncoveredCategories.length === 0,
    uncoveredCategories
  };
}

/**
 * [ENH: CAT-CACHE] Extract mentioned categories from round output and update cache
 */
export function updateCategoryMentionCache(
  output: string,
  existingCache?: Set<IssueCategory>
): Set<IssueCategory> {
  const cache = existingCache || new Set<IssueCategory>();
  const categories: IssueCategory[] = [
    'SECURITY', 'CORRECTNESS', 'RELIABILITY', 'MAINTAINABILITY', 'PERFORMANCE'
  ];
  const upperOutput = output.toUpperCase();

  for (const cat of categories) {
    if (upperOutput.includes(cat)) {
      cache.add(cat);
    }
  }

  return cache;
}

/**
 * Count consecutive rounds without new issues (from end)
 */
export function countRoundsWithoutNewIssues(rounds: Round[]): number {
  let count = 0;
  for (let i = rounds.length - 1; i >= 0; i--) {
    if (rounds[i].issuesRaised.length === 0) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/**
 * Analyze edge case coverage using structural indicators
 */
export function analyzeEdgeCaseCoverage(allOutputs: string): EdgeCaseAnalysisResult {
  const hasStructuralEdgeCaseAnalysis = EDGE_CASE_STRUCTURAL_INDICATORS.some(
    pattern => pattern.test(allOutputs)
  );

  const edgeCaseCategoryCoverage: Record<string, boolean> = {};
  for (const category of EDGE_CASE_CATEGORY_NAMES) {
    edgeCaseCategoryCoverage[category] = hasStructuralEdgeCaseAnalysis;
  }

  return {
    hasEdgeCaseCoverage: hasStructuralEdgeCaseAnalysis,
    hasComprehensiveEdgeCaseCoverage: hasStructuralEdgeCaseAnalysis,
    edgeCaseCategoryCoverage,
    coveredEdgeCaseCategories: hasStructuralEdgeCaseAnalysis ? [...EDGE_CASE_CATEGORY_NAMES] : [],
    missingEdgeCaseCategories: hasStructuralEdgeCaseAnalysis ? [] : [...EDGE_CASE_CATEGORY_NAMES]
  };
}

/**
 * Check for negative assertions in outputs
 */
export function hasNegativeAssertions(allOutputs: string): boolean {
  return NEGATIVE_ASSERTION_PATTERNS.some(pattern => pattern.test(allOutputs));
}

/**
 * Calculate impact coverage from issues with impact analysis
 */
export function calculateImpactCoverage(
  issues: Issue[],
  allOutputs: string
): ImpactCoverageResult {
  const impactedFiles = new Set<string>();
  const highRiskImpactedFiles = new Set<string>();

  for (const issue of issues) {
    if (issue.impactAnalysis) {
      for (const caller of issue.impactAnalysis.callers || []) {
        impactedFiles.add(caller.file);
        if (issue.impactAnalysis.riskLevel === 'HIGH' || issue.impactAnalysis.riskLevel === 'CRITICAL') {
          highRiskImpactedFiles.add(caller.file);
        }
      }
      for (const dep of issue.impactAnalysis.dependencies || []) {
        impactedFiles.add(dep.file);
      }
    }
  }

  const allOutputsLower = allOutputs.toLowerCase();
  const reviewedImpactedFiles: string[] = [];
  const unreviewedImpactedFiles: string[] = [];

  for (const file of impactedFiles) {
    const filename = file.split('/').pop() || file;
    if (allOutputsLower.includes(filename.toLowerCase()) || allOutputsLower.includes(file.toLowerCase())) {
      reviewedImpactedFiles.push(file);
    } else {
      unreviewedImpactedFiles.push(file);
    }
  }

  const coverageRate = impactedFiles.size > 0
    ? reviewedImpactedFiles.length / impactedFiles.size
    : 1;

  const unreviewedHighRisk = Array.from(highRiskImpactedFiles).filter(
    f => !reviewedImpactedFiles.includes(f)
  );

  return {
    totalImpactedFiles: impactedFiles.size,
    reviewedImpactedFiles: reviewedImpactedFiles.length,
    unreviewedImpactedFiles,
    coverageRate,
    hasHighRiskCoverage: unreviewedHighRisk.length === 0,
    unreviewedHighRisk
  };
}

/**
 * Determine convergence status based on verification mode
 * [ENH: SINGLE-ROUND] Supports stableRoundsRequired: 0 for true single-round convergence
 */
export function evaluateConvergence(
  session: Session,
  aggregation: IssueAggregation,
  allCategoriesExamined: boolean,
  roundsWithoutNewIssues: number,
  hasEdgeCaseCoverage: boolean,
  hasNegativeAsserts: boolean,
  hasHighRiskCoverage: boolean
): { isConverged: boolean; convergenceType: 'standard' | 'fast-track' | 'single-pass' | null } {
  const mode = session.verificationMode?.mode || 'standard';
  const minRounds = session.verificationMode?.minRounds ??
    (mode === 'standard' ? 3 : mode === 'fast-track' ? 1 : 1);
  // [ENH: SINGLE-ROUND] Allow stableRoundsRequired: 0 for immediate convergence
  const stableRoundsRequired = session.verificationMode?.stableRoundsRequired ??
    (mode === 'standard' ? 2 : mode === 'fast-track' ? 0 : 0);

  const { criticalUnresolved, highUnresolved, recentTransitions, unresolvedIssues } = aggregation;
  const issuesStabilized = recentTransitions === 0;
  const canFastTrack = mode === 'fast-track' || mode === 'single-pass';

  // [ENH: SINGLE-ROUND] Check if stable rounds requirement is met
  // When stableRoundsRequired is 0, only check that no new issues in current round
  const stableRoundsMet = stableRoundsRequired === 0
    ? (unresolvedIssues === 0 || roundsWithoutNewIssues >= 1)
    : roundsWithoutNewIssues >= stableRoundsRequired;

  // Standard convergence
  const standardConvergence =
    criticalUnresolved === 0 &&
    highUnresolved === 0 &&
    stableRoundsMet &&
    session.currentRound >= minRounds &&
    allCategoriesExamined &&
    issuesStabilized &&
    hasEdgeCaseCoverage &&
    hasNegativeAsserts &&
    hasHighRiskCoverage;

  if (standardConvergence) {
    return { isConverged: true, convergenceType: 'standard' };
  }

  // Fast-track convergence - [ENH: SINGLE-ROUND] true single-round when no issues
  const fastTrackConvergence =
    canFastTrack &&
    criticalUnresolved === 0 &&
    highUnresolved === 0 &&
    allCategoriesExamined &&
    hasEdgeCaseCoverage &&
    hasNegativeAsserts &&
    session.currentRound >= minRounds;

  if (fastTrackConvergence && mode === 'fast-track') {
    return { isConverged: true, convergenceType: 'fast-track' };
  }

  // Single-pass convergence
  const singlePassConvergence =
    mode === 'single-pass' &&
    criticalUnresolved === 0 &&
    highUnresolved === 0 &&
    allCategoriesExamined &&
    hasEdgeCaseCoverage &&
    hasNegativeAsserts &&
    session.currentRound >= 1;

  if (singlePassConvergence) {
    return { isConverged: true, convergenceType: 'single-pass' };
  }

  return { isConverged: false, convergenceType: null };
}

/**
 * Build convergence reason string
 */
export function buildConvergenceReason(
  isConverged: boolean,
  convergenceType: 'standard' | 'fast-track' | 'single-pass' | null,
  aggregation: IssueAggregation,
  session: Session,
  allCategoriesExamined: boolean,
  uncoveredCategories: IssueCategory[],
  hasEdgeCaseCoverage: boolean,
  hasNegativeAsserts: boolean,
  hasHighRiskCoverage: boolean,
  unreviewedHighRisk: string[],
  roundsWithoutNewIssues: number,
  impactCoverageRate: number,
  impactedFilesSize: number
): string {
  const mode = session.verificationMode?.mode || 'standard';
  const minRounds = session.verificationMode?.minRounds ??
    (mode === 'standard' ? 3 : mode === 'fast-track' ? 1 : 1);
  const { criticalUnresolved, highUnresolved, recentTransitions } = aggregation;
  const issuesStabilized = recentTransitions === 0;

  if (isConverged) {
    const impactInfo = impactedFilesSize > 0
      ? `, impact coverage: ${(impactCoverageRate * 100).toFixed(0)}%`
      : '';
    const modeInfo = mode !== 'standard' ? ` [${mode} mode]` : '';
    return `All critical/high issues resolved, all categories examined, edge cases analyzed, issues stabilized, ${roundsWithoutNewIssues}+ rounds stable${impactInfo}${modeInfo}`;
  }

  if (criticalUnresolved > 0) {
    return `${criticalUnresolved} CRITICAL issues unresolved`;
  }
  if (highUnresolved > 0) {
    return `${highUnresolved} HIGH severity issues unresolved`;
  }
  if (!allCategoriesExamined) {
    return `Categories not examined: ${uncoveredCategories.join(', ')}`;
  }
  if (!hasEdgeCaseCoverage) {
    return 'Edge case analysis not documented - include "Edge Cases:" section with boundary/failure scenarios';
  }
  if (!hasNegativeAsserts) {
    return 'Missing negative assertions - must state what was verified as clean';
  }
  if (!hasHighRiskCoverage) {
    return `High-risk impacted files not reviewed: ${unreviewedHighRisk.slice(0, 3).join(', ')}`;
  }
  if (!issuesStabilized && mode === 'standard') {
    return `Issues still changing (${recentTransitions} recent transitions)`;
  }
  if (session.currentRound < minRounds) {
    return `Minimum ${minRounds} round(s) required (current: ${session.currentRound}) [${mode} mode]`;
  }

  return 'Verification in progress';
}
