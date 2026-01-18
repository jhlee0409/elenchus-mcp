/**
 * Dynamic Role Generator
 *
 * Generates customized Verifier and Critic roles based on user requirements.
 * Uses MCP Sampling to request LLM completions for role generation.
 *
 * @see https://spec.modelcontextprotocol.io/specification/client/sampling/
 */

import {
  VERIFIER_ROLE_META_PROMPT,
  CRITIC_ROLE_META_PROMPT,
  DOMAIN_DETECTION_META_PROMPT,
  ROLE_PROMPT_ASSEMBLY_TEMPLATE,
  buildMetaPrompt,
  buildCategoriesSection,
  buildEdgeCaseTable,
  buildMustDoList,
  buildChecklist,
  GeneratedVerifierRole,
  GeneratedCriticRole,
  DomainDetectionResult,
  GeneratedCategory,
} from './meta-prompt.js';
import { RoleDefinition, RolePrompt, VerifierRole, ValidationCriterion, RoleContext } from './types.js';
import { IssueCategory } from '../types/index.js';

// =============================================================================
// Dynamic Role Generation Configuration
// =============================================================================

export interface DynamicRoleConfig {
  /** Enable dynamic role generation */
  enabled: boolean;
  /** Cache generated roles for similar requirements */
  cacheEnabled?: boolean;
  /** Maximum cache size */
  maxCacheSize?: number;
  /** Fallback to static roles on generation failure */
  fallbackToStatic?: boolean;
  /** Sampling parameters for LLM */
  samplingParams?: {
    maxTokens?: number;
    temperature?: number;
  };
}

export const DEFAULT_DYNAMIC_ROLE_CONFIG: DynamicRoleConfig = {
  enabled: false,
  cacheEnabled: true,
  maxCacheSize: 100,
  fallbackToStatic: true,
  samplingParams: {
    maxTokens: 4000,
    temperature: 0.3,
  },
};

// =============================================================================
// MCP Sampling Interface
// =============================================================================

/**
 * MCP Sampling request for role generation
 * The actual sampling is performed by the MCP client
 */
