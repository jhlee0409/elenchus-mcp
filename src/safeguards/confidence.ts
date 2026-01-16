/**
 * Confidence Scoring
 * [ENH: SAFEGUARDS] Calculates confidence for optimized verification results
 */

import {
  ConfidenceConfig,
  ConfidenceScore,
  ConfidenceFactors,
  ConfidenceWarning,
  ConfidenceWarningCode,
  FileConfidence,
  SessionConfidence,
  ConfidenceRecommendation,
  DEFAULT_CONFIDENCE_CONFIG
} from './types.js';
import { IssueCategory } from '../types/index.js';
import { VerificationTier } from '../pipeline/types.js';

/**
 * Calculate confidence level from score
 */
function getConfidenceLevel(score: number): 'HIGH' | 'MEDIUM' | 'LOW' | 'UNRELIABLE' {
  if (score >= 0.85) return 'HIGH';
  if (score >= 0.7) return 'MEDIUM';
  if (score >= 0.5) return 'LOW';
  return 'UNRELIABLE';
}

/**
 * Calculate confidence for a cached result
 */
export function calculateCacheConfidence(
  cacheAgeHours: number,
  requirementsMatch: boolean,
  dependenciesUnchanged: boolean,
  config: ConfidenceConfig = DEFAULT_CONFIDENCE_CONFIG
): ConfidenceScore {
  const warnings: ConfidenceWarning[] = [];

  // Base confidence from method (cached = 0.85 base)
  let methodBase = 0.85;

  // Freshness decay
  const freshness = Math.max(
    config.cache.minimumConfidence,
    1 - (cacheAgeHours * config.cache.decayPerHour)
  );

  if (cacheAgeHours > config.cache.maxAgeHours * 0.5) {
    warnings.push({
      code: 'STALE_CACHE',
      message: `Cache is ${Math.round(cacheAgeHours)}h old`,
      impact: 0.1
    });
  }

  // Context match
  let contextMatch = 1.0;
  if (!requirementsMatch) {
    contextMatch -= 0.3;
    warnings.push({
      code: 'CONTEXT_MISMATCH',
      message: 'Requirements have changed since caching',
      impact: 0.15
    });
  }
  if (!dependenciesUnchanged) {
    contextMatch -= 0.2;
    warnings.push({
      code: 'UNVERIFIED_DEPENDENCY',
      message: 'Dependencies changed since caching',
      impact: 0.1
    });
  }

  // Coverage (cached = full coverage of that file)
  const coverage = 1.0;

  // Historical accuracy (assume 0.9 baseline)
  const historicalAccuracy = 0.9;

  const factors: ConfidenceFactors = {
    methodBase,
    freshness,
    contextMatch,
    coverage,
    historicalAccuracy
  };

  // Calculate weighted score (weights sum to 1.0)
  // methodBase is factored into the overall calculation proportionally
  const score =
    methodBase * 0.15 +
    freshness * 0.20 +
    contextMatch * 0.25 +
    coverage * 0.25 +
    historicalAccuracy * 0.15;

  // Apply warning impacts
  const totalImpact = warnings.reduce((sum, w) => sum + w.impact, 0);
  const finalScore = Math.max(0, Math.min(1, score - totalImpact));

  return {
    score: Math.round(finalScore * 100) / 100,
    level: getConfidenceLevel(finalScore),
    factors,
    warnings,
    calculatedAt: new Date().toISOString()
  };
}

/**
 * Calculate confidence for a chunked result
 */
export function calculateChunkConfidence(
  dependencyCoverage: number,
  hasBoundaryRisks: boolean,
  crossChunkCalls: number,
  config: ConfidenceConfig = DEFAULT_CONFIDENCE_CONFIG
): ConfidenceScore {
  const warnings: ConfidenceWarning[] = [];

  // Base confidence from method (chunked = 0.8 base)
  const methodBase = 0.8;

  // Freshness (chunks are current)
  const freshness = 1.0;

  // Context match based on dependency coverage
  let contextMatch = dependencyCoverage;
  if (dependencyCoverage < config.chunk.minDependencyCoverage) {
    warnings.push({
      code: 'UNVERIFIED_DEPENDENCY',
      message: `Only ${Math.round(dependencyCoverage * 100)}% of dependencies in chunk`,
      impact: config.chunk.boundaryPenalty
    });
  }

  // Coverage penalty for boundary risks
  let coverage = 1.0;
  if (hasBoundaryRisks) {
    coverage -= config.chunk.boundaryPenalty;
    warnings.push({
      code: 'CHUNK_BOUNDARY',
      message: 'Potential issues at chunk boundaries',
      impact: 0.1
    });
  }

  if (crossChunkCalls > 0) {
    const penalty = Math.min(0.2, crossChunkCalls * 0.05);
    coverage -= penalty;
    warnings.push({
      code: 'CROSS_FILE_RISK',
      message: `${crossChunkCalls} cross-chunk function calls`,
      impact: penalty
    });
  }

  const historicalAccuracy = 0.85;

  const factors: ConfidenceFactors = {
    methodBase,
    freshness,
    contextMatch,
    coverage,
    historicalAccuracy
  };

  // Weights sum to 1.0 for proper score calculation
  const score =
    methodBase * 0.15 +
    freshness * 0.20 +
    contextMatch * 0.25 +
    coverage * 0.25 +
    historicalAccuracy * 0.15;

  const totalImpact = warnings.reduce((sum, w) => sum + w.impact, 0);
  const finalScore = Math.max(0, Math.min(1, score - totalImpact));

  return {
    score: Math.round(finalScore * 100) / 100,
    level: getConfidenceLevel(finalScore),
    factors,
    warnings,
    calculatedAt: new Date().toISOString()
  };
}

