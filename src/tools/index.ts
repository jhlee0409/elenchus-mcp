/**
 * Elenchus MCP Tools
 */

import { z } from 'zod';
import {
  Session,
  Issue,
  Round,
  StartSessionResponse,
  SubmitRoundResponse,
  GetContextResponse,
  ArbiterIntervention,
  InterventionType
} from '../types/index.js';
import {
  createSession,
  getSession,
  updateSessionStatus,
  addRound,
  upsertIssue,
  batchUpsertIssues,
  createCheckpoint,
  rollbackToCheckpoint,
  checkConvergence,
  getIssuesSummary,
  listSessions,
  deleteSessionFromCache,  // [FIX: REL-02]
  detectStaleIssues,       // [ENH: HIGH-02]
  StaleIssueInfo
} from '../state/session.js';
import {
  initializeContext,
  expandContext,
  findNewFileReferences,
  getContextSummary,
  validateIssueEvidence,
  EvidenceValidationResult,
  analyzeContextForIssues,      // [ENH: ONE-SHOT] Pre-analysis
  generatePreAnalysisSummary,   // [ENH: ONE-SHOT] Pre-analysis summary
  PreAnalysisResult             // [ENH: ONE-SHOT] Pre-analysis type
} from '../state/context.js';
import {
  initializeMediator,
  analyzeRoundAndIntervene,
  analyzeRippleEffect,
  analyzeIssueImpact,  // [ENH: AUTO-IMPACT] Auto-attach impact analysis
  getMediatorSummary,
  getMediatorState,
  deleteMediatorState  // [FIX: REL-02]
} from '../mediator/index.js';
import { ActiveIntervention } from '../mediator/types.js';
import {
  initializeRoleEnforcement,
  validateRoleCompliance,
  getExpectedRole,
  getRolePrompt,
  getRoleDefinition,
  getComplianceHistory,
  getRoleEnforcementSummary,
  updateRoleConfig,
  deleteRoleState,  // [FIX: REL-02]
  getRoleState,     // [ENH: CRIT-01] For strict mode check
  shouldUseConciseModeForSession  // [ENH: CONCISE]
} from '../roles/index.js';
// [ENH: DIFF] Differential Analysis imports
import {
  getDiffForSession,
  shouldUseDifferentialMode,
  findAffectedDependencies,
  generateDiffSummary,
  saveBaseline,
  loadBaseline,
  createBaselineFromSession,
  getProjectIndex,
  getGitCommitHash,
  getGitBranch,
  DifferentialConfig,
  DiffResult,
  DEFAULT_DIFFERENTIAL_CONFIG
} from '../diff/index.js';
// [ENH: CACHE] Response caching imports
import {
  initializeCache,
  getCachedVerification,
  cacheVerification,
  batchLookupCache,
  estimateTokenSavings,
  generateCacheSummary,
  clearCache,
  getCacheStats,
  CacheConfig,
  DEFAULT_CACHE_CONFIG
} from '../cache/index.js';
// [ENH: CHUNK] Selective context chunking imports
import {
  chunkContextFiles,
  getChunksForLocation,
  ChunkingConfig,
  DEFAULT_CHUNKING_CONFIG,
  CodeChunk
} from '../chunking/index.js';
// [ENH: TIERED] Tiered pipeline imports
import {
  initializePipeline,
  getPipelineState,
  getCurrentTierPrompt,
  completeTier,
  escalateTier,
  getFilesForTier,
  generatePipelineSummary,
  deletePipelineState,
  PipelineConfig,
  DEFAULT_PIPELINE_CONFIG,
  VerificationTier
} from '../pipeline/index.js';
import { RoleComplianceResult, VerifierRole } from '../roles/types.js';
// [ENH: SAFEGUARDS] Quality safeguards imports
import {
  initializeSafeguards,
  getSafeguardsState,
  updateQualityAssessment,
  generateSafeguardsSummary,
  shouldAllowConvergence,
  deleteSafeguardsState,
  shouldForceFullVerification,
  recordIncremental,
  recordFullVerification,
  getPeriodicStatus,
  calculateCacheConfidence,
  calculateChunkConfidence,
  calculateTierConfidence,
  aggregateSessionConfidence,
  selectFilesForSampling,
  recordSamplingResult,
  getSamplingStats,
  shouldRecommendFullVerification,
  SafeguardsState,
  FileConfidence,
  DEFAULT_PERIODIC_CONFIG,
  DEFAULT_CONFIDENCE_CONFIG,
  DEFAULT_SAMPLING_CONFIG
} from '../safeguards/index.js';
// [ENH: LIFECYCLE] Import lifecycle management
import {
  detectIssueTransitions,
  applyTransition,
  mergeIssues,
  splitIssue,
  changeSeverity,
  IssueTransitionResult
} from '../lifecycle/index.js';
// [ENH: SAMPLING] Auto-loop with MCP Sampling
import {
  runAutoLoop,
  getAutoLoopState,
  onAutoLoopEvent,
  AutoLoopConfig,
  AutoLoopResult,
  DEFAULT_AUTO_LOOP_CONFIG
} from '../sampling/index.js';

// =============================================================================
// Tool Schemas
// =============================================================================

// [ENH: ONE-SHOT] Verification mode configuration schema
export const VerificationModeSchema = z.object({
  mode: z.enum(['standard', 'fast-track', 'single-pass']).default('standard').describe(
    'Verification mode: standard (full Verifier↔Critic loop), fast-track (early convergence for clean code), single-pass (Verifier only)'
  ),
  allowEarlyConvergence: z.boolean().optional().describe('Allow convergence before minimum rounds'),
  skipCriticForCleanCode: z.boolean().optional().describe('Skip Critic review if no issues found'),
  requireSelfReview: z.boolean().optional().describe('Require Verifier self-review in single-pass mode'),
  minRounds: z.number().optional().describe('Override default minimum rounds'),
  stableRoundsRequired: z.number().optional().describe('Override stable rounds requirement')
}).optional();

// [ENH: DIFF] Differential analysis configuration schema
export const DifferentialConfigSchema = z.object({
  enabled: z.boolean().default(false).describe('Enable differential analysis to verify only changed code'),
  baseRef: z.string().optional().describe('Base reference for diff: "last-verified", commit hash, branch name, or HEAD~N'),
  includeAffectedDependencies: z.boolean().optional().default(true).describe('Include files that import changed files'),
  maxAffectedDepth: z.number().optional().default(2).describe('Maximum depth for dependency tracing'),
  skipUnchangedTests: z.boolean().optional().default(false).describe('Skip test files that havent changed'),
  fallbackToFullIfNoBaseline: z.boolean().optional().default(true).describe('Fall back to full verification if no baseline exists'),
  includeLineContext: z.boolean().optional().default(false).describe('Include line-level diff context for focused review')
}).optional();

// [ENH: CACHE] Cache configuration schema
export const CacheConfigSchema = z.object({
  enabled: z.boolean().default(false).describe('Enable response caching for repeated verifications'),
  ttlSeconds: z.number().optional().default(86400).describe('Time-to-live for cache entries in seconds (default: 24 hours)'),
  minConfidence: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional().default('MEDIUM').describe('Minimum confidence level to use cached results'),
  cacheIssues: z.boolean().optional().default(true).describe('Cache results that contain issues'),
  cacheCleanResults: z.boolean().optional().default(true).describe('Cache results with no issues')
}).optional();

// [ENH: CHUNK] Chunking configuration schema
export const ChunkingConfigSchema = z.object({
  enabled: z.boolean().default(false).describe('Enable selective context (function-level chunking)'),
  maxTokensPerChunk: z.number().optional().default(2000).describe('Maximum tokens per chunk'),
  includeRelated: z.boolean().optional().default(true).describe('Include related symbols in chunks'),
  maxRelatedDepth: z.number().optional().default(1).describe('Maximum depth for related symbol inclusion'),
  minSymbolTokensToChunk: z.number().optional().default(50).describe('Minimum symbol size to chunk separately')
}).optional();

// [ENH: TIERED] Pipeline configuration schema
export const PipelineConfigSchema = z.object({
  enabled: z.boolean().default(false).describe('Enable tiered verification pipeline'),
  startTier: z.enum(['screen', 'focused', 'exhaustive']).optional().default('screen').describe('Starting verification tier'),
  autoEscalate: z.boolean().optional().default(true).describe('Automatically escalate based on findings'),
  maxTotalTokens: z.number().optional().default(50000).describe('Maximum total tokens across all tiers'),
  exhaustivePatterns: z.array(z.string()).optional().describe('File patterns that always get exhaustive verification')
}).optional();

// [ENH: SAFEGUARDS] Safeguards configuration schema
export const SafeguardsConfigSchema = z.object({
  enabled: z.boolean().default(true).describe('Enable quality safeguards'),
  periodic: z.object({
    enabled: z.boolean().default(true).describe('Enable periodic full verification'),
    incrementalThreshold: z.number().optional().default(5).describe('Number of incremental verifications before forcing full scan'),
    maxHoursSinceFull: z.number().optional().default(24).describe('Maximum hours since last full verification'),
    confidenceFloor: z.number().optional().default(0.6).describe('Minimum confidence to avoid full verification'),
    alwaysFullPatterns: z.array(z.string()).optional().describe('File patterns that always require full verification')
  }).optional(),
  confidence: z.object({
    minimumAcceptable: z.number().optional().default(0.7).describe('Minimum acceptable confidence score')
  }).optional(),
  sampling: z.object({
    enabled: z.boolean().default(true).describe('Enable random sampling of skipped files'),
    rate: z.number().optional().default(10).describe('Sampling rate percentage (0-100)'),
    minSamples: z.number().optional().default(2).describe('Minimum number of files to sample'),
    strategy: z.enum(['UNIFORM', 'RISK_WEIGHTED', 'CHANGE_WEIGHTED', 'DEPENDENCY_WEIGHTED']).optional().default('RISK_WEIGHTED').describe('Sampling strategy')
  }).optional()
}).optional();

// [ENH: SAMPLING] Auto-loop configuration schema
export const AutoLoopConfigSchema = z.object({
  maxRounds: z.number().optional().default(10).describe('Maximum rounds before forcibly stopping'),
  maxTokens: z.number().optional().default(4000).describe('Maximum tokens per LLM request'),
  stopOnCritical: z.boolean().optional().default(false).describe('Stop on first CRITICAL issue found'),
  minRounds: z.number().optional().default(2).describe('Minimum rounds before allowing convergence'),
  enableProgress: z.boolean().optional().default(true).describe('Enable streaming progress updates'),
  modelHint: z.enum(['fast', 'balanced', 'thorough']).optional().describe('Model hint for client'),
  includePreAnalysis: z.boolean().optional().default(true).describe('Include pre-analysis findings in first prompt'),
  autoConsolidate: z.boolean().optional().default(true).describe('Auto-consolidate issues at end')
}).optional();