export interface SamplingRequest {
  messages: Array<{
    role: 'user' | 'assistant';
    content: { type: 'text'; text: string };
  }>;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface SamplingResponse {
  content: { type: 'text'; text: string };
  model?: string;
  stopReason?: string;
}

// Type for sampling function that will be injected
export type SamplingFunction = (request: SamplingRequest) => Promise<SamplingResponse>;

// =============================================================================
// Role Cache
// =============================================================================

interface CachedRole {
  verifier: GeneratedVerifierRole;
  critic: GeneratedCriticRole;
  domain: DomainDetectionResult;
  timestamp: number;
  requirementsHash: string;
}

const roleCache = new Map<string, CachedRole>();

function hashRequirements(requirements: string, target: string): string {
  // Simple hash for cache key
  const str = `${requirements}|${target}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

// =============================================================================
// Domain Detection
// =============================================================================

export async function detectDomain(
  requirements: string,
  target: string,
  samplingFn: SamplingFunction
): Promise<DomainDetectionResult> {
  const prompt = buildMetaPrompt(DOMAIN_DETECTION_META_PROMPT, {
    REQUIREMENTS: requirements,
    TARGET: target,
  });

  const response = await samplingFn({
    messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
    maxTokens: 500,
    temperature: 0.1,
  });

  try {
    const result = JSON.parse(response.content.text) as DomainDetectionResult;
    return result;
  } catch {
    // Fallback to general domain
    return {
      domain: 'general',
      confidence: 0.5,
      reasoning: 'Failed to parse domain detection response',
      suggestedCategories: ['COMPLETENESS', 'ACCURACY', 'CONSISTENCY', 'CLARITY', 'COMPLIANCE'],
    };
  }
}

// =============================================================================
// Verifier Role Generation
// =============================================================================

export async function generateVerifierRole(
  requirements: string,
  target: string,
  domain: DomainDetectionResult,
  samplingFn: SamplingFunction,
  config: DynamicRoleConfig = DEFAULT_DYNAMIC_ROLE_CONFIG
): Promise<GeneratedVerifierRole> {
  const prompt = buildMetaPrompt(VERIFIER_ROLE_META_PROMPT, {
    REQUIREMENTS: requirements,
    TARGET: target,
    DOMAIN: JSON.stringify(domain),
  });

  const response = await samplingFn({
    messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
    maxTokens: config.samplingParams?.maxTokens ?? 4000,
    temperature: config.samplingParams?.temperature ?? 0.3,
  });

  try {
    const result = JSON.parse(response.content.text) as GeneratedVerifierRole;
    validateGeneratedVerifierRole(result);
    return result;
  } catch (error) {
    throw new Error(`Failed to generate Verifier role: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function validateGeneratedVerifierRole(role: GeneratedVerifierRole): void {
  if (!role.domain || typeof role.domain !== 'string') {
    throw new Error('Invalid domain');
  }
  if (!role.purpose || typeof role.purpose !== 'string') {
    throw new Error('Invalid purpose');
  }
  if (!Array.isArray(role.categories) || role.categories.length < 4 || role.categories.length > 6) {
    throw new Error('Categories must be an array with 4-6 items');
  }
  if (!Array.isArray(role.mustDo) || role.mustDo.length === 0) {
    throw new Error('mustDo must be a non-empty array');
  }
  if (!Array.isArray(role.mustNotDo) || role.mustNotDo.length === 0) {
    throw new Error('mustNotDo must be a non-empty array');
  }
  // Validate each category
  for (const cat of role.categories) {
    if (!cat.name || !cat.description || !Array.isArray(cat.focusAreas)) {
      throw new Error(`Invalid category structure: ${JSON.stringify(cat)}`);
    }
  }
}

// =============================================================================
// Critic Role Generation
// =============================================================================

export async function generateCriticRole(
  requirements: string,
  verifierRole: GeneratedVerifierRole,
  samplingFn: SamplingFunction,
  config: DynamicRoleConfig = DEFAULT_DYNAMIC_ROLE_CONFIG
): Promise<GeneratedCriticRole> {
  const prompt = buildMetaPrompt(CRITIC_ROLE_META_PROMPT, {
    REQUIREMENTS: requirements,
    VERIFIER_ROLE_JSON: JSON.stringify(verifierRole, null, 2),
  });

  const response = await samplingFn({
    messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
    maxTokens: config.samplingParams?.maxTokens ?? 3000,
    temperature: config.samplingParams?.temperature ?? 0.3,
  });

  try {
    const result = JSON.parse(response.content.text) as GeneratedCriticRole;
    validateGeneratedCriticRole(result);
    return result;
  } catch (error) {
    throw new Error(`Failed to generate Critic role: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function validateGeneratedCriticRole(role: GeneratedCriticRole): void {
  if (!role.purpose || typeof role.purpose !== 'string') {
    throw new Error('Invalid purpose');
  }
  if (!Array.isArray(role.mustDo) || role.mustDo.length === 0) {
    throw new Error('mustDo must be a non-empty array');
  }
  if (!Array.isArray(role.challengePatterns) || role.challengePatterns.length === 0) {
    throw new Error('challengePatterns must be a non-empty array');
  }
}

// =============================================================================
// Complete Role Generation Pipeline
// =============================================================================

export interface GeneratedRoles {
  verifier: {
    definition: RoleDefinition;
    prompt: RolePrompt;
  };
  critic: {
    definition: RoleDefinition;
    prompt: RolePrompt;
  };
  domain: DomainDetectionResult;
  generatedAt: string;
  fromCache: boolean;
}

export async function generateDynamicRoles(
  requirements: string,
  target: string,
  samplingFn: SamplingFunction,
  config: DynamicRoleConfig = DEFAULT_DYNAMIC_ROLE_CONFIG
): Promise<GeneratedRoles> {
  // Check cache first
  const cacheKey = hashRequirements(requirements, target);
  if (config.cacheEnabled && roleCache.has(cacheKey)) {
    const cached = roleCache.get(cacheKey)!;
    const age = Date.now() - cached.timestamp;
    // Cache valid for 1 hour
    if (age < 3600000) {
      return {
        verifier: convertToRoleDefinition(cached.verifier, 'verifier'),
        critic: convertToCriticRoleDefinition(cached.critic, cached.verifier),
        domain: cached.domain,
        generatedAt: new Date(cached.timestamp).toISOString(),
        fromCache: true,
      };
    }
  }

  // Step 1: Detect domain
  const domain = await detectDomain(requirements, target, samplingFn);

  // Step 2: Generate Verifier role
  const verifierRole = await generateVerifierRole(requirements, target, domain, samplingFn, config);

  // Step 3: Generate Critic role
  const criticRole = await generateCriticRole(requirements, verifierRole, samplingFn, config);

  // Cache the result
  if (config.cacheEnabled) {
    // Enforce cache size limit
    if (roleCache.size >= (config.maxCacheSize ?? 100)) {
      // Remove oldest entry
      const oldestKey = roleCache.keys().next().value;
      if (oldestKey) roleCache.delete(oldestKey);
    }
    roleCache.set(cacheKey, {
      verifier: verifierRole,
      critic: criticRole,
      domain,
      timestamp: Date.now(),
      requirementsHash: cacheKey,
    });
  }

  return {
    verifier: convertToRoleDefinition(verifierRole, 'verifier'),
    critic: convertToCriticRoleDefinition(criticRole, verifierRole),
    domain,
    generatedAt: new Date().toISOString(),
    fromCache: false,
  };
}

// =============================================================================
// Conversion to Standard Role Types
// =============================================================================

function convertToRoleDefinition(
  generated: GeneratedVerifierRole,
  role: VerifierRole
): { definition: RoleDefinition; prompt: RolePrompt } {
  // Convert generated categories to IssueCategory format
  const categories = generated.categories.map(cat => cat.name as IssueCategory);

  // Build focus areas string array
  const focusAreas = generated.categories.map(
    cat => `${cat.name}: ${cat.focusAreas.join(', ')}`
  );

  // Create validation criteria (using placeholder functions)
  const validationCriteria: ValidationCriterion[] = [
    {
      id: 'DYN-001',
      description: 'Must include evidence when raising issues',
      severity: 'ERROR',
      check: createEvidenceCheck(generated.evidenceFormat),
    },
    {
      id: 'DYN-002',
      description: 'All categories must be explicitly covered',
      severity: 'ERROR',
      check: createCategoryCheck(categories),
    },
    {
      id: 'DYN-003',
      description: 'Edge case analysis must be documented',
      severity: 'ERROR',
      check: createEdgeCaseCheck(),
    },
  ];

  const definition: RoleDefinition = {
    name: role,
    koreanName: role === 'verifier' ? '검증자' : '비평자',
    purpose: generated.purpose,
    mustDo: generated.mustDo,
    mustNotDo: generated.mustNotDo,
    focusAreas,
    outputRequirements: [
      { field: 'issuesRaised', required: true, description: 'List of discovered issues', validator: (v) => Array.isArray(v) },
      { field: 'evidence', required: true, description: 'Evidence for each issue', validator: (v) => typeof v === 'string' && v.length > 0 },
      { field: 'categoryCoverage', required: false, description: 'List of reviewed categories' },
      { field: 'edgeCaseCoverage', required: false, description: 'Edge case scenarios analyzed' },
    ],
    validationCriteria,
  };

  const prompt = buildVerifierPrompt(generated);

  return { definition, prompt };
}

function convertToCriticRoleDefinition(
  generated: GeneratedCriticRole,
  verifierRole: GeneratedVerifierRole
): { definition: RoleDefinition; prompt: RolePrompt } {
  const focusAreas = generated.challengePatterns.map(
    pat => `${pat.type}: ${pat.description}`
  );

  const validationCriteria: ValidationCriterion[] = [
    {
      id: 'DYN-C01',
      description: 'Must review all raised issues',
      severity: 'ERROR',
      check: createIssueReviewCheck(),
    },
    {
      id: 'DYN-C02',
      description: 'Must provide reasoning for challenges',
      severity: 'ERROR',
      check: createReasoningCheck(),
    },
  ];

  const definition: RoleDefinition = {
    name: 'critic',
    koreanName: '비평자',
    purpose: generated.purpose,
    mustDo: generated.mustDo,
    mustNotDo: generated.mustNotDo,
    focusAreas,
    outputRequirements: [
      { field: 'issuesReviewed', required: true, description: 'List of reviewed issues', validator: (v) => Array.isArray(v) },
      { field: 'verdicts', required: true, description: 'Verdicts for each issue', validator: (v) => typeof v === 'object' },
    ],
    validationCriteria,
  };

  const prompt = buildCriticPrompt(generated, verifierRole);

  return { definition, prompt };
}

// =============================================================================
// Prompt Builders
// =============================================================================

function buildVerifierPrompt(generated: GeneratedVerifierRole): RolePrompt {
  const categoriesSection = buildCategoriesSection(generated.categories);
  const edgeCaseTable = buildEdgeCaseTable(generated.edgeCaseExamples);
  const mustDoList = buildMustDoList(generated.mustDo);
  const mustNotDoList = buildMustDoList(generated.mustNotDo);
  const checklist = buildChecklist(generated.categories);

  const systemPrompt = buildMetaPrompt(ROLE_PROMPT_ASSEMBLY_TEMPLATE, {
    ROLE_NAME: 'Verifier',
    PURPOSE: generated.purpose,
    ARTIFACT_TYPE: generated.domain,
    CATEGORY_COUNT: generated.categories.length.toString(),
    CATEGORIES_SECTION: categoriesSection,
    EDGE_CASE_TABLE: edgeCaseTable,
    LOCATION_FORMAT: generated.evidenceFormat.location,
    EVIDENCE_REQUIREMENTS: generated.evidenceFormat.required.join(', '),
    SEVERITY_CRITERIA: Object.entries(generated.severityCriteria)
      .map(([sev, desc]) => `${sev}: ${desc}`)
      .join('; '),
    MUST_DO_LIST: mustDoList,
    MUST_NOT_DO_LIST: mustNotDoList,
    CHECKLIST: checklist,
  });

  return {
    role: 'verifier',
    systemPrompt,
    outputTemplate: generateOutputTemplate(generated.categories, generated.evidenceFormat),
    exampleOutput: '(Dynamic role - example output generated based on requirements)',
    checklist: checklist.split('\n'),
  };
}

function buildCriticPrompt(
  generated: GeneratedCriticRole,
  verifierRole: GeneratedVerifierRole
): RolePrompt {
  const challengePatternsSection = generated.challengePatterns
    .map(pat => `### ${pat.type}\n${pat.description}\n- ${pat.questions.join('\n- ')}`)
    .join('\n\n');

  const systemPrompt = `
You are the **Critic** in the Elenchus verification system.

## Your Role
${generated.purpose}

## REASONING PROCESS
Before challenging any finding:
1. **Understand** - What did the Verifier claim?
2. **Verify Evidence** - Is the evidence accurate and sufficient?
3. **Context Check** - Could this be intended behavior or design decision?
4. **Challenge** - If invalid, provide concrete reasoning

## CHALLENGE PATTERNS

${challengePatternsSection}

## VERDICT CRITERIA
- **VALID**: ${generated.verdictCriteria.VALID}
- **INVALID**: ${generated.verdictCriteria.INVALID}
- **PARTIAL**: ${generated.verdictCriteria.PARTIAL}

## MUST DO
${buildMustDoList(generated.mustDo)}

## MUST NOT DO
${buildMustDoList(generated.mustNotDo)}

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
    outputTemplate: generateCriticOutputTemplate(),
    exampleOutput: '(Dynamic role - example output generated based on requirements)',
    checklist: [
      '□ Did I review ALL raised issues?',
      '□ Did I provide concrete reasoning for each verdict?',
      '□ Did I verify the Verifier covered all categories?',
      '□ Did I check for false positives?',
      '□ Did I flag any coverage gaps?',
    ],
  };
}

function generateOutputTemplate(
  categories: GeneratedCategory[],
  evidenceFormat: { location: string; required: string[]; example: string }
): string {
  return `## Reasoning Trace
Brief summary of your analysis approach.

## Discovered Issues

### [CAT]-[NN]: [Summary]
- **Category**: [${categories.map(c => c.name).join('/')}]
- **Severity**: [CRITICAL/HIGH/MEDIUM/LOW]
- **Location**: ${evidenceFormat.location}
- **Impact**: [What could happen]
- **Evidence**:
\`\`\`
[Actual content from the artifact]
\`\`\`
- **Why This Matters**: [Explanation]

## Edge Case Analysis

### [Section/Component Name]
| Scenario | Checked | Finding |
|----------|---------|---------|
| [Scenario 1] | ✓ | [Issue ID or "Safe - reason"] |

## Category Coverage

| Category | Areas Checked | Issues Found | Clean Areas |
|----------|---------------|--------------|-------------|
${categories.map(c => `| ${c.name} | [list] | [IDs] | [what's safe] |`).join('\n')}

## Self-Review Confirmation
- [x] All categories covered
- [x] Edge cases documented
- [x] Evidence provided for all issues`;
}

function generateCriticOutputTemplate(): string {
  return `## Issue Review Summary

### [ISSUE-ID]: [Verdict: VALID/INVALID/PARTIAL]
- **Verifier's Claim**: [Summary]
- **My Assessment**: [Analysis]
- **Reasoning**: [Concrete reasoning]
- **Recommendation**: [Next steps]

## Coverage Verification

| Category | Covered by Verifier | Edge Cases Checked |
|----------|--------------------|--------------------|
| [CAT] | ✓/✗ | ✓/✗ |

## Flags for Verifier
⚠️ FLAG FOR VERIFIER: [Description of potential issue]

## Summary
- Issues Validated: [N]
- Issues Challenged: [N]
- Coverage Gaps Found: [N]`;
}

// =============================================================================
// Validation Check Factories
// =============================================================================

function createEvidenceCheck(evidenceFormat: { required: string[] }) {
  return (output: string, _context: RoleContext) => {
    // Check if output contains evidence markers
    const hasEvidence = evidenceFormat.required.some(
      req => output.toLowerCase().includes(req.toLowerCase())
    );
    return {
      passed: hasEvidence || output.includes('```') || output.includes('Evidence'),
      message: hasEvidence ? 'Evidence requirements met' : 'Missing required evidence fields',
    };
  };
}

function createCategoryCheck(categories: IssueCategory[]) {
  return (output: string, _context: RoleContext) => {
    const coveredCategories = categories.filter(
      cat => output.toUpperCase().includes(cat)
    );
    const allCovered = coveredCategories.length === categories.length;
    return {
      passed: allCovered,
      message: allCovered
        ? 'All categories covered'
        : `Missing categories: ${categories.filter(c => !coveredCategories.includes(c)).join(', ')}`,
      details: [`Covered: ${coveredCategories.join(', ')}`],
    };
  };
}

function createEdgeCaseCheck() {
  return (output: string, _context: RoleContext) => {
    const hasEdgeCaseSection = /edge\s*case/i.test(output) ||
                               /scenario/i.test(output) ||
                               /what\s*if/i.test(output);
    return {
      passed: hasEdgeCaseSection,
      message: hasEdgeCaseSection ? 'Edge case analysis present' : 'Missing edge case analysis',
    };
  };
}

function createIssueReviewCheck() {
  return (output: string, context: RoleContext) => {
    const reviewedCount = (output.match(/VALID|INVALID|PARTIAL/gi) || []).length;
    const expectedCount = context.existingIssues.filter(i => i.status === 'RAISED').length;
    const allReviewed = reviewedCount >= expectedCount || expectedCount === 0;
    return {
      passed: allReviewed,
      message: allReviewed ? 'All issues reviewed' : `Only ${reviewedCount}/${expectedCount} issues reviewed`,
    };
  };
}

function createReasoningCheck() {
  return (output: string, _context: RoleContext) => {
    const hasReasoning = /reasoning|because|therefore|however|evidence shows/i.test(output);
    return {
      passed: hasReasoning,
      message: hasReasoning ? 'Reasoning provided' : 'Missing reasoning for verdicts',
    };
  };
}

// =============================================================================
// Cache Management
// =============================================================================

export function clearRoleCache(): void {
  roleCache.clear();
}

export function getRoleCacheStats(): { size: number; entries: string[] } {
  return {
    size: roleCache.size,
    entries: Array.from(roleCache.keys()),
  };
}
