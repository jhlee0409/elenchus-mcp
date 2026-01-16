/**
 * Role Enforcement Module - Verifier and Critic role enforcement
 *
 * 1. Role definitions (mustDo, mustNotDo)
 * 2. Output validation (role compliance)
 * 3. Compliance tracking
 * 4. Role alternation enforcement
 */

import {
  VerifierRole,
  RoleContext,
  RoleComplianceResult,
  RoleViolation,
  RoleWarning,
  RoleEnforcementConfig,
  RolePrompt,
  PreviousRoundSummary,
  ExistingIssueSummary
} from './types.js';
import {
  ROLE_DEFINITIONS,
  ROLE_PROMPTS,
  VERIFIER_ROLE,
  CRITIC_ROLE
} from './definitions.js';
import { Session, Issue } from '../types/index.js';

// =============================================================================
// State Management
// =============================================================================

/**
 * [FIX: MNT-02] Role alternation configuration
 */
interface RoleAlternation {
  expectedRole: VerifierRole;
  nextRole: VerifierRole;
  history: Array<{ role: VerifierRole; round: number }>;
}

interface RoleState {
  sessionId: string;
  complianceHistory: RoleComplianceResult[];
  currentExpectedRole: VerifierRole;
  config: RoleEnforcementConfig;
  // [FIX: MNT-02] Consolidated role alternation tracking
  alternation: RoleAlternation;
}

const roleStates = new Map<string, RoleState>();

/**
 * [FIX: MNT-01] Compliance scoring constants
 */
const COMPLIANCE_SCORE = {
  BASE: 100,           // Base score
  ERROR_PENALTY: 20,   // Deduction per ERROR violation
  WARNING_PENALTY: 5,  // Deduction per WARNING violation
  MIN_SCORE: 0,        // Minimum score
  MAX_SCORE: 100       // Maximum score
} as const;

const DEFAULT_CONFIG: RoleEnforcementConfig = {
  strictMode: false,         // Default: warn only, do not reject
  minComplianceScore: 60,    // Must be 60+ to pass
  allowRoleSwitch: false,    // Role switch not allowed
  requireAlternation: true   // Alternation required
};

// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize role enforcement for session
 */
export function initializeRoleEnforcement(
  sessionId: string,
  config?: Partial<RoleEnforcementConfig>
): RoleState {
  // [FIX: MNT-02] Initialize with consolidated alternation structure
  const state: RoleState = {
    sessionId,
    complianceHistory: [],
    currentExpectedRole: 'verifier',  // Verifier always goes first
    config: { ...DEFAULT_CONFIG, ...config },
    alternation: {
      expectedRole: 'verifier',
      nextRole: 'critic',
      history: []
    }
  };

  roleStates.set(sessionId, state);
  return state;
}

/**
 * Get role state
 */
export function getRoleState(sessionId: string): RoleState | undefined {
  return roleStates.get(sessionId);
}

// =============================================================================
// Role Enforcement
// =============================================================================

/**
 * Validate role compliance
 */
export function validateRoleCompliance(
  sessionId: string,
  role: VerifierRole,
  output: string,
  session: Session
): RoleComplianceResult {
  const state = roleStates.get(sessionId);
  if (!state) {
    // Auto-initialize
    initializeRoleEnforcement(sessionId);
    return validateRoleCompliance(sessionId, role, output, session);
  }

  const violations: RoleViolation[] = [];
  const warnings: RoleWarning[] = [];
  const suggestions: string[] = [];

  // 1. Role alternation validation
  if (state.config.requireAlternation) {
    const alternationResult = checkRoleAlternation(state, role);
    if (!alternationResult.valid) {
      violations.push({
        criterionId: 'ALT001',
        severity: 'ERROR',
        message: alternationResult.message,
        fix: `Expected role: ${state.currentExpectedRole}`
      });
    }
  }

  // 2. Apply role-specific validation criteria
  const roleDefinition = ROLE_DEFINITIONS[role];
  const context = buildRoleContext(sessionId, session);

  for (const criterion of roleDefinition.validationCriteria) {
    const result = criterion.check(output, context);

    if (!result.passed) {
      if (criterion.severity === 'ERROR') {
        violations.push({
          criterionId: criterion.id,
          severity: 'ERROR',
          message: result.message,
          evidence: result.details?.join('\n')
        });
      } else {
        warnings.push({
          type: criterion.id,
          message: result.message,
          suggestion: result.details?.[0] || 'Review required'
        });
      }
    }
  }

  // 3. Validate role-specific required elements
  const requiredCheck = checkRequiredElements(role, output);
  violations.push(...requiredCheck.violations);
  warnings.push(...requiredCheck.warnings);

  // 4. Calculate score
  const score = calculateComplianceScore(violations, warnings, roleDefinition.validationCriteria.length);

  // 5. Generate suggestions
  suggestions.push(...generateSuggestions(role, violations, warnings));

  const result: RoleComplianceResult = {
    role,
    round: session.currentRound + 1,
    isCompliant: violations.filter(v => v.severity === 'ERROR').length === 0 &&
                 score >= state.config.minComplianceScore,
    score,
    violations,
    warnings,
    suggestions
  };

  // [FIX: MNT-02] Update state - use consolidated alternation structure
  state.complianceHistory.push(result);
  const nextRole = role === 'verifier' ? 'critic' : 'verifier';
  state.currentExpectedRole = nextRole;
  state.alternation = {
    expectedRole: nextRole,
    nextRole: role,  // The one after next
    history: [...state.alternation.history, { role, round: session.currentRound + 1 }]
  };

  return result;
}

