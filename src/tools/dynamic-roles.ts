/**
 * Dynamic Role Generation Tools
 *
 * Tools for generating and setting customized Verifier/Critic roles
 * based on user requirements.
 */

import { z } from 'zod';
import { getSession } from '../state/session.js';
import {
  VERIFIER_ROLE_META_PROMPT,
  CRITIC_ROLE_META_PROMPT,
  DOMAIN_DETECTION_META_PROMPT,
  buildMetaPrompt,
  buildCategoriesSection,
  buildEdgeCaseTable,
  buildMustDoList,
  buildChecklist,
  ROLE_PROMPT_ASSEMBLY_TEMPLATE,
  type GeneratedVerifierRole,
  type GeneratedCriticRole,
  type DomainDetectionResult,
} from '../roles/meta-prompt.js';
import { RoleDefinition, RolePrompt, ValidationCriterion, RoleContext } from '../roles/types.js';
import { setDynamicRoleState } from '../roles/dynamic-roles-store.js';

// =============================================================================
// Schemas
// =============================================================================

export const GenerateRolesSchema = z.object({
  sessionId: z.string().describe('Session ID to generate roles for'),
  step: z.enum(['detect_domain', 'generate_verifier', 'generate_critic']).describe(
    'Generation step: detect_domain → generate_verifier → generate_critic'
  ),
  previousResult: z.string().optional().describe(
    'JSON result from previous step (domain detection result for verifier, verifier role for critic)'
  ),
});

export const SetDynamicRolesSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  domainResult: z.string().describe('JSON string of domain detection result'),
  verifierRole: z.string().describe('JSON string of generated verifier role'),
  criticRole: z.string().describe('JSON string of generated critic role'),
});

// Note: Dynamic role storage is handled by ../roles/dynamic-roles-store.js

// =============================================================================
// Generate Roles Tool
// =============================================================================

export interface GenerateRolesResponse {
  step: string;
  prompt: string;
  instructions: string;
  expectedOutputFormat: string;
  nextStep?: string;
}

export async function generateRoles(
  args: z.infer<typeof GenerateRolesSchema>
): Promise<GenerateRolesResponse> {
  const session = await getSession(args.sessionId);
  if (!session) {
    throw new Error(`Session not found: ${args.sessionId}`);
  }

  const { requirements, target } = session;

  switch (args.step) {
    case 'detect_domain': {
      const prompt = buildMetaPrompt(DOMAIN_DETECTION_META_PROMPT, {
        REQUIREMENTS: requirements,
        TARGET: target,
      });

      return {
        step: 'detect_domain',
        prompt,
        instructions: 'Send this prompt to an LLM to detect the verification domain. Return the JSON response.',
        expectedOutputFormat: `{
  "domain": "code | document | api-spec | design | ...",
  "confidence": 0.0-1.0,
  "reasoning": "...",
  "suggestedCategories": ["...", "..."]
}`,
        nextStep: 'generate_verifier',
      };
    }

    case 'generate_verifier': {
      if (!args.previousResult) {
        throw new Error('previousResult (domain detection) is required for generate_verifier step');
      }

      let domain: DomainDetectionResult;
      try {
        domain = JSON.parse(args.previousResult);
      } catch {
        throw new Error('Invalid domain detection result JSON');
      }

      const prompt = buildMetaPrompt(VERIFIER_ROLE_META_PROMPT, {
        REQUIREMENTS: requirements,
        TARGET: target,
        DOMAIN: JSON.stringify(domain),
      });

      return {
        step: 'generate_verifier',
        prompt,
        instructions: 'Send this prompt to an LLM to generate the Verifier role. Return the JSON response.',
        expectedOutputFormat: `{
  "domain": "...",
  "purpose": "...",
  "categories": [...],
  "mustDo": [...],
  "mustNotDo": [...],
  "edgeCaseExamples": {...},
  "evidenceFormat": {...},
  "severityCriteria": {...}
}`,
        nextStep: 'generate_critic',
      };
    }

    case 'generate_critic': {
      if (!args.previousResult) {
        throw new Error('previousResult (verifier role) is required for generate_critic step');
      }

      let verifierRole: GeneratedVerifierRole;
      try {
        verifierRole = JSON.parse(args.previousResult);
      } catch {
        throw new Error('Invalid verifier role JSON');
      }

      const prompt = buildMetaPrompt(CRITIC_ROLE_META_PROMPT, {
        REQUIREMENTS: requirements,
        VERIFIER_ROLE_JSON: JSON.stringify(verifierRole, null, 2),
      });

      return {
        step: 'generate_critic',
        prompt,
        instructions: 'Send this prompt to an LLM to generate the Critic role. Then call elenchus_set_dynamic_roles with all results.',
        expectedOutputFormat: `{
  "purpose": "...",
  "mustDo": [...],
  "mustNotDo": [...],
  "challengePatterns": [...],
  "verdictCriteria": {...}
}`,
      };
    }

    default:
      throw new Error(`Unknown step: ${args.step}`);
  }
}

