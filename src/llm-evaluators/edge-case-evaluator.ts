/**
 * LLM-based Edge Case Evaluator
 *
 * Replaces keyword detection with actual analysis of whether
 * edge cases were genuinely examined and adequately covered.
 */

import type {
  SamplingFunction,
  EdgeCaseEvaluation,
  EvaluatorContext,
  LLMEvaluatorConfig,
} from './types.js';
import { DEFAULT_EVALUATOR_CONFIG } from './types.js';

const EDGE_CASE_SYSTEM_PROMPT = `You are an expert at evaluating test coverage and edge case analysis.
Your task is to assess whether edge cases were GENUINELY analyzed, not just mentioned.

TRUE edge case analysis includes:
1. Identifying specific scenarios that could cause failures
2. Explaining WHY each scenario is problematic
3. Describing expected vs actual behavior
4. Proposing mitigations or test cases

FALSE edge case analysis (just mentioning):
- "Edge cases were considered ✓"
- "Boundary conditions checked"
- Listing categories without specific scenarios
- Using keywords without actual analysis

Categories to evaluate:
- NULL/UNDEFINED: Empty inputs, missing parameters
- BOUNDARY: Min/max values, overflow/underflow
- CONCURRENCY: Race conditions, deadlocks
- ERROR PATHS: Exception handling, failure modes
- DATA INTEGRITY: Type mismatches, encoding issues
- RESOURCE LIMITS: Memory, file handles, connections
- TIMING: Timeouts, delays, async operations
- SECURITY: Injection, XSS, privilege escalation

Respond with a JSON evaluation.`;

const EDGE_CASE_EVALUATION_PROMPT = `Evaluate the edge case coverage in this verification:

## Target Files
{targetFiles}

## Code Type/Domain
{projectType}

## Verification Outputs
{verificationOutputs}

---

Analyze:
1. Were edge cases GENUINELY analyzed or just mentioned?
2. What specific edge cases were examined with actual reasoning?
3. What important edge cases are MISSING for this type of code?
4. What's the overall coverage quality (0-100)?

Important: Look for EVIDENCE of actual analysis, not just keywords!

Respond with ONLY a valid JSON object:
{
  "passed": boolean,
  "confidence": "high" | "medium" | "low" | "uncertain",
  "reasoning": "detailed explanation of coverage quality",
  "evidence": ["specific evidence of actual edge case analysis"],
  "analyzedCases": [
    {
      "description": "specific edge case that was actually analyzed",
      "category": "NULL|BOUNDARY|CONCURRENCY|ERROR|DATA|RESOURCE|TIMING|SECURITY",
      "adequatelyHandled": boolean
    }
  ],
  "missingCases": [
    {
      "description": "specific edge case that should be considered",
      "category": "category name",
      "importance": "critical" | "important" | "nice-to-have"
    }
  ],
  "coverageScore": number (0-100)
}`;

/**
 * Evaluate edge case coverage using LLM reasoning
 */
