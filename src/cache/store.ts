/**
 * Cache Storage Implementation
 * [ENH: CACHE] File-based cache storage with LRU eviction
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import {
  CacheKey,
  CachedVerificationResult,
  CacheConfig,
  CacheStats,
  CacheLookupResult,
  DEFAULT_CACHE_CONFIG
} from './types.js';
import { StoragePaths } from '../config/index.js';
import { IssueCategory } from '../types/index.js';
import { CACHE_CONSTANTS } from '../config/constants.js';

// Default cache directory (client-agnostic, configurable via ELENCHUS_DATA_DIR)
const DEFAULT_CACHE_DIR = StoragePaths.cache;

// In-memory index for fast lookups
const cacheIndex = new Map<string, {
  filePath: string;
  timestamp: string;
  hitCount: number;
  size: number;
}>();

// Statistics
let stats: CacheStats = {
  totalEntries: 0,
  hitCount: 0,
  missCount: 0,
  hitRate: 0,
  averageAge: 0,
  totalTokensSaved: 0,
  storageSize: 0
};

/**
 * Initialize cache storage
 */
export async function initializeCache(config: Partial<CacheConfig> = {}): Promise<void> {
  const cacheDir = config.storagePath || DEFAULT_CACHE_DIR;
  await fs.mkdir(cacheDir, { recursive: true });

  // Load existing cache index
  await loadCacheIndex(cacheDir);
}

/**
 * Generate cache key from content and requirements
 */
export function generateCacheKey(
  content: string,
  requirements: string,
  category?: IssueCategory
): CacheKey {
  return {
    contentHash: createHash('sha256').update(content).digest('hex').slice(0, CACHE_CONSTANTS.CONTENT_HASH_LENGTH),
    requirementsHash: createHash('sha256').update(requirements).digest('hex').slice(0, CACHE_CONSTANTS.REQUIREMENTS_HASH_LENGTH),
    category
  };
}

/**
 * Convert cache key to string for storage
 */
export function cacheKeyToString(key: CacheKey): string {
  const parts = [key.contentHash, key.requirementsHash];
  if (key.category) parts.push(key.category);
  return parts.join('-');
}

/**
 * Look up cached result
 */
export async function lookupCache(
  key: CacheKey,
  config: CacheConfig = DEFAULT_CACHE_CONFIG
): Promise<CacheLookupResult> {
  if (!config.enabled) {
    return { found: false, reason: 'Cache disabled' };
  }

  const keyStr = cacheKeyToString(key);
  const indexEntry = cacheIndex.get(keyStr);

  if (!indexEntry) {
    stats.missCount++;
    updateHitRate();
    return { found: false, reason: 'Not in cache' };
  }

  try {
    const content = await fs.readFile(indexEntry.filePath, 'utf-8');
    const cached = JSON.parse(content) as CachedVerificationResult;

    // Check TTL
    const ageSeconds = (Date.now() - new Date(cached.timestamp).getTime()) / 1000;
    if (ageSeconds > config.ttlSeconds) {
      stats.missCount++;
      updateHitRate();
      return { found: false, reason: 'Cache expired', ageSeconds };
    }

    // Check confidence
    const confidenceOrder = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
    if (confidenceOrder[cached.confidence] < confidenceOrder[config.minConfidence]) {
      stats.missCount++;
      updateHitRate();
      return { found: false, reason: `Confidence too low: ${cached.confidence}` };
    }

    // Update hit count
    cached.hitCount++;
    indexEntry.hitCount++;
    await fs.writeFile(indexEntry.filePath, JSON.stringify(cached, null, 2));

    stats.hitCount++;
    updateHitRate();

    // Estimate tokens saved
    const tokensSaved = Math.round(content.length / CACHE_CONSTANTS.CHARS_PER_TOKEN);
    stats.totalTokensSaved += tokensSaved;

    return {
      found: true,
      result: cached,
      ageSeconds,
      tokensSaved
    };
  } catch (error) {
    stats.missCount++;
    updateHitRate();
    return { found: false, reason: `Error reading cache: ${error}` };
  }
}

/**
 * Store verification result in cache
 */
