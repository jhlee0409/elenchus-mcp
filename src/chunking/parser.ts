/**
 * Code Parser for Symbol Extraction
 * [ENH: CHUNK] Parses code files to extract symbols for chunking
 */

import { CodeSymbol, ParsedFile, SymbolType } from './types.js';

/**
 * Detect file language from extension
 */
export function detectLanguage(filePath: string): ParsedFile['language'] {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'py':
      return 'python';
    case 'go':
      return 'go';
    case 'rs':
      return 'rust';
    default:
      return 'unknown';
  }
}

/**
 * Estimate token count (rough approximation: ~4 chars per token)
 */
export function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

/**
 * Parse TypeScript/JavaScript file
 */
export function parseTypeScriptFile(content: string, filePath: string): ParsedFile {
  const lines = content.split('\n');
  const symbols: CodeSymbol[] = [];
  const imports: string[] = [];
  const exports: string[] = [];

  let currentSymbol: Partial<CodeSymbol> | null = null;
  let braceDepth = 0;
  let symbolBraceDepth = 0;

  // Regex patterns
  const importPattern = /^import\s+(?:.*\s+from\s+)?['"](.+)['"];?$/;
  const exportPattern = /^export\s+(?:default\s+)?(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/;
  const functionPattern = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/;
  const arrowFunctionPattern = /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::\s*\w+)?\s*=>/;
  const classPattern = /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/;
  const interfacePattern = /^(?:export\s+)?interface\s+(\w+)/;
  const typePattern = /^(?:export\s+)?type\s+(\w+)/;
  const methodPattern = /^\s+(?:async\s+)?(?:public|private|protected|static|readonly)?\s*(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{?$/;
  const constPattern = /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?\s*=/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Track brace depth
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;

    // Check imports
    const importMatch = trimmedLine.match(importPattern);
    if (importMatch) {
      imports.push(importMatch[1]);
      continue;
    }

    // Check exports
    const exportMatch = trimmedLine.match(exportPattern);
    if (exportMatch) {
      exports.push(exportMatch[1]);
    }

    // If we're tracking a symbol, continue until it closes
    if (currentSymbol && currentSymbol.startLine !== undefined) {
      braceDepth += openBraces - closeBraces;

      if (braceDepth <= symbolBraceDepth && closeBraces > 0) {
        // Symbol ended
        currentSymbol.endLine = i + 1;
        currentSymbol.content = lines.slice(currentSymbol.startLine - 1, i + 1).join('\n');
        currentSymbol.tokenCount = estimateTokens(currentSymbol.content);

        symbols.push(currentSymbol as CodeSymbol);
        currentSymbol = null;
      }
      continue;
    }

    // Try to match new symbols
    let match: RegExpMatchArray | null;
    let type: SymbolType | null = null;
    let name: string | null = null;

    if ((match = trimmedLine.match(functionPattern))) {
      type = 'function';
      name = match[1];
    } else if ((match = trimmedLine.match(arrowFunctionPattern))) {
      type = 'function';
      name = match[1];
    } else if ((match = trimmedLine.match(classPattern))) {
      type = 'class';
      name = match[1];
    } else if ((match = trimmedLine.match(interfacePattern))) {
      type = 'interface';
      name = match[1];
    } else if ((match = trimmedLine.match(typePattern))) {
      type = 'type';
      name = match[1];
    } else if ((match = trimmedLine.match(constPattern))) {
      type = 'constant';
      name = match[1];
    }

    if (type && name) {
      symbolBraceDepth = braceDepth;
      braceDepth += openBraces - closeBraces;

      currentSymbol = {
        name,
        type,
        startLine: i + 1,
        isExported: trimmedLine.startsWith('export'),
        signature: trimmedLine.replace(/\{.*$/, '').trim()
      };

      // Handle single-line definitions
      if (openBraces === closeBraces && !trimmedLine.includes('{')) {
        // Find the end of the statement
        let endLine = i;
        while (endLine < lines.length && !lines[endLine].includes(';')) {
          endLine++;
        }
        currentSymbol.endLine = endLine + 1;
        currentSymbol.content = lines.slice(i, endLine + 1).join('\n');
        currentSymbol.tokenCount = estimateTokens(currentSymbol.content);
        symbols.push(currentSymbol as CodeSymbol);
        currentSymbol = null;
      }
    }

    // Update brace depth if not tracking a symbol
    if (!currentSymbol) {
      braceDepth += openBraces - closeBraces;
    }
  }

  return {
    path: filePath,
    language: 'typescript',
    symbols,
    imports,
    exports,
    totalLines: lines.length,
    totalTokens: estimateTokens(content)
  };
}

/**
 * Parse Python file
 */
export function parsePythonFile(content: string, filePath: string): ParsedFile {
  const lines = content.split('\n');
  const symbols: CodeSymbol[] = [];
  const imports: string[] = [];
  const exports: string[] = [];

  // Regex patterns
  const importPattern = /^(?:from\s+(\S+)\s+)?import\s+(.+)$/;
  const functionPattern = /^(?:async\s+)?def\s+(\w+)\s*\(/;
  const classPattern = /^class\s+(\w+)/;

  let currentSymbol: Partial<CodeSymbol> | null = null;
  let baseIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    const indent = line.search(/\S/);

    // Skip empty lines
    if (!trimmedLine) continue;

    // Check imports
    const importMatch = trimmedLine.match(importPattern);
    if (importMatch) {
      imports.push(importMatch[1] || importMatch[2]);
      continue;
    }

    // If tracking a symbol, check if it ended
    if (currentSymbol && currentSymbol.startLine !== undefined) {
      if (indent <= baseIndent && trimmedLine && !trimmedLine.startsWith('#')) {
        // Symbol ended
        currentSymbol.endLine = i;
        currentSymbol.content = lines.slice(currentSymbol.startLine - 1, i).join('\n');
        currentSymbol.tokenCount = estimateTokens(currentSymbol.content);
        symbols.push(currentSymbol as CodeSymbol);
        currentSymbol = null;
      }
    }

    // Try to match new symbols
    let match: RegExpMatchArray | null;

    if ((match = trimmedLine.match(functionPattern))) {
      if (currentSymbol) {
        currentSymbol.endLine = i;
        currentSymbol.content = lines.slice(currentSymbol.startLine! - 1, i).join('\n');
        currentSymbol.tokenCount = estimateTokens(currentSymbol.content);
        symbols.push(currentSymbol as CodeSymbol);
      }

      currentSymbol = {
        name: match[1],
        type: 'function',
        startLine: i + 1,
        isExported: !match[1].startsWith('_'),
        signature: trimmedLine.split(':')[0]
      };
      baseIndent = indent;
    } else if ((match = trimmedLine.match(classPattern))) {
      if (currentSymbol) {
        currentSymbol.endLine = i;
        currentSymbol.content = lines.slice(currentSymbol.startLine! - 1, i).join('\n');
        currentSymbol.tokenCount = estimateTokens(currentSymbol.content);
        symbols.push(currentSymbol as CodeSymbol);
      }

      currentSymbol = {
        name: match[1],
        type: 'class',
        startLine: i + 1,
        isExported: !match[1].startsWith('_'),
        signature: trimmedLine.split(':')[0]
      };
      baseIndent = indent;
    }
  }

  // Don't forget the last symbol
  if (currentSymbol && currentSymbol.startLine !== undefined) {
    currentSymbol.endLine = lines.length;
    currentSymbol.content = lines.slice(currentSymbol.startLine - 1).join('\n');
    currentSymbol.tokenCount = estimateTokens(currentSymbol.content);
    symbols.push(currentSymbol as CodeSymbol);
  }

  return {
    path: filePath,
    language: 'python',
    symbols,
    imports,
    exports,
    totalLines: lines.length,
    totalTokens: estimateTokens(content)
  };
}

/**
 * Parse file based on detected language
 */
export function parseFile(content: string, filePath: string): ParsedFile {
  const language = detectLanguage(filePath);

  switch (language) {
    case 'typescript':
    case 'javascript':
      return parseTypeScriptFile(content, filePath);
    case 'python':
      return parsePythonFile(content, filePath);
    default:
      // For unknown languages, treat the whole file as one symbol
      return {
        path: filePath,
        language,
        symbols: [{
          name: filePath.split('/').pop() || 'file',
          type: 'function',
          startLine: 1,
          endLine: content.split('\n').length,
          content,
          tokenCount: estimateTokens(content)
        }],
        imports: [],
        exports: [],
        totalLines: content.split('\n').length,
        totalTokens: estimateTokens(content)
      };
  }
}

/**
 * Extract dependencies from a symbol's content
 */
export function extractDependencies(symbol: CodeSymbol, allSymbols: CodeSymbol[]): string[] {
  const deps: string[] = [];
  const symbolNames = allSymbols.map(s => s.name);

  for (const name of symbolNames) {
    if (name !== symbol.name) {
      // Check if this symbol references the other
      const regex = new RegExp(`\\b${name}\\b`, 'g');
      if (regex.test(symbol.content)) {
        deps.push(name);
      }
    }
  }

  return deps;
}
