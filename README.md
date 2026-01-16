# Elenchus MCP Server

**English** | [한국어](./README.ko.md)

**Adversarial Code Verification System using Verifier↔Critic Debate Loop**

> **Elenchus** (ἔλεγχος): Socrates' method of refutation through systematic questioning - exposing contradictions to reach truth.

[![npm version](https://badge.fury.io/js/%40jhlee0409%2Felenchus-mcp.svg)](https://www.npmjs.com/package/@jhlee0409/elenchus-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Usage](#usage)
- [MCP Tools Reference](#mcp-tools-reference)
- [MCP Resources](#mcp-resources)
- [MCP Prompts](#mcp-prompts-slash-commands)
- [Verification Modes](#verification-modes)
- [Issue Lifecycle](#issue-lifecycle)
- [Convergence Detection](#convergence-detection)
- [Token Optimization](#token-optimization)
- [Building Your Own MCP Server](#building-your-own-mcp-server)
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

### 🔍 Automatic Impact Analysis
- Dependency graph construction
- Ripple effect prediction
- Cascade depth calculation
- Risk level assessment

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

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                       ELENCHUS MCP SERVER                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     MCP PROTOCOL LAYER                        │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │  │
│  │  │  Tools   │  │Resources │  │ Prompts  │  │ Notifications│ │  │
│  │  │  (18)    │  │  (URI)   │  │   (5)    │  │  (optional)  │ │  │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────────────┘ │  │
│  └───────┼─────────────┼─────────────┼──────────────────────────┘  │
│          │             │             │                              │
│  ┌───────┴─────────────┴─────────────┴──────────────────────────┐  │
│  │                       CORE MODULES                            │  │
│  │                                                               │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │  │
│  │  │   Session   │  │   Context   │  │  Mediator   │          │  │
│  │  │   Manager   │  │   Manager   │  │   System    │          │  │
│  │  │             │  │             │  │             │          │  │
│  │  │ • Create    │  │ • Layer 0/1 │  │ • Dep Graph │          │  │
│  │  │ • Persist   │  │ • Pre-scan  │  │ • Ripple    │          │  │
│  │  │ • Converge  │  │ • Chunking  │  │ • Intervene │          │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘          │  │
│  │                                                               │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │  │
│  │  │    Role     │  │   Issue     │  │  Pipeline   │          │  │
│  │  │ Enforcement │  │  Lifecycle  │  │   (Tiered)  │          │  │
│  │  │             │  │             │  │             │          │  │
│  │  │ • Verifier  │  │ • Raised    │  │ • Quick     │          │  │
│  │  │ • Critic    │  │ • Challenged│  │ • Standard  │          │  │
│  │  │ • Validate  │  │ • Resolved  │  │ • Deep      │          │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘          │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│                              ▼                                       │
│                    ┌──────────────────┐                             │
│                    │     STORAGE      │                             │
│                    │ ~/.claude/       │                             │
│                    │   elenchus/      │                             │
│                    │     sessions/    │                             │
│                    └──────────────────┘                             │
└─────────────────────────────────────────────────────────────────────┘
```

### Module Responsibilities

| Module | Purpose |
|--------|---------|
| **Session Manager** | Create, persist, and manage verification sessions |
| **Context Manager** | Collect and organize target files and dependencies |
| **Mediator System** | Build dependency graphs, detect issues, trigger interventions |
| **Role Enforcement** | Ensure Verifier↔Critic alternation, validate compliance |
| **Issue Lifecycle** | Track issue states from RAISED to RESOLVED |
| **Pipeline** | Tiered verification (quick → standard → deep) |

---

## Quick Start

```bash
# 1. Install globally with one command
claude mcp add elenchus -s user -- npx -y @jhlee0409/elenchus-mcp

# 2. Restart Claude Code, then use naturally
"Please verify src/auth for security issues"

# Or use the MCP prompt
/mcp__elenchus__verify
```

> **Note:** The `-s user` flag makes Elenchus available across all projects.

---

## Installation

### Supported Clients

| Client | Status | Notes |
|--------|--------|-------|
| Claude Code (CLI) | ✅ Primary | Full functionality |
| Claude Desktop | ✅ Supported | Full functionality |
| VS Code (Copilot) | ✅ Supported | Requires v1.102+ |
| Cursor | ✅ Supported | 40 tool limit applies |
| Other MCP Clients | ✅ Compatible | Any stdio-based client |

### Claude Code (CLI)

**Option 1: npx (Recommended)**
```bash
claude mcp add elenchus -s user -- npx -y @jhlee0409/elenchus-mcp
```

**Option 2: Global install (faster startup)**
```bash
npm install -g @jhlee0409/elenchus-mcp
claude mcp add elenchus -s user -- elenchus-mcp
```

**Verify installation:**
```bash
claude mcp list          # List registered servers
claude mcp get elenchus  # Check server status
```

### Claude Desktop

Edit config file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

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

### From Source

```bash
git clone https://github.com/jhlee0409/elenchus-mcp.git
cd elenchus-mcp
npm install && npm run build

# Add to client with:
# command: "node", args: ["/path/to/dist/index.js"]
```

---

## Usage

### Natural Language (Recommended)

Simply describe what you want to verify:

```
"Verify src/auth for security vulnerabilities"
"Check the payment module for edge cases"
"Review src/api for correctness and reliability issues"
```

Claude will automatically use Elenchus tools.

### Explicit Tool Usage

For fine-grained control, use tools directly:

```typescript
// Start a session
elenchus_start_session({
  target: "src/auth",
  requirements: "Security audit focusing on authentication",
  workingDir: "/path/to/project"
})

// Submit Verifier round
elenchus_submit_round({
  sessionId: "...",
  role: "verifier",
  output: "Full analysis...",
  issuesRaised: [...]
})

// Submit Critic round
elenchus_submit_round({
  sessionId: "...",
  role: "critic",
  output: "Challenge results...",
  issuesResolved: [...]
})

// End session
elenchus_end_session({
  sessionId: "...",
  verdict: "PASS"
})
```

---

## MCP Tools Reference

### Session Lifecycle

#### `elenchus_start_session`

Initialize a new verification session.

```typescript
{
  target: string,           // Target path to verify (file or directory)
  requirements: string,     // Verification requirements/focus areas
  workingDir: string,       // Working directory for relative paths
  maxRounds?: number,       // Maximum rounds (default: 10)
  verificationMode?: {
    mode: "standard" | "fast-track" | "single-pass",
    skipCriticForCleanCode?: boolean
  },
  differentialConfig?: {    // Verify only changed files
    enabled: boolean,
    baseRef?: string        // Git ref to compare against
  },
  cacheConfig?: {           // Cache previous verifications
    enabled: boolean,
    ttlSeconds?: number
  },
  chunkingConfig?: {        // Split large files into chunks
    enabled: boolean,
    maxChunkSize?: number
  },
  pipelineConfig?: {        // Tiered verification
    enabled: boolean,
    startTier?: "quick" | "standard" | "deep"
  }
}
```

**Returns:** Session ID and initial context.

#### `elenchus_get_context`

Get current session context including files, issues, and proactive guidance.

```typescript
{
  sessionId: string
}
```

**Returns:** Files, issues summary, focus areas, unreviewed files, recommendations.

#### `elenchus_submit_round`

Submit a Verifier or Critic round.

```typescript
{
  sessionId: string,
  role: "verifier" | "critic",
  output: string,                    // Full agent output
  issuesRaised?: Issue[],            // New issues (Verifier)
  issuesResolved?: string[]          // Resolved issue IDs (Critic)
}
```

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

#### `elenchus_end_session`

End session with final verdict.

```typescript
{
  sessionId: string,
  verdict: "PASS" | "FAIL" | "CONDITIONAL"
}
```

#### `elenchus_get_issues`

Query issues with optional filtering.

```typescript
{
  sessionId: string,
  status?: "all" | "unresolved" | "critical"
}
```

### State Management

#### `elenchus_checkpoint`

Create a checkpoint for rollback.

```typescript
{
  sessionId: string
}
```

#### `elenchus_rollback`

Rollback to a previous checkpoint.

```typescript
{
  sessionId: string,
  toRound: number          // Round number to rollback to
}
```

### Analysis Tools

#### `elenchus_ripple_effect`

Analyze impact of changing a file.

```typescript
{
  sessionId: string,
  changedFile: string,       // File that will be changed
  changedFunction?: string   // Specific function (optional)
}
```

**Returns:** Affected files, dependency paths, cascade depth.

#### `elenchus_mediator_summary`

Get mediator analysis summary.

```typescript
{
  sessionId: string
}
```

**Returns:** Dependency graph stats, coverage, intervention history.

### Role Enforcement

#### `elenchus_get_role_prompt`

Get role-specific guidelines.

```typescript
{
  role: "verifier" | "critic"
}
```

**Returns:** MustDo/MustNotDo rules, templates, checklists.

#### `elenchus_role_summary`

Get role compliance summary.

```typescript
{
  sessionId: string
}
```

**Returns:** Compliance history, scores, violations.

#### `elenchus_update_role_config`

Update role enforcement settings.

```typescript
{
  sessionId: string,
  strictMode?: boolean,           // Reject non-compliant rounds
  minComplianceScore?: number,    // Minimum score (0-100)
  requireAlternation?: boolean    // Require role alternation
}
```

### Re-verification

#### `elenchus_start_reverification`

Start re-verification of resolved issues.

```typescript
{
  previousSessionId: string,      // Original session ID
  workingDir: string,
  targetIssueIds?: string[],      // Specific issues (optional)
  maxRounds?: number
}
```

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
Read elenchus://sessions/2024-01-15_src-auth_abc123
```

---

## MCP Prompts (Slash Commands)

| Command | Description |
|---------|-------------|
| `/mcp__elenchus__verify` | Run complete Verifier↔Critic loop |
| `/mcp__elenchus__consolidate` | Create prioritized fix plan |
| `/mcp__elenchus__apply` | Apply fixes with verification |
| `/mcp__elenchus__complete` | Full pipeline until zero issues |
| `/mcp__elenchus__cross-verify` | Adversarial cross-verification |

---

## Verification Modes

Three modes for different use cases:

| Mode | Min Rounds | Critic Required | Best For |
|------|------------|-----------------|----------|
| `standard` | 3 | Yes | Thorough verification |
| `fast-track` | 1 | Optional | Quick validation |
| `single-pass` | 1 | No | Fastest, Verifier-only |

**Usage:**
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

## Issue Lifecycle

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

### Issue States

| Status | Description |
|--------|-------------|
| `RAISED` | Initially discovered by Verifier |
| `CHALLENGED` | Under debate between Verifier and Critic |
| `RESOLVED` | Fixed and verified |
| `DISMISSED` | Invalidated as false positive |
| `MERGED` | Combined with another issue |
| `SPLIT` | Divided into multiple issues |

### Critic Verdicts

| Verdict | Meaning |
|---------|---------|
| `VALID` | Issue is legitimate |
| `INVALID` | False positive |
| `PARTIAL` | Partially valid, needs refinement |

---

## Convergence Detection

A session converges when ALL criteria are met:

```typescript
isConverged =
  criticalUnresolved === 0 &&        // No critical issues
  highUnresolved === 0 &&            // No high-severity issues
  roundsWithoutNewIssues >= 2 &&     // Stable for 2 rounds
  currentRound >= minRounds &&       // Minimum rounds completed
  allCategoriesExamined &&           // All 5 categories checked
  issuesStabilized &&                // No recent transitions
  hasEdgeCaseCoverage &&             // Edge cases documented
  hasNegativeAssertions &&           // Clean areas stated
  hasHighRiskCoverage                // Impact files reviewed
```

### Category Coverage

All 5 categories must be examined:

1. **SECURITY** - Authentication, authorization, injection
2. **CORRECTNESS** - Logic errors, type mismatches
3. **RELIABILITY** - Error handling, resource management
4. **MAINTAINABILITY** - Code structure, documentation
5. **PERFORMANCE** - Efficiency, resource usage

### Edge Case Categories

Based on OWASP Testing Guide, Netflix Chaos Engineering, Google DiRT:

| # | Category | Example Checks |
|---|----------|----------------|
| 1 | Code-level | Null inputs, boundary values |
| 2 | User Behavior | Double-clicks, concurrent sessions |
| 3 | External Dependencies | Service failures, timeouts |
| 4 | Business Logic | Permission changes, state conflicts |
| 5 | Data State | Legacy data, corruption |
| 6 | Environment | Config drift, resource limits |
| 7 | Scale | Traffic spikes, massive data |
| 8 | Security | Validation bypass, session attacks |
| 9 | Side Effects | Mid-operation changes, partial failures |

---

## Token Optimization

### Differential Analysis

Verify only changed files:

```typescript
{
  differentialConfig: {
    enabled: true,
    baseRef: "main"  // Compare against main branch
  }
}
```

### Response Caching

Cache previous verification results:

```typescript
{
  cacheConfig: {
    enabled: true,
    ttlSeconds: 3600  // Cache for 1 hour
  }
}
```

### Selective Chunking

Split large files into focused chunks:

```typescript
{
  chunkingConfig: {
    enabled: true,
    maxChunkSize: 500  // Lines per chunk
  }
}
```

### Tiered Pipeline

Start with quick analysis, escalate if needed:

```typescript
{
  pipelineConfig: {
    enabled: true,
    startTier: "quick"  // quick → standard → deep
  }
}
```

---

## Building Your Own MCP Server

This section explains how Elenchus is built and how you can create similar MCP servers.

### MCP Protocol Overview

The Model Context Protocol (MCP) is Anthropic's standard for AI tool integration:

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────┤
│  Host (Claude)  ←──JSON-RPC 2.0──→  MCP Server (Elenchus)  │
│                                                              │
│  Features:                                                   │
│  • Tools: Functions the LLM can call                        │
│  • Resources: Data accessible via URI                       │
│  • Prompts: Reusable prompt templates                       │
└─────────────────────────────────────────────────────────────┘
```

### Project Structure

Recommended MCP server structure:

```
my-mcp-server/
├── src/
│   ├── index.ts           # Entry point, MCP server setup
│   ├── tools/
│   │   └── index.ts       # Tool definitions and handlers
│   ├── resources/
│   │   └── index.ts       # Resource definitions
│   ├── prompts/
│   │   └── index.ts       # Prompt templates
│   ├── types/
│   │   └── index.ts       # TypeScript interfaces
│   └── state/
│       └── index.ts       # State management
├── package.json
├── tsconfig.json
└── README.md
```

### Server Initialization

```typescript
// src/index.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

// 1. Create server with capabilities
const server = new Server(
  {
    name: "my-mcp-server",
    version: "1.0.0"
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {}
    }
  }
);

// 2. Register request handlers
server.setRequestHandler(ListToolsRequestSchema, handleListTools);
server.setRequestHandler(CallToolRequestSchema, handleCallTool);
server.setRequestHandler(ListResourcesRequestSchema, handleListResources);
server.setRequestHandler(ReadResourceRequestSchema, handleReadResource);
server.setRequestHandler(ListPromptsRequestSchema, handleListPrompts);
server.setRequestHandler(GetPromptRequestSchema, handleGetPrompt);

// 3. Connect transport
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Tool Definition with Zod

```typescript
// src/tools/index.ts
import { z } from "zod";

// Define schema with Zod
const MyToolSchema = z.object({
  input: z.string().describe("The input to process"),
  options: z.object({
    format: z.enum(["json", "text"]).default("text"),
    validate: z.boolean().optional()
  }).optional()
});

// Define tool
const tools = {
  my_tool: {
    description: "Process input with optional formatting",
    schema: MyToolSchema,
    handler: async (args: z.infer<typeof MyToolSchema>) => {
      // Implementation
      const result = await processInput(args.input, args.options);
      return { success: true, result };
    }
  }
};

// Handler for ListTools
export async function handleListTools() {
  return {
    tools: Object.entries(tools).map(([name, tool]) => ({
      name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.schema)
    }))
  };
}

// Handler for CallTool
export async function handleCallTool(request: CallToolRequest) {
  const { name, arguments: args } = request.params;
  const tool = tools[name];

  // Validate with Zod
  const parsed = tool.schema.parse(args);
  const result = await tool.handler(parsed);

  return {
    content: [{
      type: "text",
      text: JSON.stringify(result, null, 2)
    }]
  };
}
```

### Resource Definition

```typescript
// src/resources/index.ts
export async function handleListResources() {
  const sessions = await listSessions();

  return {
    resources: sessions.map(session => ({
      uri: `myserver://sessions/${session.id}`,
      name: `Session: ${session.id}`,
      description: session.description,
      mimeType: "application/json"
    }))
  };
}

export async function handleReadResource(request: ReadResourceRequest) {
  const { uri } = request.params;
  const sessionId = uri.split("/").pop();
  const session = await getSession(sessionId);

  return {
    contents: [{
      uri,
      mimeType: "application/json",
      text: JSON.stringify(session, null, 2)
    }]
  };
}
```

### Prompt Definition

```typescript
// src/prompts/index.ts
const prompts = {
  verify: {
    name: "verify",
    description: "Run verification workflow",
    arguments: [
      {
        name: "target",
        description: "Target to verify",
        required: true
      }
    ]
  }
};

export async function handleListPrompts() {
  return {
    prompts: Object.values(prompts)
  };
}

export async function handleGetPrompt(request: GetPromptRequest) {
  const { name, arguments: args } = request.params;

  return {
    description: prompts[name].description,
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: generatePromptText(name, args)
      }
    }]
  };
}
```

### Best Practices

#### 1. Input Validation

Always validate inputs with Zod:

```typescript
const schema = z.object({
  path: z.string()
    .regex(/^[a-zA-Z0-9_\-./]+$/, "Invalid path characters")
    .describe("File path to process"),
  options: z.object({
    strict: z.boolean().default(false)
  }).optional()
});
```

#### 2. Error Handling

Return structured errors:

```typescript
try {
  const result = await processRequest(args);
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
} catch (error) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ error: error.message })
    }],
    isError: true
  };
}
```

#### 3. State Persistence

Use file-based storage for stateless stdio transport:

```typescript
const STORAGE_PATH = path.join(os.homedir(), ".myserver", "data");

