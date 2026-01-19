/**
 * Centralized Configuration Schemas
 * Single source of truth for all optimization/feature config Zod schemas
 * [REFACTOR: ZOD-UNIFY] Phase 3: Config schema centralization
 * [FIX: SCHEMA-06] Enhanced error messages for all enum fields
 * [FIX: SCHEMA-07] Centralized enumErrorMap from utils
 */

import { z } from 'zod';
import { enumErrorMap } from '../utils/zod-helpers.js';

// =============================================================================
// Verification Mode Schema
// =============================================================================

// [FIX: SCHEMA-06] Verification mode enum with helpful error message
const VerificationModeValues = ['standard', 'fast-track', 'single-pass'] as const;
const VerificationModeEnum = z.enum(VerificationModeValues, { errorMap: enumErrorMap('mode', VerificationModeValues) });

export const VerificationModeSchema = z.object({
  mode: VerificationModeEnum.default('standard').describe(
    'Verification mode: "standard" (full Verifier↔Critic loop), "fast-track" (early convergence for clean code), "single-pass" (Verifier only)'
  ),
  allowEarlyConvergence: z.boolean().optional().describe('Allow convergence before minimum rounds'),
  skipCriticForCleanCode: z.boolean().optional().describe('Skip Critic review if no issues found'),
  requireSelfReview: z.boolean().optional().describe('Require Verifier self-review in single-pass mode'),
  minRounds: z.number().optional().describe('Override default minimum rounds'),
  stableRoundsRequired: z.number().optional().describe('Override stable rounds requirement')
}).optional();
export type VerificationModeInput = z.infer<typeof VerificationModeSchema>;

// =============================================================================
// Differential Analysis Schema
// =============================================================================

export const DifferentialConfigSchema = z.object({
  enabled: z.boolean().default(false).describe('Enable differential analysis to verify only changed code'),
  baseRef: z.string().optional().describe('Base reference for diff: "last-verified", commit hash, branch name, or HEAD~N'),
  includeAffectedDependencies: z.boolean().optional().default(true).describe('Include files that import changed files'),
  maxAffectedDepth: z.number().optional().default(2).describe('Maximum depth for dependency tracing'),
  skipUnchangedTests: z.boolean().optional().default(false).describe('Skip test files that havent changed'),
  fallbackToFullIfNoBaseline: z.boolean().optional().default(true).describe('Fall back to full verification if no baseline exists'),
  includeLineContext: z.boolean().optional().default(false).describe('Include line-level diff context for focused review')
}).optional();
export type DifferentialConfigInput = z.infer<typeof DifferentialConfigSchema>;

// =============================================================================
// Cache Schema
// =============================================================================

// [FIX: SCHEMA-06] Cache confidence enum with helpful error message
const CacheConfidenceValues = ['HIGH', 'MEDIUM', 'LOW'] as const;
const CacheConfidenceEnum = z.enum(CacheConfidenceValues, { errorMap: enumErrorMap('minConfidence', CacheConfidenceValues) });

export const CacheConfigSchema = z.object({
  enabled: z.boolean().default(false).describe('Enable response caching for repeated verifications'),
  ttlSeconds: z.number().optional().default(86400).describe('Time-to-live for cache entries in seconds (default: 24 hours)'),
  minConfidence: CacheConfidenceEnum.optional().default('MEDIUM').describe('Minimum confidence level to use cached results: "HIGH", "MEDIUM", or "LOW"'),
  cacheIssues: z.boolean().optional().default(true).describe('Cache results that contain issues'),
  cacheCleanResults: z.boolean().optional().default(true).describe('Cache results with no issues'),
  // Extended fields from cache/types.ts
  maxEntries: z.number().optional().describe('Maximum number of cache entries'),
  storagePath: z.string().optional().describe('Custom storage path for cache')
}).optional();
export type CacheConfigInput = z.infer<typeof CacheConfigSchema>;

// =============================================================================
// Chunking Schema
// =============================================================================

export const ChunkingConfigSchema = z.object({
  enabled: z.boolean().default(false).describe('Enable selective context (function-level chunking)'),
  maxTokensPerChunk: z.number().optional().default(2000).describe('Maximum tokens per chunk'),
  includeRelated: z.boolean().optional().default(true).describe('Include related symbols in chunks'),
  maxRelatedDepth: z.number().optional().default(1).describe('Maximum depth for related symbol inclusion'),
  minSymbolTokensToChunk: z.number().optional().default(50).describe('Minimum symbol size to chunk separately'),
  // Extended fields from chunking/types.ts
  priorityCategories: z.array(z.string()).optional().describe('Categories to prioritize in chunking'),
  alwaysIncludeTypes: z.array(z.string()).optional().describe('Symbol types to always include')
}).optional();
export type ChunkingConfigInput = z.infer<typeof ChunkingConfigSchema>;

// =============================================================================
// Pipeline Schema
// =============================================================================

