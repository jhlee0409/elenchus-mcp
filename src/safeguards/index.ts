/**
 * Quality Safeguards Module
 * [ENH: SAFEGUARDS] Ensures verification quality when using optimizations
 */

export * from './types.js';

import {
  SafeguardsState,
  QualityAssessment,
  QualityConcern,
  QualityAction,
  PeriodicVerificationConfig,
  ConfidenceConfig,
  SamplingConfig,
  FileConfidence,
  DEFAULT_PERIODIC_CONFIG,
  DEFAULT_CONFIDENCE_CONFIG,
  DEFAULT_SAMPLING_CONFIG
} from './types.js';

import {
  initializePeriodicTracker,
  getPeriodicTracker,
  recordIncremental,
  recordFullVerification,
  shouldForceFullVerification,
  getPeriodicStatus,
  generatePeriodicSummary
} from './periodic.js';

import {
  calculateCacheConfidence,
  calculateChunkConfidence,
  calculateTierConfidence,
  calculateFullVerificationConfidence,
  aggregateSessionConfidence,
  generateConfidenceSummary
} from './confidence.js';

import {
  initializeSamplingTracker,
  selectFilesForSampling,
  recordSamplingResult,
  getSamplingStats,
  getHighRiskSkipped,
  generateSamplingSummary,
  shouldRecommendFullVerification
} from './sampling.js';

// Re-export functions
export {
  // Periodic
  initializePeriodicTracker,
  getPeriodicTracker,
  recordIncremental,
  recordFullVerification,
  shouldForceFullVerification,
  getPeriodicStatus,
  generatePeriodicSummary,
  // Confidence
  calculateCacheConfidence,
  calculateChunkConfidence,
  calculateTierConfidence,
  calculateFullVerificationConfidence,
  aggregateSessionConfidence,
  generateConfidenceSummary,
  // Sampling
  initializeSamplingTracker,
  selectFilesForSampling,
  recordSamplingResult,
  getSamplingStats,
  getHighRiskSkipped,
  generateSamplingSummary,
  shouldRecommendFullVerification
};

// In-memory safeguards state per session
const safeguardsStates = new Map<string, SafeguardsState>();

/**
 * Initialize safeguards for a session
 */
export function initializeSafeguards(
  sessionId: string,
  projectId: string,
  config?: {
    periodic?: Partial<PeriodicVerificationConfig>;
    confidence?: Partial<ConfidenceConfig>;
    sampling?: Partial<SamplingConfig>;
  }
): SafeguardsState {
  const periodicConfig: PeriodicVerificationConfig = {
    ...DEFAULT_PERIODIC_CONFIG,
    ...config?.periodic
  };

  const confidenceConfig: ConfidenceConfig = {
    ...DEFAULT_CONFIDENCE_CONFIG,
    ...config?.confidence
  };

  const samplingConfig: SamplingConfig = {
    ...DEFAULT_SAMPLING_CONFIG,
    ...config?.sampling
  };

  // Initialize trackers
  const periodicTracker = getPeriodicTracker(projectId);
  const samplingTracker = initializeSamplingTracker();

  const state: SafeguardsState = {
    sessionId,
    periodic: {
      config: periodicConfig,
      tracker: periodicTracker,
      lastDecision: null
    },
    confidence: {
      config: confidenceConfig,
      session: null
    },
    sampling: {
      config: samplingConfig,
      tracker: samplingTracker
    },
    quality: {
      score: 1.0,
      level: 'EXCELLENT',
      metrics: {
        coverage: 1.0,
        confidence: 1.0,
        samplingProductivity: 0,
        incrementalDrift: 0
      },
      concerns: [],
      actions: []
    }
  };

  safeguardsStates.set(sessionId, state);
  return state;
}

/**
 * Get safeguards state for a session
 */
export function getSafeguardsState(sessionId: string): SafeguardsState | null {
  return safeguardsStates.get(sessionId) || null;
}

/**
 * Update quality assessment based on current state
 */