// =============================================================================
// Set Dynamic Roles Tool
// =============================================================================

export interface SetDynamicRolesResponse {
  success: boolean;
  sessionId: string;
  domain: {
    name: string;
    confidence: number;
  };
  verifier: {
    purpose: string;
    categories: string[];
    mustDoCount: number;
  };
  critic: {
    purpose: string;
    challengePatternCount: number;
  };
  message: string;
}

export async function setDynamicRoles(
  args: z.infer<typeof SetDynamicRolesSchema>
): Promise<SetDynamicRolesResponse> {
  const session = await getSession(args.sessionId);
  if (!session) {
    throw new Error(`Session not found: ${args.sessionId}`);
  }

  // Parse JSON inputs
  let domain: DomainDetectionResult;
  let verifierRole: GeneratedVerifierRole;
  let criticRole: GeneratedCriticRole;

  try {
    domain = JSON.parse(args.domainResult);
  } catch {
    throw new Error('Invalid domainResult JSON');
  }

  try {
    verifierRole = JSON.parse(args.verifierRole);
  } catch {
    throw new Error('Invalid verifierRole JSON');
  }

  try {
    criticRole = JSON.parse(args.criticRole);
  } catch {
    throw new Error('Invalid criticRole JSON');
  }

  // Validate structures
  validateVerifierRole(verifierRole);
  validateCriticRole(criticRole);

  // Convert to RoleDefinition and RolePrompt
  const verifierDefinition = buildVerifierDefinition(verifierRole);
  const criticDefinition = buildCriticDefinition(criticRole, verifierRole);
  const verifierPrompt = buildVerifierPromptFromRole(verifierRole);
  const criticPrompt = buildCriticPromptFromRole(criticRole, verifierRole);

  // Store in centralized store (used by getRolePrompt)
  setDynamicRoleState(args.sessionId, {
    domain,
    verifierRole,
    criticRole,
    verifierDefinition,
    criticDefinition,
    verifierPrompt,
    criticPrompt,
    generatedAt: new Date().toISOString(),
  });

  // Update session with dynamic role info (memory cache only)
  // Session object is already in cache, direct mutation updates it
  session.dynamicRoles = {
    enabled: true,
    domain: domain.domain,
    domainConfidence: domain.confidence,
    verifierPurpose: verifierRole.purpose,
    criticPurpose: criticRole.purpose,
    categories: verifierRole.categories.map(c => c.name),
    generatedAt: new Date().toISOString(),
    fromCache: false,
  };

  return {
    success: true,
    sessionId: args.sessionId,
    domain: {
      name: domain.domain,
      confidence: domain.confidence,
    },
    verifier: {
      purpose: verifierRole.purpose,
      categories: verifierRole.categories.map(c => c.name),
      mustDoCount: verifierRole.mustDo.length,
    },
    critic: {
      purpose: criticRole.purpose,
      challengePatternCount: criticRole.challengePatterns.length,
    },
    message: `Dynamic roles set successfully. Use getRolePrompt with sessionId to get customized prompts.`,
  };
}

// =============================================================================
// Re-export store functions for convenience
// =============================================================================

export {
  getDynamicRolePrompt,
  getDynamicRoleDefinition,
  hasDynamicRoles,
  clearDynamicRoles,
} from '../roles/dynamic-roles-store.js';

// =============================================================================
// Validation Helpers
// =============================================================================

function validateVerifierRole(role: GeneratedVerifierRole): void {
  if (!role.domain) throw new Error('Verifier role missing domain');
  if (!role.purpose) throw new Error('Verifier role missing purpose');
  if (!Array.isArray(role.categories) || role.categories.length < 3) {
    throw new Error('Verifier role must have at least 3 categories');
  }
  if (!Array.isArray(role.mustDo) || role.mustDo.length === 0) {
    throw new Error('Verifier role must have mustDo items');
  }
}

function validateCriticRole(role: GeneratedCriticRole): void {
  if (!role.purpose) throw new Error('Critic role missing purpose');
  if (!Array.isArray(role.mustDo) || role.mustDo.length === 0) {
    throw new Error('Critic role must have mustDo items');
  }
  if (!Array.isArray(role.challengePatterns) || role.challengePatterns.length === 0) {
    throw new Error('Critic role must have challengePatterns');
  }
}

