/**
 * Centralized Issue Schemas
 * Single source of truth for all Issue-related Zod schemas
 * [FIX: SCHEMA-03] Unified schema definitions to prevent mismatches
 */

import { z } from 'zod';

// =============================================================================
// Base Enums (Single Source of Truth)
// =============================================================================

export const SeverityEnum = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
export type Severity = z.infer<typeof SeverityEnum>;

export const IssueCategoryEnum = z.enum([
  'SECURITY',
  'CORRECTNESS',
  'RELIABILITY',
  'MAINTAINABILITY',
  'PERFORMANCE'
]);
export type IssueCategory = z.infer<typeof IssueCategoryEnum>;

export const IssueStatusEnum = z.enum([
  'RAISED',
  'CHALLENGED',
  'RESOLVED',
  'UNRESOLVED',
  'DISMISSED',
  'MERGED',
  'SPLIT'
]);
export type IssueStatus = z.infer<typeof IssueStatusEnum>;

export const CriticVerdictEnum = z.enum(['VALID', 'INVALID', 'PARTIAL']);
export type CriticVerdict = z.infer<typeof CriticVerdictEnum>;

export const RoleEnum = z.enum(['verifier', 'critic']);
export type Role = z.infer<typeof RoleEnum>;

export const TriggeredByEnum = z.enum(['verifier', 'critic', 'mediator']);
export type TriggeredBy = z.infer<typeof TriggeredByEnum>;

export const IssueTransitionTypeEnum = z.enum([
  'DISCOVERED',
  'ESCALATED',
  'DEMOTED',
  'MERGED_INTO',
  'SPLIT_FROM',
  'INVALIDATED',
  'VALIDATED',
  'REFINED'
]);
export type IssueTransitionType = z.infer<typeof IssueTransitionTypeEnum>;

// =============================================================================
// Impact Analysis Schemas
// =============================================================================

export const ImpactTypeEnum = z.enum(['DIRECT', 'INDIRECT', 'TEST']);
export type ImpactType = z.infer<typeof ImpactTypeEnum>;

export const RiskLevelEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type RiskLevel = z.infer<typeof RiskLevelEnum>;

export const ImpactedCodeSchema = z.object({
  file: z.string(),
  functions: z.array(z.string()).optional(),
  impactType: ImpactTypeEnum,
  depth: z.number()
});
export type ImpactedCode = z.infer<typeof ImpactedCodeSchema>;

export const IssueImpactAnalysisSchema = z.object({
  callers: z.array(ImpactedCodeSchema),
  dependencies: z.array(ImpactedCodeSchema),
  relatedTests: z.array(z.string()),
  affectedFunctions: z.array(z.string()),
  cascadeDepth: z.number(),
  totalAffectedFiles: z.number(),
  riskLevel: RiskLevelEnum,
  summary: z.string()
});
export type IssueImpactAnalysis = z.infer<typeof IssueImpactAnalysisSchema>;

// =============================================================================
// Issue Transition Schema
// =============================================================================

export const IssueTransitionSchema = z.object({
  type: IssueTransitionTypeEnum,
  fromStatus: IssueStatusEnum,
  toStatus: IssueStatusEnum,
  fromSeverity: SeverityEnum.optional(),
  toSeverity: SeverityEnum.optional(),
  round: z.number(),
  reason: z.string(),
  evidence: z.string().optional(),
  triggeredBy: TriggeredByEnum,
  timestamp: z.string()
});
export type IssueTransition = z.infer<typeof IssueTransitionSchema>;

// =============================================================================
// Issue Input Schema (for MCP tool input - what LLM sends)
// =============================================================================

/**
 * Schema for issues submitted via elenchus_submit_round
 * Accepts both 'description' and 'why' fields for compatibility with
 * ConstrainedIssueSchema (LLM output format) and legacy formats
 */
export const IssueInputSchema = z.object({
  id: z.string(),
  category: IssueCategoryEnum,
  severity: SeverityEnum,
  summary: z.string(),
  location: z.string(),
  // Accept both description and why for flexibility
  description: z.string().optional(),
  why: z.string().optional(),
  evidence: z.string()
});
export type IssueInput = z.infer<typeof IssueInputSchema>;

