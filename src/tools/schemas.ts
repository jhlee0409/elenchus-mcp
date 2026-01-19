/**
 * Elenchus MCP Tool Schemas
 * All Zod schemas for tool input validation
 * [REFACTOR: ZOD-UNIFY] Config schemas now imported from centralized location
 * [FIX: SCHEMA-06] Enhanced error messages for all enum fields
 * [FIX: SCHEMA-07] Centralized enumErrorMap from utils
 */

import { z } from 'zod';
import { IssueInputSchema } from '../schemas/index.js';
import { enumErrorMap } from '../utils/zod-helpers.js';

// =============================================================================
// Configuration Schemas (imported for local use and re-exported)
// =============================================================================

// Import for local use within this file
import {
  VerificationModeSchema,
  DifferentialConfigSchema,
  CacheConfigSchema,
  ChunkingConfigSchema,
  PipelineConfigSchema,
  SafeguardsConfigSchema,
  DynamicRoleConfigSchema,
  LLMEvalConfigSchema,
  VerificationTierSchema,
  SamplingStrategySchema,
  PeriodicConfigSchema,
  ConfidenceConfigSchema,
  SamplingConfigSchema,
  DynamicRoleSamplingParamsSchema
} from '../config/schemas.js';

// Re-export for external consumers
export {
  VerificationModeSchema,
  DifferentialConfigSchema,
  CacheConfigSchema,
  ChunkingConfigSchema,
  PipelineConfigSchema,
  SafeguardsConfigSchema,
  DynamicRoleConfigSchema,
  LLMEvalConfigSchema,
  VerificationTierSchema,
  SamplingStrategySchema,
  PeriodicConfigSchema,
  ConfidenceConfigSchema,
  SamplingConfigSchema,
  DynamicRoleSamplingParamsSchema
};

// Re-export inferred types
export type {
  VerificationModeInput,
  DifferentialConfigInput,
  CacheConfigInput,
  ChunkingConfigInput,
  PipelineConfigInput,
  SafeguardsConfigInput,
  DynamicRoleConfigInput,
  LLMEvalConfigInput,
  VerificationTierInput,
  SamplingStrategy,
  PeriodicConfig,
  ConfidenceConfig,
  SamplingConfig
} from '../config/schemas.js';

// =============================================================================
// Session Lifecycle Schemas
// =============================================================================

export const StartSessionSchema = z.object({
  target: z.string().describe('Target path to verify (file or directory)'),
  requirements: z.string().describe('User verification requirements'),
  workingDir: z.string().describe('Working directory for relative paths'),
  maxRounds: z.number().optional().default(10).describe('Maximum rounds before forced stop'),
  // [ENH: ONE-SHOT] Verification mode for one-shot verification
  verificationMode: VerificationModeSchema.describe(
    'Verification mode configuration for controlling convergence behavior. Use "fast-track" or "single-pass" for one-shot verification.'
  ),
  // [ENH: DIFF] Differential analysis configuration
  differentialConfig: DifferentialConfigSchema.describe(
    'Differential analysis configuration. When enabled, only verifies code that has changed since the last verification baseline.'
  ),
  // [ENH: CACHE] Response caching configuration
  cacheConfig: CacheConfigSchema.describe(
    'Response caching configuration. When enabled, caches verification results to skip re-verification of unchanged files.'
  ),
  // [ENH: CHUNK] Selective context chunking configuration
  chunkingConfig: ChunkingConfigSchema.describe(
    'Selective context configuration. When enabled, chunks files into function-level pieces for more efficient verification.'
  ),
  // [ENH: TIERED] Tiered pipeline configuration
  pipelineConfig: PipelineConfigSchema.describe(
    'Tiered pipeline configuration. When enabled, uses screen→focused→exhaustive verification tiers with auto-escalation.'
  ),
  // [ENH: SAFEGUARDS] Quality safeguards configuration
  safeguardsConfig: SafeguardsConfigSchema.describe(
    'Quality safeguards configuration. Ensures verification quality when using optimizations (caching, chunking, tiered).'
  ),
  // [ENH: DYNAMIC-ROLES] Dynamic role generation configuration
  dynamicRoleConfig: DynamicRoleConfigSchema.describe(
    'Dynamic role generation configuration. When enabled, generates customized Verifier/Critic roles based on requirements using LLM.'
  ),
  // [ENH: LLM-EVAL] LLM-based evaluation configuration
  llmEvalConfig: LLMEvalConfigSchema.describe(
    'LLM-based evaluation configuration. When enabled, uses LLM reasoning for convergence, severity, edge case, and false positive evaluation.'
  )
});

