/**
 * Session Lifecycle Tools
 * Core session management: start, context, submit round, end
 */

import { z } from 'zod';
import {
  Session,
  Issue,
  StartSessionResponse,
  SubmitRoundResponse,
  GetContextResponse,
  ArbiterIntervention
} from '../types/index.js';
import {
  createSession,
  getSession,
  updateSessionStatus,
  addRound,
  upsertIssue,
  batchUpsertIssues,
  createCheckpoint,
  checkConvergence,
  getIssuesSummary,
  listSessions,
  deleteSessionFromCache,
  detectStaleIssues,
  StaleIssueInfo
} from '../state/session.js';
import {
  initializeContext,
  expandContext,
  findNewFileReferences,
  getContextSummary,
  validateIssueEvidence,
  EvidenceValidationResult,
  analyzeContextForIssues,
  generatePreAnalysisSummary
} from '../state/context.js';
import {
  initializeMediator,
  analyzeRoundAndIntervene,
  analyzeIssueImpact,
  deleteMediatorState
} from '../mediator/index.js';
import { ActiveIntervention } from '../mediator/types.js';
import {
  initializeRoleEnforcement,
  validateRoleCompliance,
  getExpectedRole,
  getRolePrompt,
  getRoleDefinition,
  deleteRoleState,
  getRoleState,
  shouldUseConciseModeForSession
} from '../roles/index.js';
import { RoleComplianceResult, RoleComplianceResultWithGuidance, VerifierRole } from '../roles/types.js';
import {
  getDiffForSession,
  findAffectedDependencies,
  generateDiffSummary,
  DifferentialConfig,
  DiffResult,
  DEFAULT_DIFFERENTIAL_CONFIG
} from '../diff/index.js';
import {
  initializeCache,
  batchLookupCache,
  estimateTokenSavings,
  generateCacheSummary,
  CacheConfig,
  DEFAULT_CACHE_CONFIG
} from '../cache/index.js';
import {
  chunkContextFiles,
  ChunkingConfig,
  DEFAULT_CHUNKING_CONFIG,
  CodeChunk
} from '../chunking/index.js';
import {
  initializePipeline,
  getFilesForTier,
  deletePipelineState,
  PipelineConfig,
  DEFAULT_PIPELINE_CONFIG
} from '../pipeline/index.js';
import {
  initializeSafeguards,
  getPeriodicStatus,
  shouldForceFullVerification,
  SafeguardsState
} from '../safeguards/index.js';
import {
  detectIssueTransitions,
  mergeIssues,
  splitIssue,
  changeSeverity,
  IssueTransitionResult
} from '../lifecycle/index.js';
import {
  StartSessionSchema,
  GetContextSchema,
  SubmitRoundSchema,
  EndSessionSchema
} from './schemas.js';

// =============================================================================
// Internal Helpers
// =============================================================================

interface ProactiveContextSummary {
  focusAreas: string[];
  unreviewedFiles: string[];
  impactRecommendations: string[];
  edgeCaseGaps: string[];
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
    const criticRounds = session.rounds.filter(r => r.role === 'critic');
    const lastCriticOutput = criticRounds[criticRounds.length - 1]?.output || '';
    if (lastCriticOutput.includes('FLAG FOR VERIFIER')) {
      recommendations.push('Address Critic flags from previous round');
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
    unreviewedFiles: unreviewedFiles.slice(0, 5),
    impactRecommendations: impactRecommendations.slice(0, 3),
    edgeCaseGaps,
    recommendations
  };
}

function checkForIntervention(
  session: Session,
  _output: string,
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

  const recentRounds = session.rounds.slice(-4);
  const allRaisedIssues = recentRounds.flatMap(r => r.issuesRaised);

  const issueCounts = new Map<string, number>();
  for (const id of allRaisedIssues) {
    issueCounts.set(id, (issueCounts.get(id) || 0) + 1);
  }

  return Array.from(issueCounts.values()).some(count => count >= 3);
}

// =============================================================================
// Session Lifecycle Tools
// =============================================================================

/**
 * Start a new verification session
 */