// [ENH: SAMPLING] Auto-verification schema
export const AutoVerifySchema = z.object({
  target: z.string().describe('Target path to verify (file or directory)'),
  requirements: z.string().describe('User verification requirements'),
  workingDir: z.string().describe('Working directory for relative paths'),
  config: AutoLoopConfigSchema.describe('Auto-loop configuration')
});

export const GetAutoLoopStatusSchema = z.object({
  sessionId: z.string().describe('Session ID to get auto-loop status for')
});

export const StartSessionSchema = z.object({
  target: z.string().describe('Target path to verify (file or directory)'),
  requirements: z.string().describe('User verification requirements'),
  workingDir: z.string().describe('Working directory for relative paths'),
  maxRounds: z.number().optional().default(10).describe('Maximum rounds before forced stop'),
  // [ENH: ONE-SHOT] Verification mode for one-shot verification
  verificationMode: VerificationModeSchema.describe(
    'Verification mode configuration for controlling convergence behavior. Use "fast-track" or "single-pass" for one-shot verification.'
  ),
  // [ENH: DIFF] Differential analysis configuration
  differentialConfig: DifferentialConfigSchema.describe(
    'Differential analysis configuration. When enabled, only verifies code that has changed since the last verification baseline.'
  ),
  // [ENH: CACHE] Response caching configuration
  cacheConfig: CacheConfigSchema.describe(
    'Response caching configuration. When enabled, caches verification results to skip re-verification of unchanged files.'
  ),
  // [ENH: CHUNK] Selective context chunking configuration
  chunkingConfig: ChunkingConfigSchema.describe(
    'Selective context configuration. When enabled, chunks files into function-level pieces for more efficient verification.'
  ),
  // [ENH: TIERED] Tiered pipeline configuration
  pipelineConfig: PipelineConfigSchema.describe(
    'Tiered pipeline configuration. When enabled, uses screen→focused→exhaustive verification tiers with auto-escalation.'
  ),
  // [ENH: SAFEGUARDS] Quality safeguards configuration
  safeguardsConfig: SafeguardsConfigSchema.describe(
    'Quality safeguards configuration. Ensures verification quality when using optimizations (caching, chunking, tiered).'
  )
});

export const GetContextSchema = z.object({
  sessionId: z.string().describe('Session ID')
});

export const SubmitRoundSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  role: z.enum(['verifier', 'critic']).describe('Role of this round'),
  output: z.string().describe('Complete output from the agent'),
  issuesRaised: z.array(z.object({
    id: z.string(),
    category: z.enum(['SECURITY', 'CORRECTNESS', 'RELIABILITY', 'MAINTAINABILITY', 'PERFORMANCE']),
    severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
    summary: z.string(),
    location: z.string(),
    description: z.string(),
    evidence: z.string()
  })).optional().describe('New issues raised in this round'),
  issuesResolved: z.array(z.string()).optional().describe('Issue IDs resolved in this round')
});

export const GetIssuesSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  status: z.enum(['all', 'unresolved', 'critical']).optional().default('all')
});

export const CheckpointSchema = z.object({
  sessionId: z.string().describe('Session ID')
});

export const RollbackSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  toRound: z.number().describe('Round number to rollback to')
});

export const EndSessionSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  verdict: z.enum(['PASS', 'FAIL', 'CONDITIONAL']).describe('Final verdict')
});

// [ENH: REVERIFY] Re-verification Phase schema
export const StartReVerificationSchema = z.object({
  previousSessionId: z.string().describe('ID of the original verification session'),
  targetIssueIds: z.array(z.string()).optional().describe('Specific issue IDs to re-verify (if empty, all resolved issues)'),
  workingDir: z.string().describe('Working directory for relative paths'),
  maxRounds: z.number().optional().default(6).describe('Maximum rounds for re-verification (default: 6)')
});

// [ENH: ONE-SHOT] In-session fix application schema
export const ApplyFixSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  issueId: z.string().describe('Issue ID being fixed'),
  fixDescription: z.string().describe('Description of the fix applied'),
  filesModified: z.array(z.string()).describe('List of files modified'),
  triggerReVerify: z.boolean().optional().default(true).describe('Whether to trigger re-verification after fix')
});

// [ENH: DIFF] Baseline and differential analysis schemas
export const SaveBaselineSchema = z.object({
  sessionId: z.string().describe('Session ID of successful verification to use as baseline'),
  workingDir: z.string().describe('Working directory for the project')
});

export const GetDiffSummarySchema = z.object({
  workingDir: z.string().describe('Working directory for the project'),
  baseRef: z.string().optional().describe('Base reference: "last-verified", commit hash, or branch (default: last-verified)')
});

export const GetProjectHistorySchema = z.object({
  workingDir: z.string().describe('Working directory for the project')
});

// [ENH: CACHE] Cache management schemas
export const GetCacheStatsSchema = z.object({
  workingDir: z.string().optional().describe('Working directory (optional, for context)')
});

export const ClearCacheSchema = z.object({
  confirm: z.boolean().describe('Confirm cache clear operation')
});

// [ENH: TIERED] Pipeline management schemas
export const GetPipelineStatusSchema = z.object({
  sessionId: z.string().describe('Session ID')
});

export const EscalateTierSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  targetTier: z.enum(['focused', 'exhaustive']).describe('Target tier to escalate to'),
  reason: z.string().describe('Reason for escalation'),
  scope: z.array(z.string()).optional().describe('Files to focus on (if any)')
});

export const CompleteTierSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  filesVerified: z.number().describe('Number of files verified'),
  issuesFound: z.number().describe('Total issues found'),
  criticalIssues: z.number().describe('Critical issues found'),
  highIssues: z.number().describe('High issues found'),
  tokensUsed: z.number().describe('Tokens used in this tier'),
  timeMs: z.number().describe('Time taken in milliseconds')
});

// [ENH: SAFEGUARDS] Safeguards tool schemas
export const GetSafeguardsStatusSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  projectId: z.string().describe('Project ID (usually workingDir)')
});

export const UpdateConfidenceSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  fileConfidences: z.array(z.object({
    file: z.string(),
    source: z.enum(['full', 'cache', 'chunk', 'tiered', 'sampled']),
    score: z.number(),
    cacheAge: z.number().optional(),
    chunkCoverage: z.number().optional(),
    tierLevel: z.string().optional()
  })).describe('Confidence scores for each file')
});

export const RecordSamplingResultSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  filePath: z.string().describe('Path of the sampled file'),
  issuesFound: z.number().describe('Number of issues found'),
  severities: z.array(z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])).describe('Severities of issues found')
});

export const CheckConvergenceAllowedSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  strictMode: z.boolean().optional().default(false).describe('Use strict quality requirements')
});

// =============================================================================
// Tool Implementations
// =============================================================================

/**
 * Start a new verification session
 * [ENH: ONE-SHOT] Added verificationMode support for one-shot verification
 * [ENH: DIFF] Added differential analysis support
 * [ENH: CACHE] Added response caching support
 * [ENH: CHUNK] Added selective context chunking support
 * [ENH: TIERED] Added tiered pipeline support
 */
