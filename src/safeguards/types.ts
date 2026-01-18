/**
 * Quality Safeguards Types
 * [ENH: SAFEGUARDS] Types for quality assurance in optimized verification
 */

import { Severity, IssueCategory } from '../types/index.js';

// =============================================================================
// Periodic Full Verification
// =============================================================================

export interface PeriodicVerificationConfig {
  enabled: boolean;
  /** Number of incremental verifications before forcing full scan */
  incrementalThreshold: number;
  /** Max hours since last full verification */
  maxHoursSinceFull: number;
  /** Force full verification if confidence drops below this */
  confidenceFloor: number;
  /** File patterns that always require full verification */
  alwaysFullPatterns: string[];
}

export interface IncrementalTracker {
  /** Count since last full verification */
  incrementalCount: number;
  /** Timestamp of last full verification */
  lastFullAt: string | null;
  /** Session ID of last full verification */
  lastFullSessionId: string | null;
  /** Files only verified incrementally */
  incrementalOnlyFiles: string[];
  /** Historical misses (issues found in full but missed in incremental) */
  historicalMisses: HistoricalMiss[];
}

export interface HistoricalMiss {
  sessionId: string;
  issueId: string;
  severity: Severity;
  category: IssueCategory;
  file: string;
  foundAt: string;
}

export interface FullVerificationDecision {
  forceFullVerification: boolean;
  reasons: FullVerificationReason[];
  mandatoryFiles: string[];
}

export type FullVerificationReason =
  | 'INCREMENTAL_THRESHOLD'
  | 'TIME_THRESHOLD'
  | 'CONFIDENCE_FLOOR'
  | 'CRITICAL_PATTERN'
  | 'HISTORICAL_MISS_PATTERN'
  | 'MANUAL_FORCE';

// =============================================================================
// Confidence Scoring
// =============================================================================

export interface ConfidenceConfig {
  /** Weights for different factors */
  weights: {
    freshness: number;
    contextMatch: number;
    coverage: number;
    historicalAccuracy: number;
  };
  /** Minimum confidence for acceptance */
  minimumAcceptable: number;
  /** Cache-specific settings */
  cache: {
    maxAgeHours: number;
    decayPerHour: number;
    minimumConfidence: number;
  };
  /** Chunk-specific settings */
  chunk: {
    boundaryPenalty: number;
    minDependencyCoverage: number;
  };
  /** Tier-specific settings */
  tier: {
    screenWeight: number;
    focusedWeight: number;
    exhaustiveWeight: number;
    skippedPenalty: number;
  };
}

export interface ConfidenceScore {
  /** Overall score 0-1 */
  score: number;
  /** Level categorization */
  level: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNRELIABLE';
  /** Factor breakdown */
  factors: ConfidenceFactors;
  /** Warnings that reduced score */
  warnings: ConfidenceWarning[];
  /** Timestamp */
  calculatedAt: string;
}

export interface ConfidenceFactors {
  /** Base from verification method (1.0 for full, lower for optimized) */
  methodBase: number;
  /** Freshness score */
  freshness: number;
  /** Context alignment */
  contextMatch: number;
  /** Verification coverage */
  coverage: number;
  /** Historical accuracy */
  historicalAccuracy: number;
}

export interface ConfidenceWarning {
  code: ConfidenceWarningCode;
  message: string;
  impact: number;
  files?: string[];
}

export type ConfidenceWarningCode =
  | 'STALE_CACHE'
  | 'CONTEXT_MISMATCH'
  | 'CHUNK_BOUNDARY'
  | 'INCOMPLETE_TIER'
  | 'UNVERIFIED_DEPENDENCY'
  | 'HIGH_CHURN'
  | 'CROSS_FILE_RISK';

export interface FileConfidence {
  file: string;
  confidence: ConfidenceScore;
  source: 'full' | 'cache' | 'chunk' | 'tiered' | 'sampled';
  details: {
    cacheAge?: number;
    chunkCoverage?: number;
    tierLevel?: string;
  };
}

export interface SessionConfidence {
  sessionId: string;
  /** Overall session confidence */
  overall: ConfidenceScore;
  /** Per-file breakdown */
  byFile: FileConfidence[];
  /** Per-category breakdown */
  byCategory: Record<IssueCategory, number>;
  /** Lowest confidence files */
  lowestFiles: FileConfidence[];
  /** Recommendations */
  recommendations: ConfidenceRecommendation[];
}

