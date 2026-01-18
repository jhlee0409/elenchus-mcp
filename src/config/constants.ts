/**
 * Elenchus Configuration Constants
 *
 * Centralized constants for all configurable values across the MCP server.
 * These provide sensible defaults that can be overridden via tool parameters.
 */

// =============================================================================
// Application Metadata
// =============================================================================

export const APP_CONSTANTS = {
  /** Application name */
  NAME: 'elenchus-mcp',
  /** Current version - UPDATE THIS ON RELEASE */
  VERSION: '1.2.0',
  /** Graceful shutdown timeout in milliseconds */
  SHUTDOWN_TIMEOUT_MS: 100,
} as const;

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
  /** Maximum characters for target slug in session ID */
  MAX_TARGET_SLUG_LENGTH: 30,
  /** Default stale issue threshold (rounds without mention) */
  DEFAULT_STALE_THRESHOLD: 3,
  /** Maximum characters to keep for user preference detection reference */
  MAX_PREFERENCE_DETECTION_CHARS: 100,
} as const;

// =============================================================================
// Differential Analysis
// =============================================================================

export const DIFFERENTIAL_CONSTANTS = {
  /** Maximum depth for dependency tracing */
  MAX_AFFECTED_DEPTH: 2,
  /** Default base reference for diff */
  DEFAULT_BASE_REF: 'last-verified',
  /** Maximum changed files to process */
  MAX_CHANGED_FILES: 20,
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
  /** Content hash substring length */
  CONTENT_HASH_LENGTH: 16,
  /** Requirements hash substring length */
  REQUIREMENTS_HASH_LENGTH: 8,
  /** Estimated characters per token for savings calculation */
  CHARS_PER_TOKEN: 4,
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
  /** Symbol type priorities for sorting */
  SYMBOL_TYPE_PRIORITY: {
    class: 1,
    function: 2,
    method: 2,
    interface: 3,
    type: 3,
    constant: 4,
    variable: 5,
    export: 6,
    import: 7,
  } as const,
} as const;

// =============================================================================
// Pipeline Configuration
// =============================================================================