export async function startSession(
  args: z.infer<typeof StartSessionSchema>
): Promise<StartSessionResponse & {
  mediator?: object;
  roles?: object;
  verificationMode?: object;
  preAnalysis?: object;  // [ENH: ONE-SHOT] Pre-analysis results
  differential?: object; // [ENH: DIFF] Differential analysis results
  cache?: object;        // [ENH: CACHE] Cache lookup results
  chunking?: object;     // [ENH: CHUNK] Chunking results
  pipeline?: object;     // [ENH: TIERED] Pipeline state
  safeguards?: object;   // [ENH: SAFEGUARDS] Quality safeguards state
}> {
  const session = await createSession(args.target, args.requirements, args.maxRounds);

  // [ENH: ONE-SHOT] Set verification mode on session
  if (args.verificationMode) {
    session.verificationMode = args.verificationMode;
  }

  // Initialize context
  await initializeContext(session.id, args.target, args.workingDir);
  await updateSessionStatus(session.id, 'initialized');

  // [ENH: DIFF] Check for differential mode and analyze changes
  let diffResult: DiffResult | null = null;
  const diffConfig: DifferentialConfig = args.differentialConfig
    ? { ...DEFAULT_DIFFERENTIAL_CONFIG, ...args.differentialConfig }
    : DEFAULT_DIFFERENTIAL_CONFIG;

  if (diffConfig.enabled) {
    const updatedSessionForDiff = await getSession(session.id);
    if (updatedSessionForDiff) {
      diffResult = await getDiffForSession(
        args.workingDir,
        diffConfig,
        updatedSessionForDiff.context.files
      );

      // Mark files with their change status
      if (diffResult) {
        for (const [filePath, fileCtx] of updatedSessionForDiff.context.files) {
          const changedFile = diffResult.changedFiles.find(f => f.path === filePath);
          if (changedFile) {
            fileCtx.changeStatus = changedFile.status;
            if (changedFile.hunks) {
              fileCtx.changedLines = changedFile.hunks.flatMap(h =>
                Array.from({ length: h.newLines }, (_, i) => h.newStart + i)
              );
            }
            fileCtx.diffSummary = `${changedFile.status}: +${changedFile.linesAdded}/-${changedFile.linesDeleted}`;
          } else {
            fileCtx.changeStatus = 'unchanged';
            // Check if affected by changed files (imports a changed file)
            if (diffConfig.includeAffectedDependencies) {
              const changedPaths = diffResult.changedFiles.map(f => f.path);
              const affected = findAffectedDependencies(
                changedPaths,
                updatedSessionForDiff.context.files,
                diffConfig.maxAffectedDepth || 2
              );
              if (affected.includes(filePath)) {
                fileCtx.affectedByChanges = true;
              } else {
                fileCtx.skipVerification = true;  // Can skip unchanged, unaffected files
              }
            }
          }
        }
      }
    }
  }

  const updatedSession = await getSession(session.id);

  // [ENH: ONE-SHOT] Persist verification mode to session
  if (updatedSession && args.verificationMode) {
    updatedSession.verificationMode = args.verificationMode;
  }

  // [ENH: CACHE] Check cache for previously verified files
  let cacheResults: Map<string, any> | null = null;
  let cacheSummary: string | null = null;
  const cacheConfig: CacheConfig = args.cacheConfig
    ? { ...DEFAULT_CACHE_CONFIG, ...args.cacheConfig, storagePath: '' }
    : DEFAULT_CACHE_CONFIG;

  if (cacheConfig.enabled && updatedSession) {
    await initializeCache(cacheConfig);
    cacheResults = await batchLookupCache(
      updatedSession.context.files,
      args.requirements,
      cacheConfig
    );
    cacheSummary = generateCacheSummary(cacheResults);
  }

  // [ENH: ONE-SHOT] Perform pre-analysis on collected files
  const preAnalysisResults = updatedSession
    ? analyzeContextForIssues(updatedSession.context)
    : [];
  const preAnalysisSummary = generatePreAnalysisSummary(preAnalysisResults);

  // [ENH: CHUNK] Apply selective context chunking if enabled
  let chunkingResult: { chunks: CodeChunk[]; summary: string; tokenSavings: { before: number; after: number; percentage: number } } | null = null;
  const chunkingConfig: ChunkingConfig = args.chunkingConfig
    ? { ...DEFAULT_CHUNKING_CONFIG, ...args.chunkingConfig, priorityCategories: ['SECURITY', 'CORRECTNESS'], alwaysIncludeTypes: ['function', 'method', 'class'] }
    : DEFAULT_CHUNKING_CONFIG;

  if (chunkingConfig.enabled && updatedSession) {
    chunkingResult = chunkContextFiles(updatedSession.context.files, chunkingConfig);
  }

  // Initialize Mediator
  const files = updatedSession
    ? Array.from(updatedSession.context.files.keys())
    : [];
  const mediatorState = await initializeMediator(session.id, files, args.workingDir);

  // Initialize Role Enforcement
  const roleState = initializeRoleEnforcement(session.id);
  const verifierPrompt = getRolePrompt('verifier');

  // [ENH: TIERED] Initialize pipeline if enabled
  let pipelineState = null;
  const pipelineConfig: PipelineConfig = args.pipelineConfig
    ? { ...DEFAULT_PIPELINE_CONFIG, ...args.pipelineConfig, tierConfigs: DEFAULT_PIPELINE_CONFIG.tierConfigs, escalationRules: DEFAULT_PIPELINE_CONFIG.escalationRules }
    : DEFAULT_PIPELINE_CONFIG;

  if (pipelineConfig.enabled) {
    pipelineState = initializePipeline(session.id, pipelineConfig);
  }

  // [ENH: SAFEGUARDS] Initialize quality safeguards
  let safeguardsState: SafeguardsState | null = null;
  if (args.safeguardsConfig?.enabled !== false) {
    safeguardsState = initializeSafeguards(
      session.id,
      args.workingDir,
      {
        periodic: args.safeguardsConfig?.periodic,
        confidence: args.safeguardsConfig?.confidence,
        sampling: args.safeguardsConfig?.sampling
      }
    );

    // Check if full verification should be forced
    const allFiles = Array.from(updatedSession?.context.files.keys() || []);
    const forceDecision = shouldForceFullVerification(
      args.workingDir,
      allFiles,
      1.0, // Initial confidence
      safeguardsState.periodic.config
    );

    if (forceDecision.forceFullVerification) {
      safeguardsState.periodic.lastDecision = forceDecision;
    }
  }

  return {
    sessionId: session.id,
    status: session.status,
    context: {
      target: args.target,
      filesCollected: updatedSession?.context.files.size || 0,
      requirements: args.requirements
    },
    mediator: {
      initialized: true,
      graphNodes: mediatorState.graph.nodes.size,
      graphEdges: mediatorState.graph.edges.length,
      criticalFiles: mediatorState.coverage.unverifiedCritical.length
    },
    // Role enforcement info
    roles: {
      initialized: true,
      expectedRole: roleState.currentExpectedRole,
      config: roleState.config,
      verifierGuidelines: {
        mustDo: getRoleDefinition('verifier').mustDo.slice(0, 3),
        mustNotDo: getRoleDefinition('verifier').mustNotDo.slice(0, 3)
      },
      firstRolePrompt: verifierPrompt.systemPrompt.slice(0, 500) + '...'
    },
    // [ENH: ONE-SHOT] Verification mode info
    verificationMode: args.verificationMode ? {
      mode: args.verificationMode.mode || 'standard',
      description: args.verificationMode.mode === 'fast-track'
        ? 'Fast-track mode: Can converge in 1 round if no issues found'
        : args.verificationMode.mode === 'single-pass'
          ? 'Single-pass mode: Verifier only, no Critic review required'
          : 'Standard mode: Full Verifier↔Critic loop',
      settings: args.verificationMode
    } : undefined,
    // [ENH: ONE-SHOT] Pre-analysis results for LLM to prioritize
    preAnalysis: {
      totalFindings: preAnalysisResults.reduce((sum, r) => sum + r.findings.length, 0),
      filesWithFindings: preAnalysisResults.length,
      summary: preAnalysisSummary,
      details: preAnalysisResults.slice(0, 10)  // Limit to top 10 files
    },
    // [ENH: DIFF] Differential analysis results
    differential: diffResult ? {
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
      filesToVerify: diffResult.changedFiles.map(f => ({
        path: f.path,
        status: f.status,
        linesChanged: f.linesAdded + f.linesDeleted
      })),
      skippableFiles: updatedSession
        ? Array.from(updatedSession.context.files.entries())
            .filter(([_, ctx]) => ctx.skipVerification)
            .map(([path]) => path)
        : [],
      tokenSavingsEstimate: `~${Math.round((1 - diffResult.summary.totalChanged / (updatedSession?.context.files.size || 1)) * 100)}% context reduction`,
      guidance: generateDiffSummary(diffResult)
    } : (diffConfig.enabled ? {
      enabled: true,
      fallbackReason: 'No baseline found, using full verification',
      suggestion: 'Run elenchus_save_baseline after successful verification to enable differential mode'
    } : undefined),
    // [ENH: CACHE] Cache lookup results
    cache: cacheResults ? (() => {
      const savings = estimateTokenSavings(cacheResults);
      return {
        enabled: true,
        summary: cacheSummary,
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
          .slice(0, 20),  // Limit to 20
        guidance: `${savings.cachedFiles} files have cached verification results. Focus on the ${savings.uncachedFiles} uncached files for detailed verification.`
      };
    })() : (cacheConfig.enabled ? {
      enabled: true,
      stats: { cachedFiles: 0, uncachedFiles: updatedSession?.context.files.size || 0 },
      guidance: 'Cache enabled but no cached results found. Results will be cached after this session.'
    } : undefined),
    // [ENH: CHUNK] Chunking results
    chunking: chunkingResult ? {
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
    } : (chunkingConfig.enabled ? {
      enabled: true,
      guidance: 'Chunking enabled but no chunks created (files may be too small).'
    } : undefined),
    // [ENH: TIERED] Pipeline state
    pipeline: pipelineState ? {
      enabled: true,
      currentTier: pipelineState.currentTier,
      tierDescription: pipelineConfig.tierConfigs[pipelineState.currentTier].description,
      tierConfig: {
        categories: pipelineConfig.tierConfigs[pipelineState.currentTier].categories,
        minSeverity: pipelineConfig.tierConfigs[pipelineState.currentTier].minSeverity,
        includeEdgeCases: pipelineConfig.tierConfigs[pipelineState.currentTier].includeEdgeCases,
        promptStyle: pipelineConfig.tierConfigs[pipelineState.currentTier].promptStyle
      },
      filesToVerify: getFilesForTier(
        updatedSession?.context.files || new Map(),
        pipelineState.currentTier,
        pipelineConfig
      ).slice(0, 10),
      guidance: `Starting with ${pipelineState.currentTier} tier. ${pipelineConfig.autoEscalate ? 'Will auto-escalate based on findings.' : 'Manual escalation only.'}`
    } : (pipelineConfig.enabled ? {
      enabled: true,
      guidance: 'Pipeline enabled but not initialized.'
    } : undefined),
    // [ENH: SAFEGUARDS] Quality safeguards state
    safeguards: safeguardsState ? {
      enabled: true,
      periodicStatus: getPeriodicStatus(args.workingDir, safeguardsState.periodic.config),
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
    } : undefined
  };
}

/**
 * Get current context for verification
 */
export async function getContext(
  args: z.infer<typeof GetContextSchema>
): Promise<GetContextResponse | null> {
  const session = await getSession(args.sessionId);
  if (!session) return null;

  const files = Array.from(session.context.files.entries()).map(([path, ctx]) => ({
    path,
    layer: ctx.layer
  }));

  // [ENH: PROACTIVE-MEDIATOR] Generate proactive context summary
  const proactiveSummary = generateProactiveContextSummary(session);

  return {
    sessionId: session.id,
    target: session.target,
    requirements: session.requirements,
    files,
    currentRound: session.currentRound,
    issuesSummary: getIssuesSummary(session),
    // [ENH: PROACTIVE-MEDIATOR] Proactive guidance for next round
    proactiveSummary
  };
}


// =============================================================================
// [ENH: PROACTIVE-MEDIATOR] Proactive Context Summary Generation
// Provides guidance at round start to improve verification quality
// =============================================================================

interface ProactiveContextSummary {
  // High priority areas to focus on
  focusAreas: string[];
  // Files that haven't been reviewed yet
  unreviewedFiles: string[];
  // Impact-related recommendations
  impactRecommendations: string[];
  // Edge case coverage gaps
  edgeCaseGaps: string[];
  // General recommendations for the round
  recommendations: string[];
}

