/**
 * Tests for Convergence Helpers
 * [ENH: CAT-CACHE] Category mention caching
 * [ENH: SINGLE-ROUND] stableRoundsRequired: 0 support
 */

import { describe, it, expect } from 'vitest';
import {
  updateCategoryMentionCache,
  calculateCategoryCoverage,
  aggregateIssues,
  evaluateConvergence,
  countRoundsWithoutNewIssues
} from '../src/state/convergence-helpers.js';
import { Issue, Round, Session, IssueCategory } from '../src/types/index.js';

describe('Category Mention Cache', () => {
  describe('updateCategoryMentionCache', () => {
    it('should detect SECURITY category in output', () => {
      const output = 'I have reviewed the code for SECURITY vulnerabilities.';
      const cache = updateCategoryMentionCache(output);

      expect(cache.has('SECURITY')).toBe(true);
      expect(cache.size).toBe(1);
    });

    it('should detect multiple categories in output', () => {
      const output = `
        SECURITY: No SQL injection found.
        CORRECTNESS: All edge cases handled.
        PERFORMANCE: No obvious bottlenecks.
      `;
      const cache = updateCategoryMentionCache(output);

      expect(cache.has('SECURITY')).toBe(true);
      expect(cache.has('CORRECTNESS')).toBe(true);
      expect(cache.has('PERFORMANCE')).toBe(true);
      expect(cache.size).toBe(3);
    });

    it('should be case-insensitive', () => {
      const output = 'Reviewed security and maintainability aspects.';
      const cache = updateCategoryMentionCache(output);

      expect(cache.has('SECURITY')).toBe(true);
      expect(cache.has('MAINTAINABILITY')).toBe(true);
    });

    it('should accumulate categories across calls', () => {
      let cache = updateCategoryMentionCache('Check SECURITY first.');
      cache = updateCategoryMentionCache('Then RELIABILITY.', cache);
      cache = updateCategoryMentionCache('Finally PERFORMANCE.', cache);

      expect(cache.has('SECURITY')).toBe(true);
      expect(cache.has('RELIABILITY')).toBe(true);
      expect(cache.has('PERFORMANCE')).toBe(true);
      expect(cache.size).toBe(3);
    });

    it('should not add duplicates', () => {
      let cache = updateCategoryMentionCache('SECURITY check.');
      cache = updateCategoryMentionCache('Another SECURITY review.', cache);

      expect(cache.size).toBe(1);
    });
  });

  describe('calculateCategoryCoverage with cache', () => {
    it('should use cache instead of scanning rounds when provided', () => {
      const categoryCounts: Record<IssueCategory, number> = {
        SECURITY: 0,
        CORRECTNESS: 0,
        RELIABILITY: 0,
        MAINTAINABILITY: 0,
        PERFORMANCE: 0
      };

      // Create cache with all categories mentioned
      const cache = new Set<IssueCategory>([
        'SECURITY', 'CORRECTNESS', 'RELIABILITY', 'MAINTAINABILITY', 'PERFORMANCE'
      ]);

      // Empty rounds - without cache, these categories would be uncovered
      const rounds: Round[] = [];
      const issues: Issue[] = [];

      const result = calculateCategoryCoverage(categoryCounts, rounds, issues, cache);

      // Should report all categories examined due to cache
      expect(result.allCategoriesExamined).toBe(true);
      expect(result.uncoveredCategories).toHaveLength(0);
    });

    it('should fall back to round scanning when no cache provided', () => {
      const categoryCounts: Record<IssueCategory, number> = {
        SECURITY: 0,
        CORRECTNESS: 0,
        RELIABILITY: 0,
        MAINTAINABILITY: 0,
        PERFORMANCE: 0
      };

      const rounds: Round[] = [
        {
          number: 1,
          role: 'verifier',
          input: '',
          output: 'Checked SECURITY and CORRECTNESS aspects.',
          timestamp: new Date().toISOString(),
          issuesRaised: [],
          issuesResolved: [],
          contextExpanded: false,
          newFilesDiscovered: []
        }
      ];

      const result = calculateCategoryCoverage(categoryCounts, rounds, [], undefined);

      // RELIABILITY, MAINTAINABILITY, PERFORMANCE not mentioned
      expect(result.allCategoriesExamined).toBe(false);
      expect(result.uncoveredCategories).toContain('RELIABILITY');
      expect(result.uncoveredCategories).toContain('MAINTAINABILITY');
      expect(result.uncoveredCategories).toContain('PERFORMANCE');
    });
  });
});

