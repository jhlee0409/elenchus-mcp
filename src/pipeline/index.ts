/**
 * Tiered Pipeline Module
 * [ENH: TIERED] Main entry point for multi-tier verification pipeline
 */

export * from './types.js';
export * from './prompts.js';

import { FileContext, Issue } from '../types/index.js';
import {
  VerificationTier,
  TierConfig,
  TierResult,
  PipelineState,
  PipelineConfig,
  EscalationRule,
  DEFAULT_PIPELINE_CONFIG,
  DEFAULT_TIER_CONFIGS
} from './types.js';
import {
  getTierVerifierPrompt,
  getTierCriticPrompt,
  getTierTransitionPrompt
} from './prompts.js';

// In-memory pipeline states
const pipelineStates = new Map<string, PipelineState>();

/**
 * Initialize pipeline for a session
 */
export function initializePipeline(
  sessionId: string,
  config: PipelineConfig = DEFAULT_PIPELINE_CONFIG
): PipelineState {
  const state: PipelineState = {
    currentTier: config.startTier,
    completedTiers: [],
    tierResults: [],
    totalTokensUsed: 0,
    totalTimeMs: 0,
    escalations: []
  };

  pipelineStates.set(sessionId, state);
  return state;
}

/**
 * Get current pipeline state
 */
export function getPipelineState(sessionId: string): PipelineState | null {
  return pipelineStates.get(sessionId) || null;
}

/**
 * Get prompt for current tier
 */
export function getCurrentTierPrompt(
  sessionId: string,
  role: 'verifier' | 'critic',
  config: PipelineConfig = DEFAULT_PIPELINE_CONFIG
): {
  systemPrompt: string;
  outputTemplate: string;
  wordLimit: number;
  tier: VerificationTier;
  tierConfig: TierConfig;
} | null {
  const state = pipelineStates.get(sessionId);
  if (!state) return null;

  const tierConfig = config.tierConfigs[state.currentTier];
  const prompt = role === 'verifier'
    ? getTierVerifierPrompt(tierConfig)
    : getTierCriticPrompt(tierConfig);

  return {
    ...prompt,
    tier: state.currentTier,
    tierConfig
  };
}

/**
 * Record tier completion and check for escalation
 */
export function completeTier(
  sessionId: string,
  result: Omit<TierResult, 'shouldEscalate' | 'escalationReason' | 'escalationScope'>,
  issues: Issue[],
  config: PipelineConfig = DEFAULT_PIPELINE_CONFIG
): {
  tierResult: TierResult;
  shouldEscalate: boolean;
  nextTier?: VerificationTier;
  escalationReason?: string;
  escalationScope?: string[];
} {
  const state = pipelineStates.get(sessionId);
  if (!state) {
    return {
      tierResult: { ...result, shouldEscalate: false },
      shouldEscalate: false
    };
  }

  // Check escalation rules
  let shouldEscalate = false;
  let nextTier: VerificationTier | undefined;
  let escalationReason: string | undefined;
  let escalationScope: string[] = [];

  if (config.autoEscalate && state.currentTier !== 'exhaustive') {
    for (const rule of config.escalationRules) {
      const escalation = checkEscalationRule(rule, result, issues, state.currentTier);
      if (escalation.shouldEscalate) {
        shouldEscalate = true;
        nextTier = escalation.targetTier;
        escalationReason = escalation.reason;
        escalationScope = escalation.scope;
        break;
      }
    }
  }

  // Record tier result
  const tierResult: TierResult = {
    ...result,
    shouldEscalate,
    escalationReason,
    escalationScope: escalationScope.length > 0 ? escalationScope : undefined
  };

  state.tierResults.push(tierResult);
  state.completedTiers.push(state.currentTier);
  state.totalTokensUsed += result.tokensUsed;
  state.totalTimeMs += result.timeMs;

  // [ENH: TOKEN-OPT] Token budget check - soft guideline by default
  const budgetUsage = state.totalTokensUsed / config.maxTotalTokens;

  if (budgetUsage >= 1.0) {
    state.tokenBudgetExceeded = true;
    // Only block escalation if enforceTokenBudget=true AND qualityFirst=false
    if (config.enforceTokenBudget && !config.qualityFirst) {
      state.tokenBudgetWarning = `Token budget exceeded: ${state.totalTokensUsed}/${config.maxTotalTokens}. Escalation blocked.`;
      shouldEscalate = false;
      nextTier = undefined;
      escalationReason = state.tokenBudgetWarning;
    } else {
      // Soft warning only - quality takes precedence
      state.tokenBudgetWarning = `Token budget exceeded: ${state.totalTokensUsed}/${config.maxTotalTokens} (${Math.round(budgetUsage * 100)}%). Continuing for quality.`;
    }
  } else if (budgetUsage >= 0.8) {
    // Warning at 80% usage (always shown)
    state.tokenBudgetWarning = `Token budget warning: ${state.totalTokensUsed}/${config.maxTotalTokens} (${Math.round(budgetUsage * 100)}% used)`;
  }

  // Record escalation
  if (shouldEscalate && nextTier) {
    state.escalations.push({
      fromTier: state.currentTier,
      toTier: nextTier,
      reason: escalationReason || 'Unknown',
      files: escalationScope
    });
    state.currentTier = nextTier;
  }

  return {
    tierResult,
    shouldEscalate,
    nextTier,
    escalationReason,
    escalationScope
  };
}

/**
 * Check if an escalation rule is triggered
 */
