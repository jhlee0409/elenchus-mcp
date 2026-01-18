/**
 * Meta-Prompt for Dynamic Role Generation
 *
 * Uses 2025-2026 prompt engineering best practices:
 * - RTRI Framework (Role, Task, Rules, Input/Output)
 * - Contract Format (Success Criteria + Constraints + Uncertainty Rules)
 * - Problem Decomposition
 * - Meta Prompting (structure over content)
 *
 * @see https://www.promptingguide.ai/techniques/meta-prompting
 * @see https://engineering.gusto.com/how-to-write-an-oscar-worthy-llm-prompt-your-guide-to-the-prompt-chaining-framework
 */

// =============================================================================
// Meta-Prompt for Generating Verifier Roles
// =============================================================================

export const VERIFIER_ROLE_META_PROMPT = `
## ROLE
You are a Role Architect for the Elenchus adversarial verification system.
Your task: generate a customized Verifier role based on user requirements.

## SUCCESS CRITERIA
- Categories MUST be relevant to the verification domain (not generic)
- Edge cases MUST be domain-specific scenarios (not code-only)
- Evidence format MUST match the target artifact type
- Output MUST be valid JSON matching the schema exactly

## CONSTRAINTS
- Generate exactly 4-6 categories (not more, not less)
- Each category needs 3-5 specific focus areas
- Edge cases must cover: inputs, state, dependencies, users, data
- Do NOT include code-specific terms for non-code artifacts
- Do NOT hallucinate - if unsure about domain specifics, use general patterns

## UNCERTAINTY RULE
If the requirements are ambiguous, generate a general-purpose role that can be refined.
State explicitly: "Generated general role due to ambiguous requirements."

## INPUT
<requirements>
{{REQUIREMENTS}}
</requirements>

<target>
{{TARGET}}
</target>

<detected_domain>
{{DOMAIN}}
</detected_domain>

## OUTPUT FORMAT
Respond with ONLY valid JSON (no markdown, no explanation):

{
  "domain": "detected domain name",
  "purpose": "one-line purpose statement for this Verifier",
  "categories": [
    {
      "name": "CATEGORY_NAME",
      "description": "what this category verifies",
      "focusAreas": ["specific area 1", "specific area 2", "specific area 3"]
    }
  ],
  "mustDo": [
    "action 1 the verifier must perform",
    "action 2 the verifier must perform"
  ],
  "mustNotDo": [
    "action 1 the verifier must avoid",
    "action 2 the verifier must avoid"
  ],
  "edgeCaseExamples": {
    "inputs": ["edge case scenario 1", "edge case scenario 2"],
    "state": ["edge case scenario 1", "edge case scenario 2"],
    "dependencies": ["edge case scenario 1", "edge case scenario 2"],
    "users": ["edge case scenario 1", "edge case scenario 2"],
    "data": ["edge case scenario 1", "edge case scenario 2"]
  },
  "evidenceFormat": {
    "location": "how to specify location (e.g., 'file:line' or 'section:paragraph')",
    "required": ["required evidence field 1", "required evidence field 2"],
    "example": "example of proper evidence format"
  },
  "severityCriteria": {
    "CRITICAL": "when to use CRITICAL severity",
    "HIGH": "when to use HIGH severity",
    "MEDIUM": "when to use MEDIUM severity",
    "LOW": "when to use LOW severity"
  }
}
`;

// =============================================================================
// Meta-Prompt for Generating Critic Roles
// =============================================================================

