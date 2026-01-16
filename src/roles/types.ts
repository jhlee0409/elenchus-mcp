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
