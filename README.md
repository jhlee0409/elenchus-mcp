# Elenchus MCP Server

**English** | [한국어](./README.ko.md)

Adversarial code verification with Verifier↔Critic loop.

> **Elenchus** (ἔλεγχος): Socrates' method of refutation through questioning.

## Supported Clients

Works with any MCP-compatible client:

| Client | Status | Notes |
|--------|--------|-------|
| Claude Code (CLI) | ✅ Tested | Primary development target |
| Claude Desktop | ✅ Supported | Full functionality |
| VS Code (Copilot) | ✅ Supported | Requires v1.102+ |
| Cursor | ✅ Supported | 40 tool limit applies |
| Other MCP Clients | ✅ Compatible | Any stdio-based MCP client |

## Quick Start

```bash
# 1. Install and register globally (one command)
claude mcp add elenchus -s user -- npx -y @jhlee0409/elenchus-mcp

# 2. Restart Claude Code, then use
/elenchus:verify (MCP)

# Or natural language
"Please verify src/auth for security issues"
```

> **Note:** The `-s user` flag makes elenchus available in all your projects. Without it, installation only applies to the current directory.

## How It Works

**Natural language → Claude uses Elenchus tools automatically**

```
User: "Verify src/auth for security issues"
Claude: (calls elenchus_start_session, elenchus_submit_round, etc.)
```

No slash commands needed for basic usage.

## Installation

### Claude Code (CLI)

**Option 1: One command (Recommended)**

```bash
claude mcp add elenchus -s user -- npx -y @jhlee0409/elenchus-mcp
```

> **Note:** `-s user` makes it available in all projects. Without it, only current directory.

**Option 2: Global install (faster startup)**

```bash
npm install -g @jhlee0409/elenchus-mcp
claude mcp add elenchus -s user -- elenchus-mcp
```

**Verify:**
```bash
claude mcp list          # Check registered servers
claude mcp get elenchus  # Check status
```

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "elenchus": {
      "command": "npx",
      "args": ["-y", "@jhlee0409/elenchus-mcp"]
    }
  }
}
```

### VS Code (GitHub Copilot)

Add to `.vscode/mcp.json` (workspace) or User Settings (global):

```json
{
  "mcp": {
    "servers": {
      "elenchus": {
        "command": "npx",
        "args": ["-y", "@jhlee0409/elenchus-mcp"]
      }
    }
  }
}
```

> Requires VS Code 1.102+

### Cursor

Go to **Settings > MCP > Add new global MCP Server**, then add:

```json
{
  "mcpServers": {
    "elenchus": {
      "command": "npx",
      "args": ["-y", "@jhlee0409/elenchus-mcp"]
    }
  }
}
```

> Note: Cursor has a 40 tool limit across all MCP servers.

### From Source (Development)

```bash
git clone https://github.com/jhlee0409/claude-plugins.git
cd claude-plugins/mcp-servers/elenchus
npm install && npm run build

# Then add to your client with:
# command: "node", args: ["/path/to/dist/index.js"]
```

## MCP Prompts (Slash Commands)

For explicit workflow control, use MCP prompts:

| Command | Description |
|---------|-------------|
| `/mcp__elenchus__verify` | Run Verifier↔Critic loop |
| `/mcp__elenchus__consolidate` | Create prioritized fix plan |
| `/mcp__elenchus__apply` | Apply fixes with verification |
| `/mcp__elenchus__complete` | Full pipeline until zero issues |
| `/mcp__elenchus__cross-verify` | Adversarial cross-verification |

## Tools

### elenchus_start_session

Start a new verification session.

```typescript
{
  target: string,        // Target path to verify
  requirements: string,  // User requirements
  workingDir: string,    // Working directory
  maxRounds?: number     // Max rounds (default: 10)
}
```

### elenchus_get_context

Get current verification context.

```typescript
{
  sessionId: string
}
```

### elenchus_submit_round

Submit verification round results.

```typescript
{
  sessionId: string,
  role: 'verifier' | 'critic',
  output: string,           // Full agent output
  issuesRaised?: Issue[],   // New issues raised
  issuesResolved?: string[] // Resolved issue IDs
}
```

### elenchus_get_issues

Query session issues.

```typescript
{
  sessionId: string,
  status?: 'all' | 'unresolved' | 'critical'
}
```

### elenchus_checkpoint

Create a checkpoint.

```typescript
{
  sessionId: string
}
```

### elenchus_rollback

Rollback to previous checkpoint.

```typescript
{
  sessionId: string,
  toRound: number
}
```

### elenchus_end_session

End session and record final verdict.

```typescript
{
  sessionId: string,
  verdict: 'PASS' | 'FAIL' | 'CONDITIONAL'
}
```

### elenchus_ripple_effect

Analyze impact of code changes.

```typescript
{
  sessionId: string,
  changedFile: string,     // File that will be changed
  changedFunction?: string // Specific function (optional)
}
```

### elenchus_mediator_summary

Get mediator analysis summary.

```typescript
{
  sessionId: string
}
```

Returns: dependency graph stats, verification coverage, intervention history.

### elenchus_get_role_prompt

Get role-specific prompt and guidelines.

```typescript
{
  role: 'verifier' | 'critic'
}
```

Returns: mustDo/mustNotDo rules, output templates, checklists.

### elenchus_role_summary

Get role enforcement summary for session.

```typescript
{
  sessionId: string
}
```

Returns: compliance history, average scores, violations, expected next role.

### elenchus_update_role_config

Update role enforcement configuration.

```typescript
{
  sessionId: string,
  strictMode?: boolean,        // Reject non-compliant rounds
  minComplianceScore?: number, // Minimum score (0-100)
  requireAlternation?: boolean // Require verifier/critic alternation
}
```

## MCP Resources

Access session data via MCP resource URIs:

| URI | Description |
|-----|-------------|
| `elenchus://sessions/` | List all active sessions |
| `elenchus://sessions/{sessionId}` | Get specific session details |

