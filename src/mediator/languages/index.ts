/**
 * Language Analysis Module
 * [ENH: LANG] Language-agnostic dependency analysis with plugin architecture
 * [ENH: TREE-SITTER] Multi-language support via tree-sitter WASM
 */

// Types
export type {
  LanguageAnalyzer,
  LanguageDetectionResult,
  LanguageSupportStatus
} from './types.js';

// Registry (singleton and utilities)
export {
  languageRegistry,
  detectLanguage,
  isLanguageSupported,
  getAnalyzerForFile,
  getSupportedExtensions,
  getRegisteredLanguages,
  initTreeSitter,
  isTreeSitterReady
} from './registry.js';

// Built-in analyzers
export { TypeScriptAnalyzer } from './typescript.js';

// Tree-sitter analyzers
export {
  treeSitterAnalyzers,
  getTreeSitterAnalyzerForPath,
  getTreeSitterAnalyzerById,
  isTreeSitterSupportedExtension,
  getTreeSitterSupportedExtensions
} from './tree-sitter/analyzer.js';
