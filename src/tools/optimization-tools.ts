/**
 * Token Optimization MCP Tools
 * [ENH: TOKEN-OPT] Tools for managing token optimization settings
 */

import { z } from 'zod';
import {
  getGlobalCompressor,
  setGlobalCompressionMode,
  getGlobalContextManager,
  getGlobalNormalizer,
  getGlobalHintGenerator,
  CompressionMode,
  createOptimizationReport
} from '../optimization/index.js';

// =============================================================================
// Schemas
// =============================================================================

export const SetCompressionModeSchema = z.object({
  mode: z.enum(['full', 'compact', 'minimal']).describe(
    'Compression mode: full (no compression), compact (moderate), minimal (aggressive)'
  )
});

export const GetOptimizationStatsSchema = z.object({
  sessionId: z.string().describe('Session ID to get stats for')
});

export const ConfigureOptimizationSchema = z.object({
  compression: z.object({
    enabled: z.boolean().optional(),
    mode: z.enum(['full', 'compact', 'minimal']).optional(),
    abbreviateFields: z.boolean().optional(),
    omitNullFields: z.boolean().optional(),
    useShortEnums: z.boolean().optional(),
    maxArrayItems: z.number().optional(),
    maxStringLength: z.number().optional()
  }).optional().describe('Compression settings'),

  context: z.object({
    enabled: z.boolean().optional(),
    maxContextTokens: z.number().optional(),
    targetUtilization: z.number().min(0).max(1).optional()
  }).optional().describe('Context management settings'),

  semanticCache: z.object({
    enabled: z.boolean().optional(),
    useNormalizedMatching: z.boolean().optional(),
    useStructuralMatching: z.boolean().optional(),
    minFuzzyConfidence: z.number().min(0).max(1).optional()
  }).optional().describe('Semantic caching settings')
});

export const EstimateSavingsSchema = z.object({
  totalTokens: z.number().describe('Total tokens before optimization'),
  expectedRounds: z.number().describe('Expected number of rounds'),
  sessionType: z.enum(['single', 'multi-round', 're-verification']).optional()
});

// =============================================================================
// Tool Handlers
// =============================================================================

/**
 * Set compression mode
 */
export async function setCompressionMode(
  args: z.infer<typeof SetCompressionModeSchema>
): Promise<{ success: boolean; mode: CompressionMode; message: string }> {
  setGlobalCompressionMode(args.mode);

  const modeDescriptions: Record<CompressionMode, string> = {
    full: 'No compression - full responses',
    compact: 'Moderate compression - abbreviated fields, short enums',
    minimal: 'Aggressive compression - truncated arrays, summarized data'
  };

  return {
    success: true,
    mode: args.mode,
    message: `Compression mode set to "${args.mode}": ${modeDescriptions[args.mode]}`
  };
}

/**
 * Get current optimization stats
 */
export async function getOptimizationStats(
  _args: z.infer<typeof GetOptimizationStatsSchema>
): Promise<{
  compression: {
    enabled: boolean;
    mode: string;
    estimatedSavings: string;
  };
  context: {
    currentTokens: number;
    maxTokens: number;
    utilization: string;
    reductionsApplied: string[];
    tokensSaved: number;
  };
  semanticCache: {
    enabled: boolean;
    normalizedMatching: boolean;
    structuralMatching: boolean;
  };
  recommendations: string[];
}> {
  const compressor = getGlobalCompressor();
  const contextManager = getGlobalContextManager();
  const compressorConfig = compressor.getConfig();
  const budgetStatus = contextManager.getBudgetStatus();

  const recommendations: string[] = [];

  // Check compression
  if (!compressorConfig.enabled) {
    recommendations.push('Enable compression for 20-40% token savings');
  }

  // Check context utilization
  if (budgetStatus.utilization > 0.9) {
    recommendations.push('Context utilization high - consider enabling adaptive context');
  }

  // Check if optimizations could help
  if (budgetStatus.currentTokens > 10000 && !compressorConfig.enabled) {
    recommendations.push('Large context detected - compression strongly recommended');
  }

  return {
    compression: {
      enabled: compressorConfig.enabled,
      mode: compressorConfig.mode,
      estimatedSavings: compressorConfig.enabled
        ? `~${compressorConfig.mode === 'minimal' ? '40' : '25'}% reduction`
        : 'N/A (disabled)'
    },
    context: {
      currentTokens: budgetStatus.currentTokens,
      maxTokens: budgetStatus.maxTokens,
      utilization: `${Math.round(budgetStatus.utilization * 100)}%`,
      reductionsApplied: budgetStatus.reductionsApplied,
      tokensSaved: budgetStatus.tokensSaved
    },
    semanticCache: {
      enabled: false,  // Would need to track this
      normalizedMatching: true,
      structuralMatching: false
    },
    recommendations
  };
}

/**
 * Configure optimization settings
 */
