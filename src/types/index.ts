/**
 * Elenchus MCP Server Types
 */

// =============================================================================
// Verification Criteria
// =============================================================================

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type IssueCategory =
  | 'SECURITY'
  | 'CORRECTNESS'
  | 'RELIABILITY'
  | 'MAINTAINABILITY'
  | 'PERFORMANCE';

// [ENH: LIFECYCLE] Extended Issue Status
export type IssueStatus =
  | 'RAISED'
  | 'CHALLENGED'
  | 'RESOLVED'
  | 'UNRESOLVED'
  | 'DISMISSED'      // Invalidated issue
  | 'MERGED'         // Merged into another issue
  | 'SPLIT';         // Split into multiple issues

// [ENH: LIFECYCLE] Issue Transition Types
export type IssueTransitionType =
  | 'DISCOVERED'     // Found during debate
  | 'ESCALATED'      // Severity increased
  | 'DEMOTED'        // Severity decreased
  | 'MERGED_INTO'    // Merged into another issue
  | 'SPLIT_FROM'     // Split from another issue
  | 'INVALIDATED'    // Completely invalid
  | 'VALIDATED'      // Confirmed valid
  | 'REFINED';       // Description/evidence updated

// [ENH: LIFECYCLE] Issue Transition Record
export interface IssueTransitionRecord {
  type: IssueTransitionType;
  fromStatus: IssueStatus;
  toStatus: IssueStatus;
  fromSeverity?: Severity;
  toSeverity?: Severity;
  round: number;
  reason: string;
  evidence?: string;
  triggeredBy: 'verifier' | 'critic' | 'mediator';
  timestamp: string;
}

export interface Issue {
  id: string;
  category: IssueCategory;
  severity: Severity;
  summary: string;
  location: string;  // file:line
  description: string;
  evidence: string;
  raisedBy: 'verifier' | 'critic';
  raisedInRound: number;
  status: IssueStatus;
  resolvedInRound?: number;
  resolution?: string;
  // [ENH: CRIT-02] Critic approval tracking for issue resolution
  criticReviewed?: boolean;
  criticVerdict?: 'VALID' | 'INVALID' | 'PARTIAL';
  criticReviewRound?: number;
  // [ENH: LIFECYCLE] Issue Lifecycle tracking
  transitions?: IssueTransitionRecord[];
  mergedInto?: string;        // Target issue ID when merged
  splitFrom?: string;         // Source issue ID when split
  splitInto?: string[];       // Target issue IDs when this issue was split
  relatedIssues?: string[];   // Related issue IDs
  originalSeverity?: Severity; // Original severity before any changes
  discoveredDuringDebate?: boolean; // True if found during Critic review
  // [ENH: AUTO-IMPACT] Automatic impact analysis (attached when issue raised)
  impactAnalysis?: IssueImpactAnalysis;
}


// =============================================================================
// [ENH: AUTO-IMPACT] Automatic Impact Analysis Types
// Based on: Netflix Chaos Engineering, Google DiRT principles
// =============================================================================

/**
 * Impact analysis automatically attached to issues when raised
 * Reduces token waste by providing impact info proactively
 */
export interface IssueImpactAnalysis {
  // Direct callers of the affected function/file
  callers: ImpactedCode[];
  // Dependencies used by the affected code
  dependencies: ImpactedCode[];
  // Related test files (if any)
  relatedTests: string[];
  // Functions in the same file that might be affected
  affectedFunctions: string[];
  // Cascade depth (how many levels of impact)
  cascadeDepth: number;
  // Total number of affected files
  totalAffectedFiles: number;
  // Risk assessment based on impact scope
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  // Human-readable summary
  summary: string;
}

/**
 * Represents a piece of code impacted by an issue
 */
export interface ImpactedCode {
  file: string;
  functions?: string[];
  impactType: 'DIRECT' | 'INDIRECT' | 'TEST';
  depth: number;  // 1 = direct, 2+ = transitive
}

// =============================================================================
// Context Management
// =============================================================================

export interface FileContext {
  path: string;
  content?: string;
  dependencies: string[];
  layer: 'base' | 'discovered';
  addedInRound?: number;
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

export interface Round {
  number: number;
  role: RoundRole;
  input: string;
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
