/**
 * Verifier Roles Types - Verifier and Critic role definitions
 */

// =============================================================================
// Role Definitions
// =============================================================================

export type VerifierRole = 'verifier' | 'critic';

export interface RoleDefinition {
  name: VerifierRole;
  koreanName: string;
  purpose: string;
  mustDo: string[];
  mustNotDo: string[];
  focusAreas: string[];
  outputRequirements: OutputRequirement[];
  validationCriteria: ValidationCriterion[];
}


// =============================================================================
// Intent-Based Role Contract (Declarative Role Definition)
// =============================================================================

/**
 * FocusIntent - Semantic description of what to look for
 * Describes WHAT to focus on, not HOW to do it
 */
export interface FocusIntent {
  id: string;
  name: string;
  /** Natural language description for LLM understanding */
  description: string;
  /** Example scenarios to illustrate the intent */
  examples?: string[];
  /** Priority level for this focus area */
  priority: "critical" | "high" | "medium" | "low";
  /** Whether this intent is enabled */
  enabled: boolean;
}

/**
 * SuccessCriterion - Outcome-based success definition
 * Declares WHAT success looks like, not how to achieve it
 */
export interface SuccessCriterion {
  id: string;
  /** Natural language description of the success condition */
  description: string;
  /** Why this criterion matters */
  rationale: string;
  /** Whether this criterion must be met for success */
  required: boolean;
  /** Validation function (optional - for automated checking) */
  validator?: (output: string, context: RoleContext) => ValidationResult;
}

/**
 * RoleConstraint - Guardrails and boundaries
 * Defines what the role MUST or MUST NOT do
 */
export interface RoleConstraint {
  id: string;
  type: "must" | "must-not";
  /** Natural language description of the constraint */
  description: string;
  /** Why this constraint exists */
  rationale: string;
  /** Severity if violated */
  severity: "error" | "warning";
  /** Whether this constraint is enabled */
  enabled: boolean;
}

/**
 * IntentBasedRoleDefinition - Declarative role contract
 * Extends RoleDefinition with intent-based structure
 */
export interface IntentBasedRoleDefinition extends RoleDefinition {
  /**
   * Success criteria - WHAT success looks like (outcomes)
   * These are checked to determine if the role fulfilled its purpose
   */
  successCriteria: SuccessCriterion[];

  /**
   * Constraints - Guardrails for behavior
   * Defines boundaries without prescribing specific steps
   */
  constraints: RoleConstraint[];

  /**
   * Focus intents - WHAT to think about
   * Semantic descriptions of focus areas, not procedural steps
   */
  focusIntents: FocusIntent[];

  /**
   * Example reasoning - HOW the role might approach tasks
   * Illustrative, not prescriptive
   */
  exampleReasoning?: string;

  /**
   * Self-review prompts - Questions for self-verification
   * Outcome-focused questions, not procedural checklists
   */
  selfReviewPrompts?: string[];
}

/**
 * Helper type to check if a RoleDefinition is intent-based
 */
export function isIntentBasedRole(role: RoleDefinition): role is IntentBasedRoleDefinition {
  return "successCriteria" in role && "constraints" in role && "focusIntents" in role;
}

export interface OutputRequirement {
  field: string;
  required: boolean;
  description: string;
  validator?: (value: any) => boolean;
}

export interface ValidationCriterion {
  id: string;
  description: string;
  check: (output: string, context: RoleContext) => ValidationResult;
  severity: 'ERROR' | 'WARNING' | 'INFO';
}

export interface ValidationResult {
  passed: boolean;
  message: string;
  details?: string[];
}

export interface RoleContext {
  sessionId: string;
  currentRound: number;
  previousRounds: PreviousRoundSummary[];
  existingIssues: ExistingIssueSummary[];
  targetFiles: string[];
}

export interface PreviousRoundSummary {
  round: number;
  role: VerifierRole;
  issuesRaised: string[];
  issuesChallenged: string[];
  issuesResolved: string[];
}

export interface ExistingIssueSummary {
  id: string;
  severity: string;
  status: string;
  raisedBy: VerifierRole;
  challengedBy?: VerifierRole;
}

// =============================================================================
// Role Compliance Types
// =============================================================================

export interface RoleComplianceResult {
  role: VerifierRole;
  round: number;
  isCompliant: boolean;
  score: number;  // 0-100
  violations: RoleViolation[];
  warnings: RoleWarning[];
  suggestions: string[];
}

/**
 * Extended RoleComplianceResult with next role guidance
 * Used in submitRound response to provide guidance for the next round
 */
export interface RoleComplianceResultWithGuidance extends RoleComplianceResult {
  nextRoleGuidelines?: {
    role: VerifierRole | 'complete';
    conciseMode: boolean;
    round: number;
    outputFormat: string;
    mustDo: string[];
    checklist: string[];
  };
}

export interface RoleViolation {
  criterionId: string;
  severity: 'ERROR' | 'WARNING';
  message: string;
  evidence?: string;
  fix?: string;
}

export interface RoleWarning {
  type: string;
  message: string;
  suggestion: string;
}

// =============================================================================
// Role Enforcement Types
// =============================================================================

export interface RoleEnforcementConfig {
  strictMode: boolean;           // true: reject non-compliant, false: warn only
  minComplianceScore: number;    // 0-100, minimum score to pass
  allowRoleSwitch: boolean;      // allow mid-session role changes
  requireAlternation: boolean;   // require verifier/critic alternation
}

export interface RolePrompt {
  role: VerifierRole;
  systemPrompt: string;
  outputTemplate: string;
  exampleOutput: string;
  checklist: string[];
}
