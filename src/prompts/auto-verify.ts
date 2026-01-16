/**
 * Auto-Verify Prompt
 *
 * Instructions for automatic verification using MCP Sampling
 */

export function generateAutoVerifyPrompt(args: Record<string, string>): string {
  const target = args.target || '.';
  const requirements = args.requirements || 'General code quality, security, and correctness verification';
  const maxRounds = args.maxRounds || '10';

  return `# Elenchus Auto-Verification

You are about to run an **AUTOMATIC** verification loop using MCP Sampling.

## What This Does

The server will autonomously orchestrate a Verifier↔Critic loop:
1. **Verifier Round**: Server generates prompt, requests LLM completion, extracts issues
2. **Critic Round**: Server generates review prompt, requests LLM completion, validates issues
3. **Repeat**: Until convergence or max rounds reached

**You don't need to manually run rounds** - the server handles everything via Sampling.

## How to Start

Call the \`elenchus_auto_verify\` tool:

\`\`\`json
{
  "target": "${target}",
  "requirements": "${requirements}",
  "workingDir": "${process.cwd()}",
  "config": {
    "maxRounds": ${maxRounds},
    "stopOnCritical": false,
    "autoConsolidate": true
  }
}
\`\`\`

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| \`maxRounds\` | 10 | Maximum verification rounds |
| \`maxTokens\` | 4000 | Tokens per LLM request |
| \`stopOnCritical\` | false | Stop on first CRITICAL issue |
| \`minRounds\` | 2 | Minimum rounds before convergence |
| \`autoConsolidate\` | true | Generate fix plan at end |

## What You Get Back

\`\`\`typescript
{
  sessionId: string;
  status: 'converged' | 'stopped' | 'error';
  totalRounds: number;
  duration: number;  // milliseconds
  issues: {
    total: number;
    critical: number;
    high: number;
    resolved: number;
  };
  convergenceReason?: string;
  consolidatedPlan?: {
    mustFix: Issue[];
    shouldFix: Issue[];
    couldFix: Issue[];
    wontFix: Issue[];
    totalEffort: string;
  };
}
\`\`\`

## Requirements

**Client must support MCP Sampling capability** for this to work.
If your client doesn't support Sampling, use the manual \`/verify\` command instead.

## Target Information

- **Target**: ${target}
- **Requirements**: ${requirements}
- **Max Rounds**: ${maxRounds}

---

**Start the auto-verification now by calling \`elenchus_auto_verify\`.**
`;
}