export async function storeInCache(
  result: CachedVerificationResult,
  config: CacheConfig = DEFAULT_CACHE_CONFIG
): Promise<boolean> {
  if (!config.enabled) return false;

  // Check if we should cache based on config
  if (!config.cacheIssues && result.issues.length > 0) return false;
  if (!config.cacheCleanResults && result.issues.length === 0) return false;

  const keyStr = cacheKeyToString(result.cacheKey);
  const cacheDir = config.storagePath || DEFAULT_CACHE_DIR;
  const filePath = path.join(cacheDir, `${keyStr}.json`);

  try {
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(result, null, 2));

    // Update index
    const fileStats = await fs.stat(filePath);
    cacheIndex.set(keyStr, {
      filePath,
      timestamp: result.timestamp,
      hitCount: 0,
      size: fileStats.size
    });

    stats.totalEntries = cacheIndex.size;
    stats.storageSize += fileStats.size;

    // Evict if over limit
    if (cacheIndex.size > config.maxEntries) {
      await evictOldEntries(config.maxEntries);
    }

    return true;
  } catch (error) {
    console.error('[Elenchus Cache] Error storing:', error);
    return false;
  }
}

/**
 * Invalidate cache entry
 */
export async function invalidateCache(key: CacheKey): Promise<boolean> {
  const keyStr = cacheKeyToString(key);
  const indexEntry = cacheIndex.get(keyStr);

  if (!indexEntry) return false;

  try {
    await fs.unlink(indexEntry.filePath);
    stats.storageSize -= indexEntry.size;
    cacheIndex.delete(keyStr);
    stats.totalEntries = cacheIndex.size;
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear all cache entries
 */
export async function clearCache(config: CacheConfig = DEFAULT_CACHE_CONFIG): Promise<void> {
  const cacheDir = config.storagePath || DEFAULT_CACHE_DIR;

  try {
    const files = await fs.readdir(cacheDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        await fs.unlink(path.join(cacheDir, file));
      }
    }
    cacheIndex.clear();
    stats = {
      totalEntries: 0,
      hitCount: 0,
      missCount: 0,
      hitRate: 0,
      averageAge: 0,
      totalTokensSaved: 0,
      storageSize: 0
    };
  } catch (error) {
    console.error('[Elenchus Cache] Error clearing:', error);
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): CacheStats {
  return { ...stats };
}

/**
 * Load cache index from disk
 */
async function loadCacheIndex(cacheDir: string): Promise<void> {
  try {
    const files = await fs.readdir(cacheDir);
    let totalSize = 0;
    let totalAge = 0;
    let count = 0;

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(cacheDir, file);
      try {
        const fileStats = await fs.stat(filePath);
        const content = await fs.readFile(filePath, 'utf-8');
        const cached = JSON.parse(content) as CachedVerificationResult;

        const keyStr = cacheKeyToString(cached.cacheKey);
        cacheIndex.set(keyStr, {
          filePath,
          timestamp: cached.timestamp,
          hitCount: cached.hitCount,
          size: fileStats.size
        });

        totalSize += fileStats.size;
        totalAge += (Date.now() - new Date(cached.timestamp).getTime()) / 1000;
        count++;
      } catch {
        // Skip invalid cache files
      }
    }

    stats.totalEntries = cacheIndex.size;
    stats.storageSize = totalSize;
    stats.averageAge = count > 0 ? totalAge / count : 0;
  } catch {
    // Cache directory doesn't exist yet
  }
}

/**
 * Evict oldest/least used entries using LRU
 */
async function evictOldEntries(maxEntries: number): Promise<void> {
  // Sort by hit count (LFU) then by timestamp (LRU)
  const entries = Array.from(cacheIndex.entries())
    .sort((a, b) => {
      if (a[1].hitCount !== b[1].hitCount) {
        return a[1].hitCount - b[1].hitCount;  // Lower hit count first
      }
      return new Date(a[1].timestamp).getTime() - new Date(b[1].timestamp).getTime();
    });

  // Remove oldest/least used until under limit
  const toRemove = entries.slice(0, entries.length - maxEntries);
  for (const [key, entry] of toRemove) {
    try {
      await fs.unlink(entry.filePath);
      stats.storageSize -= entry.size;
      cacheIndex.delete(key);
    } catch {
      // File may already be deleted
    }
  }

  stats.totalEntries = cacheIndex.size;
}

/**
 * Update hit rate statistic
 */
function updateHitRate(): void {
  const total = stats.hitCount + stats.missCount;
  stats.hitRate = total > 0 ? stats.hitCount / total : 0;
}
