/**
 * Tree-sitter Based Language Analyzer
 * [ENH: TREE-SITTER] Multi-language analyzer using tree-sitter WASM
 */

import { LanguageAnalyzer } from '../types.js';
import { ImportInfo, ExportInfo, FunctionInfo, ClassInfo } from '../../types.js';
import {
  parseCodeSync,
  isTreeSitterLanguageSupported,
  isTreeSitterReady,
  isLanguageLoaded,
  preloadLanguages,
  getLanguageIdFromPath,
  EXTENSION_LANGUAGE_MAP
} from './index.js';
import {
  extractTsImports,
  extractTsExports,
  extractTsFunctions,
  extractTsClasses,
  extractPythonImports,
  extractPythonFunctions,
  extractPythonClasses,
  extractGoImports,
  extractGoFunctions,
  extractGoClasses,
  extractRustImports,
  extractRustFunctions,
  extractRustClasses,
  extractGenericImports,
  extractGenericFunctions,
  extractGenericClasses
} from './extractors.js';

/**
 * Initialize tree-sitter analyzers by pre-loading common languages
 * Call this at server startup for best performance
 */
export async function initTreeSitterAnalyzers(): Promise<void> {
  // Pre-load common languages
  const commonLanguages = ['typescript', 'tsx', 'javascript', 'python', 'go', 'rust'];
  await preloadLanguages(commonLanguages);
}

/**
 * Create a tree-sitter based language analyzer
 */
function createTreeSitterAnalyzer(
  id: string,
  name: string,
  extensions: readonly string[],
  importResolutionExtensions: readonly string[],
  isExternalFn: (source: string) => boolean
): LanguageAnalyzer {
  // Get extractor functions based on language
  const getExtractors = () => {
    switch (id) {
      case 'typescript':
      case 'tsx':
      case 'javascript':
        return {
          imports: extractTsImports,
          exports: extractTsExports,
          functions: extractTsFunctions,
          classes: extractTsClasses
        };
      case 'python':
        return {
          imports: extractPythonImports,
          exports: () => [] as ExportInfo[], // Python doesn't have explicit exports
          functions: extractPythonFunctions,
          classes: extractPythonClasses
        };
      case 'go':
        return {
          imports: extractGoImports,
          exports: () => [] as ExportInfo[], // Go uses capitalization for exports
          functions: extractGoFunctions,
          classes: extractGoClasses
        };
      case 'rust':
        return {
          imports: extractRustImports,
          exports: () => [] as ExportInfo[], // Rust uses pub keyword
          functions: extractRustFunctions,
          classes: extractRustClasses
        };
      default:
        return {
          imports: extractGenericImports,
          exports: () => [] as ExportInfo[],
          functions: extractGenericFunctions,
          classes: extractGenericClasses
        };
    }
  };

  const extractors = getExtractors();

  return {
    id,
    name,
    extensions,
    importResolutionExtensions,

    extractImports(content: string): ImportInfo[] {
      try {
        if (!isTreeSitterReady() || !isLanguageLoaded(id)) {
          return [];
        }
        const tree = parseCodeSync(content, id);
        if (!tree) return [];
        return extractors.imports(tree);
      } catch {
        return [];
      }
    },

    extractExports(content: string): ExportInfo[] {
      try {
        if (!isTreeSitterReady() || !isLanguageLoaded(id)) {
          return [];
        }
        const tree = parseCodeSync(content, id);
        if (!tree) return [];
        return extractors.exports(tree);
      } catch {
        return [];
      }
    },

    extractFunctions(content: string): FunctionInfo[] {
      try {
        if (!isTreeSitterReady() || !isLanguageLoaded(id)) {
          return [];
        }
        const tree = parseCodeSync(content, id);
        if (!tree) return [];
        return extractors.functions(tree);
      } catch {
        return [];
      }
    },

    extractClasses(content: string): ClassInfo[] {
      try {
        if (!isTreeSitterReady() || !isLanguageLoaded(id)) {
          return [];
        }
        const tree = parseCodeSync(content, id);
        if (!tree) return [];
        return extractors.classes(tree);
      } catch {
        return [];
      }
    },

    isExternalImport(source: string): boolean {
      return isExternalFn(source);
    }
  };
}

/**
 * External import detection for different languages
 */
const isExternalImportTs = (source: string): boolean => {
  // Not relative path = external
  return !source.startsWith('.') && !source.startsWith('/');
};

const isExternalImportPython = (source: string): boolean => {
  // Standard library and pip packages
  const stdLibModules = new Set([
    'os', 'sys', 'json', 'typing', 'collections', 'functools', 'itertools',
    'pathlib', 'datetime', 'logging', 're', 'math', 'random', 'time', 'asyncio',
    'subprocess', 'threading', 'multiprocessing', 'unittest', 'abc', 'enum',
    'dataclasses', 'contextlib', 'copy', 'io', 'pickle', 'sqlite3', 'http',
    'urllib', 'socket', 'ssl', 'email', 'html', 'xml', 'argparse', 'configparser',
    'csv', 'tempfile', 'shutil', 'glob', 'hashlib', 'hmac', 'secrets', 'base64',
    'struct', 'codecs', 'locale', 'gettext', 'traceback', 'warnings', 'inspect',
    'dis', 'gc', 'weakref', 'types', 'operator'
  ]);

  const moduleName = source.split('.')[0];
  return stdLibModules.has(moduleName) || !source.startsWith('.');
};

