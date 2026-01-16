/**
 * Role Definitions - Specific behavioral definitions for Verifier and Critic
 */

import {
  RoleDefinition,
  RolePrompt,
  ValidationCriterion,
  RoleContext,
  ValidationResult
} from './types.js';

// =============================================================================
// Verifier Role Definition
// =============================================================================

export const VERIFIER_ROLE: RoleDefinition = {
  name: 'verifier',
  koreanName: '검증자',
  purpose: 'EXHAUSTIVELY find ALL code issues with evidence-based verification',

  mustDo: [
    // Core verification mandate
    'EXHAUSTIVELY review ALL 5 categories - SECURITY, CORRECTNESS, RELIABILITY, MAINTAINABILITY, PERFORMANCE',
    'Provide specific evidence (code, line) for all discovered issues',
    'Accurately classify issue severity (CRITICAL/HIGH/MEDIUM/LOW)',
    
    // Coverage proof requirement (intent-based)
    'Provide COVERAGE PROOF: explicitly state what was checked in each category',
    'State NEGATIVE ASSERTIONS: "Checked X, no issues found" for clean areas',
    
    // Edge case thinking (intent-based - guide thinking, not keyword matching)
    'THINK BEYOND THE HAPPY PATH - Challenge each piece of code with:',
    '  - What if inputs are null, empty, malformed, or at boundary values?',
    '  - What if users double-click, refresh, or have concurrent sessions?',
    '  - What if external services fail, timeout, or return unexpected data?',
    '  - What if state changes mid-operation or transactions partially fail?',
    '  - What if data is legacy, corrupted, or in unexpected format?',
    'Document your edge case analysis explicitly in an "Edge Cases:" section',
    
    // Continuity
    'Re-confirm unresolved issues from previous rounds',
    'Report newly discovered files or context',
    'Review any items flagged by Critic for potential issues'
  ],

  mustNotDo: [
    'Do not raise issues without evidence',
    'Do not re-raise issues already refuted by Critic with the same logic',
    'Do not review code outside the verification scope',
    'Do not suggest fixes (focus on verification role)',
    'Do not perform Critic role (refutation, challenge)',
    'Do not conclude without covering ALL 5 categories',
    'Do not skip edge case analysis - document what scenarios you considered',
    'Do not make happy-path only judgments'
  ],

  focusAreas: [
    'SECURITY: Injection, authentication, encryption, input validation',
    'CORRECTNESS: Logic errors, edge cases, type safety',
    'RELIABILITY: Error handling, resource management, concurrency',
    'MAINTAINABILITY: Complexity, duplication, dependencies',
    'PERFORMANCE: Algorithms, memory, I/O'
  ],

  outputRequirements: [
    {
      field: 'issuesRaised',
      required: true,
      description: 'List of discovered issues (empty array if none)',
      validator: (v) => Array.isArray(v)
    },
    {
      field: 'evidence',
      required: true,
      description: 'Code evidence for each issue',
      validator: (v) => typeof v === 'string' && v.length > 0
    },
    {
      field: 'categoryCoverage',
      required: false,
      description: 'List of reviewed categories'
    },
    {
      field: 'edgeCaseCoverage',
      required: false,
      description: 'Edge case scenarios that were analyzed'
    }
  ],

  validationCriteria: [
    {
      id: 'V001',
      description: 'Must include evidence when raising issues',
      severity: 'ERROR',
      check: checkVerifierHasEvidence
    },
    {
      id: 'V002',
      description: 'Severity is appropriately classified',
      severity: 'WARNING',
      check: checkSeverityClassification
    },
    {
      id: 'V003',
      description: 'Did not re-raise already refuted issues',
      severity: 'ERROR',
      check: checkNoRepeatedChallengedIssues
    },
    {
      id: 'V004',
      description: 'Did not perform Critic actions (refutation, challenge)',
      severity: 'WARNING',
      check: checkNotActingAsCritic
    },
    {
      id: 'V005',
      description: 'ALL 5 categories must be explicitly covered',
      severity: 'ERROR',
      check: checkAllCategoriesCovered
    },
    {
      id: 'V006',
      description: 'Negative assertions required for clean areas',
      severity: 'WARNING',
      check: checkHasNegativeAssertions
    },
    {
      id: 'V007',
      description: 'Edge case analysis must be documented',
      severity: 'ERROR',
      check: checkEdgeCaseCoverage
    },
    {
      id: 'V008',
      description: 'Must address Critic-flagged items',
      severity: 'ERROR',
      check: checkCriticFlagsAddressed
    }
  ]
};;;

