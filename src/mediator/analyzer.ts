/**
 * Code Relationship Analyzer - Static analysis based code relationship extraction
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  DependencyNode,
  DependencyGraph,
  DependencyEdge,
  ImportInfo,
  ExportInfo,
  FunctionInfo,
  ClassInfo
} from './types.js';

// =============================================================================
// Main Analysis Functions
// =============================================================================

/**
 * Extract dependency node from file
 */
export async function analyzeFile(filePath: string): Promise<DependencyNode | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const ext = path.extname(filePath);

    if (!['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(ext)) {
      return null;
    }

    return {
      path: filePath,
      imports: extractImports(content),
      exports: extractExports(content),
      functions: extractFunctions(content),
      classes: extractClasses(content)
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
 * Build full dependency graph from directory
 */
export async function buildDependencyGraph(
  files: string[],
  workingDir: string
): Promise<DependencyGraph> {
  const nodes = new Map<string, DependencyNode>();
  const edges: DependencyEdge[] = [];
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

        // Reverse edge
        const existing = reverseEdges.get(resolvedPath) || [];
        existing.push(filePath);
        reverseEdges.set(resolvedPath, existing);
      }
    }
  }

  return { nodes, edges, reverseEdges };
}

// =============================================================================
// Import Analysis
// =============================================================================

function extractImports(content: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const lines = content.split('\n');

  // Static imports: import { x } from 'y' / import x from 'y' / import * as x from 'y'
  const staticImportRegex = /^import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\}|\*\s+as\s+(\w+))?\s*from\s*['"]([^'"]+)['"]/;
  const defaultOnlyRegex = /^import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/;
  const sideEffectRegex = /^import\s*['"]([^'"]+)['"]/;

  // Dynamic imports: import('x') or await import('x')
  const dynamicImportRegex = /(?:await\s+)?import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    // Static import with specifiers
    const staticMatch = trimmed.match(staticImportRegex);
    if (staticMatch) {
      const defaultImport = staticMatch[1];
      const namedImports = staticMatch[2];
      const namespaceImport = staticMatch[3];
      const source = staticMatch[4];

      const specifiers: string[] = [];
      if (defaultImport) specifiers.push(defaultImport);
      if (namedImports) {
        namedImports.split(',').forEach(s => {
          const name = s.trim().split(/\s+as\s+/)[0].trim();
          if (name) specifiers.push(name);
        });
      }
      if (namespaceImport) specifiers.push(`* as ${namespaceImport}`);

      imports.push({
        source,
        specifiers,
        isDefault: !!defaultImport && !namedImports,
        isDynamic: false,
        line: idx + 1
      });
      return;
    }

    // Default only import
    const defaultMatch = trimmed.match(defaultOnlyRegex);
    if (defaultMatch) {
      imports.push({
        source: defaultMatch[2],
        specifiers: [defaultMatch[1]],
        isDefault: true,
        isDynamic: false,
        line: idx + 1
      });
      return;
    }

    // Side effect import
    const sideEffectMatch = trimmed.match(sideEffectRegex);
    if (sideEffectMatch && !trimmed.includes('from')) {
      imports.push({
        source: sideEffectMatch[1],
        specifiers: [],
        isDefault: false,
        isDynamic: false,
        line: idx + 1
      });
    }

    // Dynamic imports
    let dynamicMatch;
    while ((dynamicMatch = dynamicImportRegex.exec(line)) !== null) {
      imports.push({
        source: dynamicMatch[1],
        specifiers: [],
        isDefault: false,
        isDynamic: true,
        line: idx + 1
      });
    }
  });

  return imports;
}

// =============================================================================
// Export Analysis
// =============================================================================

