# Elenchus Implementation Status

## Completed Features

### 1. Issue Lifecycle Management
- Location: `src/lifecycle/index.ts`, `src/types/index.ts`
- New statuses: DISMISSED, MERGED, SPLIT
- Transitions: DISCOVERED, ESCALATED, DEMOTED, MERGED_INTO, SPLIT_FROM, INVALIDATED, VALIDATED, REFINED
- Functions: detectIssueTransitions, applyTransition, mergeIssues, splitIssue, changeSeverity

### 2. Exhaustive Verification System
- Location: `src/roles/definitions.ts`
- V005: ALL 5 categories must be covered (ERROR)
- V006: Negative assertions required (WARNING)
- V007: Edge case analysis required (ERROR)
- V008: Must address Critic FLAGs (ERROR)
- C002: FLAG format allowed (ERROR)
- C006: Must verify category coverage (WARNING)
- C007: Must challenge shallow verification (WARNING)

### 3. Enhanced Convergence
- Location: `src/state/session.ts`
- Added: hasEdgeCaseCoverage, hasNegativeAssertions
- Convergence requires edge case + negative assertion documentation

### 4. Re-verification Phase
- Location: `src/tools/index.ts`
- New tool: elenchus_start_reverification
- Links to previous session, focuses on resolved issues

### 5. Critic FLAG System
- Format: "⚠️ FLAG FOR VERIFIER: [description]"
- Critic can flag without directly raising issues
- Verifier must address FLAGs

### 6. Intent-Based Edge Case Validation (9 conceptual categories)
- Location: `src/roles/definitions.ts:checkEdgeCaseCoverage`
- **Refactored to INTENT-BASED approach** - no hardcoded keyword matching
- Based on: OWASP, Netflix Chaos Engineering, Google DiRT, Production Incidents

| # | Category | Thinking Question |
|---|----------|-------------------|
| 1 | **Code-level** | What if inputs are null, empty, at boundary values? |
| 2 | **User Behavior** | What if users double-click, refresh, or have concurrent sessions? |
| 3 | **External Dependencies** | What if external services fail, timeout, or return unexpected data? |
| 4 | **Business Logic** | What if permissions change or state transitions conflict? |
| 5 | **Data State** | What if data is legacy, corrupted, or in unexpected format? |
| 6 | **Environment** | What if config drifts or resources are limited? |
| 7 | **Scale** | What if traffic is 100x normal or data is massive? |
| 8 | **Security** | What if inputs bypass validation or sessions are attacked? |
| 9 | **Side Effects** | What if state changes mid-operation or transactions partially fail? |

**Intent-Based Validation:**
- Instead of keyword matching, checks for STRUCTURAL indicators:
  - "Edge Cases:" section presence
  - "What if..." analysis patterns
  - Explicit boundary/failure scenario documentation
- Trusts LLM semantic understanding over regex patterns
- Guides THINKING, not keyword stuffing

### 7. Automatic Impact Analysis
- Location: `src/mediator/index.ts:analyzeIssueImpact`
- Auto-attached when issues are raised
- Includes: callers, dependencies, relatedTests, affectedFunctions, cascadeDepth, riskLevel, summary
- Issue.impactAnalysis field added to Issue interface
- High-risk issues show impact warning in description

### 8. Impact Coverage Validation
- Location: `src/state/session.ts:checkConvergence`
- Convergence requires high-risk impacted files to be reviewed
- Tracks: totalImpactedFiles, reviewedImpactedFiles, unreviewedImpactedFiles, coverageRate, hasHighRiskCoverage

### 9. Proactive Mediator
- Location: `src/tools/index.ts:generateProactiveContextSummary`
- Provides guidance at round start via getContext response
- Includes: focusAreas, unreviewedFiles, impactRecommendations, edgeCaseGaps, recommendations

---

## Intent-Based Refactoring (Latest)

**Key Principle:** Trust LLM semantic understanding instead of regex keyword matching.

### Changes Made:

1. **`checkEdgeCaseCoverage` (definitions.ts)**
   - Removed: 9 hardcoded keyword arrays with 100+ specific patterns
   - Added: Structural detection for "Edge Cases:" sections
   - Guidance: Provides thinking questions, not keyword checklists

2. **`VERIFIER_PROMPT` (definitions.ts)**
   - Removed: Keyword lists per category
   - Added: "THINK BEYOND THE HAPPY PATH" section with guiding questions:
     - About Inputs, State, External Dependencies, Concurrency, Environment

3. **`VERIFIER_ROLE.mustDo` (definitions.ts)**
   - Removed: Specific category examples with keywords
   - Added: Thinking-based guidance ("What if X happens?")

4. **`checkConvergence` (session.ts)**
   - Removed: `categoryKeywords` object with hardcoded patterns
   - Removed: `edgeCaseCategories` object with 9 keyword arrays
   - Added: Intent-based structural detection
   - Checks for explicit category mentions (e.g., "SECURITY") rather than synonyms

### Benefits:
- LLM can reason semantically about edge cases
- Not limited to predefined keywords
- Encourages actual thinking over keyword stuffing
- More flexible for different codebases and languages
- Supports both English and Korean naturally

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Elenchus MCP Server                      │
├─────────────────────────────────────────────────────────────┤
│  Tools (src/tools/index.ts)                                 │
│  ├── elenchus_start_session      - Start verification       │
│  ├── elenchus_get_context        - Get current context      │
│  ├── elenchus_submit_round       - Submit verification round│
│  ├── elenchus_get_issues         - Get issues list          │
│  ├── elenchus_checkpoint         - Create checkpoint        │
│  ├── elenchus_rollback           - Rollback to checkpoint   │
│  ├── elenchus_end_session        - End with verdict         │
│  ├── elenchus_ripple_effect      - Analyze change impact    │
│  ├── elenchus_mediator_summary   - Get mediator stats       │
│  ├── elenchus_get_role_prompt    - Get role guidelines      │
│  ├── elenchus_role_summary       - Get role compliance      │
│  └── elenchus_update_role_config - Update role settings     │
├─────────────────────────────────────────────────────────────┤
│  State Management (src/state/)                              │
│  ├── session.ts   - Session state, convergence logic        │
│  └── context.ts   - Verification context management         │
├─────────────────────────────────────────────────────────────┤
│  Role Enforcement (src/roles/)                              │
│  ├── definitions.ts - Verifier/Critic role definitions      │
│  ├── types.ts       - Role types                            │
│  └── index.ts       - Role validation logic                 │
├─────────────────────────────────────────────────────────────┤
│  Mediator (src/mediator/)                                   │
│  ├── index.ts    - Impact analysis, interventions           │
│  ├── analyzer.ts - Dependency graph analysis                │
│  └── types.ts    - Mediator types                           │
├─────────────────────────────────────────────────────────────┤
│  Issue Lifecycle (src/lifecycle/)                           │
│  └── index.ts - Issue state transitions, merge/split        │
├─────────────────────────────────────────────────────────────┤
│  Types (src/types/index.ts)                                 │
│  └── All shared types and interfaces                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Files
- `src/types/index.ts` - Core types
- `src/lifecycle/index.ts` - Issue lifecycle
- `src/roles/definitions.ts` - Verifier/Critic rules, intent-based edge case validation
- `src/state/session.ts` - Convergence logic (intent-based), impact coverage validation
- `src/mediator/index.ts` - Auto impact analysis, ripple effect
- `src/tools/index.ts` - MCP tools, proactive context summary
