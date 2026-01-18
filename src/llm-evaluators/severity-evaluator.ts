/**
 * LLM-based Severity Evaluator
 *
 * Replaces keyword matching with contextual severity assessment
 * considering exploitability, scope, and business impact.
 */

import type {
  SamplingFunction,
  SeverityEvaluation,
  LLMEvaluatorConfig,
} from './types.js';
import { DEFAULT_EVALUATOR_CONFIG } from './types.js';

const SEVERITY_SYSTEM_PROMPT = `You are an expert security and code quality analyst.
Your task is to accurately assess the severity of code issues.

CRITICAL vs HIGH vs MEDIUM vs LOW guidelines:

CRITICAL:
- Remote code execution possible
- Authentication bypass
- Data breach potential (PII, credentials)
- Financial loss risk
- System compromise possible

HIGH:
- Privilege escalation
- Significant data exposure
- Denial of service
- Major functionality broken
- Security headers missing on sensitive endpoints

MEDIUM:
- Information disclosure (non-sensitive)
- Input validation gaps
- Error handling issues
- Performance degradation
- Code quality affecting reliability

LOW:
- Code style issues
- Minor optimization opportunities
- Documentation gaps
- Non-critical best practices

Consider:
1. EXPLOITABILITY: How easy is it to exploit?
2. SCOPE: How many users/systems affected?
3. BUSINESS IMPACT: What's the real-world consequence?
4. CONTEXT: Is this internal tool vs public-facing app?

Respond with a JSON evaluation.`;

const SEVERITY_EVALUATION_PROMPT = `Assess the severity of this code issue:

## Issue Description
{issueDescription}

## Code Context
{codeContext}

## File Path
{filePath}

## Project Type
{projectType}

## Current Assigned Severity
{currentSeverity}

---

Evaluate:
1. Is the current severity assessment accurate?
2. What's the actual exploitability level?
3. What's the real-world impact scope?
4. Should severity be adjusted based on context?

Respond with ONLY a valid JSON object:
{
  "passed": boolean (true if severity is accurate),
  "confidence": "high" | "medium" | "low" | "uncertain",
  "reasoning": "detailed explanation",
  "evidence": ["evidence points"],
  "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  "impact": {
    "exploitability": "easy" | "moderate" | "difficult" | "theoretical",
    "scope": "widespread" | "limited" | "isolated",
    "businessImpact": "critical" | "significant" | "moderate" | "minimal"
  },
  "adjustment": {
    "direction": "escalate" | "downgrade",
    "reason": "why adjustment is needed"
  } (only if severity should change from current)
}`;

export interface SeverityEvaluationInput {
  issueId: string;
  issueDescription: string;
  codeContext: string;
  filePath: string;
  projectType: string;
  currentSeverity: string;
}

/**
 * Evaluate issue severity using LLM reasoning
 */
export async function evaluateSeverityLLM(
  input: SeverityEvaluationInput,
  samplingFn: SamplingFunction,
  config: LLMEvaluatorConfig = DEFAULT_EVALUATOR_CONFIG
): Promise<SeverityEvaluation> {
  const prompt = SEVERITY_EVALUATION_PROMPT
    .replace('{issueDescription}', input.issueDescription)
    .replace('{codeContext}', truncateCode(input.codeContext, 2000))
    .replace('{filePath}', input.filePath)
    .replace('{projectType}', input.projectType || 'unknown')
    .replace('{currentSeverity}', input.currentSeverity);

  try {
    const response = await samplingFn({
      messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
      systemPrompt: SEVERITY_SYSTEM_PROMPT,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
    });

    const content = typeof response.content === 'string'
      ? response.content
      : response.content.text;

    return parseSeverityResponse(content, input.currentSeverity);
  } catch (error) {
    // Fallback: trust current severity
    return {
      passed: true,
      confidence: 'low',
      reasoning: `LLM evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}. Keeping original severity.`,
      evidence: [],
      severity: normalizeSeverity(input.currentSeverity),
      impact: {
        exploitability: 'moderate',
        scope: 'limited',
        businessImpact: 'moderate',
      },
    };
  }
}

