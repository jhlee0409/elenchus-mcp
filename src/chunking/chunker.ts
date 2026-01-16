/**
 * Code Chunker
 * [ENH: CHUNK] Creates optimized chunks for verification
 */

import { randomBytes } from 'crypto';
import {
  CodeSymbol,
  ParsedFile,
  CodeChunk,
  ChunkingConfig,
  ChunkingResult,
  DEFAULT_CHUNKING_CONFIG
} from './types.js';
import { parseFile, extractDependencies, estimateTokens } from './parser.js';

/**
 * Create chunks from a parsed file
 */
export function chunkFile(
  parsedFile: ParsedFile,
  config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG
): ChunkingResult {
  const chunks: CodeChunk[] = [];
  const skippedSymbols: Array<{ name: string; reason: string }> = [];

  // Calculate dependencies for all symbols
  const symbolsWithDeps = parsedFile.symbols.map(s => ({
    ...s,
    dependencies: extractDependencies(s, parsedFile.symbols)
  }));

  // Sort symbols by priority (exported first, then by type)
  const sortedSymbols = [...symbolsWithDeps].sort((a, b) => {
    // Exported symbols first
    if (a.isExported && !b.isExported) return -1;
    if (!a.isExported && b.isExported) return 1;

    // Then by type priority
    const typePriority: Record<string, number> = {
      'class': 1,
      'function': 2,
      'method': 2,
      'interface': 3,
      'type': 3,
      'constant': 4,
      'variable': 5,
      'export': 6,
      'import': 7
    };

    return (typePriority[a.type] || 99) - (typePriority[b.type] || 99);
  });

  // Group symbols into chunks
  let currentChunkSymbols: CodeSymbol[] = [];
  let currentChunkTokens = 0;

  for (const symbol of sortedSymbols) {
    // Skip very small symbols (include them whole)
    if (symbol.tokenCount < config.minSymbolTokensToChunk) {
      skippedSymbols.push({ name: symbol.name, reason: 'Too small to chunk separately' });
      continue;
    }

    // Check if this symbol can fit in current chunk
    if (currentChunkTokens + symbol.tokenCount <= config.maxTokensPerChunk) {
      currentChunkSymbols.push(symbol);
      currentChunkTokens += symbol.tokenCount;
    } else {
      // Finalize current chunk and start new one
      if (currentChunkSymbols.length > 0) {
        chunks.push(createChunk(parsedFile.path, currentChunkSymbols, chunks.length));
      }
      currentChunkSymbols = [symbol];
      currentChunkTokens = symbol.tokenCount;
    }

    // If symbol is larger than max chunk size, split it
    if (symbol.tokenCount > config.maxTokensPerChunk) {
      // For large symbols, we keep them as single chunks with a note
      currentChunkSymbols = [];
      currentChunkTokens = 0;
      chunks.push({
        id: `chunk-lg-${randomBytes(4).toString('hex')}`,
        filePath: parsedFile.path,
        symbols: [symbol],
        content: symbol.content,
        tokenCount: symbol.tokenCount,
        priority: symbol.isExported ? 1 : 2,
        verificationHints: ['Large symbol - verify thoroughly']
      });
    }
  }

  // Don't forget the last chunk
  if (currentChunkSymbols.length > 0) {
    chunks.push(createChunk(parsedFile.path, currentChunkSymbols, chunks.length));
  }

  // If config.includeRelated, link related chunks
  if (config.includeRelated) {
    linkRelatedChunks(chunks, symbolsWithDeps, config.maxRelatedDepth);
  }

  // Calculate savings
  const totalTokensBefore = parsedFile.totalTokens;
  const totalTokensAfter = chunks.reduce((sum, c) => sum + c.tokenCount, 0);
  const tokenSavings = totalTokensBefore - totalTokensAfter;

  return {
    chunks,
    skippedSymbols,
    totalTokensBefore,
    totalTokensAfter,
    tokenSavings,
    savingsPercentage: Math.round((tokenSavings / totalTokensBefore) * 100)
  };
}

/**
 * Create a chunk from symbols
 */
