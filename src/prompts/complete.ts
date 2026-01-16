/**
 * Complete Prompt - Full pipeline instructions
 */

export function generateCompletePrompt(args: Record<string, string>): string {
  const target = args.target || '[target path]';
  const maxCycles = args.maxCycles || '5';

  return `[ELENCHUS COMPLETE PIPELINE ACTIVATED]

Target: ${target}
Max Cycles: ${maxCycles}

## Elenchus Complete Protocol (MCP-Backed)

Run the complete pipeline with MCP session management until zero issues.

### Pipeline Overview

\`\`\`
┌────────────────────────────────────────────────────────┐
│                 ELENCHUS COMPLETE                       │
├────────────────────────────────────────────────────────┤
│                                                         │
│  CYCLE N:                                               │
│  ┌──────────┐   ┌─────────────┐   ┌─────────┐         │
│  │  VERIFY  │──▶│ CONSOLIDATE │──▶│  APPLY  │         │
│  └──────────┘   └─────────────┘   └─────────┘         │
│       ▲                                 │              │
│       │         ┌─────────────┐         │              │
│       └─────────│  RE-VERIFY  │◀────────┘              │
│                 └─────────────┘                        │
│                       │                                │
│              ┌────────┴────────┐                       │
│              ▼                 ▼                       │
│         Has issues        No issues                    │
│              │                 │                       │
│         CYCLE N+1         ✅ COMPLETE                  │
│                                                         │
└────────────────────────────────────────────────────────┘
\`\`\`

### Execution Algorithm

\`\`\`
cycle = 0
max_cycles = ${maxCycles}
sessionId = null

while (cycle < max_cycles) {
  cycle++

  // Phase 1: VERIFY
  if (cycle == 1) {
    result = elenchus_start_session(target, requirements, workingDir)
    sessionId = result.sessionId
  }

  // Run verification rounds until convergence
  while (!converged && round < maxRounds) {
    verifierResult = runVerifier()
    elenchus_submit_round(sessionId, 'verifier', verifierResult)

    criticResult = runCritic()
    roundResult = elenchus_submit_round(sessionId, 'critic', criticResult)

    converged = roundResult.convergence.isConverged
  }

  // Check if done
  issues = elenchus_get_issues(sessionId, 'unresolved')
  if (issues.filter(i => i.severity in ['CRITICAL', 'HIGH']).length == 0) {
    break  // No critical/high issues
  }

  // Phase 2: CONSOLIDATE
  // (Classify and create fix plan)

  // Phase 3: APPLY
  elenchus_checkpoint(sessionId)
  applyFixes()

  // Phase 4: RE-VERIFY (next cycle)
}

elenchus_end_session(sessionId, verdict)
\`\`\`

### MCP Tools Usage per Phase

| Phase | MCP Tools |
|-------|-----------|
| VERIFY | start_session, submit_round, get_context |
| CONSOLIDATE | get_issues |
| APPLY | checkpoint, submit_round (issuesResolved) |
| RE-VERIFY | submit_round, get_issues |
| END | end_session |

### Stop Conditions

| Condition | Status | Action |
|-----------|--------|--------|
| CRITICAL/HIGH issues = 0 | ✅ SUCCESS | Complete |
| max_cycles reached | ⚠️ INCOMPLETE | Warning + manual resolution guide |
| Infinite loop detected | ❌ ERROR | Abort |

### Infinite Loop Detection

MCP server's Arbiter auto-detects:

\`\`\`json
{
  "intervention": {
    "type": "LOOP_BREAK",
    "reason": "Same issues being raised/challenged repeatedly",
    "action": "Force conclusion on disputed issues"
  }
}
\`\`\`

### Output Format per Cycle

\`\`\`markdown
=== ELENCHUS COMPLETE: CYCLE N ===

## Phase 1: VERIFY
- Issues found: N
- Convergence rounds: N

## Phase 2: CONSOLIDATE
- MUST FIX: N
- SHOULD FIX: N

## Phase 3: APPLY
- Applied successfully: N
- Failed: N

## Phase 4: RE-VERIFY
- Remaining issues: N
- New issues: N

→ [CONTINUING TO CYCLE N+1 / COMPLETE]
\`\`\`

### Final Output

\`\`\`markdown
=== ELENCHUS COMPLETE: FINISHED ===

## Pipeline Summary
| Item | Result |
|------|--------|
| Total cycles | N |
| Final verdict | PASS / CONDITIONAL |
| Issues resolved | N |
| Issues remaining | N |

## Cycle Progress
| Cycle | Start Issues | Resolved | New Found | End Issues |
|-------|--------------|----------|-----------|------------|
| 1 | 8 | 6 | 0 | 2 |
| 2 | 2 | 2 | 0 | 0 |

## Final Verification Results
- SECURITY: ✅ 0 issues
- CORRECTNESS: ✅ 0 issues
- RELIABILITY: ✅ 0 issues
- MAINTAINABILITY: ✅ 0 issues
- PERFORMANCE: ✅ 0 issues

**VERDICT: ✅ PASS**
\`\`\`

### Core Principles

\`\`\`
Do not stop until zero issues.
All cycles are recorded in MCP.
Infinite loops are detected by Arbiter.
Sessions are permanently preserved.
\`\`\`

BEGIN ELENCHUS COMPLETE PIPELINE WITH MCP NOW.`;
}
