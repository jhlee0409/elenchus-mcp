# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.1] - 2026-01-19

### Fixed
- **Schema Error Messages** - Enhanced error messages for all enum fields
  - All Zod enum validations now use `enumErrorMap()` helper
  - Clear guidance on valid values: `Invalid role "Verifier". Must be exactly one of: "verifier", "critic" (case-sensitive).`
  - Handles missing/undefined values: `Missing required field "severity". Must be one of: "CRITICAL", "HIGH", "MEDIUM", "LOW".`
  - Reduces LLM confusion when calling tools with enum parameters
  - Applied to: role, verdict, status, tier, severity, category, and other enum fields

- **Issue Category Auto-Inference** - Category can be inferred from issue ID prefix
  - `SEC-01` → `SECURITY`, `COR-02` → `CORRECTNESS`, etc.
  - Category field is now optional if ID follows convention

### Changed
- **Centralized `enumErrorMap`** - Eliminated code duplication
  - Moved to `src/utils/zod-helpers.ts` (single source of truth)
  - Removed duplicate definitions from `config/schemas.ts`, `schemas/issue.ts`, `tools/schemas.ts`
  - Consistent SCHEMA-07 fix (undefined handling) across all files

---

## [1.2.0] - 2026-01-19

### Added
- **Multi-Language Dependency Analysis (tree-sitter)** - 15 language support
  - Web: TypeScript, TSX, JavaScript, CSS
  - Systems: Rust, Go, C, C++
  - Enterprise: Java, C#
  - Scripting: Python, Ruby, PHP, Bash, PowerShell
  - Uses tree-sitter WASM for proper AST-based parsing
  - Language-specific import/export/function/class extraction
  - Graceful fallback if tree-sitter unavailable

- **Multi-Language Prompt Templates** - Support for 8 languages
  - English (en), Korean (한국어), Japanese (日本語)
  - Chinese Simplified (简体中文), Chinese Traditional (繁體中文)
  - Spanish (Español), French (Français), German (Deutsch)
  - `detectLanguage()`: Auto-detect language from user input
  - `getVerifierPrompt(lang)` / `getCriticPrompt(lang)`: Get localized prompts

- **User Preferences Detection** - Auto-detect communication style
  - Autonomy levels (L1-L4): Confirmation → Suggestion → Proceed → Delegate
  - Verbosity levels: minimal, normal, detailed
  - Pattern detection for Korean and English inputs
  - Stored in `session.userPreferences` for consistent experience

- **Session Integration** - Preferences applied throughout verification
  - `createSession()` auto-detects preferences from requirements
  - `startSession()` returns detected preferences in response
  - `getRolePrompt()` uses detected language for prompts

- **Quality Safeguards Auto-Activation** - Enhanced optimization safety
  - `SafeguardsAutoActivationConfig`: Configure auto-enable with optimizations
  - `getEffectiveSafeguardsConfig()`: Calculate effective config
  - Higher sampling rates when differential/cache/pipeline active

- **Convergence Improvements** - Better single-round support
  - `updateCategoryMentionCache()`: O(1) category coverage check
  - Support for `stableRoundsRequired=0` for true single-round verification

- **LLM-Based Evaluation** - Intelligent quality assessment using LLM reasoning
  - `elenchus_evaluate_convergence`: Get LLM prompt for convergence quality assessment
  - `elenchus_evaluate_severity`: Get LLM prompt for contextual severity classification
  - `elenchus_evaluate_edge_cases`: Get LLM prompt to verify actual edge case analysis
  - `elenchus_submit_llm_evaluation`: Submit LLM response and store results
  - `llmEvalConfig` option in `elenchus_start_session` to enable LLM evaluation
  - Replaces rigid pattern matching with context-aware LLM reasoning
  - Fallback to pattern-based evaluation when LLM unavailable

- **Enhanced Role Prompts** - Improved verification quality
  - Chain-of-Thought reasoning for systematic verification
  - Self-Review step for catching missed issues
  - Dynamic role generation via LLM

- **Test Infrastructure** - Added comprehensive testing setup
  - Vitest configuration with coverage support
  - Unit tests for core modules

