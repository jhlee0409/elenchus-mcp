/**
 * Session Helper Functions
 * Extracted from startSession to improve readability and maintainability
 */

import {
  FileContext
} from '../types/index.js';
import {
  CacheConfig,
  CacheLookupResult,
  DEFAULT_CACHE_CONFIG
} from '../cache/types.js';
import {
  initializeCache,
  batchLookupCache,
  generateCacheSummary,
  estimateTokenSavings
} from '../cache/index.js';
import {
  ChunkingConfig,
  CodeChunk,
  DEFAULT_CHUNKING_CONFIG
} from '../chunking/types.js';
import { chunkContextFiles } from '../chunking/index.js';
import {
  DifferentialConfig,
  DiffResult,
  DEFAULT_DIFFERENTIAL_CONFIG
} from '../diff/types.js';
import {
  getDiffForSession,
  findAffectedDependencies,
  generateDiffSummary
} from '../diff/index.js';
import {
  PipelineConfig,
  DEFAULT_PIPELINE_CONFIG
} from '../pipeline/types.js';
import { initializePipeline, getFilesForTier } from '../pipeline/index.js';
import {
  SafeguardsState,
  PeriodicVerificationConfig,
  ConfidenceConfig,
  SamplingConfig
} from '../safeguards/types.js';
import {
  initializeSafeguards,
  shouldForceFullVerification,
  getPeriodicStatus
} from '../safeguards/index.js';
import { MediatorState } from '../mediator/types.js';
import { getRolePrompt, getRoleDefinition } from '../roles/index.js';
import { VerifierRole, RoleEnforcementConfig } from '../roles/types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Local type for role enforcement state (matches initializeRoleEnforcement return)
 */
interface RoleEnforcementState {
  sessionId: string;
  currentExpectedRole: VerifierRole;
  config: RoleEnforcementConfig;
  complianceHistory: unknown[];
}

/**
 * Safeguards configuration subset
 */
interface SafeguardsConfigInput {
  enabled?: boolean;
  periodic?: Partial<PeriodicVerificationConfig>;
  confidence?: Partial<ConfidenceConfig>;
  sampling?: Partial<SamplingConfig>;
}

// =============================================================================
// Differential Analysis Helpers
// =============================================================================

export interface DifferentialInitResult {
  diffResult: DiffResult | null;
  diffConfig: DifferentialConfig;
}

/**
 * Initialize differential analysis for a session
 */
export async function initializeDifferential(
  workingDir: string,
  files: Map<string, FileContext>,
  configOverride?: Partial<DifferentialConfig>
): Promise<DifferentialInitResult> {
  const diffConfig: DifferentialConfig = configOverride
    ? { ...DEFAULT_DIFFERENTIAL_CONFIG, ...configOverride }
    : DEFAULT_DIFFERENTIAL_CONFIG;

  if (!diffConfig.enabled) {
    return { diffResult: null, diffConfig };
  }

  const diffResult = await getDiffForSession(workingDir, diffConfig, files);

  // Mark files with their change status
  if (diffResult) {
    for (const [filePath, fileCtx] of files) {
      const changedFile = diffResult.changedFiles.find((f: { path: string }) => f.path === filePath);
      if (changedFile) {
        fileCtx.changeStatus = changedFile.status;
        if (changedFile.hunks) {
          fileCtx.changedLines = changedFile.hunks.flatMap((h: { newLines: number; newStart: number }) =>
            Array.from({ length: h.newLines }, (_, i) => h.newStart + i)
          );
        }
        fileCtx.diffSummary = `${changedFile.status}: +${changedFile.linesAdded}/-${changedFile.linesDeleted}`;
      } else {
        fileCtx.changeStatus = 'unchanged';
        // Check if affected by changed files
        if (diffConfig.includeAffectedDependencies) {
          const changedPaths = diffResult.changedFiles.map((f: { path: string }) => f.path);
          const affected = findAffectedDependencies(
            changedPaths,
            files,
            diffConfig.maxAffectedDepth || 2
          );
          if (affected.includes(filePath)) {
            fileCtx.affectedByChanges = true;
          } else {
            fileCtx.skipVerification = true;
          }
        }
      }
    }
  }

  return { diffResult, diffConfig };
}

