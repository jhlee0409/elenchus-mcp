/**
 * Structured Output Schemas
 * [ENH: TOKEN-OPT] JSON schema constraints to prevent verbose output
 */

import { z } from 'zod';
// [FIX: SCHEMA-03] Use centralized schema
import { ConstrainedIssueSchema as CentralizedConstrainedIssueSchema } from '../schemas/index.js';

// =============================================================================
// Issue Output Schema with Constraints
// =============================================================================

/**
 * Constrained issue schema - prevents verbose descriptions
 * [FIX: SCHEMA-03] Re-exported from centralized schemas
 */
export const ConstrainedIssueSchema = CentralizedConstrainedIssueSchema;

// =============================================================================
// Verifier Output Schema
// =============================================================================

/**
 * Constrained verifier output - structured format prevents rambling
 */
export const VerifierOutputSchema = z.object({
  issues: z.array(ConstrainedIssueSchema)
    .max(20, 'Max 20 issues per round')
    .describe('Discovered issues'),

  edgeCases: z.array(z.string().max(150))
    .min(3, 'At least 3 edge cases required')
    .max(10, 'Max 10 edge cases')
    .describe('Edge cases checked'),

  coverage: z.object({
    security: z.string().max(100).describe('Security findings or "clean"'),
    correctness: z.string().max(100).describe('Correctness findings or "clean"'),
    reliability: z.string().max(100).describe('Reliability findings or "clean"'),
    maintainability: z.string().max(100).describe('Maintainability findings or "clean"'),
    performance: z.string().max(100).describe('Performance findings or "clean"')
  }).describe('Category coverage summary')
});

// =============================================================================
// Critic Output Schema
// =============================================================================

/**
 * Constrained verdict schema
 */
export const VerdictSchema = z.object({
  issueId: z.string()
    .regex(/^(SEC|COR|REL|MNT|PRF)-\d{2,3}$/)
    .describe('Issue ID being reviewed'),

  verdict: z.enum(['VALID', 'INVALID', 'PARTIAL'])
    .describe('Verdict on the issue'),

  reason: z.string()
    .min(10, 'Reason required')
    .max(200, 'Reason max 200 chars')
    .describe('Brief reasoning for verdict')
});

/**
 * Constrained critic output
 */
export const CriticOutputSchema = z.object({
  verdicts: z.array(VerdictSchema)
    .describe('Verdicts for each issue'),

  coverageCheck: z.object({
    allCategoriesCovered: z.boolean().describe('Were all 5 categories checked?'),
    missingCategories: z.array(z.string()).optional().describe('Categories skipped'),
    edgeCasesCovered: z.boolean().describe('Were edge cases analyzed?')
  }).describe('Verification coverage check'),

  flags: z.array(z.object({
    description: z.string().max(200).describe('Potential issue description'),
    location: z.string().optional().describe('Optional location hint')
  })).optional().describe('Flags for Verifier to investigate')
});

// =============================================================================
// Output Format Instructions
// =============================================================================

/**
 * Generate structured output instruction for prompts
 */
export function getStructuredOutputInstruction(role: 'verifier' | 'critic'): string {
  if (role === 'verifier') {
    return `
## Output Format (JSON)
\`\`\`json
{
  "issues": [
    {
      "id": "SEC-01",
      "category": "SECURITY",
      "severity": "CRITICAL",
      "summary": "<100 chars>",
      "location": "file.ts:42",
      "evidence": "<code snippet, max 500 chars>",
      "why": "<explanation, max 300 chars>"
    }
  ],
  "edgeCases": ["scenario 1", "scenario 2", "scenario 3"],
  "coverage": {
    "security": "finding or clean",
    "correctness": "finding or clean",
    "reliability": "finding or clean",
    "maintainability": "finding or clean",
    "performance": "finding or clean"
  }
}
\`\`\``;
  }

  return `
## Output Format (JSON)
\`\`\`json
{
  "verdicts": [
    {
      "issueId": "SEC-01",
      "verdict": "VALID",
      "reason": "<max 200 chars>"
    }
  ],
  "coverageCheck": {
    "allCategoriesCovered": true,
    "edgeCasesCovered": true
  },
  "flags": [
    { "description": "<potential issue>", "location": "file.ts:99" }
  ]
}
\`\`\``;
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate verifier output against schema
 */
export function validateVerifierOutput(output: unknown): {
  valid: boolean;
  errors: string[];
  data?: z.infer<typeof VerifierOutputSchema>;
} {
  const result = VerifierOutputSchema.safeParse(output);
  if (result.success) {
    return { valid: true, errors: [], data: result.data };
  }
  return {
    valid: false,
    errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
  };
}

/**
 * Validate critic output against schema
 */
export function validateCriticOutput(output: unknown): {
  valid: boolean;
  errors: string[];
  data?: z.infer<typeof CriticOutputSchema>;
} {
  const result = CriticOutputSchema.safeParse(output);
  if (result.success) {
    return { valid: true, errors: [], data: result.data };
  }
  return {
    valid: false,
    errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
  };
}

/**
 * Estimate tokens from structured output
 * Structured JSON is typically 40-60% smaller than prose
 */
export function estimateStructuredTokenSavings(
  proseTokens: number
): { structured: number; savings: number; percent: number } {
  // JSON structure is more compact than prose
  const structuredTokens = Math.round(proseTokens * 0.5);
  return {
    structured: structuredTokens,
    savings: proseTokens - structuredTokens,
    percent: 50
  };
}