### Changed
- **Role Prompt Selection** - Now considers language preference
  - `getRolePrompt()` accepts `language` option
  - Falls back to English if language not specified

- **Role Definitions Refactored** - Intent Contract pattern
  - Separated intent (what to achieve) from implementation (how)
  - Clearer role responsibilities and boundaries

- **Configuration Separation** - User output vs LLM context limits
  - `USER_OUTPUT_LIMITS`: Controls what users see (shorter)
  - `LLM_CONTEXT_LIMITS`: Controls LLM context window (larger)

### Refactored
- **Type System Unification** - Zod schemas for type safety
  - Unified runtime validation with TypeScript types
  - Single source of truth for all schemas

---

## [1.1.4] - 2026-01-18

### Fixed
- **Pipeline Security: ReDoS Prevention** - Fixed unsafe glob-to-regex conversion
  - Added `globToRegex()` function with proper special character escaping
  - Use non-greedy quantifiers (`.*?`) to prevent exponential backtracking
  - Patterns like `**/**/**/**` no longer cause ReDoS vulnerability
- **Pipeline Performance: Regex Pre-compilation** - Optimize pattern matching
  - Pre-compile `exhaustivePatterns` before file iteration
  - Reduced complexity from O(n×p) to O(p) regex compilations
- **Pipeline Maintainability: DRY Violation** - Extract shared constant
  - Added `TIER_ORDER` constant for tier comparison functions
  - Eliminated duplicate array definitions in `checkEscalationRule` and `escalateTier`

### Added
- **Pipeline State Persistence** - Infrastructure for state recovery across restarts
  - Added `pipelineState` field to `Session` interface
  - Added `syncPipelineToSession()` function for state export
  - Added `restorePipelineFromSession()` function for state import

---

## [1.1.3] - 2026-01-17

### Added
- **Claude Desktop Installation Guide** - Added setup instructions for Claude Desktop (macOS/Windows)
- **Claude Code Installation Guide** - Added setup instructions for Claude Code CLI

### Changed
- **README Structure Improvements** - Streamlined documentation based on MCP ecosystem research
  - Collapsed Issue Lifecycle section into `<details>` tag
  - Collapsed Convergence Detection section into `<details>` tag
  - Simplified table of contents (17 → 15 items)

### Removed
- **Edge Case Categories Section** - Removed OWASP/Netflix/Google DiRT references (overly verbose)
- **MCP Sampling Auto-Verification** - Removed automatic verification features
  - Removed `elenchus_auto_verify` tool
  - Removed `elenchus_get_auto_loop_status` tool
  - Removed `auto-verify` prompt
  - Removed `src/sampling/` module entirely
  - Removed MCP Sampling capability declaration

### Why MCP Sampling Removed
- MCP Sampling is not universally supported across clients
- For interactive use (Claude Code/Desktop), the LLM client itself can directly perform Verifier/Critic roles using existing prompts (`/verify`, `/complete`)
- The prompt-based workflow achieves the same result without Sampling dependency
- For CI/CD automation, a dedicated CLI tool would be more appropriate than MCP Sampling

### Migration Guide
Instead of `elenchus_auto_verify`, use the manual workflow:
1. Start session: `elenchus_start_session(...)`
2. Submit Verifier round: `elenchus_submit_round({ role: "verifier", ... })`
3. Submit Critic round: `elenchus_submit_round({ role: "critic", ... })`
4. Repeat until convergence
5. End session: `elenchus_end_session(...)`

Or use the `/verify` or `/complete` prompts which guide this workflow automatically.

---

## [1.1.2] - 2026-01-17

### Fixed
- **Client-Agnostic Configuration** - Ensure `.mcp.json` uses standard npx syntax
- **Documentation** - Update storage path from `~/.claude/elenchus/` to `~/.elenchus/`

---

## [1.1.1] - 2026-01-17

### Added
- **Claude Code Integration** - Added `.mcp.json` for seamless Claude Code setup

---

## [1.1.0] - 2026-01-17

### Added
- **MCP Sampling Automatic Verification** - New automatic verification loop using MCP Sampling
  - `elenchus_start_reverification` tool for re-verification sessions
  - `/mcp__elenchus__auto-verify` prompt for automated verification
  - Supports sampling-based LLM orchestration
