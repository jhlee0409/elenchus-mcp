/**
 * Token Optimization Types
 * [ENH: TOKEN-OPT] Types for token optimization across the system
 */

import { IssueCategory } from '../types/index.js';

// =============================================================================
// Response Compression
// =============================================================================

/**
 * Compression mode for tool responses
 */
export type CompressionMode = 'full' | 'compact' | 'minimal';

/**
 * Compression configuration
 */
export interface CompressionConfig {
  enabled: boolean;
  mode: CompressionMode;
  /** Abbreviate field names in responses */
  abbreviateFields: boolean;
  /** Omit null/undefined fields */
  omitNullFields: boolean;
  /** Use short enum codes (CRITICAL → C) */
  useShortEnums: boolean;
  /** Maximum items in arrays before truncation */
  maxArrayItems: number;
  /** Maximum string length before truncation */
  maxStringLength: number;
  /** Include summary counts instead of full arrays */
  useSummaryMode: boolean;
}

/**
 * Field abbreviation mapping
 */
export const FIELD_ABBREVIATIONS: Record<string, string> = {
  // Session fields
  sessionId: 'sid',
  currentRound: 'rnd',
  roundNumber: 'rn',
  isConverged: 'cvg',
  convergence: 'cv',

  // Issue fields
  category: 'cat',
  severity: 'sev',
  status: 'sts',
  summary: 'sum',
  description: 'desc',
  evidence: 'evd',
  location: 'loc',
  raisedBy: 'by',
  raisedInRound: 'rin',
  resolvedInRound: 'res',
  resolution: 'rsl',
  criticReviewed: 'cr',
  criticVerdict: 'crd',

  // Context fields
  filesCollected: 'fc',
  affectedFiles: 'af',
  newFilesDiscovered: 'nf',
  contextExpanded: 'ce',

  // Analysis fields
  impactLevel: 'il',
  impactAnalysis: 'ia',
  progressSummary: 'ps',

  // Metrics
  totalAffected: 'ta',
  issuesFound: 'if',
  issuesResolved: 'ir',
  issuesRaised: 'ira',
  tokensUsed: 'tu',
  tokensSaved: 'ts'
};

/**
 * Reverse mapping for decompression
 */
export const FIELD_EXPANSIONS: Record<string, string> = Object.fromEntries(
  Object.entries(FIELD_ABBREVIATIONS).map(([k, v]) => [v, k])
);

/**
 * Enum abbreviations
 */
export const ENUM_ABBREVIATIONS: Record<string, Record<string, string>> = {
  severity: {
    CRITICAL: 'C',
    HIGH: 'H',
    MEDIUM: 'M',
    LOW: 'L'
  },
  category: {
    SECURITY: 'SEC',
    CORRECTNESS: 'COR',
    RELIABILITY: 'REL',
    MAINTAINABILITY: 'MNT',
    PERFORMANCE: 'PRF'
  },
  status: {
    RAISED: 'R',
    CHALLENGED: 'CH',
    RESOLVED: 'RS',
    UNRESOLVED: 'UR',
    DISMISSED: 'D',
    MERGED: 'M',
    SPLIT: 'SP'
  }
};

/**
 * Reverse enum mapping
 */
export const ENUM_EXPANSIONS: Record<string, Record<string, string>> =
  Object.fromEntries(
    Object.entries(ENUM_ABBREVIATIONS).map(([field, mapping]) => [
      field,
      Object.fromEntries(Object.entries(mapping).map(([k, v]) => [v, k]))
    ])
  );

// =============================================================================
// Semantic Caching Enhancement
// =============================================================================

/**
 * Normalized code representation for semantic matching
 */
export interface NormalizedCode {
  /** Original file path */
  filePath: string;
  /** Normalized content hash (whitespace/comments stripped) */
  normalizedHash: string;
  /** Token count for the normalized content */
  tokenCount: number;
  /** Structural signature (function/class names only) */
  structuralSignature: string;
  /** AST-level fingerprint (if available) */
  astFingerprint?: string;
}

/**
 * Semantic cache key with fuzzy matching support
 */
export interface SemanticCacheKey {
  /** Exact content hash (primary key) */
  exactHash: string;
  /** Normalized hash (for fuzzy matching) */
  normalizedHash: string;
  /** Structural signature hash */
  structuralHash: string;
  /** Requirements hash */
  requirementsHash: string;
  /** Optional category filter */
  category?: IssueCategory;
}

/**
 * Semantic cache lookup result
 */
export interface SemanticCacheLookup {
  /** Match type */
  matchType: 'exact' | 'normalized' | 'structural' | 'none';
  /** Match confidence (1.0 for exact, lower for fuzzy) */
  confidence: number;
  /** Cache hit result (if any) */
  result?: unknown;
  /** Estimated tokens saved */
  tokensSaved?: number;
  /** Warning about match quality */
  warning?: string;
}

/**
 * Configuration for semantic caching
 */
export interface SemanticCacheConfig {
  enabled: boolean;
  /** Enable normalized hash matching */
  useNormalizedMatching: boolean;
  /** Enable structural signature matching */
  useStructuralMatching: boolean;
  /** Minimum confidence for using fuzzy match */
  minFuzzyConfidence: number;
  /** Patterns to exclude from fuzzy matching */
  exactMatchPatterns: string[];
}

