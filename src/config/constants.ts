/**
 * Elenchus Configuration Constants
 *
 * Centralized constants for all configurable values across the MCP server.
 * These provide sensible defaults that can be overridden via tool parameters.
 */

// =============================================================================
// Session & Verification Limits
// =============================================================================

export const SESSION_CONSTANTS = {
  /** Maximum rounds before forced stop */
  MAX_ROUNDS: 10,
  /** Minimum rounds before allowing convergence (standard mode) */
  MIN_ROUNDS_STANDARD: 3,
  /** Minimum rounds for fast-track mode */
  MIN_ROUNDS_FAST_TRACK: 1,
  /** Minimum rounds for single-pass mode */
  MIN_ROUNDS_SINGLE_PASS: 1,
  /** Number of stable rounds required for convergence */
  STABLE_ROUNDS_REQUIRED: 2,
  /** Maximum session ID length */
  MAX_SESSION_ID_LENGTH: 100,
  /** Maximum rounds for re-verification */
  MAX_RE_VERIFY_ROUNDS: 6,
} as const;

// =============================================================================
// Differential Analysis
// =============================================================================

export const DIFFERENTIAL_CONSTANTS = {
  /** Maximum depth for dependency tracing */
  MAX_AFFECTED_DEPTH: 2,
  /** Default base reference for diff */
  DEFAULT_BASE_REF: 'last-verified',
} as const;

// =============================================================================
// Cache Configuration
// =============================================================================

export const CACHE_CONSTANTS = {
  /** Default TTL in seconds (24 hours) */
  DEFAULT_TTL_SECONDS: 86400,
  /** Maximum cache entries before eviction */
  MAX_CACHE_ENTRIES: 1000,
  /** Default minimum confidence to use cache */
  DEFAULT_MIN_CONFIDENCE: 'MEDIUM' as const,
} as const;

// =============================================================================
// Chunking Configuration
// =============================================================================

export const CHUNKING_CONSTANTS = {
  /** Maximum tokens per chunk */
  MAX_TOKENS_PER_CHUNK: 2000,
  /** Maximum depth for related symbol inclusion */
  MAX_RELATED_DEPTH: 1,
  /** Minimum symbol size to chunk separately */
  MIN_SYMBOL_TOKENS_TO_CHUNK: 50,
} as const;

// =============================================================================
// Pipeline Configuration
// =============================================================================

export const PIPELINE_CONSTANTS = {
  /** Maximum total tokens across all tiers */
  MAX_TOTAL_TOKENS: 50000,
  /** Default starting tier */
  DEFAULT_START_TIER: 'screen' as const,
} as const;

// =============================================================================
// Safeguards Configuration
// =============================================================================

export const SAFEGUARDS_CONSTANTS = {
  /** Number of incremental verifications before forcing full scan */
  INCREMENTAL_THRESHOLD: 5,
  /** Maximum hours since last full verification */
  MAX_HOURS_SINCE_FULL: 24,
  /** Default sampling rate percentage (0-100) */
  DEFAULT_SAMPLING_RATE: 10,
  /** Minimum number of files to sample */
  MIN_SAMPLES: 2,
  /** Minimum acceptable confidence score */
  MIN_ACCEPTABLE_CONFIDENCE: 0.6,
  /** Confidence decay rate per day */
  CONFIDENCE_DECAY_RATE: 0.1,
} as const;

// =============================================================================
// Auto-Loop / Sampling Configuration
// =============================================================================

export const AUTO_LOOP_CONSTANTS = {
  /** Maximum rounds before forcibly stopping */
  MAX_ROUNDS: 10,
  /** Maximum tokens per LLM request */
  MAX_TOKENS_PER_REQUEST: 4000,
  /** Minimum rounds before allowing convergence */
  MIN_ROUNDS: 2,
} as const;

// =============================================================================
// Role Enforcement Configuration
// =============================================================================

export const ROLE_CONSTANTS = {
  /** Default minimum compliance score (0-100) */
  DEFAULT_MIN_COMPLIANCE_SCORE: 60,
  /** Compliance score threshold for warnings */
  COMPLIANCE_WARNING_THRESHOLD: 70,
  /** Maximum verifier prompt preview length */
  MAX_PROMPT_PREVIEW_LENGTH: 500,
  /** Maximum guidelines to show in response */
  MAX_GUIDELINES_SHOWN: 3,
} as const;

// =============================================================================
// Convergence Configuration
// =============================================================================

export const CONVERGENCE_CONSTANTS = {
  /** Required categories for full coverage */
  REQUIRED_CATEGORIES: ['SECURITY', 'CORRECTNESS', 'RELIABILITY', 'MAINTAINABILITY', 'PERFORMANCE'] as const,
  /** Minimum category coverage rate for convergence */
  MIN_CATEGORY_COVERAGE: 1.0,
  /** Minimum impact coverage rate for convergence */
  MIN_IMPACT_COVERAGE: 0.7,
  /** Issue transition stability window (rounds) */
  ISSUE_STABILITY_WINDOW: 2,
  /** Expected total issues per category for coverage calculation */
  CATEGORY_TOTALS: {
    SECURITY: 8,
    CORRECTNESS: 6,
    RELIABILITY: 4,
    MAINTAINABILITY: 4,
    PERFORMANCE: 4
  } as const,
} as const;

// =============================================================================
// Display / Output Limits
// =============================================================================

export const DISPLAY_CONSTANTS = {
  /** Maximum files to show in pre-analysis */
  MAX_PREANALYSIS_FILES: 10,
  /** Maximum cached file paths to show */
  MAX_CACHED_FILES_SHOWN: 20,
  /** Maximum chunks to show */
  MAX_CHUNKS_SHOWN: 15,
  /** Maximum files for tier to show */
  MAX_TIER_FILES_SHOWN: 10,
} as const;

// =============================================================================
// Issue Lifecycle
// =============================================================================

export const ISSUE_CONSTANTS = {
  /** Maximum related issues to track */
  MAX_RELATED_ISSUES: 10,
  /** Maximum issue description length */
  MAX_DESCRIPTION_LENGTH: 2000,
  /** Maximum evidence length */
  MAX_EVIDENCE_LENGTH: 1000,
} as const;

// =============================================================================
// Mediator Configuration
// =============================================================================

export const MEDIATOR_CONSTANTS = {
  /** Maximum cascade depth for ripple effect analysis */
  MAX_CASCADE_DEPTH: 3,
  /** Maximum affected files to track */
  MAX_AFFECTED_FILES: 50,
  /** Intervention priority levels */
  PRIORITY_LEVELS: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const,
} as const;