export function updateQualityAssessment(
  sessionId: string,
  fileConfidences: FileConfidence[]
): QualityAssessment {
  const state = safeguardsStates.get(sessionId);
  if (!state) {
    return {
      score: 0,
      level: 'UNACCEPTABLE',
      metrics: { coverage: 0, confidence: 0, samplingProductivity: 0, incrementalDrift: 0 },
      concerns: [{ severity: 'ERROR', code: 'NO_STATE', message: 'Session not initialized' }],
      actions: []
    };
  }

  const concerns: QualityConcern[] = [];
  const actions: QualityAction[] = [];

  // Aggregate session confidence
  const sessionConfidence = aggregateSessionConfidence(
    sessionId,
    fileConfidences,
    state.confidence.config
  );
  state.confidence.session = sessionConfidence;

  // Get periodic status
  const periodicStatus = getPeriodicStatus(
    sessionId,
    state.periodic.config
  );

  // Get sampling stats (with null check)
  const samplingStats = state.sampling.tracker
    ? getSamplingStats(state.sampling.tracker)
    : { totalInScope: 0, eligible: 0, sampled: 0, effectiveRate: 0, productive: 0, productivityRate: 0, estimatedMissed: 0 };

  // Calculate metrics
  const metrics = {
    coverage: sessionConfidence.overall.factors.coverage,
    confidence: sessionConfidence.overall.score,
    samplingProductivity: samplingStats.productivityRate / 100,
    incrementalDrift: periodicStatus.incrementalCount / state.periodic.config.incrementalThreshold
  };

  // Check for concerns
  if (metrics.confidence < state.confidence.config.minimumAcceptable) {
    concerns.push({
      severity: 'WARNING',
      code: 'LOW_CONFIDENCE',
      message: `Overall confidence ${Math.round(metrics.confidence * 100)}% below threshold ${Math.round(state.confidence.config.minimumAcceptable * 100)}%`
    });
    actions.push({
      priority: 1,
      action: 'FULL_VERIFICATION',
      description: 'Run full verification to improve confidence',
      impact: 1.0 - metrics.confidence
    });
  }

  if (periodicStatus.status === 'OVERDUE') {
    concerns.push({
      severity: 'WARNING',
      code: 'PERIODIC_OVERDUE',
      message: `${periodicStatus.incrementalCount} incremental verifications since last full scan`
    });
    actions.push({
      priority: 2,
      action: 'PERIODIC_FULL',
      description: 'Run periodic full verification',
      impact: 0.2
    });
  }

  if (samplingStats.estimatedMissed > 3) {
    concerns.push({
      severity: 'WARNING',
      code: 'ESTIMATED_MISSED',
      message: `Sampling estimates ${samplingStats.estimatedMissed} issues may be missed`
    });
    actions.push({
      priority: 3,
      action: 'VERIFY_SKIPPED',
      description: 'Verify high-risk skipped files',
      impact: 0.15
    });
  }

  // Check high-risk skipped files
  const highRisk = state.sampling.tracker
    ? getHighRiskSkipped(state.sampling.tracker, 0.7)
    : [];
  if (highRisk.length > 5) {
    concerns.push({
      severity: 'WARNING',
      code: 'HIGH_RISK_SKIPPED',
      message: `${highRisk.length} high-risk files were not verified`,
      files: highRisk.slice(0, 5).map(f => f.path)
    });
  }

  // Calculate overall score
  const score =
    metrics.confidence * 0.4 +
    metrics.coverage * 0.3 +
    (1 - metrics.incrementalDrift) * 0.2 +
    (1 - samplingStats.productivityRate / 100) * 0.1;

  // Determine level
  let level: 'EXCELLENT' | 'GOOD' | 'ACCEPTABLE' | 'POOR' | 'UNACCEPTABLE';
  if (score >= 0.9) level = 'EXCELLENT';
  else if (score >= 0.8) level = 'GOOD';
  else if (score >= 0.7) level = 'ACCEPTABLE';
  else if (score >= 0.5) level = 'POOR';
  else level = 'UNACCEPTABLE';

  const assessment: QualityAssessment = {
    score: Math.round(score * 100) / 100,
    level,
    metrics,
    concerns,
    actions: actions.sort((a, b) => a.priority - b.priority)
  };

  state.quality = assessment;
  return assessment;
}

/**
 * Generate complete safeguards summary
 */
export function generateSafeguardsSummary(sessionId: string): string {
  const state = safeguardsStates.get(sessionId);
  if (!state) return '## Safeguards: Not Initialized';

  let summary = `## Quality Safeguards Summary

**Quality Score**: ${Math.round(state.quality.score * 100)}% (${state.quality.level})

### Metrics
- Verification Coverage: ${Math.round(state.quality.metrics.coverage * 100)}%
- Overall Confidence: ${Math.round(state.quality.metrics.confidence * 100)}%
- Incremental Drift: ${Math.round(state.quality.metrics.incrementalDrift * 100)}%
- Sampling Productivity: ${Math.round(state.quality.metrics.samplingProductivity * 100)}%
`;

  if (state.quality.concerns.length > 0) {
    summary += '\n### Concerns\n';
    for (const concern of state.quality.concerns) {
      summary += `- [${concern.severity}] ${concern.message}\n`;
    }
  }

  if (state.quality.actions.length > 0) {
    summary += '\n### Recommended Actions\n';
    for (const action of state.quality.actions.slice(0, 3)) {
      summary += `${action.priority}. ${action.description} (impact: +${Math.round(action.impact * 100)}%)\n`;
    }
  }

  return summary;
}

/**
 * Should session be allowed to converge?
 */
export function shouldAllowConvergence(
  sessionId: string,
  strictMode: boolean = false
): { allow: boolean; blockers: string[] } {
  const state = safeguardsStates.get(sessionId);
  if (!state) return { allow: true, blockers: [] };

  const blockers: string[] = [];

  if (strictMode) {
    // Strict mode: block on any concern
    if (state.quality.level === 'POOR' || state.quality.level === 'UNACCEPTABLE') {
      blockers.push(`Quality level ${state.quality.level} is too low`);
    }

    if (state.quality.metrics.confidence < state.confidence.config.minimumAcceptable) {
      blockers.push(`Confidence ${Math.round(state.quality.metrics.confidence * 100)}% below threshold`);
    }
  } else {
    // Normal mode: block only on critical issues
    if (state.quality.level === 'UNACCEPTABLE') {
      blockers.push(`Quality level UNACCEPTABLE`);
    }

    // Check for critical concerns
    const criticalConcerns = state.quality.concerns.filter(c => c.severity === 'ERROR');
    for (const concern of criticalConcerns) {
      blockers.push(concern.message);
    }
  }

  return { allow: blockers.length === 0, blockers };
}

/**
 * Clean up safeguards state
 */
export function deleteSafeguardsState(sessionId: string): void {
  safeguardsStates.delete(sessionId);
}
