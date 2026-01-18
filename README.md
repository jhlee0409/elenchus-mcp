# Elenchus MCP Server

**English** | [한국어](./README.ko.md)

**Adversarial Code Verification System using Verifier↔Critic Debate Loop**

> **Elenchus** (ἔλεγχος): Socrates' method of refutation through systematic questioning - exposing contradictions to reach truth.

[![npm version](https://img.shields.io/npm/v/@jhlee0409/elenchus-mcp.svg)](https://www.npmjs.com/package/@jhlee0409/elenchus-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-≥18.0.0-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-purple.svg)](https://modelcontextprotocol.io/)

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Usage](#usage)
- [MCP Tools Reference](#mcp-tools-reference)
- [MCP Resources](#mcp-resources)
- [MCP Prompts](#mcp-prompts-slash-commands)
- [Verification Modes](#verification-modes)
- [Token Optimization](#token-optimization)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [License](#license)

---

## Overview

Elenchus is a **Model Context Protocol (MCP) server** that implements adversarial code verification. Unlike simple linting or static analysis, Elenchus orchestrates a **debate between Verifier and Critic agents** to systematically uncover issues through dialectical reasoning.

### Why Adversarial Verification?

| Traditional Approach | Elenchus Approach |
|---------------------|-------------------|
| Single-pass analysis | Multi-round debate |
| Checklist-based | Intent-based semantic analysis |
| Fixed rules | Adaptive convergence |
| Silent on clean code | Explicit negative assertions |

### The Verifier↔Critic Loop

```
┌──────────────────────────────────────────────────────────────┐
│                    VERIFICATION LOOP                          │
├──────────────────────────────────────────────────────────────┤
│  Round 1: Verifier → Examines code, RAISES issues            │
│  Round 2: Critic   → Challenges issues (VALID/INVALID/PARTIAL)│
│  Round 3: Verifier → Defends, resolves, or finds new issues  │
│  Round 4: Critic   → Re-evaluates, checks coverage           │
│  ...continues until convergence...                            │
│  Final: Verdict (PASS / FAIL / CONDITIONAL)                  │
└──────────────────────────────────────────────────────────────┘
```

---

## Key Features

### 🔄 Adversarial Debate System
- **Verifier**: Finds issues with evidence
- **Critic**: Challenges findings, validates claims
- **Role Enforcement**: Strict alternation with compliance scoring

### 📊 Intent-Based Convergence
- Semantic understanding instead of keyword matching
- 5 category coverage (Security, Correctness, Reliability, Maintainability, Performance)
- Edge case documentation requirements
- Negative assertions for clean code

### 🧠 LLM-Based Evaluation (Optional)
- **Convergence Assessment**: LLM judges verification quality (vs rigid boolean checks)
- **Severity Classification**: Context-aware impact analysis
- **Edge Case Validation**: Verifies actual analysis, not just keyword presence
- **False Positive Detection**: Evidence-based issue validation

### 🔍 Automatic Impact Analysis
- **Multi-language dependency graph** (15 languages via tree-sitter)
- Ripple effect prediction
- Cascade depth calculation
- Risk level assessment

### 🌐 Multi-Language Support

Dependency analysis powered by tree-sitter AST parsing:

| Category | Languages |
|----------|-----------|
| Web | TypeScript, TSX, JavaScript, CSS |
| Systems | Rust, Go, C, C++ |
| Enterprise | Java, C# |
| Scripting | Python, Ruby, PHP, Bash, PowerShell |

### 💾 Session Management
- Checkpoint/rollback support
- Global session storage
- Audit trail preservation

### ⚡ Token Optimization (Optional)
- Differential analysis (verify only changed code)
- Response caching
- Selective chunking
- Tiered verification pipeline

---

## Quick Start

Add to your MCP client configuration:

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

Then use naturally with your AI assistant:
```
"Please verify src/auth for security issues"
```

> See [Installation](#installation) for client-specific setup instructions.

---

## Installation

### Supported Clients

| Client | Status | Notes |
|--------|--------|-------|
| Claude Desktop | ✅ Supported | macOS, Windows |
| Claude Code | ✅ Supported | CLI tool |
| VS Code (Copilot) | ✅ Supported | Requires v1.102+ |
| Cursor | ✅ Supported | 40 tool limit applies |
| Other MCP Clients | ✅ Compatible | Any stdio-based client |

### Claude Desktop

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

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

### Claude Code

Add to your Claude Code settings (`.mcp.json` or `~/.claude/settings.json`):

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

Add to `.vscode/mcp.json`:

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

### Cursor

Go to **Settings > MCP > Add new global MCP Server**:

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

---

## Usage

Simply describe what you want to verify:

```
"Verify src/auth for security vulnerabilities"
"Check the payment module for edge cases"
"Review src/api for correctness and reliability issues"
```

Your AI assistant will automatically use Elenchus tools.

> For structured workflows, see [MCP Prompts](#mcp-prompts-slash-commands).

---

## MCP Tools Reference

### Session Lifecycle

#### `elenchus_start_session`

Initialize a new verification session.

**Inputs:**
- `target` (string, required): Target path to verify (file or directory)
- `requirements` (string, required): Verification requirements/focus areas
- `workingDir` (string, required): Working directory for relative paths
- `maxRounds` (number, optional): Maximum rounds before stopping (default: 10)
- `verificationMode` (object, optional): Mode configuration
  - `mode`: `"standard"` | `"fast-track"` | `"single-pass"`
  - `skipCriticForCleanCode`: boolean
- `differentialConfig` (object, optional): Verify only changed files
- `cacheConfig` (object, optional): Cache previous verifications
- `chunkingConfig` (object, optional): Split large files into chunks
- `pipelineConfig` (object, optional): Tiered verification
- `llmEvalConfig` (object, optional): LLM-based evaluation settings
  - `enabled`: boolean - Enable LLM evaluation
  - `convergenceEval`: boolean - Use LLM for convergence quality
  - `severityEval`: boolean - Use LLM for severity classification
  - `edgeCaseEval`: boolean - Use LLM for edge case validation
  - `falsePositiveEval`: boolean - Use LLM for false positive detection

**Returns:** Session ID and initial context including files collected, dependency graph stats, and role configuration.

**Example:**
```typescript
elenchus_start_session({
  target: "src/auth",
  requirements: "Security audit for authentication",
  workingDir: "/path/to/project",
  verificationMode: { mode: "fast-track" }
})
```

#### `elenchus_get_context`

Get current session context including files, issues, and proactive guidance.

**Inputs:**
- `sessionId` (string, required): The session ID

**Returns:** Files, issues summary, focus areas, unreviewed files, recommendations.

#### `elenchus_submit_round`

Submit a Verifier or Critic round.

**Inputs:**
- `sessionId` (string, required): The session ID
- `role` (`"verifier"` | `"critic"`, required): Role for this round
- `output` (string, required): Full agent analysis output
- `issuesRaised` (Issue[], optional): New issues (Verifier role)
- `issuesResolved` (string[], optional): Resolved issue IDs (Critic role)

**Issue Schema:**
```typescript
{
  id: string,
  category: "SECURITY" | "CORRECTNESS" | "RELIABILITY" | "MAINTAINABILITY" | "PERFORMANCE",
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  summary: string,
  location: string,        // "file:line" format
  description: string,
  evidence: string         // Code snippet or proof
}
```

**Returns:** Round number, convergence status, mediator interventions, role compliance score.

#### `elenchus_end_session`

End session with final verdict.

**Inputs:**
- `sessionId` (string, required): The session ID
- `verdict` (`"PASS"` | `"FAIL"` | `"CONDITIONAL"`, required): Final verdict

**Returns:** Session summary including total rounds, issues by category and severity.

#### `elenchus_get_issues`

Query issues with optional filtering.

**Inputs:**
- `sessionId` (string, required): The session ID
- `status` (`"all"` | `"unresolved"` | `"critical"`, optional): Filter by status

**Returns:** Array of issues matching the filter.

### LLM Evaluation

#### `elenchus_evaluate_convergence`

Get LLM evaluation prompt for convergence quality assessment.

**Inputs:**
- `sessionId` (string, required): Session ID to evaluate

**Returns:** System prompt and user prompt to send to an LLM for quality assessment.

#### `elenchus_evaluate_severity`

Get LLM evaluation prompt for issue severity assessment.

**Inputs:**
- `sessionId` (string, required): Session ID
- `issueId` (string, required): Issue ID to evaluate
- `codeContext` (string, optional): Additional code context

**Returns:** Prompt for LLM to assess if severity is accurate.

#### `elenchus_evaluate_edge_cases`

Get LLM evaluation prompt for edge case coverage.

**Inputs:**
- `sessionId` (string, required): Session ID to evaluate

**Returns:** Prompt for LLM to assess edge case analysis quality.

#### `elenchus_submit_llm_evaluation`

Submit LLM evaluation response to store results.

**Inputs:**
- `sessionId` (string, required): Session ID
- `evaluationType` (`"convergence"` | `"severity"` | `"edgeCases"` | `"falsePositive"`): Type of evaluation
- `llmResponse` (string, required): LLM response to the evaluation prompt
- `targetId` (string, optional): Target ID for severity/falsePositive evaluations

**Returns:** Parsed evaluation result and storage confirmation.

### State Management

#### `elenchus_checkpoint`

Create a checkpoint for potential rollback.

**Inputs:**
- `sessionId` (string, required): The session ID

**Returns:** Success status and round number.

#### `elenchus_rollback`

Rollback to a previous checkpoint.

**Inputs:**
- `sessionId` (string, required): The session ID
- `toRound` (number, required): Round number to rollback to

**Returns:** Success status and restored round number.

### Analysis Tools

#### `elenchus_ripple_effect`

Analyze impact of changing a file.

**Inputs:**
- `sessionId` (string, required): The session ID
- `changedFile` (string, required): File that will be changed
- `changedFunction` (string, optional): Specific function within the file

**Returns:** Affected files, dependency paths, cascade depth, and recommendations.

**Example:**
```typescript
elenchus_ripple_effect({
  sessionId: "...",
  changedFile: "src/auth/login.ts",
  changedFunction: "validateToken"
})
// Returns: { affectedFiles: [...], cascadeDepth: 2, totalAffected: 8 }
```

#### `elenchus_mediator_summary`

Get mediator analysis summary.

**Inputs:**
- `sessionId` (string, required): The session ID

**Returns:** Dependency graph stats, coverage metrics, intervention history.

### Role Enforcement

#### `elenchus_get_role_prompt`

Get role-specific guidelines.

**Inputs:**
- `role` (`"verifier"` | `"critic"`, required): Role to get prompt for

**Returns:** System prompt, output template, checklist, mustDo/mustNotDo rules, focus areas.

#### `elenchus_role_summary`

Get role compliance summary for a session.

**Inputs:**
- `sessionId` (string, required): The session ID

**Returns:** Compliance history, average scores, violations, current expected role.

#### `elenchus_update_role_config`

Update role enforcement settings.

**Inputs:**
- `sessionId` (string, required): The session ID
- `strictMode` (boolean, optional): Reject non-compliant rounds
- `minComplianceScore` (number, optional): Minimum score (0-100)
- `requireAlternation` (boolean, optional): Require role alternation

**Returns:** Updated configuration.

### Re-verification

#### `elenchus_start_reverification`

Start re-verification of resolved issues from a previous session.

**Inputs:**
- `previousSessionId` (string, required): Original session ID
- `workingDir` (string, required): Working directory
- `targetIssueIds` (string[], optional): Specific issues to re-verify
- `maxRounds` (number, optional): Maximum rounds (default: 6)

**Returns:** New session ID with focused context on target issues.

---

## MCP Resources

Access session data via URI-based resources:

| URI Pattern | Description |
|-------------|-------------|
| `elenchus://sessions/` | List all active sessions |
| `elenchus://sessions/{sessionId}` | Get specific session details |

**Usage:**
```
Read elenchus://sessions/
Read elenchus://sessions/2026-01-17_src-auth_abc123
```

---

## MCP Prompts (Slash Commands)

| Prompt Name | Description |
|-------------|-------------|
| `verify` | Run complete Verifier↔Critic loop |
| `consolidate` | Create prioritized fix plan |
| `apply` | Apply fixes with verification |
| `complete` | Full pipeline until zero issues |
| `cross-verify` | Adversarial cross-verification |

> Invocation format varies by client. Check your MCP client's documentation.

---

## Verification Modes

Three modes for different use cases:

| Mode | Min Rounds | Critic Required | Best For |
|------|------------|-----------------|----------|
| `standard` | 3 | Yes | Thorough verification |
| `fast-track` | 1 | Optional | Quick validation |
| `single-pass` | 1 | No | Fastest, Verifier-only |

**Example:**
```typescript
elenchus_start_session({
  target: "src/",
  requirements: "Security audit",
  workingDir: "/project",
  verificationMode: {
    mode: "fast-track",
    skipCriticForCleanCode: true
  }
})
```

---

<details>
<summary><strong>Issue Lifecycle</strong></summary>

Issues transition through states:

```
RAISED → CHALLENGED → RESOLVED
           ↓
        DISMISSED (false positive)
           ↓
        MERGED (combined)
           ↓
        SPLIT (divided)
```

#### Issue States

| Status | Description |
|--------|-------------|
| `RAISED` | Initially discovered by Verifier |
| `CHALLENGED` | Under debate between Verifier and Critic |
| `RESOLVED` | Fixed and verified |
| `DISMISSED` | Invalidated as false positive |
| `MERGED` | Combined with another issue |
| `SPLIT` | Divided into multiple issues |

#### Critic Verdicts

| Verdict | Meaning |
|---------|---------|
| `VALID` | Issue is legitimate |
| `INVALID` | False positive |
| `PARTIAL` | Partially valid, needs refinement |

</details>

<details>
<summary><strong>Convergence Detection</strong></summary>

A session converges when ALL criteria are met:

- No CRITICAL or HIGH severity unresolved issues
- Stable for 2+ rounds (no new issues)
- Minimum rounds completed (varies by mode)
- All 5 categories examined
- No recent issue state transitions
- Edge cases documented
- Clean areas explicitly stated (negative assertions)
- High-risk impacted files reviewed

#### Category Coverage

All 5 categories must be examined:

1. **SECURITY** - Authentication, authorization, injection
2. **CORRECTNESS** - Logic errors, type mismatches
3. **RELIABILITY** - Error handling, resource management
4. **MAINTAINABILITY** - Code structure, documentation
5. **PERFORMANCE** - Efficiency, resource usage

</details>

---

## Token Optimization

<details>
<summary><strong>Differential Analysis</strong></summary>

Verify only changed files:

```typescript
{
  differentialConfig: {
    enabled: true,
    baseRef: "main"  // Compare against main branch
  }
}
```

</details>

<details>
<summary><strong>Response Caching</strong></summary>

Cache previous verification results:

```typescript
{
  cacheConfig: {
    enabled: true,
    ttlSeconds: 3600  // Cache for 1 hour
  }
}
```

</details>

<details>
<summary><strong>Selective Chunking</strong></summary>

Split large files into focused chunks:

```typescript
{
  chunkingConfig: {
    enabled: true,
    maxChunkSize: 500  // Lines per chunk
  }
}
```

</details>

<details>
<summary><strong>Tiered Pipeline</strong></summary>

Start with quick analysis, escalate if needed:

```typescript
{
  pipelineConfig: {
    enabled: true,
    startTier: "quick"  // quick → standard → deep
  }
}
```

</details>

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ELENCHUS_DATA_DIR` | Custom storage directory | `~/.elenchus` |
| `XDG_DATA_HOME` | XDG base directory (Linux/macOS) | - |
| `LOCALAPPDATA` | Windows AppData location | - |

### Storage Location

Sessions and data are stored in a client-agnostic location:

```
~/.elenchus/
├── sessions/          # Verification sessions
├── baselines/         # Differential analysis baselines
├── cache/             # Response cache
└── safeguards/        # Quality safeguards data
```

**Priority Order:**
1. `$ELENCHUS_DATA_DIR` - Explicit override
2. `$XDG_DATA_HOME/elenchus` - XDG spec
3. `%LOCALAPPDATA%\elenchus` - Windows
4. `~/.elenchus` - Default fallback

### Custom Storage

```bash
# Set custom location
export ELENCHUS_DATA_DIR=/path/to/custom/storage

# Or use XDG spec
export XDG_DATA_HOME=~/.local/share
```

### Session Cleanup

Sessions are preserved as audit records. Manual cleanup:

```bash
rm -rf ~/.elenchus/sessions/*
# Or for specific sessions
rm -rf ~/.elenchus/sessions/2026-01-17_*
```

---

## Architecture

<details>
<summary><strong>System Diagram</strong></summary>

```
┌─────────────────────────────────────────────────────────────────────┐
│                       ELENCHUS MCP SERVER                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     MCP PROTOCOL LAYER                        │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │  │
│  │  │  Tools   │  │Resources │  │ Prompts  │  │ Notifications│ │  │
│  │  │  (18)    │  │  (URI)   │  │   (6)    │  │  (optional)  │ │  │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────────────┘ │  │
│  └───────┼─────────────┼─────────────┼──────────────────────────┘  │
│          │             │             │                              │
│  ┌───────┴─────────────┴─────────────┴──────────────────────────┐  │
│  │                       CORE MODULES                            │  │
│  │  Session Manager │ Context Manager │ Mediator System          │  │
│  │  Role Enforcement │ Issue Lifecycle │ Pipeline (Tiered)       │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│                              ▼                                       │
│                    ┌──────────────────┐                             │
│                    │     STORAGE      │                             │
│                    │ ~/.elenchus/     │                             │
│                    └──────────────────┘                             │
└─────────────────────────────────────────────────────────────────────┘
```

</details>

### Module Responsibilities

| Module | Purpose |
|--------|---------|
| **Session Manager** | Create, persist, and manage verification sessions |
| **Context Manager** | Collect and organize target files and dependencies |
| **Mediator System** | Multi-language dependency graphs (tree-sitter), issue detection, interventions |
| **Role Enforcement** | Ensure Verifier↔Critic alternation, validate compliance |
| **Issue Lifecycle** | Track issue states from RAISED to RESOLVED |
| **Pipeline** | Tiered verification (quick → standard → deep) |

---

## Security

### Security Model

Elenchus operates with the following security considerations:

- **No Code Execution**: Elenchus does NOT execute the code it verifies. It performs static analysis only.
- **Local Storage**: All session data is stored locally in `~/.elenchus/`. No data is sent to external servers.
- **Path Validation**: All file paths are validated to prevent path traversal attacks.
- **No Secrets in Output**: Tool outputs are sanitized to avoid exposing sensitive data.

### Permissions

Elenchus requires:
- **Read access** to target files for verification
- **Write access** to `~/.elenchus/` for session storage

### Reporting Security Issues

Please report security vulnerabilities via [GitHub Security Advisories](https://github.com/jhlee0409/elenchus-mcp/security/advisories).

---

## Troubleshooting

### Common Issues

<details>
<summary><strong>Server not found / Tools not available</strong></summary>

**Symptom:** Your MCP client doesn't recognize Elenchus commands or tools.

**Solutions:**
1. Verify installation in your client's MCP settings
2. Restart your MCP client after adding the server
3. Check config syntax (JSON must be valid)
4. Ensure Node.js ≥18 is installed:
   ```bash
   node --version
   ```

</details>

<details>
<summary><strong>Session not found</strong></summary>

**Symptom:** Error "Session not found: xxx"

**Solutions:**
1. List active sessions:
   ```
   Read elenchus://sessions/
   ```
2. Sessions may have been cleaned up - start a new session
3. Verify session ID is correct (check for typos)

</details>

<details>
<summary><strong>Permission denied errors</strong></summary>

**Symptom:** Cannot read files or write sessions.

**Solutions:**
1. Check file permissions on target directory
2. Verify write access to `~/.elenchus/`:
   ```bash
   ls -la ~/.elenchus/
   ```
3. Try custom storage location:
   ```bash
   export ELENCHUS_DATA_DIR=/tmp/elenchus
   ```

</details>

<details>
<summary><strong>Role compliance rejection</strong></summary>

**Symptom:** Round rejected due to compliance score.

**Solutions:**
1. Check current role requirements:
   ```typescript
   elenchus_get_role_prompt({ role: "verifier" })
   ```
2. Lower minimum compliance score:
   ```typescript
   elenchus_update_role_config({
     sessionId: "...",
     minComplianceScore: 50,
     strictMode: false
   })
   ```
3. Ensure role alternation (Verifier → Critic → Verifier)

</details>

### Debugging

Use MCP Inspector for debugging:

```bash
npm run inspector
# or
npx @modelcontextprotocol/inspector node dist/index.js
```

### Getting Help

- **Issues**: [GitHub Issues](https://github.com/jhlee0409/elenchus-mcp/issues)
- **Discussions**: [GitHub Discussions](https://github.com/jhlee0409/elenchus-mcp/discussions)

---

## Development

### Build Commands

```bash
npm run build      # Compile TypeScript to dist/
npm run dev        # Watch mode with auto-rebuild
npm run start      # Run the compiled server
npm run inspector  # Launch MCP Inspector for debugging
```

### Project Structure

```
elenchus-mcp/
├── src/
│   ├── index.ts           # Entry point, MCP server setup
│   ├── tools/             # Tool definitions and handlers
│   ├── resources/         # Resource definitions
│   ├── prompts/           # Prompt templates
│   ├── types/             # TypeScript interfaces
│   ├── state/             # Session and context management
│   ├── mediator/          # Multi-language dependency analysis (tree-sitter)
│   ├── roles/             # Role enforcement
│   ├── config/            # Configuration constants
│   ├── cache/             # Response caching
│   ├── chunking/          # Code chunking
│   ├── diff/              # Differential analysis
│   ├── pipeline/          # Tiered verification
│   └── safeguards/        # Quality safeguards
├── dist/                  # Compiled output
├── package.json
├── tsconfig.json
└── README.md
```

### Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Submit a pull request

---

## License

MIT
