/**
 * LLM Evaluation Tools
 *
 * Provides tools for LLM-based evaluation of verification quality.
 * These tools return evaluation prompts for the client to process.
 */

import { z } from 'zod';
import { getSession } from '../state/session.js';
import { buildEvaluatorContext } from '../llm-evaluators/integration.js';

// =============================================================================
// Schemas
// =============================================================================

const EvaluateConvergenceSchema = z.object({
  sessionId: z.string().describe('Session ID to evaluate'),
});

const EvaluateSeveritySchema = z.object({
  sessionId: z.string().describe('Session ID'),
  issueId: z.string().describe('Issue ID to evaluate'),
  codeContext: z.string().optional().describe('Additional code context for evaluation'),
});

const EvaluateEdgeCasesSchema = z.object({
  sessionId: z.string().describe('Session ID to evaluate'),
});

const SubmitLLMEvaluationSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  evaluationType: z.enum(['convergence', 'severity', 'edgeCases', 'falsePositive']).describe('Type of evaluation'),
  llmResponse: z.string().describe('LLM response to the evaluation prompt'),
  targetId: z.string().optional().describe('Target ID (issue ID for severity/falsePositive evaluations)'),
});

// =============================================================================
// Prompts
// =============================================================================

const CONVERGENCE_SYSTEM_PROMPT = `You are an expert code verification quality assessor.
Your task is to evaluate whether a verification session has adequately examined the codebase.

Consider:
1. CONTEXT SENSITIVITY: Different code types need different scrutiny levels
2. QUALITY OVER QUANTITY: Focus on verification DEPTH, not just coverage keywords
3. ISSUE PATTERNS: Are unresolved issues truly blockers?
4. VERIFICATION COMPLETENESS: Were all critical paths examined?

Respond with a JSON object containing your evaluation.`;

const CONVERGENCE_PROMPT_TEMPLATE = `Evaluate this verification session for convergence readiness:

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

Respond with ONLY a valid JSON object:
{
  "passed": boolean,
  "confidence": "high" | "medium" | "low" | "uncertain",
  "qualityScore": number (0-100),
  "categoryScores": { "SECURITY": number, "CORRECTNESS": number, "RELIABILITY": number, "MAINTAINABILITY": number, "PERFORMANCE": number },
  "gaps": ["gap 1", "gap 2"],
  "moreRoundsRecommended": boolean,
  "reasoning": "detailed explanation"
}`;

const SEVERITY_PROMPT_TEMPLATE = `Assess the severity of this code issue:

## Issue
ID: {issueId}
Category: {category}
Current Severity: {severity}
Description: {description}

## Code Context
{codeContext}

---

Respond with ONLY a valid JSON object:
{
  "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  "confidence": "high" | "medium" | "low",
  "impact": {
    "exploitability": "easy" | "moderate" | "difficult" | "theoretical",
    "scope": "widespread" | "limited" | "isolated",
    "businessImpact": "critical" | "significant" | "moderate" | "minimal"
  },
  "adjustment": { "direction": "escalate" | "downgrade" | "keep", "reason": "explanation" },
  "reasoning": "detailed explanation"
}`;

const EDGE_CASE_PROMPT_TEMPLATE = `Evaluate the edge case coverage in this verification:

## Target Files
{targetFiles}

## Verification Outputs
{verificationOutputs}

---

Analyze whether edge cases were GENUINELY analyzed (not just mentioned).

Respond with ONLY a valid JSON object:
{
  "passed": boolean,
  "confidence": "high" | "medium" | "low",
  "coverageScore": number (0-100),
  "analyzedCases": [{ "description": "case", "category": "type", "adequatelyHandled": boolean }],
  "missingCases": [{ "description": "case", "category": "type", "importance": "critical" | "important" | "nice-to-have" }],
  "reasoning": "detailed explanation"
}`;

// =============================================================================
// Handlers
// =============================================================================

async function evaluateConvergence(args: z.infer<typeof EvaluateConvergenceSchema>) {
  const session = await getSession(args.sessionId);
  if (!session) {
    return { error: 'Session not found' };
  }

  const context = buildEvaluatorContext(session);

  const issuesSummary = session.issues.map(i =>
    `[${i.id}] ${i.severity} ${i.category} (${i.status}): ${i.description}`
  ).join('\n') || 'No issues found';

  const prompt = CONVERGENCE_PROMPT_TEMPLATE
    .replace('{requirements}', context.requirements)
    .replace('{targetFiles}', context.targetFiles.slice(0, 20).join('\n'))
    .replace('{currentRound}', String(context.currentRound))
    .replace('{allOutputs}', truncate(context.allOutputs, 8000))
    .replace('{issuesSummary}', issuesSummary);

  return {
    evaluationType: 'convergence',
    sessionId: args.sessionId,
    systemPrompt: CONVERGENCE_SYSTEM_PROMPT,
    userPrompt: prompt,
    instructions: 'Send this prompt to an LLM, then call elenchus_submit_llm_evaluation with the response.',
  };
}