export async function evaluateEdgeCasesLLM(
  context: EvaluatorContext,
  samplingFn: SamplingFunction,
  config: LLMEvaluatorConfig = DEFAULT_EVALUATOR_CONFIG
): Promise<EdgeCaseEvaluation> {
  const prompt = EDGE_CASE_EVALUATION_PROMPT
    .replace('{targetFiles}', context.targetFiles.join('\n'))
    .replace('{projectType}', context.projectType || 'general')
    .replace('{verificationOutputs}', truncateForContext(context.allOutputs, 6000));

  try {
    const response = await samplingFn({
      messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
      systemPrompt: EDGE_CASE_SYSTEM_PROMPT,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
    });

    const content = typeof response.content === 'string'
      ? response.content
      : response.content.text;

    return parseEdgeCaseResponse(content);
  } catch (error) {
    return {
      passed: false,
      confidence: 'low',
      reasoning: `LLM evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      evidence: [],
      analyzedCases: [],
      missingCases: [{
        description: 'Unable to evaluate edge cases - LLM unavailable',
        category: 'UNKNOWN',
        importance: 'critical',
      }],
      coverageScore: 0,
    };
  }
}

/**
 * Get recommended edge cases for a specific code type
 */
export async function getRecommendedEdgeCases(
  codeType: string,
  filePaths: string[],
  samplingFn: SamplingFunction,
  config: LLMEvaluatorConfig = DEFAULT_EVALUATOR_CONFIG
): Promise<Array<{ description: string; category: string; importance: string }>> {
  const prompt = `For code of type "${codeType}" with files:
${filePaths.slice(0, 10).join('\n')}

List the most important edge cases to verify. Focus on:
- Domain-specific failure modes
- Common pitfalls for this code type
- Security-relevant edge cases

Respond with ONLY a JSON array:
[
  { "description": "specific scenario", "category": "category", "importance": "critical|important|nice-to-have" }
]`;

  try {
    const response = await samplingFn({
      messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
      systemPrompt: 'You are an expert at identifying edge cases for different types of code.',
      maxTokens: 1500,
      temperature: config.temperature,
    });

    const content = typeof response.content === 'string'
      ? response.content
      : response.content.text;

    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                      content.match(/(\[[\s\S]*\])/);

    if (jsonMatch) {
      return JSON.parse(jsonMatch[1].trim());
    }
    return [];
  } catch {
    return [];
  }
}

function parseEdgeCaseResponse(content: string): EdgeCaseEvaluation {
  try {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                      content.match(/(\{[\s\S]*\})/);

    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[1].trim());

    return {
      passed: Boolean(parsed.passed),
      confidence: validateConfidence(parsed.confidence),
      reasoning: String(parsed.reasoning || 'No reasoning provided'),
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
      analyzedCases: validateAnalyzedCases(parsed.analyzedCases),
      missingCases: validateMissingCases(parsed.missingCases),
      coverageScore: Math.min(100, Math.max(0, Number(parsed.coverageScore) || 0)),
    };
  } catch (error) {
    return {
      passed: false,
      confidence: 'low',
      reasoning: `Failed to parse response: ${error instanceof Error ? error.message : 'Parse error'}`,
      evidence: [],
      analyzedCases: [],
      missingCases: [],
      coverageScore: 0,
    };
  }
}

function validateConfidence(value: unknown): 'high' | 'medium' | 'low' | 'uncertain' {
  if (['high', 'medium', 'low', 'uncertain'].includes(String(value))) {
    return value as 'high' | 'medium' | 'low' | 'uncertain';
  }
  return 'uncertain';
}

function validateAnalyzedCases(cases: unknown): EdgeCaseEvaluation['analyzedCases'] {
  if (!Array.isArray(cases)) return [];

  return cases
    .filter((c): c is Record<string, unknown> => c && typeof c === 'object')
    .map(c => ({
      description: String(c.description || 'Unknown'),
      category: String(c.category || 'UNKNOWN'),
      adequatelyHandled: Boolean(c.adequatelyHandled),
    }));
}

function validateMissingCases(cases: unknown): EdgeCaseEvaluation['missingCases'] {
  if (!Array.isArray(cases)) return [];

  return cases
    .filter((c): c is Record<string, unknown> => c && typeof c === 'object')
    .map(c => ({
      description: String(c.description || 'Unknown'),
      category: String(c.category || 'UNKNOWN'),
      importance: validateImportance(c.importance),
    }));
}

function validateImportance(val: unknown): 'critical' | 'important' | 'nice-to-have' {
  if (['critical', 'important', 'nice-to-have'].includes(String(val))) {
    return val as 'critical' | 'important' | 'nice-to-have';
  }
  return 'important';
}

function truncateForContext(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const half = Math.floor(maxLength / 2);
  return text.slice(0, half) + '\n\n... [truncated] ...\n\n' + text.slice(-half);
}
