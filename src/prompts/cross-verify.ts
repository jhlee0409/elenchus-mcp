/**
 * Cross-Verify Prompt - Adversarial verification loop
 */

export function generateCrossVerifyPrompt(args: Record<string, string>): string {
  const target = args.target || '[target]';
  const question = args.question || '';

  return `[ELENCHUS CROSS-VERIFY MODE ACTIVATED]

Target: ${target}
${question ? `Question: ${question}` : ''}

## Adversarial Cross-Verification

Verifier and Critic alternate to perform thorough analysis.

### Role Definitions

| Role | Purpose | Actions |
|------|---------|---------|
| **Verifier** | Find issues | Analyze code, present evidence, raise issues |
| **Critic** | Validate issues | Review evidence, accept or reject |

### Workflow

\`\`\`
elenchus_start_session({
  target: "${target}",
  requirements: "${question || 'thorough code verification'}",
  workingDir: "[current working directory]"
})

Round 1 (Verifier):
  → Analyze code
  → Raise issues with evidence
  → elenchus_submit_round(role: "verifier")

Round 2 (Critic):
  → Review Verifier's issues
  → Verdict: VALID / INVALID / PARTIAL
  → elenchus_submit_round(role: "critic")

Round 3+ (alternation):
  → Repeat until convergence

elenchus_end_session(verdict)
\`\`\`

### Issue Format (Verifier)

\`\`\`json
{
  "id": "SEC-01",
  "category": "SECURITY",
  "severity": "CRITICAL",
  "summary": "SQL Injection vulnerability",
  "location": "src/db/queries.ts:45",
  "description": "User input directly interpolated into query",
  "evidence": "const query = \`SELECT * FROM users WHERE id = \${userId}\`"
}
\`\`\`

### Verdict Format (Critic)

\`\`\`markdown
### SEC-01: SQL Injection vulnerability

**Verdict: VALID**

**Reasoning:**
- Evidence code shows unparameterized query
- userId comes directly from user input
- SQL Injection attack is possible

**Severity agreement:** Keep as CRITICAL
\`\`\`

Or:

\`\`\`markdown
### MNT-02: High complexity

**Verdict: INVALID**

**Reasoning:**
- While the function appears complex
- Each branch handles clear business logic
- Splitting would reduce cohesion

**Conclusion:** Issue rejected
\`\`\`

### Convergence Conditions

| Condition | Required |
|-----------|----------|
| CRITICAL issues = 0 | Yes |
| 2+ rounds without new issues | Yes |
| Minimum 2 rounds completed | Yes |

### Output Format

\`\`\`markdown
=== ELENCHUS CROSS-VERIFY: ROUND N ===

## Role: [VERIFIER/CRITIC]

### Analysis Results
[Detailed content]

### Issue List (Verifier) / Verdict Results (Critic)
[Table format]

### Server Response
- Convergence status: [In progress/Converged]
- Next role: [verifier/critic/complete]
- Intervention: [if any]

→ [Next step]
\`\`\`

### Final Output

\`\`\`markdown
=== ELENCHUS CROSS-VERIFY: COMPLETE ===

## Verification Summary
| Item | Result |
|------|--------|
| Total rounds | N |
| Issues raised | N |
| Issues accepted | N |
| Issues rejected | N |

## Final Issue List
| ID | Severity | Summary | Status |
|----|----------|---------|--------|
| SEC-01 | CRITICAL | SQL Injection | VALID |

## Verdict
**VERDICT: [PASS/FAIL/CONDITIONAL]**
\`\`\`

BEGIN CROSS-VERIFICATION NOW.

Start with elenchus_start_session.`;
}