const isExternalImportGo = (source: string): boolean => {
  // Standard library doesn't have a domain
  // External packages usually have a domain (github.com, golang.org, etc.)
  const stdLibPrefixes = [
    'archive', 'bufio', 'bytes', 'compress', 'container', 'context', 'crypto',
    'database', 'debug', 'embed', 'encoding', 'errors', 'expvar', 'flag', 'fmt',
    'go', 'hash', 'html', 'image', 'index', 'io', 'log', 'math', 'mime', 'net',
    'os', 'path', 'plugin', 'reflect', 'regexp', 'runtime', 'sort', 'strconv',
    'strings', 'sync', 'syscall', 'testing', 'text', 'time', 'unicode', 'unsafe'
  ];

  const firstPart = source.split('/')[0];
  return stdLibPrefixes.includes(firstPart) || source.includes('.');
};

const isExternalImportRust = (source: string): boolean => {
  // Crates start with crate name, external ones aren't 'crate::', 'self::', or 'super::'
  return !source.startsWith('crate::') &&
         !source.startsWith('self::') &&
         !source.startsWith('super::');
};

const isExternalImportGeneric = (source: string): boolean => {
  // Default: relative paths are internal
  return !source.startsWith('.') && !source.startsWith('/');
};

/**
 * Pre-built tree-sitter analyzers for supported languages
 */
export const treeSitterAnalyzers: Record<string, LanguageAnalyzer> = {
  typescript: createTreeSitterAnalyzer(
    'typescript',
    'TypeScript',
    ['.ts'],
    ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'],
    isExternalImportTs
  ),

  tsx: createTreeSitterAnalyzer(
    'tsx',
    'TypeScript JSX',
    ['.tsx'],
    ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'],
    isExternalImportTs
  ),

  javascript: createTreeSitterAnalyzer(
    'javascript',
    'JavaScript',
    ['.js', '.jsx', '.mjs', '.cjs'],
    ['', '.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.jsx'],
    isExternalImportTs
  ),

  python: createTreeSitterAnalyzer(
    'python',
    'Python',
    ['.py', '.pyw'],
    ['', '.py', '/__init__.py'],
    isExternalImportPython
  ),

  go: createTreeSitterAnalyzer(
    'go',
    'Go',
    ['.go'],
    ['', '.go'],
    isExternalImportGo
  ),

  rust: createTreeSitterAnalyzer(
    'rust',
    'Rust',
    ['.rs'],
    ['', '.rs', '/mod.rs', '/lib.rs'],
    isExternalImportRust
  ),

  java: createTreeSitterAnalyzer(
    'java',
    'Java',
    ['.java'],
    ['', '.java'],
    isExternalImportGeneric
  ),

  c: createTreeSitterAnalyzer(
    'c',
    'C',
    ['.c', '.h'],
    ['', '.c', '.h'],
    isExternalImportGeneric
  ),

  cpp: createTreeSitterAnalyzer(
    'cpp',
    'C++',
    ['.cpp', '.cc', '.cxx', '.hpp', '.hxx'],
    ['', '.cpp', '.hpp', '.h'],
    isExternalImportGeneric
  ),

  csharp: createTreeSitterAnalyzer(
    'csharp',
    'C#',
    ['.cs'],
    ['', '.cs'],
    isExternalImportGeneric
  ),

  ruby: createTreeSitterAnalyzer(
    'ruby',
    'Ruby',
    ['.rb'],
    ['', '.rb'],
    isExternalImportGeneric
  ),

  php: createTreeSitterAnalyzer(
    'php',
    'PHP',
    ['.php'],
    ['', '.php'],
    isExternalImportGeneric
  ),

  bash: createTreeSitterAnalyzer(
    'bash',
    'Bash',
    ['.sh', '.bash', '.zsh'],
    ['', '.sh'],
    isExternalImportGeneric
  ),

  css: createTreeSitterAnalyzer(
    'css',
    'CSS',
    ['.css'],
    ['', '.css'],
    isExternalImportGeneric
  ),

  powershell: createTreeSitterAnalyzer(
    'powershell',
    'PowerShell',
    ['.ps1'],
    ['', '.ps1'],
    isExternalImportGeneric
  )
};

/**
 * Get a tree-sitter analyzer for a file path
 */
export function getTreeSitterAnalyzerForPath(filePath: string): LanguageAnalyzer | null {
  const languageId = getLanguageIdFromPath(filePath);
  if (!languageId) return null;

  return treeSitterAnalyzers[languageId] || null;
}

/**
 * Get a tree-sitter analyzer by language ID
 */
export function getTreeSitterAnalyzerById(languageId: string): LanguageAnalyzer | null {
  return treeSitterAnalyzers[languageId] || null;
}

/**
 * Check if tree-sitter supports a given file extension
 */
export function isTreeSitterSupportedExtension(extension: string): boolean {
  return extension in EXTENSION_LANGUAGE_MAP;
}

/**
 * Get all tree-sitter supported extensions
 */
export function getTreeSitterSupportedExtensions(): string[] {
  return Object.keys(EXTENSION_LANGUAGE_MAP);
}

/**
 * Export for re-export
 */
export { isTreeSitterLanguageSupported };
