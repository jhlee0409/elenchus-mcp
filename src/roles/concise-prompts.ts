/**
 * Concise Output Mode Prompts
 * [ENH: CONCISE] Reduces token usage by 40-50% for round 2+
 */

import { RolePrompt, VerifierRole, RoleContext, ValidationResult } from './types.js';
import { Session } from '../types/index.js';

// =============================================================================
// Configuration
// =============================================================================

export interface ConciseModeConfig {
  enabled: boolean;           // Enable concise mode
  startRound: number;         // Round to activate (1-indexed, default: 2)
  wordLimit: number;          // Word limit (default: 500)
  strictFormat: boolean;      // Reject non-compliant outputs
}

export const DEFAULT_CONCISE_CONFIG: ConciseModeConfig = {
  enabled: true,
  startRound: 2,     // Round 2+ (1-indexed)
  wordLimit: 500,
  strictFormat: false  // Warn but don't reject by default
};

// =============================================================================
// Concise Mode Detection
// =============================================================================

/**
 * Determine if concise mode should be active
 * @param session The current session
 * @param nextRound The round number about to start (1-indexed)
 */
export function shouldUseConciseMode(
  session: Session,
  nextRound: number
): boolean {
  const config = session.conciseModeConfig ?? DEFAULT_CONCISE_CONFIG;
  if (!config.enabled) return false;
  return nextRound >= config.startRound;
}

/**
 * Get concise mode configuration from session or default
 */
export function getConciseModeConfig(session: Session): ConciseModeConfig {
  return session.conciseModeConfig ?? DEFAULT_CONCISE_CONFIG;
}

// =============================================================================
// Concise Verifier Prompt
// =============================================================================

export function getConciseVerifierPrompt(round: number): RolePrompt {
  return {
    role: 'verifier',
    systemPrompt: `[CONCISE MODE - Round ${round}]

You are the Verifier. Provide BRIEF, STRUCTURED updates only.

## STRICT OUTPUT FORMAT

### NEW ISSUES (if any)
[ID]: [Category] - [One-line summary]
- Location: [file:line]
- Evidence: [code snippet only]

### CATEGORY STATUS
- SECURITY: [One-line status]
- CORRECTNESS: [One-line status]
- RELIABILITY: [One-line status]
- MAINTAINABILITY: [One-line status]
- PERFORMANCE: [One-line status]

### EDGE CASES CHECKED
[Brief bullet points of scenarios verified]

### UNRESOLVED FROM PREVIOUS
[List any unresolved issue IDs or "None"]

## RULES
- NO repetition of previous findings
- NO verbose explanations (bullet points only)
- Evidence: code snippet ONLY, no commentary
- Total output: <500 words
- Reference previous rounds by ID only`,

    outputTemplate: `### NEW ISSUES
[ID]: [Summary] (or "None")

### CATEGORY STATUS
- SECURITY: [status]
- CORRECTNESS: [status]
- RELIABILITY: [status]
- MAINTAINABILITY: [status]
- PERFORMANCE: [status]

### EDGE CASES
- [scenario checked]

### UNRESOLVED
[IDs or "None"]`,

    exampleOutput: `### NEW ISSUES
SEC-03: SQL injection in search query
- Location: src/search.ts:89
- Evidence: \`query = "SELECT * FROM items WHERE name LIKE '%" + input + "%'"\`

### CATEGORY STATUS
- SECURITY: 1 new (SEC-03)
- CORRECTNESS: Clean
- RELIABILITY: Clean
- MAINTAINABILITY: Previous MNT-01 unresolved
- PERFORMANCE: Not re-checked

### EDGE CASES
- Null/empty search input: Not handled
- Special characters: SQL escape missing

### UNRESOLVED
SEC-01, MNT-01`,

    checklist: [
      '□ <500 words?',
      '□ All 5 categories mentioned?',
      '□ No verbose explanations?',
      '□ Previous issues referenced by ID?'
    ]
  };
}

// =============================================================================
// Concise Critic Prompt
// =============================================================================

export function getConciseCriticPrompt(round: number): RolePrompt {
  return {
    role: 'critic',
    systemPrompt: `[CONCISE MODE - Round ${round}]

You are the Critic. Provide BRIEF verdicts only.

## STRICT OUTPUT FORMAT

For EACH issue from Verifier:
[ID]: [VALID/INVALID/PARTIAL] - [One sentence reason]

For coverage check:
COVERAGE: [OK/INCOMPLETE] - [what's missing if incomplete]

For flags (if any):
⚠️ FLAG: [brief description]

## RULES
- ONE LINE per issue verdict
- NO lengthy explanations
- Total output: <300 words`,

    outputTemplate: `### VERDICTS
[ID]: [VERDICT] - [reason]

### COVERAGE
[OK/INCOMPLETE] - [note]

### FLAGS (if any)
⚠️ FLAG: [description]`,

    exampleOutput: `### VERDICTS
SEC-03: VALID - User input directly in SQL without escaping
SEC-01: PARTIAL - Real issue but severity should be MEDIUM (internal API only)
MNT-01: INVALID - This is intentional design per architecture doc

### COVERAGE
OK - All 5 categories addressed

### FLAGS
⚠️ FLAG: Check src/auth.ts:45 for potential timing attack`,

    checklist: [
      '□ One line per issue?',
      '□ Every issue has verdict?',
      '□ Coverage verified?',
      '□ <300 words?'
    ]
  };
}

