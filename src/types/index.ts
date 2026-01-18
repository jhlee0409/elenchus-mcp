/**
 * Elenchus MCP Server Types
 *
 * [REFACTOR: ZOD-UNIFY] Issue types now imported from centralized Zod schemas
 * for single source of truth and runtime validation support.
 */

// =============================================================================
// Issue Types (from Zod schemas - Single Source of Truth)
// =============================================================================

// Import for local use within this file
import {
  Severity as _Severity,
  IssueCategory as _IssueCategory,
  IssueStatus as _IssueStatus,
  IssueStorage as _IssueStorage
} from '../schemas/issue.js';

// Re-export all types and schemas for external consumers
export {
  // Enums (types)
  Severity,
  IssueCategory,
  IssueStatus,
  IssueTransitionType,
  CriticVerdict,
  Role,
  TriggeredBy,
  ImpactType,
  RiskLevel,
  // Schemas (for runtime validation)
  SeverityEnum,
  IssueCategoryEnum,
  IssueStatusEnum,
  IssueTransitionTypeEnum,
  CriticVerdictEnum,
  RoleEnum,
  TriggeredByEnum,
  ImpactTypeEnum,
  RiskLevelEnum,
  ImpactedCodeSchema,
  IssueImpactAnalysisSchema,
  IssueTransitionSchema,
  IssueInputSchema,
  IssueStorageSchema,
  IssueOutputSchema,
  ConstrainedIssueSchema,
  // Types
  ImpactedCode,
  IssueImpactAnalysis,
  IssueTransition,
  IssueInput,
  IssueStorage,
  IssueOutput,
  ConstrainedIssue,
  // Helper
  resolveDescription
} from '../schemas/issue.js';

// Type aliases for backward compatibility
export type { IssueTransition as IssueTransitionRecord } from '../schemas/issue.js';
export type { IssueStorage as Issue } from '../schemas/issue.js';

// =============================================================================
// Session Schemas (from Zod schemas - for runtime validation)
// [REFACTOR: ZOD-UNIFY] These schemas can be used for runtime validation
// The TypeScript interfaces below are kept for backward compatibility
// =============================================================================

export {
  // Session Enums
  SessionPhaseEnum,
  SessionStatusEnum,
  RoundRoleEnum,
  VerificationModeEnum,
  VerificationTierEnum,
  FileLayerEnum,
  FileChangeStatusEnum,
  PriorityEnum,
  ComplexityEnum,
  LanguageEnum,
  VerbosityEnum,
  // Context Schemas
  FileContextSchema,
  ContextDeltaSchema,
  // Verification Mode Schemas
  VerificationModeConfigSchema,
  // Framing Schemas
  VerificationAgendaItemSchema,
  ContextScopeSchema,
  FramingResultSchema,
  // Round Schemas
  RoundSchema,
  // Checkpoint Schemas
  CheckpointSchema,
  // User Preferences Schema
  UserPreferencesSchema,
  // Concise Mode Config Schema
  ConciseModeConfigSchema,
  // Pipeline State Schemas
  TierResultSchema,
  EscalationSchema,
  PipelineStateSchema,
  // Dynamic Roles State Schema
  DynamicRolesStateSchema,
  // LLM Eval Schemas
  LLMEvalConfigSchema,
  LLMEvalResultsSchema,
  // Inferred Types (use these for new code)
  type FileContext as ZodFileContext,
  type ContextDelta as ZodContextDelta,
  type VerificationModeConfig as ZodVerificationModeConfig,
  type VerificationAgendaItem as ZodVerificationAgendaItem,
  type ContextScope as ZodContextScope,
  type FramingResult as ZodFramingResult,
  type Round as ZodRound,
  type Checkpoint as ZodCheckpoint,
  type UserPreferences as ZodUserPreferences,
  type ConciseModeConfig as ZodConciseModeConfig,
  type TierResult as ZodTierResult,
  type Escalation as ZodEscalation,
  type PipelineState as ZodPipelineState,
  type DynamicRolesState as ZodDynamicRolesState,
  type LLMEvalConfig as ZodLLMEvalConfig,
  type LLMEvalResults as ZodLLMEvalResults
} from '../schemas/session.js';

