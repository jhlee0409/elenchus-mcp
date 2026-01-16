/**
 * Sampling Prompts
 *
 * Prompt generation for automatic verification loop
 */

import { PromptContext } from './types.js';

// =============================================================================
// System Prompts
// =============================================================================

const VERIFIER_SYSTEM_PROMPT = `You are the VERIFIER in an adversarial code verification loop.

Your role is to find issues in the code. Be thorough but precise.

## Output Format
You MUST respond in this exact JSON format:
\`\`\`json
{
  "issues": [
    {
      "id": "SEC-01",
      "category": "SECURITY|CORRECTNESS|RELIABILITY|MAINTAINABILITY|PERFORMANCE",
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "summary": "Brief issue title",
      "location": "file/path.ts:123",
      "description": "Detailed description of the issue",
      "evidence": "Code snippet showing the issue",
      "suggestedFix": "How to fix it (optional)"
    }
  ],
  "categoriesExamined": ["SECURITY", "CORRECTNESS", ...],
  "edgeCasesAnalyzed": ["null/undefined handling", "boundary conditions", ...],
  "negativeAssertions": ["No SQL injection vulnerabilities found", ...]
}
\`\`\`

## Rules
1. Each issue MUST have evidence from actual code
2. Location MUST be in file:line format
3. Examine ALL 5 categories
4. Document edge cases you checked
5. State explicitly what you verified as clean

## Categories Reference
- SECURITY: injection, auth, secrets, XSS, CSRF
- CORRECTNESS: logic errors, type issues, null handling
- RELIABILITY: error handling, resource cleanup, race conditions
- MAINTAINABILITY: code structure, naming, complexity
- PERFORMANCE: inefficiencies, memory leaks, N+1 queries`;

const CRITIC_SYSTEM_PROMPT = `You are the CRITIC in an adversarial code verification loop.

Your role is to review issues raised by the Verifier. Challenge false positives, validate real issues.

## Output Format
You MUST respond in this exact JSON format:
\`\`\`json
{
  "verdicts": [
    {
      "issueId": "SEC-01",
      "verdict": "VALID|INVALID|PARTIAL",
      "reasoning": "Why you reached this verdict",
      "counterEvidence": "Code showing why it's false positive (if INVALID)"
    }
  ],
  "newIssues": [
    // Only if you discover issues the Verifier missed
    // Same format as Verifier issues
  ],
  "overallAssessment": "Summary of your review"
}
\`\`\`

## Rules
1. You MUST provide verdict for EVERY issue from Verifier
2. INVALID requires counter-evidence from code
3. PARTIAL means issue exists but severity/scope is wrong
4. Only raise new issues if truly missed by Verifier
5. Be adversarial - challenge weak evidence`;

// =============================================================================
// Prompt Generation
// =============================================================================

/**
 * Generate prompt for Verifier
 */
export function generateVerifierPrompt(context: PromptContext): string {
  const parts: string[] = [];

  // Requirements
  parts.push(`## Verification Requirements\n${context.requirements}`);

  // Target files
  parts.push(`## Target Files (${context.targetFiles.length} files)`);
  for (const file of context.targetFiles.slice(0, 20)) {
    parts.push(`- ${file}`);
  }
  if (context.targetFiles.length > 20) {
    parts.push(`... and ${context.targetFiles.length - 20} more files`);
  }

  // Pre-analysis findings (first round only)
  if (context.round === 1 && context.preAnalysisFindings && context.preAnalysisFindings.length > 0) {
    parts.push(`\n## Pre-Analysis Findings (Prioritize these)`);
    for (const finding of context.preAnalysisFindings.slice(0, 10)) {
      parts.push(`\n### ${finding.file}`);
      for (const f of finding.findings) {
        parts.push(`- ${f}`);
      }
    }
  }

  // Previous rounds context
  if (context.previousRounds.length > 0) {
    parts.push(`\n## Previous Rounds Summary`);
    for (const round of context.previousRounds) {
      parts.push(`\n### Round ${round.role}`);
      parts.push(round.summary);
    }
  }

  // Existing issues to avoid duplicates
  if (context.existingIssues.length > 0) {
    parts.push(`\n## Existing Issues (Don't duplicate)`);
    for (const issue of context.existingIssues) {
      parts.push(`- ${issue.id} [${issue.severity}] ${issue.summary} (${issue.status})`);
    }
  }

  parts.push(`\n## Instructions
Round ${context.round}: Perform thorough verification.
- Examine all 5 categories
- Check edge cases
- Provide concrete evidence
- State what you verified as clean

Respond in the required JSON format.`);

  return parts.join('\n');
}

