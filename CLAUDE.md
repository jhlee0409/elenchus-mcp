# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Elenchus MCP Server is an adversarial code verification system using a Verifier-Critic loop. Named after Socrates' method of refutation (ἔλεγχος), it provides state management, context sharing, and orchestration for code verification loops via the Model Context Protocol (MCP).

## Build & Development Commands

```bash
npm run build      # Compile TypeScript to dist/
npm run dev        # Watch mode with auto-rebuild
npm run start      # Run the compiled server
npm run inspector  # Launch MCP Inspector for debugging
```

## Architecture

### Core Flow

1. **Session Start** (`startSession`) - Initializes verification with target files, builds dependency graph
2. **Round Submission** (`submitRound`) - Verifier and Critic alternate submitting analysis
3. **Convergence Check** - Automatic evaluation after each round
4. **Session End** (`endSession`) - Final verdict (PASS/FAIL/CONDITIONAL)

### Key Modules

**src/index.ts** - MCP server entry point, registers tools/resources/prompts handlers

**src/tools/index.ts** - All MCP tool implementations:
- Session lifecycle: `startSession`, `getContext`, `submitRound`, `endSession`
- State management: `checkpoint`, `rollback`
- Analysis: `rippleEffect`, `mediatorSummary`
- Role enforcement: `getRolePrompt`, `roleSummary`, `updateRoleConfig`
- [ENH: ONE-SHOT] Fix application: `applyFix` - Apply fixes within session, refresh context, trigger re-verify

**src/state/session.ts** - Session persistence and convergence detection:
- Sessions stored at `~/.elenchus/sessions/` (client-agnostic)
- `checkConvergence()` - Intent-based convergence with 5 categories, edge case coverage, impact analysis
- [ENH: ONE-SHOT] Supports `fast-track` and `single-pass` modes for faster convergence

**src/state/context.ts** - Context and pre-analysis:
- [ENH: ONE-SHOT] `analyzeContextForIssues()` - Lightweight static analysis on initialization
- Pre-identifies obvious issues (eval, innerHTML, hardcoded secrets, etc.) before LLM verification

**src/mediator/** - Dependency analysis and proactive intervention:
- Builds import/export dependency graph
- Detects circular dependencies
- Analyzes ripple effects of code changes
- Triggers interventions (CONTEXT_EXPAND, LOOP_BREAK, SOFT_CORRECT)

**src/roles/** - Verifier/Critic role definitions and enforcement:
- Strict alternation: Verifier → Critic → Verifier → ...
- Compliance validation with mustDo/mustNotDo rules
- Optional strict mode that rejects non-compliant rounds

**src/prompts/** - MCP prompts (slash commands):
- `verify` - Run Verifier-Critic loop
- `consolidate` - Create prioritized fix plan
- `apply` - Apply fixes with verification
- `complete` - Full pipeline until zero issues
- `cross-verify` - Adversarial cross-verification

### Verification Modes [ENH: ONE-SHOT]

Three verification modes for different use cases:

| Mode | Description | Min Rounds | Critic Required |
|------|-------------|------------|-----------------|
| `standard` | Full Verifier↔Critic loop | 3 | Yes |
| `fast-track` | Early convergence for clean code | 1 | Optional (skipped if no issues) |
| `single-pass` | Verifier only, fastest mode | 1 | No |

**Usage:**
```javascript
elenchus_start_session({
  target: "src/",
  requirements: "security audit",
  workingDir: "/project",
  verificationMode: {
    mode: "fast-track",  // or "standard", "single-pass"
    skipCriticForCleanCode: true
  }
})
```

### Convergence Criteria

A session converges when ALL conditions are met:
- Zero CRITICAL/HIGH severity unresolved issues
- All 5 categories examined (SECURITY, CORRECTNESS, RELIABILITY, MAINTAINABILITY, PERFORMANCE)
- Edge case analysis documented
- Negative assertions present (explicit "no issues" statements)
- High-risk impacted files reviewed
- Issues stabilized (no recent transitions)
- Minimum rounds completed (varies by mode: standard=3, fast-track/single-pass=1)
- Stable rounds without new issues (standard=2, others=1)

### Issue Lifecycle

Issues transition through: RAISED → CHALLENGED → RESOLVED/DISMISSED/MERGED/SPLIT

Critic must review issues before resolution. Verdicts: VALID, INVALID (false positive), PARTIAL.

## Code Style

- TypeScript strict mode enabled
- ESM modules with `.js` extensions in imports
- Zod schemas for all tool input validation
- Enhancement comments use `// [ENH: TAG-ID]` format
- Interfaces in `src/types/index.ts`, re-exported via index files
