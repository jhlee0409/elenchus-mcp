/**
 * Selective Context Module
 * [ENH: CHUNK] Main entry point for function-level context chunking
 */

export * from './types.js';
export * from './parser.js';
export * from './chunker.js';

import { FileContext } from '../types/index.js';
import {
  CodeChunk,
  ChunkingConfig,
  ChunkingResult,
  DEFAULT_CHUNKING_CONFIG
} from './types.js';
import { chunkFiles, generateChunkSummary } from './chunker.js';

/**
 * Apply chunking to verification context files
 */
export function chunkContextFiles(
  files: Map<string, FileContext>,
  config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG
): {
  chunks: CodeChunk[];
  summary: string;
  tokenSavings: {
    before: number;
    after: number;
    percentage: number;
  };
} {
  if (!config.enabled) {
    // Return all files as single chunks if chunking disabled
    const chunks: CodeChunk[] = [];
    let totalTokens = 0;

    for (const [path, ctx] of files) {
      if (ctx.content) {
        const tokenCount = Math.ceil(ctx.content.length / 4);
        totalTokens += tokenCount;
        chunks.push({
          id: `file-${path}`,
          filePath: path,
          symbols: [],
          content: ctx.content,
          tokenCount,
          priority: 1
        });
      }
    }

    return {
      chunks,
      summary: 'Chunking disabled - using full file context',
      tokenSavings: {
        before: totalTokens,
        after: totalTokens,
        percentage: 0
      }
    };
  }

  // Extract content from file contexts
  const fileContents = new Map<string, string>();
  for (const [path, ctx] of files) {
    if (ctx.content) {
      fileContents.set(path, ctx.content);
    }
  }

  // Chunk the files
  const result = chunkFiles(fileContents, config);

  // Generate summary
  const summary = generateChunkSummary(
    result.chunks,
    fileContents.size,
    result.totalSavings
  );

  return {
    chunks: result.chunks,
    summary,
    tokenSavings: {
      before: result.totalSavings.tokensBefore,
      after: result.totalSavings.tokensAfter,
      percentage: result.totalSavings.savingsPercentage
    }
  };
}

/**
 * Get chunks relevant to a specific issue location
 */
export function getChunksForLocation(
  chunks: CodeChunk[],
  location: string
): CodeChunk[] {
  // Parse location (format: file:line or file:line-line)
  const [filePath, lineSpec] = location.split(':');
  const line = parseInt(lineSpec?.split('-')[0] || '0', 10);

  // Find chunks that contain this location
  const matchingChunks = chunks.filter(chunk => {
    if (chunk.filePath !== filePath && !chunk.filePath.endsWith(filePath)) {
      return false;
    }

    // Check if any symbol in this chunk contains the line
    return chunk.symbols.some(s =>
      s.startLine <= line && s.endLine >= line
    );
  });

  // Include related chunks
  const relatedChunkIds = new Set<string>();
  for (const chunk of matchingChunks) {
    if (chunk.relatedChunks) {
      chunk.relatedChunks.forEach(id => relatedChunkIds.add(id));
    }
  }

  // Add related chunks
  for (const chunk of chunks) {
    if (relatedChunkIds.has(chunk.id) && !matchingChunks.includes(chunk)) {
      matchingChunks.push(chunk);
    }
  }

  return matchingChunks;
}

/**
 * Merge chunks back into full file content (for context expansion)
 */
export function mergeChunks(chunks: CodeChunk[]): Map<string, string> {
  const fileContents = new Map<string, string[]>();

  // Group chunks by file
  for (const chunk of chunks) {
    if (!fileContents.has(chunk.filePath)) {
      fileContents.set(chunk.filePath, []);
    }
    fileContents.get(chunk.filePath)!.push(chunk.content);
  }

  // Merge content for each file
  const result = new Map<string, string>();
  for (const [path, contents] of fileContents) {
    result.set(path, contents.join('\n\n'));
  }

  return result;
}
