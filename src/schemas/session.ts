/**
 * Centralized Session Schemas
 * Single source of truth for Session-related Zod schemas
 * [REFACTOR: ZOD-UNIFY] Phase 2: Session type unification
 */

import { z } from 'zod';
import { IssueCategoryEnum, IssueStorageSchema } from './issue.js';

// =============================================================================
// Session Enums
// =============================================================================

export const SessionPhaseEnum = z.enum([
  'framing',
  'verification',
  'synthesis',
  'implementation',
  're-verification'
]);
export type SessionPhase = z.infer<typeof SessionPhaseEnum>;

export const SessionStatusEnum = z.enum([
  'initialized',
  'framing',
  'verifying',
  'converging',
  'converged',
  'forced_stop',
  'error',
  're-verifying'
]);
export type SessionStatus = z.infer<typeof SessionStatusEnum>;

export const RoundRoleEnum = z.enum(['verifier', 'critic', 'arbiter']);
export type RoundRole = z.infer<typeof RoundRoleEnum>;

export const VerificationModeEnum = z.enum(['standard', 'fast-track', 'single-pass']);
export type VerificationMode = z.infer<typeof VerificationModeEnum>;

export const VerificationTierEnum = z.enum(['screen', 'focused', 'exhaustive']);
export type VerificationTier = z.infer<typeof VerificationTierEnum>;

export const FileLayerEnum = z.enum(['base', 'discovered']);
export type FileLayer = z.infer<typeof FileLayerEnum>;

export const FileChangeStatusEnum = z.enum(['unchanged', 'modified', 'added', 'deleted', 'renamed']);
export type FileChangeStatus = z.infer<typeof FileChangeStatusEnum>;

export const PriorityEnum = z.enum(['MUST', 'SHOULD', 'COULD']);
export type Priority = z.infer<typeof PriorityEnum>;

export const ComplexityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export type Complexity = z.infer<typeof ComplexityEnum>;

export const LanguageEnum = z.enum(['en', 'ko', 'ja', 'zh-CN', 'zh-TW', 'es', 'fr', 'de']);
export type Language = z.infer<typeof LanguageEnum>;

export const VerbosityEnum = z.enum(['minimal', 'normal', 'detailed']);
export type Verbosity = z.infer<typeof VerbosityEnum>;

// =============================================================================
// Context Schemas
// =============================================================================

export const FileContextSchema = z.object({
  path: z.string(),
  content: z.string().optional(),
  dependencies: z.array(z.string()),
  layer: FileLayerEnum,
  addedInRound: z.number().optional(),
  changeStatus: FileChangeStatusEnum.optional(),
  changedLines: z.array(z.number()).optional(),
  diffSummary: z.string().optional(),
  affectedByChanges: z.boolean().optional(),
  skipVerification: z.boolean().optional()
});
export type FileContext = z.infer<typeof FileContextSchema>;

export const ContextDeltaSchema = z.object({
  addedFiles: z.array(z.string()),
  removedFiles: z.array(z.string()),
  baseRound: z.number()
});
export type ContextDelta = z.infer<typeof ContextDeltaSchema>;

// =============================================================================
// Verification Mode Schemas
// =============================================================================

export const VerificationModeConfigSchema = z.object({
  mode: VerificationModeEnum,
  allowEarlyConvergence: z.boolean().optional(),
  skipCriticForCleanCode: z.boolean().optional(),
  requireSelfReview: z.boolean().optional(),
  minRounds: z.number().optional(),
  stableRoundsRequired: z.number().optional()
});
export type VerificationModeConfig = z.infer<typeof VerificationModeConfigSchema>;

// =============================================================================
// Framing Schemas
// =============================================================================

export const VerificationAgendaItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  category: IssueCategoryEnum,
  priority: PriorityEnum,
  estimatedComplexity: ComplexityEnum
});
export type VerificationAgendaItem = z.infer<typeof VerificationAgendaItemSchema>;

export const ContextScopeSchema = z.object({
  targetFiles: z.array(z.string()),
  relatedFiles: z.array(z.string()),
  excludedFiles: z.array(z.string())
});
export type ContextScope = z.infer<typeof ContextScopeSchema>;

export const FramingResultSchema = z.object({
  structuredRequest: z.string(),
  verificationAgenda: z.array(VerificationAgendaItemSchema),
  contextScope: ContextScopeSchema,
  constraints: z.array(z.string()),
  successCriteria: z.array(z.string())
});
export type FramingResult = z.infer<typeof FramingResultSchema>;