function generateProactiveContextSummary(session: Session): ProactiveContextSummary {
  const focusAreas: string[] = [];
  const unreviewedFiles: string[] = [];
  const impactRecommendations: string[] = [];
  const edgeCaseGaps: string[] = [];
  const recommendations: string[] = [];

  // 1. Identify unreviewed files
  const allOutputs = session.rounds.map(r => r.output.toLowerCase()).join(' ');
  for (const [file] of session.context.files) {
    const filename = file.split('/').pop() || file;
    if (!allOutputs.includes(filename.toLowerCase())) {
      unreviewedFiles.push(file);
    }
  }
  if (unreviewedFiles.length > 0) {
    focusAreas.push(`${unreviewedFiles.length} files not yet reviewed`);
  }

  // 2. Collect impact-related info from issues
  const highRiskIssues = session.issues.filter(
    i => i.impactAnalysis && 
    (i.impactAnalysis.riskLevel === 'HIGH' || i.impactAnalysis.riskLevel === 'CRITICAL')
  );
  
  for (const issue of highRiskIssues) {
    if (issue.impactAnalysis) {
      const unreviewedCallers = issue.impactAnalysis.callers.filter(
        c => !allOutputs.includes(c.file.toLowerCase())
      );
      if (unreviewedCallers.length > 0) {
        impactRecommendations.push(
          `Issue ${issue.id} affects ${unreviewedCallers.length} unreviewed files: ${unreviewedCallers.slice(0, 2).map(c => c.file).join(', ')}`
        );
      }
    }
  }

  // 3. Check edge case coverage gaps
  const edgeCaseCategories = [
    { name: 'User Behavior', keywords: ['double-click', 'refresh', 'concurrent session'] },
    { name: 'External Dependencies', keywords: ['api fail', 'timeout', 'cascading'] },
    { name: 'Business Logic', keywords: ['permission', 'state transition'] },
    { name: 'Data State', keywords: ['legacy', 'migration', 'corrupt'] }
  ];

  for (const category of edgeCaseCategories) {
    const covered = category.keywords.some(kw => allOutputs.includes(kw));
    if (!covered) {
      edgeCaseGaps.push(category.name);
    }
  }

  if (edgeCaseGaps.length > 0) {
    recommendations.push(`Consider checking edge cases for: ${edgeCaseGaps.join(', ')}`);
  }

  // 4. Round-specific recommendations
  if (session.currentRound === 0) {
    recommendations.push('First round: Focus on critical files and obvious issues');
    recommendations.push('Cover all 5 categories: SECURITY, CORRECTNESS, RELIABILITY, MAINTAINABILITY, PERFORMANCE');
  } else if (session.currentRound >= 2) {
    // Check for unaddressed Critic flags
    const criticRounds = session.rounds.filter(r => r.role === 'critic');
    const lastCriticOutput = criticRounds[criticRounds.length - 1]?.output || '';
    if (lastCriticOutput.includes('FLAG FOR VERIFIER')) {
      recommendations.push('⚠️ Address Critic flags from previous round');
    }
  }

  // 5. Unresolved issues reminder
  const unresolvedCritical = session.issues.filter(
    i => i.status !== 'RESOLVED' && i.severity === 'CRITICAL'
  );
  if (unresolvedCritical.length > 0) {
    focusAreas.push(`${unresolvedCritical.length} CRITICAL issues need resolution`);
  }

  return {
    focusAreas,
    unreviewedFiles: unreviewedFiles.slice(0, 5),  // Limit to 5
    impactRecommendations: impactRecommendations.slice(0, 3),  // Limit to 3
    edgeCaseGaps,
    recommendations
  };
}

/**
 * Submit round output and get analysis
 * [ENH: CRIT-01] Implement strict mode enforcement
 * [ENH: CRIT-02] Add Critic approval requirement for issue resolution
 */
export async function submitRound(
  args: z.infer<typeof SubmitRoundSchema>
): Promise<SubmitRoundResponse & {
  mediatorInterventions?: ActiveIntervention[];
  roleCompliance?: RoleComplianceResult;
  rejected?: boolean;
  rejectionReason?: string;
  evidenceValidation?: Record<string, EvidenceValidationResult>;  // [ENH: HIGH-01]
  staleIssues?: StaleIssueInfo[];  // [ENH: HIGH-02]
  lifecycle?: IssueTransitionResult;  // [ENH: LIFECYCLE]
} | null> {
  const session = await getSession(args.sessionId);
  if (!session) return null;

  // Role Compliance Check
  const roleCompliance = validateRoleCompliance(
    args.sessionId,
    args.role as VerifierRole,
    args.output,
    session
  );

  // [ENH: CRIT-01] Strict mode enforcement - reject non-compliant rounds
  const roleState = getRoleState(args.sessionId);
  if (roleState?.config.strictMode && !roleCompliance.isCompliant) {
    const errorViolations = roleCompliance.violations.filter(v => v.severity === 'ERROR');
    return {
      roundNumber: session.currentRound,
      role: args.role,
      issuesRaised: 0,
      issuesResolved: 0,
      contextExpanded: false,
      newFilesDiscovered: [],
      convergence: checkConvergence(session),
      nextRole: getExpectedRole(args.sessionId),
      roleCompliance,
      // [ENH: CRIT-01] Rejection response
      rejected: true,
      rejectionReason: `Round rejected due to ${errorViolations.length} ERROR violation(s): ${errorViolations.map(v => v.message).join('; ')}`
    };
  }

  // Check for new file references
  const newFiles = findNewFileReferences(args.output, session.context);
  let contextExpanded = false;

  if (newFiles.length > 0) {
    const added = await expandContext(session.id, newFiles, session.currentRound + 1);
    contextExpanded = added.length > 0;
  }

  // Process new issues with evidence validation
  // [ENH: PARALLEL] Parallelized issue processing for better performance
  const raisedIds: string[] = [];
  const newIssues: Issue[] = [];
  const evidenceValidation: Record<string, EvidenceValidationResult> = {};

  if (args.issuesRaised) {
    // Phase 1: Parallel validation and impact analysis (read-only operations)
    const processedResults = await Promise.all(
      args.issuesRaised.map(async (issueData) => {
        // [ENH: HIGH-01] Validate evidence against actual file content
        const validationResult = await validateIssueEvidence(
          session.context,
          issueData.location,
          issueData.evidence
        );

        // [ENH: AUTO-IMPACT] Automatically analyze impact for the issue
        const impactAnalysis = analyzeIssueImpact(session.id, issueData.location);

        return { issueData, validationResult, impactAnalysis };
      })
    );

    // Phase 2: Build issue objects (synchronous)
    const issuesToUpsert: Issue[] = [];
    for (const { issueData, validationResult, impactAnalysis } of processedResults) {
      evidenceValidation[issueData.id] = validationResult;

      const issue: Issue = {
        ...issueData,
        raisedBy: args.role,
        raisedInRound: session.currentRound + 1,
        status: 'RAISED',
        // [ENH: AUTO-IMPACT] Attach impact analysis if available
        impactAnalysis: impactAnalysis || undefined
      };

      // Add validation warning if evidence doesn't match
      if (!validationResult.isValid) {
        issue.description += `\n\n⚠️ Evidence validation warning: ${validationResult.warnings.join('; ')}`;
      }

      // [ENH: AUTO-IMPACT] Add impact warning for high-risk issues
      if (impactAnalysis && (impactAnalysis.riskLevel === 'HIGH' || impactAnalysis.riskLevel === 'CRITICAL')) {
        issue.description += `\n\n⚠️ Impact Analysis: ${impactAnalysis.summary}`;
      }

      issuesToUpsert.push(issue);
      raisedIds.push(issue.id);
      newIssues.push(issue);
    }

    // Phase 3: Batch upsert (single write operation)
    await batchUpsertIssues(session.id, issuesToUpsert);
  }

  // [ENH: CRIT-02] Process Critic verdicts on issues
  if (args.role === 'critic') {
    // Extract verdicts from output using patterns
    const verdictPatterns = [
      /(?:issue\s+)?([A-Z]{3}-\d+)[:\s]+(?:verdict[:\s]+)?(VALID|INVALID|PARTIAL)/gi,
      /(SEC|COR|REL|MNT|PRF)-(\d+)[:\s]+(VALID|INVALID|PARTIAL)/gi
    ];

    for (const pattern of verdictPatterns) {
      let match;
      while ((match = pattern.exec(args.output)) !== null) {
        const issueId = match[1].includes('-') ? match[1] : `${match[1]}-${match[2]}`;
        const verdict = (match[2] || match[3]).toUpperCase() as 'VALID' | 'INVALID' | 'PARTIAL';

        const issue = session.issues.find(i => i.id.toUpperCase() === issueId.toUpperCase());
        if (issue) {
          issue.criticReviewed = true;
          issue.criticVerdict = verdict;
          issue.criticReviewRound = session.currentRound + 1;

          // Only mark as RESOLVED if Critic says INVALID (false positive)
          if (verdict === 'INVALID') {
            issue.status = 'RESOLVED';
            issue.resolvedInRound = session.currentRound + 1;
            issue.resolution = 'Marked as false positive by Critic';
          }

          await upsertIssue(session.id, issue);
        }
      }
    }
  }

  // [ENH: CRIT-02] Process resolved issues - require Critic review
  if (args.issuesResolved) {
    const resolutionResults: { id: string; resolved: boolean; reason: string }[] = [];

    for (const issueId of args.issuesResolved) {
      const issue = session.issues.find(i => i.id === issueId);
      if (issue) {
        // Check if Critic has reviewed this issue
        if (!issue.criticReviewed) {
          resolutionResults.push({
            id: issueId,
            resolved: false,
            reason: 'Critic has not reviewed this issue yet'
          });
          continue;
        }

        // Only allow resolution if Critic marked as VALID or INVALID
        if (issue.criticVerdict === 'VALID' || issue.criticVerdict === 'INVALID') {
          issue.status = 'RESOLVED';
          issue.resolvedInRound = session.currentRound + 1;
          await upsertIssue(session.id, issue);
          resolutionResults.push({
            id: issueId,
            resolved: true,
            reason: `Resolved with Critic verdict: ${issue.criticVerdict}`
          });
        } else {
          resolutionResults.push({
            id: issueId,
            resolved: false,
            reason: `Critic verdict is PARTIAL - needs further review`
          });
        }
      }
    }
  }

  // [ENH: LIFECYCLE] Detect issue transitions from output
  const lifecycleResult = detectIssueTransitions(
    session,
    args.role as 'verifier' | 'critic',
    args.output,
    session.issues
  );

  // Process severity changes
  for (const change of lifecycleResult.severityChanges) {
    const issue = session.issues.find(i => i.id === change.issueId);
    if (issue) {
      const updated = changeSeverity(
        issue,
        change.toSeverity,
        session.currentRound + 1,
        change.reason,
        args.role as 'verifier' | 'critic'
      );
      await upsertIssue(session.id, updated);
    }
  }

  // Process merge requests
  for (const merge of lifecycleResult.mergeRequests) {
    const target = session.issues.find(i => i.id === merge.targetId);
    const sources = session.issues.filter(i => merge.sourceIds.includes(i.id));

    if (target && sources.length > 0) {
      const { target: updatedTarget, sources: updatedSources } = mergeIssues(
        target,
        sources,
        session.currentRound + 1,
        args.role as 'verifier' | 'critic'
      );
      await upsertIssue(session.id, updatedTarget);
      for (const src of updatedSources) {
        await upsertIssue(session.id, src);
      }
    }
  }

  // Process split requests
  for (const split of lifecycleResult.splitRequests) {
    const source = session.issues.find(i => i.id === split.sourceId);
    if (source) {
      const { source: updatedSource, newIssues: splitIssues } = splitIssue(
        source,
        split.newIssues,
        session.currentRound + 1,
        args.role as 'verifier' | 'critic'
      );
      await upsertIssue(session.id, updatedSource);
      for (const newIssue of splitIssues) {
        await upsertIssue(session.id, newIssue);
        raisedIds.push(newIssue.id);
      }
    }
  }

  // Process discovered issues (new issues found during debate)
  for (const discovered of lifecycleResult.newIssues) {
    if (discovered.id && discovered.summary) {
      const issue: Issue = {
        id: discovered.id,
        category: discovered.category || 'CORRECTNESS',
        severity: discovered.severity || 'MEDIUM',
        summary: discovered.summary,
        location: discovered.location || 'TBD',
        description: discovered.description || discovered.summary,
        evidence: discovered.evidence || 'Discovered during debate - evidence to be provided',
        raisedBy: 'critic',
        raisedInRound: session.currentRound + 1,
        status: 'RAISED',
        discoveredDuringDebate: true,
        transitions: [{
          type: 'DISCOVERED',
          fromStatus: 'RAISED',
          toStatus: 'RAISED',
          round: session.currentRound + 1,
          reason: 'Issue discovered during Critic review',
          triggeredBy: 'critic',
          timestamp: new Date().toISOString()
        }]
      };
      await upsertIssue(session.id, issue);
      raisedIds.push(issue.id);
      newIssues.push(issue);
    }
  }

  // Add round
  const round = await addRound(session.id, {
    role: args.role,
    input: getContextSummary(session.context),
    output: args.output,
    issuesRaised: raisedIds,
    issuesResolved: args.issuesResolved || [],
    contextExpanded,
    newFilesDiscovered: newFiles
  });

  // Check for basic arbiter intervention
  const intervention = checkForIntervention(session, args.output, newFiles);

  // Mediator Active Intervention analysis
  const mediatorInterventions = analyzeRoundAndIntervene(
    session,
    args.output,
    args.role,
    newIssues
  );

  // Auto checkpoint every 2 rounds
  if (session.currentRound % 2 === 0) {
    await createCheckpoint(session.id);
  }

  // Check convergence
  const updatedSession = await getSession(session.id);
  const convergence = checkConvergence(updatedSession!);

  // [ENH: ONE-SHOT] Determine next role based on verification mode
  const verificationMode = updatedSession?.verificationMode?.mode || 'standard';
  const expectedNextRole = getExpectedRole(args.sessionId);
  let nextRole: 'verifier' | 'critic' | 'complete' = 'complete';

  if (!convergence.isConverged && session.currentRound < session.maxRounds) {
    // [ENH: ONE-SHOT] Single-pass mode: always Verifier, never Critic
    if (verificationMode === 'single-pass') {
      // In single-pass mode, Verifier continues until convergence
      nextRole = 'verifier';
    }
    // [ENH: ONE-SHOT] Fast-track mode: skip Critic if no issues found
    else if (verificationMode === 'fast-track' &&
             args.role === 'verifier' &&
             raisedIds.length === 0 &&
             (updatedSession?.verificationMode?.skipCriticForCleanCode ?? true)) {
      // No issues found by Verifier, can skip Critic in fast-track mode
      nextRole = 'verifier';  // Continue as Verifier for next round (or complete if converged)
    }
    // Standard mode: alternate Verifier↔Critic
    else {
      nextRole = expectedNextRole;
    }
  }

  // [ENH: CONCISE] Determine if concise mode should be used for next round
  const nextRoundNumber = session.currentRound + 2;  // Next round after current submission
  const useConciseMode = nextRole !== 'complete' &&
    shouldUseConciseModeForSession(updatedSession!, nextRoundNumber);

  // Get next role prompt if not complete
  const nextRolePrompt = nextRole !== 'complete'
    ? getRolePrompt(nextRole, { round: nextRoundNumber, useConciseMode })
    : undefined;

  return {
    roundNumber: round?.number || 0,
    role: args.role,
    issuesRaised: raisedIds.length,
    issuesResolved: args.issuesResolved?.length || 0,
    contextExpanded,
    newFilesDiscovered: newFiles,
    convergence,
    intervention,
    nextRole,
    // Mediator intervention results
    mediatorInterventions: mediatorInterventions.length > 0 ? mediatorInterventions : undefined,
    // Role compliance results
    roleCompliance: {
      ...roleCompliance,
      // Add next role guidance
      nextRoleGuidelines: nextRolePrompt ? {
        role: nextRole,
        // [ENH: CONCISE] Include concise mode info
        conciseMode: useConciseMode,
        round: nextRoundNumber,
        outputFormat: useConciseMode ? 'CONCISE (<500 words)' : 'COMPREHENSIVE',
        mustDo: getRoleDefinition(nextRole as VerifierRole).mustDo.slice(0, 3),
        checklist: nextRolePrompt.checklist
      } : undefined
    } as any,
    // [ENH: HIGH-01] Evidence validation results
    evidenceValidation: Object.keys(evidenceValidation).length > 0 ? evidenceValidation : undefined,
    // [ENH: HIGH-02] Stale issue detection
    staleIssues: (() => {
      const stale = detectStaleIssues(updatedSession!);
      return stale.length > 0 ? stale : undefined;
    })(),
    // [ENH: LIFECYCLE] Issue transition results
    lifecycle: (lifecycleResult.transitions.length > 0 ||
                lifecycleResult.newIssues.length > 0 ||
                lifecycleResult.mergeRequests.length > 0 ||
                lifecycleResult.splitRequests.length > 0 ||
                lifecycleResult.severityChanges.length > 0)
      ? lifecycleResult
      : undefined
  };
}

