/**
 * Tiered Pipeline Types
 * [ENH: TIERED] Types for multi-tier verification pipeline
 */

import { IssueCategory, Severity } from '../types/index.js';

/**
 * Verification tier levels
 */
export type VerificationTier = 'screen' | 'focused' | 'exhaustive';

/**
 * Tier configuration for each level
 */
export interface TierConfig {
  tier: VerificationTier;
  name: string;
  description: string;
  // Time/token budget multiplier (1.0 = baseline)
  budgetMultiplier: number;
  // Categories to check at this tier
  categories: IssueCategory[];
  // Minimum severity to report at this tier
  minSeverity: Severity;
  // Should include edge cases?
  includeEdgeCases: boolean;
  // Maximum files to check per category
  maxFilesPerCategory: number;
  // Should verify dependencies?
  checkDependencies: boolean;
  // Prompt style
  promptStyle: 'brief' | 'standard' | 'detailed';
}

/**
 * Tier escalation rules
 */
export interface EscalationRule {
  // Condition to escalate
  condition: 'issues_found' | 'critical_found' | 'high_risk_file' | 'manual';
  // Number of issues to trigger escalation
  threshold?: number;
  // Target tier to escalate to
  targetTier: VerificationTier;
  // Files/categories to escalate
  scope?: 'all' | 'affected' | 'category';
}

/**
 * Tier result
 */
export interface TierResult {
  tier: VerificationTier;
  filesVerified: number;
  issuesFound: number;
  criticalIssues: number;
  highIssues: number;
  tokensUsed: number;
  timeMs: number;
  shouldEscalate: boolean;
  escalationReason?: string;
  escalationScope?: string[];
}

/**
 * Pipeline state
 */
export interface PipelineState {
  currentTier: VerificationTier;
  completedTiers: VerificationTier[];
  tierResults: TierResult[];
  totalTokensUsed: number;
  totalTimeMs: number;
  escalations: Array<{
    fromTier: VerificationTier;
    toTier: VerificationTier;
    reason: string;
    files: string[];
  }>;
  // [ENH: TOKEN-BUDGET] Token budget enforcement
  tokenBudgetExceeded?: boolean;
  tokenBudgetWarning?: string;
}

/**
 * Pipeline configuration
 */
export interface PipelineConfig {
  enabled: boolean;
  // Starting tier
  startTier: VerificationTier;
  // Auto-escalation rules
  autoEscalate: boolean;
  escalationRules: EscalationRule[];
  // Tier-specific configs
  tierConfigs: Record<VerificationTier, TierConfig>;
  // Token budget (soft guideline - warning only)
  maxTotalTokens: number;
  // [ENH: TOKEN-OPT] Token budget mode: 'soft' (warning only) or 'hard' (block escalation)
  enforceTokenBudget: boolean;
  // Skip to exhaustive for certain file patterns
  exhaustivePatterns: string[];
  // [ENH: QUALITY-FIRST] Quality takes precedence over token limits
  qualityFirst?: boolean;
}

/**
 * Default tier configurations
 */
export const DEFAULT_TIER_CONFIGS: Record<VerificationTier, TierConfig> = {
  screen: {
    tier: 'screen',
    name: 'Quick Screen',
    description: 'Fast initial scan for obvious issues',
    budgetMultiplier: 0.3,
    categories: ['SECURITY', 'CORRECTNESS'],
    minSeverity: 'HIGH',
    includeEdgeCases: false,
    maxFilesPerCategory: 5,
    checkDependencies: false,
    promptStyle: 'brief'
  },
  focused: {
    tier: 'focused',
    name: 'Focused Review',
    description: 'Targeted review of flagged areas',
    budgetMultiplier: 0.6,
    categories: ['SECURITY', 'CORRECTNESS', 'RELIABILITY'],
    minSeverity: 'MEDIUM',
    includeEdgeCases: false,
    maxFilesPerCategory: 10,
    checkDependencies: true,
    promptStyle: 'standard'
  },
  exhaustive: {
    tier: 'exhaustive',
    name: 'Exhaustive Analysis',
    description: 'Complete verification with all checks',
    budgetMultiplier: 1.0,
    categories: ['SECURITY', 'CORRECTNESS', 'RELIABILITY', 'MAINTAINABILITY', 'PERFORMANCE'],
    minSeverity: 'LOW',
    includeEdgeCases: true,
    maxFilesPerCategory: 50,
    checkDependencies: true,
    promptStyle: 'detailed'
  }
};

/**
 * Default pipeline configuration
 * [ENH: TOKEN-OPT] Quality-first approach: soft token limits, optimize prompts instead
 */
export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  enabled: false,
  startTier: 'screen',
  autoEscalate: true,
  escalationRules: [
    {
      condition: 'critical_found',
      threshold: 1,
      targetTier: 'exhaustive',
      scope: 'affected'
    },
    {
      condition: 'issues_found',
      threshold: 3,
      targetTier: 'focused',
      scope: 'all'
    }
  ],
  tierConfigs: DEFAULT_TIER_CONFIGS,
  maxTotalTokens: 100000,  // [ENH: TOKEN-OPT] Soft guideline only (doubled from 50k)
  enforceTokenBudget: false,  // [ENH: TOKEN-OPT] Disabled - use prompt optimization instead
  exhaustivePatterns: ['**/auth/**', '**/security/**', '**/payment/**'],
  qualityFirst: true  // [ENH: QUALITY-FIRST] Never sacrifice quality for token limits
};