// =============================================================================
// Cache Initialization Helpers
// =============================================================================

export interface CacheInitResult {
  cacheResults: Map<string, CacheLookupResult> | null;
  cacheSummary: string | null;
  cacheConfig: CacheConfig;
}

/**
 * Initialize cache and lookup cached results for session files
 */
export async function initializeCacheForSession(
  files: Map<string, FileContext>,
  requirements: string,
  configOverride?: Partial<CacheConfig>
): Promise<CacheInitResult> {
  const cacheConfig: CacheConfig = configOverride
    ? { ...DEFAULT_CACHE_CONFIG, ...configOverride, storagePath: '' }
    : DEFAULT_CACHE_CONFIG;

  if (!cacheConfig.enabled) {
    return { cacheResults: null, cacheSummary: null, cacheConfig };
  }

  await initializeCache(cacheConfig);
  const cacheResults = await batchLookupCache(files, requirements, cacheConfig);
  const cacheSummary = generateCacheSummary(cacheResults);

  return { cacheResults, cacheSummary, cacheConfig };
}

// =============================================================================
// Chunking Helpers
// =============================================================================

export interface ChunkingInitResult {
  chunkingResult: {
    chunks: CodeChunk[];
    summary: string;
    tokenSavings: { before: number; after: number; percentage: number };
  } | null;
  chunkingConfig: ChunkingConfig;
}

/**
 * Initialize chunking for session files
 */
export function initializeChunking(
  files: Map<string, FileContext>,
  configOverride?: Partial<ChunkingConfig>
): ChunkingInitResult {
  const chunkingConfig: ChunkingConfig = configOverride
    ? {
        ...DEFAULT_CHUNKING_CONFIG,
        ...configOverride,
        priorityCategories: ['SECURITY', 'CORRECTNESS'],
        alwaysIncludeTypes: ['function', 'method', 'class']
      }
    : DEFAULT_CHUNKING_CONFIG;

  if (!chunkingConfig.enabled) {
    return { chunkingResult: null, chunkingConfig };
  }

  const chunkingResult = chunkContextFiles(files, chunkingConfig);
  return { chunkingResult, chunkingConfig };
}

// =============================================================================
// Pipeline Helpers
// =============================================================================

export interface PipelineInitResult {
  pipelineState: ReturnType<typeof initializePipeline> | null;
  pipelineConfig: PipelineConfig;
}

/**
 * Initialize tiered verification pipeline
 */
export function initializePipelineForSession(
  sessionId: string,
  configOverride?: Partial<PipelineConfig>
): PipelineInitResult {
  const pipelineConfig: PipelineConfig = configOverride
    ? {
        ...DEFAULT_PIPELINE_CONFIG,
        ...configOverride,
        tierConfigs: DEFAULT_PIPELINE_CONFIG.tierConfigs,
        escalationRules: DEFAULT_PIPELINE_CONFIG.escalationRules
      }
    : DEFAULT_PIPELINE_CONFIG;

  if (!pipelineConfig.enabled) {
    return { pipelineState: null, pipelineConfig };
  }

  const pipelineState = initializePipeline(sessionId, pipelineConfig);
  return { pipelineState, pipelineConfig };
}

// =============================================================================
// Safeguards Helpers
// =============================================================================

export interface SafeguardsInitResult {
  safeguardsState: SafeguardsState | null;
}

/**
 * Initialize quality safeguards
 */
export function initializeSafeguardsForSession(
  sessionId: string,
  workingDir: string,
  files: string[],
  config?: SafeguardsConfigInput
): SafeguardsInitResult {
  if (config?.enabled === false) {
    return { safeguardsState: null };
  }

  const safeguardsState = initializeSafeguards(
    sessionId,
    workingDir,
    {
      periodic: config?.periodic,
      confidence: config?.confidence,
      sampling: config?.sampling
    }
  );

  // Check if full verification should be forced
  const forceDecision = shouldForceFullVerification(
    workingDir,
    files,
    1.0, // Initial confidence
    safeguardsState.periodic.config
  );

  if (forceDecision.forceFullVerification) {
    safeguardsState.periodic.lastDecision = forceDecision;
  }

  return { safeguardsState };
}

// =============================================================================
// Response Builders
// =============================================================================

/**
 * Build mediator section of startSession response
 */