// =============================================================================
// Build Helpers
// =============================================================================

function buildVerifierDefinition(role: GeneratedVerifierRole): RoleDefinition {
  const focusAreas = role.categories.map(
    cat => `${cat.name}: ${cat.focusAreas.join(', ')}`
  );

  return {
    name: 'verifier',
    koreanName: '검증자',
    purpose: role.purpose,
    mustDo: role.mustDo,
    mustNotDo: role.mustNotDo,
    focusAreas,
    outputRequirements: [
      { field: 'issuesRaised', required: true, description: 'List of discovered issues', validator: (v) => Array.isArray(v) },
      { field: 'evidence', required: true, description: 'Evidence for each issue', validator: (v) => typeof v === 'string' },
      { field: 'categoryCoverage', required: false, description: 'List of reviewed categories' },
    ],
    validationCriteria: buildDynamicValidationCriteria(role),
  };
}

function buildCriticDefinition(role: GeneratedCriticRole, verifierRole: GeneratedVerifierRole): RoleDefinition {
  const focusAreas = role.challengePatterns.map(
    pat => `${pat.type}: ${pat.description}`
  );

  return {
    name: 'critic',
    koreanName: '비평자',
    purpose: role.purpose,
    mustDo: role.mustDo,
    mustNotDo: role.mustNotDo,
    focusAreas,
    outputRequirements: [
      { field: 'issuesReviewed', required: true, description: 'List of reviewed issues', validator: (v) => Array.isArray(v) },
      { field: 'verdicts', required: true, description: 'Verdicts for each issue', validator: (v) => typeof v === 'object' },
    ],
    validationCriteria: buildDynamicCriticValidationCriteria(role, verifierRole),
  };
}

/**
 * Build intent-based validation criteria from generated role
 *
 * INTENT-BASED VALIDATION:
 * - No hardcoded keywords or regex patterns
 * - Uses the generated role's own fields as validation basis
 * - Checks for structural compliance, not keyword matching
 */
function buildDynamicValidationCriteria(role: GeneratedVerifierRole): ValidationCriterion[] {
  const categoryNames = role.categories.map(c => c.name);
  const evidenceFields = role.evidenceFormat.required;
  const edgeCaseKeys = Object.keys(role.edgeCaseExamples);

  return [
    {
      id: 'DYN-V01',
      description: `Evidence must include: ${evidenceFields.join(', ')}`,
      severity: 'ERROR',
      check: (output: string, _context: RoleContext) => {
        // Intent: Check if output contains the evidence fields defined BY THE GENERATED ROLE
        const foundFields = evidenceFields.filter(field =>
          output.toLowerCase().includes(field.toLowerCase())
        );
        const hasCodeBlock = output.includes('```');
        const passed = foundFields.length > 0 || hasCodeBlock;
        return {
          passed,
          message: passed
            ? `Evidence structure found (${foundFields.length}/${evidenceFields.length} fields)`
            : `Missing evidence fields: ${evidenceFields.join(', ')}`,
        };
      },
    },
    {
      id: 'DYN-V02',
      description: `Coverage required for: ${categoryNames.join(', ')}`,
      severity: 'ERROR',
      check: (output: string, _context: RoleContext) => {
        // Intent: Check if output mentions the categories DEFINED BY THE GENERATED ROLE
        const covered = categoryNames.filter(cat =>
          output.toUpperCase().includes(cat.toUpperCase())
        );
        return {
          passed: covered.length === categoryNames.length,
          message: covered.length === categoryNames.length
            ? 'All categories covered'
            : `Missing: ${categoryNames.filter(c => !covered.map(x => x.toUpperCase()).includes(c.toUpperCase())).join(', ')}`,
        };
      },
    },
    {
      id: 'DYN-V03',
      description: `Edge case analysis for: ${edgeCaseKeys.join(', ')}`,
      severity: 'WARNING',
      check: (output: string, _context: RoleContext) => {
        // Intent: Check if output addresses edge case categories DEFINED BY THE GENERATED ROLE
        const coveredEdgeCases = edgeCaseKeys.filter(key => {
          // Check if any of the example scenarios from this category are addressed
          const examples = role.edgeCaseExamples[key as keyof typeof role.edgeCaseExamples];
          return examples.some(example =>
            output.toLowerCase().includes(example.toLowerCase().slice(0, 20))
          ) || output.toLowerCase().includes(key.toLowerCase());
        });
        const passed = coveredEdgeCases.length >= Math.ceil(edgeCaseKeys.length / 2);
        return {
          passed,
          message: passed
            ? `Edge case coverage: ${coveredEdgeCases.length}/${edgeCaseKeys.length} categories`
            : `Low edge case coverage: ${coveredEdgeCases.length}/${edgeCaseKeys.length}`,
        };
      },
    },
  ];
}