**Usage in Claude:**
```
# List active sessions
Read elenchus://sessions/

# Get session details
Read elenchus://sessions/2024-01-15_src-auth_abc123
```

## Session Storage

Sessions are stored at `~/.claude/elenchus/sessions/`:

```
~/.claude/elenchus/sessions/
└── 2024-01-15_src-auth_abc123/
    └── session.json
```

### Design Decision: Global Storage

Sessions are **always stored globally** in the user's home directory.

**Reason:**
- MCP server is **stdio-based, stateless** architecture
- Each call runs as new process, must find previous session by `sessionId` only
- Global storage ensures **session ID self-sufficiency**

### Session Cleanup

Sessions are preserved as **verification audit records**. Manual cleanup:

```bash
# Delete all sessions
rm -rf ~/.claude/elenchus/sessions/*

# Delete specific sessions
rm -rf ~/.claude/elenchus/sessions/2024-01-15_*
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                       ELENCHUS MCP SERVER                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │
│  │   Tools     │  │   State     │  │  Resources  │  │  Prompts  │  │
│  ├─────────────┤  ├─────────────┤  ├─────────────┤  ├───────────┤  │
│  │ start       │  │ Session     │  │ Sessions    │  │ verify    │  │
│  │ get_context │─▶│ Context     │◀─│ (URI-based) │  │ consolidate│ │
│  │ submit_round│  │ Issues      │  │             │  │ apply     │  │
│  │ checkpoint  │  │ Checkpoints │  │             │  │ complete  │  │
│  │ rollback    │  │             │  │             │  │ cross-    │  │
│  │ end         │  │             │  │             │  │  verify   │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Features

### Layered Context

```
Layer 0 (Base): Collected at session start
  - Target files
  - Direct dependencies

Layer 1 (Discovered): Found during rounds
  - New files mentioned by agents
  - Auto-collected and added
```

### Automatic Arbiter Intervention

Server auto-detects and intervenes:
- `CONTEXT_EXPAND`: 3+ new files discovered
- `LOOP_BREAK`: Same issue repeatedly argued
- `SOFT_CORRECT`: Scope over-expansion

### Dependency Analysis (Mediator)

Server builds and analyzes dependency graph:

**Features:**
- Import/export relationship tracking
- Circular dependency detection
- File importance scoring (based on dependents count)
- Ripple effect analysis for code changes

**Use `elenchus_ripple_effect` to analyze:**
```typescript
// Example: What files are affected if I change auth.ts?
elenchus_ripple_effect({
  sessionId: "...",
  changedFile: "src/auth/auth.ts",
  changedFunction: "validateToken"  // optional
})
// Returns: List of affected files with dependency paths
```

### Convergence Detection

```typescript
isConverged =
  criticalUnresolved === 0 &&
  roundsWithoutNewIssues >= 2 &&
  currentRound >= 2
```

### Role Enforcement

Server enforces strict Verifier↔Critic alternation:

```
Round 1: Verifier (always starts)
Round 2: Critic
Round 3: Verifier
...
```

**Compliance validation:**
- Role alternation enforcement
- Required elements check (issue format, evidence)
- Compliance score calculation (100 base, -20 per error, -5 per warning)

**Role-specific rules:**

| Role | Must Do | Must Not Do |
|------|---------|-------------|
| Verifier | Evidence for all claims, file:line locations | Skip categories, vague "looks good" |
| Critic | Validate all issues, check coverage | Accept without evidence, add new issues |

Use `elenchus_get_role_prompt` to get detailed guidelines.

## Development

```bash
# Watch mode
npm run dev

# Inspector (MCP debugging)
npm run inspector
```

## License

MIT
