/**
 * Tests for Token Budget Enforcement in Pipeline
 * [ENH: TOKEN-BUDGET] Ensures token limits are enforced correctly
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  initializePipeline,
  completeTier,
  getPipelineState,
  deletePipelineState
} from '../src/pipeline/index.js';
import { DEFAULT_PIPELINE_CONFIG, PipelineConfig } from '../src/pipeline/types.js';
import { Issue } from '../src/types/index.js';

describe('Pipeline Token Budget Enforcement', () => {
  const sessionId = 'test-session-budget';

  beforeEach(() => {
    deletePipelineState(sessionId);
  });

  describe('Token Budget Limits', () => {
    it('should block escalation when token budget is exceeded', () => {
      const config: PipelineConfig = {
        ...DEFAULT_PIPELINE_CONFIG,
        enforceTokenBudget: true,
        maxTotalTokens: 1000
      };

      initializePipeline(sessionId, config);

      // First tier uses tokens within budget
      const firstResult = completeTier(
        sessionId,
        {
          tier: 'screen',
          filesVerified: 5,
          issuesFound: 1,
          criticalIssues: 1,
          highIssues: 0,
          tokensUsed: 500,
          timeMs: 100
        },
        [{ id: 'issue-1', severity: 'CRITICAL', location: 'test.ts:1' } as Issue],
        config
      );

      // Should not be blocked yet
      expect(firstResult.shouldEscalate).toBe(true);

      // Second tier exceeds budget
      completeTier(
        sessionId,
        {
          tier: 'focused',
          filesVerified: 10,
          issuesFound: 0,
          criticalIssues: 0,
          highIssues: 0,
          tokensUsed: 600,
          timeMs: 200
        },
        [],
        config
      );

      const state = getPipelineState(sessionId);

      // Escalation should be blocked due to budget
      expect(state?.tokenBudgetExceeded).toBe(true);
      expect(state?.tokenBudgetWarning).toContain('Token budget exceeded');
    });

    it('should show warning at 80% token usage', () => {
      const config: PipelineConfig = {
        ...DEFAULT_PIPELINE_CONFIG,
        enforceTokenBudget: true,
        maxTotalTokens: 1000
      };

      initializePipeline(sessionId, config);

      // Use 85% of budget
      completeTier(
        sessionId,
        {
          tier: 'screen',
          filesVerified: 5,
          issuesFound: 0,
          criticalIssues: 0,
          highIssues: 0,
          tokensUsed: 850,
          timeMs: 100
        },
        [],
        config
      );

      const state = getPipelineState(sessionId);

      // Should show warning but not be exceeded
      expect(state?.tokenBudgetExceeded).toBeFalsy();
      expect(state?.tokenBudgetWarning).toContain('Token budget warning');
      expect(state?.tokenBudgetWarning).toContain('85%');
    });

    it('should not enforce budget when disabled', () => {
      const config: PipelineConfig = {
        ...DEFAULT_PIPELINE_CONFIG,
        enforceTokenBudget: false,
        maxTotalTokens: 1000
      };

      initializePipeline(sessionId, config);

      // Exceed budget
      completeTier(
        sessionId,
        {
          tier: 'screen',
          filesVerified: 5,
          issuesFound: 1,
          criticalIssues: 1,
          highIssues: 0,
          tokensUsed: 1500,
          timeMs: 100
        },
        [{ id: 'issue-1', severity: 'CRITICAL', location: 'test.ts:1' } as Issue],
        config
      );

      const state = getPipelineState(sessionId);

      // Budget enforcement disabled, so no exceeded flag
      expect(state?.tokenBudgetExceeded).toBeFalsy();
    });

    it('should track cumulative token usage across tiers', () => {
      const config: PipelineConfig = {
        ...DEFAULT_PIPELINE_CONFIG,
        enforceTokenBudget: true,
        maxTotalTokens: 10000
      };

      initializePipeline(sessionId, config);

      // First tier
      completeTier(
        sessionId,
        {
          tier: 'screen',
          filesVerified: 5,
          issuesFound: 1,
          criticalIssues: 1,
          highIssues: 0,
          tokensUsed: 1000,
          timeMs: 100
        },
        [{ id: 'issue-1', severity: 'CRITICAL', location: 'test.ts:1' } as Issue],
        config
      );

      // Second tier
      completeTier(
        sessionId,
        {
          tier: 'focused',
          filesVerified: 10,
          issuesFound: 0,
          criticalIssues: 0,
          highIssues: 0,
          tokensUsed: 2000,
          timeMs: 200
        },
        [],
        config
      );

      const state = getPipelineState(sessionId);

      // Should track cumulative usage
      expect(state?.totalTokensUsed).toBe(3000);
    });
  });

  describe('Budget with Escalation Rules', () => {
    it('should prevent escalation even when critical issues found if budget exceeded', () => {
      const config: PipelineConfig = {
        ...DEFAULT_PIPELINE_CONFIG,
        enforceTokenBudget: true,
        maxTotalTokens: 500,
        autoEscalate: true,
        qualityFirst: false  // Must be false to block escalation on budget exceed
      };

      initializePipeline(sessionId, config);

      // First tier uses all budget but finds critical issue
      const result = completeTier(
        sessionId,
        {
          tier: 'screen',
          filesVerified: 5,
          issuesFound: 1,
          criticalIssues: 1,
          highIssues: 0,
          tokensUsed: 600, // Exceeds budget
          timeMs: 100
        },
        [{ id: 'issue-1', severity: 'CRITICAL', location: 'test.ts:1' } as Issue],
        config
      );

      // Escalation should be blocked due to budget, not escalated due to critical issue
      expect(result.shouldEscalate).toBe(false);
      expect(result.escalationReason).toContain('Token budget exceeded');
    });
  });
});