export const PIPELINE_CONSTANTS = {
  /** Maximum total tokens across all tiers */
  MAX_TOTAL_TOKENS: 100000,
  /** Default starting tier */
  DEFAULT_START_TIER: 'screen' as const,
  /** Tier order for escalation comparison */
  TIER_ORDER: ['screen', 'focused', 'exhaustive'] as const,
  /** Token budget warning threshold (percentage) */
  TOKEN_BUDGET_WARNING_THRESHOLD: 0.8,
  /** Token budget exceeded threshold (percentage) */
  TOKEN_BUDGET_EXCEEDED_THRESHOLD: 1.0,
  /** Screen tier configuration */
  SCREEN_TIER: {
    BUDGET_MULTIPLIER: 0.3,
    MIN_SEVERITY: 'HIGH' as const,
    MAX_FILES_PER_CATEGORY: 5,
  },
  /** Focused tier configuration */
  FOCUSED_TIER: {
    BUDGET_MULTIPLIER: 0.6,
    MIN_SEVERITY: 'MEDIUM' as const,
    MAX_FILES_PER_CATEGORY: 10,
  },
  /** Exhaustive tier configuration */
  EXHAUSTIVE_TIER: {
    BUDGET_MULTIPLIER: 1.0,
    MIN_SEVERITY: 'LOW' as const,
    MAX_FILES_PER_CATEGORY: 50,
  },
  /** Default escalation rules */
  ESCALATION: {
    CRITICAL_THRESHOLD: 1,
    ISSUES_THRESHOLD: 3,
  },
  /** Default exhaustive patterns */
  EXHAUSTIVE_PATTERNS: ['**/auth/**', '**/security/**', '**/payment/**'],
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
  /** Maximum number of files to sample */
  MAX_SAMPLES: 20,
  /** Minimum acceptable confidence score */
  MIN_ACCEPTABLE_CONFIDENCE: 0.6,
  /** Confidence decay rate per day */
  CONFIDENCE_DECAY_RATE: 0.1,
  /** Estimated missed issues threshold for warning */
  ESTIMATED_MISSED_THRESHOLD: 3,
  /** High risk files threshold for warning */
  HIGH_RISK_FILES_THRESHOLD: 5,
  /** High risk threshold value */
  HIGH_RISK_THRESHOLD: 0.7,
  /** Confidence weights */
  CONFIDENCE_WEIGHTS: {
    FRESHNESS: 0.25,
    CONTEXT_MATCH: 0.25,
    COVERAGE: 0.30,
    HISTORICAL_ACCURACY: 0.20,
  },
  /** Minimum acceptable confidence */
  MINIMUM_ACCEPTABLE_CONFIDENCE: 0.7,
  /** Cache settings */
  CACHE: {
    MAX_AGE_HOURS: 24,
    DECAY_PER_HOUR: 0.02,
    MINIMUM_CONFIDENCE: 0.5,
  },
  /** Chunk settings */
  CHUNK: {
    BOUNDARY_PENALTY: 0.15,
    MIN_DEPENDENCY_COVERAGE: 0.8,
  },
  /** Tier weights for confidence calculation */
  TIER_WEIGHTS: {
    SCREEN: 0.4,
    FOCUSED: 0.7,
    EXHAUSTIVE: 1.0,
    SKIPPED_PENALTY: 0.2,
  },
  /** Sampling settings */
  SAMPLING: {
    HISTORICAL_BOOST: 1.5,
    DIFFERENTIAL_RATE: 15,
    CACHE_RATE: 12,
    PIPELINE_RATE: 10,
    OPTIMIZED_INCREMENTAL_THRESHOLD: 3,
  },
  /** Quality score calculation weights */
  QUALITY_WEIGHTS: {
    CONFIDENCE: 0.4,
    COVERAGE: 0.3,
    INCREMENTAL_DRIFT: 0.2,
    SAMPLING_PRODUCTIVITY: 0.1,
  },
  /** Quality level thresholds */
  QUALITY_THRESHOLDS: {
    EXCELLENT: 0.9,
    GOOD: 0.8,
    ACCEPTABLE: 0.7,
    POOR: 0.5,
  },
  /** Always full verification patterns */
  ALWAYS_FULL_PATTERNS: ['**/auth/**', '**/security/**', '**/payment/**'],
  /** Extended always full patterns (for auto-activation) */
  EXTENDED_ALWAYS_FULL_PATTERNS: [
    '**/utils/**',
    '**/helpers/**',
    '**/common/**',
    '**/shared/**',
    '**/core/**',
  ],
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
  /** Compliance scoring */
  COMPLIANCE_SCORE: {
    BASE: 100,
    ERROR_PENALTY: 20,
    WARNING_PENALTY: 5,
    MIN_SCORE: 0,
    MAX_SCORE: 100,
  },
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
// Display / Output Limits (User-Facing)
// =============================================================================

/**
 * Simple tier-based limits for user-facing tool output displays.
 * These limits affect only what users SEE in tool responses, not what the LLM processes.
 * Safe to adjust based on user preference for verbosity.
 */
export const OUTPUT_TIERS = {
  /** Minimal display: 2-3 items (e.g., unreviewed callers, examples) */
  TINY: 2,
  /** Small display: 3-5 items (e.g., recommendations, guidelines) */
  SMALL: 3,
  /** Medium display: 5 items (e.g., unreviewed files, high-risk files) */
  MEDIUM: 5,
  /** Standard display: 10 items (e.g., pre-analysis, tier files) */
  STANDARD: 10,
  /** Large display: 15 items (e.g., chunks, signatures) */
  LARGE: 15,
  /** Extra large display: 20 items (e.g., cached files, scan lines) */
  XLARGE: 20,
} as const;

// =============================================================================
// LLM Context Limits - CAUTION: Affects Verification Quality
// =============================================================================

/**
 * Limits for LLM context/input. These affect what the LLM can "see" and analyze.
 *
 * WARNING: Fixed truncation can cause the LLM to miss important context.
 * Best practices from research:
 * - Prefer importance-based prioritization over fixed truncation
 * - Use dynamic token budgets based on content complexity
 * - Place important content at the beginning (avoid "lost-in-the-middle" effect)
 * - Operate at ~75% context utilization (not 90%+) for optimal quality
 */
export const LLM_CONTEXT_LIMITS = {
  /** Maximum characters for context truncation. Consider dynamic token budget instead. */
  CONTEXT_TRUNCATION_CHARS: 2000,
  /** Maximum files to include in LLM evaluation. Prioritize by importance when exceeding. */
  MAX_FILES_FOR_EVALUATION: 20,
  /** Maximum lines to scan for signature detection */
  MAX_LINES_FOR_SIGNATURE_SCAN: 20,
} as const;

// Legacy alias for backward compatibility during migration
export const DISPLAY_CONSTANTS = {
  MAX_PREANALYSIS_FILES: OUTPUT_TIERS.STANDARD,
  MAX_CACHED_FILES_SHOWN: OUTPUT_TIERS.XLARGE,
  MAX_CHUNKS_SHOWN: OUTPUT_TIERS.LARGE,
  MAX_TIER_FILES_SHOWN: OUTPUT_TIERS.STANDARD,
  MAX_RECOMMENDED_ACTIONS: OUTPUT_TIERS.SMALL,
  MAX_UNREVIEWED_CALLERS_SHOWN: OUTPUT_TIERS.TINY,
  MAX_UNREVIEWED_FILES_SHOWN: OUTPUT_TIERS.MEDIUM,
  MAX_IMPACT_RECOMMENDATIONS_SHOWN: OUTPUT_TIERS.SMALL,
  MAX_INITIAL_LINES_SCAN: LLM_CONTEXT_LIMITS.MAX_LINES_FOR_SIGNATURE_SCAN,
  MAX_SIGNATURES_SHOWN: OUTPUT_TIERS.LARGE,
  CONTEXT_TRUNCATION_LIMIT: LLM_CONTEXT_LIMITS.CONTEXT_TRUNCATION_CHARS,
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
  /** Risk level thresholds for total affected files */
  RISK_LEVEL: {
    CRITICAL_THRESHOLD: 10,
    HIGH_THRESHOLD: 5,
    MEDIUM_THRESHOLD: 2,
  },
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
  /** Critical file threshold (max importance * factor) */
  CRITICAL_THRESHOLD_FACTOR: 0.5,
  /** Max affected files to display */
  MAX_AFFECTED_FILES_DISPLAY: 10,
  /** Max critical files to display */
  MAX_CRITICAL_FILES_DISPLAY: 5,
  /** Min round to start coverage check */
  COVERAGE_CHECK_MIN_ROUND: 3,
  /** Min round for low coverage check */
  LOW_COVERAGE_CHECK_MIN_ROUND: 5,
  /** Low coverage threshold (50%) */
  LOW_COVERAGE_THRESHOLD: 0.5,
  /** Scope drift threshold (50%) */
  DRIFT_THRESHOLD: 0.5,
  /** Min files for drift check */
  MIN_FILES_FOR_DRIFT: 3,
  /** Default max dependency depth */
  DEFAULT_MAX_DEPTH: 100,
  /** Side effect warning threshold */
  SIDE_EFFECT_WARNING_THRESHOLD: 5,
  /** Ripple effect max depth */
  RIPPLE_EFFECT_MAX_DEPTH: 3,
  /** File importance threshold */
  FILE_IMPORTANCE_THRESHOLD: 3,
  /** Maximum callers to track in impact analysis */
  MAX_CALLERS_TRACKED: 10,
  /** Maximum dependencies to track in impact analysis */
  MAX_DEPENDENCIES_TRACKED: 5,
  /** Suspicion score thresholds for quick agreement detection */
  QUICK_AGREEMENT: {
    MIN_SUSPICION_SCORE: 50,
    WARNING_SCORE: 70,
    AGREEMENT_CONTRIBUTION: 40,
    SHORT_RESPONSE_CONTRIBUTION: 30,
    ALL_VALID_CONTRIBUTION: 30,
    MIN_RESPONSE_LENGTH: 300,
    MIN_ISSUES_FOR_ALL_VALID: 2,
  },
} as const;

// =============================================================================
// File Analysis Configuration
// =============================================================================

export const FILE_ANALYSIS_CONSTANTS = {
  /** Supported file extensions for analysis */
  SUPPORTED_EXTENSIONS: ['.ts', '.tsx', '.js', '.jsx', '.mjs'] as const,
  /** Extension attempts for import resolution */
  IMPORT_RESOLUTION_EXTENSIONS: ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'] as const,
  /** File importance calculation: dependents weight multiplier */
  DEPENDENTS_WEIGHT: 2,
} as const;

// =============================================================================
// Baseline Configuration
// =============================================================================

export const BASELINE_CONSTANTS = {
  /** Hash substring length for project hash */
  PROJECT_HASH_LENGTH: 16,
  /** Maximum history entries to keep */
  MAX_HISTORY_ENTRIES: 10,
} as const;

// =============================================================================
// Verification Mode Defaults
// =============================================================================

export const VERIFICATION_MODE_CONSTANTS = {
  /** Default verification mode */
  DEFAULT_MODE: 'standard' as const,
  /** Mode configurations */
  MODES: {
    STANDARD: {
      MIN_ROUNDS: 3,
      CRITIC_REQUIRED: true,
    },
    FAST_TRACK: {
      MIN_ROUNDS: 1,
      CRITIC_OPTIONAL: true,
    },
    SINGLE_PASS: {
      MIN_ROUNDS: 1,
      CRITIC_REQUIRED: false,
    },
  },
} as const;
