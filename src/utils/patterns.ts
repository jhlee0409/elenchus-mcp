/**
 * Common Regex Patterns
 *
 * Centralized regex patterns used across the codebase.
 * This eliminates duplication and ensures consistent pattern matching.
 */

// =============================================================================
// Issue Parsing Patterns
// =============================================================================

/**
 * Patterns for parsing issue IDs and verdicts from text output
 * Used in: session-lifecycle.ts, lifecycle/index.ts
 */
export const VERDICT_PATTERNS = [
  /(?:issue\s+)?([A-Z]{3}-\d+)[:\s]+(?:verdict[:\s]+)?(VALID|INVALID|PARTIAL)/gi,
  /(SEC|COR|REL|MNT|PRF)-(\d+)[:\s]+(VALID|INVALID|PARTIAL)/gi
] as const;

/**
 * Pattern for parsing issue IDs in various formats
 */
export const ISSUE_ID_PATTERN = /([A-Z]{3})-(\d+)/g;

/**
 * Pattern for severity mentions
 */
export const SEVERITY_PATTERN = /(CRITICAL|HIGH|MEDIUM|LOW)/gi;

// =============================================================================
// Edge Case Analysis Patterns
// =============================================================================

/**
 * Structural indicators for edge case analysis
 * Used in: convergence-helpers.ts
 */
export const EDGE_CASE_STRUCTURAL_INDICATORS = [
  // Section headers (multiple languages)
  /edge\s*case|엣지\s*케이스|경계\s*(조건|케이스)|boundary|corner\s*case/i,
  // Explicit edge case enumeration
  /what\s*if|만약.*라면|when.*fails?|failure\s*scenario/i,
  // Negative/boundary thinking
  /empty|null|없.*경우|zero|maximum|minimum|overflow|underflow/i
] as const;

/**
 * Patterns for negative assertions (confirming something is clean/verified)
 * Used in: convergence-helpers.ts
 */
export const NEGATIVE_ASSERTION_PATTERNS = [
  // Explicit clean statements
  /no\s*(issues?|problems?|concerns?)(\s*found)?/i,
  /이슈\s*없|문제\s*없|이상\s*없/i,
  /clean|passed|verified|확인.*완료/i,
  /✓|✔|✅/,
  // Explicit "checked X, found nothing" pattern
  /(checked|reviewed|examined|verified).*no\s*(issues?|problems?)/i
] as const;

// =============================================================================
// File Reference Patterns
// =============================================================================

/**
 * Pattern for extracting file paths from text
 */
export const FILE_PATH_PATTERN = /(?:^|[\s'"(])([./]?(?:[\w-]+\/)*[\w.-]+\.[a-zA-Z]{1,10})(?::\d+)?(?:$|[\s'")\]])/g;

/**
 * Pattern for line number references (e.g., "file.ts:123")
 */
export const LINE_REFERENCE_PATTERN = /([\w./\\-]+\.[a-zA-Z]+):(\d+)(?:-(\d+))?/g;

// =============================================================================
// Category Patterns
// =============================================================================

/**
 * Pattern for category names
 */
export const CATEGORY_PATTERN = /(SECURITY|CORRECTNESS|RELIABILITY|MAINTAINABILITY|PERFORMANCE)/gi;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a fresh copy of patterns for regex exec operations
 * (Regex with 'g' flag maintains state, so we need fresh copies for each use)
 */
export function getFreshVerdictPatterns(): RegExp[] {
  return VERDICT_PATTERNS.map(p => new RegExp(p.source, p.flags));
}

/**
 * Test if text contains edge case analysis
 */
export function hasEdgeCaseAnalysis(text: string): boolean {
  return EDGE_CASE_STRUCTURAL_INDICATORS.some(pattern => pattern.test(text));
}

/**
 * Test if text contains negative assertions
 */
export function hasNegativeAssertionsInText(text: string): boolean {
  return NEGATIVE_ASSERTION_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Extract all issue IDs from text
 */
export function extractIssueIds(text: string): string[] {
  const pattern = new RegExp(ISSUE_ID_PATTERN.source, ISSUE_ID_PATTERN.flags);
  const matches: string[] = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    matches.push(`${match[1]}-${match[2]}`);
  }
  return [...new Set(matches)]; // Deduplicate
}

/**
 * Parse verdict from text for a specific issue ID
 */
export function parseVerdict(text: string, issueId: string): 'VALID' | 'INVALID' | 'PARTIAL' | null {
  const patterns = getFreshVerdictPatterns();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const matchedId = match[1].includes('-') ? match[1] : `${match[1]}-${match[2]}`;
      if (matchedId.toUpperCase() === issueId.toUpperCase()) {
        return (match[2] || match[3]).toUpperCase() as 'VALID' | 'INVALID' | 'PARTIAL';
      }
    }
  }
  return null;
}
