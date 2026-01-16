/**
 * Apply Prompt - Apply consolidated fixes to codebase
 */

export function generateApplyPrompt(args: Record<string, string>): string {
  const scope = args.scope || 'must_fix';
  const sessionId = args.sessionId || '';

  return `[ELENCHUS APPLY MODE ACTIVATED]

Scope: ${scope}
${sessionId ? `Session ID: ${sessionId}` : ''}

## Elenchus Apply Protocol

Apply consolidated fix plan to the codebase.

### Scope Options

| Scope | Description | Includes |
|-------|-------------|----------|
| \`must_fix\` | CRITICAL + HIGH only | MUST FIX bucket |
| \`should_fix\` | + MEDIUM included | MUST + SHOULD FIX |
| \`all\` | All fixes | MUST + SHOULD + NICE TO HAVE |

Current Scope: **${scope}**

### Step 1: Create Checkpoint

Create checkpoint before applying:

\`\`\`
elenchus_checkpoint({ sessionId: "[sessionId]" })
\`\`\`

### Step 2: Apply Fixes Sequentially

Apply each FIX in order:

\`\`\`
for each FIX in execution_order:
  1. Read file
  2. Apply fix
  3. Immediate verification (lint, type check)
  4. On success: continue to next FIX
  5. On failure: decide rollback
\`\`\`

### Step 3: Report Applied Changes

Record results after applying:

\`\`\`
elenchus_submit_round({
  sessionId: "[sessionId]",
  role: "verifier",
  output: "[apply report]",
  issuesResolved: ["SEC-01", "COR-02"]
})
\`\`\`

### Rollback on Failure

On failure:

\`\`\`
elenchus_rollback({
  sessionId: "[sessionId]",
  toRound: [checkpoint round]
})
\`\`\`

### Output Format

\`\`\`markdown
=== ELENCHUS APPLY RESULTS ===

## Apply Scope
- Scope: ${scope}
- Target FIXes: N

## Apply Results

### Successful (N items)
| FIX | Files Modified | Lines Changed |
|-----|----------------|---------------|
| FIX-1 | login.ts | +5, -3 |

### Failed (N items)
| FIX | Reason | Action |
|-----|--------|--------|
| FIX-3 | Type error | Rolled back |

## Change Summary
- Files modified: N
- Lines added: N
- Lines deleted: N
- Issues resolved: N

## Next Step

→ Re-verification needed: /elenchus:verify or /mcp__elenchus__verify
\`\`\`

### Verification After Apply

Basic verification after applying:

1. **Lint check**: eslint, prettier, etc.
2. **Type check**: tsc --noEmit
3. **Tests**: npm test (if available)

### Core Principles

\`\`\`
Never apply without checkpoint.
Rollback failed FIXes immediately.
All applications are recorded in MCP.
Re-verification is recommended after apply.
\`\`\`

BEGIN APPLY WITH SCOPE: ${scope}

First check previous consolidate results, create checkpoint with elenchus_checkpoint, then start applying.`;
}
