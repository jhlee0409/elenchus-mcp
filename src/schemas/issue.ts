/**
 * Centralized Issue Schemas
 * Single source of truth for all Issue-related Zod schemas
 * [FIX: SCHEMA-03] Unified schema definitions to prevent mismatches
 * [FIX: SCHEMA-06] Enhanced error messages for all enum fields
 */

import { z } from 'zod';

// =============================================================================
// Helper: Create enum with descriptive error messages
// =============================================================================

/**
 * Creates a custom error map for enum validation
 * [FIX: SCHEMA-06] Reduces LLM confusion by clearly stating valid values
 */
function enumErrorMap(fieldName: string, validValues: readonly string[]): z.ZodErrorMap {
  return (issue, ctx) => {
    if (issue.code === 'invalid_enum_value') {
      const validOptions = validValues.join('", "');
      return {
        message: `Invalid ${fieldName} "${ctx.data}". Must be exactly one of: "${validOptions}" (case-sensitive).`
      };
    }
    return { message: ctx.defaultError };
  };
}

// =============================================================================
// Base Enums (Single Source of Truth)
// =============================================================================

// [FIX: SCHEMA-06] All enums now have descriptive error messages
const SeverityValues = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export const SeverityEnum = z.enum(SeverityValues, { errorMap: enumErrorMap('severity', SeverityValues) });
export type Severity = z.infer<typeof SeverityEnum>;

const IssueCategoryValues = ['SECURITY', 'CORRECTNESS', 'RELIABILITY', 'MAINTAINABILITY', 'PERFORMANCE'] as const;
export const IssueCategoryEnum = z.enum(IssueCategoryValues, { errorMap: enumErrorMap('category', IssueCategoryValues) });
export type IssueCategory = z.infer<typeof IssueCategoryEnum>;

const IssueStatusValues = ['RAISED', 'CHALLENGED', 'RESOLVED', 'UNRESOLVED', 'DISMISSED', 'MERGED', 'SPLIT'] as const;
export const IssueStatusEnum = z.enum(IssueStatusValues, { errorMap: enumErrorMap('status', IssueStatusValues) });
export type IssueStatus = z.infer<typeof IssueStatusEnum>;

const CriticVerdictValues = ['VALID', 'INVALID', 'PARTIAL'] as const;
export const CriticVerdictEnum = z.enum(CriticVerdictValues, { errorMap: enumErrorMap('criticVerdict', CriticVerdictValues) });
export type CriticVerdict = z.infer<typeof CriticVerdictEnum>;

const RoleValues = ['verifier', 'critic'] as const;
export const RoleEnum = z.enum(RoleValues, { errorMap: enumErrorMap('role', RoleValues) });
export type Role = z.infer<typeof RoleEnum>;

const TriggeredByValues = ['verifier', 'critic', 'mediator'] as const;
export const TriggeredByEnum = z.enum(TriggeredByValues, { errorMap: enumErrorMap('triggeredBy', TriggeredByValues) });
export type TriggeredBy = z.infer<typeof TriggeredByEnum>;

const IssueTransitionTypeValues = ['DISCOVERED', 'ESCALATED', 'DEMOTED', 'MERGED_INTO', 'SPLIT_FROM', 'INVALIDATED', 'VALIDATED', 'REFINED'] as const;
export const IssueTransitionTypeEnum = z.enum(IssueTransitionTypeValues, { errorMap: enumErrorMap('transitionType', IssueTransitionTypeValues) });
export type IssueTransitionType = z.infer<typeof IssueTransitionTypeEnum>;

// =============================================================================
// Impact Analysis Schemas
// =============================================================================

const ImpactTypeValues = ['DIRECT', 'INDIRECT', 'TEST'] as const;
export const ImpactTypeEnum = z.enum(ImpactTypeValues, { errorMap: enumErrorMap('impactType', ImpactTypeValues) });
export type ImpactType = z.infer<typeof ImpactTypeEnum>;

const RiskLevelValues = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const RiskLevelEnum = z.enum(RiskLevelValues, { errorMap: enumErrorMap('riskLevel', RiskLevelValues) });
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
 * Base schema for issue input validation
 * [FIX: SCHEMA-04] Added descriptive error messages for required fields
 */
const IssueInputBaseSchema = z.object({
  id: z.string({
    required_error: 'Issue ID is required (e.g., "SEC-01", "COR-02")',
    invalid_type_error: 'Issue ID must be a string'
  }),
  category: IssueCategoryEnum.describe(
    'Must be one of: SECURITY, CORRECTNESS, RELIABILITY, MAINTAINABILITY, PERFORMANCE'
  ),
  severity: SeverityEnum.describe(
    'Must be one of: CRITICAL, HIGH, MEDIUM, LOW'
  ),
  summary: z.string({
    required_error: 'Issue summary is required - provide a brief description of the issue',
    invalid_type_error: 'Issue summary must be a string'
  }).min(1, 'Issue summary cannot be empty'),
  location: z.string({
    required_error: 'Issue location is required (e.g., "src/file.ts:42")',
    invalid_type_error: 'Issue location must be a string'
  }).min(1, 'Issue location cannot be empty'),
  // Accept both description and why for flexibility
  description: z.string().optional(),
  why: z.string().optional(),
  evidence: z.string({
    required_error: 'Evidence is required - provide code snippet or proof of the issue',
    invalid_type_error: 'Evidence must be a string'
  }).min(1, 'Evidence cannot be empty')
});

/**
 * Schema for issues submitted via elenchus_submit_round
 * Accepts both 'description' and 'why' fields for compatibility with
 * ConstrainedIssueSchema (LLM output format) and legacy formats
 * [FIX: SCHEMA-04] Enhanced with detailed error messages
 */
export const IssueInputSchema = IssueInputBaseSchema.superRefine((data, ctx) => {
  // Provide helpful guidance for missing fields
  const missingFields: string[] = [];

  if (!data.id) missingFields.push('id (e.g., "SEC-01")');
  if (!data.summary) missingFields.push('summary (brief issue description)');
  if (!data.location) missingFields.push('location (e.g., "src/file.ts:42")');
  if (!data.evidence) missingFields.push('evidence (code snippet or proof)');

  if (missingFields.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Issue object is incomplete. Missing required fields: ${missingFields.join(', ')}. Each issue in issuesRaised array must have: id, category, severity, summary, location, and evidence.`,
      path: []
    });
  }
});
export type IssueInput = z.infer<typeof IssueInputBaseSchema>;

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
