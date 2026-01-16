/**
 * Response Caching Module
 * [ENH: CACHE] Main entry point for verification response caching
 */

import {
  CachedVerificationResult,
  CachedIssue,
  CacheConfig,
  CacheLookupResult,
  DEFAULT_CACHE_CONFIG
} from './types.js';
import {
  initializeCache,
  generateCacheKey,
  lookupCache,
  storeInCache,
  invalidateCache,
  clearCache,
  getCacheStats
} from './store.js';
import { Issue, IssueCategory, FileContext } from '../types/index.js';

// Re-export types
export * from './types.js';
export {
  initializeCache,
  generateCacheKey,
  lookupCache,
  storeInCache,
  invalidateCache,
  clearCache,
  getCacheStats
};

/**
 * Create a cacheable issue from a full Issue
 */
export function toCachedIssue(issue: Issue): CachedIssue {
  return {
    category: issue.category,
    severity: issue.severity,
    summary: issue.summary,
    location: issue.location,
    description: issue.description,
    evidence: issue.evidence
  };
}

/**
 * Convert cached issue back to full Issue
 */
export function fromCachedIssue(
  cached: CachedIssue,
  sessionContext: {
    raisedBy: 'verifier' | 'critic';
    round: number;
    idPrefix: string;
    idCounter: number;
  }
): Issue {
  return {
    id: `${sessionContext.idPrefix}-${sessionContext.idCounter}`,
    category: cached.category,
    severity: cached.severity,
    summary: cached.summary,
    location: cached.location,
    description: `[CACHED] ${cached.description}`,
    evidence: cached.evidence,
    raisedBy: sessionContext.raisedBy,
    raisedInRound: sessionContext.round,
    status: 'RAISED'
  };
}

/**
 * Create cache result from verification output
 */
export function createCacheResult(
  fileContent: string,
  requirements: string,
  issues: Issue[],
  summary: string,
  categories: IssueCategory[],
  sessionId?: string,
  round?: number,
  ttlSeconds: number = DEFAULT_CACHE_CONFIG.ttlSeconds
): CachedVerificationResult {
  const cacheKey = generateCacheKey(fileContent, requirements);

  // Determine confidence based on verification completeness
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
  if (categories.length >= 5) {
    confidence = 'HIGH';  // All categories covered
  } else if (categories.length >= 3) {
    confidence = 'MEDIUM';
  } else {
    confidence = 'LOW';
  }

  return {
    cacheKey,
    timestamp: new Date().toISOString(),
    ttlSeconds,
    hitCount: 0,
    issues: issues.map(toCachedIssue),
    verificationSummary: summary,
    categories,
    confidence,
    wasManuallyReviewed: false,
    sourceSessionId: sessionId,
    sourceRound: round
  };
}

/**
 * Try to get cached results for a file
 * Returns null if not found or expired
 */
export async function getCachedVerification(
  fileContext: FileContext,
  requirements: string,
  config: CacheConfig = DEFAULT_CACHE_CONFIG
): Promise<CacheLookupResult> {
  if (!fileContext.content) {
    return { found: false, reason: 'No file content available' };
  }

  const cacheKey = generateCacheKey(fileContext.content, requirements);
  return lookupCache(cacheKey, config);
}

/**
 * Cache verification results for a file
 */
export async function cacheVerification(
  fileContext: FileContext,
  requirements: string,
  issues: Issue[],
  summary: string,
  categories: IssueCategory[],
  sessionId?: string,
  round?: number,
  config: CacheConfig = DEFAULT_CACHE_CONFIG
): Promise<boolean> {
  if (!fileContext.content) return false;

  const result = createCacheResult(
    fileContext.content,
    requirements,
    issues,
    summary,
    categories,
    sessionId,
    round,
    config.ttlSeconds
  );

  return storeInCache(result, config);
}

/**
 * Batch lookup for multiple files
 * Returns map of file path to cache lookup result
 */
export async function batchLookupCache(
  files: Map<string, FileContext>,
  requirements: string,
  config: CacheConfig = DEFAULT_CACHE_CONFIG
): Promise<Map<string, CacheLookupResult>> {
  const results = new Map<string, CacheLookupResult>();

  for (const [path, fileCtx] of files) {
    if (fileCtx.content) {
      const result = await getCachedVerification(fileCtx, requirements, config);
      results.set(path, result);
    } else {
      results.set(path, { found: false, reason: 'No content' });
    }
  }

  return results;
}

/**
 * Calculate potential token savings from cache
 */
export function estimateTokenSavings(
  cacheResults: Map<string, CacheLookupResult>
): {
  cachedFiles: number;
  uncachedFiles: number;
  estimatedTokensSaved: number;
  cacheHitRate: number;
} {
  let cachedFiles = 0;
  let uncachedFiles = 0;
  let tokensSaved = 0;

  for (const result of cacheResults.values()) {
    if (result.found) {
      cachedFiles++;
      tokensSaved += result.tokensSaved || 0;
    } else {
      uncachedFiles++;
    }
  }

  const total = cachedFiles + uncachedFiles;
  return {
    cachedFiles,
    uncachedFiles,
    estimatedTokensSaved: tokensSaved,
    cacheHitRate: total > 0 ? cachedFiles / total : 0
  };
}

/**
 * Generate cache status summary for LLM
 */
export function generateCacheSummary(
  cacheResults: Map<string, CacheLookupResult>
): string {
  const savings = estimateTokenSavings(cacheResults);
  const cachedPaths = Array.from(cacheResults.entries())
    .filter(([_, r]) => r.found)
    .map(([path]) => path);

  if (cachedPaths.length === 0) {
    return 'No cached verification results available.';
  }

  return `## Cache Status

**Cache Hit Rate**: ${Math.round(savings.cacheHitRate * 100)}%
**Files with cached results**: ${savings.cachedFiles}
**Files requiring verification**: ${savings.uncachedFiles}
**Estimated tokens saved**: ~${savings.estimatedTokensSaved}

### Cached Files (can skip detailed verification)
${cachedPaths.slice(0, 10).map(p => `- ${p}`).join('\n')}
${cachedPaths.length > 10 ? `\n... and ${cachedPaths.length - 10} more` : ''}

**Note**: Cached results are from previous verifications. Focus on uncached files.`;
}