// =============================================================================
// Concise Mode Validation
// =============================================================================

/**
 * V009: Check concise format compliance for Verifier
 */
export function checkConciseFormatCompliance(
  output: string,
  context: RoleContext
): ValidationResult {
  // Only apply to round 2+ (context.currentRound is 0-indexed)
  if (context.currentRound < 1) {
    return { passed: true, message: 'Round 1, full format allowed' };
  }

  // Check for required sections
  const requiredSections = [
    { pattern: /NEW ISSUES|새\s*이슈/i, name: 'NEW ISSUES' },
    { pattern: /CATEGORY STATUS|카테고리\s*상태/i, name: 'CATEGORY STATUS' },
    { pattern: /EDGE CASES?|엣지\s*케이스/i, name: 'EDGE CASES' }
  ];

  const missingSections = requiredSections
    .filter(s => !s.pattern.test(output))
    .map(s => s.name);

  if (missingSections.length > 0) {
    return {
      passed: false,
      message: `Concise format missing sections: ${missingSections.join(', ')}`,
      details: [
        'Required sections for concise mode:',
        '- NEW ISSUES',
        '- CATEGORY STATUS',
        '- EDGE CASES'
      ]
    };
  }

  return { passed: true, message: 'Concise format compliance met' };
}

/**
 * V010: Check word count limit
 */
export function checkWordCountLimit(
  output: string,
  context: RoleContext,
  limit: number = 500
): ValidationResult {
  // Only apply to round 2+
  if (context.currentRound < 1) {
    return { passed: true, message: 'Round 1, no word limit' };
  }

  const wordCount = output.split(/\s+/).filter(w => w.length > 0).length;

  if (wordCount > limit) {
    return {
      passed: false,
      message: `Word count ${wordCount} exceeds limit ${limit}`,
      details: [
        `Output: ${wordCount} words (limit: ${limit})`,
        'Round 2+ requires concise output',
        'Focus on: new findings, status updates, no repetition'
      ]
    };
  }

  return {
    passed: true,
    message: `Word count OK: ${wordCount}/${limit}`
  };
}

/**
 * C008: Check concise verdict format for Critic
 */
export function checkConciseVerdictFormat(
  output: string,
  context: RoleContext
): ValidationResult {
  // Only apply to round 2+
  if (context.currentRound < 1) {
    return { passed: true, message: 'Round 1, full format allowed' };
  }

  // Check for one-line verdict pattern: [ID]: [VERDICT] - [reason]
  const verdictPattern = /(SEC|COR|REL|MNT|PRF)-\d+\s*:\s*(VALID|INVALID|PARTIAL)\s*-?\s*.{0,150}/gi;
  const verdicts = output.match(verdictPattern) || [];

  // Check for coverage verification
  const hasCoverageCheck = /COVERAGE\s*:|coverage\s+(OK|INCOMPLETE|checked)/i.test(output);

  // Get previous verifier round issues
  const lastVerifierRound = context.previousRounds
    .filter(r => r.role === 'verifier')
    .pop();

  const issuesRaised = lastVerifierRound?.issuesRaised || [];

  // If there were issues to review, check format compliance
  if (issuesRaised.length > 0 && verdicts.length === 0) {
    return {
      passed: false,
      message: 'Concise verdict format not used',
      details: [
        'Required format: [ID]: [VERDICT] - [reason]',
        'Example: SEC-03: VALID - Unsanitized input at line 45',
        `Issues to review: ${issuesRaised.join(', ')}`
      ]
    };
  }

  if (!hasCoverageCheck) {
    return {
      passed: false,
      message: 'Missing COVERAGE check in concise mode',
      details: ['Add: COVERAGE: OK/INCOMPLETE - [note]']
    };
  }

  return { passed: true, message: 'Concise verdict format used' };
}

// =============================================================================
// Role Prompt Selection
// =============================================================================

/**
 * Get role prompt with concise mode awareness
 */
export function getRolePromptForRound(
  role: VerifierRole,
  round: number,
  useConciseMode: boolean
): RolePrompt | null {
  if (!useConciseMode || round < 2) {
    return null; // Use standard prompt
  }

  return role === 'verifier'
    ? getConciseVerifierPrompt(round)
    : getConciseCriticPrompt(round);
}

// =============================================================================
// Validation Criteria Export
// =============================================================================

export const CONCISE_VALIDATION_CRITERIA = {
  V009: {
    id: 'V009',
    description: 'Concise format compliance (round 2+)',
    severity: 'WARNING' as const,
    check: checkConciseFormatCompliance
  },
  V010: {
    id: 'V010',
    description: 'Word count limit (round 2+)',
    severity: 'WARNING' as const,
    check: (output: string, context: RoleContext) => checkWordCountLimit(output, context, 500)
  },
  C008: {
    id: 'C008',
    description: 'Concise verdict format (round 2+)',
    severity: 'WARNING' as const,
    check: checkConciseVerdictFormat
  }
};
