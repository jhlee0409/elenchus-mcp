/**
 * Selective Context Types
 * [ENH: CHUNK] Types for function-level context chunking
 */

import { IssueCategory } from '../types/index.js';

/**
 * Code symbol types
 */
export type SymbolType =
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'type'
  | 'variable'
  | 'constant'
  | 'export'
  | 'import';

/**
 * Represents a code symbol (function, class, etc.)
 */
export interface CodeSymbol {
  name: string;
  type: SymbolType;
  startLine: number;
  endLine: number;
  content: string;
  // Nested symbols (e.g., methods in a class)
  children?: CodeSymbol[];
  // Dependencies (other symbols this one references)
  dependencies?: string[];
  // Estimated token count
  tokenCount: number;
  // Symbol signature (for quick reference without full content)
  signature?: string;
  // Is this an export?
  isExported?: boolean;
  // JSDoc or comments
  documentation?: string;
}

/**
 * Parsed file with symbols
 */
export interface ParsedFile {
  path: string;
  language: 'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'unknown';
  symbols: CodeSymbol[];
  imports: string[];
  exports: string[];
  totalLines: number;
  totalTokens: number;
}

/**
 * Chunking configuration
 */
export interface ChunkingConfig {
  enabled: boolean;
  // Maximum tokens per chunk
  maxTokensPerChunk: number;
  // Include related symbols (dependencies)
  includeRelated: boolean;
  // Maximum depth for related symbol inclusion
  maxRelatedDepth: number;
  // Prioritize certain categories
  priorityCategories: IssueCategory[];
  // Always include these symbol types
  alwaysIncludeTypes: SymbolType[];
  // Minimum symbol size to chunk (smaller symbols included whole)
  minSymbolTokensToChunk: number;
}

/**
 * A chunk of code for verification
 */
export interface CodeChunk {
  id: string;
  filePath: string;
  symbols: CodeSymbol[];
  content: string;
  tokenCount: number;
  priority: number;
  // Related chunks that should be verified together
  relatedChunks?: string[];
  // Verification focus hints
  verificationHints?: string[];
}

/**
 * Chunking result
 */
export interface ChunkingResult {
  chunks: CodeChunk[];
  skippedSymbols: Array<{ name: string; reason: string }>;
  totalTokensBefore: number;
  totalTokensAfter: number;
  tokenSavings: number;
  savingsPercentage: number;
}

/**
 * Default chunking configuration
 */
export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  enabled: false,
  maxTokensPerChunk: 2000,
  includeRelated: true,
  maxRelatedDepth: 1,
  priorityCategories: ['SECURITY', 'CORRECTNESS'],
  alwaysIncludeTypes: ['function', 'method', 'class'],
  minSymbolTokensToChunk: 50
};