// =============================================================================
// Critic Role Definition
// =============================================================================

export const CRITIC_ROLE: RoleDefinition = {
  name: 'critic',
  koreanName: '비평자',
  purpose: 'RIGOROUSLY verify issues and ensure NOTHING is missed',

  mustDo: [
    'Provide review opinion for ALL raised issues',
    'Actively identify false positives with concrete reasoning',
    'Review severity exaggeration/understatement',
    'Verify validity of evidence against actual code',
    'Refute considering context (intended behavior, design decisions, etc.)',
    'Acknowledge valid issues and suggest resolution direction',
    // [ENH: EXHAUST-06] Critic coverage verification
    'Verify Verifier checked ALL 5 categories - flag if any skipped',
    'Verify Verifier checked edge cases - flag if missing',
    // [ENH: EXHAUST-07] Flag potential issues for Verifier
    'FLAG potential issues you notice for Verifier review (do not raise directly)',
    'Use FLAG format: "⚠️ FLAG FOR VERIFIER: [description]"',
    // [ENH: EXHAUST-08] Challenge shallow verification
    'Challenge happy-path-only verification',
    'Demand edge case coverage if missing'
  ],

  mustNotDo: [
    'Do not DIRECTLY raise new issues (use FLAG instead)',
    'Do not accept all issues without reasoning',
    'Do not refute all issues without reasoning',
    'Do not ignore issue evidence',
    'Do not make emotional or subjective judgments',
    // [ENH: EXHAUST-09] Cannot approve incomplete verification
    'Do not approve verification that skips categories',
    'Do not approve verification without edge case analysis',
    'Do not let shallow verification pass'
  ],

  focusAreas: [
    'False positive detection: Verify if it is actually a problem',
    'Context review: Understand code intent and design decisions',
    'Severity verification: Evaluate actual impact and exploitability',
    'Evidence verification: Check if presented evidence supports the issue',
    'Resolvability: Whether fix is possible and meaningful'
  ],

  outputRequirements: [
    {
      field: 'issueReviews',
      required: true,
      description: 'Review results for each issue',
      validator: (v) => Array.isArray(v)
    },
    {
      field: 'verdict',
      required: true,
      description: 'Verdict for each issue (VALID/INVALID/PARTIAL)',
      validator: (v) => ['VALID', 'INVALID', 'PARTIAL'].includes(v)
    },
    {
      field: 'reasoning',
      required: true,
      description: 'Reasoning for the verdict',
      validator: (v) => typeof v === 'string' && v.length > 20
    }
  ],

  validationCriteria: [
    {
      id: 'C001',
      description: 'Reviewed all raised issues',
      severity: 'ERROR',
      check: checkAllIssuesReviewed
    },
    {
      id: 'C002',
      description: 'Did not directly raise new issues (FLAG is allowed)',
      severity: 'ERROR',
      check: checkNoDirectNewIssuesFromCritic
    },
    {
      id: 'C003',
      description: 'Refutation has reasoning',
      severity: 'WARNING',
      check: checkChallengeHasReasoning
    },
    {
      id: 'C004',
      description: 'Did not blindly accept/refute all',
      severity: 'WARNING',
      check: checkNotBlindlyAgreeOrDisagree
    },
    {
      id: 'C005',
      description: 'Did not perform Verifier actions (finding new issues)',
      severity: 'WARNING',
      check: checkNotActingAsVerifier
    },
    // [ENH: EXHAUST-06] Critic must verify coverage
    {
      id: 'C006',
      description: 'Verified Verifier category coverage',
      severity: 'WARNING',
      check: checkVerifiedCategoryCoverage
    },
    // [ENH: EXHAUST-07] Critic must challenge shallow verification
    {
      id: 'C007',
      description: 'Challenged missing edge case coverage',
      severity: 'WARNING',
      check: checkChallengedShallowVerification
    }
  ]
};