/**
 * Validate role alternation
 * [FIX: MNT-02] Use alternation structure for validation
 */
function checkRoleAlternation(
  state: RoleState,
  attemptedRole: VerifierRole
): { valid: boolean; message: string } {
  const expectedRole = state.alternation.expectedRole;
  if (attemptedRole !== expectedRole) {
    return {
      valid: false,
      message: `Role alternation violation: Expected ${expectedRole}, but ${attemptedRole} was submitted`
    };
  }
  return { valid: true, message: '' };
}

/**
 * Build role context
 */
function buildRoleContext(sessionId: string, session: Session): RoleContext {
  const previousRounds: PreviousRoundSummary[] = session.rounds.map(r => ({
    round: r.number,
    role: r.role as VerifierRole,
    issuesRaised: r.issuesRaised,
    issuesChallenged: [],  // TODO: Add tracking
    issuesResolved: r.issuesResolved
  }));

  const existingIssues: ExistingIssueSummary[] = session.issues.map(i => ({
    id: i.id,
    severity: i.severity,
    status: i.status,
    raisedBy: i.raisedBy as VerifierRole,
    challengedBy: undefined  // TODO: Add tracking
  }));

  return {
    sessionId,
    currentRound: session.currentRound,
    previousRounds,
    existingIssues,
    targetFiles: Array.from(session.context.files.keys())
  };
}

/**
 * Validate required elements
 */
function checkRequiredElements(
  role: VerifierRole,
  output: string
): { violations: RoleViolation[]; warnings: RoleWarning[] } {
  const violations: RoleViolation[] = [];
  const warnings: RoleWarning[] = [];

  if (role === 'verifier') {
    // Verifier required elements
    if (!output.match(/(SEC|COR|REL|MNT|PRF)-\d+/) && !output.includes('이슈 없음') && !output.includes('no issues')) {
      warnings.push({
        type: 'MISSING_ISSUE_FORMAT',
        message: 'Standard issue ID format (SEC-01, etc.) not found',
        suggestion: 'If there are issues, specify them in SEC-XX, COR-XX format'
      });
    }

    if (!output.match(/\w+\.\w+:\d+/) && output.match(/(SEC|COR|REL|MNT|PRF)-\d+/)) {
      violations.push({
        criterionId: 'REQ001',
        severity: 'WARNING',
        message: 'Issue location (file:line) not specified',
        fix: 'Specify location in file:line format for each issue'
      });
    }
  }

  if (role === 'critic') {
    // Critic required elements
    if (!output.match(/\b(VALID|INVALID|PARTIAL)\b/gi)) {
      warnings.push({
        type: 'MISSING_VERDICT',
        message: 'Issue verdict (VALID/INVALID/PARTIAL) not found',
        suggestion: 'Specify VALID, INVALID, or PARTIAL for each issue'
      });
    }

    if (!output.match(/근거|이유|reasoning|because/gi) && output.match(/INVALID/gi)) {
      violations.push({
        criterionId: 'REQ002',
        severity: 'WARNING',
        message: 'INVALID verdict lacks reasoning',
        fix: 'Provide specific reasoning when refuting'
      });
    }
  }

  return { violations, warnings };
}

/**
 * Calculate compliance score
 * [FIX: MNT-01] Use COMPLIANCE_SCORE constants
 */
function calculateComplianceScore(
  violations: RoleViolation[],
  warnings: RoleWarning[],
  _totalCriteria: number
): number {
  const errorCount = violations.filter(v => v.severity === 'ERROR').length;
  const warningCount = violations.filter(v => v.severity === 'WARNING').length + warnings.length;

  // [FIX: MNT-01] Use constants instead of magic numbers
  const score = COMPLIANCE_SCORE.BASE
    - (errorCount * COMPLIANCE_SCORE.ERROR_PENALTY)
    - (warningCount * COMPLIANCE_SCORE.WARNING_PENALTY);

  return Math.max(COMPLIANCE_SCORE.MIN_SCORE, Math.min(COMPLIANCE_SCORE.MAX_SCORE, score));
}

