/**
 * LLM-based False Positive Evaluator
 *
 * Replaces pattern-based verdict validation with intelligent
 * assessment of issue validity and evidence quality.
 */

import type {
  SamplingFunction,
  FalsePositiveEvaluation,
  LLMEvaluatorConfig,
} from './types.js';
import { DEFAULT_EVALUATOR_CONFIG } from './types.js';

const FALSE_POSITIVE_SYSTEM_PROMPT = `You are an expert code reviewer specializing in issue validation.
Your task is to determine whether reported code issues are valid or false positives.

VALID issues have:
- Clear evidence in the code
- Sound reasoning connecting evidence to the problem
- Realistic impact assessment
- Appropriate severity for the actual risk

FALSE POSITIVES occur when:
- The "issue" is actually intentional design
- The evidence doesn't support the claim
- The code context is misunderstood
- The severity is dramatically overstated
- The issue is already mitigated elsewhere

PARTIALLY VALID means:
- The underlying concern is real but overstated
- Only part of the issue is genuine
- The severity needs adjustment

NEEDS CONTEXT means:
- Cannot determine without more information
- Depends on external factors not visible in code
- Requires domain knowledge not available

Always explain your reasoning with specific code references.`;

const FALSE_POSITIVE_EVALUATION_PROMPT = `Evaluate whether this reported issue is valid or a false positive:

## Issue Details
ID: {issueId}
Category: {category}
Severity: {severity}
Description: {description}

## Evidence Provided
{evidence}

## Code Being Examined
{codeContext}

## Verifier's Reasoning
{verifierReasoning}

## Critic's Challenge (if any)
{criticChallenge}

---

Evaluate:
1. Is the evidence actually present in the code?
2. Does the reasoning logically connect evidence to the claimed issue?
3. Is the severity appropriate for the actual impact?
4. Could this be intentional design or already mitigated?
5. What's the verdict: valid, false_positive, partially_valid, or needs_context?

Respond with ONLY a valid JSON object:
{
  "passed": boolean (true if issue is valid/partially valid),
  "confidence": "high" | "medium" | "low" | "uncertain",
  "reasoning": "detailed explanation of your evaluation",
  "evidence": ["specific evidence points from the code"],
  "verdict": "valid" | "false_positive" | "partially_valid" | "needs_context",
  "evidenceQuality": "strong" | "moderate" | "weak" | "missing",
  "reasoningSound": boolean,
  "alternativeInterpretation": "if false positive, what the code is actually doing" (optional),
  "recommendedAction": "keep" | "dismiss" | "modify" | "investigate"
}`;

export interface FalsePositiveInput {
  issueId: string;
  category: string;
  severity: string;
  description: string;
  evidence: string;
  codeContext: string;
  verifierReasoning: string;
  criticChallenge?: string;
}

/**
 * Evaluate whether an issue is a false positive
 */
