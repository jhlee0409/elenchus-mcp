/**
 * Random Sampling
 * [ENH: SAFEGUARDS] Samples skipped files for verification quality assurance
 */

import {
  SamplingConfig,
  SamplingTracker,
  SampledFile,
  SkippedFile,
  SamplingReason,
  SkipReason,
  SamplingResult,
  SamplingStats,
  DEFAULT_SAMPLING_CONFIG
} from './types.js';
import { Issue, Severity, FileContext } from '../types/index.js';

// Seeded random for reproducibility
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }
}

/**
 * Initialize sampling tracker
 */
export function initializeSamplingTracker(seed?: number): SamplingTracker {
  return {
    sampledFiles: [],
    skippedFiles: [],
    stats: {
      totalInScope: 0,
      eligible: 0,
      sampled: 0,
      effectiveRate: 0,
      productive: 0,
      productivityRate: 0,
      estimatedMissed: 0
    },
    seed: seed ?? Date.now()
  };
}

/**
 * Calculate file risk score for weighted sampling
 */
function calculateFileRisk(
  file: string,
  context?: FileContext,
  historicalIssues: number = 0
): number {
  let risk = 0.5; // Base risk

  // Higher risk for security-related paths
  if (/auth|security|payment|crypto|secret/i.test(file)) {
    risk += 0.3;
  }

  // Higher risk for entry points
  if (/index|main|app|server/i.test(file)) {
    risk += 0.1;
  }

  // Higher risk for files with historical issues
  risk += Math.min(0.3, historicalIssues * 0.1);

  // Higher risk for files with many dependencies
  if (context?.dependencies && context.dependencies.length > 5) {
    risk += 0.1;
  }

  return Math.min(1.0, risk);
}

/**
 * Select files for sampling from skipped files
 */
export function selectFilesForSampling(
  skippedFiles: Array<{ path: string; reason: SkipReason; context?: FileContext }>,
  config: SamplingConfig = DEFAULT_SAMPLING_CONFIG,
  historicalIssues: Map<string, number> = new Map(),
  seed?: number
): { sampled: SampledFile[]; skipped: SkippedFile[] } {
  if (!config.enabled || skippedFiles.length === 0) {
    return {
      sampled: [],
      skipped: skippedFiles.map(f => ({
        path: f.path,
        reason: f.reason,
        risk: calculateFileRisk(f.path, f.context, historicalIssues.get(f.path))
      }))
    };
  }

  const rng = new SeededRandom(seed ?? Date.now());
  const sampled: SampledFile[] = [];
  const skipped: SkippedFile[] = [];

  // Filter out never-sample patterns
  const eligible = skippedFiles.filter(f => {
    for (const pattern of config.neverSamplePatterns) {
      const regex = new RegExp(
        pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')
      );
      if (regex.test(f.path)) return false;
    }
    return true;
  });

  // Calculate weights for each file
  const weighted = eligible.map(f => {
    let weight = 1.0;
    const historical = historicalIssues.get(f.path) || 0;

    // Apply strategy-specific weights
    switch (config.strategy) {
      case 'RISK_WEIGHTED':
        weight = calculateFileRisk(f.path, f.context, historical);
        break;
      case 'CHANGE_WEIGHTED':
        // Recently changed files (not in our data, use base weight)
        weight = 1.0;
        break;
      case 'DEPENDENCY_WEIGHTED':
        weight = f.context?.dependencies
          ? Math.min(2.0, 1 + f.context.dependencies.length * 0.1)
          : 1.0;
        break;
      case 'UNIFORM':
      default:
        weight = 1.0;
    }

    // Apply historical boost
    if (historical > 0) {
      weight *= config.historicalBoost;
    }

    return { file: f, weight, risk: calculateFileRisk(f.path, f.context, historical) };
  });

  // Always-sample patterns
  for (const pattern of config.alwaysSamplePatterns) {
    const regex = new RegExp(
      pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')
    );
    for (const item of weighted) {
      if (regex.test(item.file.path) && !sampled.find(s => s.path === item.file.path)) {
        sampled.push({
          path: item.file.path,
          reason: 'PATTERN_MATCH',
          weight: item.weight
        });
      }
    }
  }

  // Calculate target sample size
  const baseTarget = Math.ceil(eligible.length * (config.rate / 100));
  const targetSize = Math.max(
    config.minSamples,
    Math.min(config.maxSamples, baseTarget)
  );

  // Sample remaining files
  const remaining = weighted.filter(w =>
    !sampled.find(s => s.path === w.file.path)
  );

  // Weighted random selection
  while (sampled.length < targetSize && remaining.length > 0) {
    // Recalculate totalWeight each iteration to maintain correct probability distribution
    const totalWeight = remaining.reduce((sum, w) => sum + w.weight, 0);

    if (totalWeight <= 0) break; // Safety check

    const threshold = rng.next() * totalWeight;
    let cumulative = 0;
    let selectedIndex = -1;

    for (let i = 0; i < remaining.length; i++) {
      cumulative += remaining[i].weight;
      if (cumulative >= threshold) {
        selectedIndex = i;
        break;
      }
    }

    if (selectedIndex === -1) selectedIndex = remaining.length - 1;

    const selected = remaining[selectedIndex];
    sampled.push({
      path: selected.file.path,
      reason: getReason(selected, config),
      weight: selected.weight
    });

    remaining.splice(selectedIndex, 1);
  }

  // Mark remaining as skipped
  for (const item of remaining) {
    skipped.push({
      path: item.file.path,
      reason: item.file.reason,
      risk: item.risk
    });
  }

  // Also add excluded files to skipped
  for (const f of skippedFiles) {
    if (!sampled.find(s => s.path === f.path) && !skipped.find(s => s.path === f.path)) {
      skipped.push({
        path: f.path,
        reason: 'EXCLUDED',
        risk: calculateFileRisk(f.path, f.context, historicalIssues.get(f.path))
      });
    }
  }

  return { sampled, skipped };
}