function extractExports(content: string): ExportInfo[] {
  const exports: ExportInfo[] = [];
  const lines = content.split('\n');

  // export default, export const/let/var, export function, export class, export { }
  const exportDefaultRegex = /^export\s+default\s+(?:(function|class)\s+)?(\w+)?/;
  const exportNamedRegex = /^export\s+(?:const|let|var|function|class|type|interface|enum)\s+(\w+)/;
  const exportListRegex = /^export\s*\{([^}]+)\}/;
  const reExportRegex = /^export\s*(?:\{[^}]*\}|\*)\s*from\s*['"]([^'"]+)['"]/;

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    // Re-export
    if (reExportRegex.test(trimmed)) {
      exports.push({
        name: '*',
        isDefault: false,
        type: 're-export',
        line: idx + 1
      });
      return;
    }

    // Export default
    const defaultMatch = trimmed.match(exportDefaultRegex);
    if (defaultMatch) {
      const type = defaultMatch[1] as 'function' | 'class' | undefined;
      exports.push({
        name: defaultMatch[2] || 'default',
        isDefault: true,
        type: type || 'variable',
        line: idx + 1
      });
      return;
    }

    // Named export
    const namedMatch = trimmed.match(exportNamedRegex);
    if (namedMatch) {
      let type: ExportInfo['type'] = 'variable';
      if (trimmed.includes('function')) type = 'function';
      else if (trimmed.includes('class')) type = 'class';
      else if (trimmed.includes('type') || trimmed.includes('interface')) type = 'type';

      exports.push({
        name: namedMatch[1],
        isDefault: false,
        type,
        line: idx + 1
      });
      return;
    }

    // Export list
    const listMatch = trimmed.match(exportListRegex);
    if (listMatch) {
      listMatch[1].split(',').forEach(item => {
        const name = item.trim().split(/\s+as\s+/)[0].trim();
        if (name) {
          exports.push({
            name,
            isDefault: false,
            type: 'variable',
            line: idx + 1
          });
        }
      });
    }
  });

  return exports;
}

// =============================================================================
// Function Analysis
// =============================================================================

function extractFunctions(content: string): FunctionInfo[] {
  const functions: FunctionInfo[] = [];
  const lines = content.split('\n');

  // function declarations, arrow functions, methods
  const functionDeclRegex = /^(export\s+)?(async\s+)?function\s+(\w+)\s*\(([^)]*)\)/;
  const arrowFunctionRegex = /^(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(async\s*)?\([^)]*\)\s*(?::\s*[^=]+)?\s*=>/;
  const methodRegex = /^\s*(async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/;

  let currentFunction: Partial<FunctionInfo> | null = null;
  let braceCount = 0;
  let inFunction = false;

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    // Function declaration
    const declMatch = trimmed.match(functionDeclRegex);
    if (declMatch) {
      if (currentFunction && currentFunction.name) {
        currentFunction.endLine = idx;
        functions.push(currentFunction as FunctionInfo);
      }

      currentFunction = {
        name: declMatch[3],
        line: idx + 1,
        isAsync: !!declMatch[2],
        isExported: !!declMatch[1],
        parameters: extractParameters(declMatch[4]),
        calls: []
      };
      braceCount = 0;
      inFunction = true;
    }

    // Arrow function
    const arrowMatch = trimmed.match(arrowFunctionRegex);
    if (arrowMatch) {
      functions.push({
        name: arrowMatch[3],
        line: idx + 1,
        endLine: idx + 1,  // Will be updated
        isAsync: !!arrowMatch[4],
        isExported: !!arrowMatch[1],
        parameters: [],
        calls: []
      });
    }

    // Track braces for function end
    if (inFunction && currentFunction) {
      braceCount += (line.match(/\{/g) || []).length;
      braceCount -= (line.match(/\}/g) || []).length;

      // Extract function calls within
      const callMatches = line.matchAll(/(\w+)\s*\(/g);
      for (const match of callMatches) {
        const callName = match[1];
        if (!['if', 'for', 'while', 'switch', 'catch', 'function'].includes(callName)) {
          if (!currentFunction.calls) currentFunction.calls = [];
          if (!currentFunction.calls.includes(callName)) {
            currentFunction.calls.push(callName);
          }
        }
      }

      if (braceCount === 0) {
        currentFunction.endLine = idx + 1;
        functions.push(currentFunction as FunctionInfo);
        currentFunction = null;
        inFunction = false;
      }
    }
  });

  return functions;
}