// =============================================================================
// Issue Storage Schema (internal storage with all fields)
// =============================================================================

/**
 * Full Issue schema for internal storage and session persistence
 */
export const IssueStorageSchema = z.object({
  id: z.string(),
  category: IssueCategoryEnum,
  severity: SeverityEnum,
  summary: z.string(),
  location: z.string(),
  description: z.string(),
  evidence: z.string(),
  raisedBy: RoleEnum,
  raisedInRound: z.number(),
  status: IssueStatusEnum,
  // Optional fields
  suggestedFix: z.string().optional(),
  resolvedInRound: z.number().optional(),
  resolution: z.string().optional(),
  challengedInRound: z.number().optional(),
  // Critic review
  criticReviewed: z.boolean().optional(),
  criticVerdict: CriticVerdictEnum.optional(),
  criticReviewRound: z.number().optional(),
  // Lifecycle tracking
  transitions: z.array(IssueTransitionSchema).optional(),
  mergedInto: z.string().optional(),
  splitFrom: z.string().optional(),
  splitInto: z.array(z.string()).optional(),
  relatedIssues: z.array(z.string()).optional(),
  originalSeverity: SeverityEnum.optional(),
  discoveredDuringDebate: z.boolean().optional(),
  // [REFACTOR: ZOD-UNIFY] Impact analysis now properly typed
  impactAnalysis: IssueImpactAnalysisSchema.optional(),
  // Regression tracking
  isRegression: z.boolean().optional(),
  regressionOf: z.string().optional()
});
export type IssueStorage = z.infer<typeof IssueStorageSchema>;

// =============================================================================
// Issue Output Schema (for MCP tool output - what we return)
// =============================================================================

/**
 * Schema for issues returned from MCP tools
 * Subset of IssueStorageSchema for API responses
 */
export const IssueOutputSchema = z.object({
  id: z.string(),
  category: IssueCategoryEnum,
  severity: SeverityEnum,
  summary: z.string(),
  location: z.string(),
  description: z.string(),
  evidence: z.string(),
  status: IssueStatusEnum,
  raisedBy: RoleEnum,
  raisedInRound: z.number(),
  criticReviewed: z.boolean().optional(),
  criticVerdict: CriticVerdictEnum.optional()
});
export type IssueOutput = z.infer<typeof IssueOutputSchema>;

// =============================================================================
// Constrained Issue Schema (for LLM output format guidance)
// =============================================================================

/**
 * Constrained schema for LLM structured output
 * Uses 'why' instead of 'description' for more specific prompting
 * Has stricter validation (regex, min/max lengths)
 */
export const ConstrainedIssueSchema = z.object({
  id: z.string()
    .regex(/^(SEC|COR|REL|MNT|PRF)-\d{2,3}$/, 'ID format: SEC-01, COR-02, etc.')
    .describe('Issue ID in format CATEGORY-NN'),
  category: IssueCategoryEnum
    .describe('One of 5 verification categories'),
  severity: SeverityEnum
    .describe('Impact severity'),
  summary: z.string()
    .min(10, 'Summary too short')
    .max(100, 'Summary max 100 chars')
    .describe('One-line issue summary'),
  location: z.string()
    .regex(/^[^:]+:\d+(-\d+)?$/, 'Format: file.ts:42 or file.ts:42-50')
    .describe('file:line or file:line-line'),
  evidence: z.string()
    .min(5, 'Evidence required')
    .max(500, 'Evidence max 500 chars')
    .describe('Code snippet showing the issue'),
  why: z.string()
    .min(20, 'Explanation required')
    .max(300, 'Explanation max 300 chars')
    .describe('Why this is a problem')
});
export type ConstrainedIssue = z.infer<typeof ConstrainedIssueSchema>;

// =============================================================================
// Helper: Convert IssueInput to IssueStorage
// =============================================================================

/**
 * Resolves description from input (supports both description and why fields)
 */
export function resolveDescription(input: IssueInput): string {
  return input.description || input.why || input.summary;
}
