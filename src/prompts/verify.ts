/**
 * Verify Prompt - Full instructions for verification workflow
 */

export function generateVerifyPrompt(args: Record<string, string>): string {
  const target = args.target || '[target path]';
  const requirements = args.requirements || 'code quality and security verification';

  return `[ELENCHUS VERIFY MODE ACTIVATED]

Target: ${target}
Requirements: ${requirements}

## Elenchus Verify Protocol (MCP-Backed)

This verification uses the **Elenchus MCP Server** for state management.

### Step 1: Start Session

Start a session with the MCP tool:

\`\`\`
elenchus_start_session({
  target: "${target}",
  requirements: "${requirements}",
  workingDir: "[current working directory]"
})
\`\`\`

**Response example:**
\`\`\`json
{
  "sessionId": "2024-01-15_src-auth_abc123",
  "status": "initialized",
  "context": {
    "target": "${target}",
    "filesCollected": 12,
    "requirements": "${requirements}"
  }
}
\`\`\`

### Step 2: Verification Loop

#### Round 1: Verifier

1. Get context:
\`\`\`
elenchus_get_context({ sessionId: "[sessionId]" })
\`\`\`

2. Review code against 26 standard verification criteria

3. Submit results:
\`\`\`
elenchus_submit_round({
  sessionId: "[sessionId]",
  role: "verifier",
  output: "[full verification report]",
  issuesRaised: [
    {
      id: "SEC-01",
      category: "SECURITY",
      severity: "CRITICAL",
      summary: "SQL Injection vulnerability",
      location: "src/db/queries.ts:45",
      description: "User input directly interpolated into query",
      evidence: "line 45: const query = \`SELECT * FROM users WHERE id = \${userId}\`"
    }
  ]
})
\`\`\`

#### Round 2+: Critic/Verifier alternation

Server returns \`nextRole\`:
- \`verifier\`: Next round is Verifier
- \`critic\`: Next round is Critic
- \`complete\`: Convergence reached

### Standard Verification Criteria (26 items)

\`\`\`
SECURITY (8 items)
- SEC-01: SQL Injection
- SEC-02: XSS (Cross-Site Scripting)
- SEC-03: CSRF (Cross-Site Request Forgery)
- SEC-04: Authentication bypass
- SEC-05: Privilege escalation
- SEC-06: Sensitive data exposure
- SEC-07: Insufficient encryption
- SEC-08: Missing input validation

CORRECTNESS (6 items)
- COR-01: Logic errors
- COR-02: Boundary condition handling
- COR-03: Type mismatches
- COR-04: Async/await errors
- COR-05: Missing error handling
- COR-06: State management errors

RELIABILITY (4 items)
- REL-01: Resource leaks
- REL-02: Missing retry logic
- REL-03: Missing timeouts
- REL-04: Abnormal termination handling

MAINTAINABILITY (4 items)
- MNT-01: Code duplication
- MNT-02: High complexity
- MNT-03: Tight coupling
- MNT-04: Unclear naming

PERFORMANCE (4 items)
- PRF-01: N+1 queries
- PRF-02: Memory inefficiency
- PRF-03: Inefficient algorithms
- PRF-04: Missing caching
\`\`\`

### Convergence Detection

Server automatically detects convergence:

\`\`\`json
{
  "convergence": {
    "isConverged": false,
    "reason": "2 critical issues unresolved",
    "unresolvedIssues": 5,
    "criticalUnresolved": 2,
    "roundsWithoutNewIssues": 0
  }
}
\`\`\`

### Arbiter Intervention

Server intervenes when problems are detected:

**Intervention types:**
- \`CONTEXT_EXPAND\`: Context expansion needed
- \`SOFT_CORRECT\`: Minor correction needed
- \`LOOP_BREAK\`: Circular argument detected
- \`HARD_ROLLBACK\`: Checkpoint rollback recommended

### Step 3: End Session

On convergence:
\`\`\`
elenchus_end_session({
  sessionId: "[sessionId]",
  verdict: "CONDITIONAL"  // PASS | FAIL | CONDITIONAL
})
\`\`\`

### Output Format

Report after each round:

\`\`\`markdown
=== ELENCHUS ROUND N: [VERIFIER/CRITIC] ===

## Round Results
[Agent output]

## Server Response
- Issues raised: N
- Issues resolved: N
- Context expanded: [Yes/No]
- Convergence status: [In progress/Converged]

## Next Step
→ [Next role] or [Complete]
\`\`\`

### Core Principles

\`\`\`
State is managed by the server.
Context is shared by the server.
Convergence is determined by the server.
Intervention is decided by the server.
\`\`\`

BEGIN ELENCHUS VERIFY WITH MCP NOW.`;
}