async function saveState(id: string, state: State) {
  const filePath = path.join(STORAGE_PATH, `${id}.json`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(state, null, 2));
}

async function loadState(id: string): Promise<State | null> {
  const filePath = path.join(STORAGE_PATH, `${id}.json`);
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}
```

#### 4. Security

- Validate all paths to prevent traversal
- Sanitize inputs before processing
- Don't expose sensitive data in responses

```typescript
// Path traversal prevention
function validatePath(input: string): string {
  const normalized = path.normalize(input);
  if (normalized.includes("..")) {
    throw new Error("Path traversal detected");
  }
  return normalized;
}
```

### Publishing

```json
// package.json
{
  "name": "@yourscope/my-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "my-mcp-server": "dist/index.js"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build"
  }
}
```

```bash
# Publish
npm publish --access public
```

---

## Session Storage

Sessions are stored globally at `~/.claude/elenchus/sessions/`:

```
~/.claude/elenchus/sessions/
└── 2024-01-15_src-auth_abc123/
    └── session.json
```

### Why Global Storage?

- MCP servers are **stdio-based and stateless**
- Each tool call runs as a new process
- Global storage ensures **session ID self-sufficiency**

### Session Cleanup

Sessions are preserved as audit records. Manual cleanup:

```bash
# Delete all sessions
rm -rf ~/.claude/elenchus/sessions/*

# Delete specific sessions
rm -rf ~/.claude/elenchus/sessions/2024-01-15_*
```

---

## Development

```bash
# Watch mode
npm run dev

# Build
npm run build

# MCP Inspector (debugging)
npm run inspector

# Start server
npm run start
```

### Running MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

---

## License

MIT

---

## Contributing

Contributions welcome! Please read our contributing guidelines and submit PRs.

## Support

- Issues: [GitHub Issues](https://github.com/jhlee0409/elenchus-mcp/issues)
- Discussions: [GitHub Discussions](https://github.com/jhlee0409/elenchus-mcp/discussions)