/**
 * Calculate confidence for tiered verification result
 */
export function calculateTierConfidence(
  completedTier: VerificationTier,
  skippedTiers: VerificationTier[],
  config: ConfidenceConfig = DEFAULT_CONFIDENCE_CONFIG
): ConfidenceScore {
  const warnings: ConfidenceWarning[] = [];

  // Base confidence from tier level
  const tierWeights: Record<VerificationTier, number> = {
    screen: config.tier.screenWeight,
    focused: config.tier.focusedWeight,
    exhaustive: config.tier.exhaustiveWeight
  };

  const methodBase = tierWeights[completedTier];

  // Full freshness for tier results
  const freshness = 1.0;

  // Context match (tier results are context-aware)
  const contextMatch = 0.95;

  // Coverage based on tier
  let coverage = methodBase;

  // Penalty for skipped tiers
  if (skippedTiers.length > 0) {
    const penalty = skippedTiers.length * config.tier.skippedPenalty;
    coverage -= penalty;
    warnings.push({
      code: 'INCOMPLETE_TIER',
      message: `Skipped tiers: ${skippedTiers.join(', ')}`,
      impact: penalty
    });
  }

  const historicalAccuracy = 0.9;

  const factors: ConfidenceFactors = {
    methodBase,
    freshness,
    contextMatch,
    coverage,
    historicalAccuracy
  };

  // Weights sum to 1.0 for proper score calculation
  const score =
    methodBase * 0.20 +
    freshness * 0.15 +
    contextMatch * 0.25 +
    coverage * 0.25 +
    historicalAccuracy * 0.15;

  const totalImpact = warnings.reduce((sum, w) => sum + w.impact, 0);
  const finalScore = Math.max(0, Math.min(1, score - totalImpact));

  return {
    score: Math.round(finalScore * 100) / 100,
    level: getConfidenceLevel(finalScore),
    factors,
    warnings,
    calculatedAt: new Date().toISOString()
  };
}

/**
 * Calculate confidence for full verification (baseline)
 */
export function calculateFullVerificationConfidence(): ConfidenceScore {
  return {
    score: 1.0,
    level: 'HIGH',
    factors: {
      methodBase: 1.0,
      freshness: 1.0,
      contextMatch: 1.0,
      coverage: 1.0,
      historicalAccuracy: 0.95
    },
    warnings: [],
    calculatedAt: new Date().toISOString()
  };
}

/**
 * Aggregate confidence scores for a session
 */