export async function startSession(
  args: z.infer<typeof StartSessionSchema>
): Promise<StartSessionResponse & {
  mediator?: object;
  roles?: object;
  verificationMode?: object;
  preAnalysis?: object;
  differential?: object;
  cache?: object;
  chunking?: object;
  pipeline?: object;
  safeguards?: object;
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
                fileCtx.skipVerification = true;
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

    const allFiles = Array.from(updatedSession?.context.files.keys() || []);
    const forceDecision = shouldForceFullVerification(
      args.workingDir,
      allFiles,
      1.0,
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
    verificationMode: args.verificationMode ? {
      mode: args.verificationMode.mode || 'standard',
      description: args.verificationMode.mode === 'fast-track'
        ? 'Fast-track mode: Can converge in 1 round if no issues found'
        : args.verificationMode.mode === 'single-pass'
          ? 'Single-pass mode: Verifier only, no Critic review required'
          : 'Standard mode: Full Verifier↔Critic loop',
      settings: args.verificationMode
    } : undefined,
    preAnalysis: {
      totalFindings: preAnalysisResults.reduce((sum, r) => sum + r.findings.length, 0),
      filesWithFindings: preAnalysisResults.length,
      summary: preAnalysisSummary,
      details: preAnalysisResults.slice(0, 10)
    },
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
          .slice(0, 20),
        guidance: `${savings.cachedFiles} files have cached verification results. Focus on the ${savings.uncachedFiles} uncached files for detailed verification.`
      };
    })() : (cacheConfig.enabled ? {
      enabled: true,
      stats: { cachedFiles: 0, uncachedFiles: updatedSession?.context.files.size || 0 },
      guidance: 'Cache enabled but no cached results found. Results will be cached after this session.'
    } : undefined),
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

  const proactiveSummary = generateProactiveContextSummary(session);

  return {
    sessionId: session.id,
    target: session.target,
    requirements: session.requirements,
    files,
    currentRound: session.currentRound,
    issuesSummary: getIssuesSummary(session),
    proactiveSummary
  };
}

/**
 * Submit round output and get analysis
 */