// Local type aliases for use within this file
type Severity = _Severity;
type IssueCategory = _IssueCategory;
type IssueStatus = _IssueStatus;
type Issue = _IssueStorage;


// =============================================================================
// [ENH: AUTO-IMPACT] Automatic Impact Analysis Types
// [REFACTOR: ZOD-UNIFY] Now imported from schemas/issue.ts above
// =============================================================================

// =============================================================================
// Context Management
// =============================================================================

export interface FileContext {
  path: string;
  content?: string;
  dependencies: string[];
  layer: 'base' | 'discovered';
  addedInRound?: number;
  // [ENH: DIFF] Differential analysis fields
  changeStatus?: 'unchanged' | 'modified' | 'added' | 'deleted' | 'renamed';
  changedLines?: number[];        // Lines that changed (for focused review)
  diffSummary?: string;           // Short diff description
  affectedByChanges?: boolean;    // Unchanged but imports a changed file
  skipVerification?: boolean;     // Can be skipped in differential mode
}

export interface VerificationContext {
  target: string;
  requirements: string;
  files: Map<string, FileContext>;
  recentChanges?: string[];
  relatedTests?: string[];
}

// =============================================================================
// Session Management
// =============================================================================

// [ENH: FRAMING] Session Phase tracking
export type SessionPhase =
  | 'framing'           // Phase 1: Structuring user request
  | 'verification'      // Phase 2: Adversarial verification
  | 'synthesis'         // Phase 3: Conclusion synthesis
  | 'implementation'    // Phase 4: Implementation
  | 're-verification';  // Phase 5: Re-verification of fixes

export type SessionStatus =
  | 'initialized'
  | 'framing'           // [ENH: FRAMING] New status
  | 'verifying'
  | 'converging'
  | 'converged'
  | 'forced_stop'
  | 'error'
  | 're-verifying';     // [ENH: REVERIFY] New status

export type RoundRole = 'verifier' | 'critic' | 'arbiter';

// [ENH: FRAMING] Framing Phase structures
export interface FramingResult {
  structuredRequest: string;      // User request in structured form
  verificationAgenda: VerificationAgendaItem[];
  contextScope: {
    targetFiles: string[];
    relatedFiles: string[];
    excludedFiles: string[];
  };
  constraints: string[];          // Any constraints/assumptions
  successCriteria: string[];      // What defines success
}

export interface VerificationAgendaItem {
  id: string;
  title: string;
  description: string;
  category: IssueCategory;
  priority: 'MUST' | 'SHOULD' | 'COULD';
  estimatedComplexity: 'LOW' | 'MEDIUM' | 'HIGH';
}

// [ENH: DELTA-STORAGE] Context delta for efficient round storage
export interface ContextDelta {
  addedFiles: string[];      // Files added in this round
  removedFiles: string[];    // Files removed (rare)
  baseRound: number;         // Reference to base context round
}

export interface Round {
  number: number;
  role: RoundRole;
  // [ENH: DELTA-STORAGE] Support both full input and delta reference
  input: string | ContextDelta;
  output: string;
  timestamp: string;
  issuesRaised: string[];
  issuesResolved: string[];
  contextExpanded: boolean;
  newFilesDiscovered: string[];
}

export interface Checkpoint {
  roundNumber: number;
  timestamp: string;
  contextSnapshot: string[];  // file paths
  issuesSnapshot: Issue[];
  canRollbackTo: boolean;
}

