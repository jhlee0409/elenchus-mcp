/**
 * LLM-based Convergence Evaluator
 *
 * Replaces rigid boolean AND logic with intelligent LLM assessment
 * of whether verification is sufficient for the given context.
 */

import type {
  SamplingFunction,
  ConvergenceEvaluation,
  EvaluatorContext,
  LLMEvaluatorConfig,
} from './types.js';
import { DEFAULT_EVALUATOR_CONFIG } from './types.js';

const CONVERGENCE_SYSTEM_PROMPT = `You are an expert code verification quality assessor.
Your task is to evaluate whether a verification session has adequately examined the codebase.

Consider the following when evaluating:
1. CONTEXT SENSITIVITY: Different code types need different scrutiny levels
   - Authentication/security code needs thorough verification
   - Simple utilities may need less extensive review
   - API endpoints need edge case coverage
   - Data processing needs boundary testing

2. QUALITY OVER QUANTITY: Focus on verification DEPTH, not just coverage keywords
   - Did the verifier actually analyze the code, or just mention categories?
   - Is there evidence of understanding the code's purpose?
   - Were edge cases genuinely considered or just listed?

3. ISSUE PATTERNS: Look at what was found
   - Are unresolved issues truly blockers or minor concerns?
   - Were found issues actually analyzed for impact?
   - Is the issue distribution reasonable for this codebase?

4. VERIFICATION COMPLETENESS: Assess thoroughness
   - Were all critical paths examined?
   - Is there evidence of negative testing (what should NOT happen)?
   - Were dependencies and interactions considered?

Respond with a JSON object containing your evaluation.`;

const CONVERGENCE_EVALUATION_PROMPT = `Evaluate this verification session for convergence readiness:

## Requirements
{requirements}

## Target Files
{targetFiles}

## Current Round
Round {currentRound}

## All Verification Outputs
{allOutputs}

## Issues Found
{issuesSummary}

---

Based on the above, evaluate:
1. Is this verification sufficient for the codebase type and requirements?
2. Were categories genuinely analyzed (not just mentioned)?
3. Were edge cases actually examined (not just listed)?
4. Are the unresolved issues truly blocking, or acceptable risks?
5. What quality score (0-100) would you assign?

Respond with ONLY a valid JSON object in this exact format:
{
  "passed": boolean,
  "confidence": "high" | "medium" | "low" | "uncertain",
  "reasoning": "detailed explanation of your evaluation",
  "evidence": ["specific evidence point 1", "evidence point 2"],
  "qualityScore": number (0-100),
  "categoryScores": {
    "SECURITY": number,
    "CORRECTNESS": number,
    "RELIABILITY": number,
    "MAINTAINABILITY": number,
    "PERFORMANCE": number
  },
  "gaps": ["gap 1", "gap 2"],
  "moreRoundsRecommended": boolean,
  "recommendedFocusAreas": ["area 1", "area 2"] (only if moreRoundsRecommended is true)
}`;

/**
 * Evaluate verification convergence using LLM reasoning
 */
export async function evaluateConvergenceLLM(
  context: EvaluatorContext,
  samplingFn: SamplingFunction,
  config: LLMEvaluatorConfig = DEFAULT_EVALUATOR_CONFIG
): Promise<ConvergenceEvaluation> {
  const issuesSummary = context.issues.map(i =>
    `[${i.id}] ${i.severity} ${i.category} (${i.status}): ${i.description}`
  ).join('\n') || 'No issues found';

  const prompt = CONVERGENCE_EVALUATION_PROMPT
    .replace('{requirements}', context.requirements)
    .replace('{targetFiles}', context.targetFiles.join('\n'))
    .replace('{currentRound}', String(context.currentRound))
    .replace('{allOutputs}', truncateForContext(context.allOutputs, 8000))
    .replace('{issuesSummary}', issuesSummary);

  try {
    const response = await samplingFn({
      messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
      systemPrompt: CONVERGENCE_SYSTEM_PROMPT,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
    });

    const content = typeof response.content === 'string'
      ? response.content
      : response.content.text;

    return parseConvergenceResponse(content);
  } catch (error) {
    // Fallback to conservative evaluation
    return {
      passed: false,
      confidence: 'low',
      reasoning: `LLM evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}. Defaulting to conservative evaluation.`,
      evidence: [],
      qualityScore: 0,
      categoryScores: {
        SECURITY: 0,
        CORRECTNESS: 0,
        RELIABILITY: 0,
        MAINTAINABILITY: 0,
        PERFORMANCE: 0,
      },
      gaps: ['LLM evaluation unavailable'],
      moreRoundsRecommended: true,
      recommendedFocusAreas: ['Re-evaluate with pattern matching fallback'],
    };
  }
}

/**
 * Parse LLM response into structured evaluation
 */
function parseConvergenceResponse(content: string): ConvergenceEvaluation {
  try {
    // Extract JSON from potential markdown code blocks
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                      content.match(/(\{[\s\S]*\})/);

    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[1].trim());

    // Validate and provide defaults
    return {
      passed: Boolean(parsed.passed),
      confidence: validateConfidence(parsed.confidence),
      reasoning: String(parsed.reasoning || 'No reasoning provided'),
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
      qualityScore: Math.min(100, Math.max(0, Number(parsed.qualityScore) || 0)),
      categoryScores: validateCategoryScores(parsed.categoryScores),
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
      moreRoundsRecommended: Boolean(parsed.moreRoundsRecommended),
      recommendedFocusAreas: parsed.moreRoundsRecommended
        ? (Array.isArray(parsed.recommendedFocusAreas) ? parsed.recommendedFocusAreas : [])
        : undefined,
    };
  } catch (error) {
    return {
      passed: false,
      confidence: 'low',
      reasoning: `Failed to parse LLM response: ${error instanceof Error ? error.message : 'Parse error'}`,
      evidence: [],
      qualityScore: 0,
      categoryScores: {
        SECURITY: 0,
        CORRECTNESS: 0,
        RELIABILITY: 0,
        MAINTAINABILITY: 0,
        PERFORMANCE: 0,
      },
      gaps: ['Response parsing failed'],
      moreRoundsRecommended: true,
    };
  }
}

function validateConfidence(value: unknown): 'high' | 'medium' | 'low' | 'uncertain' {
  if (['high', 'medium', 'low', 'uncertain'].includes(String(value))) {
    return value as 'high' | 'medium' | 'low' | 'uncertain';
  }
  return 'uncertain';
}

function validateCategoryScores(scores: unknown): Record<string, number> {
  const defaults: Record<string, number> = {
    SECURITY: 0,
    CORRECTNESS: 0,
    RELIABILITY: 0,
    MAINTAINABILITY: 0,
    PERFORMANCE: 0,
  };

  if (!scores || typeof scores !== 'object') {
    return defaults;
  }

  const result = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (key in (scores as Record<string, unknown>)) {
      const val = (scores as Record<string, number>)[key];
      result[key] = Math.min(100, Math.max(0, Number(val) || 0));
    }
  }
  return result;
}

function truncateForContext(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const half = Math.floor(maxLength / 2);
  return text.slice(0, half) + '\n\n... [truncated] ...\n\n' + text.slice(-half);
}