export async function submitRound(
  args: z.infer<typeof SubmitRoundSchema>
): Promise<SubmitRoundResponse & {
  mediatorInterventions?: ActiveIntervention[];
  roleCompliance?: RoleComplianceResult;
  rejected?: boolean;
  rejectionReason?: string;
  evidenceValidation?: Record<string, EvidenceValidationResult>;
  staleIssues?: StaleIssueInfo[];
  lifecycle?: IssueTransitionResult;
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

  // [ENH: CRIT-01] Strict mode enforcement
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
  const raisedIds: string[] = [];
  const newIssues: Issue[] = [];
  const evidenceValidation: Record<string, EvidenceValidationResult> = {};

  if (args.issuesRaised) {
    // Phase 1: Parallel validation and impact analysis
    const processedResults = await Promise.all(
      args.issuesRaised.map(async (issueData) => {
        const validationResult = await validateIssueEvidence(
          session.context,
          issueData.location,
          issueData.evidence
        );
        const impactAnalysis = analyzeIssueImpact(session.id, issueData.location);
        return { issueData, validationResult, impactAnalysis };
      })
    );

    // Phase 2: Build issue objects
    const issuesToUpsert: Issue[] = [];
    for (const { issueData, validationResult, impactAnalysis } of processedResults) {
      evidenceValidation[issueData.id] = validationResult;

      const issue: Issue = {
        ...issueData,
        raisedBy: args.role,
        raisedInRound: session.currentRound + 1,
        status: 'RAISED',
        impactAnalysis: impactAnalysis || undefined
      };

      if (!validationResult.isValid) {
        issue.description += `\n\nEvidence validation warning: ${validationResult.warnings.join('; ')}`;
      }

      if (impactAnalysis && (impactAnalysis.riskLevel === 'HIGH' || impactAnalysis.riskLevel === 'CRITICAL')) {
        issue.description += `\n\nImpact Analysis: ${impactAnalysis.summary}`;
      }

      // Regression detection
      const resolvedIssues = session.issues.filter(i => i.status === 'RESOLVED');
      const similarResolved = resolvedIssues.find(resolved =>
        resolved.location === issueData.location ||
        (resolved.summary.toLowerCase().includes(issueData.summary.toLowerCase().split(' ')[0]) &&
         resolved.category === issueData.category)
      );
      if (similarResolved) {
        issue.isRegression = true;
        issue.regressionOf = similarResolved.id;
        issue.description += `\n\nREGRESSION: Similar issue ${similarResolved.id} was previously resolved in round ${similarResolved.resolvedInRound}`;
      }

      issuesToUpsert.push(issue);
      raisedIds.push(issue.id);
      newIssues.push(issue);
    }

    // Phase 3: Batch upsert
    await batchUpsertIssues(session.id, issuesToUpsert);
  }

  // [ENH: CRIT-02] Process Critic verdicts
  if (args.role === 'critic') {
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

  // [ENH: CRIT-02] Process resolved issues
  if (args.issuesResolved) {
    for (const issueId of args.issuesResolved) {
      const issue = session.issues.find(i => i.id === issueId);
      if (issue && issue.status !== 'RESOLVED') {
        // If Critic reviewed, require verdict to be VALID or INVALID
        // If not Critic reviewed, allow direct resolution (e.g., false positive dismissal)
        if (issue.criticReviewed) {
          if (issue.criticVerdict === 'VALID' || issue.criticVerdict === 'INVALID') {
            issue.status = 'RESOLVED';
            issue.resolvedInRound = session.currentRound + 1;
            issue.resolution = issue.criticVerdict === 'INVALID'
              ? 'Dismissed as false positive'
              : 'Confirmed and resolved';
            await upsertIssue(session.id, issue);
          }
        } else {
          // Allow resolution without Critic review (e.g., Verifier dismissing own issue)
          issue.status = 'RESOLVED';
          issue.resolvedInRound = session.currentRound + 1;
          issue.resolution = 'Resolved by ' + args.role;
          await upsertIssue(session.id, issue);
        }
      }
    }
  }

  // [ENH: LIFECYCLE] Detect issue transitions
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

  // Process discovered issues
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

  // Determine next role
  const verificationMode = updatedSession?.verificationMode?.mode || 'standard';
  const expectedNextRole = getExpectedRole(args.sessionId);
  let nextRole: 'verifier' | 'critic' | 'complete' = 'complete';

  if (!convergence.isConverged && session.currentRound < session.maxRounds) {
    if (verificationMode === 'single-pass') {
      nextRole = 'verifier';
    } else if (verificationMode === 'fast-track' &&
               args.role === 'verifier' &&
               raisedIds.length === 0 &&
               (updatedSession?.verificationMode?.skipCriticForCleanCode ?? true)) {
      nextRole = 'verifier';
    } else {
      nextRole = expectedNextRole;
    }
  }

  // Determine concise mode
  const nextRoundNumber = session.currentRound + 2;
  const useConciseMode = nextRole !== 'complete' &&
    shouldUseConciseModeForSession(updatedSession!, nextRoundNumber);

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
    mediatorInterventions: mediatorInterventions.length > 0 ? mediatorInterventions : undefined,
    roleCompliance: Object.assign({}, roleCompliance, {
      nextRoleGuidelines: nextRolePrompt && nextRole !== 'complete' ? {
        role: nextRole as VerifierRole,
        conciseMode: useConciseMode,
        round: nextRoundNumber,
        outputFormat: useConciseMode ? 'CONCISE (<500 words)' : 'COMPREHENSIVE',
        mustDo: getRoleDefinition(nextRole as VerifierRole).mustDo.slice(0, 3),
        checklist: nextRolePrompt.checklist
      } : undefined
    }) as RoleComplianceResultWithGuidance,
    evidenceValidation: Object.keys(evidenceValidation).length > 0 ? evidenceValidation : undefined,
    staleIssues: (() => {
      const stale = detectStaleIssues(updatedSession!);
      return stale.length > 0 ? stale : undefined;
    })(),
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

  // [FIX: REL-02] Clean up memory caches
  deleteSessionFromCache(session.id);
  deleteMediatorState(session.id);
  deleteRoleState(session.id);
  deletePipelineState(session.id);

  return result;
}

/**
 * List all sessions
 */
export async function getSessions(): Promise<string[]> {
  return listSessions();
}

// =============================================================================
// Export Tool Definitions
// =============================================================================

export const sessionLifecycleTools = {
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
  elenchus_end_session: {
    description: 'End the verification session with a final verdict.',
    schema: EndSessionSchema,
    handler: endSession
  }
};