export async function evaluateFalsePositiveLLM(
  input: FalsePositiveInput,
  samplingFn: SamplingFunction,
  config: LLMEvaluatorConfig = DEFAULT_EVALUATOR_CONFIG
): Promise<FalsePositiveEvaluation> {
  const prompt = FALSE_POSITIVE_EVALUATION_PROMPT
    .replace('{issueId}', input.issueId)
    .replace('{category}', input.category)
    .replace('{severity}', input.severity)
    .replace('{description}', input.description)
    .replace('{evidence}', input.evidence || 'No specific evidence provided')
    .replace('{codeContext}', truncateCode(input.codeContext, 3000))
    .replace('{verifierReasoning}', input.verifierReasoning || 'No reasoning provided')
    .replace('{criticChallenge}', input.criticChallenge || 'No challenge from critic');

  try {
    const response = await samplingFn({
      messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
      systemPrompt: FALSE_POSITIVE_SYSTEM_PROMPT,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
    });

    const content = typeof response.content === 'string'
      ? response.content
      : response.content.text;

    return parseFalsePositiveResponse(content);
  } catch (error) {
    // Fallback: treat as needs investigation
    return {
      passed: false,
      confidence: 'low',
      reasoning: `LLM evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      evidence: [],
      verdict: 'needs_context',
      evidenceQuality: 'weak',
      reasoningSound: false,
      recommendedAction: 'investigate',
    };
  }
}

/**
 * Batch evaluate multiple issues for false positives
 */
export async function evaluateFalsePositivesBatch(
  inputs: FalsePositiveInput[],
  samplingFn: SamplingFunction,
  config: LLMEvaluatorConfig = DEFAULT_EVALUATOR_CONFIG
): Promise<Map<string, FalsePositiveEvaluation>> {
  const results = new Map<string, FalsePositiveEvaluation>();

  // Process in parallel batches of 3
  const batchSize = 3;
  for (let i = 0; i < inputs.length; i += batchSize) {
    const batch = inputs.slice(i, i + batchSize);
    const evaluations = await Promise.all(
      batch.map(input => evaluateFalsePositiveLLM(input, samplingFn, config))
    );

    batch.forEach((input, idx) => {
      results.set(input.issueId, evaluations[idx]);
    });
  }

  return results;
}

/**
 * Quick heuristic check before full LLM evaluation
 * Returns true if issue looks suspicious (might be false positive)
 */
export function quickFalsePositiveCheck(input: FalsePositiveInput): {
  suspicious: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  // Check for weak evidence indicators
  if (!input.evidence || input.evidence.length < 20) {
    reasons.push('Evidence is missing or very short');
  }

  // Check for vague descriptions
  const vagueTerms = ['might', 'could potentially', 'possibly', 'seems like', 'appears to'];
  if (vagueTerms.some(term => input.description.toLowerCase().includes(term))) {
    reasons.push('Description uses vague/uncertain language');
  }

  // Check severity vs description mismatch
  if (input.severity === 'CRITICAL' && !input.description.match(/exploit|breach|attack|bypass|injection|rce/i)) {
    reasons.push('CRITICAL severity but no clear attack vector mentioned');
  }

  // Check for common false positive patterns
  const fpPatterns = [
    /todo|fixme|hack/i,  // Comments flagged as issues
    /deprecated but still used/i,  // Intentional backwards compat
    /magic number/i,  // Style preferences
  ];
  if (fpPatterns.some(p => p.test(input.description))) {
    reasons.push('Matches common false positive pattern');
  }

  return {
    suspicious: reasons.length > 0,
    reasons,
  };
}

function parseFalsePositiveResponse(content: string): FalsePositiveEvaluation {
  try {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                      content.match(/(\{[\s\S]*\})/);

    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[1].trim());

    const result: FalsePositiveEvaluation = {
      passed: Boolean(parsed.passed),
      confidence: validateConfidence(parsed.confidence),
      reasoning: String(parsed.reasoning || 'No reasoning provided'),
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
      verdict: validateVerdict(parsed.verdict),
      evidenceQuality: validateEvidenceQuality(parsed.evidenceQuality),
      reasoningSound: Boolean(parsed.reasoningSound),
      recommendedAction: validateAction(parsed.recommendedAction),
    };

    if (parsed.alternativeInterpretation) {
      result.alternativeInterpretation = String(parsed.alternativeInterpretation);
    }

    return result;
  } catch (error) {
    return {
      passed: false,
      confidence: 'low',
      reasoning: `Failed to parse response: ${error instanceof Error ? error.message : 'Parse error'}`,
      evidence: [],
      verdict: 'needs_context',
      evidenceQuality: 'weak',
      reasoningSound: false,
      recommendedAction: 'investigate',
    };
  }
}

function validateConfidence(value: unknown): 'high' | 'medium' | 'low' | 'uncertain' {
  if (['high', 'medium', 'low', 'uncertain'].includes(String(value))) {
    return value as 'high' | 'medium' | 'low' | 'uncertain';
  }
  return 'uncertain';
}

function validateVerdict(value: unknown): FalsePositiveEvaluation['verdict'] {
  const valid = ['valid', 'false_positive', 'partially_valid', 'needs_context'];
  if (valid.includes(String(value))) {
    return value as FalsePositiveEvaluation['verdict'];
  }
  return 'needs_context';
}

function validateEvidenceQuality(value: unknown): FalsePositiveEvaluation['evidenceQuality'] {
  if (['strong', 'moderate', 'weak', 'missing'].includes(String(value))) {
    return value as FalsePositiveEvaluation['evidenceQuality'];
  }
  return 'weak';
}

function validateAction(value: unknown): FalsePositiveEvaluation['recommendedAction'] {
  if (['keep', 'dismiss', 'modify', 'investigate'].includes(String(value))) {
    return value as FalsePositiveEvaluation['recommendedAction'];
  }
  return 'investigate';
}

function truncateCode(code: string, maxLength: number): string {
  if (code.length <= maxLength) return code;
  return code.slice(0, maxLength) + '\n// ... [truncated]';
}