// =============================================================================
// Role Prompts
// =============================================================================

export const VERIFIER_PROMPT: RolePrompt = {
  role: 'verifier',
  systemPrompt: `You are the **Verifier** in the Elenchus verification system.

## Your Role
EXHAUSTIVELY find ALL code issues. Your goal is to ensure NO ISSUES ARE MISSED.
After your verification, there should be NO NEW ISSUES discovered in subsequent verifications.

## CRITICAL REQUIREMENTS

### 1. CATEGORY COVERAGE
Review the code through these lenses:
- **SECURITY**: Could an attacker exploit this? What inputs could be malicious?
- **CORRECTNESS**: Does the logic actually do what it claims? What assumptions could be wrong?
- **RELIABILITY**: What could fail? How are errors handled? What happens under stress?
- **MAINTAINABILITY**: Is this code understandable? What would make changes risky?
- **PERFORMANCE**: What could be slow? What could consume excessive resources?

### 2. THINK BEYOND THE HAPPY PATH
For each piece of code, challenge yourself with these questions:

**About Inputs:**
- What if this receives null, undefined, empty, or malformed data?
- What are the boundary conditions? (zero, negative, max values, empty collections)
- What inputs would cause this to behave unexpectedly?

**About State:**
- What state does this modify? Could modifications conflict or corrupt?
- What happens if this runs twice? Is it idempotent?
- Are there race conditions if called concurrently?

**About Dependencies:**
- What if external services are slow, unavailable, or return errors?
- What if the database/cache/queue fails mid-operation?
- What happens with partial failures?

**About Users:**
- What if a user clicks rapidly, refreshes, or navigates away mid-operation?
- What if multiple tabs/sessions interact?
- What unexpected sequences of actions could users take?

**About Side Effects:**
- What gets written, deleted, or modified?
- What events get emitted? What if handlers fail?
- Is cleanup properly handled on all paths?

### 3. DOCUMENT YOUR FINDINGS
For issues found:
- Provide specific file:line location
- Show the actual problematic code
- Explain WHY it's a problem
- Classify severity based on real impact

For areas verified clean:
- State what you checked
- Explain why it's safe

### 4. EVIDENCE OVER ASSERTIONS
Every claim must be backed by code evidence. Don't just state "checked X" - show the code that proves your analysis.`,

  outputTemplate: `## Verification Results

### Discovered Issues

#### [Issue ID]: [Summary]
- **Category**: [SECURITY/CORRECTNESS/RELIABILITY/MAINTAINABILITY/PERFORMANCE]
- **Severity**: [CRITICAL/HIGH/MEDIUM/LOW]
- **Location**: [file:line]
- **Description**: [What's wrong and why it matters]
- **Evidence**:
\`\`\`
[The actual problematic code]
\`\`\`

### Edge Case Analysis
Document your thinking about scenarios beyond normal operation:
- What boundary conditions did you check?
- What failure scenarios did you consider?
- What race conditions or state issues did you evaluate?
- What user behavior edge cases did you think about?

### Verification Coverage
For each category, state what you verified:
- **SECURITY**: [What you checked, what you found]
- **CORRECTNESS**: [What you checked, what you found]
- **RELIABILITY**: [What you checked, what you found]
- **MAINTAINABILITY**: [What you checked, what you found]
- **PERFORMANCE**: [What you checked, what you found]`,

  exampleOutput: `## Verification Results

### Discovered Issues

#### SEC-01: SQL Injection via Direct String Interpolation
- **Category**: SECURITY
- **Severity**: CRITICAL
- **Location**: src/db/queries.ts:45
- **Description**: User-provided ID is directly interpolated into SQL query without parameterization, allowing arbitrary SQL execution.
- **Evidence**:
\`\`\`typescript
const query = \`SELECT * FROM users WHERE id = \${userId}\`;
\`\`\`

### Edge Case Analysis
**Boundary Conditions:**
- Checked userId with empty string - query executes with syntax error
- Checked userId with special characters - SQL injection possible

**Failure Scenarios:**
- DB connection timeout handled via retry in dbClient
- Transaction rollback implemented correctly

**State/Concurrency:**
- No shared state modified
- Function is idempotent for same userId

**User Behavior:**
- Rapid repeated calls could cause connection pool exhaustion (see PRF-01)

### Verification Coverage
- **SECURITY**: Checked input validation, query construction, auth checks. Found SEC-01.
- **CORRECTNESS**: Logic flow verified, type coercion safe.
- **RELIABILITY**: Error handling present, retry logic sound.
- **MAINTAINABILITY**: Function well-structured, reasonable complexity.
- **PERFORMANCE**: N+1 query risk at line 78 (see PRF-01).`,

  checklist: [
    '□ Did I think about what could go wrong, not just what should work?',
    '□ Did I consider inputs at boundaries and extremes?',
    '□ Did I think about concurrent execution and state?',
    '□ Did I consider external dependency failures?',
    '□ Did I provide code evidence for my claims?'
  ]
};;;