export const CRITIC_ROLE_META_PROMPT = `
## ROLE
You are a Role Architect for the Elenchus adversarial verification system.
Your task: generate a customized Critic role that challenges the Verifier.

## SUCCESS CRITERIA
- Challenges MUST be domain-relevant (not generic skepticism)
- Validation approaches MUST match the artifact type
- The Critic role MUST complement the provided Verifier role
- Output MUST be valid JSON matching the schema exactly

## CONSTRAINTS
- The Critic challenges the Verifier, NOT the original artifact
- Focus on false positives, severity accuracy, and evidence quality
- Do NOT generate new categories (use Verifier's categories)
- Do NOT duplicate the Verifier's mustDo items

## UNCERTAINTY RULE
If the domain is unclear, generate challenges that apply universally.
State explicitly: "Generated universal challenges due to unclear domain."

## INPUT
<requirements>
{{REQUIREMENTS}}
</requirements>

<verifier_role>
{{VERIFIER_ROLE_JSON}}
</verifier_role>

## OUTPUT FORMAT
Respond with ONLY valid JSON (no markdown, no explanation):

{
  "purpose": "one-line purpose for this Critic",
  "mustDo": [
    "challenge action 1",
    "challenge action 2",
    "validation action 1"
  ],
  "mustNotDo": [
    "action to avoid 1",
    "action to avoid 2"
  ],
  "challengePatterns": [
    {
      "type": "FALSE_POSITIVE",
      "description": "how to identify false positives in this domain",
      "questions": ["question to ask 1", "question to ask 2"]
    },
    {
      "type": "SEVERITY_MISMATCH",
      "description": "how to validate severity classification",
      "questions": ["question to ask 1", "question to ask 2"]
    },
    {
      "type": "EVIDENCE_WEAKNESS",
      "description": "how to validate evidence quality",
      "questions": ["question to ask 1", "question to ask 2"]
    },
    {
      "type": "COVERAGE_GAP",
      "description": "how to identify verification gaps",
      "questions": ["question to ask 1", "question to ask 2"]
    }
  ],
  "verdictCriteria": {
    "VALID": "when an issue is truly valid",
    "INVALID": "when an issue is a false positive",
    "PARTIAL": "when an issue needs refinement"
  }
}
`;

// =============================================================================
// Domain Detection Meta-Prompt
// =============================================================================

export const DOMAIN_DETECTION_META_PROMPT = `
## ROLE
You are a Domain Classifier for the Elenchus verification system.

## TASK
Analyze the requirements and target to determine the verification domain.

## RULES
- Respond with ONLY a JSON object
- Choose the most specific domain that applies
- If multiple domains apply, choose the primary one
- If truly ambiguous, use "general"

## INPUT
<requirements>
{{REQUIREMENTS}}
</requirements>

<target>
{{TARGET}}
</target>

## OUTPUT FORMAT
{
  "domain": "one of: code | document | api-spec | design | architecture | business-logic | security-audit | performance | accessibility | compliance | general",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation",
  "subDomain": "optional more specific domain",
  "suggestedCategories": ["category1", "category2", "category3"]
}
`;

// =============================================================================
// System Prompt Generator (combines into final role prompt)
// =============================================================================

export const ROLE_PROMPT_ASSEMBLY_TEMPLATE = `
You are the **{{ROLE_NAME}}** in the Elenchus verification system.

## Your Role
{{PURPOSE}}

## REASONING PROCESS (Chain-of-Thought)
Before answering, break down what sub-problems need to be solved first.
Follow this structured thinking process:

**Step 1: Understand** - What is this {{ARTIFACT_TYPE}} supposed to do? What are the requirements?
**Step 2: Trace** - Follow the flow. What are the inputs/outputs? What are the dependencies?
**Step 3: Challenge** - What assumptions could be wrong? What could break this?
**Step 4: Verify** - Check against each category. Document evidence.
**Step 5: Self-Review** - Re-read your findings. Did you miss anything? Are severities accurate?

## CATEGORY COVERAGE (All {{CATEGORY_COUNT}} Required)

{{CATEGORIES_SECTION}}

## EDGE CASE THINKING (Mandatory)
For each section, systematically consider:

| Category | Questions to Ask |
|----------|-----------------|
{{EDGE_CASE_TABLE}}

## EVIDENCE REQUIREMENTS
Every issue MUST include:
1. **Location**: {{LOCATION_FORMAT}}
2. **Evidence**: {{EVIDENCE_REQUIREMENTS}}
3. **Explanation**: WHY this is a problem (not just WHAT)
4. **Impact**: What could go wrong
5. **Severity Justification**: {{SEVERITY_CRITERIA}}

## MUST DO
{{MUST_DO_LIST}}

## MUST NOT DO
{{MUST_NOT_DO_LIST}}

## SELF-REVIEW CHECKLIST (Before Submitting)
{{CHECKLIST}}

## UNCERTAINTY HANDLING
If unsure about any finding, say so explicitly. Do not guess.
Mark uncertain findings with: "⚠️ UNCERTAIN: [reason for uncertainty]"
`;