/**
 * Build intent-based validation criteria for Critic from generated role
 *
 * INTENT-BASED VALIDATION:
 * - Uses the generated role's verdict criteria and challenge patterns
 * - No hardcoded verdict keywords
 */
function buildDynamicCriticValidationCriteria(
  role: GeneratedCriticRole,
  verifierRole: GeneratedVerifierRole
): ValidationCriterion[] {
  const verdictTypes = Object.keys(role.verdictCriteria);
  const challengeTypes = role.challengePatterns.map(p => p.type);
  const verifierCategories = verifierRole.categories.map(c => c.name);

  return [
    {
      id: 'DYN-C01',
      description: `Must provide verdicts: ${verdictTypes.join(', ')}`,
      severity: 'ERROR',
      check: (output: string, _context: RoleContext) => {
        // Intent: Check if output uses the verdict types DEFINED BY THE GENERATED ROLE
        const foundVerdicts = verdictTypes.filter(verdict =>
          output.toUpperCase().includes(verdict.toUpperCase())
        );
        const passed = foundVerdicts.length > 0;
        return {
          passed,
          message: passed
            ? `Verdicts found: ${foundVerdicts.join(', ')}`
            : `No verdicts found. Expected: ${verdictTypes.join(', ')}`,
        };
      },
    },
    {
      id: 'DYN-C02',
      description: `Challenge patterns: ${challengeTypes.join(', ')}`,
      severity: 'WARNING',
      check: (output: string, _context: RoleContext) => {
        // Intent: Check if output addresses the challenge patterns DEFINED BY THE GENERATED ROLE
        const appliedPatterns = role.challengePatterns.filter(pattern =>
          pattern.questions.some(q =>
            output.toLowerCase().includes(q.toLowerCase().slice(0, 15))
          ) || output.toUpperCase().includes(pattern.type)
        );
        const passed = appliedPatterns.length > 0;
        return {
          passed,
          message: passed
            ? `Challenge patterns applied: ${appliedPatterns.length}/${challengeTypes.length}`
            : 'No challenge patterns applied',
        };
      },
    },
    {
      id: 'DYN-C03',
      description: `Coverage check for: ${verifierCategories.join(', ')}`,
      severity: 'WARNING',
      check: (output: string, _context: RoleContext) => {
        // Intent: Critic should verify Verifier covered all categories
        const mentionedCategories = verifierCategories.filter(cat =>
          output.toUpperCase().includes(cat.toUpperCase())
        );
        const passed = mentionedCategories.length >= Math.ceil(verifierCategories.length / 2);
        return {
          passed,
          message: passed
            ? `Coverage verification: ${mentionedCategories.length}/${verifierCategories.length} categories mentioned`
            : `Insufficient coverage verification: ${mentionedCategories.length}/${verifierCategories.length}`,
        };
      },
    },
  ];
}

function buildVerifierPromptFromRole(role: GeneratedVerifierRole): RolePrompt {
  const categoriesSection = buildCategoriesSection(role.categories);
  const edgeCaseTable = buildEdgeCaseTable(role.edgeCaseExamples);
  const mustDoList = buildMustDoList(role.mustDo);
  const mustNotDoList = buildMustDoList(role.mustNotDo);
  const checklist = buildChecklist(role.categories);

  const systemPrompt = buildMetaPrompt(ROLE_PROMPT_ASSEMBLY_TEMPLATE, {
    ROLE_NAME: 'Verifier',
    PURPOSE: role.purpose,
    ARTIFACT_TYPE: role.domain,
    CATEGORY_COUNT: role.categories.length.toString(),
    CATEGORIES_SECTION: categoriesSection,
    EDGE_CASE_TABLE: edgeCaseTable,
    LOCATION_FORMAT: role.evidenceFormat.location,
    EVIDENCE_REQUIREMENTS: role.evidenceFormat.required.join(', '),
    SEVERITY_CRITERIA: Object.entries(role.severityCriteria)
      .map(([sev, desc]) => `${sev}: ${desc}`)
      .join('; '),
    MUST_DO_LIST: mustDoList,
    MUST_NOT_DO_LIST: mustNotDoList,
    CHECKLIST: checklist,
  });

  return {
    role: 'verifier',
    systemPrompt,
    outputTemplate: buildOutputTemplate(role),
    exampleOutput: '(Dynamic role - output generated based on requirements)',
    checklist: checklist.split('\n'),
  };
}