/**
 * Get issues with optional filtering
 */
export async function getIssues(
  args: z.infer<typeof GetIssuesSchema>
): Promise<Issue[] | null> {
  const session = await getSession(args.sessionId);
  if (!session) return null;

  switch (args.status) {
    case 'unresolved':
      return session.issues.filter(i => i.status !== 'RESOLVED');
    case 'critical':
      return session.issues.filter(i => i.severity === 'CRITICAL');
    default:
      return session.issues;
  }
}

/**
 * Create manual checkpoint
 */
export async function checkpoint(
  args: z.infer<typeof CheckpointSchema>
): Promise<{ success: boolean; roundNumber: number } | null> {
  const cp = await createCheckpoint(args.sessionId);
  if (!cp) return null;

  return {
    success: true,
    roundNumber: cp.roundNumber
  };
}

/**
 * Rollback to previous checkpoint
 */
export async function rollback(
  args: z.infer<typeof RollbackSchema>
): Promise<{ success: boolean; restoredToRound: number } | null> {
  const session = await rollbackToCheckpoint(args.sessionId, args.toRound);
  if (!session) return null;

  return {
    success: true,
    restoredToRound: session.currentRound
  };
}

/**
 * [ENH: ONE-SHOT] Apply fix and optionally trigger re-verification
 * Keeps fix application within the same session for continuity
 */
export async function applyFix(
  args: z.infer<typeof ApplyFixSchema>
): Promise<{
  success: boolean;
  issueId: string;
  status: 'RESOLVED' | 'PENDING_VERIFY';
  nextAction: string;
  reVerifyRequired: boolean;
} | null> {
  const session = await getSession(args.sessionId);
  if (!session) return null;

  // Find the issue
  const issue = session.issues.find(i => i.id === args.issueId);
  if (!issue) {
    return {
      success: false,
      issueId: args.issueId,
      status: 'PENDING_VERIFY',
      nextAction: `Issue ${args.issueId} not found`,
      reVerifyRequired: false
    };
  }

  // Create checkpoint before fix
  await createCheckpoint(args.sessionId);

  // Update issue with fix information
  issue.resolution = args.fixDescription;
  issue.status = args.triggerReVerify ? 'RAISED' : 'RESOLVED';  // Keep as RAISED if re-verify needed

  // Add transition record
  if (!issue.transitions) {
    issue.transitions = [];
  }
  issue.transitions.push({
    type: 'REFINED',
    fromStatus: 'RAISED',
    toStatus: args.triggerReVerify ? 'RAISED' : 'RESOLVED',
    round: session.currentRound,
    reason: `Fix applied: ${args.fixDescription}`,
    triggeredBy: 'verifier',
    timestamp: new Date().toISOString()
  });

  await upsertIssue(args.sessionId, issue);

  // Refresh context for modified files
  if (args.filesModified.length > 0) {
    const updatedSession = await getSession(args.sessionId);
    if (updatedSession) {
      // Re-read modified files into context
      for (const filePath of args.filesModified) {
        // Remove old content
        updatedSession.context.files.delete(filePath);
      }
      // Re-add with updated content
      await expandContext(args.sessionId, args.filesModified, session.currentRound);

      // Run pre-analysis on modified files
      const preAnalysis = analyzeContextForIssues(updatedSession.context);
      const newFindings = preAnalysis
        .filter(r => args.filesModified.some((f: string) => r.file.includes(f)))
        .reduce((sum, r) => sum + r.findings.length, 0);

      if (newFindings > 0) {
        return {
          success: true,
          issueId: args.issueId,
          status: 'PENDING_VERIFY',
          nextAction: `⚠️ Fix applied but pre-analysis found ${newFindings} new potential issues in modified files. Re-verification recommended.`,
          reVerifyRequired: true
        };
      }
    }
  }

  const nextAction = args.triggerReVerify
    ? 'Submit a Verifier round to verify the fix is complete and correct'
    : 'Issue marked as resolved. Continue with remaining issues or end session.';

  return {
    success: true,
    issueId: args.issueId,
    status: args.triggerReVerify ? 'PENDING_VERIFY' : 'RESOLVED',
    nextAction,
    reVerifyRequired: args.triggerReVerify ?? true
  };
}

/**
 * End session with verdict
 */