/**
 * Determine sampling reason
 */
function getReason(
  item: { file: { path: string }; weight: number; risk: number },
  config: SamplingConfig
): SamplingReason {
  if (item.risk > 0.7) return 'HIGH_RISK';
  if (item.weight > 1.5) return 'HISTORICAL';
  if (config.strategy === 'DEPENDENCY_WEIGHTED' && item.weight > 1.2) return 'DEPENDENCY_HUB';
  return 'RANDOM';
}

/**
 * Record sampling result for a file
 */
export function recordSamplingResult(
  tracker: SamplingTracker,
  filePath: string,
  issues: Issue[]
): SamplingTracker {
  const sampledFile = tracker.sampledFiles.find(f => f.path === filePath);
  if (!sampledFile) return tracker;

  const severities = issues.map(i => i.severity);
  sampledFile.result = {
    issuesFound: issues.length,
    severities,
    productive: issues.length > 0,
    confidence: issues.length > 0 ? 0.9 : 0.95
  };

  // Update stats
  updateStats(tracker);

  return tracker;
}

/**
 * Update sampling statistics
 */
function updateStats(tracker: SamplingTracker): void {
  const stats = tracker.stats;

  stats.sampled = tracker.sampledFiles.length;
  stats.totalInScope = stats.sampled + tracker.skippedFiles.length;
  stats.eligible = stats.totalInScope -
    tracker.skippedFiles.filter(f => f.reason === 'EXCLUDED').length;

  stats.effectiveRate = stats.eligible > 0
    ? Math.round((stats.sampled / stats.eligible) * 100)
    : 0;

  const completed = tracker.sampledFiles.filter(f => f.result);
  stats.productive = completed.filter(f => f.result?.productive).length;
  stats.productivityRate = completed.length > 0
    ? Math.round((stats.productive / completed.length) * 100)
    : 0;

  // Estimate missed issues based on productivity rate
  if (stats.productivityRate > 0 && tracker.skippedFiles.length > 0) {
    const avgIssuesPerProductive = completed
      .filter(f => f.result?.productive)
      .reduce((sum, f) => sum + (f.result?.issuesFound || 0), 0) / Math.max(1, stats.productive);

    const estimatedProductiveInSkipped =
      tracker.skippedFiles.length * (stats.productivityRate / 100);

    stats.estimatedMissed = Math.round(estimatedProductiveInSkipped * avgIssuesPerProductive);
  } else {
    stats.estimatedMissed = 0;
  }
}

/**
 * Get sampling summary
 */
export function getSamplingStats(tracker: SamplingTracker): SamplingStats {
  updateStats(tracker);
  return tracker.stats;
}

/**
 * Get high-risk skipped files
 */
export function getHighRiskSkipped(
  tracker: SamplingTracker,
  threshold: number = 0.7
): SkippedFile[] {
  return tracker.skippedFiles.filter(f => f.risk >= threshold);
}

/**
 * Generate sampling summary for LLM
 */
export function generateSamplingSummary(tracker: SamplingTracker): string {
  const stats = getSamplingStats(tracker);

  let summary = `## Sampling Summary

**Files Sampled**: ${stats.sampled}/${stats.eligible} eligible (${stats.effectiveRate}% rate)
**Productive Samples**: ${stats.productive}/${stats.sampled} (${stats.productivityRate}% found issues)
**Estimated Missed Issues**: ${stats.estimatedMissed}
`;

  // High-risk skipped files
  const highRisk = getHighRiskSkipped(tracker);
  if (highRisk.length > 0) {
    summary += `\n### High-Risk Skipped Files (${highRisk.length})\n`;
    for (const file of highRisk.slice(0, 5)) {
      summary += `- ${file.path} (risk: ${Math.round(file.risk * 100)}%)\n`;
    }
    if (highRisk.length > 5) {
      summary += `... and ${highRisk.length - 5} more\n`;
    }
  }

  // Productive samples
  const productive = tracker.sampledFiles.filter(f => f.result?.productive);
  if (productive.length > 0) {
    summary += `\n### Issues Found in Samples\n`;
    for (const file of productive) {
      summary += `- ${file.path}: ${file.result?.issuesFound} issue(s) [${file.result?.severities.join(', ')}]\n`;
    }
  }

  // Recommendations
  if (stats.estimatedMissed > 0) {
    summary += `\n### Recommendation
Based on sampling productivity, approximately ${stats.estimatedMissed} issues may exist in skipped files.
Consider verifying high-risk skipped files for more comprehensive coverage.`;
  }

  return summary;
}

/**
 * Should recommend full verification based on sampling results?
 */
export function shouldRecommendFullVerification(
  tracker: SamplingTracker,
  threshold: number = 0.3
): { recommend: boolean; reason: string } {
  const stats = getSamplingStats(tracker);

  // High productivity rate suggests many issues in skipped files
  if (stats.productivityRate > threshold * 100) {
    return {
      recommend: true,
      reason: `${stats.productivityRate}% of samples found issues - high likelihood of missed issues`
    };
  }

  // Many high-risk files skipped
  const highRisk = getHighRiskSkipped(tracker);
  if (highRisk.length > tracker.skippedFiles.length * 0.3) {
    return {
      recommend: true,
      reason: `${highRisk.length} high-risk files were not verified`
    };
  }

  // High estimated missed issues
  if (stats.estimatedMissed > 5) {
    return {
      recommend: true,
      reason: `Estimated ${stats.estimatedMissed} missed issues based on sampling`
    };
  }

  return { recommend: false, reason: '' };
}