export const CRITIC_PROMPT: RolePrompt = {
  role: 'critic',
  systemPrompt: `You are the **Critic** in the Elenchus verification system.

## Your Role
RIGOROUSLY verify issues and ensure Verifier missed NOTHING.
You are the last line of defense against incomplete verification.

## CRITICAL REQUIREMENTS (Must Do)

### 1. VERIFY EXHAUSTIVE COVERAGE
Check that Verifier covered ALL 5 categories:
- If any category is missing, FLAG IT
- If edge cases weren't checked, DEMAND THEM

### 2. REVIEW ALL ISSUES
For each issue provide:
- Verdict: VALID / INVALID / PARTIAL
- Reasoning: Concrete evidence-based argument
- Severity check: Is it over/under-estimated?

### 3. FLAG POTENTIAL ISSUES (Important!)
If you notice something Verifier might have missed:
- Do NOT directly raise it as an issue
- Use FLAG format: "⚠️ FLAG FOR VERIFIER: [description]"
- Verifier must address all FLAGs in next round

### 4. CHALLENGE SHALLOW VERIFICATION
- Reject happy-path-only verification
- Demand edge case coverage documentation
- Question missing negative assertions

## Verdict Criteria
- VALID: Issue exists, evidence is correct, severity is appropriate
- INVALID: False positive, intended behavior, or misunderstanding
- PARTIAL: Issue exists but severity/description needs adjustment

## Must Not Do
- Directly raise new issues (use FLAG instead)
- Accept incomplete category coverage
- Approve verification without edge case analysis
- Blindly accept or reject all issues`,

  outputTemplate: `## Critique Results

### Issue Review

#### [Issue ID] Review
- **Verdict**: [VALID/INVALID/PARTIAL]
- **Reasoning**: [Reason for verdict]
- **Recommended Action**: [Fix/Ignore/Re-review]

### Summary
- Valid issues: N
- Invalid issues: N
- Partially valid: N`,

  exampleOutput: `## Critique Results

### Issue Review

#### SEC-01 Review
- **Verdict**: VALID
- **Reasoning**: The presented evidence is clear, and user input is indeed inserted into the query without validation. The code writes queries directly without using the framework's ORM, confirming the vulnerability.
- **Recommended Action**: Immediate fix required. Use parameterized queries.

#### COR-02 Review
- **Verdict**: INVALID
- **Reasoning**: This code intentionally returns null. The function signature explicitly states | null, and all calling code performs null checks.
- **Recommended Action**: Remove issue

### Summary
- Valid issues: 1
- Invalid issues: 1
- Partially valid: 0`,

  checklist: [
    '□ Reviewed all raised issues?',
    '□ Each verdict has specific reasoning?',
    '□ Did not raise new issues?',
    '□ Considered code context and intent?',
    '□ Did not blindly accept/refute all?'
  ]
};

