/**
 * Consolidate Prompt - Transform verification results into fix plan
 */

export function generateConsolidatePrompt(args: Record<string, string>): string {
  const sessionId = args.sessionId || '';

  return `[ELENCHUS CONSOLIDATE MODE ACTIVATED]

${sessionId ? `Session ID: ${sessionId}` : '(Session ID required - get from previous verify session)'}

## Elenchus Consolidate Protocol

Transform verification results into a prioritized fix plan.

### Step 1: Get Issues

\`\`\`
elenchus_get_issues({
  sessionId: "${sessionId || '[sessionId]'}",
  status: "unresolved"
})
\`\`\`

### Step 2: Classify by Bucket

| Bucket | Condition | Action |
|--------|-----------|--------|
| **MUST FIX** | CRITICAL or HIGH | Fix immediately |
| **SHOULD FIX** | MEDIUM | Recommended before deploy |
| **NICE TO HAVE** | LOW | When time permits |
| **WONT FIX** | Cost > Benefit | Document only |

### Step 3: Calculate Priority Score

\`\`\`
priority_score = severity_weight + impact_weight + fix_complexity

severity_weight:
  CRITICAL: 100
  HIGH: 75
  MEDIUM: 50
  LOW: 25

impact_weight:
  Security: +30
  Data Loss: +25
  Service Down: +20
  UX: +10

fix_complexity (inverse):
  Simple (1-5 lines): +20
  Medium (6-20 lines): +10
  Complex (20+ lines): +0
\`\`\`

### Step 4: Generate Fix Plan

For each FIX:

\`\`\`markdown
### FIX-N: [Issue ID] - [Summary]

**Bucket:** MUST FIX
**Priority Score:** 125

**Affected Files:**
- src/auth/login.ts:45-52

**Fix Code:**
\\\`\\\`\\\`typescript
// Before
const query = \`SELECT * FROM users WHERE id = \${userId}\`;

// After
const query = 'SELECT * FROM users WHERE id = ?';
const result = await db.query(query, [userId]);
\\\`\\\`\\\`

**Dependencies:**
- None (can fix independently)
\`\`\`

### Output Format

\`\`\`markdown
=== ELENCHUS CONSOLIDATE RESULTS ===

## Classification by Bucket

### MUST FIX (N items)
| ID | Summary | Priority | Files |
|----|---------|----------|-------|
| SEC-01 | SQL Injection | 125 | login.ts |

### SHOULD FIX (N items)
...

### NICE TO HAVE (N items)
...

### WONT FIX (N items)
| ID | Summary | Reason |
|----|---------|--------|
| MNT-03 | Code duplication | Fix cost > benefit |

## Fix Plan

[Detailed content for each FIX]

## Execution Order

1. FIX-1 (no dependencies)
2. FIX-2 (no dependencies)
3. FIX-3 (after FIX-1)
...

## Next Step

→ Use /elenchus:apply or /mcp__elenchus__apply to apply fixes
\`\`\`

BEGIN CONSOLIDATION NOW.

${sessionId ? `Call elenchus_get_issues({ sessionId: "${sessionId}" }) to start.` : 'First get the sessionId from your previous verify session, then call elenchus_get_issues({ sessionId: "[your-session-id]" }).'}`;
}