export interface ConfidenceRecommendation {
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  action: string;
  description: string;
  estimatedGain: number;
  targetFiles?: string[];
}

// =============================================================================
// Random Sampling
// =============================================================================

export interface SamplingConfig {
  enabled: boolean;
  /** Sampling rate 0-100 */
  rate: number;
  /** Minimum samples regardless of rate */
  minSamples: number;
  /** Maximum samples */
  maxSamples: number;
  /** Sampling strategy */
  strategy: SamplingStrategy;
  /** Patterns to always sample */
  alwaysSamplePatterns: string[];
  /** Patterns to never sample */
  neverSamplePatterns: string[];
  /** Boost for files with historical issues */
  historicalBoost: number;
}

export type SamplingStrategy =
  | 'UNIFORM'
  | 'RISK_WEIGHTED'
  | 'CHANGE_WEIGHTED'
  | 'DEPENDENCY_WEIGHTED';

export interface SamplingTracker {
  /** Files that were sampled */
  sampledFiles: SampledFile[];
  /** Files that were skipped */
  skippedFiles: SkippedFile[];
  /** Statistics */
  stats: SamplingStats;
  /** Random seed for reproducibility */
  seed: number;
}

export interface SampledFile {
  path: string;
  reason: SamplingReason;
  weight: number;
  result?: SamplingResult;
}

export type SamplingReason =
  | 'RANDOM'
  | 'PATTERN_MATCH'
  | 'HIGH_RISK'
  | 'HISTORICAL'
  | 'DEPENDENCY_HUB'
  | 'MINIMUM_REQUIREMENT';

export interface SamplingResult {
  issuesFound: number;
  severities: Severity[];
  productive: boolean;
  confidence: number;
}

export interface SkippedFile {
  path: string;
  reason: SkipReason;
  risk: number;
}

export type SkipReason =
  | 'UNCHANGED'
  | 'CACHED'
  | 'LOW_TIER'
  | 'NOT_IN_CHUNK'
  | 'EXCLUDED'
  | 'NOT_SELECTED';

export interface SamplingStats {
  totalInScope: number;
  eligible: number;
  sampled: number;
  effectiveRate: number;
  productive: number;
  productivityRate: number;
  estimatedMissed: number;
}

// =============================================================================
// Aggregate State
// =============================================================================

export interface SafeguardsState {
  sessionId: string;
  periodic: {
    config: PeriodicVerificationConfig;
    tracker: IncrementalTracker;
    lastDecision: FullVerificationDecision | null;
  };
  confidence: {
    config: ConfidenceConfig;
    session: SessionConfidence | null;
  };
  sampling: {
    config: SamplingConfig;
    tracker: SamplingTracker | null;
  };
  quality: QualityAssessment;
}

export interface QualityAssessment {
  score: number;
  level: 'EXCELLENT' | 'GOOD' | 'ACCEPTABLE' | 'POOR' | 'UNACCEPTABLE';
  metrics: {
    coverage: number;
    confidence: number;
    samplingProductivity: number;
    incrementalDrift: number;
  };
  concerns: QualityConcern[];
  actions: QualityAction[];
}

export interface QualityConcern {
  severity: 'WARNING' | 'ERROR';
  code: string;
  message: string;
  files?: string[];
}

export interface QualityAction {
  priority: number;
  action: string;
  description: string;
  impact: number;
}

// =============================================================================
// Default Configurations
// =============================================================================

export const DEFAULT_PERIODIC_CONFIG: PeriodicVerificationConfig = {
  enabled: true,
  incrementalThreshold: 5,
  maxHoursSinceFull: 24,
  confidenceFloor: 0.6,
  alwaysFullPatterns: ['**/auth/**', '**/security/**', '**/payment/**']
};

export const DEFAULT_CONFIDENCE_CONFIG: ConfidenceConfig = {
  weights: {
    freshness: 0.25,
    contextMatch: 0.25,
    coverage: 0.30,
    historicalAccuracy: 0.20
  },
  minimumAcceptable: 0.7,
  cache: {
    maxAgeHours: 24,
    decayPerHour: 0.02,
    minimumConfidence: 0.5
  },
  chunk: {
    boundaryPenalty: 0.15,
    minDependencyCoverage: 0.8
  },
  tier: {
    screenWeight: 0.4,
    focusedWeight: 0.7,
    exhaustiveWeight: 1.0,
    skippedPenalty: 0.2
  }
};