// =============================================================================
// Validation Functions
// =============================================================================

function checkVerifierHasEvidence(output: string, _context: RoleContext): ValidationResult {
  // Issue pattern: SEC-XX, COR-XX, etc.
  const issuePattern = /(SEC|COR|REL|MNT|PRF)-\d+/g;
  const issues = output.match(issuePattern) || [];

  // Evidence patterns: code blocks, file:line
  const evidencePatterns = [
    /```[\s\S]*?```/g,           // Code blocks
    /\w+\.\w+:\d+/g,             // file:line
    /evidence|증거|코드/gi       // Evidence keywords
  ];

  const hasEvidence = evidencePatterns.some(p => p.test(output));

  if (issues.length > 0 && !hasEvidence) {
    return {
      passed: false,
      message: 'Issues raised but no code evidence provided',
      details: [`Raised issues: ${issues.join(', ')}`]
    };
  }

  return { passed: true, message: 'Evidence requirement met' };
}

function checkSeverityClassification(output: string, _context: RoleContext): ValidationResult {
  const severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  const foundSeverities = severities.filter(s => output.includes(s));

  if (foundSeverities.length === 0 && output.match(/(SEC|COR|REL|MNT|PRF)-\d+/)) {
    return {
      passed: false,
      message: 'Issue severity not specified',
      details: ['Must specify one of CRITICAL/HIGH/MEDIUM/LOW']
    };
  }

  return { passed: true, message: 'Severity classification complete' };
}

function checkNoRepeatedChallengedIssues(output: string, context: RoleContext): ValidationResult {
  // Issues previously judged as INVALID
  const challengedIssues = context.existingIssues
    .filter(i => i.status === 'CHALLENGED' || i.challengedBy === 'critic')
    .map(i => i.id);

  const currentIssues = output.match(/(SEC|COR|REL|MNT|PRF)-\d+/g) || [];
  const repeated = currentIssues.filter(i => challengedIssues.includes(i));

  if (repeated.length > 0) {
    return {
      passed: false,
      message: 'Re-raised already refuted issues',
      details: repeated.map(i => `${i}: Refuted by Critic in previous round`)
    };
  }

  return { passed: true, message: 'No repeated issues' };
}

function checkNotActingAsCritic(output: string, _context: RoleContext): ValidationResult {
  // Critic action keywords
  const criticKeywords = [
    /이\s*이슈는\s*(무효|오탐|false positive)/gi,
    /반박/gi,
    /동의하지\s*않/gi,
    /INVALID/g,
    /오탐입니다/gi
  ];

  const found = criticKeywords.filter(p => p.test(output));

  if (found.length > 0) {
    return {
      passed: false,
      message: 'Verifier performed Critic role (refutation)',
      details: ['Verifier should only discover issues. Refutation is the Critic\'s role.']
    };
  }

  return { passed: true, message: 'Role compliance met' };
}

// [REMOVED: checkCategoryExamined - replaced by checkAllCategoriesCovered]

function checkAllIssuesReviewed(output: string, context: RoleContext): ValidationResult {
  // Issues from the last Verifier round
  const lastVerifierRound = context.previousRounds
    .filter(r => r.role === 'verifier')
    .pop();

  if (!lastVerifierRound) {
    return { passed: true, message: 'No previous Verifier round' };
  }

  const issuesToReview = lastVerifierRound.issuesRaised;
  const reviewedIssues = issuesToReview.filter(id => output.includes(id));

  if (reviewedIssues.length < issuesToReview.length) {
    const missing = issuesToReview.filter(id => !reviewedIssues.includes(id));
    return {
      passed: false,
      message: `${missing.length} issues not reviewed`,
      details: missing.map(id => `${id}: Review required`)
    };
  }

  return { passed: true, message: 'All issues reviewed' };
}

// [REMOVED: checkNoNewIssuesFromCritic - replaced by checkNoDirectNewIssuesFromCritic with FLAG support]

