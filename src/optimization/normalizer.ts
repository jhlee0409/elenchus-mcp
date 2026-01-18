/**
 * Code Normalizer
 * [ENH: TOKEN-OPT] Normalizes code for semantic caching
 */

import * as crypto from 'crypto';
import {
  NormalizedCode,
  SemanticCacheKey,
  SemanticCacheLookup,
  SemanticCacheConfig,
  DEFAULT_SEMANTIC_CACHE_CONFIG
} from './types.js';
import { IssueCategory } from '../types/index.js';

/**
 * Code normalizer for semantic caching
 */
export class CodeNormalizer {
  private config: SemanticCacheConfig;

  constructor(config: Partial<SemanticCacheConfig> = {}) {
    this.config = { ...DEFAULT_SEMANTIC_CACHE_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SemanticCacheConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Normalize code content for caching
   */
  normalizeCode(filePath: string, content: string): NormalizedCode {
    // Determine language from file extension
    const ext = filePath.split('.').pop()?.toLowerCase() || '';

    // Strip comments and normalize whitespace
    const normalized = this.normalizeContent(content, ext);

    // Extract structural signature (function/class names)
    const structuralSignature = this.extractStructuralSignature(content, ext);

    // Calculate hashes
    const normalizedHash = this.hash(normalized);

    // Estimate token count
    const tokenCount = Math.ceil(normalized.length / 4);

    return {
      filePath,
      normalizedHash,
      tokenCount,
      structuralSignature
    };
  }

  /**
   * Create semantic cache key
   */
  createCacheKey(
    filePath: string,
    content: string,
    requirements: string,
    category?: IssueCategory
  ): SemanticCacheKey {
    const normalized = this.normalizeCode(filePath, content);

    return {
      exactHash: this.hash(content),
      normalizedHash: normalized.normalizedHash,
      structuralHash: this.hash(normalized.structuralSignature),
      requirementsHash: this.hash(requirements),
      category
    };
  }

  /**
   * Perform semantic cache lookup
   */
  lookup(
    key: SemanticCacheKey,
    cache: Map<string, { key: SemanticCacheKey; result: unknown; tokens: number }>
  ): SemanticCacheLookup {
    // Try exact match first
    const exactKey = this.formatExactKey(key);
    const exactMatch = cache.get(exactKey);
    if (exactMatch) {
      return {
        matchType: 'exact',
        confidence: 1.0,
        result: exactMatch.result,
        tokensSaved: exactMatch.tokens
      };
    }

    if (!this.config.enabled) {
      return { matchType: 'none', confidence: 0 };
    }

    // Try normalized match
    if (this.config.useNormalizedMatching) {
      for (const [, entry] of cache) {
        if (
          entry.key.normalizedHash === key.normalizedHash &&
          entry.key.requirementsHash === key.requirementsHash &&
          (!key.category || entry.key.category === key.category)
        ) {
          return {
            matchType: 'normalized',
            confidence: 0.95,
            result: entry.result,
            tokensSaved: entry.tokens,
            warning: 'Matched via normalized hash (whitespace/comment differences)'
          };
        }
      }
    }

    // Try structural match (lowest confidence)
    if (this.config.useStructuralMatching) {
      for (const [, entry] of cache) {
        if (
          entry.key.structuralHash === key.structuralHash &&
          entry.key.requirementsHash === key.requirementsHash &&
          (!key.category || entry.key.category === key.category)
        ) {
          // Only accept if confidence meets minimum
          if (0.85 >= this.config.minFuzzyConfidence) {
            return {
              matchType: 'structural',
              confidence: 0.85,
              result: entry.result,
              tokensSaved: entry.tokens,
              warning: 'Matched via structural signature (same functions/classes)'
            };
          }
        }
      }
    }

    return { matchType: 'none', confidence: 0 };
  }

  /**
   * Normalize content based on language
   */
  private normalizeContent(content: string, ext: string): string {
    let normalized = content;

    // Remove comments based on language
    switch (ext) {
      case 'ts':
      case 'tsx':
      case 'js':
      case 'jsx':
      case 'java':
      case 'c':
      case 'cpp':
      case 'cs':
      case 'go':
      case 'rs':
        // Remove single-line comments
        normalized = normalized.replace(/\/\/.*$/gm, '');
        // Remove multi-line comments
        normalized = normalized.replace(/\/\*[\s\S]*?\*\//g, '');
        break;

      case 'py':
        // Remove Python comments
        normalized = normalized.replace(/#.*$/gm, '');
        // Remove docstrings (simplified)
        normalized = normalized.replace(/"""[\s\S]*?"""/g, '');
        normalized = normalized.replace(/'''[\s\S]*?'''/g, '');
        break;

      case 'rb':
        // Remove Ruby comments
        normalized = normalized.replace(/#.*$/gm, '');
        break;
    }

    // Normalize whitespace
    normalized = normalized
      // Collapse multiple spaces to one
      .replace(/[ \t]+/g, ' ')
      // Collapse multiple newlines to one
      .replace(/\n+/g, '\n')
      // Trim lines
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n');

    return normalized;
  }

  /**
   * Extract structural signature (function/class names)
   */
  private extractStructuralSignature(content: string, ext: string): string {
    const signatures: string[] = [];

    switch (ext) {
      case 'ts':
      case 'tsx':
      case 'js':
      case 'jsx':
        // Match function declarations
        const funcMatches = content.matchAll(
          /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g
        );
        for (const m of funcMatches) signatures.push(`fn:${m[1]}`);

        // Match class declarations
        const classMatches = content.matchAll(
          /(?:export\s+)?class\s+(\w+)/g
        );
        for (const m of classMatches) signatures.push(`class:${m[1]}`);

        // Match interface/type declarations
        const typeMatches = content.matchAll(
          /(?:export\s+)?(?:interface|type)\s+(\w+)/g
        );
        for (const m of typeMatches) signatures.push(`type:${m[1]}`);

        // Match method definitions
        const methodMatches = content.matchAll(
          /(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*{/g
        );
        for (const m of methodMatches) {
          if (!['if', 'for', 'while', 'switch', 'catch', 'function'].includes(m[1])) {
            signatures.push(`method:${m[1]}`);
          }
        }
        break;

      case 'py':
        // Match function definitions
        const pyFuncMatches = content.matchAll(/def\s+(\w+)/g);
        for (const m of pyFuncMatches) signatures.push(`fn:${m[1]}`);

        // Match class definitions
        const pyClassMatches = content.matchAll(/class\s+(\w+)/g);
        for (const m of pyClassMatches) signatures.push(`class:${m[1]}`);
        break;

      case 'go':
        // Match function definitions
        const goFuncMatches = content.matchAll(/func\s+(?:\([^)]+\)\s+)?(\w+)/g);
        for (const m of goFuncMatches) signatures.push(`fn:${m[1]}`);

        // Match type definitions
        const goTypeMatches = content.matchAll(/type\s+(\w+)/g);
        for (const m of goTypeMatches) signatures.push(`type:${m[1]}`);
        break;

      case 'rs':
        // Match function definitions
        const rsFuncMatches = content.matchAll(/(?:pub\s+)?fn\s+(\w+)/g);
        for (const m of rsFuncMatches) signatures.push(`fn:${m[1]}`);

        // Match struct/enum definitions
        const rsTypeMatches = content.matchAll(
          /(?:pub\s+)?(?:struct|enum|trait)\s+(\w+)/g
        );
        for (const m of rsTypeMatches) signatures.push(`type:${m[1]}`);
        break;
    }

    // Sort for consistent ordering
    signatures.sort();
    return signatures.join('|');
  }

  /**
   * Create SHA256 hash
   */
  private hash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  /**
   * Format exact cache key
   */
  private formatExactKey(key: SemanticCacheKey): string {
    return `${key.exactHash}:${key.requirementsHash}${key.category ? `:${key.category}` : ''}`;
  }
}

// Singleton instance
let globalNormalizer: CodeNormalizer | null = null;

/**
 * Get or create global normalizer
 */
export function getGlobalNormalizer(): CodeNormalizer {
  if (!globalNormalizer) {
    globalNormalizer = new CodeNormalizer();
  }
  return globalNormalizer;
}