export function buildMediatorResponse(mediatorState: MediatorState): object {
  return {
    initialized: true,
    graphNodes: mediatorState.graph.nodes.size,
    graphEdges: mediatorState.graph.edges.length,
    criticalFiles: mediatorState.coverage.unverifiedCritical.length
  };
}

/**
 * Build roles section of startSession response
 */
export function buildRolesResponse(roleState: RoleEnforcementState): object {
  const verifierPrompt = getRolePrompt('verifier');
  return {
    initialized: true,
    expectedRole: roleState.currentExpectedRole,
    config: roleState.config,
    verifierGuidelines: {
      mustDo: getRoleDefinition('verifier').mustDo.slice(0, 3),
      mustNotDo: getRoleDefinition('verifier').mustNotDo.slice(0, 3)
    },
    firstRolePrompt: verifierPrompt.systemPrompt.slice(0, 500) + '...'
  };
}

/**
 * Build verification mode section of startSession response
 */
export function buildVerificationModeResponse(
  verificationMode?: { mode?: string; skipCriticForCleanCode?: boolean }
): object | undefined {
  if (!verificationMode) return undefined;

  return {
    mode: verificationMode.mode || 'standard',
    description: verificationMode.mode === 'fast-track'
      ? 'Fast-track mode: Can converge in 1 round if no issues found'
      : verificationMode.mode === 'single-pass'
        ? 'Single-pass mode: Verifier only, no Critic review required'
        : 'Standard mode: Full Verifier↔Critic loop',
    settings: verificationMode
  };
}

/**
 * Build pre-analysis section of startSession response
 */
export function buildPreAnalysisResponse(
  preAnalysisResults: Array<{ filePath: string; findings: Array<unknown> }>,
  summary: string
): object {
  return {
    totalFindings: preAnalysisResults.reduce((sum, r) => sum + r.findings.length, 0),
    filesWithFindings: preAnalysisResults.length,
    summary,
    details: preAnalysisResults.slice(0, 10)
  };
}

/**
 * Build differential analysis section of startSession response
 */
export function buildDifferentialResponse(
  diffResult: DiffResult | null,
  diffConfig: DifferentialConfig,
  files?: Map<string, FileContext>
): object | undefined {
  if (diffResult) {
    const skippableFiles = files
      ? Array.from(files.entries())
          .filter(([_, ctx]) => ctx.skipVerification)
          .map(([path]) => path)
      : [];

    return {
      enabled: true,
      method: diffResult.method,
      baseRef: diffResult.baseRef,
      baseTimestamp: diffResult.baseTimestamp,
      summary: {
        totalChanged: diffResult.summary.totalChanged,
        totalAdded: diffResult.summary.totalAdded,
        totalModified: diffResult.summary.totalModified,
        totalDeleted: diffResult.summary.totalDeleted,
        totalLinesChanged: diffResult.summary.totalLinesChanged
      },
      filesToVerify: diffResult.changedFiles.map((f: { path: string; status: string; linesAdded: number; linesDeleted: number }) => ({
        path: f.path,
        status: f.status,
        linesChanged: f.linesAdded + f.linesDeleted
      })),
      skippableFiles,
      tokenSavingsEstimate: `~${Math.round((1 - diffResult.summary.totalChanged / (files?.size || 1)) * 100)}% context reduction`,
      guidance: generateDiffSummary(diffResult)
    };
  }

  if (diffConfig.enabled) {
    return {
      enabled: true,
      fallbackReason: 'No baseline found, using full verification',
      suggestion: 'Run elenchus_save_baseline after successful verification to enable differential mode'
    };
  }

  return undefined;
}

/**
 * Build cache section of startSession response
 */