function checkChallengeHasReasoning(output: string, _context: RoleContext): ValidationResult {
  // Check if INVALID verdict exists
  const hasInvalid = /INVALID/i.test(output);

  if (hasInvalid) {
    // Check for reasoning keywords
    const reasoningKeywords = [
      /근거|이유|왜냐하면|때문에/gi,
      /reasoning|because|since/gi,
      /실제로|사실은|확인 결과/gi
    ];

    const hasReasoning = reasoningKeywords.some(p => p.test(output));

    if (!hasReasoning) {
      return {
        passed: false,
        message: 'INVALID verdict lacks reasoning',
        details: ['Must provide specific reasoning when refuting']
      };
    }
  }

  return { passed: true, message: 'Refutation reasoning met' };
}

function checkNotBlindlyAgreeOrDisagree(output: string, _context: RoleContext): ValidationResult {
  const verdicts = output.match(/\b(VALID|INVALID|PARTIAL)\b/g) || [];

  if (verdicts.length < 2) {
    return { passed: true, message: 'Skipped due to insufficient verdicts' };
  }

  const validCount = verdicts.filter(v => v === 'VALID').length;
  const invalidCount = verdicts.filter(v => v === 'INVALID').length;
  const total = verdicts.length;

  // If 90%+ are the same verdict, it's blind acceptance/rejection
  if (validCount / total > 0.9) {
    return {
      passed: false,
      message: 'Blindly accepted almost all issues',
      details: [
        `VALID: ${validCount}/${total}`,
        'Critic should review critically'
      ]
    };
  }

  if (invalidCount / total > 0.9) {
    return {
      passed: false,
      message: 'Blindly rejected almost all issues',
      details: [
        `INVALID: ${invalidCount}/${total}`,
        'Critic should acknowledge valid issues'
      ]
    };
  }

  return { passed: true, message: 'Balanced verdicts' };
}

function checkNotActingAsVerifier(output: string, _context: RoleContext): ValidationResult {
  // Verifier action keywords
  const verifierKeywords = [
    /새로\s*발견/gi,
    /추가\s*이슈/gi,
    /다음\s*취약점/gi,
    /검토\s*결과.*발견/gi
  ];

  const found = verifierKeywords.filter(p => p.test(output));

  if (found.length > 1) {
    return {
      passed: false,
      message: 'Critic performed Verifier role (finding new issues)',
      details: ['Critic should only review existing issues']
    };
  }

  return { passed: true, message: 'Role compliance met' };
}

// =============================================================================
// [ENH: EXHAUST] New Exhaustive Verification Functions
// =============================================================================

/**
 * [ENH: EXHAUST-01] Check ALL 5 categories are explicitly covered
 */
function checkAllCategoriesCovered(output: string, _context: RoleContext): ValidationResult {
  const categories = ['SECURITY', 'CORRECTNESS', 'RELIABILITY', 'MAINTAINABILITY', 'PERFORMANCE'];
  const found = categories.filter(c => output.toUpperCase().includes(c));
  const missing = categories.filter(c => !output.toUpperCase().includes(c));

  if (missing.length > 0) {
    return {
      passed: false,
      message: `Missing category coverage: ${missing.join(', ')}`,
      details: [
        `Found: ${found.join(', ')}`,
        `Missing: ${missing.join(', ')}`,
        'ALL 5 categories must be explicitly reviewed'
      ]
    };
  }

  return { passed: true, message: 'All 5 categories covered' };
}

/**
 * [ENH: EXHAUST-02] Check for negative assertions (checked, no issues)
 */
function checkHasNegativeAssertions(output: string, _context: RoleContext): ValidationResult {
  const negativePatterns = [
    /이슈\s*(없|발견되지)/gi,
    /no\s*issues?\s*(found|detected)/gi,
    /검토\s*완료.*이상\s*없/gi,
    /clean|passed|verified.*no/gi,
    /확인.*문제\s*없/gi,
    /✓|✔|PASS|OK/g
  ];

  const hasNegativeAssertion = negativePatterns.some(p => p.test(output));

  // Check if there are issues raised - if so, negative assertions are less critical
  const hasIssues = /(SEC|COR|REL|MNT|PRF)-\d+/.test(output);

  if (!hasNegativeAssertion && !hasIssues) {
    return {
      passed: false,
      message: 'No negative assertions found - must state what was checked and found clean',
      details: [
        'Example: "SECURITY: Injection check - no issues found"',
        'Must explicitly state clean areas, not just issues'
      ]
    };
  }

  return { passed: true, message: 'Negative assertions present or issues found' };
}

