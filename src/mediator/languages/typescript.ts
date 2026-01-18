/**
 * TypeScript/JavaScript Language Analyzer
 * [ENH: LANG] Extracted from analyzer.ts for plugin architecture
 */

import { LanguageAnalyzer } from './types.js';
import { ImportInfo, ExportInfo, FunctionInfo, ClassInfo } from '../types.js';

/**
 * TypeScript/JavaScript analyzer implementation
 */
export const TypeScriptAnalyzer: LanguageAnalyzer = {
  id: 'typescript',
  name: 'TypeScript/JavaScript',
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] as const,
  importResolutionExtensions: ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'] as const,

  extractImports(content: string): ImportInfo[] {
    const imports: ImportInfo[] = [];
    const lines = content.split('\n');

    // Static imports: import { x } from 'y' / import x from 'y' / import * as x from 'y'
    const staticImportRegex = /^import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\}|\*\s+as\s+(\w+))?\s*from\s*['"]([^'"]+)['"]/;
    const defaultOnlyRegex = /^import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/;
    const sideEffectRegex = /^import\s*['"]([^'"]+)['"]/;

    // Dynamic imports: import('x') or await import('x')
    const dynamicImportRegex = /(?:await\s+)?import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

    // CommonJS require
    const requireRegex = /(?:const|let|var)\s+(?:\{([^}]+)\}|(\w+))\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/;

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

      // CommonJS require
      const requireMatch = trimmed.match(requireRegex);
      if (requireMatch) {
        const namedImports = requireMatch[1];
        const defaultImport = requireMatch[2];
        const source = requireMatch[3];

        const specifiers: string[] = [];
        if (namedImports) {
          namedImports.split(',').forEach(s => {
            const name = s.trim().split(/\s*:\s*/)[0].trim();
            if (name) specifiers.push(name);
          });
        }
        if (defaultImport) specifiers.push(defaultImport);

        imports.push({
          source,
          specifiers,
          isDefault: !!defaultImport,
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
  },

  extractExports(content: string): ExportInfo[] {
    const exports: ExportInfo[] = [];
    const lines = content.split('\n');

    // export default, export const/let/var, export function, export class, export { }
    const exportDefaultRegex = /^export\s+default\s+(?:(function|class)\s+)?(\w+)?/;
    const exportNamedRegex = /^export\s+(?:const|let|var|function|class|type|interface|enum)\s+(\w+)/;
    const exportListRegex = /^export\s*\{([^}]+)\}/;
    const reExportRegex = /^export\s*(?:\{[^}]*\}|\*)\s*from\s*['"]([^'"]+)['"]/;

    // CommonJS exports
    const moduleExportsRegex = /^module\.exports\s*=\s*(?:\{([^}]+)\}|(\w+))/;
    const exportsPropertyRegex = /^exports\.(\w+)\s*=/;

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

      // CommonJS module.exports
      const moduleExportsMatch = trimmed.match(moduleExportsRegex);
      if (moduleExportsMatch) {
        if (moduleExportsMatch[1]) {
          moduleExportsMatch[1].split(',').forEach(item => {
            const name = item.trim().split(/\s*:\s*/)[0].trim();
            if (name) {
              exports.push({
                name,
                isDefault: false,
                type: 'variable',
                line: idx + 1
              });
            }
          });
        } else if (moduleExportsMatch[2]) {
          exports.push({
            name: moduleExportsMatch[2],
            isDefault: true,
            type: 'variable',
            line: idx + 1
          });
        }
      }

      // CommonJS exports.property
      const exportsPropertyMatch = trimmed.match(exportsPropertyRegex);
      if (exportsPropertyMatch) {
        exports.push({
          name: exportsPropertyMatch[1],
          isDefault: false,
          type: 'variable',
          line: idx + 1
        });
      }
    });

    return exports;
  },

  extractFunctions(content: string): FunctionInfo[] {
    const functions: FunctionInfo[] = [];
    const lines = content.split('\n');

    // function declarations, arrow functions, methods
    const functionDeclRegex = /^(export\s+)?(async\s+)?function\s+(\w+)\s*\(([^)]*)\)/;
    const arrowFunctionRegex = /^(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(async\s*)?\([^)]*\)\s*(?::\s*[^=]+)?\s*=>/;

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
          endLine: idx + 1,
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
  },

  extractClasses(content: string): ClassInfo[] {
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
  },

  isExternalImport(source: string): boolean {
    // External if not starting with . or /
    return !source.startsWith('.') && !source.startsWith('/');
  }
};

/**
 * Extract parameter names from parameter string
 */
function extractParameters(paramStr: string): string[] {
  if (!paramStr.trim()) return [];
  return paramStr.split(',').map(p => {
    const match = p.trim().match(/^(\w+)/);
    return match ? match[1] : '';
  }).filter(Boolean);
}

export default TypeScriptAnalyzer;