export async function configureOptimization(
  args: z.infer<typeof ConfigureOptimizationSchema>
): Promise<{
  success: boolean;
  appliedSettings: string[];
  message: string;
}> {
  const appliedSettings: string[] = [];

  // Configure compression
  if (args.compression) {
    const compressor = getGlobalCompressor();

    if (args.compression.mode) {
      setGlobalCompressionMode(args.compression.mode);
      appliedSettings.push(`compression.mode=${args.compression.mode}`);
    } else {
      compressor.updateConfig({
        enabled: args.compression.enabled,
        abbreviateFields: args.compression.abbreviateFields,
        omitNullFields: args.compression.omitNullFields,
        useShortEnums: args.compression.useShortEnums,
        maxArrayItems: args.compression.maxArrayItems,
        maxStringLength: args.compression.maxStringLength
      });
      appliedSettings.push('compression settings updated');
    }
  }

  // Configure context manager
  if (args.context) {
    const contextManager = getGlobalContextManager();
    contextManager.updateConfig({
      enabled: args.context.enabled,
      maxContextTokens: args.context.maxContextTokens,
      targetUtilization: args.context.targetUtilization
    });
    appliedSettings.push('context settings updated');
  }

  // Configure semantic cache
  if (args.semanticCache) {
    const normalizer = getGlobalNormalizer();
    normalizer.updateConfig({
      enabled: args.semanticCache.enabled,
      useNormalizedMatching: args.semanticCache.useNormalizedMatching,
      useStructuralMatching: args.semanticCache.useStructuralMatching,
      minFuzzyConfidence: args.semanticCache.minFuzzyConfidence
    });
    appliedSettings.push('semanticCache settings updated');
  }

  return {
    success: true,
    appliedSettings,
    message: `Applied ${appliedSettings.length} optimization settings`
  };
}

/**
 * Estimate potential savings
 */
export async function estimateSavings(
  args: z.infer<typeof EstimateSavingsSchema>
): Promise<{
  estimatedSavings: {
    compression: number;
    promptCaching: number;
    contextOptimization: number;
    total: number;
    percentage: number;
  };
  recommendations: string[];
  report: string;
}> {
  const hintGenerator = getGlobalHintGenerator();

  // Estimate compression savings (25-40%)
  const compressionSavings = Math.round(args.totalTokens * 0.30);

  // Estimate prompt caching savings
  const cacheSavings = hintGenerator.calculateCacheSavings({
    totalTokens: args.totalTokens,
    cacheableTokens: Math.round(args.totalTokens * 0.6),  // ~60% cacheable
    expectedRounds: args.expectedRounds,
    cacheHitRate: 0.9
  });

  // Estimate context optimization (20-50% for multi-round)
  const contextSavings = args.expectedRounds > 1
    ? Math.round(args.totalTokens * 0.25 * (args.expectedRounds - 1))
    : 0;

  const totalSavings = compressionSavings + cacheSavings.totalTokensSaved + contextSavings;
  const totalPossible = args.totalTokens * args.expectedRounds;

  const recommendations: string[] = [];

  if (args.expectedRounds >= 3) {
    recommendations.push('Enable prompt caching for maximum savings');
    recommendations.push('Use compact compression mode');
  }

  if (args.totalTokens > 20000) {
    recommendations.push('Consider chunking large files');
    recommendations.push('Enable adaptive context management');
  }

  if (args.sessionType === 're-verification') {
    recommendations.push('Use differential analysis to verify only changed code');
  }

  const report = createOptimizationReport({
    sessionId: 'estimate',
    originalTokens: args.totalTokens * args.expectedRounds,
    compressedTokens: (args.totalTokens - compressionSavings) * args.expectedRounds,
    cachedTokens: cacheSavings.totalTokensSaved,
    contextReduction: contextSavings
  });

  return {
    estimatedSavings: {
      compression: compressionSavings * args.expectedRounds,
      promptCaching: cacheSavings.totalTokensSaved,
      contextOptimization: contextSavings,
      total: totalSavings,
      percentage: Math.round((totalSavings / totalPossible) * 100)
    },
    recommendations,
    report
  };
}

// =============================================================================
// Tool Definitions
// =============================================================================

export const optimizationTools = {
  elenchus_set_compression_mode: {
    description: 'Set the response compression mode for token optimization. Use "compact" for moderate savings or "minimal" for aggressive savings.',
    schema: SetCompressionModeSchema,
    handler: setCompressionMode
  },

  elenchus_get_optimization_stats: {
    description: 'Get current token optimization statistics and recommendations.',
    schema: GetOptimizationStatsSchema,
    handler: getOptimizationStats
  },

  elenchus_configure_optimization: {
    description: 'Configure token optimization settings including compression, context management, and semantic caching.',
    schema: ConfigureOptimizationSchema,
    handler: configureOptimization
  },

  elenchus_estimate_savings: {
    description: 'Estimate potential token savings for a verification session.',
    schema: EstimateSavingsSchema,
    handler: estimateSavings
  }
};