async function evaluateSeverity(args: z.infer<typeof EvaluateSeveritySchema>) {
  const session = await getSession(args.sessionId);
  if (!session) {
    return { error: 'Session not found' };
  }

  const issue = session.issues.find(i => i.id === args.issueId);
  if (!issue) {
    return { error: 'Issue not found' };
  }

  const prompt = SEVERITY_PROMPT_TEMPLATE
    .replace('{issueId}', issue.id)
    .replace('{category}', issue.category)
    .replace('{severity}', issue.severity)
    .replace('{description}', issue.description)
    .replace('{codeContext}', args.codeContext || issue.evidence || 'No additional context');

  return {
    evaluationType: 'severity',
    sessionId: args.sessionId,
    issueId: args.issueId,
    systemPrompt: 'You are an expert security and code quality analyst.',
    userPrompt: prompt,
    instructions: 'Send this prompt to an LLM, then call elenchus_submit_llm_evaluation with the response.',
  };
}

async function evaluateEdgeCases(args: z.infer<typeof EvaluateEdgeCasesSchema>) {
  const session = await getSession(args.sessionId);
  if (!session) {
    return { error: 'Session not found' };
  }

  const context = buildEvaluatorContext(session);

  const prompt = EDGE_CASE_PROMPT_TEMPLATE
    .replace('{targetFiles}', context.targetFiles.slice(0, 20).join('\n'))
    .replace('{verificationOutputs}', truncate(context.allOutputs, 6000));

  return {
    evaluationType: 'edgeCases',
    sessionId: args.sessionId,
    systemPrompt: 'You are an expert at evaluating test coverage and edge case analysis.',
    userPrompt: prompt,
    instructions: 'Send this prompt to an LLM, then call elenchus_submit_llm_evaluation with the response.',
  };
}

async function submitLLMEvaluation(args: z.infer<typeof SubmitLLMEvaluationSchema>) {
  const session = await getSession(args.sessionId);
  if (!session) {
    return { error: 'Session not found' };
  }

  try {
    // Parse LLM response
    const jsonMatch = args.llmResponse.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                      args.llmResponse.match(/(\{[\s\S]*\})/);

    if (!jsonMatch) {
      return { error: 'Could not parse JSON from LLM response' };
    }

    const evaluation = JSON.parse(jsonMatch[1].trim());

    // Store evaluation result in session
    if (!session.llmEvalResults) {
      session.llmEvalResults = {};
    }

    switch (args.evaluationType) {
      case 'convergence':
        session.llmEvalResults.convergence = {
          qualityScore: evaluation.qualityScore || 0,
          categoryScores: evaluation.categoryScores || {},
          gaps: evaluation.gaps || [],
          moreRoundsRecommended: evaluation.moreRoundsRecommended || false,
          evaluatedAt: new Date().toISOString(),
        };
        break;

      case 'severity':
        if (!session.llmEvalResults.severityAdjustments) {
          session.llmEvalResults.severityAdjustments = [];
        }
        if (args.targetId && evaluation.adjustment?.direction !== 'keep') {
          session.llmEvalResults.severityAdjustments.push({
            issueId: args.targetId,
            originalSeverity: session.issues.find(i => i.id === args.targetId)?.severity || 'UNKNOWN',
            adjustedSeverity: evaluation.severity,
            reason: evaluation.adjustment?.reason || evaluation.reasoning,
          });
        }
        break;

      case 'edgeCases':
        session.llmEvalResults.edgeCaseCoverage = {
          coverageScore: evaluation.coverageScore || 0,
          analyzedCases: evaluation.analyzedCases?.length || 0,
          missingCritical: evaluation.missingCases?.filter((c: { importance: string }) => c.importance === 'critical').length || 0,
        };
        break;
    }

    return {
      success: true,
      evaluationType: args.evaluationType,
      result: evaluation,
      stored: true,
    };
  } catch (error) {
    return {
      error: `Failed to parse evaluation: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const half = Math.floor(maxLength / 2);
  return text.slice(0, half) + '\n\n... [truncated] ...\n\n' + text.slice(-half);
}

// =============================================================================
// Export Tools
// =============================================================================

export const llmEvalTools = {
  elenchus_evaluate_convergence: {
    description: 'Get LLM evaluation prompt for convergence quality assessment. Returns a prompt to send to an LLM.',
    schema: EvaluateConvergenceSchema,
    handler: evaluateConvergence,
  },
  elenchus_evaluate_severity: {
    description: 'Get LLM evaluation prompt for issue severity assessment. Returns a prompt to send to an LLM.',
    schema: EvaluateSeveritySchema,
    handler: evaluateSeverity,
  },
  elenchus_evaluate_edge_cases: {
    description: 'Get LLM evaluation prompt for edge case coverage. Returns a prompt to send to an LLM.',
    schema: EvaluateEdgeCasesSchema,
    handler: evaluateEdgeCases,
  },
  elenchus_submit_llm_evaluation: {
    description: 'Submit LLM evaluation response. Call this after receiving an LLM response to an evaluation prompt.',
    schema: SubmitLLMEvaluationSchema,
    handler: submitLLMEvaluation,
  },
};