function extractParameters(paramStr: string): string[] {
  if (!paramStr.trim()) return [];
  return paramStr.split(',').map(p => {
    const match = p.trim().match(/^(\w+)/);
    return match ? match[1] : '';
  }).filter(Boolean);
}

// =============================================================================
// Class Analysis
// =============================================================================

function extractClasses(content: string): ClassInfo[] {
  const classes: ClassInfo[] = [];
  const lines = content.split('\n');

  const classRegex = /^(export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?\s*\{/;

  let currentClass: Partial<ClassInfo> | null = null;
  let braceCount = 0;
  let inClass = false;

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    const classMatch = trimmed.match(classRegex);
    if (classMatch) {
      if (currentClass && currentClass.name) {
        currentClass.endLine = idx;
        classes.push(currentClass as ClassInfo);
      }

      currentClass = {
        name: classMatch[2],
        line: idx + 1,
        isExported: !!classMatch[1],
        extends: classMatch[3],
        implements: classMatch[4]?.split(',').map(s => s.trim()),
        methods: []
      };
      braceCount = 0;
      inClass = true;
    }

    if (inClass && currentClass) {
      braceCount += (line.match(/\{/g) || []).length;
      braceCount -= (line.match(/\}/g) || []).length;

      // Extract method names
      const methodMatch = trimmed.match(/^\s*(async\s+)?(\w+)\s*\([^)]*\)/);
      if (methodMatch && methodMatch[2] !== 'constructor') {
        if (!currentClass.methods) currentClass.methods = [];
        currentClass.methods.push(methodMatch[2]);
      }

      if (braceCount === 0) {
        currentClass.endLine = idx + 1;
        classes.push(currentClass as ClassInfo);
        currentClass = null;
        inClass = false;
      }
    }
  });

  return classes;
}

// =============================================================================
// Path Resolution
// =============================================================================

function resolveImportPath(
  source: string,
  fromFile: string,
  workingDir: string,
  availableFiles: string[]
): string | null {
  // Skip node_modules / external packages
  if (!source.startsWith('.') && !source.startsWith('/')) {
    return null;
  }

  const fromDir = path.dirname(fromFile);
  let resolved: string;

  if (source.startsWith('/')) {
    resolved = path.join(workingDir, source);
  } else {
    resolved = path.resolve(fromDir, source);
  }

  // Try extensions
  const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];
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
 */
export function findAffectedFiles(
  changedFile: string,
  graph: DependencyGraph,
  depth: number = 3
): string[] {
  const affected = new Set<string>();
  const queue: Array<{ file: string; currentDepth: number }> = [
    { file: changedFile, currentDepth: 0 }
  ];

  while (queue.length > 0) {
    const { file, currentDepth } = queue.shift()!;

    if (currentDepth >= depth) continue;

    const dependents = graph.reverseEdges.get(file) || [];
    for (const dep of dependents) {
      if (!affected.has(dep)) {
        affected.add(dep);
        queue.push({ file: dep, currentDepth: currentDepth + 1 });
      }
    }
  }

  return Array.from(affected);
}

/**
 * Find dependency path between two files
 */
export function findDependencyPath(
  from: string,
  to: string,
  graph: DependencyGraph
): string[] | null {
  const visited = new Set<string>();
  const queue: Array<{ file: string; path: string[] }> = [
    { file: from, path: [from] }
  ];

  while (queue.length > 0) {
    const { file, path: currentPath } = queue.shift()!;

    if (file === to) return currentPath;
    if (visited.has(file)) continue;
    visited.add(file);

    const node = graph.nodes.get(file);
    if (!node) continue;

    for (const imp of node.imports) {
      const resolved = graph.edges.find(e => e.from === file)?.to;
      if (resolved && !visited.has(resolved)) {
        queue.push({ file: resolved, path: [...currentPath, resolved] });
      }
    }
  }

  return null;
}

/**
 * Detect circular dependencies
 */
export function detectCircularDependencies(graph: DependencyGraph): string[][] {
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

    const edges = graph.edges.filter(e => e.from === node);
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