describe('Single Round Convergence (stableRoundsRequired: 0)', () => {
  const createMockSession = (
    currentRound: number,
    mode: 'standard' | 'fast-track' | 'single-pass',
    stableRoundsRequired?: number,
    minRounds?: number
  ): Session => ({
    id: 'test-session',
    target: '/test',
    requirements: 'Test requirements',
    status: 'verifying',
    currentRound,
    maxRounds: 10,
    context: {
      target: '/test',
      requirements: 'Test requirements',
      files: new Map()
    },
    issues: [],
    rounds: [],
    checkpoints: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    verificationMode: {
      mode,
      stableRoundsRequired,
      minRounds
    }
  });

  describe('evaluateConvergence', () => {
    it('should allow immediate convergence with stableRoundsRequired: 0 when no issues', () => {
      const session = createMockSession(1, 'fast-track', 0, 1);

      const aggregation = {
        categoryCounts: { SECURITY: 1, CORRECTNESS: 1, RELIABILITY: 1, MAINTAINABILITY: 1, PERFORMANCE: 1 },
        unresolvedIssues: 0,
        criticalUnresolved: 0,
        highUnresolved: 0,
        dismissedCount: 0,
        mergedCount: 0,
        recentTransitions: 0
      };

      const result = evaluateConvergence(
        session,
        aggregation,
        true,  // allCategoriesExamined
        0,     // roundsWithoutNewIssues (0 is OK with stableRoundsRequired: 0)
        true,  // hasEdgeCaseCoverage
        true,  // hasNegativeAsserts
        true   // hasHighRiskCoverage
      );

      // Should converge - fast-track allows convergence in 1 round
      // Note: convergenceType is 'standard' when all quality conditions are met
      expect(result.isConverged).toBe(true);
      expect(result.convergenceType).not.toBeNull();
    });

    it('should allow single-pass convergence in round 1', () => {
      const session = createMockSession(1, 'single-pass', 0, 1);

      const aggregation = {
        categoryCounts: { SECURITY: 1, CORRECTNESS: 1, RELIABILITY: 1, MAINTAINABILITY: 1, PERFORMANCE: 1 },
        unresolvedIssues: 0,
        criticalUnresolved: 0,
        highUnresolved: 0,
        dismissedCount: 0,
        mergedCount: 0,
        recentTransitions: 0
      };

      const result = evaluateConvergence(
        session,
        aggregation,
        true,
        1,     // Has 1 round without issues
        true,
        true,
        true
      );

      // Should converge - single-pass allows convergence in 1 round
      // Note: convergenceType is 'standard' when all quality conditions are met
      expect(result.isConverged).toBe(true);
      expect(result.convergenceType).not.toBeNull();
    });

    it('should still require 2+ stable rounds in standard mode', () => {
      const session = createMockSession(2, 'standard');

      const aggregation = {
        categoryCounts: { SECURITY: 1, CORRECTNESS: 1, RELIABILITY: 1, MAINTAINABILITY: 1, PERFORMANCE: 1 },
        unresolvedIssues: 0,
        criticalUnresolved: 0,
        highUnresolved: 0,
        dismissedCount: 0,
        mergedCount: 0,
        recentTransitions: 0
      };

      // Only 1 round without issues - not enough for standard mode
      const result = evaluateConvergence(
        session,
        aggregation,
        true,
        1,     // Only 1 round without issues
        true,
        true,
        true
      );

      // Standard mode requires minimum 3 rounds
      expect(result.isConverged).toBe(false);
    });

    it('should not converge with unresolved critical issues even with stableRoundsRequired: 0', () => {
      const session = createMockSession(1, 'fast-track', 0, 1);

      const aggregation = {
        categoryCounts: { SECURITY: 1, CORRECTNESS: 0, RELIABILITY: 0, MAINTAINABILITY: 0, PERFORMANCE: 0 },
        unresolvedIssues: 1,
        criticalUnresolved: 1,
        highUnresolved: 0,
        dismissedCount: 0,
        mergedCount: 0,
        recentTransitions: 0
      };

      const result = evaluateConvergence(
        session,
        aggregation,
        true,
        0,
        true,
        true,
        true
      );

      expect(result.isConverged).toBe(false);
    });
  });

  describe('countRoundsWithoutNewIssues', () => {
    it('should count consecutive rounds from the end', () => {
      const createRound = (num: number, issues: string[]): Round => ({
        number: num,
        role: 'verifier',
        input: '',
        output: '',
        timestamp: new Date().toISOString(),
        issuesRaised: issues,
        issuesResolved: [],
        contextExpanded: false,
        newFilesDiscovered: []
      });

      const rounds: Round[] = [
        createRound(1, ['issue-1']),
        createRound(2, []),
        createRound(3, []),
      ];

      expect(countRoundsWithoutNewIssues(rounds)).toBe(2);
    });

    it('should return 0 when last round has new issues', () => {
      const createRound = (num: number, issues: string[]): Round => ({
        number: num,
        role: 'verifier',
        input: '',
        output: '',
        timestamp: new Date().toISOString(),
        issuesRaised: issues,
        issuesResolved: [],
        contextExpanded: false,
        newFilesDiscovered: []
      });

      const rounds: Round[] = [
        createRound(1, []),
        createRound(2, ['issue-1']),
      ];

      expect(countRoundsWithoutNewIssues(rounds)).toBe(0);
    });

    it('should return all rounds count when none have issues', () => {
      const createRound = (num: number, issues: string[]): Round => ({
        number: num,
        role: 'verifier',
        input: '',
        output: '',
        timestamp: new Date().toISOString(),
        issuesRaised: issues,
        issuesResolved: [],
        contextExpanded: false,
        newFilesDiscovered: []
      });

      const rounds: Round[] = [
        createRound(1, []),
        createRound(2, []),
        createRound(3, []),
      ];

      expect(countRoundsWithoutNewIssues(rounds)).toBe(3);
    });
  });
});

