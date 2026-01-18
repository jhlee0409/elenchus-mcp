/**
 * Language Analyzer Interface
 * [ENH: LANG] Language-agnostic design for multi-language support
 */

import { ImportInfo, ExportInfo, FunctionInfo, ClassInfo } from '../types.js';

/**
 * Language analyzer interface - each language implements this
 */
export interface LanguageAnalyzer {
  /** Language identifier (e.g., 'typescript', 'python', 'go') */
  readonly id: string;

  /** Display name (e.g., 'TypeScript/JavaScript', 'Python', 'Go') */
  readonly name: string;

  /** Supported file extensions (e.g., ['.ts', '.tsx', '.js']) */
  readonly extensions: readonly string[];

  /** Extensions to try when resolving imports (e.g., ['', '.ts', '.js', '/index.ts']) */
  readonly importResolutionExtensions: readonly string[];

  /** Extract import statements from content */
  extractImports(content: string): ImportInfo[];

  /** Extract export statements from content */
  extractExports(content: string): ExportInfo[];

  /** Extract functions from content */
  extractFunctions(content: string): FunctionInfo[];

  /** Extract classes from content */
  extractClasses(content: string): ClassInfo[];

  /**
   * Check if an import source is external (e.g., node_modules, pip package)
   * External imports are skipped in dependency graph
   */
  isExternalImport(source: string): boolean;
}

/**
 * Result of language detection
 */
export interface LanguageDetectionResult {
  /** Whether a language was detected */
  detected: boolean;

  /** The detected language analyzer (if any) */
  analyzer?: LanguageAnalyzer;

  /** The detected language ID */
  languageId?: string;

  /** Reason for detection failure (if any) */
  reason?: string;
}

/**
 * Language support status for a file
 */
export interface LanguageSupportStatus {
  /** File path */
  filePath: string;

  /** Whether the language is supported */
  supported: boolean;

  /** Language ID if supported */
  languageId?: string;

  /** File extension */
  extension: string;
}

/**
 * Empty analysis result for unsupported languages
 * Still provides a valid DependencyNode structure
 */
export interface UnsupportedLanguageResult {
  /** Language is not supported */
  unsupported: true;

  /** File extension that wasn't recognized */
  extension: string;

  /** Empty arrays for dependency tracking */
  imports: [];
  exports: [];
  functions: [];
  classes: [];
}