function buildCriticPromptFromRole(
  role: GeneratedCriticRole,
  verifierRole: GeneratedVerifierRole
): RolePrompt {
  const challengeSection = role.challengePatterns
    .map(pat => `### ${pat.type}\n${pat.description}\n- ${pat.questions.join('\n- ')}`)
    .join('\n\n');

  const systemPrompt = `
You are the **Critic** in the Elenchus verification system.

## Your Role
${role.purpose}

## REASONING PROCESS
Before challenging any finding:
1. **Understand** - What did the Verifier claim?
2. **Verify Evidence** - Is the evidence accurate and sufficient?
3. **Context Check** - Could this be intended behavior or design decision?
4. **Challenge** - If invalid, provide concrete reasoning

## CHALLENGE PATTERNS

${challengeSection}

## VERDICT CRITERIA
- **VALID**: ${role.verdictCriteria.VALID}
- **INVALID**: ${role.verdictCriteria.INVALID}
- **PARTIAL**: ${role.verdictCriteria.PARTIAL}

## MUST DO
${buildMustDoList(role.mustDo)}

## MUST NOT DO
${buildMustDoList(role.mustNotDo)}

## COVERAGE VERIFICATION
Verify the Verifier checked ALL ${verifierRole.categories.length} categories:
${verifierRole.categories.map(c => `- ${c.name}`).join('\n')}

Flag any skipped categories or missing edge case analysis.

## UNCERTAINTY HANDLING
If unsure about a challenge, say so explicitly.
Mark uncertain challenges with: "⚠️ UNCERTAIN: [reason]"
`;

  return {
    role: 'critic',
    systemPrompt,
    outputTemplate: buildCriticOutputTemplate(),
    exampleOutput: '(Dynamic role - output generated based on requirements)',
    checklist: [
      '□ Did I review ALL raised issues?',
      '□ Did I provide concrete reasoning for each verdict?',
      '□ Did I verify the Verifier covered all categories?',
      '□ Did I check for false positives?',
    ],
  };
}

function buildOutputTemplate(role: GeneratedVerifierRole): string {
  return `## Reasoning Trace
Brief summary of your analysis approach.

## Discovered Issues

### [CAT]-[NN]: [Summary]
- **Category**: [${role.categories.map(c => c.name).join('/')}]
- **Severity**: [CRITICAL/HIGH/MEDIUM/LOW]
- **Location**: ${role.evidenceFormat.location}
- **Impact**: [What could happen]
- **Evidence**:
\`\`\`
[Actual content]
\`\`\`
- **Why This Matters**: [Explanation]

## Edge Case Analysis

| Scenario | Checked | Finding |
|----------|---------|---------|
| ... | ✓ | ... |

## Category Coverage

| Category | Areas Checked | Issues Found | Clean Areas |
|----------|---------------|--------------|-------------|
${role.categories.map(c => `| ${c.name} | [list] | [IDs] | [what's safe] |`).join('\n')}

## Self-Review Confirmation
- [x] All categories covered
- [x] Edge cases documented
- [x] Evidence provided`;
}

function buildCriticOutputTemplate(): string {
  return `## Issue Review Summary

### [ISSUE-ID]: [Verdict: VALID/INVALID/PARTIAL]
- **Verifier's Claim**: [Summary]
- **My Assessment**: [Analysis]
- **Reasoning**: [Concrete reasoning]

## Coverage Verification

| Category | Covered | Edge Cases |
|----------|---------|------------|
| ... | ✓/✗ | ✓/✗ |

## Summary
- Issues Validated: [N]
- Issues Challenged: [N]
- Coverage Gaps: [N]`;
}

// =============================================================================
// Tool Definitions for MCP Registration
// =============================================================================

export const dynamicRoleTools = {
  elenchus_generate_roles: {
    description: `Generate customized Verifier/Critic role prompts based on user requirements.
This is a 3-step process:
1. detect_domain - Detects the verification domain from requirements
2. generate_verifier - Generates Verifier role (needs domain result)
3. generate_critic - Generates Critic role (needs verifier role)

Each step returns a prompt to send to an LLM. After all 3 steps, call elenchus_set_dynamic_roles with the results.`,
    schema: GenerateRolesSchema,
    handler: generateRoles,
  },

  elenchus_set_dynamic_roles: {
    description: `Set dynamically generated roles for a session.
Call this after completing all 3 steps of elenchus_generate_roles.
The roles will be used automatically by getRolePrompt when sessionId is provided.`,
    schema: SetDynamicRolesSchema,
    handler: setDynamicRoles,
  },
};
