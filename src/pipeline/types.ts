/**
 * Tiered Pipeline Types
 * [ENH: TIERED] Types for multi-tier verification pipeline
 */

import { IssueCategory, Severity } from '../types/index.js';
import { PIPELINE_CONSTANTS, CONVERGENCE_CONSTANTS } from '../config/constants.js';

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
    budgetMultiplier: PIPELINE_CONSTANTS.SCREEN_TIER.BUDGET_MULTIPLIER,
    categories: ['SECURITY', 'CORRECTNESS'],
    minSeverity: PIPELINE_CONSTANTS.SCREEN_TIER.MIN_SEVERITY,
    includeEdgeCases: false,
    maxFilesPerCategory: PIPELINE_CONSTANTS.SCREEN_TIER.MAX_FILES_PER_CATEGORY,
    checkDependencies: false,
    promptStyle: 'brief'
  },
  focused: {
    tier: 'focused',
    name: 'Focused Review',
    description: 'Targeted review of flagged areas',
    budgetMultiplier: PIPELINE_CONSTANTS.FOCUSED_TIER.BUDGET_MULTIPLIER,
    categories: ['SECURITY', 'CORRECTNESS', 'RELIABILITY'],
    minSeverity: PIPELINE_CONSTANTS.FOCUSED_TIER.MIN_SEVERITY,
    includeEdgeCases: false,
    maxFilesPerCategory: PIPELINE_CONSTANTS.FOCUSED_TIER.MAX_FILES_PER_CATEGORY,
    checkDependencies: true,
    promptStyle: 'standard'
  },
  exhaustive: {
    tier: 'exhaustive',
    name: 'Exhaustive Analysis',
    description: 'Complete verification with all checks',
    budgetMultiplier: PIPELINE_CONSTANTS.EXHAUSTIVE_TIER.BUDGET_MULTIPLIER,
    categories: CONVERGENCE_CONSTANTS.REQUIRED_CATEGORIES as unknown as IssueCategory[],
    minSeverity: PIPELINE_CONSTANTS.EXHAUSTIVE_TIER.MIN_SEVERITY,
    includeEdgeCases: true,
    maxFilesPerCategory: PIPELINE_CONSTANTS.EXHAUSTIVE_TIER.MAX_FILES_PER_CATEGORY,
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
  startTier: PIPELINE_CONSTANTS.DEFAULT_START_TIER,
  autoEscalate: true,
  escalationRules: [
    {
      condition: 'critical_found',
      threshold: PIPELINE_CONSTANTS.ESCALATION.CRITICAL_THRESHOLD,
      targetTier: 'exhaustive',
      scope: 'affected'
    },
    {
      condition: 'issues_found',
      threshold: PIPELINE_CONSTANTS.ESCALATION.ISSUES_THRESHOLD,
      targetTier: 'focused',
      scope: 'all'
    }
  ],
  tierConfigs: DEFAULT_TIER_CONFIGS,
  maxTotalTokens: PIPELINE_CONSTANTS.MAX_TOTAL_TOKENS,
  enforceTokenBudget: false,  // [ENH: TOKEN-OPT] Disabled - use prompt optimization instead
  exhaustivePatterns: [...PIPELINE_CONSTANTS.EXHAUSTIVE_PATTERNS],
  qualityFirst: true  // [ENH: QUALITY-FIRST] Never sacrifice quality for token limits
};