export async function endSession(
  args: z.infer<typeof EndSessionSchema>
): Promise<{ sessionId: string; verdict: string; summary: object } | null> {
  const session = await getSession(args.sessionId);
  if (!session) return null;

  await updateSessionStatus(session.id, 'converged');

  const result = {
    sessionId: session.id,
    verdict: args.verdict,
    summary: {
      totalRounds: session.currentRound,
      totalIssues: session.issues.length,
      resolvedIssues: session.issues.filter(i => i.status === 'RESOLVED').length,
      unresolvedIssues: session.issues.filter(i => i.status !== 'RESOLVED').length,
      issuesBySeverity: getIssuesSummary(session).bySeverity
    }
  };

  // [FIX: REL-02] Clean up memory caches to prevent memory leaks
  deleteSessionFromCache(session.id);
  deleteMediatorState(session.id);
  deleteRoleState(session.id);

  return result;
}

/**
 * List all sessions
 */
export async function getSessions(): Promise<string[]> {
  return listSessions();
}

// =============================================================================
// [ENH: SAMPLING] Auto-Loop Tools
// =============================================================================

// Server instance for sampling (set by initAutoLoopServer)
let autoLoopServer: any = null;

/**
 * Initialize auto-loop with server instance
 * Must be called from index.ts after server creation
 */
export function initAutoLoopServer(server: any): void {
  autoLoopServer = server;
}

/**
 * Run automatic verification loop using MCP Sampling
 *
 * This tool starts an automated Verifier↔Critic loop where the server
 * autonomously orchestrates verification rounds by requesting LLM completions
 * from the connected client via MCP Sampling.
 *
 * The loop continues until:
 * - Convergence criteria are met
 * - Maximum rounds reached
 * - CRITICAL issue found (if stopOnCritical enabled)
 *
 * @returns AutoLoopResult with session ID, status, issues, and optional consolidated plan
 */
export async function autoVerify(
  args: z.infer<typeof AutoVerifySchema>
): Promise<AutoLoopResult | { error: string }> {
  if (!autoLoopServer) {
    return {
      error: 'Auto-loop server not initialized. Sampling capability may not be available.'
    };
  }

  // Check if client supports sampling
  try {
    const result = await runAutoLoop(
      autoLoopServer,
      args.target,
      args.requirements,
      args.workingDir,
      args.config || {}
    );
    return result;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unknown error during auto-verification'
    };
  }
}

/**
 * Get status of an auto-loop session
 */
export async function getAutoLoopStatus(
  args: z.infer<typeof GetAutoLoopStatusSchema>
): Promise<{
  found: boolean;
  state?: {
    sessionId: string;
    status: string;
    currentRound: number;
    currentRole: string;
    totalIssues: number;
    duration: number;
  };
}> {
  const state = getAutoLoopState(args.sessionId);
  if (!state) {
    return { found: false };
  }

  return {
    found: true,
    state: {
      sessionId: state.sessionId,
      status: state.status,
      currentRound: state.currentRound,
      currentRole: state.currentRole,
      totalIssues: state.issues.length,
      duration: (state.endTime || Date.now()) - state.startTime
    }
  };
}

// =============================================================================
// [ENH: DIFF] Differential Analysis Tools
// =============================================================================

/**
 * Save verification baseline for future differential analysis
 */
export async function saveBaselineTool(
  args: z.infer<typeof SaveBaselineSchema>
): Promise<{
  success: boolean;
  projectPath: string;
  baselineInfo?: {
    timestamp: string;
    sessionId: string;
    totalFiles: number;
    gitCommit?: string;
    gitBranch?: string;
  };
  error?: string;
}> {
  const session = await getSession(args.sessionId);
  if (!session) {
    return {
      success: false,
      projectPath: args.workingDir,
      error: `Session not found: ${args.sessionId}`
    };
  }

  // Get git info
  const gitCommit = await getGitCommitHash(args.workingDir);
  const gitBranch = await getGitBranch(args.workingDir);

  // Create baseline from session
  const baseline = createBaselineFromSession(session, args.workingDir, {
    commit: gitCommit || undefined,
    branch: gitBranch || undefined
  });

  // Save baseline
  await saveBaseline(args.workingDir, baseline);

  return {
    success: true,
    projectPath: args.workingDir,
    baselineInfo: {
      timestamp: baseline.timestamp,
      sessionId: baseline.sessionId,
      totalFiles: baseline.totalFiles,
      gitCommit: baseline.gitCommit,
      gitBranch: baseline.gitBranch
    }
  };
}

/**
 * Get differential analysis summary
 */
export async function getDiffSummaryTool(
  args: z.infer<typeof GetDiffSummarySchema>
): Promise<{
  hasDiff: boolean;
  canUseDifferential: boolean;
  reason: string;
  summary?: {
    method: string;
    baseRef: string;
    baseTimestamp?: string;
    totalChanged: number;
    totalAdded: number;
    totalModified: number;
    totalDeleted: number;
    totalLinesChanged: number;
    changedFiles: Array<{ path: string; status: string; lines: number }>;
    estimatedTokenSavings: string;
  };
  baseline?: {
    timestamp: string;
    sessionId: string;
    gitCommit?: string;
  };
}> {
  // Check if differential mode can be used
  const checkResult = await shouldUseDifferentialMode(args.workingDir, {
    enabled: true,
    baseRef: args.baseRef || 'last-verified'
  });

  if (!checkResult.canUse) {
    return {
      hasDiff: false,
      canUseDifferential: false,
      reason: checkResult.reason
    };
  }

  // Get the diff
  const diffConfig: DifferentialConfig = {
    ...DEFAULT_DIFFERENTIAL_CONFIG,
    enabled: true,
    baseRef: args.baseRef || 'last-verified'
  };

  // We need a dummy files map for getDiffForSession - use loadBaseline hashes
  const baseline = await loadBaseline(args.workingDir);
  if (!baseline) {
    return {
      hasDiff: false,
      canUseDifferential: false,
      reason: 'No baseline found'
    };
  }

  // Create a minimal files map from baseline
  const filesMap = new Map<string, any>();
  for (const [path, _hash] of Object.entries(baseline.fileHashes)) {
    filesMap.set(path, { content: '', dependencies: [], layer: 'base' as const });
  }

  const diffResult = await getDiffForSession(args.workingDir, diffConfig, filesMap);

  if (!diffResult) {
    return {
      hasDiff: false,
      canUseDifferential: true,
      reason: 'No changes detected since last verification',
      baseline: {
        timestamp: baseline.timestamp,
        sessionId: baseline.sessionId,
        gitCommit: baseline.gitCommit
      }
    };
  }

  const totalFiles = Object.keys(baseline.fileHashes).length;
  const estimatedSavings = Math.round((1 - diffResult.summary.totalChanged / totalFiles) * 100);

  return {
    hasDiff: true,
    canUseDifferential: true,
    reason: `${diffResult.summary.totalChanged} files changed since ${baseline.timestamp}`,
    summary: {
      method: diffResult.method,
      baseRef: diffResult.baseRef,
      baseTimestamp: diffResult.baseTimestamp,
      totalChanged: diffResult.summary.totalChanged,
      totalAdded: diffResult.summary.totalAdded,
      totalModified: diffResult.summary.totalModified,
      totalDeleted: diffResult.summary.totalDeleted,
      totalLinesChanged: diffResult.summary.totalLinesChanged,
      changedFiles: diffResult.changedFiles.map(f => ({
        path: f.path,
        status: f.status,
        lines: f.linesAdded + f.linesDeleted
      })),
      estimatedTokenSavings: `~${estimatedSavings}% context reduction`
    },
    baseline: {
      timestamp: baseline.timestamp,
      sessionId: baseline.sessionId,
      gitCommit: baseline.gitCommit
    }
  };
}

/**
 * Get project verification history
 */
export async function getProjectHistoryTool(
  args: z.infer<typeof GetProjectHistorySchema>
): Promise<{
  hasHistory: boolean;
  projectPath: string;
  history?: Array<{
    sessionId: string;
    timestamp: string;
    verdict: string;
    target: string;
  }>;
  lastVerified?: {
    sessionId: string;
    timestamp: string;
    gitCommit?: string;
  };
}> {
  const index = await getProjectIndex(args.workingDir);

  if (!index) {
    return {
      hasHistory: false,
      projectPath: args.workingDir
    };
  }

  return {
    hasHistory: true,
    projectPath: args.workingDir,
    history: index.history,
    lastVerified: index.lastVerifiedSession ? {
      sessionId: index.lastVerifiedSession,
      timestamp: index.lastVerifiedTimestamp || '',
      gitCommit: index.lastVerifiedCommit
    } : undefined
  };
}

// =============================================================================
// [ENH: CACHE] Cache Management Tools
// =============================================================================

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
// [ENH: TIERED] Pipeline Management Tools
// =============================================================================

/**
 * Get pipeline status for a session
 */
export async function getPipelineStatusTool(
  args: z.infer<typeof GetPipelineStatusSchema>
): Promise<{
  hasPipeline: boolean;
  state?: {
    currentTier: VerificationTier;
    completedTiers: VerificationTier[];
    totalTokensUsed: number;
    totalTimeMs: number;
    escalations: number;
  };
  summary?: string;
}> {
  const state = getPipelineState(args.sessionId);

  if (!state) {
    return { hasPipeline: false };
  }

  return {
    hasPipeline: true,
    state: {
      currentTier: state.currentTier,
      completedTiers: state.completedTiers,
      totalTokensUsed: state.totalTokensUsed,
      totalTimeMs: state.totalTimeMs,
      escalations: state.escalations.length
    },
    summary: generatePipelineSummary(args.sessionId) || undefined
  };
}

/**
 * Manually escalate to a higher tier
 */
export async function escalateTierTool(
  args: z.infer<typeof EscalateTierSchema>
): Promise<{
  success: boolean;
  previousTier?: VerificationTier;
  newTier?: VerificationTier;
  message: string;
}> {
  const state = getPipelineState(args.sessionId);
  if (!state) {
    return {
      success: false,
      message: 'No pipeline found for this session'
    };
  }

  const previousTier = state.currentTier;
  const success = escalateTier(args.sessionId, args.targetTier, args.reason, args.scope);

  if (!success) {
    return {
      success: false,
      previousTier,
      message: `Cannot escalate from ${previousTier} to ${args.targetTier}`
    };
  }

  return {
    success: true,
    previousTier,
    newTier: args.targetTier,
    message: `Escalated from ${previousTier} to ${args.targetTier}: ${args.reason}`
  };
}

/**
 * Complete current tier and check for escalation
 */
