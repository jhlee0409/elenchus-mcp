/**
 * Code Relationship Analyzer - Static analysis based code relationship extraction
 * [ENH: LANG] Refactored for language-agnostic analysis with plugin support
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  DependencyNode,
  DependencyGraph,
  DependencyEdge
} from './types.js';
import { Deque } from '../utils/data-structures.js';
import {
  languageRegistry,
  detectLanguage
} from './languages/index.js';

// =============================================================================
// Main Analysis Functions
// =============================================================================

/**
 * Extract dependency node from file
 * [ENH: LANG] Now uses language registry for multi-language support
 * Always returns a valid DependencyNode (empty arrays for unsupported languages)
 */
export async function analyzeFile(filePath: string): Promise<DependencyNode | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');

    // Detect language and get appropriate analyzer
    const detection = detectLanguage(filePath);

    if (!detection.detected || !detection.analyzer) {
      // Unsupported language: return valid but empty node
      // This ensures file is tracked in dependency graph even without analysis
      return {
        path: filePath,
        imports: [],
        exports: [],
        functions: [],
        classes: []
      };
    }

    const analyzer = detection.analyzer;

    return {
      path: filePath,
      imports: analyzer.extractImports(content),
      exports: analyzer.extractExports(content),
      functions: analyzer.extractFunctions(content),
      classes: analyzer.extractClasses(content)
    };
  } catch (error) {
    // [FIX: REL-01] Log unexpected errors (not ENOENT)
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`[Elenchus] Failed to analyze file: ${filePath}`, error);
    }
    return null;
  }
}

/**
 * Get supported file extensions from all registered analyzers
 */
export function getSupportedExtensions(): string[] {
  return languageRegistry.getSupportedExtensions();
}

/**
 * Get language analyzer statistics
 */
export function getLanguageStats() {
  return languageRegistry.getStats();
}

/**
 * Build full dependency graph from directory
 */
export async function buildDependencyGraph(
  files: string[],
  workingDir: string
): Promise<DependencyGraph> {
  const nodes = new Map<string, DependencyNode>();
  const edges: DependencyEdge[] = [];
  // [ENH: ALGO] Adjacency list for O(1) outgoing edge lookup
  const outgoingEdges = new Map<string, DependencyEdge[]>();
  const reverseEdges = new Map<string, string[]>();

  // 1. Analyze all files
  for (const file of files) {
    const node = await analyzeFile(file);
    if (node) {
      nodes.set(file, node);
    }
  }

  // 2. Create edges
  for (const [filePath, node] of nodes) {
    for (const imp of node.imports) {
      const resolvedPath = resolveImportPath(imp.source, filePath, workingDir, files);
      if (resolvedPath) {
        const edge: DependencyEdge = {
          from: filePath,
          to: resolvedPath,
          type: imp.isDynamic ? 'dynamic-import' : 'import',
          specifiers: imp.specifiers
        };
        edges.push(edge);

        // [ENH: ALGO] Build outgoing edges adjacency list
        if (!outgoingEdges.has(filePath)) {
          outgoingEdges.set(filePath, []);
        }
        outgoingEdges.get(filePath)!.push(edge);

        // Reverse edge
        const existing = reverseEdges.get(resolvedPath) || [];
        existing.push(filePath);
        reverseEdges.set(resolvedPath, existing);
      }
    }
  }

  return { nodes, edges, outgoingEdges, reverseEdges };
}

// =============================================================================
// Path Resolution
// =============================================================================

/**
 * Resolve import path using language-specific resolution
 * [ENH: LANG] Now uses language analyzer for resolution extensions
 */