// =============================================================================
// Type Definitions for Generated Roles
// =============================================================================

export interface GeneratedCategory {
  name: string;
  description: string;
  focusAreas: string[];
}

export interface GeneratedEdgeCases {
  inputs: string[];
  state: string[];
  dependencies: string[];
  users: string[];
  data: string[];
}

export interface GeneratedEvidenceFormat {
  location: string;
  required: string[];
  example: string;
}

export interface GeneratedSeverityCriteria {
  CRITICAL: string;
  HIGH: string;
  MEDIUM: string;
  LOW: string;
}

export interface GeneratedVerifierRole {
  domain: string;
  purpose: string;
  categories: GeneratedCategory[];
  mustDo: string[];
  mustNotDo: string[];
  edgeCaseExamples: GeneratedEdgeCases;
  evidenceFormat: GeneratedEvidenceFormat;
  severityCriteria: GeneratedSeverityCriteria;
}

export interface ChallengePattern {
  type: 'FALSE_POSITIVE' | 'SEVERITY_MISMATCH' | 'EVIDENCE_WEAKNESS' | 'COVERAGE_GAP';
  description: string;
  questions: string[];
}

export interface GeneratedCriticRole {
  purpose: string;
  mustDo: string[];
  mustNotDo: string[];
  challengePatterns: ChallengePattern[];
  verdictCriteria: {
    VALID: string;
    INVALID: string;
    PARTIAL: string;
  };
}

export interface DomainDetectionResult {
  domain: string;
  confidence: number;
  reasoning: string;
  subDomain?: string;
  suggestedCategories: string[];
}

// =============================================================================
// Template Helpers
// =============================================================================

export function buildMetaPrompt(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  return result;
}

export function buildCategoriesSection(categories: GeneratedCategory[]): string {
  return categories.map(cat => `
### ${cat.name} - ${cat.description}
${cat.focusAreas.map(area => `- **${area}**`).join('\n')}
`).join('\n');
}

export function buildEdgeCaseTable(edgeCases: GeneratedEdgeCases): string {
  const rows = [
    ['**Inputs**', edgeCases.inputs.join(', ')],
    ['**State**', edgeCases.state.join(', ')],
    ['**Dependencies**', edgeCases.dependencies.join(', ')],
    ['**Users**', edgeCases.users.join(', ')],
    ['**Data**', edgeCases.data.join(', ')],
  ];
  return rows.map(([cat, questions]) => `| ${cat} | ${questions} |`).join('\n');
}

export function buildMustDoList(items: string[]): string {
  return items.map((item, i) => `${i + 1}. ${item}`).join('\n');
}

export function buildChecklist(categories: GeneratedCategory[]): string {
  const baseChecklist = [
    '□ Did I follow the 5-step reasoning process?',
    `□ Did I cover ALL ${categories.length} categories with explicit findings?`,
    '□ Did I check edge cases systematically (not just happy path)?',
    '□ Does every issue have proper evidence?',
    '□ Did I explain WHY each issue matters (impact)?',
    '□ Did I state what was checked and found clean?',
    '□ Did I self-review before submitting?',
  ];
  return baseChecklist.join('\n');
}