function createChunk(filePath: string, symbols: CodeSymbol[], index: number): CodeChunk {
  const content = symbols.map(s => s.content).join('\n\n');
  const tokenCount = estimateTokens(content);

  // Generate verification hints
  const hints: string[] = [];
  if (symbols.some(s => s.type === 'class')) {
    hints.push('Contains class definition - check inheritance and encapsulation');
  }
  if (symbols.some(s => s.name.toLowerCase().includes('auth') || s.name.toLowerCase().includes('security'))) {
    hints.push('Security-related code - verify authentication/authorization');
  }
  if (symbols.some(s => s.name.toLowerCase().includes('sql') || s.name.toLowerCase().includes('query'))) {
    hints.push('Database interaction - check for SQL injection');
  }

  return {
    id: `chunk-${index}-${symbols[0]?.name || 'unknown'}`,
    filePath,
    symbols,
    content,
    tokenCount,
    priority: symbols.some(s => s.isExported) ? 1 : 2,
    verificationHints: hints.length > 0 ? hints : undefined
  };
}

/**
 * Link related chunks based on dependencies
 */
function linkRelatedChunks(
  chunks: CodeChunk[],
  symbolsWithDeps: Array<CodeSymbol & { dependencies: string[] }>,
  maxDepth: number
): void {
  // Build a map of symbol name to chunk id
  const symbolToChunk = new Map<string, string>();
  for (const chunk of chunks) {
    for (const symbol of chunk.symbols) {
      symbolToChunk.set(symbol.name, chunk.id);
    }
  }

  // Link chunks based on symbol dependencies
  for (const chunk of chunks) {
    const relatedChunkIds = new Set<string>();

    for (const symbol of chunk.symbols) {
      const symbolWithDeps = symbolsWithDeps.find(s => s.name === symbol.name);
      if (symbolWithDeps) {
        for (const dep of symbolWithDeps.dependencies) {
          const depChunkId = symbolToChunk.get(dep);
          if (depChunkId && depChunkId !== chunk.id) {
            relatedChunkIds.add(depChunkId);
          }
        }
      }
    }

    if (relatedChunkIds.size > 0) {
      chunk.relatedChunks = Array.from(relatedChunkIds);
    }
  }
}

/**
 * Chunk multiple files and create an optimized verification order
 */
export function chunkFiles(
  files: Map<string, string>,
  config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG
): {
  chunks: CodeChunk[];
  fileResults: Map<string, ChunkingResult>;
  totalSavings: {
    tokensBefore: number;
    tokensAfter: number;
    savingsPercentage: number;
  };
} {
  const fileResults = new Map<string, ChunkingResult>();
  let allChunks: CodeChunk[] = [];
  let totalBefore = 0;
  let totalAfter = 0;

  for (const [filePath, content] of files) {
    const parsed = parseFile(content, filePath);
    const result = chunkFile(parsed, config);

    fileResults.set(filePath, result);
    allChunks = allChunks.concat(result.chunks);
    totalBefore += result.totalTokensBefore;
    totalAfter += result.totalTokensAfter;
  }

  // Sort chunks by priority
  allChunks.sort((a, b) => a.priority - b.priority);

  return {
    chunks: allChunks,
    fileResults,
    totalSavings: {
      tokensBefore: totalBefore,
      tokensAfter: totalAfter,
      savingsPercentage: totalBefore > 0
        ? Math.round((1 - totalAfter / totalBefore) * 100)
        : 0
    }
  };
}

/**
 * Generate a summary of chunked context for LLM
 */
export function generateChunkSummary(
  chunks: CodeChunk[],
  totalFiles: number,
  totalSavings: { tokensBefore: number; tokensAfter: number; savingsPercentage: number }
): string {
  return `## Selective Context Summary

**Files Processed**: ${totalFiles}
**Chunks Created**: ${chunks.length}
**Token Savings**: ${totalSavings.savingsPercentage}% reduction (${totalSavings.tokensBefore} → ${totalSavings.tokensAfter})

### Verification Order
${chunks.slice(0, 10).map((c, i) => `${i + 1}. ${c.filePath}: ${c.symbols.map(s => s.name).join(', ')}`).join('\n')}
${chunks.length > 10 ? `\n... and ${chunks.length - 10} more chunks` : ''}

**Note**: Focus on each chunk's symbols. Related chunks are linked for dependency tracking.`;
}