/**
 * Batch evaluate multiple issues for efficiency
 */
export async function evaluateSeveritiesBatch(
  inputs: SeverityEvaluationInput[],
  samplingFn: SamplingFunction,
  config: LLMEvaluatorConfig = DEFAULT_EVALUATOR_CONFIG
): Promise<Map<string, SeverityEvaluation>> {
  const results = new Map<string, SeverityEvaluation>();

  // Process in parallel batches of 3
  const batchSize = 3;
  for (let i = 0; i < inputs.length; i += batchSize) {
    const batch = inputs.slice(i, i + batchSize);
    const evaluations = await Promise.all(
      batch.map(input => evaluateSeverityLLM(input, samplingFn, config))
    );

    batch.forEach((input, idx) => {
      results.set(input.issueId, evaluations[idx]);
    });
  }

  return results;
}

function parseSeverityResponse(content: string, fallbackSeverity: string): SeverityEvaluation {
  try {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                      content.match(/(\{[\s\S]*\})/);

    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[1].trim());

    const result: SeverityEvaluation = {
      passed: Boolean(parsed.passed),
      confidence: validateConfidence(parsed.confidence),
      reasoning: String(parsed.reasoning || 'No reasoning provided'),
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
      severity: normalizeSeverity(parsed.severity || fallbackSeverity),
      impact: validateImpact(parsed.impact),
    };

    if (parsed.adjustment && parsed.adjustment.direction) {
      result.adjustment = {
        direction: parsed.adjustment.direction === 'escalate' ? 'escalate' : 'downgrade',
        reason: String(parsed.adjustment.reason || 'No reason provided'),
      };
    }

    return result;
  } catch (error) {
    return {
      passed: true,
      confidence: 'low',
      reasoning: `Failed to parse response: ${error instanceof Error ? error.message : 'Parse error'}`,
      evidence: [],
      severity: normalizeSeverity(fallbackSeverity),
      impact: {
        exploitability: 'moderate',
        scope: 'limited',
        businessImpact: 'moderate',
      },
    };
  }
}

function normalizeSeverity(value: string): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
  const upper = String(value).toUpperCase();
  if (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(upper)) {
    return upper as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  }
  return 'MEDIUM';
}

function validateConfidence(value: unknown): 'high' | 'medium' | 'low' | 'uncertain' {
  if (['high', 'medium', 'low', 'uncertain'].includes(String(value))) {
    return value as 'high' | 'medium' | 'low' | 'uncertain';
  }
  return 'uncertain';
}

function validateImpact(impact: unknown): SeverityEvaluation['impact'] {
  const defaults = {
    exploitability: 'moderate' as const,
    scope: 'limited' as const,
    businessImpact: 'moderate' as const,
  };

  if (!impact || typeof impact !== 'object') {
    return defaults;
  }

  const i = impact as Record<string, unknown>;
  return {
    exploitability: validateExploitability(i.exploitability),
    scope: validateScope(i.scope),
    businessImpact: validateBusinessImpact(i.businessImpact),
  };
}

function validateExploitability(val: unknown): 'easy' | 'moderate' | 'difficult' | 'theoretical' {
  if (['easy', 'moderate', 'difficult', 'theoretical'].includes(String(val))) {
    return val as 'easy' | 'moderate' | 'difficult' | 'theoretical';
  }
  return 'moderate';
}

function validateScope(val: unknown): 'widespread' | 'limited' | 'isolated' {
  if (['widespread', 'limited', 'isolated'].includes(String(val))) {
    return val as 'widespread' | 'limited' | 'isolated';
  }
  return 'limited';
}

function validateBusinessImpact(val: unknown): 'critical' | 'significant' | 'moderate' | 'minimal' {
  if (['critical', 'significant', 'moderate', 'minimal'].includes(String(val))) {
    return val as 'critical' | 'significant' | 'moderate' | 'minimal';
  }
  return 'moderate';
}

function truncateCode(code: string, maxLength: number): string {
  if (code.length <= maxLength) return code;
  return code.slice(0, maxLength) + '\n// ... [truncated]';
}