export const GetContextSchema = z.object({
  sessionId: z.string().describe('Session ID')
});

// [FIX: SCHEMA-06] Role enum with helpful error message
const RoleEnumValues = ['verifier', 'critic'] as const;
const RoleEnum = z.enum(RoleEnumValues, { errorMap: enumErrorMap('role', RoleEnumValues) });

export const SubmitRoundSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  role: RoleEnum.describe('Role of this round: must be "verifier" or "critic"'),
  output: z.string().describe('Complete output from the agent'),
  // [FIX: SCHEMA-03] Use centralized IssueInputSchema
  issuesRaised: z.array(IssueInputSchema).optional().describe('New issues raised in this round'),
  issuesResolved: z.array(z.string()).optional().describe('Issue IDs resolved in this round')
});

// [FIX: SCHEMA-05] Custom verdict enum with helpful error message (extra guidance for common mistake)
const VerdictEnumValues = ['PASS', 'FAIL', 'CONDITIONAL'] as const;
const VerdictEnum = z.enum(VerdictEnumValues, {
  errorMap: (issue, ctx) => {
    if (issue.code === 'invalid_enum_value') {
      return {
        message: `Invalid verdict "${ctx.data}". Must be exactly one of: "PASS", "FAIL", or "CONDITIONAL" (case-sensitive, no additional text). Do not include explanations in the verdict field.`
      };
    }
    return { message: ctx.defaultError };
  }
});

export const EndSessionSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  verdict: VerdictEnum.describe('Final verdict: must be exactly "PASS", "FAIL", or "CONDITIONAL"')
});

// =============================================================================
// Issue Management Schemas
// =============================================================================

// [FIX: SCHEMA-06] Status enum with helpful error message
const IssueStatusFilterValues = ['all', 'unresolved', 'critical'] as const;
const IssueStatusFilterEnum = z.enum(IssueStatusFilterValues, { errorMap: enumErrorMap('status', IssueStatusFilterValues) });

export const GetIssuesSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  status: IssueStatusFilterEnum.optional().default('all').describe('Filter issues: "all", "unresolved", or "critical"')
});

export const CheckpointSchema = z.object({
  sessionId: z.string().describe('Session ID')
});

export const RollbackSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  toRound: z.number().describe('Round number to rollback to')
});

// [ENH: ONE-SHOT] In-session fix application schema
export const ApplyFixSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  issueId: z.string().describe('Issue ID being fixed'),
  fixDescription: z.string().describe('Description of the fix applied'),
  filesModified: z.array(z.string()).describe('List of files modified'),
  triggerReVerify: z.boolean().optional().default(true).describe('Whether to trigger re-verification after fix')
});

// =============================================================================
// Re-verification Schemas
// =============================================================================

// [ENH: REVERIFY] Re-verification Phase schema
export const StartReVerificationSchema = z.object({
  previousSessionId: z.string().describe('ID of the original verification session'),
  targetIssueIds: z.array(z.string()).optional().describe('Specific issue IDs to re-verify (if empty, all resolved issues)'),
  workingDir: z.string().describe('Working directory for relative paths'),
  maxRounds: z.number().optional().default(6).describe('Maximum rounds for re-verification (default: 6)')
});

// =============================================================================
// Mediator Tool Schemas
// =============================================================================

export const RippleEffectSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  changedFile: z.string().describe('File that will be changed'),
  changedFunction: z.string().optional().describe('Specific function that will be changed')
});

export const MediatorSummarySchema = z.object({
  sessionId: z.string().describe('Session ID')
});

// =============================================================================
// Role Enforcement Schemas
// =============================================================================

export const GetRolePromptSchema = z.object({
  role: RoleEnum.describe('Role to get prompt for: must be "verifier" or "critic"')
});

export const RoleSummarySchema = z.object({
  sessionId: z.string().describe('Session ID')
});

