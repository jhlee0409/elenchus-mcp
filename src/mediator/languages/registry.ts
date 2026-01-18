/**
 * Language Analyzer Registry
 * [ENH: LANG] Central registry for language analyzers with detection and fallback
 */

import * as path from 'path';
import { LanguageAnalyzer, LanguageDetectionResult, LanguageSupportStatus } from './types.js';
import { TypeScriptAnalyzer } from './typescript.js';

/**
 * Registry of all available language analyzers
 */
class LanguageRegistry {
  private analyzers: Map<string, LanguageAnalyzer> = new Map();
  private extensionMap: Map<string, string> = new Map(); // extension -> languageId

  constructor() {
    // Register built-in analyzers
    this.register(TypeScriptAnalyzer);
  }

  /**
   * Register a language analyzer
   */
  register(analyzer: LanguageAnalyzer): void {
    this.analyzers.set(analyzer.id, analyzer);

    // Map extensions to this analyzer
    for (const ext of analyzer.extensions) {
      this.extensionMap.set(ext, analyzer.id);
    }
  }

  /**
   * Unregister a language analyzer
   */
  unregister(languageId: string): boolean {
    const analyzer = this.analyzers.get(languageId);
    if (!analyzer) return false;

    // Remove extension mappings
    for (const ext of analyzer.extensions) {
      if (this.extensionMap.get(ext) === languageId) {
        this.extensionMap.delete(ext);
      }
    }

    this.analyzers.delete(languageId);
    return true;
  }

  /**
   * Get analyzer by language ID
   */
  getAnalyzer(languageId: string): LanguageAnalyzer | undefined {
    return this.analyzers.get(languageId);
  }

  /**
   * Detect language from file path
   */
  detectLanguage(filePath: string): LanguageDetectionResult {
    const ext = path.extname(filePath).toLowerCase();

    if (!ext) {
      return {
        detected: false,
        reason: 'No file extension'
      };
    }

    const languageId = this.extensionMap.get(ext);
    if (!languageId) {
      return {
        detected: false,
        reason: `Unsupported extension: ${ext}`
      };
    }

    const analyzer = this.analyzers.get(languageId);
    if (!analyzer) {
      return {
        detected: false,
        reason: `Analyzer not found for language: ${languageId}`
      };
    }

    return {
      detected: true,
      analyzer,
      languageId
    };
  }

  /**
   * Check if a file extension is supported
   */
  isSupported(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.extensionMap.has(ext);
  }

  /**
   * Get support status for a file
   */
  getSupportStatus(filePath: string): LanguageSupportStatus {
    const ext = path.extname(filePath).toLowerCase();
    const languageId = this.extensionMap.get(ext);

    return {
      filePath,
      supported: !!languageId,
      languageId,
      extension: ext
    };
  }

  /**
   * Get all registered language IDs
   */
  getRegisteredLanguages(): string[] {
    return Array.from(this.analyzers.keys());
  }

  /**
   * Get all supported extensions
   */
  getSupportedExtensions(): string[] {
    return Array.from(this.extensionMap.keys());
  }

  /**
   * Get analyzer for file (convenience method)
   */
  getAnalyzerForFile(filePath: string): LanguageAnalyzer | undefined {
    const result = this.detectLanguage(filePath);
    return result.analyzer;
  }

  /**
   * Get statistics about registered analyzers
   */
  getStats(): {
    totalLanguages: number;
    totalExtensions: number;
    languages: Array<{ id: string; name: string; extensions: readonly string[] }>;
  } {
    const languages = Array.from(this.analyzers.values()).map(a => ({
      id: a.id,
      name: a.name,
      extensions: a.extensions
    }));

    return {
      totalLanguages: this.analyzers.size,
      totalExtensions: this.extensionMap.size,
      languages
    };
  }
}

/**
 * Global singleton registry instance
 */
export const languageRegistry = new LanguageRegistry();

/**
 * Convenience exports for common operations
 */
export const detectLanguage = (filePath: string) => languageRegistry.detectLanguage(filePath);
export const isLanguageSupported = (filePath: string) => languageRegistry.isSupported(filePath);
export const getAnalyzerForFile = (filePath: string) => languageRegistry.getAnalyzerForFile(filePath);
export const getSupportedExtensions = () => languageRegistry.getSupportedExtensions();
export const getRegisteredLanguages = () => languageRegistry.getRegisteredLanguages();

export default languageRegistry;
