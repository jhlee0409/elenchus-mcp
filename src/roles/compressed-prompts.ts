/**
 * Compressed Role Prompts
 * [ENH: TOKEN-OPT] Ultra-compact prompts for token efficiency
 * ~60% token reduction vs full prompts while preserving quality
 */

import { RolePrompt } from './types.js';

// =============================================================================
// Compressed Verifier Prompt (~350 tokens vs ~700 original)
// =============================================================================

export const COMPRESSED_VERIFIER_PROMPT: RolePrompt = {
  role: 'verifier',
  systemPrompt: `# Verifier Role

Find ALL code issues across 5 categories. After you, NO NEW ISSUES should be discoverable.

## Categories (must cover all)
- SECURITY: injection, auth, encryption, validation
- CORRECTNESS: logic, edge cases, types, async
- RELIABILITY: errors, resources, concurrency
- MAINTAINABILITY: complexity, duplication
- PERFORMANCE: algorithms, memory, I/O

## Edge Case Thinking (required)
For each code section, ask:
- Inputs: null/empty/malformed/boundary?
- State: race conditions? idempotent?
- Dependencies: failures? timeouts?
- Users: rapid clicks? concurrent sessions?

## Output Rules
- Location: file:line
- Evidence: actual code snippet
- Severity: CRITICAL/HIGH/MEDIUM/LOW
- Clean areas: state what was checked`,

  outputTemplate: `## Issues
[ID]: [Category] [Severity] at [file:line]
- Why: [explanation]
- Evidence: \`[code]\`

## Edge Cases Checked
[bullet list of scenarios]

## Category Coverage
- SECURITY: [finding or "clean"]
- CORRECTNESS: [finding or "clean"]
- RELIABILITY: [finding or "clean"]
- MAINTAINABILITY: [finding or "clean"]
- PERFORMANCE: [finding or "clean"]`,

  // Zero-shot: no example needed
  exampleOutput: '',

  checklist: [
    '5 categories covered?',
    'Edge cases documented?',
    'Evidence provided?'
  ]
};

// =============================================================================
// Compressed Critic Prompt (~250 tokens vs ~400 original)
// =============================================================================

export const COMPRESSED_CRITIC_PROMPT: RolePrompt = {
  role: 'critic',
  systemPrompt: `# Critic Role

Verify issues and ensure Verifier missed NOTHING.

## Must Do
1. Review ALL issues: VALID/INVALID/PARTIAL with reasoning
2. Verify all 5 categories were checked - FLAG if skipped
3. Verify edge cases were analyzed - FLAG if missing
4. FLAG potential issues: "FLAG FOR VERIFIER: [description]"

## Must Not
- Directly raise issues (use FLAG)
- Approve incomplete verification
- Accept without reasoning

## Verdict Criteria
- VALID: issue exists, evidence correct
- INVALID: false positive, intended behavior
- PARTIAL: exists but needs adjustment`,

  outputTemplate: `## Verdicts
[ID]: [VERDICT] - [reason]

## Coverage Check
Categories: [OK/missing X]
Edge cases: [OK/missing]

## Flags (if any)
FLAG FOR VERIFIER: [description]`,

  exampleOutput: '',

  checklist: [
    'All issues reviewed?',
    'Coverage verified?',
    'FLAGs used (not direct issues)?'
  ]
};

// =============================================================================
// Configuration
// =============================================================================

export interface CompressedPromptConfig {
  enabled: boolean;
  // Use compressed prompts from round N (1 = always)
  startRound: number;
  // Include example output
  includeExample: boolean;
}

export const DEFAULT_COMPRESSED_CONFIG: CompressedPromptConfig = {
  enabled: true,
  startRound: 1,  // Use compressed from start
  includeExample: false  // Zero-shot by default
};

// =============================================================================
// Prompt Selection
// =============================================================================

/**
 * Get compressed prompt for role
 */
export function getCompressedPrompt(
  role: 'verifier' | 'critic',
  config: CompressedPromptConfig = DEFAULT_COMPRESSED_CONFIG
): RolePrompt | null {
  if (!config.enabled) return null;

  const prompt = role === 'verifier'
    ? COMPRESSED_VERIFIER_PROMPT
    : COMPRESSED_CRITIC_PROMPT;

  // Optionally strip example
  if (!config.includeExample) {
    return { ...prompt, exampleOutput: '' };
  }

  return prompt;
}

/**
 * Estimate token savings
 */
export function estimateCompressedSavings(): {
  verifier: { original: number; compressed: number; savings: number };
  critic: { original: number; compressed: number; savings: number };
  total: { savings: number; percent: number };
} {
  // Estimates based on character count / 4
  const verifierOriginal = 700;
  const verifierCompressed = 350;
  const criticOriginal = 400;
  const criticCompressed = 250;

  return {
    verifier: {
      original: verifierOriginal,
      compressed: verifierCompressed,
      savings: verifierOriginal - verifierCompressed
    },
    critic: {
      original: criticOriginal,
      compressed: criticCompressed,
      savings: criticOriginal - criticCompressed
    },
    total: {
      savings: (verifierOriginal - verifierCompressed) + (criticOriginal - criticCompressed),
      percent: Math.round(
        ((verifierOriginal + criticOriginal) - (verifierCompressed + criticCompressed)) /
        (verifierOriginal + criticOriginal) * 100
      )
    }
  };
}