function resolveImportPath(
  source: string,
  fromFile: string,
  workingDir: string,
  availableFiles: string[]
): string | null {
  // Get analyzer for the source file to determine resolution rules
  const analyzer = languageRegistry.getAnalyzerForFile(fromFile);

  // Check if external import (skip dependency tracking)
  if (analyzer?.isExternalImport(source)) {
    return null;
  }

  // Fallback for unsupported languages: skip non-relative imports
  if (!analyzer && !source.startsWith('.') && !source.startsWith('/')) {
    return null;
  }

  const fromDir = path.dirname(fromFile);
  let resolved: string;

  if (source.startsWith('/')) {
    resolved = path.join(workingDir, source);
  } else {
    resolved = path.resolve(fromDir, source);
  }

  // Get resolution extensions from analyzer or use defaults
  const extensions = analyzer?.importResolutionExtensions || ['', '.js', '.ts', '/index.js', '/index.ts'];

  // Try extensions
  for (const ext of extensions) {
    const tryPath = resolved + ext;
    if (availableFiles.includes(tryPath)) {
      return tryPath;
    }
  }

  return null;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Find files affected when a specific file changes
 * [ENH: ALGO] Uses Deque for O(1) dequeue instead of O(n) Array.shift()
 */
export function findAffectedFiles(
  changedFile: string,
  graph: DependencyGraph,
  depth: number = 3
): string[] {
  const affected = new Set<string>();
  // [ENH: ALGO] Use Deque for O(1) operations instead of O(n) Array.shift()
  const queue = new Deque<{ file: string; currentDepth: number }>();
  queue.pushBack({ file: changedFile, currentDepth: 0 });

  while (!queue.isEmpty()) {
    const item = queue.popFront()!;
    const { file, currentDepth } = item;

    if (currentDepth >= depth) continue;

    const dependents = graph.reverseEdges.get(file) || [];
    for (const dep of dependents) {
      if (!affected.has(dep)) {
        affected.add(dep);
        queue.pushBack({ file: dep, currentDepth: currentDepth + 1 });
      }
    }
  }

  return Array.from(affected);
}

/**
 * Find dependency path between two files
 * [ENH: ALGO] Uses Deque for O(1) dequeue and outgoingEdges for O(1) edge lookup
 */
export function findDependencyPath(
  from: string,
  to: string,
  graph: DependencyGraph
): string[] | null {
  const visited = new Set<string>();
  // [ENH: ALGO] Use Deque for O(1) operations
  const queue = new Deque<{ file: string; path: string[] }>();
  queue.pushBack({ file: from, path: [from] });

  while (!queue.isEmpty()) {
    const item = queue.popFront()!;
    const { file, path: currentPath } = item;

    if (file === to) return currentPath;
    if (visited.has(file)) continue;
    visited.add(file);

    // [ENH: ALGO] Use outgoingEdges Map for O(1) lookup instead of O(E) filter
    const edges = graph.outgoingEdges.get(file) || [];
    for (const edge of edges) {
      if (!visited.has(edge.to)) {
        queue.pushBack({ file: edge.to, path: [...currentPath, edge.to] });
      }
    }
  }

  return null;
}

/**
 * Detect circular dependencies using Tarjan's SCC Algorithm
 * [ENH: ALGO] O(V+E) instead of O(V*E) - finds all strongly connected components
 * Each SCC with more than one node represents a cycle
 */
export function detectCircularDependencies(graph: DependencyGraph): string[][] {
  // Tarjan's SCC Algorithm
  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const sccs: string[][] = [];

  function strongConnect(v: string): void {
    // Set the depth index for v to the smallest unused index
    indices.set(v, index);
    lowLinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    // Consider successors of v using O(1) adjacency list lookup
    const edges = graph.outgoingEdges.get(v) || [];
    for (const edge of edges) {
      const w = edge.to;
      if (!indices.has(w)) {
        // Successor w has not yet been visited; recurse on it
        strongConnect(w);
        lowLinks.set(v, Math.min(lowLinks.get(v)!, lowLinks.get(w)!));
      } else if (onStack.has(w)) {
        // Successor w is in stack and hence in the current SCC
        // If w is not on stack, then (v, w) is an edge pointing to an SCC already found
        lowLinks.set(v, Math.min(lowLinks.get(v)!, indices.get(w)!));
      }
    }

    // If v is a root node, pop the stack and generate an SCC
    if (lowLinks.get(v) === indices.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);

      // Only include SCCs with more than one node (actual cycles)
      if (scc.length > 1) {
        sccs.push(scc);
      }
    }
  }

  // Visit all nodes
  for (const v of graph.nodes.keys()) {
    if (!indices.has(v)) {
      strongConnect(v);
    }
  }

  return sccs;
}

/**
 * [ENH: ALGO] Legacy cycle detection - kept for compatibility
 * Use detectCircularDependencies (Tarjan's) for better performance
 */
export function detectCircularDependenciesLegacy(graph: DependencyGraph): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(node: string, path: string[]): void {
    if (recursionStack.has(node)) {
      const cycleStart = path.indexOf(node);
      cycles.push(path.slice(cycleStart));
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    recursionStack.add(node);

    // [ENH: ALGO] Use outgoingEdges for O(1) lookup
    const edges = graph.outgoingEdges.get(node) || [];
    for (const edge of edges) {
      dfs(edge.to, [...path, edge.to]);
    }

    recursionStack.delete(node);
  }

  for (const file of graph.nodes.keys()) {
    dfs(file, [file]);
  }

  return cycles;
}

/**
 * Calculate file importance (more references = more important)
 */
export function calculateFileImportance(graph: DependencyGraph): Map<string, number> {
  const importance = new Map<string, number>();

  for (const file of graph.nodes.keys()) {
    const dependents = graph.reverseEdges.get(file) || [];
    const exports = graph.nodes.get(file)?.exports.length || 0;

    // score = dependent files * 2 + exports count
    const score = dependents.length * 2 + exports;
    importance.set(file, score);
  }

  return importance;
}