// [ENH: ONE-SHOT] Verification mode for controlling convergence behavior
export type VerificationMode =
  | 'standard'      // Default: Verifier↔Critic loop, minimum 3 rounds
  | 'fast-track'    // Relaxed: Can converge in 1 round if no issues
  | 'single-pass';  // Aggressive: Verifier only, no Critic review required

// [ENH: ONE-SHOT] Verification mode configuration
export interface VerificationModeConfig {
  mode: VerificationMode;
  // Fast-track settings
  allowEarlyConvergence?: boolean;    // Allow convergence before 3 rounds
  skipCriticForCleanCode?: boolean;   // Skip Critic if Verifier finds no issues
  // Single-pass settings
  requireSelfReview?: boolean;        // Verifier must self-review in single-pass
  // Convergence thresholds
  minRounds?: number;                 // Override default minimum rounds
  stableRoundsRequired?: number;      // Override stable rounds requirement
}

export interface Session {
  id: string;
  target: string;
  requirements: string;
  status: SessionStatus;
  currentRound: number;
  maxRounds: number;
  context: VerificationContext;
  issues: Issue[];
  rounds: Round[];
  checkpoints: Checkpoint[];
  createdAt: string;
  updatedAt: string;
  // [ENH: FRAMING] Phase tracking
  phase?: SessionPhase;
  framing?: FramingResult;
  // [ENH: REVERIFY] Re-verification tracking
  reVerificationTargets?: string[];  // Issue IDs to re-verify
  previousVerificationId?: string;   // Link to original verification session
  // [ENH: ONE-SHOT] Verification mode for one-shot verification
  verificationMode?: VerificationModeConfig;
  // [ENH: CONCISE] Concise output mode configuration
  conciseModeConfig?: {
    enabled: boolean;
    startRound: number;
    wordLimit: number;
    strictFormat: boolean;
  };
  // [ENH: CAT-CACHE] Category mention cache for O(1) convergence check
  mentionedCategories?: Set<IssueCategory>;
  // [ENH: I18N] Detected language and user preferences
  userPreferences?: {
    language: 'en' | 'ko' | 'ja' | 'zh-CN' | 'zh-TW' | 'es' | 'fr' | 'de';
    autonomyLevel: 1 | 2 | 3 | 4;
    verbosity: 'minimal' | 'normal' | 'detailed';
    detectedFrom: string;
  };
  // [ENH: PIPELINE-PERSIST] Pipeline state for persistence across restarts
  pipelineState?: {
    currentTier: 'screen' | 'focused' | 'exhaustive';
    completedTiers: Array<'screen' | 'focused' | 'exhaustive'>;
    tierResults: Array<{
      tier: 'screen' | 'focused' | 'exhaustive';
      filesVerified: number;
      issuesFound: number;
      criticalIssues: number;
      highIssues: number;
      tokensUsed: number;
      timeMs: number;
      shouldEscalate: boolean;
      escalationReason?: string;
      escalationScope?: string[];
    }>;
    totalTokensUsed: number;
    totalTimeMs: number;
    escalations: Array<{
      fromTier: 'screen' | 'focused' | 'exhaustive';
      toTier: 'screen' | 'focused' | 'exhaustive';
      reason: string;
      files: string[];
    }>;
    tokenBudgetExceeded?: boolean;
    tokenBudgetWarning?: string;
  };
  // [ENH: DYNAMIC-ROLES] Dynamic role generation state
  dynamicRoles?: {
    enabled: boolean;
    domain: string;
    domainConfidence: number;
    verifierPurpose: string;
    criticPurpose: string;
    categories: string[];
    generatedAt: string;
    fromCache: boolean;
  };
  // [ENH: LLM-EVAL] LLM-based evaluation configuration
  llmEvalConfig?: {
    enabled: boolean;
    convergenceEval: boolean;
    severityEval: boolean;
    edgeCaseEval: boolean;
    falsePositiveEval: boolean;
    temperature?: number;
    fallbackToPatterns: boolean;
  };
  // [ENH: LLM-EVAL] LLM evaluation results cache
  llmEvalResults?: {
    convergence?: {
      qualityScore: number;
      categoryScores: Record<string, number>;
      gaps: string[];
      moreRoundsRecommended: boolean;
      evaluatedAt: string;
    };
    severityAdjustments?: Array<{
      issueId: string;
      originalSeverity: string;
      adjustedSeverity: string;
      reason: string;
    }>;
    edgeCaseCoverage?: {
      coverageScore: number;
      analyzedCases: number;
      missingCritical: number;
    };
  };
}