export const DEFAULT_SAMPLING_CONFIG: SamplingConfig = {
  enabled: true,
  rate: 10,
  minSamples: 2,
  maxSamples: 20,
  strategy: 'RISK_WEIGHTED',
  alwaysSamplePatterns: ['**/auth/**', '**/security/**'],
  neverSamplePatterns: ['**/*.test.*', '**/__tests__/**'],
  historicalBoost: 1.5
};

// =============================================================================
// [ENH: AUTO-SAFEGUARDS] Auto-activation configuration
// =============================================================================

/**
 * Configuration for automatic safeguards activation when optimizations are enabled
 */
export interface SafeguardsAutoActivationConfig {
  /** When true, safeguards are automatically enabled with any optimization module */
  autoEnableWithOptimizations: boolean;
  /** Override sampling rate when differential is enabled */
  differentialSamplingRate: number;
  /** Override sampling rate when cache is enabled */
  cacheSamplingRate: number;
  /** Override sampling rate when pipeline tiering is enabled */
  pipelineSamplingRate: number;
  /** Extended patterns to always verify fully (beyond security/auth/payment) */
  extendedAlwaysFullPatterns: string[];
  /** Force periodic full verification threshold when using optimizations */
  optimizedIncrementalThreshold: number;
}

export const DEFAULT_AUTO_ACTIVATION_CONFIG: SafeguardsAutoActivationConfig = {
  autoEnableWithOptimizations: true,
  differentialSamplingRate: 15,  // Higher sampling when differential is active
  cacheSamplingRate: 12,         // Moderate increase for cache
  pipelineSamplingRate: 10,      // Standard for pipeline
  extendedAlwaysFullPatterns: [
    '**/utils/**',
    '**/helpers/**',
    '**/common/**',
    '**/shared/**',
    '**/core/**'
  ],
  optimizedIncrementalThreshold: 3  // More frequent full verification when optimized
};

/**
 * Get effective safeguards config based on active optimizations
 */
export function getEffectiveSafeguardsConfig(
  baseConfig: {
    periodic: PeriodicVerificationConfig;
    confidence: ConfidenceConfig;
    sampling: SamplingConfig;
  },
  activeOptimizations: {
    differential?: boolean;
    cache?: boolean;
    chunking?: boolean;
    pipeline?: boolean;
  },
  autoConfig: SafeguardsAutoActivationConfig = DEFAULT_AUTO_ACTIVATION_CONFIG
): {
  periodic: PeriodicVerificationConfig;
  confidence: ConfidenceConfig;
  sampling: SamplingConfig;
} {
  if (!autoConfig.autoEnableWithOptimizations) {
    return baseConfig;
  }

  const anyOptimizationActive = Object.values(activeOptimizations).some(v => v);
  if (!anyOptimizationActive) {
    return baseConfig;
  }

  // Calculate effective sampling rate (use highest applicable)
  let effectiveSamplingRate = baseConfig.sampling.rate;
  if (activeOptimizations.differential) {
    effectiveSamplingRate = Math.max(effectiveSamplingRate, autoConfig.differentialSamplingRate);
  }
  if (activeOptimizations.cache) {
    effectiveSamplingRate = Math.max(effectiveSamplingRate, autoConfig.cacheSamplingRate);
  }
  if (activeOptimizations.pipeline) {
    effectiveSamplingRate = Math.max(effectiveSamplingRate, autoConfig.pipelineSamplingRate);
  }

  // Merge always-full patterns
  const mergedPatterns = [
    ...new Set([
      ...baseConfig.periodic.alwaysFullPatterns,
      ...autoConfig.extendedAlwaysFullPatterns
    ])
  ];

  return {
    periodic: {
      ...baseConfig.periodic,
      enabled: true,  // Force enable
      incrementalThreshold: Math.min(
        baseConfig.periodic.incrementalThreshold,
        autoConfig.optimizedIncrementalThreshold
      ),
      alwaysFullPatterns: mergedPatterns
    },
    confidence: {
      ...baseConfig.confidence
    },
    sampling: {
      ...baseConfig.sampling,
      enabled: true,  // Force enable
      rate: effectiveSamplingRate
    }
  };
}
