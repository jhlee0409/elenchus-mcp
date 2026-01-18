/**
 * Output Schemas for MCP Tools
 * Defines expected output structure for tools following MCP best practices
 */

import { z } from 'zod';
// [FIX: SCHEMA-03] Use centralized schema
import { IssueOutputSchema } from '../schemas/index.js';

// =============================================================================
// Common Schema Components
// =============================================================================

// [FIX: SCHEMA-03] Re-export centralized IssueSchema for backward compatibility
const IssueSchema = IssueOutputSchema;

// =============================================================================
// Output Schemas by Tool
// =============================================================================

/**
 * elenchus_start_session output schema
 */
export const StartSessionOutputSchema = z.object({
  sessionId: z.string().describe('Unique session identifier'),
  status: z.string().describe('Current session status'),
  context: z.object({
    target: z.string(),
    filesCollected: z.number(),
    requirements: z.string()
  }),
  mediator: z.object({
    initialized: z.boolean(),
    graphNodes: z.number(),
    graphEdges: z.number(),
    criticalFiles: z.number()
  }).optional(),
  roles: z.object({
    initialized: z.boolean(),
    expectedRole: z.enum(['verifier', 'critic']),
    config: z.object({
      strictMode: z.boolean(),
      minComplianceScore: z.number(),
      allowRoleSwitch: z.boolean(),
      requireAlternation: z.boolean()
    }),
    verifierGuidelines: z.object({
      mustDo: z.array(z.string()),
      mustNotDo: z.array(z.string())
    }),
    firstRolePrompt: z.string()
  }).optional(),
  verificationMode: z.object({
    mode: z.enum(['standard', 'fast-track', 'single-pass']),
    description: z.string(),
    settings: z.object({}).passthrough()
  }).optional(),
  preAnalysis: z.object({
    totalFindings: z.number(),
    filesWithFindings: z.number(),
    summary: z.string(),
    details: z.array(z.object({}).passthrough())
  }).optional(),
  differential: z.object({}).passthrough().optional(),
  cache: z.object({}).passthrough().optional(),
  chunking: z.object({}).passthrough().optional(),
  pipeline: z.object({}).passthrough().optional(),
  safeguards: z.object({}).passthrough().optional()
});

/**
 * elenchus_get_context output schema
 */
export const GetContextOutputSchema = z.object({
  sessionId: z.string(),
  status: z.string(),
  currentRound: z.number(),
  target: z.string(),
  requirements: z.string(),
  files: z.array(z.object({
    path: z.string(),
    sizeBytes: z.number().optional(),
    contentPreview: z.string().optional(),
    changeStatus: z.string().optional()
  })),
  issues: z.object({
    total: z.number(),
    byStatus: z.record(z.number()),
    bySeverity: z.record(z.number()),
    byCategory: z.record(z.number())
  }),
  convergence: z.object({
    isConverged: z.boolean(),
    reason: z.string().optional(),
    progressSummary: z.string()
  }),
  nextAction: z.string()
}).nullable();

/**
 * elenchus_submit_round output schema
 */
export const SubmitRoundOutputSchema = z.object({
  sessionId: z.string(),
  roundNumber: z.number(),
  role: z.enum(['verifier', 'critic']),
  newIssues: z.number(),
  resolvedIssues: z.number(),
  convergence: z.object({
    isConverged: z.boolean(),
    reason: z.string().optional(),
    progressSummary: z.string(),
    nextRound: z.object({
      expectedRole: z.enum(['verifier', 'critic', 'complete']),
      focus: z.array(z.string())
    }).optional()
  }),
  mediatorInterventions: z.array(z.object({
    type: z.string(),
    priority: z.string(),
    reason: z.string(),
    instructions: z.string()
  })).optional(),
  roleCompliance: z.object({
    role: z.enum(['verifier', 'critic']),
    round: z.number(),
    isCompliant: z.boolean(),
    score: z.number(),
    violations: z.array(z.object({
      criterionId: z.string(),
      severity: z.enum(['ERROR', 'WARNING']),
      message: z.string()
    })),
    warnings: z.array(z.object({
      type: z.string(),
      message: z.string(),
      suggestion: z.string()
    })),
    suggestions: z.array(z.string())
  }).optional(),
  rejected: z.boolean().optional()
});