/**
 * Generate improvement suggestions
 */
function generateSuggestions(
  role: VerifierRole,
  violations: RoleViolation[],
  warnings: RoleWarning[]
): string[] {
  const suggestions: string[] = [];
  const prompt = ROLE_PROMPTS[role];

  if (violations.length > 0) {
    suggestions.push(`Check the ${role === 'verifier' ? 'Verifier' : 'Critic'} role checklist:`);
    suggestions.push(...prompt.checklist.slice(0, 3));
  }

  // Role-specific suggestions
  if (role === 'verifier') {
    if (violations.some(v => v.criterionId === 'V001')) {
      suggestions.push('💡 Include evidence in code blocks for all issues');
    }
    if (violations.some(v => v.criterionId === 'V003')) {
      suggestions.push('💡 Do not re-raise issues refuted in previous rounds without new evidence');
    }
  }

  if (role === 'critic') {
    if (violations.some(v => v.criterionId === 'C001')) {
      suggestions.push('💡 Must provide verdict for all issues raised by Verifier');
    }
    if (violations.some(v => v.criterionId === 'C002')) {
      suggestions.push('💡 Finding new issues is the Verifier\'s role. Only review existing issues');
    }
  }

  return suggestions;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Get next expected role
 */
export function getExpectedRole(sessionId: string): VerifierRole {
  const state = roleStates.get(sessionId);
  return state?.currentExpectedRole || 'verifier';
}

/**
 * Get role prompt
 */
export function getRolePrompt(role: VerifierRole): RolePrompt {
  return ROLE_PROMPTS[role];
}

/**
 * Get role definition
 */
export function getRoleDefinition(role: VerifierRole) {
  return ROLE_DEFINITIONS[role];
}

/**
 * Get compliance history
 */
export function getComplianceHistory(sessionId: string): RoleComplianceResult[] {
  return roleStates.get(sessionId)?.complianceHistory || [];
}

/**
 * Update role enforcement config
 */
export function updateRoleConfig(
  sessionId: string,
  config: Partial<RoleEnforcementConfig>
): RoleEnforcementConfig | null {
  const state = roleStates.get(sessionId);
  if (!state) return null;

  state.config = { ...state.config, ...config };
  return state.config;
}

/**
 * Get role enforcement summary
 */
export function getRoleEnforcementSummary(sessionId: string): object | null {
  const state = roleStates.get(sessionId);
  if (!state) return null;

  const history = state.complianceHistory;
  const verifierResults = history.filter(r => r.role === 'verifier');
  const criticResults = history.filter(r => r.role === 'critic');

  const avgVerifierScore = verifierResults.length > 0
    ? verifierResults.reduce((sum, r) => sum + r.score, 0) / verifierResults.length
    : 0;

  const avgCriticScore = criticResults.length > 0
    ? criticResults.reduce((sum, r) => sum + r.score, 0) / criticResults.length
    : 0;

  const totalViolations = history.reduce((sum, r) => sum + r.violations.length, 0);
  const totalWarnings = history.reduce((sum, r) => sum + r.warnings.length, 0);

  return {
    sessionId,
    config: state.config,
    currentExpectedRole: state.currentExpectedRole,
    // [FIX: MNT-02] Include alternation info in summary
    alternation: {
      expectedRole: state.alternation.expectedRole,
      nextRole: state.alternation.nextRole,
      totalAlternations: state.alternation.history.length
    },
    stats: {
      totalRounds: history.length,
      verifierRounds: verifierResults.length,
      criticRounds: criticResults.length,
      avgVerifierScore: avgVerifierScore.toFixed(1),
      avgCriticScore: avgCriticScore.toFixed(1),
      totalViolations,
      totalWarnings,
      complianceRate: history.length > 0
        ? ((history.filter(r => r.isCompliant).length / history.length) * 100).toFixed(1) + '%'
        : 'N/A'
    },
    recentViolations: history
      .flatMap(r => r.violations)
      .slice(-5)
      .map(v => ({ id: v.criterionId, message: v.message }))
  };
}

// =============================================================================
// Cache Cleanup
// =============================================================================

/**
 * [FIX: REL-02] Delete role state from memory cache
 * Called when session is ended to prevent memory leaks
 */
export function deleteRoleState(sessionId: string): boolean {
  return roleStates.delete(sessionId);
}

// =============================================================================
// Export for Tools
// =============================================================================

export {
  VERIFIER_ROLE,
  CRITIC_ROLE,
  ROLE_DEFINITIONS,
  ROLE_PROMPTS
};
