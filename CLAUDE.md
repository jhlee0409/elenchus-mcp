# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Elenchus MCP Server is an adversarial code verification system using a Verifier-Critic loop. Named after Socrates' method of refutation (ἔλεγχος), it orchestrates debate between Verifier and Critic agents via the Model Context Protocol (MCP).

## Build & Development

```bash
npm run build      # Compile TypeScript to dist/
npm run dev        # Watch mode with auto-rebuild
npm run start      # Run the compiled server
npm run inspector  # Launch MCP Inspector for debugging
```

## Architecture

### Core Flow

1. **Session Start** → Initializes verification, builds dependency graph
2. **Round Submission** → Verifier and Critic alternate submitting analysis
3. **Convergence Check** → Automatic evaluation after each round
4. **Session End** → Final verdict (PASS/FAIL/CONDITIONAL)

### Key Modules

| Module | Purpose |
|--------|---------|
| `src/index.ts` | MCP server entry point, registers tools/resources/prompts |
| `src/tools/` | All MCP tool implementations (session lifecycle, state management, analysis, role enforcement) |
| `src/state/session.ts` | Session persistence at `~/.elenchus/sessions/`, convergence detection |
| `src/state/context.ts` | File collection, pre-analysis for obvious issues |
| `src/mediator/` | Dependency graph, circular detection, ripple effect analysis, interventions |
| `src/roles/` | Verifier/Critic definitions, compliance validation, strict alternation |
| `src/prompts/` | 5 MCP prompts: verify, consolidate, apply, complete, cross-verify |
| `src/utils/data-structures.ts` | LRU Cache, Priority Queue, Trie for algorithm optimization |

### Token Optimization Modules

| Module | Purpose |
|--------|---------|
| `src/diff/` | Differential analysis (verify only changed files) |
| `src/cache/` | Response caching with TTL |
| `src/chunking/` | Split large files into function-level chunks |
| `src/pipeline/` | Tiered verification (screen → focused → exhaustive) |
| `src/safeguards/` | Quality safeguards, confidence scoring, sampling validation |

### Verification Modes

| Mode | Min Rounds | Critic Required | Use Case |
|------|------------|-----------------|----------|
| `standard` | 3 | Yes | Thorough verification |
| `fast-track` | 1 | Optional | Quick validation |
| `single-pass` | 1 | No | Fastest, Verifier-only |

### Convergence Criteria

Session converges when:
- Zero CRITICAL/HIGH unresolved issues
- All 5 categories examined (SECURITY, CORRECTNESS, RELIABILITY, MAINTAINABILITY, PERFORMANCE)
- Edge cases documented, negative assertions present
- Minimum rounds + stable rounds completed
- No recent issue state transitions

### Issue Lifecycle

`RAISED → CHALLENGED → RESOLVED/DISMISSED/MERGED/SPLIT`

Critic verdicts: VALID, INVALID (false positive), PARTIAL.

## Code Style

- TypeScript strict mode, ESM modules with `.js` extensions in imports
- Zod schemas for all tool input validation
- Enhancement comments: `// [ENH: TAG-ID]`
- Interfaces in `src/types/index.ts`, re-exported via index files

## NPM Publish Workflow

### Version Bump (2 locations)

```bash
# Update version in:
- package.json          # "version": "X.Y.Z"
- src/index.ts          # version: 'X.Y.Z' (in Server constructor)
```

### Steps

1. Update version in both locations above
2. Update CHANGELOG.md with new version entry (Added/Changed/Fixed/Removed sections)
3. Update version links at bottom of CHANGELOG.md
4. Run `npm run build` - must succeed
5. Update README.md/README.ko.md if API changed
6. Run `npm publish --access public`
7. Create git commit and tag

### Quick Checklist

```
[ ] Version in package.json
[ ] Version in src/index.ts
[ ] CHANGELOG.md entry
[ ] npm run build succeeds
[ ] README updated (if needed)
[ ] Git commit and tag
```
