/**
 * Tier-Specific Prompts
 * [ENH: TIERED] Prompts optimized for each verification tier
 */

import { TierConfig, VerificationTier } from './types.js';

/**
 * Generate tier-specific verifier prompt
 */
export function getTierVerifierPrompt(config: TierConfig): {
  systemPrompt: string;
  outputTemplate: string;
  wordLimit: number;
} {
  switch (config.promptStyle) {
    case 'brief':
      return {
        systemPrompt: `## Quick Screen Verifier

You are performing a QUICK SCREEN verification. Focus on:
- ${config.categories.join(', ')} issues only
- ${config.minSeverity}+ severity issues only
- Obvious bugs and security flaws

DO NOT:
- Spend time on style issues
- Check edge cases
- Analyze dependencies

Be FAST. Report only clear issues.`,
        outputTemplate: `## Screen Results
**Issues Found**: [count]

### Issues
1. [SEV] [CAT] brief description - file:line

### Recommendation
[PASS/ESCALATE to focused/ESCALATE to exhaustive]`,
        wordLimit: 200
      };

    case 'standard':
      return {
        systemPrompt: `## Focused Review Verifier

You are performing a FOCUSED verification on flagged areas. Check:
- ${config.categories.join(', ')} categories
- ${config.minSeverity}+ severity issues
- Direct dependencies of flagged code

Focus on:
- Issues raised in screening
- Related code paths
- Input validation and error handling

Be thorough but efficient.`,
        outputTemplate: `## Focused Review Results
**Files Reviewed**: [count]
**Issues Found**: [count]

### Issue Analysis
| ID | Category | Severity | Summary | Location |
|----|----------|----------|---------|----------|
| ... | ... | ... | ... | ... |

### Dependency Concerns
- [list any dependency issues]

### Recommendation
[PASS/ESCALATE to exhaustive/NEEDS FIX]`,
        wordLimit: 500
      };

    case 'detailed':
    default:
      return {
        systemPrompt: `## Exhaustive Analysis Verifier

You are performing a COMPLETE verification. Check ALL categories:
- ${config.categories.join(', ')}
- ALL severity levels
- Edge cases and boundary conditions
- Full dependency chain
- Negative assertions (confirm what's NOT an issue)

Be thorough. Document everything.`,
        outputTemplate: `## Exhaustive Analysis Results

### Summary
- Files Analyzed: [count]
- Issues Found: [count] (Critical: X, High: Y, Medium: Z, Low: W)
- Categories Covered: [list]

### Detailed Issues
[Full issue list with evidence]

### Edge Cases Checked
[List of edge cases verified]

### Negative Assertions
[What was verified as NOT having issues]

### Final Verdict
[PASS/FAIL/CONDITIONAL with justification]`,
        wordLimit: 1500
      };
  }
}

/**
 * Generate tier-specific critic prompt
 */
export function getTierCriticPrompt(config: TierConfig): {
  systemPrompt: string;
  outputTemplate: string;
  wordLimit: number;
} {
  switch (config.promptStyle) {
    case 'brief':
      return {
        systemPrompt: `## Quick Screen Critic

Quickly validate screen findings. Check:
- Are reported issues real?
- Severity accurate?
- Any obvious misses?

Be FAST. Challenge only clear errors.`,
        outputTemplate: `## Screen Critique
**Verdict**: [VALID/INVALID/NEEDS FOCUS]
- Issue X: [VALID/FALSE POSITIVE]

Recommendation: [continue/escalate]`,
        wordLimit: 150
      };

    case 'standard':
      return {
        systemPrompt: `## Focused Review Critic

Validate focused review findings:
- Verify issue evidence
- Check severity classifications
- Note any gaps in coverage

Be thorough but efficient.`,
        outputTemplate: `## Focused Critique

### Issue Verdicts
| Issue | Verdict | Reason |
|-------|---------|--------|
| ... | ... | ... |

### Coverage Gaps
[Any areas missed]

### Recommendation
[continue/escalate/approve]`,
        wordLimit: 400
      };

    case 'detailed':
    default:
      return {
        systemPrompt: `## Exhaustive Analysis Critic

Perform complete critique:
- Challenge every issue with evidence
- Verify edge case coverage
- Check negative assertions
- Ensure all categories covered

Be adversarial. Find what was missed.`,
        outputTemplate: `## Exhaustive Critique

### Issue Analysis
[Detailed verdict on each issue]

### Coverage Verification
- Categories: [coverage status]
- Edge Cases: [coverage status]
- Dependencies: [coverage status]

### Missed Issues
[Any issues the Verifier missed]

### Final Verdict
[APPROVE/REJECT/CONDITIONAL]`,
        wordLimit: 1000
      };
  }
}

/**
 * Get transition prompt between tiers
 */
export function getTierTransitionPrompt(
  fromTier: VerificationTier,
  toTier: VerificationTier,
  reason: string,
  scope: string[]
): string {
  return `## Tier Escalation: ${fromTier} → ${toTier}

**Reason**: ${reason}
**Scope**: ${scope.length > 0 ? scope.join(', ') : 'All files'}

The verification is being escalated to provide more thorough analysis.
Focus your ${toTier} review on the areas that triggered escalation.`;
}