// =============================================================================
// Adaptive Context Management
// =============================================================================

/**
 * Context size tier
 */
export type ContextSizeTier = 'minimal' | 'standard' | 'extended' | 'full';

/**
 * Adaptive context configuration
 */
export interface AdaptiveContextConfig {
  enabled: boolean;
  /** Maximum tokens for context */
  maxContextTokens: number;
  /** Target utilization (0.7 = 70% of max) */
  targetUtilization: number;
  /** Priority weights for different content types */
  priorities: ContextPriorities;
  /** Strategies for reduction when over budget */
  reductionStrategies: ReductionStrategy[];
}

/**
 * Priority weights for context content
 */
export interface ContextPriorities {
  /** Critical security files */
  securityFiles: number;
  /** Files with changes */
  changedFiles: number;
  /** Dependency hubs */
  dependencyHubs: number;
  /** Test files */
  testFiles: number;
  /** Regular files */
  regularFiles: number;
  /** Comments and whitespace */
  formatting: number;
}

/**
 * Reduction strategy when context exceeds budget
 */
export interface ReductionStrategy {
  name: string;
  /** Order of application (lower = first) */
  order: number;
  /** Estimated reduction percentage */
  reductionPercent: number;
  /** Apply this strategy */
  action: 'truncate_large_files' | 'remove_comments' | 'chunk_files' |
          'prioritize_changed' | 'summarize_unchanged';
}

/**
 * Context budget status
 */
export interface ContextBudgetStatus {
  /** Current token count */
  currentTokens: number;
  /** Maximum allowed */
  maxTokens: number;
  /** Utilization percentage */
  utilization: number;
  /** Whether budget is exceeded */
  exceeded: boolean;
  /** Applied reductions */
  reductionsApplied: string[];
  /** Tokens saved by reductions */
  tokensSaved: number;
  /** Files truncated */
  truncatedFiles: string[];
  /** Files summarized */
  summarizedFiles: string[];
}

// =============================================================================
// Prompt Caching Hints
// =============================================================================

/**
 * Prompt caching hint for Claude API
 */
export interface PromptCacheHint {
  /** Mark content for caching */
  cacheControl: {
    type: 'ephemeral';
  };
  /** Estimated tokens in this cached block */
  estimatedTokens: number;
  /** Content category for cache organization */
  category: 'system' | 'tools' | 'context' | 'examples';
}

/**
 * Cacheable prompt sections
 */
export interface CacheablePromptSections {
  /** System instructions (rarely change) */
  systemInstructions: {
    content: string;
    cacheHint: PromptCacheHint;
  };
  /** Tool definitions (change per session) */
  toolDefinitions: {
    content: string;
    cacheHint: PromptCacheHint;
  };
  /** File context (may be cached across rounds) */
  fileContext: {
    content: string;
    cacheHint: PromptCacheHint;
    filesIncluded: string[];
  };
  /** Examples (cacheable across sessions) */
  examples?: {
    content: string;
    cacheHint: PromptCacheHint;
  };
}

// =============================================================================
// Optimization Statistics
// =============================================================================

/**
 * Token optimization statistics
 */
export interface TokenOptimizationStats {
  sessionId: string;
  /** Tokens before optimization */
  tokensBeforeOptimization: number;
  /** Tokens after optimization */
  tokensAfterOptimization: number;
  /** Total tokens saved */
  tokensSaved: number;
  /** Savings percentage */
  savingsPercent: number;
  /** Breakdown by optimization type */
  breakdown: {
    compression: number;
    caching: number;
    contextReduction: number;
    promptCaching: number;
    chunking: number;
    differential: number;
  };
  /** Estimated cost savings (USD) */
  estimatedCostSavings: number;
  /** Timestamp */
  calculatedAt: string;
}

// =============================================================================
// Default Configurations
// =============================================================================

export const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
  enabled: false,
  mode: 'compact',
  abbreviateFields: true,
  omitNullFields: true,
  useShortEnums: true,
  maxArrayItems: 20,
  maxStringLength: 500,
  useSummaryMode: false
};

export const DEFAULT_SEMANTIC_CACHE_CONFIG: SemanticCacheConfig = {
  enabled: false,
  useNormalizedMatching: true,
  useStructuralMatching: false,
  minFuzzyConfidence: 0.85,
  exactMatchPatterns: ['**/auth/**', '**/security/**', '**/crypto/**']
};

export const DEFAULT_ADAPTIVE_CONTEXT_CONFIG: AdaptiveContextConfig = {
  enabled: false,
  maxContextTokens: 50000,
  targetUtilization: 0.75,
  priorities: {
    securityFiles: 1.0,
    changedFiles: 0.9,
    dependencyHubs: 0.8,
    testFiles: 0.5,
    regularFiles: 0.6,
    formatting: 0.1
  },
  reductionStrategies: [
    { name: 'remove_comments', order: 1, reductionPercent: 10, action: 'remove_comments' },
    { name: 'chunk_large_files', order: 2, reductionPercent: 30, action: 'chunk_files' },
    { name: 'summarize_unchanged', order: 3, reductionPercent: 40, action: 'summarize_unchanged' },
    { name: 'truncate_large', order: 4, reductionPercent: 50, action: 'truncate_large_files' }
  ]
};