/**
 * [ENH: EXHAUST-03] Check for edge case coverage documentation
 */
function checkEdgeCaseCoverage(output: string, _context: RoleContext): ValidationResult {
  // =============================================================================
  // INTENT-BASED EDGE CASE VALIDATION
  // Instead of hardcoded pattern matching, we:
  // 1. Check for explicit edge case section in output
  // 2. Trust the LLM to evaluate coverage based on semantic understanding
  // 3. Require structured self-reporting of what was considered
  // =============================================================================

  // Check if verifier explicitly documented edge case analysis
  const hasEdgeCaseSection = 
    /edge\s*case|엣지\s*케이스|경계\s*(조건|케이스)|boundary|corner\s*case/i.test(output);

  // Check for structured coverage reporting (the LLM should state what they checked)
  const hasCoverageReport = 
    /checked|verified|analyzed|reviewed|확인|검토|분석/i.test(output) &&
    (
      /no\s*issues?|clean|pass|✓|✔|이상\s*없|문제\s*없/i.test(output) ||
      /(SEC|COR|REL|MNT|PRF)-\d+/.test(output)
    );

  // The key insight: instead of checking WHAT they wrote about,
  // check that they explicitly stated what edge cases they CONSIDERED
  // This trusts the LLM's semantic understanding while ensuring explicit documentation

  if (!hasEdgeCaseSection && !hasCoverageReport) {
    return {
      passed: false,
      message: 'Edge case analysis not documented',
      details: [
        'You must explicitly document your edge case analysis.',
        '',
        'Include a section that considers scenarios beyond the happy path:',
        '',
        '## Edge Case Considerations',
        'For each function/component, think about:',
        '- What happens with unexpected inputs? (null, empty, extreme values)',
        '- What happens when external dependencies fail?',
        '- What happens under concurrent access or race conditions?',
        '- What state mutations or side effects could cause issues?',
        '- What happens when business rules conflict or have exceptions?',
        '',
        'Document what you considered and your findings (issues or clean).'
      ]
    };
  }

  return { 
    passed: true, 
    message: 'Edge case analysis documented'
  };
}

/**
 * [ENH: EXHAUST-04] Check if Critic flags were addressed
 */
function checkCriticFlagsAddressed(_output: string, context: RoleContext): ValidationResult {
  // Get previous Critic rounds
  const criticRounds = context.previousRounds.filter(r => r.role === 'critic');
  if (criticRounds.length === 0) {
    return { passed: true, message: 'No previous Critic rounds' };
  }

  // This is a soft check - specific flag tracking requires session-level state
  // The check verifies that Critic rounds exist (flags may have been raised)
  // Full flag tracking would require storing flags in session state
  return { passed: true, message: `Flag response check - ${criticRounds.length} Critic rounds exist` };
}

/**
 * [ENH: EXHAUST-06] Check if Critic verified category coverage
 */
function checkVerifiedCategoryCoverage(output: string, _context: RoleContext): ValidationResult {
  const coverageCheckPatterns = [
    /coverage.*verified|verified.*coverage/gi,
    /category.*check|check.*category/gi,
    /all\s*categories/gi,
    /5\s*categories|five\s*categories/gi,
    /카테고리.*확인|확인.*카테고리/gi
  ];

  const hasCheck = coverageCheckPatterns.some(p => p.test(output));

  // Also check if Critic flagged missing coverage
  const flaggedMissing = /missing|skipped|누락|빠진/.test(output) &&
                        /category|카테고리/.test(output);

  if (!hasCheck && !flaggedMissing) {
    return {
      passed: false,
      message: 'Did not verify Verifier category coverage',
      details: [
        'Critic must verify ALL 5 categories were checked',
        'If any category was skipped, flag it'
      ]
    };
  }

  return { passed: true, message: 'Category coverage verification done' };
}

