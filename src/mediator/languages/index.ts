/**
 * Language Analysis Module
 * [ENH: LANG] Language-agnostic dependency analysis with plugin architecture
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
  getRegisteredLanguages
} from './registry.js';

// Built-in analyzers
export { TypeScriptAnalyzer } from './typescript.js';
