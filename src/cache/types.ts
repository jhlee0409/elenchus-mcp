/**
 * Response Caching Types
 * [ENH: CACHE] Types for verification response caching
 */

import { IssueCategory, Severity } from '../types/index.js';
import { CACHE_CONSTANTS } from '../config/constants.js';

/**
 * Cache key components for unique identification
 */
export interface CacheKey {
  // File content hash
  contentHash: string;
  // Requirements/query hash
  requirementsHash: string;
  // Category being verified (optional - for category-specific caching)
  category?: IssueCategory;
}

/**
 * Cached verification result for a file
 */
export interface CachedVerificationResult {
  // Cache metadata
  cacheKey: CacheKey;
  timestamp: string;
  ttlSeconds: number;
  hitCount: number;

  // Verification results
  issues: CachedIssue[];
  verificationSummary: string;
  categories: IssueCategory[];

  // Quality indicators
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  wasManuallyReviewed: boolean;

  // Source info
  sourceSessionId?: string;
  sourceRound?: number;
}

/**
 * Simplified issue for caching (without session-specific fields)
 */
export interface CachedIssue {
  category: IssueCategory;
  severity: Severity;
  summary: string;
  location: string;
  description: string;
  evidence: string;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  enabled: boolean;
  // Time-to-live in seconds (default: 24 hours)
  ttlSeconds: number;
  // Maximum cache entries
  maxEntries: number;
  // Minimum confidence to use cached result
  minConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  // Whether to cache results with issues
  cacheIssues: boolean;
  // Whether to cache clean (no issues) results
  cacheCleanResults: boolean;
  // Storage location
  storagePath: string;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  totalEntries: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  averageAge: number;
  totalTokensSaved: number;
  storageSize: number;
}

/**
 * Cache lookup result
 */
export interface CacheLookupResult {
  found: boolean;
  result?: CachedVerificationResult;
  reason?: string;
  ageSeconds?: number;
  tokensSaved?: number;
}

/**
 * Default cache configuration
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  enabled: false,
  ttlSeconds: CACHE_CONSTANTS.DEFAULT_TTL_SECONDS,
  maxEntries: CACHE_CONSTANTS.MAX_CACHE_ENTRIES,
  minConfidence: CACHE_CONSTANTS.DEFAULT_MIN_CONFIDENCE,
  cacheIssues: true,
  cacheCleanResults: true,
  storagePath: ''  // Will be set at runtime
};