- **One-Shot Verification Modes** - Faster verification for clean code
  - `fast-track` mode: Early convergence, skip Critic if no issues
  - `single-pass` mode: Verifier only, fastest mode
  - `standard` mode: Full Verifier↔Critic loop (default)
- **Token Optimization & Quality Safeguards**
  - Confidence scoring for verification quality
  - Periodic safeguard checks
  - Sampling-based quality validation
- **Advanced Data Structures** - Algorithm optimization utilities
  - LRU Cache, Priority Queue, Trie implementations
  - Performance-optimized for large codebases

### Changed
- **README Rewrite** - Complete rewrite following MCP best practices
  - Added Security section with security model documentation
  - Added Troubleshooting section with common issues and solutions
  - Added Configuration section with environment variables
  - Improved tool documentation format (Inputs/Returns/Example)
  - Added badges (Node.js, TypeScript, MCP Compatible)
  - Use collapsible sections for better readability
  - Removed unnecessary npm install guidance (npx only)
- **Korean README** - Updated to match English version

### Refactored
- Extracted `session-helpers.ts` for better code organization
- Extracted `result-types.ts` for consistent error handling
- Extracted `output-schemas.ts` for MCP output validation
- Centralized configuration in `config/constants.ts`

### Fixed
- Storage paths now client-agnostic (`~/.elenchus/` instead of `~/.claude/elenchus/`)

## [1.0.0] - 2025-01-16

### Added

#### Core Features
- **MCP Server** for Elenchus adversarial verification system
- **Session Management** with persistent storage at `~/.claude/elenchus/sessions/`
- **Verifier↔Critic Loop** for adversarial code verification
- **26 Standard Verification Criteria** (SEC/COR/REL/MNT/PRF)

#### MCP Tools
- `elenchus_start_session` - Start a new verification session
- `elenchus_get_context` - Get current verification context
- `elenchus_submit_round` - Submit verification round results
- `elenchus_get_issues` - Query session issues with filtering
- `elenchus_checkpoint` - Create checkpoint for rollback
- `elenchus_rollback` - Rollback to previous checkpoint
- `elenchus_end_session` - End session with final verdict
- `elenchus_ripple_effect` - Analyze code change impact
- `elenchus_mediator_summary` - Get mediator status
- `elenchus_get_role_prompt` - Get role guidelines
- `elenchus_role_summary` - Get role enforcement summary
- `elenchus_update_role_config` - Update role configuration

#### MCP Prompts (Slash Commands)
- `/mcp__elenchus__verify` - Run adversarial verification loop
- `/mcp__elenchus__consolidate` - Create prioritized fix plan
- `/mcp__elenchus__apply` - Apply fixes with verification
- `/mcp__elenchus__complete` - Full pipeline until zero issues
- `/mcp__elenchus__cross-verify` - Adversarial cross-verification

#### Advanced Features
- **Mediator** - Active intervention for verification loops
  - Scope drift detection
  - Critical path monitoring
  - Infinite loop detection
  - Coverage tracking
- **Role Enforcement** - Ensure Verifier/Critic role compliance
  - Compliance scoring
  - Role alternation enforcement
  - Guidelines and checklists

### Documentation
- English and Korean README
- Full API documentation for all tools
- Installation guides (npm, npx, source)

[1.2.1]: https://github.com/jhlee0409/elenchus-mcp/releases/tag/v1.2.1
[1.2.0]: https://github.com/jhlee0409/elenchus-mcp/releases/tag/v1.2.0
[1.1.4]: https://github.com/jhlee0409/elenchus-mcp/releases/tag/v1.1.4
[1.1.3]: https://github.com/jhlee0409/elenchus-mcp/releases/tag/v1.1.3
[1.1.2]: https://github.com/jhlee0409/elenchus-mcp/releases/tag/v1.1.2
[1.1.1]: https://github.com/jhlee0409/elenchus-mcp/releases/tag/v1.1.1
[1.1.0]: https://github.com/jhlee0409/elenchus-mcp/releases/tag/v1.1.0
[1.0.0]: https://github.com/jhlee0409/elenchus-mcp/releases/tag/v1.0.0