export function aggregateSessionConfidence(
  sessionId: string,
  fileConfidences: FileConfidence[],
  config: ConfidenceConfig = DEFAULT_CONFIDENCE_CONFIG
): SessionConfidence {
  // Calculate overall score
  const totalScore = fileConfidences.reduce((sum, f) => sum + f.confidence.score, 0);
  const averageScore = fileConfidences.length > 0
    ? totalScore / fileConfidences.length
    : 0;

  // Collect all warnings
  const allWarnings = fileConfidences.flatMap(f => f.confidence.warnings);

  // Calculate by category (simplified - assign based on file patterns)
  const categoryConfidence: Record<IssueCategory, number> = {
    SECURITY: averageScore,
    CORRECTNESS: averageScore,
    RELIABILITY: averageScore,
    MAINTAINABILITY: averageScore,
    PERFORMANCE: averageScore
  };

  // Find lowest confidence files
  const sortedFiles = [...fileConfidences].sort((a, b) =>
    a.confidence.score - b.confidence.score
  );
  const lowestFiles = sortedFiles.slice(0, 5);

  // Generate recommendations
  const recommendations: ConfidenceRecommendation[] = [];

  // Check for stale caches
  const staleCaches = fileConfidences.filter(f =>
    f.confidence.warnings.some(w => w.code === 'STALE_CACHE')
  );
  if (staleCaches.length > 0) {
    recommendations.push({
      priority: 'HIGH',
      action: 'RE_VERIFY_STALE',
      description: `Re-verify ${staleCaches.length} files with stale cache`,
      estimatedGain: 0.1,
      targetFiles: staleCaches.map(f => f.file)
    });
  }

  // Check for boundary risks
  const boundaryRisks = fileConfidences.filter(f =>
    f.confidence.warnings.some(w => w.code === 'CHUNK_BOUNDARY')
  );
  if (boundaryRisks.length > 0) {
    recommendations.push({
      priority: 'MEDIUM',
      action: 'VERIFY_BOUNDARIES',
      description: `Verify ${boundaryRisks.length} files with chunk boundary risks`,
      estimatedGain: 0.08,
      targetFiles: boundaryRisks.map(f => f.file)
    });
  }

  // Check for incomplete tiers
  const incompleteTiers = fileConfidences.filter(f =>
    f.confidence.warnings.some(w => w.code === 'INCOMPLETE_TIER')
  );
  if (incompleteTiers.length > 0) {
    recommendations.push({
      priority: 'MEDIUM',
      action: 'COMPLETE_TIERS',
      description: `Complete skipped tiers for ${incompleteTiers.length} files`,
      estimatedGain: 0.15,
      targetFiles: incompleteTiers.map(f => f.file)
    });
  }

  // General recommendation if overall is low
  if (averageScore < config.minimumAcceptable) {
    recommendations.push({
      priority: 'HIGH',
      action: 'FULL_VERIFICATION',
      description: 'Overall confidence below threshold - consider full verification',
      estimatedGain: 1.0 - averageScore
    });
  }

  const overall: ConfidenceScore = {
    score: Math.round(averageScore * 100) / 100,
    level: getConfidenceLevel(averageScore),
    factors: {
      methodBase: fileConfidences.reduce((s, f) => s + f.confidence.factors.methodBase, 0) / Math.max(1, fileConfidences.length),
      freshness: fileConfidences.reduce((s, f) => s + f.confidence.factors.freshness, 0) / Math.max(1, fileConfidences.length),
      contextMatch: fileConfidences.reduce((s, f) => s + f.confidence.factors.contextMatch, 0) / Math.max(1, fileConfidences.length),
      coverage: fileConfidences.reduce((s, f) => s + f.confidence.factors.coverage, 0) / Math.max(1, fileConfidences.length),
      historicalAccuracy: fileConfidences.reduce((s, f) => s + f.confidence.factors.historicalAccuracy, 0) / Math.max(1, fileConfidences.length)
    },
    warnings: allWarnings,
    calculatedAt: new Date().toISOString()
  };

  return {
    sessionId,
    overall,
    byFile: fileConfidences,
    byCategory: categoryConfidence,
    lowestFiles,
    recommendations
  };
}

/**
 * Generate confidence summary for LLM
 */
export function generateConfidenceSummary(session: SessionConfidence): string {
  const { overall, lowestFiles, recommendations } = session;

  let summary = `## Verification Confidence Report

**Overall Confidence**: ${Math.round(overall.score * 100)}% (${overall.level})

### Factor Breakdown
- Method Base: ${Math.round(overall.factors.methodBase * 100)}%
- Freshness: ${Math.round(overall.factors.freshness * 100)}%
- Context Match: ${Math.round(overall.factors.contextMatch * 100)}%
- Coverage: ${Math.round(overall.factors.coverage * 100)}%
- Historical Accuracy: ${Math.round(overall.factors.historicalAccuracy * 100)}%
`;

  if (overall.warnings.length > 0) {
    summary += `\n### Warnings (${overall.warnings.length})\n`;
    const uniqueWarnings = [...new Set(overall.warnings.map(w => w.code))];
    for (const code of uniqueWarnings) {
      const count = overall.warnings.filter(w => w.code === code).length;
      summary += `- ${code}: ${count} occurrence(s)\n`;
    }
  }

  if (lowestFiles.length > 0) {
    summary += `\n### Lowest Confidence Files\n`;
    for (const file of lowestFiles.slice(0, 3)) {
      summary += `- ${file.file}: ${Math.round(file.confidence.score * 100)}% (${file.source})\n`;
    }
  }

  if (recommendations.length > 0) {
    summary += `\n### Recommendations\n`;
    for (const rec of recommendations.slice(0, 3)) {
      summary += `- [${rec.priority}] ${rec.description} (+${Math.round(rec.estimatedGain * 100)}%)\n`;
    }
  }

  return summary;
}