// [FIX: SCHEMA-06] Verification tier enum with helpful error message
const VerificationTierValues = ['screen', 'focused', 'exhaustive'] as const;
export const VerificationTierSchema = z.enum(VerificationTierValues, { errorMap: enumErrorMap('tier', VerificationTierValues) });
export type VerificationTierInput = z.infer<typeof VerificationTierSchema>;

export const PipelineConfigSchema = z.object({
  enabled: z.boolean().default(false).describe('Enable tiered verification pipeline'),
  startTier: VerificationTierSchema.optional().default('screen').describe('Starting verification tier'),
  autoEscalate: z.boolean().optional().default(true).describe('Automatically escalate based on findings'),
  maxTotalTokens: z.number().optional().default(50000).describe('Maximum total tokens across all tiers'),
  exhaustivePatterns: z.array(z.string()).optional().describe('File patterns that always get exhaustive verification')
}).optional();
export type PipelineConfigInput = z.infer<typeof PipelineConfigSchema>;

// =============================================================================
// Safeguards Schema
// =============================================================================

// [FIX: SCHEMA-06] Sampling strategy enum with helpful error message
const SamplingStrategyValues = ['UNIFORM', 'RISK_WEIGHTED', 'CHANGE_WEIGHTED', 'DEPENDENCY_WEIGHTED'] as const;
export const SamplingStrategySchema = z.enum(SamplingStrategyValues, { errorMap: enumErrorMap('strategy', SamplingStrategyValues) });
export type SamplingStrategy = z.infer<typeof SamplingStrategySchema>;

export const PeriodicConfigSchema = z.object({
  enabled: z.boolean().default(true).describe('Enable periodic full verification'),
  incrementalThreshold: z.number().optional().default(5).describe('Number of incremental verifications before forcing full scan'),
  maxHoursSinceFull: z.number().optional().default(24).describe('Maximum hours since last full verification'),
  confidenceFloor: z.number().optional().default(0.6).describe('Minimum confidence to avoid full verification'),
  alwaysFullPatterns: z.array(z.string()).optional().describe('File patterns that always require full verification')
}).optional();
export type PeriodicConfig = z.infer<typeof PeriodicConfigSchema>;

export const ConfidenceConfigSchema = z.object({
  minimumAcceptable: z.number().optional().default(0.7).describe('Minimum acceptable confidence score')
}).optional();
export type ConfidenceConfig = z.infer<typeof ConfidenceConfigSchema>;

export const SamplingConfigSchema = z.object({
  enabled: z.boolean().default(true).describe('Enable random sampling of skipped files'),
  rate: z.number().optional().default(10).describe('Sampling rate percentage (0-100)'),
  minSamples: z.number().optional().default(2).describe('Minimum number of files to sample'),
  strategy: SamplingStrategySchema.optional().default('RISK_WEIGHTED').describe('Sampling strategy')
}).optional();
export type SamplingConfig = z.infer<typeof SamplingConfigSchema>;

export const SafeguardsConfigSchema = z.object({
  enabled: z.boolean().default(true).describe('Enable quality safeguards'),
  periodic: PeriodicConfigSchema,
  confidence: ConfidenceConfigSchema,
  sampling: SamplingConfigSchema
}).optional();
export type SafeguardsConfigInput = z.infer<typeof SafeguardsConfigSchema>;

// =============================================================================
// Dynamic Roles Schema
// =============================================================================

export const DynamicRoleSamplingParamsSchema = z.object({
  maxTokens: z.number().optional().default(4000).describe('Maximum tokens for role generation'),
  temperature: z.number().optional().default(0.3).describe('Temperature for role generation (lower = more deterministic)')
}).optional();

export const DynamicRoleConfigSchema = z.object({
  enabled: z.boolean().default(false).describe('Enable dynamic role generation based on requirements'),
  cacheEnabled: z.boolean().optional().default(true).describe('Cache generated roles for similar requirements'),
  maxCacheSize: z.number().optional().default(100).describe('Maximum number of cached role definitions'),
  fallbackToStatic: z.boolean().optional().default(true).describe('Fall back to static roles if generation fails'),
  samplingParams: DynamicRoleSamplingParamsSchema
}).optional();
export type DynamicRoleConfigInput = z.infer<typeof DynamicRoleConfigSchema>;

// =============================================================================
// LLM Evaluation Schema
// =============================================================================

export const LLMEvalConfigSchema = z.object({
  enabled: z.boolean().default(false).describe('Enable LLM-based evaluation (vs pattern matching only)'),
  convergenceEval: z.boolean().optional().default(true).describe('Use LLM for convergence quality assessment'),
  severityEval: z.boolean().optional().default(true).describe('Use LLM for severity classification'),
  edgeCaseEval: z.boolean().optional().default(true).describe('Use LLM to verify edge case analysis quality'),
  falsePositiveEval: z.boolean().optional().default(true).describe('Use LLM to detect false positive issues'),
  temperature: z.number().optional().default(0.3).describe('Temperature for evaluations (lower = more deterministic)'),
  fallbackToPatterns: z.boolean().optional().default(true).describe('Fall back to pattern matching if LLM fails')
}).optional();
export type LLMEvalConfigInput = z.infer<typeof LLMEvalConfigSchema>;