export async function completeTierTool(
  args: z.infer<typeof CompleteTierSchema>
): Promise<{
  success: boolean;
  tier?: VerificationTier;
  shouldEscalate?: boolean;
  nextTier?: VerificationTier;
  escalationReason?: string;
  message: string;
}> {
  const session = await getSession(args.sessionId);
  if (!session) {
    return { success: false, message: 'Session not found' };
  }

  const state = getPipelineState(args.sessionId);
  if (!state) {
    return { success: false, message: 'No pipeline found for this session' };
  }

  const result = completeTier(
    args.sessionId,
    {
      tier: state.currentTier,
      filesVerified: args.filesVerified,
      issuesFound: args.issuesFound,
      criticalIssues: args.criticalIssues,
      highIssues: args.highIssues,
      tokensUsed: args.tokensUsed,
      timeMs: args.timeMs
    },
    session.issues,
    DEFAULT_PIPELINE_CONFIG
  );

  return {
    success: true,
    tier: result.tierResult.tier,
    shouldEscalate: result.shouldEscalate,
    nextTier: result.nextTier,
    escalationReason: result.escalationReason,
    message: result.shouldEscalate
      ? `Tier ${result.tierResult.tier} completed. Escalating to ${result.nextTier}: ${result.escalationReason}`
      : `Tier ${result.tierResult.tier} completed. No escalation needed.`
  };
}

// =============================================================================
// [ENH: SAFEGUARDS] Quality Safeguards Tool Implementations
// =============================================================================

export async function getSafeguardsStatusTool(
  args: z.infer<typeof GetSafeguardsStatusSchema>
): Promise<{
  success: boolean;
  status?: object;
  summary?: string;
  message: string;
}> {
  const state = getSafeguardsState(args.sessionId);
  if (!state) {
    return { success: false, message: 'Safeguards not initialized for this session' };
  }

  const periodicStatus = getPeriodicStatus(args.projectId, state.periodic.config);
  const summary = generateSafeguardsSummary(args.sessionId);

  return {
    success: true,
    status: {
      quality: state.quality,
      periodic: periodicStatus,
      sampling: state.sampling.tracker ? getSamplingStats(state.sampling.tracker) : null,
      confidence: state.confidence.session?.overall || null
    },
    summary,
    message: `Quality: ${state.quality.level} (${Math.round(state.quality.score * 100)}%)`
  };
}

export async function updateConfidenceTool(
  args: z.infer<typeof UpdateConfidenceSchema>
): Promise<{
  success: boolean;
  assessment?: object;
  recommendations?: object[];
  message: string;
}> {
  const state = getSafeguardsState(args.sessionId);
  if (!state) {
    return { success: false, message: 'Safeguards not initialized for this session' };
  }

  // Convert input to FileConfidence format
  const fileConfidences: FileConfidence[] = args.fileConfidences.map(fc => {
    let confidence;
    if (fc.source === 'cache' && fc.cacheAge !== undefined) {
      confidence = calculateCacheConfidence(fc.cacheAge, true, true);
    } else if (fc.source === 'chunk' && fc.chunkCoverage !== undefined) {
      confidence = calculateChunkConfidence(fc.chunkCoverage, false, 0);
    } else if (fc.source === 'tiered' && fc.tierLevel) {
      confidence = calculateTierConfidence(fc.tierLevel as VerificationTier, []);
    } else {
      confidence = {
        score: fc.score,
        level: fc.score >= 0.85 ? 'HIGH' : fc.score >= 0.7 ? 'MEDIUM' : fc.score >= 0.5 ? 'LOW' : 'UNRELIABLE',
        factors: { methodBase: fc.score, freshness: 1, contextMatch: 1, coverage: 1, historicalAccuracy: 0.9 },
        warnings: [],
        calculatedAt: new Date().toISOString()
      } as any;
    }

    return {
      file: fc.file,
      confidence,
      source: fc.source,
      details: {
        cacheAge: fc.cacheAge,
        chunkCoverage: fc.chunkCoverage,
        tierLevel: fc.tierLevel
      }
    };
  });

  const assessment = updateQualityAssessment(args.sessionId, fileConfidences);

  return {
    success: true,
    assessment: {
      score: assessment.score,
      level: assessment.level,
      metrics: assessment.metrics
    },
    recommendations: assessment.actions.slice(0, 3),
    message: `Quality assessment updated: ${assessment.level} (${Math.round(assessment.score * 100)}%)`
  };
}

export async function recordSamplingResultTool(
  args: z.infer<typeof RecordSamplingResultSchema>
): Promise<{
  success: boolean;
  stats?: object;
  recommendation?: object;
  message: string;
}> {
  const state = getSafeguardsState(args.sessionId);
  if (!state || !state.sampling.tracker) {
    return { success: false, message: 'Safeguards or sampling not initialized' };
  }

  // Create issue-like objects for recording
  const issues = args.severities.map((sev, i) => ({
    id: `sampled-${i}`,
    severity: sev,
    category: 'CORRECTNESS' as const,
    summary: 'Sampled issue',
    location: args.filePath,
    description: '',
    evidence: '',
    status: 'RAISED' as const
  }));

  recordSamplingResult(state.sampling.tracker, args.filePath, issues as any);
  const stats = getSamplingStats(state.sampling.tracker);
  const recommendation = shouldRecommendFullVerification(state.sampling.tracker);

  return {
    success: true,
    stats,
    recommendation: recommendation.recommend ? {
      recommendFullVerification: true,
      reason: recommendation.reason
    } : undefined,
    message: args.issuesFound > 0
      ? `Recorded ${args.issuesFound} issues in sampled file. Productivity: ${stats.productivityRate}%`
      : `No issues found in sampled file.`
  };
}

export async function checkConvergenceAllowedTool(
  args: z.infer<typeof CheckConvergenceAllowedSchema>
): Promise<{
  allowed: boolean;
  blockers: string[];
  qualityScore?: number;
  message: string;
}> {
  const result = shouldAllowConvergence(args.sessionId, args.strictMode);
  const state = getSafeguardsState(args.sessionId);

  return {
    allowed: result.allow,
    blockers: result.blockers,
    qualityScore: state?.quality.score,
    message: result.allow
      ? 'Convergence allowed - quality safeguards passed'
      : `Convergence blocked: ${result.blockers.join(', ')}`
  };
}

// =============================================================================
// [ENH: REVERIFY] Re-verification Phase Implementation
// =============================================================================

/**
 * Start a re-verification session for resolved issues
 * Links to a previous verification session and focuses on verifying fixes
 */
export async function startReVerification(
  args: z.infer<typeof StartReVerificationSchema>
): Promise<StartSessionResponse & {
  reVerificationInfo: {
    previousSessionId: string;
    targetIssues: Array<{ id: string; summary: string; severity: string }>;
    focusedVerification: boolean;
  };
  mediator?: object;
  roles?: object;
} | { error: string }> {
  // Get the previous session
  const previousSession = await getSession(args.previousSessionId);
  if (!previousSession) {
    return { error: `Previous session not found: ${args.previousSessionId}` };
  }

  // Determine which issues to re-verify
  let targetIssues = previousSession.issues.filter(i => i.status === 'RESOLVED');

  if (args.targetIssueIds && args.targetIssueIds.length > 0) {
    targetIssues = targetIssues.filter(i => args.targetIssueIds!.includes(i.id));
  }

  if (targetIssues.length === 0) {
    return { error: 'No resolved issues found to re-verify' };
  }

  // Build focused requirements for re-verification
  const reVerifyRequirements = `RE-VERIFICATION SESSION
======================
Original requirements: ${previousSession.requirements}

FOCUS: Verify the following resolved issues have been properly fixed:
${targetIssues.map((i, idx) => `${idx + 1}. [${i.severity}] ${i.id}: ${i.summary}
   Location: ${i.location}
   Original resolution: ${i.resolution || 'Not specified'}`).join('\n')}

VERIFICATION OBJECTIVES:
- Confirm each fix is complete and correct
- Check for regression in related code
- Verify no new issues introduced by the fix
- Ensure fix addresses root cause, not just symptoms`;

  // Create new session for re-verification
  const session = await createSession(
    previousSession.target,
    reVerifyRequirements,
    args.maxRounds || 6
  );

  // Initialize context from previous session's context
  await initializeContext(session.id, previousSession.target, args.workingDir);

  // Update session with re-verification metadata
  const updatedSession = await getSession(session.id);
  if (updatedSession) {
    updatedSession.phase = 're-verification';
    updatedSession.status = 're-verifying';
    updatedSession.previousVerificationId = args.previousSessionId;
    updatedSession.reVerificationTargets = targetIssues.map(i => i.id);
  }

  await updateSessionStatus(session.id, 're-verifying');

  // Initialize Mediator with previous context
  const files = updatedSession
    ? Array.from(updatedSession.context.files.keys())
    : [];
  const mediatorState = await initializeMediator(session.id, files, args.workingDir);

  // Initialize Role Enforcement
  const roleState = initializeRoleEnforcement(session.id);
  const verifierPrompt = getRolePrompt('verifier');

  return {
    sessionId: session.id,
    status: 're-verifying' as any,
    context: {
      target: previousSession.target,
      filesCollected: updatedSession?.context.files.size || 0,
      requirements: reVerifyRequirements
    },
    reVerificationInfo: {
      previousSessionId: args.previousSessionId,
      targetIssues: targetIssues.map(i => ({
        id: i.id,
        summary: i.summary,
        severity: i.severity
      })),
      focusedVerification: true
    },
    mediator: {
      initialized: true,
      graphNodes: mediatorState.graph.nodes.size,
      graphEdges: mediatorState.graph.edges.length,
      criticalFiles: mediatorState.coverage.unverifiedCritical.length
    },
    roles: {
      initialized: true,
      expectedRole: roleState.currentExpectedRole,
      config: roleState.config,
      verifierGuidelines: {
        mustDo: getRoleDefinition('verifier').mustDo.slice(0, 3),
        mustNotDo: getRoleDefinition('verifier').mustNotDo.slice(0, 3)
      },
      firstRolePrompt: verifierPrompt.systemPrompt.slice(0, 500) + '...'
    }
  };
}

// =============================================================================
// New Mediator Tools
// =============================================================================

export const RippleEffectSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  changedFile: z.string().describe('File that will be changed'),
  changedFunction: z.string().optional().describe('Specific function that will be changed')
});

export const MediatorSummarySchema = z.object({
  sessionId: z.string().describe('Session ID')
});

/**
 * Analyze ripple effect of a change
 */