export const UpdateRoleConfigSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  strictMode: z.boolean().optional().describe('Reject non-compliant rounds'),
  minComplianceScore: z.number().optional().describe('Minimum compliance score (0-100)'),
  requireAlternation: z.boolean().optional().describe('Require verifier/critic alternation')
});

// =============================================================================
// Differential Analysis Schemas
// =============================================================================

// [ENH: DIFF] Baseline and differential analysis schemas
export const SaveBaselineSchema = z.object({
  sessionId: z.string().describe('Session ID of successful verification to use as baseline'),
  workingDir: z.string().describe('Working directory for the project')
});

export const GetDiffSummarySchema = z.object({
  workingDir: z.string().describe('Working directory for the project'),
  baseRef: z.string().optional().describe('Base reference: "last-verified", commit hash, or branch (default: last-verified)')
});

export const GetProjectHistorySchema = z.object({
  workingDir: z.string().describe('Working directory for the project')
});

// =============================================================================
// Cache Management Schemas
// =============================================================================

// [ENH: CACHE] Cache management schemas
export const GetCacheStatsSchema = z.object({
  workingDir: z.string().optional().describe('Working directory (optional, for context)')
});

export const ClearCacheSchema = z.object({
  confirm: z.boolean().describe('Confirm cache clear operation')
});

// =============================================================================
// Pipeline Management Schemas
// =============================================================================

// [ENH: TIERED] Pipeline management schemas
export const GetPipelineStatusSchema = z.object({
  sessionId: z.string().describe('Session ID')
});

// [FIX: SCHEMA-06] Target tier enum with helpful error message
const EscalateTierValues = ['focused', 'exhaustive'] as const;
const EscalateTierEnum = z.enum(EscalateTierValues, { errorMap: enumErrorMap('targetTier', EscalateTierValues) });

export const EscalateTierSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  targetTier: EscalateTierEnum.describe('Target tier to escalate to: "focused" or "exhaustive"'),
  reason: z.string().describe('Reason for escalation'),
  scope: z.array(z.string()).optional().describe('Files to focus on (if any)')
});

export const CompleteTierSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  filesVerified: z.number().describe('Number of files verified'),
  issuesFound: z.number().describe('Total issues found'),
  criticalIssues: z.number().describe('Critical issues found'),
  highIssues: z.number().describe('High issues found'),
  tokensUsed: z.number().describe('Tokens used in this tier'),
  timeMs: z.number().describe('Time taken in milliseconds')
});

// =============================================================================
// Quality Safeguards Schemas
// =============================================================================

// [ENH: SAFEGUARDS] Safeguards tool schemas
export const GetSafeguardsStatusSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  projectId: z.string().describe('Project ID (usually workingDir)')
});

// [FIX: SCHEMA-06] Confidence source enum with helpful error message
const ConfidenceSourceValues = ['full', 'cache', 'chunk', 'tiered', 'sampled'] as const;
const ConfidenceSourceEnum = z.enum(ConfidenceSourceValues, { errorMap: enumErrorMap('source', ConfidenceSourceValues) });

// [FIX: SCHEMA-06] Severity enum with helpful error message
const SeverityEnumValues = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
const SeverityEnumLocal = z.enum(SeverityEnumValues, { errorMap: enumErrorMap('severity', SeverityEnumValues) });

export const UpdateConfidenceSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  fileConfidences: z.array(z.object({
    file: z.string(),
    source: ConfidenceSourceEnum.describe('Verification source: "full", "cache", "chunk", "tiered", or "sampled"'),
    score: z.number(),
    cacheAge: z.number().optional(),
    chunkCoverage: z.number().optional(),
    tierLevel: z.string().optional()
  })).describe('Confidence scores for each file')
});

export const RecordSamplingResultSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  filePath: z.string().describe('Path of the sampled file'),
  issuesFound: z.number().describe('Number of issues found'),
  severities: z.array(SeverityEnumLocal).describe('Severities of issues found: array of "CRITICAL", "HIGH", "MEDIUM", or "LOW"')
});

export const CheckConvergenceAllowedSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  strictMode: z.boolean().optional().default(false).describe('Use strict quality requirements')
});
