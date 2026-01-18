/**
 * Tests for Mediator Cache Invalidation
 * [ENH: CACHE-INVALIDATION] Invalidate importance cache on context expansion
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as mediator from '../src/mediator/index.js';
import * as analyzer from '../src/mediator/analyzer.js';
import { DependencyGraph, DependencyEdge } from '../src/mediator/types.js';

// Mock the analyzer module
vi.mock('../src/mediator/analyzer.js', async (importOriginal) => {
  const original = await importOriginal<typeof analyzer>();
  return {
    ...original,
    buildDependencyGraph: vi.fn(),
    calculateFileImportance: vi.fn(),
    detectCircularDependencies: vi.fn().mockReturnValue([]),
    findAffectedFiles: vi.fn().mockReturnValue([])
  };
});

// Helper to create a mock dependency graph
function createMockGraph(files: string[]): DependencyGraph {
  const nodes = new Map();
  const edges: DependencyEdge[] = [];
  const reverseEdges = new Map<string, string[]>();
  const outgoingEdges = new Map<string, DependencyEdge[]>();

  for (const file of files) {
    nodes.set(file, {
      path: file,
      imports: [],
      exports: [],
      functions: [],
      classes: []
    });
    reverseEdges.set(file, []);
    outgoingEdges.set(file, []);
  }

  return { nodes, edges, reverseEdges, outgoingEdges };
}

describe('Mediator Cache Invalidation', () => {
  const sessionId = 'test-session-mediator';
  const workingDir = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    // Clean up any existing state
    mediator.deleteMediatorState(sessionId);
  });

  afterEach(() => {
    mediator.deleteMediatorState(sessionId);
  });

  describe('State Lifecycle', () => {
    it('should initialize mediator state with files', async () => {
      const files = ['src/index.ts', 'src/utils.ts'];
      const mockGraph = createMockGraph(files);

      vi.mocked(analyzer.buildDependencyGraph).mockResolvedValue(mockGraph);
      vi.mocked(analyzer.calculateFileImportance).mockReturnValue(
        new Map([['src/index.ts', 10], ['src/utils.ts', 5]])
      );

      const state = await mediator.initializeMediator(sessionId, files, workingDir);

      expect(state).toBeDefined();
      expect(state.sessionId).toBe(sessionId);
      expect(state.coverage.totalFiles).toBe(2);
      expect(state.coverage.verifiedFiles.size).toBe(0);
      expect(analyzer.buildDependencyGraph).toHaveBeenCalledWith(files, workingDir);
    });

    it('should return state after initialization', async () => {
      const files = ['src/index.ts'];
      const mockGraph = createMockGraph(files);

      vi.mocked(analyzer.buildDependencyGraph).mockResolvedValue(mockGraph);
      vi.mocked(analyzer.calculateFileImportance).mockReturnValue(new Map());

      await mediator.initializeMediator(sessionId, files, workingDir);
      const state = mediator.getMediatorState(sessionId);

      expect(state).toBeDefined();
      expect(state?.sessionId).toBe(sessionId);
    });

    it('should return undefined for non-existent session', () => {
      const state = mediator.getMediatorState('non-existent-session');
      expect(state).toBeUndefined();
    });

    it('should delete mediator state', async () => {
      const files = ['src/index.ts'];
      const mockGraph = createMockGraph(files);

      vi.mocked(analyzer.buildDependencyGraph).mockResolvedValue(mockGraph);
      vi.mocked(analyzer.calculateFileImportance).mockReturnValue(new Map());

      await mediator.initializeMediator(sessionId, files, workingDir);
      expect(mediator.getMediatorState(sessionId)).toBeDefined();

      const deleted = mediator.deleteMediatorState(sessionId);
      expect(deleted).toBe(true);
      expect(mediator.getMediatorState(sessionId)).toBeUndefined();
    });

    it('should return false when deleting non-existent state', () => {
      const deleted = mediator.deleteMediatorState('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('invalidateCachedImportance', () => {
    it('should rebuild graph when new files are added', async () => {
      const initialFiles = ['src/index.ts'];
      const newFiles = ['src/new-feature.ts', 'src/utils.ts'];
      const initialGraph = createMockGraph(initialFiles);
      const expandedGraph = createMockGraph([...initialFiles, ...newFiles]);

      vi.mocked(analyzer.buildDependencyGraph)
        .mockResolvedValueOnce(initialGraph)
        .mockResolvedValueOnce(expandedGraph);
      vi.mocked(analyzer.calculateFileImportance).mockReturnValue(new Map());

      await mediator.initializeMediator(sessionId, initialFiles, workingDir);
      await mediator.invalidateCachedImportance(sessionId, newFiles, workingDir);

      // Should have rebuilt graph with all files
      expect(analyzer.buildDependencyGraph).toHaveBeenCalledTimes(2);
      expect(analyzer.buildDependencyGraph).toHaveBeenLastCalledWith(
        expect.arrayContaining(['src/index.ts', 'src/new-feature.ts', 'src/utils.ts']),
        workingDir
      );
    });

    it('should add newly critical files to unverified list', async () => {
      const initialFiles = ['src/index.ts'];
      const newFiles = ['src/critical-module.ts'];
      const initialGraph = createMockGraph(initialFiles);
      const expandedGraph = createMockGraph([...initialFiles, ...newFiles]);

      vi.mocked(analyzer.buildDependencyGraph)
        .mockResolvedValueOnce(initialGraph)
        .mockResolvedValueOnce(expandedGraph);

      // First call: only index.ts is critical
      // Second call: critical-module.ts becomes very important
      vi.mocked(analyzer.calculateFileImportance)
        .mockReturnValueOnce(new Map([['src/index.ts', 10]]))
        .mockReturnValueOnce(new Map([
          ['src/index.ts', 10],
          ['src/critical-module.ts', 20]  // Higher importance = critical
        ]));

      await mediator.initializeMediator(sessionId, initialFiles, workingDir);
      const stateBefore = mediator.getMediatorState(sessionId);
      const criticalBefore = [...(stateBefore?.coverage.unverifiedCritical || [])];

      await mediator.invalidateCachedImportance(sessionId, newFiles, workingDir);

      const stateAfter = mediator.getMediatorState(sessionId);

      // New critical file should be added
      expect(stateAfter?.coverage.unverifiedCritical).toContain('src/critical-module.ts');
      expect(stateAfter?.coverage.unverifiedCritical.length).toBeGreaterThan(criticalBefore.length);
    });

    it('should not add already verified files to critical list on cache invalidation', async () => {
      // This test verifies that when invalidateCachedImportance is called,
      // files that are already marked as verified are NOT added to unverifiedCritical
      const initialFiles = ['src/index.ts'];
      const newFiles = ['src/new.ts'];
      const initialGraph = createMockGraph(initialFiles);
      const expandedGraph = createMockGraph([...initialFiles, ...newFiles]);

      vi.mocked(analyzer.buildDependencyGraph)
        .mockResolvedValueOnce(initialGraph)
        .mockResolvedValueOnce(expandedGraph);

      // Both files have equal importance on second call
      vi.mocked(analyzer.calculateFileImportance)
        .mockReturnValueOnce(new Map([['src/index.ts', 10]]))
        .mockReturnValueOnce(new Map([
          ['src/index.ts', 10],
          ['src/new.ts', 10]
        ]));

      await mediator.initializeMediator(sessionId, initialFiles, workingDir);

      // Mark index.ts as verified BEFORE cache invalidation
      const state = mediator.getMediatorState(sessionId);
      state?.coverage.verifiedFiles.add('src/index.ts');
      // Also remove from unverifiedCritical since it's now verified
      const idx = state?.coverage.unverifiedCritical.indexOf('src/index.ts') ?? -1;
      if (idx !== -1) {
        state?.coverage.unverifiedCritical.splice(idx, 1);
      }

      await mediator.invalidateCachedImportance(sessionId, newFiles, workingDir);

      const stateAfter = mediator.getMediatorState(sessionId);

      // index.ts is verified, should NOT be re-added to unverifiedCritical
      expect(stateAfter?.coverage.unverifiedCritical).not.toContain('src/index.ts');
      // new.ts is not verified, can be in unverifiedCritical
      // (may or may not be there depending on importance threshold)
    });

    it('should do nothing when no new files provided', async () => {
      const initialFiles = ['src/index.ts'];
      const mockGraph = createMockGraph(initialFiles);

      vi.mocked(analyzer.buildDependencyGraph).mockResolvedValue(mockGraph);
      vi.mocked(analyzer.calculateFileImportance).mockReturnValue(new Map());

      await mediator.initializeMediator(sessionId, initialFiles, workingDir);
      await mediator.invalidateCachedImportance(sessionId, [], workingDir);

      // Should not rebuild graph for empty files
      expect(analyzer.buildDependencyGraph).toHaveBeenCalledTimes(1);
    });

    it('should do nothing when session does not exist', async () => {
      await mediator.invalidateCachedImportance('non-existent', ['file.ts'], workingDir);

      // Should not call any analyzer functions
      expect(analyzer.buildDependencyGraph).not.toHaveBeenCalled();
    });

    it('should not duplicate files in unverified critical list', async () => {
      const initialFiles = ['src/index.ts'];
      const newFiles = ['src/new.ts'];
      const initialGraph = createMockGraph(initialFiles);
      const expandedGraph = createMockGraph([...initialFiles, ...newFiles]);

      vi.mocked(analyzer.buildDependencyGraph)
        .mockResolvedValueOnce(initialGraph)
        .mockResolvedValueOnce(expandedGraph)
        .mockResolvedValueOnce(expandedGraph);  // Third call

      vi.mocked(analyzer.calculateFileImportance).mockReturnValue(
        new Map([['src/index.ts', 10], ['src/new.ts', 10]])
      );

      await mediator.initializeMediator(sessionId, initialFiles, workingDir);

      // Call twice with same new files
      await mediator.invalidateCachedImportance(sessionId, newFiles, workingDir);
      await mediator.invalidateCachedImportance(sessionId, newFiles, workingDir);

      const state = mediator.getMediatorState(sessionId);
      const criticalCount = state?.coverage.unverifiedCritical.filter(
        f => f === 'src/new.ts'
      ).length;

      // Should only appear once
      expect(criticalCount).toBeLessThanOrEqual(1);
    });
  });

  describe('getMediatorSummary', () => {
    it('should return null for non-existent session', () => {
      const summary = mediator.getMediatorSummary('non-existent');
      expect(summary).toBeNull();
    });

    it('should return summary with graph stats', async () => {
      const files = ['src/index.ts', 'src/utils.ts', 'src/lib.ts'];
      const mockGraph = createMockGraph(files);
      mockGraph.edges = [
        { from: 'src/index.ts', to: 'src/utils.ts', type: 'import', specifiers: [] },
        { from: 'src/utils.ts', to: 'src/lib.ts', type: 'import', specifiers: [] }
      ];

      vi.mocked(analyzer.buildDependencyGraph).mockResolvedValue(mockGraph);
      vi.mocked(analyzer.calculateFileImportance).mockReturnValue(new Map());

      await mediator.initializeMediator(sessionId, files, workingDir);
      const summary = mediator.getMediatorSummary(sessionId) as Record<string, unknown>;

      expect(summary).toBeDefined();
      expect(summary.graphStats).toEqual({
        totalNodes: 3,
        totalEdges: 2,
        circularDeps: 0
      });
    });

    it('should return coverage stats', async () => {
      const files = ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts'];
      const mockGraph = createMockGraph(files);

      vi.mocked(analyzer.buildDependencyGraph).mockResolvedValue(mockGraph);
      vi.mocked(analyzer.calculateFileImportance).mockReturnValue(new Map());

      await mediator.initializeMediator(sessionId, files, workingDir);

      // Mark 2 files as verified
      const state = mediator.getMediatorState(sessionId);
      state?.coverage.verifiedFiles.add('src/a.ts');
      state?.coverage.verifiedFiles.add('src/b.ts');

      const summary = mediator.getMediatorSummary(sessionId) as Record<string, { coverageRate: string; verifiedFiles: number }>;

      expect(summary.coverage.verifiedFiles).toBe(2);
      expect(summary.coverage.coverageRate).toBe('50.0%');
    });
  });

  describe('analyzeRippleEffect', () => {
    it('should return null for non-existent session', () => {
      const effect = mediator.analyzeRippleEffect('non-existent', 'file.ts');
      expect(effect).toBeNull();
    });

    it('should analyze ripple effect for changed file', async () => {
      const files = ['src/core.ts', 'src/utils.ts', 'src/feature.ts'];
      const mockGraph = createMockGraph(files);

      // Set up reverse edges: feature.ts depends on core.ts
      mockGraph.reverseEdges.set('src/core.ts', ['src/feature.ts']);

      vi.mocked(analyzer.buildDependencyGraph).mockResolvedValue(mockGraph);
      vi.mocked(analyzer.calculateFileImportance).mockReturnValue(new Map());
      vi.mocked(analyzer.findAffectedFiles).mockReturnValue(['src/feature.ts']);

      await mediator.initializeMediator(sessionId, files, workingDir);

      const effect = mediator.analyzeRippleEffect(sessionId, 'src/core.ts');

      expect(effect).toBeDefined();
      expect(effect?.changedFile).toBe('src/core.ts');
      expect(effect?.affectedFiles.length).toBeGreaterThan(0);
    });

    it('should return null when no files are affected', async () => {
      const files = ['src/isolated.ts'];
      const mockGraph = createMockGraph(files);

      vi.mocked(analyzer.buildDependencyGraph).mockResolvedValue(mockGraph);
      vi.mocked(analyzer.calculateFileImportance).mockReturnValue(new Map());
      vi.mocked(analyzer.findAffectedFiles).mockReturnValue([]);

      await mediator.initializeMediator(sessionId, files, workingDir);

      const effect = mediator.analyzeRippleEffect(sessionId, 'src/isolated.ts');

      expect(effect).toBeNull();
    });
  });

  describe('analyzeIssueImpact', () => {
    it('should return null for non-existent session', () => {
      const impact = mediator.analyzeIssueImpact('non-existent', 'file.ts:10');
      expect(impact).toBeNull();
    });

    it('should analyze impact for issue location', async () => {
      const files = ['src/index.ts', 'src/caller.ts'];
      const mockGraph = createMockGraph(files);

      // Set up imports and reverse edges
      mockGraph.nodes.get('src/index.ts')!.imports = [
        { source: './utils', specifiers: ['helper'], isDefault: false, isDynamic: false, line: 1 }
      ];
      mockGraph.nodes.get('src/index.ts')!.functions = [
        { name: 'main', parameters: [], calls: [], line: 5, endLine: 10, isAsync: false, isExported: true }
      ];
      mockGraph.reverseEdges.set('src/index.ts', ['src/caller.ts']);

      vi.mocked(analyzer.buildDependencyGraph).mockResolvedValue(mockGraph);
      vi.mocked(analyzer.calculateFileImportance).mockReturnValue(new Map());

      await mediator.initializeMediator(sessionId, files, workingDir);

      const impact = mediator.analyzeIssueImpact(sessionId, 'src/index.ts:25');

      expect(impact).toBeDefined();
      expect(impact?.callers.length).toBeGreaterThan(0);
      expect(impact?.affectedFunctions).toContain('main');
      expect(impact?.riskLevel).toBeDefined();
      expect(impact?.summary).toContain('src/index.ts');
    });

    it('should return null for invalid location format', async () => {
      const files = ['src/index.ts'];
      const mockGraph = createMockGraph(files);

      vi.mocked(analyzer.buildDependencyGraph).mockResolvedValue(mockGraph);
      vi.mocked(analyzer.calculateFileImportance).mockReturnValue(new Map());

      await mediator.initializeMediator(sessionId, files, workingDir);

      // Empty location - no file can be extracted
      const impact = mediator.analyzeIssueImpact(sessionId, '');

      expect(impact).toBeNull();
    });

    it('should calculate correct risk level based on affected files', async () => {
      const files = ['src/core.ts'];
      const mockGraph = createMockGraph(files);

      // Create many reverse edges (many files depend on core.ts)
      const manyCallers = Array.from({ length: 12 }, (_, i) => `src/caller${i}.ts`);
      mockGraph.reverseEdges.set('src/core.ts', manyCallers);
      mockGraph.nodes.get('src/core.ts')!.functions = [];

      vi.mocked(analyzer.buildDependencyGraph).mockResolvedValue(mockGraph);
      vi.mocked(analyzer.calculateFileImportance).mockReturnValue(new Map());

      await mediator.initializeMediator(sessionId, files, workingDir);

      const impact = mediator.analyzeIssueImpact(sessionId, 'src/core.ts:1');

      // 12 callers should result in CRITICAL risk
      expect(impact?.riskLevel).toBe('CRITICAL');
      expect(impact?.totalAffectedFiles).toBeGreaterThan(10);
    });
  });
});