// =============================================================================
// Arbiter
// =============================================================================

export type InterventionType =
  | 'CONTEXT_EXPAND'
  | 'SOFT_CORRECT'
  | 'HARD_ROLLBACK'
  | 'LOOP_BREAK';

export interface ArbiterIntervention {
  type: InterventionType;
  reason: string;
  action: string;
  affectedRounds?: number[];
  newContextFiles?: string[];
  rollbackToCheckpoint?: number;
}

// =============================================================================
// Convergence
// =============================================================================

export interface ConvergenceStatus {
  isConverged: boolean;
  reason?: string;
  categoryCoverage: Record<IssueCategory, { checked: number; total: number }>;
  unresolvedIssues: number;
  criticalUnresolved: number;
  // [ENH: CRIT-03] Include HIGH severity in convergence tracking
  highUnresolved: number;
  roundsWithoutNewIssues: number;
  // [ENH: HIGH-05] Category coverage check
  allCategoriesExamined: boolean;
  uncoveredCategories: IssueCategory[];
  // [ENH: LIFECYCLE] Issue stabilization tracking
  issuesStabilized: boolean;
  recentTransitions: number;
  dismissedCount: number;
  mergedCount: number;
  // [ENH: EXHAUST] Exhaustive verification tracking
  hasEdgeCaseCoverage: boolean;
  hasNegativeAssertions: boolean;
  // [ENH: EXHAUST] Comprehensive edge case tracking (8 categories)
  edgeCaseCategoryCoverage?: Record<string, boolean>;  // Per-category coverage
  coveredEdgeCaseCategories?: string[];                // List of covered categories
  missingEdgeCaseCategories?: string[];                // List of missing categories
  hasComprehensiveEdgeCaseCoverage?: boolean;          // True if 4+ categories covered
  // [ENH: AUTO-IMPACT] Impact coverage tracking
  impactCoverage?: {
    totalImpactedFiles: number;
    reviewedImpactedFiles: number;
    unreviewedImpactedFiles: string[];
    coverageRate: number;
    hasHighRiskCoverage: boolean;
    unreviewedHighRisk: string[];
  };
}

// =============================================================================
// Tool Responses
// =============================================================================

export interface StartSessionResponse {
  sessionId: string;
  status: SessionStatus;
  context: {
    target: string;
    filesCollected: number;
    requirements: string;
  };
}

export interface SubmitRoundResponse {
  roundNumber: number;
  role: RoundRole;
  issuesRaised: number;
  issuesResolved: number;
  contextExpanded: boolean;
  newFilesDiscovered: string[];
  convergence: ConvergenceStatus;
  intervention?: ArbiterIntervention;
  nextRole: RoundRole | 'complete';
}

export interface GetContextResponse {
  sessionId: string;
  target: string;
  requirements: string;
  files: Array<{
    path: string;
    layer: 'base' | 'discovered';
  }>;
  currentRound: number;
  issuesSummary: {
    total: number;
    bySeverity: Record<Severity, number>;
    byStatus: Record<IssueStatus, number>;
  };
  // [ENH: PROACTIVE-MEDIATOR] Proactive guidance for next round
  proactiveSummary?: {
    focusAreas: string[];
    unreviewedFiles: string[];
    impactRecommendations: string[];
    edgeCaseGaps: string[];
    recommendations: string[];
  };
}
