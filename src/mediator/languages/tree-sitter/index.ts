/**
 * Tree-sitter Parser Manager
 * [ENH: TREE-SITTER] Multi-language AST parsing using tree-sitter WASM
 */

import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

// Use any for tree-sitter types due to complex module structure
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TreeSitterParser = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TreeSitterLanguage = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TreeSitterTree = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TreeSitterLanguageClass = any;

// Parser class reference (loaded dynamically)
let ParserClass: TreeSitterParser = null;

// Language class reference (loaded dynamically)
let LanguageClass: TreeSitterLanguageClass = null;

// Parser instance (reused)
let parserInstance: TreeSitterParser = null;

// Loaded languages cache
const loadedLanguages = new Map<string, TreeSitterLanguage>();

// Initialization state
let initialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Language ID to WASM file mapping
 */
const LANGUAGE_WASM_MAP: Record<string, string> = {
  'typescript': 'tree-sitter-typescript.wasm',
  'tsx': 'tree-sitter-tsx.wasm',
  'javascript': 'tree-sitter-javascript.wasm',
  'python': 'tree-sitter-python.wasm',
  'go': 'tree-sitter-go.wasm',
  'rust': 'tree-sitter-rust.wasm',
  'java': 'tree-sitter-java.wasm',
  'c': 'tree-sitter-cpp.wasm',
  'cpp': 'tree-sitter-cpp.wasm',
  'csharp': 'tree-sitter-c-sharp.wasm',
  'ruby': 'tree-sitter-ruby.wasm',
  'php': 'tree-sitter-php.wasm',
  'bash': 'tree-sitter-bash.wasm',
  'css': 'tree-sitter-css.wasm',
  'powershell': 'tree-sitter-powershell.wasm',
};

/**
 * File extension to language ID mapping
 */
export const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.pyw': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hxx': 'cpp',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.php': 'php',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.css': 'css',
  '.ps1': 'powershell',
};

/**
 * Get path to WASM files
 */
function getWasmDir(): string {
  const possiblePaths = [
    // Running from dist/
    path.resolve(fileURLToPath(import.meta.url), '../../../../node_modules/@vscode/tree-sitter-wasm/wasm'),
    // Running from src/
    path.resolve(fileURLToPath(import.meta.url), '../../../../../node_modules/@vscode/tree-sitter-wasm/wasm'),
    // Fallback to node_modules relative to cwd
    path.resolve(process.cwd(), 'node_modules/@vscode/tree-sitter-wasm/wasm'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  throw new Error('Could not find @vscode/tree-sitter-wasm package');
}

/**
 * Get path to web-tree-sitter's own WASM file
 */
function getWebTreeSitterWasmPath(): string {
  const possiblePaths = [
    // Running from dist/
    path.resolve(fileURLToPath(import.meta.url), '../../../../node_modules/web-tree-sitter/web-tree-sitter.wasm'),
    // Running from src/
    path.resolve(fileURLToPath(import.meta.url), '../../../../../node_modules/web-tree-sitter/web-tree-sitter.wasm'),
    // Fallback to node_modules relative to cwd
    path.resolve(process.cwd(), 'node_modules/web-tree-sitter/web-tree-sitter.wasm'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  throw new Error('Could not find web-tree-sitter WASM file');
}

/**
 * Initialize tree-sitter parser
 */
export async function initTreeSitter(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // web-tree-sitter uses named exports
    const { Parser, Language } = await import('web-tree-sitter');
    ParserClass = Parser;
    LanguageClass = Language;

    // Get paths to WASM files
    const webTreeSitterWasm = getWebTreeSitterWasmPath();

    await ParserClass.init({
      locateFile: (file: string) => {
        // The base parser WASM is from web-tree-sitter package
        if (file === 'web-tree-sitter.wasm') {
          return webTreeSitterWasm;
        }
        return file;
      }
    });

    parserInstance = new ParserClass();
    initialized = true;
  })();

  return initPromise;
}

/**
 * Load a language grammar
 */
export async function loadLanguage(languageId: string): Promise<TreeSitterLanguage | null> {
  await initTreeSitter();

  if (loadedLanguages.has(languageId)) {
    return loadedLanguages.get(languageId)!;
  }

  const wasmFile = LANGUAGE_WASM_MAP[languageId];
  if (!wasmFile || !LanguageClass) {
    return null;
  }

  try {
    const wasmDir = getWasmDir();
    const wasmPath = path.join(wasmDir, wasmFile);

    if (!fs.existsSync(wasmPath)) {
      console.error(`[Elenchus] WASM file not found: ${wasmPath}`);
      return null;
    }

    const language = await LanguageClass.load(wasmPath);
    loadedLanguages.set(languageId, language);
    return language;
  } catch (error) {
    console.error(`[Elenchus] Failed to load language ${languageId}:`, error);
    return null;
  }
}

/**
 * Parse source code and return AST tree (async)
 */
export async function parseCode(code: string, languageId: string): Promise<TreeSitterTree | null> {
  await initTreeSitter();

  const language = await loadLanguage(languageId);
  if (!language || !parserInstance) {
    return null;
  }

  parserInstance.setLanguage(language);
  return parserInstance.parse(code);
}

/**
 * Parse source code synchronously (requires language to be pre-loaded)
 * Returns null if tree-sitter is not initialized or language is not loaded
 */
export function parseCodeSync(code: string, languageId: string): TreeSitterTree | null {
  if (!initialized || !parserInstance) {
    return null;
  }

  const language = loadedLanguages.get(languageId);
  if (!language) {
    return null;
  }

  parserInstance.setLanguage(language);
  return parserInstance.parse(code);
}

/**
 * Check if tree-sitter is initialized and ready
 */
export function isTreeSitterReady(): boolean {
  return initialized && parserInstance !== null;
}

/**
 * Check if a language is loaded and ready for sync parsing
 */
export function isLanguageLoaded(languageId: string): boolean {
  return loadedLanguages.has(languageId);
}

/**
 * Pre-load all supported languages (call at startup)
 */
export async function preloadAllLanguages(): Promise<void> {
  await initTreeSitter();

  const languages = Object.keys(LANGUAGE_WASM_MAP);
  await Promise.all(languages.map(lang => loadLanguage(lang)));
}

/**
 * Pre-load specific languages (call at startup for faster init)
 */
export async function preloadLanguages(languageIds: string[]): Promise<void> {
  await initTreeSitter();
  await Promise.all(languageIds.map(lang => loadLanguage(lang)));
}

/**
 * Get language ID from file extension
 */
export function getLanguageIdFromPath(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_LANGUAGE_MAP[ext] || null;
}

/**
 * Check if a language is supported
 */
export function isTreeSitterLanguageSupported(languageId: string): boolean {
  return languageId in LANGUAGE_WASM_MAP;
}

/**
 * Get all supported language IDs
 */
export function getTreeSitterSupportedLanguages(): string[] {
  return Object.keys(LANGUAGE_WASM_MAP);
}

/**
 * Get all supported file extensions
 */
export function getTreeSitterSupportedExtensions(): string[] {
  return Object.keys(EXTENSION_LANGUAGE_MAP);
}

/**
 * Cleanup resources
 */
export function cleanupTreeSitter(): void {
  if (parserInstance) {
    parserInstance.delete();
    parserInstance = null;
  }
  loadedLanguages.clear();
  initialized = false;
  initPromise = null;
}

// Export types for external use
export type { TreeSitterTree, TreeSitterLanguage };