// =============================================================================
// Round Schemas
// =============================================================================

export const RoundSchema = z.object({
  number: z.number(),
  role: RoundRoleEnum,
  input: z.union([z.string(), ContextDeltaSchema]),
  output: z.string(),
  timestamp: z.string(),
  issuesRaised: z.array(z.string()),
  issuesResolved: z.array(z.string()),
  contextExpanded: z.boolean(),
  newFilesDiscovered: z.array(z.string())
});
export type Round = z.infer<typeof RoundSchema>;

// =============================================================================
// Checkpoint Schemas
// =============================================================================

export const CheckpointSchema = z.object({
  roundNumber: z.number(),
  timestamp: z.string(),
  contextSnapshot: z.array(z.string()),
  issuesSnapshot: z.array(IssueStorageSchema),
  canRollbackTo: z.boolean()
});
export type Checkpoint = z.infer<typeof CheckpointSchema>;

// =============================================================================
// User Preferences Schema
// =============================================================================

export const UserPreferencesSchema = z.object({
  language: LanguageEnum,
  autonomyLevel: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  verbosity: VerbosityEnum,
  detectedFrom: z.string()
});
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

// =============================================================================
// Concise Mode Config Schema
// =============================================================================

export const ConciseModeConfigSchema = z.object({
  enabled: z.boolean(),
  startRound: z.number(),
  wordLimit: z.number(),
  strictFormat: z.boolean()
});
export type ConciseModeConfig = z.infer<typeof ConciseModeConfigSchema>;

// =============================================================================
// Pipeline State Schemas
// =============================================================================

export const TierResultSchema = z.object({
  tier: VerificationTierEnum,
  filesVerified: z.number(),
  issuesFound: z.number(),
  criticalIssues: z.number(),
  highIssues: z.number(),
  tokensUsed: z.number(),
  timeMs: z.number(),
  shouldEscalate: z.boolean(),
  escalationReason: z.string().optional(),
  escalationScope: z.array(z.string()).optional()
});
export type TierResult = z.infer<typeof TierResultSchema>;

export const EscalationSchema = z.object({
  fromTier: VerificationTierEnum,
  toTier: VerificationTierEnum,
  reason: z.string(),
  files: z.array(z.string())
});
export type Escalation = z.infer<typeof EscalationSchema>;

export const PipelineStateSchema = z.object({
  currentTier: VerificationTierEnum,
  completedTiers: z.array(VerificationTierEnum),
  tierResults: z.array(TierResultSchema),
  totalTokensUsed: z.number(),
  totalTimeMs: z.number(),
  escalations: z.array(EscalationSchema),
  tokenBudgetExceeded: z.boolean().optional(),
  tokenBudgetWarning: z.string().optional()
});
export type PipelineState = z.infer<typeof PipelineStateSchema>;

// =============================================================================
// Dynamic Roles State Schema
// =============================================================================

export const DynamicRolesStateSchema = z.object({
  enabled: z.boolean(),
  domain: z.string(),
  domainConfidence: z.number(),
  verifierPurpose: z.string(),
  criticPurpose: z.string(),
  categories: z.array(z.string()),
  generatedAt: z.string(),
  fromCache: z.boolean()
});
export type DynamicRolesState = z.infer<typeof DynamicRolesStateSchema>;

// =============================================================================
// LLM Eval Config Schema
// =============================================================================

export const LLMEvalConfigSchema = z.object({
  enabled: z.boolean(),
  convergenceEval: z.boolean(),
  severityEval: z.boolean(),
  edgeCaseEval: z.boolean(),
  falsePositiveEval: z.boolean(),
  temperature: z.number().optional(),
  fallbackToPatterns: z.boolean()
});
export type LLMEvalConfig = z.infer<typeof LLMEvalConfigSchema>;

export const LLMEvalResultsSchema = z.object({
  convergence: z.object({
    qualityScore: z.number(),
    categoryScores: z.record(z.string(), z.number()),
    gaps: z.array(z.string()),
    moreRoundsRecommended: z.boolean(),
    evaluatedAt: z.string()
  }).optional(),
  severityAdjustments: z.array(z.object({
    issueId: z.string(),
    originalSeverity: z.string(),
    adjustedSeverity: z.string(),
    reason: z.string()
  })).optional(),
  edgeCaseCoverage: z.object({
    coverageScore: z.number(),
    analyzedCases: z.number(),
    missingCritical: z.number()
  }).optional()
});
export type LLMEvalResults = z.infer<typeof LLMEvalResultsSchema>;
