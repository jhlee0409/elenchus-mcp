# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0]: https://github.com/jhlee0409/claude-plugins/releases/tag/elenchus-mcp-v1.0.0