export async function rippleEffect(
  args: z.infer<typeof RippleEffectSchema>
): Promise<object | null> {
  const result = analyzeRippleEffect(args.sessionId, args.changedFile, args.changedFunction);
  if (!result) return null;

  return {
    changedFile: result.changedFile,
    changedFunction: result.changedFunction,
    totalAffected: result.totalAffected,
    maxDepth: result.depth,
    affectedFiles: result.affectedFiles.map(f => ({
      path: f.path,
      depth: f.depth,
      impactType: f.impactType,
      affectedFunctions: f.affectedFunctions,
      reason: f.reason
    }))
  };
}

/**
 * Get mediator summary
 */
export async function mediatorSummary(
  args: z.infer<typeof MediatorSummarySchema>
): Promise<object | null> {
  return getMediatorSummary(args.sessionId);
}

// =============================================================================
// New Role Enforcement Tools
// =============================================================================

export const GetRolePromptSchema = z.object({
  role: z.enum(['verifier', 'critic']).describe('Role to get prompt for')
});

export const RoleSummarySchema = z.object({
  sessionId: z.string().describe('Session ID')
});

export const UpdateRoleConfigSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  strictMode: z.boolean().optional().describe('Reject non-compliant rounds'),
  minComplianceScore: z.number().optional().describe('Minimum compliance score (0-100)'),
  requireAlternation: z.boolean().optional().describe('Require verifier/critic alternation')
});

/**
 * Get role prompt and guidelines
 */
export async function getRolePromptTool(
  args: z.infer<typeof GetRolePromptSchema>
): Promise<object> {
  const prompt = getRolePrompt(args.role as VerifierRole);
  const definition = getRoleDefinition(args.role as VerifierRole);

  return {
    role: args.role,
    koreanName: definition.koreanName,
    purpose: definition.purpose,
    systemPrompt: prompt.systemPrompt,
    mustDo: definition.mustDo,
    mustNotDo: definition.mustNotDo,
    focusAreas: definition.focusAreas,
    outputTemplate: prompt.outputTemplate,
    checklist: prompt.checklist,
    exampleOutput: prompt.exampleOutput
  };
}

/**
 * Get role enforcement summary
 */
export async function roleSummary(
  args: z.infer<typeof RoleSummarySchema>
): Promise<object | null> {
  return getRoleEnforcementSummary(args.sessionId);
}

/**
 * Update role enforcement config
 */
export async function updateRoleConfigTool(
  args: z.infer<typeof UpdateRoleConfigSchema>
): Promise<object | null> {
  const config = updateRoleConfig(args.sessionId, {
    strictMode: args.strictMode,
    minComplianceScore: args.minComplianceScore,
    requireAlternation: args.requireAlternation
  });

  if (!config) return null;

  return {
    sessionId: args.sessionId,
    updated: true,
    newConfig: config
  };
}

// =============================================================================
// Arbiter Logic
// =============================================================================

function checkForIntervention(
  session: Session,
  _output: string,  // Reserved for future output analysis
  newFiles: string[]
): ArbiterIntervention | undefined {
  // Check for context expansion needed
  if (newFiles.length > 3) {
    return {
      type: 'CONTEXT_EXPAND',
      reason: `${newFiles.length} new files discovered - significant scope expansion`,
      action: 'Review if all files are necessary for verification',
      newContextFiles: newFiles
    };
  }

  // Check for circular arguments
  if (isCircularArgument(session)) {
    return {
      type: 'LOOP_BREAK',
      reason: 'Same issues being raised/challenged repeatedly',
      action: 'Force conclusion on disputed issues'
    };
  }

  // Check for scope violation (too broad)
  if (session.context.files.size > 50) {
    return {
      type: 'SOFT_CORRECT',
      reason: 'Verification scope has grown too large',
      action: 'Focus on core files, defer peripheral issues'
    };
  }

  return undefined;
}

function isCircularArgument(session: Session): boolean {
  if (session.rounds.length < 4) return false;

  // Check if same issues keep appearing
  const recentRounds = session.rounds.slice(-4);
  const allRaisedIssues = recentRounds.flatMap(r => r.issuesRaised);

  const issueCounts = new Map<string, number>();
  for (const id of allRaisedIssues) {
    issueCounts.set(id, (issueCounts.get(id) || 0) + 1);
  }

  // If any issue appears 3+ times in last 4 rounds, it's circular
  return Array.from(issueCounts.values()).some(count => count >= 3);
}

// =============================================================================
// Export Tool Definitions
// =============================================================================

export const tools = {
  elenchus_start_session: {
    description: 'Start a new Elenchus verification session. Collects initial context, builds dependency graph, and initializes mediator.',
    schema: StartSessionSchema,
    handler: startSession
  },
  elenchus_get_context: {
    description: 'Get current verification context including files, issues summary, and session state.',
    schema: GetContextSchema,
    handler: getContext
  },
  elenchus_submit_round: {
    description: 'Submit the output of a verification round. Analyzes for new issues, context expansion, convergence, and mediator interventions.',
    schema: SubmitRoundSchema,
    handler: submitRound
  },
  elenchus_get_issues: {
    description: 'Get issues from the current session with optional filtering.',
    schema: GetIssuesSchema,
    handler: getIssues
  },
  elenchus_checkpoint: {
    description: 'Create a checkpoint for potential rollback.',
    schema: CheckpointSchema,
    handler: checkpoint
  },
  elenchus_rollback: {
    description: 'Rollback session to a previous checkpoint.',
    schema: RollbackSchema,
    handler: rollback
  },
  elenchus_end_session: {
    description: 'End the verification session with a final verdict.',
    schema: EndSessionSchema,
    handler: endSession
  },
  // Mediator tools
  elenchus_ripple_effect: {
    description: 'Analyze ripple effect of a code change. Shows which files and functions will be affected by modifying a specific file.',
    schema: RippleEffectSchema,
    handler: rippleEffect
  },
  elenchus_mediator_summary: {
    description: 'Get mediator summary including dependency graph stats, verification coverage, and intervention history.',
    schema: MediatorSummarySchema,
    handler: mediatorSummary
  },
  // Role enforcement tools
  elenchus_get_role_prompt: {
    description: 'Get detailed role prompt and guidelines for Verifier or Critic. Includes mustDo/mustNotDo rules, output templates, and checklists.',
    schema: GetRolePromptSchema,
    handler: getRolePromptTool
  },
  elenchus_role_summary: {
    description: 'Get role enforcement summary including compliance history, average scores, violations, and current expected role.',
    schema: RoleSummarySchema,
    handler: roleSummary
  },
  elenchus_update_role_config: {
    description: 'Update role enforcement configuration. Can enable strict mode, change minimum compliance score, or toggle role alternation requirement.',
    schema: UpdateRoleConfigSchema,
    handler: updateRoleConfigTool
  },
  // [ENH: REVERIFY] Re-verification tool
  elenchus_start_reverification: {
    description: 'Start a re-verification session for resolved issues. Links to a previous verification session and focuses on verifying that fixes are correct and complete. Returns focused verification context with target issues.',
    schema: StartReVerificationSchema,
    handler: startReVerification
  },
  // [ENH: ONE-SHOT] In-session fix application tool
  elenchus_apply_fix: {
    description: 'Apply a fix for an issue within the current session. Creates checkpoint, updates issue status, refreshes file context, and optionally triggers re-verification. Use this to maintain fix-verify continuity without starting new sessions.',
    schema: ApplyFixSchema,
    handler: applyFix
  },
  // [ENH: DIFF] Differential analysis tools
  elenchus_save_baseline: {
    description: 'Save verification baseline after a successful session. This baseline is used for differential analysis in future verifications to only check changed code.',
    schema: SaveBaselineSchema,
    handler: saveBaselineTool
  },
  elenchus_get_diff_summary: {
    description: 'Get differential analysis summary for a project. Shows what has changed since the last verification and estimates token savings.',
    schema: GetDiffSummarySchema,
    handler: getDiffSummaryTool
  },
  elenchus_get_project_history: {
    description: 'Get verification history for a project including past sessions and baselines.',
    schema: GetProjectHistorySchema,
    handler: getProjectHistoryTool
  },
  // [ENH: CACHE] Cache management tools
  elenchus_get_cache_stats: {
    description: 'Get cache statistics including hit rate, total entries, and token savings.',
    schema: GetCacheStatsSchema,
    handler: getCacheStatsTool
  },
  elenchus_clear_cache: {
    description: 'Clear all cached verification results. Requires confirm: true.',
    schema: ClearCacheSchema,
    handler: clearCacheTool
  },
  // [ENH: TIERED] Pipeline tools
  elenchus_get_pipeline_status: {
    description: 'Get current tier pipeline status including completed tiers, escalations, and token usage.',
    schema: GetPipelineStatusSchema,
    handler: getPipelineStatusTool
  },
  elenchus_escalate_tier: {
    description: 'Manually escalate to a higher verification tier (screen → focused → exhaustive).',
    schema: EscalateTierSchema,
    handler: escalateTierTool
  },
  elenchus_complete_tier: {
    description: 'Mark the current tier as complete and check for auto-escalation based on issues found.',
    schema: CompleteTierSchema,
    handler: completeTierTool
  },
  // [ENH: SAFEGUARDS] Quality safeguards tools
  elenchus_get_safeguards_status: {
    description: 'Get quality safeguards status including periodic verification, confidence, and sampling stats.',
    schema: GetSafeguardsStatusSchema,
    handler: getSafeguardsStatusTool
  },
  elenchus_update_confidence: {
    description: 'Update confidence scores for files based on verification method (cache, chunk, tiered, etc.).',
    schema: UpdateConfidenceSchema,
    handler: updateConfidenceTool
  },
  elenchus_record_sampling_result: {
    description: 'Record results from random sampling verification of a skipped file.',
    schema: RecordSamplingResultSchema,
    handler: recordSamplingResultTool
  },
  elenchus_check_convergence_allowed: {
    description: 'Check if session convergence is allowed based on quality safeguards.',
    schema: CheckConvergenceAllowedSchema,
    handler: checkConvergenceAllowedTool
  },
  // [ENH: SAMPLING] Auto-loop tools
  elenchus_auto_verify: {
    description: 'Run automatic verification loop using MCP Sampling. The server autonomously orchestrates Verifier↔Critic rounds by requesting LLM completions from the client. Returns when converged or max rounds reached.',
    schema: AutoVerifySchema,
    handler: autoVerify
  },
  elenchus_get_auto_loop_status: {
    description: 'Get status of an auto-loop verification session including current round, role, and issues found.',
    schema: GetAutoLoopStatusSchema,
    handler: getAutoLoopStatus
  }
};