/**
 * [ENH: EXHAUST-07] Check if Critic challenged shallow verification
 */
function checkChallengedShallowVerification(output: string, _context: RoleContext): ValidationResult {
  // Check if output discusses edge cases
  const edgeCaseDiscussion = /edge\s*case|boundary|경계|엣지|null|empty/gi.test(output);

  // Check if Critic flagged missing edge case coverage
  const flaggedEdgeCase = /FLAG.*edge|edge.*FLAG|missing.*edge|edge.*missing/gi.test(output) ||
                         /FLAG.*경계|경계.*FLAG|누락.*엣지/gi.test(output);

  // Check for challenge patterns
  const challengePatterns = [
    /happy\s*path.*only|only.*happy\s*path/gi,
    /shallow|superficial|피상적/gi,
    /not\s*thorough|불충분|부족/gi,
    /need.*more.*detail|more.*thorough/gi
  ];

  const hasChallengeOrDiscussion = edgeCaseDiscussion || flaggedEdgeCase ||
                                   challengePatterns.some(p => p.test(output));

  // This is a soft check - if there's no indication either way, pass
  return {
    passed: true,
    message: hasChallengeOrDiscussion
      ? 'Edge case/shallow verification addressed'
      : 'No shallow verification detected (or not challenged)'
  };
}

/**
 * [ENH: EXHAUST-02] Replace old checkNoNewIssuesFromCritic with FLAG-aware version
 */
function checkNoDirectNewIssuesFromCritic(output: string, context: RoleContext): ValidationResult {
  // Check for FLAG format (allowed)
  const flagPattern = /⚠️\s*FLAG\s*(FOR\s*VERIFIER)?:/gi;
  const hasFlags = flagPattern.test(output);

  // Check for direct issue raising (not allowed)
  const directIssuePatterns = [
    /새로운\s*(이슈|문제|취약점)(?!.*FLAG)/gi,
    /추가로\s*발견(?!.*FLAG)/gi,
    /new\s*issue(?!.*FLAG)/gi
  ];

  // Check if new issue IDs are mentioned (not as flags)
  const existingIds = context.existingIssues.map(i => i.id);
  const mentionedIds = output.match(/(SEC|COR|REL|MNT|PRF)-\d+/g) || [];
  const newIds = mentionedIds.filter(id => !existingIds.includes(id));

  // If new IDs exist, check if they're in FLAG format
  const flaggedContent = output.match(/⚠️\s*FLAG[^]*?(?=⚠️|$)/gi) || [];
  const idsInFlagsMatch = flaggedContent.join(' ').match(/(SEC|COR|REL|MNT|PRF)-\d+/g);
  const idsInFlags: string[] = idsInFlagsMatch ? Array.from(idsInFlagsMatch) : [];
  const directNewIds = newIds.filter(id => !idsInFlags.includes(id));

  const hasDirectNewIssues = directIssuePatterns.some(p => p.test(output)) || directNewIds.length > 0;

  if (hasDirectNewIssues) {
    return {
      passed: false,
      message: 'Critic directly raised new issues (must use FLAG format)',
      details: [
        'Critic should not directly raise issues.',
        'Use FLAG format: "⚠️ FLAG FOR VERIFIER: [description]"',
        ...(directNewIds.length > 0 ? [`Direct new IDs: ${directNewIds.join(', ')}`] : [])
      ]
    };
  }

  if (hasFlags) {
    return { passed: true, message: 'Flags used correctly (not direct issues)' };
  }

  return { passed: true, message: 'No new issues raised' };
}

// =============================================================================
// Exports
// =============================================================================

export const ROLE_DEFINITIONS: Record<string, RoleDefinition> = {
  verifier: VERIFIER_ROLE,
  critic: CRITIC_ROLE
};

export const ROLE_PROMPTS: Record<string, RolePrompt> = {
  verifier: VERIFIER_PROMPT,
  critic: CRITIC_PROMPT
};