export function buildCacheResponse(
  cacheResults: Map<string, CacheLookupResult> | null,
  cacheConfig: CacheConfig,
  totalFiles: number
): object | undefined {
  if (cacheResults) {
    const savings = estimateTokenSavings(cacheResults);
    return {
      enabled: true,
      stats: {
        cachedFiles: savings.cachedFiles,
        uncachedFiles: savings.uncachedFiles,
        hitRate: Math.round(savings.cacheHitRate * 100) + '%',
        estimatedTokensSaved: savings.estimatedTokensSaved
      },
      cachedFilePaths: Array.from(cacheResults.entries())
        .filter(([_, r]) => r.found)
        .map(([path, r]) => ({
          path,
          ageSeconds: r.ageSeconds,
          tokensSaved: r.tokensSaved
        }))
        .slice(0, 20),
      guidance: `${savings.cachedFiles} files have cached verification results. Focus on the ${savings.uncachedFiles} uncached files for detailed verification.`
    };
  }

  if (cacheConfig.enabled) {
    return {
      enabled: true,
      stats: { cachedFiles: 0, uncachedFiles: totalFiles },
      guidance: 'Cache enabled but no cached results found. Results will be cached after this session.'
    };
  }

  return undefined;
}

/**
 * Build chunking section of startSession response
 */
export function buildChunkingResponse(
  chunkingResult: ChunkingInitResult['chunkingResult'],
  chunkingConfig: ChunkingConfig
): object | undefined {
  if (chunkingResult) {
    return {
      enabled: true,
      summary: chunkingResult.summary,
      stats: {
        totalChunks: chunkingResult.chunks.length,
        tokensBefore: chunkingResult.tokenSavings.before,
        tokensAfter: chunkingResult.tokenSavings.after,
        savingsPercentage: chunkingResult.tokenSavings.percentage + '%'
      },
      chunks: chunkingResult.chunks.slice(0, 15).map(c => ({
        id: c.id,
        filePath: c.filePath,
        symbols: c.symbols.map(s => s.name),
        tokenCount: c.tokenCount,
        priority: c.priority,
        hints: c.verificationHints
      })),
      guidance: `Code chunked into ${chunkingResult.chunks.length} pieces. Verify each chunk focusing on its specific symbols. Token savings: ${chunkingResult.tokenSavings.percentage}%`
    };
  }

  if (chunkingConfig.enabled) {
    return {
      enabled: true,
      guidance: 'Chunking enabled but no chunks created (files may be too small).'
    };
  }

  return undefined;
}

/**
 * Build pipeline section of startSession response
 */
export function buildPipelineResponse(
  pipelineState: PipelineInitResult['pipelineState'],
  pipelineConfig: PipelineConfig,
  files?: Map<string, FileContext>
): object | undefined {
  if (pipelineState) {
    const tierConfig = pipelineConfig.tierConfigs[pipelineState.currentTier];
    return {
      enabled: true,
      currentTier: pipelineState.currentTier,
      tierDescription: tierConfig.description,
      tierConfig: {
        categories: tierConfig.categories,
        minSeverity: tierConfig.minSeverity,
        includeEdgeCases: tierConfig.includeEdgeCases,
        promptStyle: tierConfig.promptStyle
      },
      filesToVerify: getFilesForTier(
        files || new Map(),
        pipelineState.currentTier,
        pipelineConfig
      ).slice(0, 10),
      guidance: `Starting with ${pipelineState.currentTier} tier. ${pipelineConfig.autoEscalate ? 'Will auto-escalate based on findings.' : 'Manual escalation only.'}`
    };
  }

  if (pipelineConfig.enabled) {
    return {
      enabled: true,
      guidance: 'Pipeline enabled but not initialized.'
    };
  }

  return undefined;
}

/**
 * Build safeguards section of startSession response
 */
export function buildSafeguardsResponse(
  safeguardsState: SafeguardsState | null,
  workingDir: string
): object | undefined {
  if (!safeguardsState) return undefined;

  return {
    enabled: true,
    periodicStatus: getPeriodicStatus(workingDir, safeguardsState.periodic.config),
    forceFullVerification: safeguardsState.periodic.lastDecision?.forceFullVerification || false,
    forceReasons: safeguardsState.periodic.lastDecision?.reasons || [],
    samplingConfig: {
      enabled: safeguardsState.sampling.config.enabled,
      rate: safeguardsState.sampling.config.rate,
      strategy: safeguardsState.sampling.config.strategy
    },
    minimumConfidence: safeguardsState.confidence.config.minimumAcceptable,
    guidance: safeguardsState.periodic.lastDecision?.forceFullVerification
      ? `Full verification required: ${safeguardsState.periodic.lastDecision.reasons.join(', ')}`
      : 'Quality safeguards active. Confidence and sampling will be tracked.'
  };
}