describe('aggregateIssues', () => {
  it('should aggregate issue counts correctly', () => {
    const issues: Issue[] = [
      {
        id: 'issue-1',
        category: 'SECURITY',
        severity: 'CRITICAL',
        status: 'RAISED',
        summary: 'Test',
        location: 'test.ts:1',
        description: '',
        evidence: '',
        raisedBy: 'verifier',
        raisedInRound: 1
      },
      {
        id: 'issue-2',
        category: 'CORRECTNESS',
        severity: 'HIGH',
        status: 'RAISED',
        summary: 'Test',
        location: 'test.ts:2',
        description: '',
        evidence: '',
        raisedBy: 'verifier',
        raisedInRound: 1
      },
      {
        id: 'issue-3',
        category: 'SECURITY',
        severity: 'LOW',
        status: 'RESOLVED',
        summary: 'Test',
        location: 'test.ts:3',
        description: '',
        evidence: '',
        raisedBy: 'critic',
        raisedInRound: 2
      }
    ];

    const result = aggregateIssues(issues, 3);

    expect(result.categoryCounts.SECURITY).toBe(2);
    expect(result.categoryCounts.CORRECTNESS).toBe(1);
    expect(result.unresolvedIssues).toBe(2);
    expect(result.criticalUnresolved).toBe(1);
    expect(result.highUnresolved).toBe(1);
  });

  it('should count dismissed and merged issues', () => {
    const issues: Issue[] = [
      { id: 'issue-1', category: 'SECURITY', severity: 'MEDIUM', status: 'DISMISSED' } as Issue,
      { id: 'issue-2', category: 'SECURITY', severity: 'MEDIUM', status: 'MERGED' } as Issue,
      { id: 'issue-3', category: 'SECURITY', severity: 'MEDIUM', status: 'RESOLVED' } as Issue,
    ];

    const result = aggregateIssues(issues, 3);

    expect(result.dismissedCount).toBe(1);
    expect(result.mergedCount).toBe(1);
    expect(result.unresolvedIssues).toBe(0);
  });

  it('should count recent transitions', () => {
    const issues: Issue[] = [
      {
        id: 'issue-1',
        category: 'SECURITY',
        severity: 'MEDIUM',
        status: 'RESOLVED',
        transitions: [
          { round: 2, type: 'VALIDATED', fromStatus: 'RAISED', toStatus: 'RESOLVED', reason: '', triggeredBy: 'verifier', timestamp: '' }
        ]
      } as Issue,
      {
        id: 'issue-2',
        category: 'CORRECTNESS',
        severity: 'LOW',
        status: 'RAISED',
        transitions: [
          { round: 1, type: 'DISCOVERED', fromStatus: 'RAISED', toStatus: 'RAISED', reason: '', triggeredBy: 'verifier', timestamp: '' }
        ]
      } as Issue
    ];

    // Current round is 3, so transitions in round 2+ are recent
    const result = aggregateIssues(issues, 3);

    expect(result.recentTransitions).toBe(1); // Only round 2 transition is recent (>= currentRound - 1)
  });
});