/**
 * elenchus_get_issues output schema
 */
export const GetIssuesOutputSchema = z.array(IssueSchema).nullable();

/**
 * elenchus_checkpoint output schema
 */
export const CheckpointOutputSchema = z.object({
  success: z.boolean(),
  roundNumber: z.number()
}).nullable();

/**
 * elenchus_rollback output schema
 */
export const RollbackOutputSchema = z.object({
  success: z.boolean(),
  restoredToRound: z.number()
}).nullable();

/**
 * elenchus_end_session output schema
 */
export const EndSessionOutputSchema = z.object({
  sessionId: z.string(),
  verdict: z.enum(['PASS', 'FAIL', 'CONDITIONAL']),
  summary: z.object({
    totalRounds: z.number(),
    totalIssues: z.number(),
    resolvedIssues: z.number(),
    unresolvedIssues: z.number(),
    issuesByCategory: z.record(z.number()),
    issuesBySeverity: z.record(z.number())
  })
}).nullable();

/**
 * elenchus_ripple_effect output schema
 */
export const RippleEffectOutputSchema = z.object({
  changedFile: z.string(),
  changedFunction: z.string().optional(),
  affectedFiles: z.array(z.object({
    path: z.string(),
    impactLevel: z.enum(['direct', 'indirect']),
    functions: z.array(z.string()).optional()
  })),
  recommendations: z.array(z.string()),
  cascadeDepth: z.number(),
  totalAffected: z.number()
}).nullable();

/**
 * elenchus_get_role_prompt output schema
 */
export const GetRolePromptOutputSchema = z.object({
  role: z.enum(['verifier', 'critic']),
  systemPrompt: z.string(),
  outputTemplate: z.string(),
  checklist: z.array(z.string()),
  mustDo: z.array(z.string()),
  mustNotDo: z.array(z.string()),
  focusAreas: z.array(z.string())
});

// =============================================================================
// Schema Registry
// =============================================================================

/**
 * Map of tool names to their output schemas
 */
export const outputSchemas: Record<string, z.ZodType> = {
  elenchus_start_session: StartSessionOutputSchema,
  elenchus_get_context: GetContextOutputSchema,
  elenchus_submit_round: SubmitRoundOutputSchema,
  elenchus_get_issues: GetIssuesOutputSchema,
  elenchus_checkpoint: CheckpointOutputSchema,
  elenchus_rollback: RollbackOutputSchema,
  elenchus_end_session: EndSessionOutputSchema,
  elenchus_ripple_effect: RippleEffectOutputSchema,
  elenchus_get_role_prompt: GetRolePromptOutputSchema
};

/**
 * Zod def internal interface for type introspection
 */
interface ZodDefInternal {
  typeName?: string;
  type?: z.ZodType;
  innerType?: z.ZodType;
  values?: readonly string[];
}

/**
 * Convert Zod schema to JSON Schema for MCP
 * Note: For production, consider using zod-to-json-schema library
 */
export function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  // Access internal _def with type assertion
  const def = (schema as unknown as { _def: ZodDefInternal })._def;
  const typeName = def.typeName;

  if (!typeName) {
    return { type: 'object' };
  }

  switch (typeName) {
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodArray':
      return {
        type: 'array',
        items: def.type ? zodToJsonSchema(def.type) : { type: 'object' }
      };
    case 'ZodObject':
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
      return {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(shape).map(([key, value]) => [
            key,
            zodToJsonSchema(value as z.ZodType)
          ])
        )
      };
    case 'ZodEnum':
      return {
        type: 'string',
        enum: def.values ? [...def.values] : []
      };
    case 'ZodOptional':
      return def.innerType ? zodToJsonSchema(def.innerType) : { type: 'object' };
    case 'ZodNullable':
      const innerSchema = def.innerType ? zodToJsonSchema(def.innerType) : { type: 'object' };
      return { anyOf: [innerSchema, { type: 'null' }] };
    default:
      return { type: 'object' };
  }
}

/**
 * Get output schema as JSON Schema for a tool
 */
export function getOutputSchema(toolName: string): Record<string, unknown> | undefined {
  const schema = outputSchemas[toolName];
  if (!schema) return undefined;

  return zodToJsonSchema(schema);
}
