/**
 * Token Optimization Module
 * [ENH: TOKEN-OPT] Exports for token optimization across the system
 */

// Type exports
export * from './types.js';

// Compressor
export {
  ResponseCompressor,
  createCompressor,
  getGlobalCompressor,
  setGlobalCompressionMode
} from './compressor.js';

// Normalizer
export {
  CodeNormalizer,
  getGlobalNormalizer
} from './normalizer.js';

// Context Manager
export {
  AdaptiveContextManager,
  getGlobalContextManager
} from './context-manager.js';

// Prompt Cache Hints
export {
  PromptCacheHintGenerator,
  getGlobalHintGenerator
} from './prompt-cache.js';

// =============================================================================
// Convenience Functions
// =============================================================================

import { CompressionMode, CompressionConfig } from './types.js';
import { getGlobalCompressor, setGlobalCompressionMode } from './compressor.js';
import { getGlobalContextManager } from './context-manager.js';
import { getGlobalNormalizer } from './normalizer.js';

/**
 * Initialize all optimization modules with configuration
 */
export function initializeOptimization(config: {
  compression?: Partial<CompressionConfig>;
  compressionMode?: CompressionMode;
  contextMaxTokens?: number;
  enableSemanticCache?: boolean;
}): void {
  // Configure compression
  if (config.compressionMode) {
    setGlobalCompressionMode(config.compressionMode);
  } else if (config.compression) {
    getGlobalCompressor().updateConfig(config.compression);
  }

  // Configure context manager
  if (config.contextMaxTokens) {
    getGlobalContextManager().updateConfig({
      enabled: true,
      maxContextTokens: config.contextMaxTokens
    });
  }

  // Configure semantic cache
  if (config.enableSemanticCache) {
    getGlobalNormalizer().updateConfig({
      enabled: true,
      useNormalizedMatching: true
    });
  }
}

/**
 * Compress a response using global compressor
 */
export function compressResponse<T extends object>(response: T): T | object {
  return getGlobalCompressor().compress(response);
}

/**
 * Get optimization summary for a session
 */
export function getOptimizationSummary(_sessionId: string, originalTokens: number): {
  compressionEnabled: boolean;
  contextManagerEnabled: boolean;
  semanticCacheEnabled: boolean;
  estimatedSavings: number;
} {
  const compressor = getGlobalCompressor();
  const contextManager = getGlobalContextManager();
  const normalizer = getGlobalNormalizer();

  const compressionEnabled = compressor.getConfig().enabled;
  const contextManagerEnabled = contextManager.getBudgetStatus().reductionsApplied.length > 0;
  const semanticCacheEnabled = normalizer !== null;  // Check if normalizer is initialized

  // Estimate savings
  let estimatedSavings = 0;

  if (compressionEnabled) {
    estimatedSavings += originalTokens * 0.25;  // ~25% from compression
  }

  if (contextManagerEnabled) {
    estimatedSavings += contextManager.getBudgetStatus().tokensSaved;
  }

  return {
    compressionEnabled,
    contextManagerEnabled,
    semanticCacheEnabled,
    estimatedSavings: Math.round(estimatedSavings)
  };
}

/**
 * Create optimization report
 */
export function createOptimizationReport(params: {
  sessionId: string;
  originalTokens: number;
  compressedTokens?: number;
  cachedTokens?: number;
  contextReduction?: number;
}): string {
  const lines: string[] = [];

  lines.push('# Token Optimization Report');
  lines.push('');
  lines.push(`Session: ${params.sessionId}`);
  lines.push(`Original Tokens: ${params.originalTokens.toLocaleString()}`);
  lines.push('');

  let totalSaved = 0;

  if (params.compressedTokens !== undefined) {
    const saved = params.originalTokens - params.compressedTokens;
    totalSaved += saved;
    lines.push(`Compression: -${saved.toLocaleString()} tokens (${Math.round(saved / params.originalTokens * 100)}%)`);
  }

  if (params.cachedTokens !== undefined) {
    totalSaved += params.cachedTokens;
    lines.push(`Caching: -${params.cachedTokens.toLocaleString()} tokens`);
  }

  if (params.contextReduction !== undefined) {
    totalSaved += params.contextReduction;
    lines.push(`Context Reduction: -${params.contextReduction.toLocaleString()} tokens`);
  }

  lines.push('');
  lines.push(`**Total Saved: ${totalSaved.toLocaleString()} tokens (${Math.round(totalSaved / params.originalTokens * 100)}%)**`);
  lines.push(`**Final Tokens: ${(params.originalTokens - totalSaved).toLocaleString()}**`);

  // Cost estimate
  const costSaved = totalSaved * 0.000003;  // $3 per million tokens
  lines.push('');
  lines.push(`Estimated Cost Savings: $${costSaved.toFixed(4)}`);

  return lines.join('\n');
}