function checkEscalationRule(
  rule: EscalationRule,
  result: Omit<TierResult, 'shouldEscalate' | 'escalationReason' | 'escalationScope'>,
  issues: Issue[],
  currentTier: VerificationTier
): {
  shouldEscalate: boolean;
  targetTier: VerificationTier;
  reason: string;
  scope: string[];
} {
  // Only escalate to higher tiers
  const tierOrder: VerificationTier[] = ['screen', 'focused', 'exhaustive'];
  const currentIndex = tierOrder.indexOf(currentTier);
  const targetIndex = tierOrder.indexOf(rule.targetTier);

  if (targetIndex <= currentIndex) {
    return { shouldEscalate: false, targetTier: rule.targetTier, reason: '', scope: [] };
  }

  switch (rule.condition) {
    case 'critical_found':
      if (result.criticalIssues >= (rule.threshold || 1)) {
        const affectedFiles = issues
          .filter(i => i.severity === 'CRITICAL')
          .map(i => i.location.split(':')[0]);
        return {
          shouldEscalate: true,
          targetTier: rule.targetTier,
          reason: `${result.criticalIssues} CRITICAL issue(s) found`,
          scope: rule.scope === 'affected' ? [...new Set(affectedFiles)] : []
        };
      }
      break;

    case 'issues_found':
      if (result.issuesFound >= (rule.threshold || 1)) {
        const affectedFiles = issues.map(i => i.location.split(':')[0]);
        return {
          shouldEscalate: true,
          targetTier: rule.targetTier,
          reason: `${result.issuesFound} issue(s) found (threshold: ${rule.threshold})`,
          scope: rule.scope === 'affected' ? [...new Set(affectedFiles)] : []
        };
      }
      break;

    case 'high_risk_file':
      // This would need file context to check
      break;

    case 'manual':
      // Manual escalation - always allow
      return {
        shouldEscalate: true,
        targetTier: rule.targetTier,
        reason: 'Manual escalation requested',
        scope: []
      };
  }

  return { shouldEscalate: false, targetTier: rule.targetTier, reason: '', scope: [] };
}

/**
 * Manually escalate to a specific tier
 */
export function escalateTier(
  sessionId: string,
  targetTier: VerificationTier,
  reason: string,
  scope: string[] = []
): boolean {
  const state = pipelineStates.get(sessionId);
  if (!state) return false;

  const tierOrder: VerificationTier[] = ['screen', 'focused', 'exhaustive'];
  const currentIndex = tierOrder.indexOf(state.currentTier);
  const targetIndex = tierOrder.indexOf(targetTier);

  if (targetIndex <= currentIndex) return false;

  state.escalations.push({
    fromTier: state.currentTier,
    toTier: targetTier,
    reason,
    files: scope
  });
  state.currentTier = targetTier;

  return true;
}

/**
 * Get files to verify for current tier
 */
export function getFilesForTier(
  files: Map<string, FileContext>,
  tier: VerificationTier,
  config: PipelineConfig = DEFAULT_PIPELINE_CONFIG,
  escalationScope: string[] = []
): string[] {
  const tierConfig = config.tierConfigs[tier];

  // If there's an escalation scope, only include those files
  if (escalationScope.length > 0) {
    return escalationScope.filter(f => files.has(f));
  }

  // Otherwise, select files based on tier config
  const allFiles = Array.from(files.keys());

  // Check for exhaustive patterns
  const exhaustiveFiles = allFiles.filter(f =>
    config.exhaustivePatterns.some(pattern => {
      const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
      return regex.test(f);
    })
  );

  // For screen tier, prioritize smaller/critical files
  if (tier === 'screen') {
    // Sort by file size (smaller first) and take limit
    return allFiles
      .filter(f => !exhaustiveFiles.includes(f))
      .slice(0, tierConfig.maxFilesPerCategory);
  }

  // For focused, include files with issues + dependencies
  if (tier === 'focused') {
    return allFiles.slice(0, tierConfig.maxFilesPerCategory);
  }

  // For exhaustive, include all
  return allFiles;
}

/**
 * Generate pipeline summary
 */
export function generatePipelineSummary(sessionId: string): string | null {
  const state = pipelineStates.get(sessionId);
  if (!state) return null;

  const tierNames: Record<VerificationTier, string> = {
    screen: 'Quick Screen',
    focused: 'Focused Review',
    exhaustive: 'Exhaustive Analysis'
  };

  let summary = `## Pipeline Summary

**Current Tier**: ${tierNames[state.currentTier]}
**Completed Tiers**: ${state.completedTiers.map(t => tierNames[t]).join(' → ') || 'None'}
**Total Tokens Used**: ${state.totalTokensUsed}
**Total Time**: ${state.totalTimeMs}ms

### Tier Results
`;

  for (const result of state.tierResults) {
    summary += `
#### ${tierNames[result.tier]}
- Files Verified: ${result.filesVerified}
- Issues Found: ${result.issuesFound}
- Critical: ${result.criticalIssues}, High: ${result.highIssues}
- Tokens Used: ${result.tokensUsed}
${result.shouldEscalate ? `- **Escalated**: ${result.escalationReason}` : ''}
`;
  }

  if (state.escalations.length > 0) {
    summary += '\n### Escalation History\n';
    for (const esc of state.escalations) {
      summary += `- ${tierNames[esc.fromTier]} → ${tierNames[esc.toTier]}: ${esc.reason}\n`;
    }
  }

  return summary;
}

/**
 * Clean up pipeline state
 */
export function deletePipelineState(sessionId: string): void {
  pipelineStates.delete(sessionId);
}
