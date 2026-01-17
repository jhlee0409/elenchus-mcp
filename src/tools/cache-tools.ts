/**
 * Cache Management Tools
 * [ENH: CACHE] Cache statistics and management
 */

import { z } from 'zod';
import {
  clearCache,
  getCacheStats
} from '../cache/index.js';
import {
  GetCacheStatsSchema,
  ClearCacheSchema
} from './schemas.js';

/**
 * Get cache statistics
 */
export async function getCacheStatsTool(
  _args: z.infer<typeof GetCacheStatsSchema>
): Promise<{
  totalEntries: number;
  hitCount: number;
  missCount: number;
  hitRate: string;
  averageAge: string;
  totalTokensSaved: number;
  storageSize: string;
}> {
  const stats = getCacheStats();

  return {
    totalEntries: stats.totalEntries,
    hitCount: stats.hitCount,
    missCount: stats.missCount,
    hitRate: `${Math.round(stats.hitRate * 100)}%`,
    averageAge: `${Math.round(stats.averageAge / 3600)} hours`,
    totalTokensSaved: stats.totalTokensSaved,
    storageSize: `${Math.round(stats.storageSize / 1024)} KB`
  };
}

/**
 * Clear all cache entries
 */
export async function clearCacheTool(
  args: z.infer<typeof ClearCacheSchema>
): Promise<{
  success: boolean;
  message: string;
}> {
  if (!args.confirm) {
    return {
      success: false,
      message: 'Cache clear not confirmed. Set confirm: true to proceed.'
    };
  }

  await clearCache();

  return {
    success: true,
    message: 'Cache cleared successfully'
  };
}

// =============================================================================
// Export Tool Definitions
// =============================================================================

export const cacheTools = {
  elenchus_get_cache_stats: {
    description: 'Get cache statistics including hit rate, total entries, and token savings.',
    schema: GetCacheStatsSchema,
    handler: getCacheStatsTool
  },
  elenchus_clear_cache: {
    description: 'Clear all cached verification results. Requires confirm: true.',
    schema: ClearCacheSchema,
    handler: clearCacheTool
  }
};