/**
 * Generate prompt for Critic
 */
export function generateCriticPrompt(
  _context: PromptContext,
  verifierOutput: string
): string {
  const parts: string[] = [];

  parts.push(`## Verifier Output to Review`);
  parts.push('```');
  parts.push(verifierOutput);
  parts.push('```');

  parts.push(`\n## Your Task
Review each issue raised by the Verifier:
1. Is the evidence valid?
2. Is the severity appropriate?
3. Is it a real issue or false positive?

Provide verdict for EVERY issue. Be adversarial.

Respond in the required JSON format.`);

  return parts.join('\n');
}

/**
 * Generate full messages for sampling request
 */
export function generateSamplingMessages(
  role: 'verifier' | 'critic',
  context: PromptContext,
  previousOutput?: string
): Array<{ role: 'user' | 'assistant'; content: { type: 'text'; text: string } }> {
  const systemPrompt = role === 'verifier' ? VERIFIER_SYSTEM_PROMPT : CRITIC_SYSTEM_PROMPT;
  const userPrompt = role === 'verifier'
    ? generateVerifierPrompt(context)
    : generateCriticPrompt(context, previousOutput || '');

  return [
    {
      role: 'user',
      content: {
        type: 'text',
        text: `${systemPrompt}\n\n---\n\n${userPrompt}`
      }
    }
  ];
}

// =============================================================================
// Response Parsing
// =============================================================================

interface ParsedVerifierResponse {
  issues: Array<{
    id: string;
    category: string;
    severity: string;
    summary: string;
    location: string;
    description: string;
    evidence: string;
    suggestedFix?: string;
  }>;
  categoriesExamined: string[];
  edgeCasesAnalyzed: string[];
  negativeAssertions: string[];
}

interface ParsedCriticResponse {
  verdicts: Array<{
    issueId: string;
    verdict: 'VALID' | 'INVALID' | 'PARTIAL';
    reasoning: string;
    counterEvidence?: string;
  }>;
  newIssues?: ParsedVerifierResponse['issues'];
  overallAssessment: string;
}

/**
 * Parse Verifier response from LLM
 */
export function parseVerifierResponse(output: string): ParsedVerifierResponse {
  try {
    // Extract JSON from response
    const jsonMatch = output.match(/```json\n?([\s\S]*?)\n?```/) ||
                      output.match(/\{[\s\S]*"issues"[\s\S]*\}/);

    if (!jsonMatch) {
      // Fallback: try to parse entire output as JSON
      return JSON.parse(output);
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0];
    return JSON.parse(jsonStr);
  } catch (error) {
    // Return empty structure if parsing fails
    console.error('Failed to parse Verifier response:', error);
    return {
      issues: [],
      categoriesExamined: [],
      edgeCasesAnalyzed: [],
      negativeAssertions: []
    };
  }
}

/**
 * Parse Critic response from LLM
 */
export function parseCriticResponse(output: string): ParsedCriticResponse {
  try {
    const jsonMatch = output.match(/```json\n?([\s\S]*?)\n?```/) ||
                      output.match(/\{[\s\S]*"verdicts"[\s\S]*\}/);

    if (!jsonMatch) {
      return JSON.parse(output);
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0];
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('Failed to parse Critic response:', error);
    return {
      verdicts: [],
      overallAssessment: 'Failed to parse response'
    };
  }
}
