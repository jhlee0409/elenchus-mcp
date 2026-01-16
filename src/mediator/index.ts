/**
 * Mediator - Active intervention, context understanding, verification quality assurance
 *
 * Responsibilities:
 * 1. Understand codebase context (dependency graph)
 * 2. Actively point out areas verifiers missed
 * 3. Side effect / ripple effect warnings
 * 4. Verification coverage tracking
 * 5. Scope drift detection and correction
 */

import {
  DependencyGraph,
  MediatorState,
  ActiveIntervention,
  ActiveInterventionType,
  MissedCodeInfo,
  RippleEffect,
  AffectedFile
} from './types.js';
import {
  buildDependencyGraph,
  findAffectedFiles,
  detectCircularDependencies,
  calculateFileImportance
} from './analyzer.js';
import { Session, Issue, IssueImpactAnalysis, ImpactedCode } from '../types/index.js';
import { Deque } from '../utils/data-structures.js';

/**
 * [FIX: MNT-01] Mediator configuration constants
 */
const MEDIATOR_CONFIG = {
  CRITICAL_THRESHOLD_FACTOR: 0.5,    // Critical file threshold (max importance * factor)
  MAX_AFFECTED_FILES_DISPLAY: 10,    // Max affected files to display
  MAX_CRITICAL_FILES_DISPLAY: 5,     // Max critical files to display
  COVERAGE_CHECK_MIN_ROUND: 3,       // Min round to start coverage check
  LOW_COVERAGE_CHECK_MIN_ROUND: 5,   // Min round for low coverage check
  LOW_COVERAGE_THRESHOLD: 0.5,       // Low coverage threshold (50%)
  DRIFT_THRESHOLD: 0.5,              // Scope drift threshold (50%)
  MIN_FILES_FOR_DRIFT: 3,            // Min files for drift check
  DEFAULT_MAX_DEPTH: 100,            // Default max dependency depth
  SIDE_EFFECT_WARNING_THRESHOLD: 5,  // Side effect warning threshold
  RIPPLE_EFFECT_MAX_DEPTH: 3,        // Ripple effect max depth
  FILE_IMPORTANCE_THRESHOLD: 3       // File importance threshold
} as const;

// =============================================================================
// Mediator State Management
// =============================================================================

const mediatorStates = new Map<string, MediatorState>();

/**
 * Initialize mediator for session
 */
export async function initializeMediator(
  sessionId: string,
  files: string[],
  workingDir: string
): Promise<MediatorState> {
  // Build dependency graph
  const graph = await buildDependencyGraph(files, workingDir);

  const state: MediatorState = {
    sessionId,
    graph,
    coverage: {
      totalFiles: files.length,
      verifiedFiles: new Set(),
      partiallyVerified: new Map(),
      unverifiedCritical: []
    },
    interventions: [],
    mentionedLocations: new Map(),
    verifierFocus: [],
    ignoredWarnings: []
  };

  // [FIX: MNT-01] Identify critical files (must verify) - use MEDIATOR_CONFIG
  const importance = calculateFileImportance(graph);
  const criticalThreshold = Math.max(...Array.from(importance.values())) * MEDIATOR_CONFIG.CRITICAL_THRESHOLD_FACTOR;

  for (const [file, score] of importance) {
    if (score >= criticalThreshold) {
      state.coverage.unverifiedCritical.push(file);
    }
  }

  mediatorStates.set(sessionId, state);
  return state;
}

/**
 * Get mediator state
 */
export function getMediatorState(sessionId: string): MediatorState | undefined {
  return mediatorStates.get(sessionId);
}

// =============================================================================
// Active Intervention Logic
// =============================================================================

/**
 * Analyze round output and decide interventions
 * [FIX: PRF-01] Cache importance calculation to avoid redundant recalculation
 */
export function analyzeRoundAndIntervene(
  session: Session,
  roundOutput: string,
  role: 'verifier' | 'critic',
  newIssues: Issue[]
): ActiveIntervention[] {
  const state = mediatorStates.get(session.id);
  if (!state) return [];

  const interventions: ActiveIntervention[] = [];

  // [ENH: ONE-SHOT] Check verification mode for reduced intervention
  const verificationMode = session.verificationMode?.mode || 'standard';
  const isSimplifiedMode = verificationMode === 'fast-track' || verificationMode === 'single-pass';

  // [FIX: PRF-01] Calculate importance once and cache for use in checks
  const cachedImportance = calculateFileImportance(state.graph);

  // 1. Extract mentioned files/lines from output
  const mentionedFiles = extractMentionedFiles(roundOutput);
  updateCoverage(state, mentionedFiles, session.currentRound);

  // [ENH: ONE-SHOT] In simplified modes, only run critical interventions
  // Critical: Circular dependencies, Critical path ignored
  // Non-critical (skip in simplified mode): Coverage gaps, Side effects, Scope drift, etc.

  // 2. Check missed dependencies (critical - always run)
  const missedDeps = checkMissedDependencies(state, mentionedFiles, newIssues, cachedImportance);
  if (missedDeps) interventions.push(missedDeps);

  // 3. Check coverage gaps (non-critical - skip in simplified mode)
  if (!isSimplifiedMode) {
    const coverageIssue = checkIncompleteCoverage(state, session.currentRound, cachedImportance);
    if (coverageIssue) interventions.push(coverageIssue);
  }

  // 4. Side effect warnings (non-critical - skip in simplified mode)
  if (!isSimplifiedMode) {
    const sideEffects = checkSideEffects(state, newIssues);
    if (sideEffects) interventions.push(sideEffects);
  }

  // 5. Scope drift check (non-critical - skip in simplified mode)
  if (!isSimplifiedMode) {
    const scopeDrift = checkScopeDrift(state, mentionedFiles, session);
    if (scopeDrift) interventions.push(scopeDrift);
  }

  // 6. Circular dependency check (critical - always run, first round only)
  if (session.currentRound === 1) {
    const circular = checkCircularDependencies(state);
    if (circular) interventions.push(circular);
  }

  // 7. Critical path ignored check (critical - always run)
  const ignoredCritical = checkCriticalPathIgnored(state, mentionedFiles, cachedImportance);
  if (ignoredCritical) interventions.push(ignoredCritical);

  // 8. Verifier misunderstanding check (skip in single-pass mode, no Critic)
  if (role === 'critic' && verificationMode !== 'single-pass') {
    const contextCorrection = checkVerifierMisunderstanding(state, roundOutput, session);
    if (contextCorrection) interventions.push(contextCorrection);
  }

  // 9. [ENH: MED-02] Quick agreement / collusion detection (skip in single-pass mode)
  if (verificationMode !== 'single-pass') {
    const collusion = checkQuickAgreementCollusion(session, role, roundOutput);
    if (collusion) interventions.push(collusion);
  }

  // Record interventions in state
  state.interventions.push(...interventions);

  return interventions;
}

// =============================================================================
// Specific Intervention Checks
// =============================================================================

/**
 * Check missed dependencies
 * [FIX: PRF-01] Accept cached importance map to avoid recalculation
 */
function checkMissedDependencies(
  state: MediatorState,
  mentionedFiles: Map<string, number[]>,
  newIssues: Issue[],
  cachedImportance?: Map<string, number>
): ActiveIntervention | null {
  const missedCode: MissedCodeInfo[] = [];
  // [FIX: PRF-01] Use cached importance or calculate if not provided
  const importance = cachedImportance || calculateFileImportance(state.graph);

  for (const [file] of mentionedFiles) {
    // Check dependencies of this file
    const node = state.graph.nodes.get(file);
    if (!node) continue;

    for (const imp of node.imports) {
      // Check local imports only
      if (!imp.source.startsWith('.')) continue;

      const importedFile = findResolvedImport(state.graph, file, imp.source);
      if (!importedFile) continue;

      // Check if this file has been verified
      if (!state.coverage.verifiedFiles.has(importedFile) &&
          !mentionedFiles.has(importedFile)) {

        // Check if there are related issues
        const relatedIssues = newIssues.filter(i =>
          i.location.includes(file) &&
          imp.specifiers.some(s => i.description.includes(s))
        );

        if (relatedIssues.length > 0) {
          missedCode.push({
            file: importedFile,
            functions: imp.specifiers,
            reason: `Used in ${file} and related issues found`,
            importance: 'HIGH'
          });
        } else {
          // [FIX: MNT-01] If important file - use cached importance with constant threshold
          if ((importance.get(importedFile) || 0) > MEDIATOR_CONFIG.FILE_IMPORTANCE_THRESHOLD) {
            missedCode.push({
              file: importedFile,
              functions: imp.specifiers,
              reason: `Dependency of ${file} and widely used elsewhere`,
              importance: 'MEDIUM'
            });
          }
        }
      }
    }
  }

  if (missedCode.length === 0) return null;

  const highPriority = missedCode.filter(m => m.importance === 'HIGH');

  return {
    type: 'MISSED_DEPENDENCY',
    severity: highPriority.length > 0 ? 'WARNING' : 'INFO',
    reason: `${missedCode.length} related files not verified`,
    action: 'Include the following files in verification',
    missedCode,
    affectedFiles: missedCode.map(m => m.file),
    suggestedChecks: missedCode
      .filter(m => m.importance === 'HIGH')
      .map(m => `${m.file}: ${m.reason}`)
  };
}

/**
 * Check coverage gaps
 * [FIX: PRF-01] Accept cached importance map for consistency (currently unused but available)
 */
function checkIncompleteCoverage(
  state: MediatorState,
  currentRound: number,
  _cachedImportance?: Map<string, number>
): ActiveIntervention | null {
  // [FIX: MNT-01] Use constant for round check
  if (currentRound < MEDIATOR_CONFIG.COVERAGE_CHECK_MIN_ROUND) return null;

  const { totalFiles, verifiedFiles, unverifiedCritical } = state.coverage;
  const coverageRate = verifiedFiles.size / totalFiles;

  // Unverified among critical files
  const stillCritical = unverifiedCritical.filter(f => !verifiedFiles.has(f));

  if (stillCritical.length > 0 && currentRound >= MEDIATOR_CONFIG.COVERAGE_CHECK_MIN_ROUND) {
    return {
      type: 'INCOMPLETE_COVERAGE',
      severity: 'WARNING',
      reason: `${stillCritical.length} critical files not yet verified (total coverage: ${(coverageRate * 100).toFixed(1)}%)`,
      action: 'Verify the following critical files',
      affectedFiles: stillCritical.slice(0, MEDIATOR_CONFIG.MAX_CRITICAL_FILES_DISPLAY),
      suggestedChecks: stillCritical.slice(0, MEDIATOR_CONFIG.MAX_CRITICAL_FILES_DISPLAY).map(f => {
        const deps = state.graph.reverseEdges.get(f) || [];
        return `${f} (referenced by ${deps.length} files)`;
      })
    };
  }

  if (coverageRate < MEDIATOR_CONFIG.LOW_COVERAGE_THRESHOLD && currentRound >= MEDIATOR_CONFIG.LOW_COVERAGE_CHECK_MIN_ROUND) {
    return {
      type: 'INCOMPLETE_COVERAGE',
      severity: 'INFO',
      reason: `Total coverage is low at ${(coverageRate * 100).toFixed(1)}%`,
      action: 'Verify more files or narrow the scope',
      affectedFiles: Array.from(state.graph.nodes.keys())
        .filter(f => !verifiedFiles.has(f))
        .slice(0, MEDIATOR_CONFIG.MAX_AFFECTED_FILES_DISPLAY)
    };
  }

  return null;
}

/**
 * Side effect warnings
 */
function checkSideEffects(
  state: MediatorState,
  newIssues: Issue[]
): ActiveIntervention | null {
  // Analyze impact scope for issues that need fixing
  const criticalIssues = newIssues.filter(i =>
    i.severity === 'CRITICAL' || i.severity === 'HIGH'
  );

  if (criticalIssues.length === 0) return null;

  const allAffected = new Set<string>();
  const rippleDetails: Array<{ issue: string; affected: string[] }> = [];

  for (const issue of criticalIssues) {
    // Extract file from issue location
    const fileMatch = issue.location.match(/^([^:]+)/);
    if (!fileMatch) continue;

    const file = fileMatch[1];
    const affected = findAffectedFiles(file, state.graph, 2);

    if (affected.length > 0) {
      rippleDetails.push({
        issue: issue.id,
        affected: affected.slice(0, 3)
      });
      affected.forEach(f => allAffected.add(f));
    }
  }

  if (allAffected.size === 0) return null;

  // [FIX: MNT-01] Use constant for threshold
  return {
    type: 'SIDE_EFFECT_WARNING',
    severity: allAffected.size > MEDIATOR_CONFIG.SIDE_EFFECT_WARNING_THRESHOLD ? 'WARNING' : 'INFO',
    reason: `Fixing ${criticalIssues.length} issues may affect ${allAffected.size} files`,
    action: 'Check impact scope before fixing',
    affectedFiles: Array.from(allAffected).slice(0, MEDIATOR_CONFIG.MAX_AFFECTED_FILES_DISPLAY),
    relatedIssues: criticalIssues.map(i => i.id),
    suggestedChecks: rippleDetails.map(r =>
      `Check when fixing ${r.issue}: ${r.affected.join(', ')}`
    )
  };
}

/**
 * Scope drift check
 */
function checkScopeDrift(
  state: MediatorState,
  mentionedFiles: Map<string, number[]>,
  session: Session
): ActiveIntervention | null {
  // Check if many files unrelated to target are mentioned
  const targetDir = session.target.replace(/\/[^/]+$/, '');  // Extract directory
  const outsideTarget: string[] = [];

  for (const file of mentionedFiles.keys()) {
    if (!file.startsWith(targetDir) && !file.includes(targetDir)) {
      outsideTarget.push(file);
    }
  }

  const driftRate = outsideTarget.length / mentionedFiles.size;

  // [FIX: MNT-01] Use constants for thresholds
  if (driftRate > MEDIATOR_CONFIG.DRIFT_THRESHOLD && mentionedFiles.size > MEDIATOR_CONFIG.MIN_FILES_FOR_DRIFT) {
    return {
      type: 'SCOPE_DRIFT',
      severity: 'WARNING',
      reason: `Verification scope expanded outside target (${session.target}) by ${(driftRate * 100).toFixed(0)}%`,
      action: 'Focus on target scope or explicitly expand verification scope',
      affectedFiles: outsideTarget.slice(0, MEDIATOR_CONFIG.MAX_CRITICAL_FILES_DISPLAY),
      suggestedChecks: [
        `Current target: ${session.target}`,
        `${outsideTarget.length} external files mentioned`,
        'Request explicit scope expansion if needed'
      ]
    };
  }

  return null;
}

/**
 * Circular dependency check
 */
function checkCircularDependencies(
  state: MediatorState
): ActiveIntervention | null {
  const cycles = detectCircularDependencies(state.graph);

  if (cycles.length === 0) return null;

  return {
    type: 'CIRCULAR_DEPENDENCY',
    severity: cycles.length > 2 ? 'WARNING' : 'INFO',
    reason: `${cycles.length} circular dependencies detected`,
    action: 'Circular dependencies can cause bugs, please review',
    suggestedChecks: cycles.slice(0, 3).map(cycle =>
      `Cycle: ${cycle.join(' → ')}`
    )
  };
}

/**
 * Critical path ignored check
 * [FIX: PRF-01] Accept cached importance map to avoid recalculation
 */
function checkCriticalPathIgnored(
  state: MediatorState,
  mentionedFiles: Map<string, number[]>,
  cachedImportance?: Map<string, number>
): ActiveIntervention | null {
  // [FIX: PRF-01] Use cached importance or calculate if not provided
  const importance = cachedImportance || calculateFileImportance(state.graph);
  // [FIX: MNT-01] Use MEDIATOR_CONFIG constant instead of magic number
  const sortedByImportance = Array.from(importance.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, MEDIATOR_CONFIG.MAX_CRITICAL_FILES_DISPLAY);

  const ignoredCritical = sortedByImportance.filter(
    ([file]) => !mentionedFiles.has(file) && !state.coverage.verifiedFiles.has(file)
  );

  if (ignoredCritical.length === 0) return null;

  // Only warn after round 3
  const rounds = state.interventions.filter(i => i.type === 'CRITICAL_PATH_IGNORED').length;
  if (rounds > 0) return null;  // Already warned

  return {
    type: 'CRITICAL_PATH_IGNORED',
    severity: 'INFO',
    reason: 'Critical project files not yet verified',
    action: 'Also review the following critical files',
    affectedFiles: ignoredCritical.map(([file]) => file),
    suggestedChecks: ignoredCritical.map(([file, score]) => {
      const deps = state.graph.reverseEdges.get(file) || [];
      return `${file} (importance: ${score}, imported by ${deps.length} files)`;
    })
  };
}

/**
 * [ENH: MED-02] Quick agreement / collusion detection
 * Detects when Verifier and Critic agree too quickly without proper debate
 */
function checkQuickAgreementCollusion(
  session: Session,
  role: 'verifier' | 'critic',
  roundOutput: string
): ActiveIntervention | null {
  // Only check after a few rounds
  if (session.currentRound < 2) return null;

  // Only trigger on critic rounds
  if (role !== 'critic') return null;

  // Pattern 1: Critic agrees with everything without challenging
  const agreementPatterns = [
    /all\s+(issues?\s+)?(are\s+)?valid/gi,
    /agree\s+with\s+all/gi,
    /no\s+(additional\s+)?concerns?/gi,
    /looks?\s+good/gi,
    /lgtm/gi,
    /all\s+correct/gi
  ];

  const disagreementPatterns = [
    /invalid/gi,
    /disagree/gi,
    /incorrect/gi,
    /false\s+positive/gi,
    /actually/gi,
    /however/gi,
    /but\s+/gi,
    /partial/gi,
    /not\s+quite/gi,
    /missing/gi
  ];

  const agreementCount = agreementPatterns.filter(p => p.test(roundOutput)).length;
  const disagreementCount = disagreementPatterns.filter(p => p.test(roundOutput)).length;

  // Check if this round has too much agreement
  const suspiciousAgreement = agreementCount >= 2 && disagreementCount === 0;

  // Pattern 2: Very short response from Critic
  const outputLength = roundOutput.trim().length;
  const veryShortResponse = outputLength < 300 && session.issues.length > 0;

  // Pattern 3: All issues resolved in first Critic review
  const issuesInThisRound = session.issues.filter(
    i => i.raisedInRound === session.currentRound ||
         i.raisedInRound === session.currentRound - 1
  );
  const allMarkedValid = issuesInThisRound.length > 0 &&
    issuesInThisRound.every(i =>
      roundOutput.toLowerCase().includes(i.id.toLowerCase()) &&
      roundOutput.toLowerCase().includes('valid')
    );

  // Calculate suspicion score
  let suspicionScore = 0;
  const warnings: string[] = [];

  if (suspiciousAgreement) {
    suspicionScore += 40;
    warnings.push('Critic agreed with all issues without challenge');
  }
  if (veryShortResponse) {
    suspicionScore += 30;
    warnings.push(`Response is very short (${outputLength} chars) for ${session.issues.length} issues`);
  }
  if (allMarkedValid && issuesInThisRound.length >= 2) {
    suspicionScore += 30;
    warnings.push(`All ${issuesInThisRound.length} recent issues marked as VALID without pushback`);
  }

  // Only flag if suspicion is high enough
  if (suspicionScore < 50) return null;

  return {
    type: 'QUICK_AGREEMENT',
    severity: suspicionScore >= 70 ? 'WARNING' : 'INFO',
    reason: 'Potential quick agreement detected - verification may be superficial',
    action: 'Please ensure thorough independent review',
    suggestedChecks: [
      'Critic should independently verify each issue with evidence',
      'Challenge at least some findings to ensure debate',
      'Review code context, not just issue descriptions',
      ...warnings
    ],
    relatedIssues: issuesInThisRound.map(i => i.id)
  };
}

/**
 * Verifier misunderstanding check (judged by Critic)
 */
function checkVerifierMisunderstanding(
  state: MediatorState,
  criticOutput: string,
  session: Session
): ActiveIntervention | null {
  // Detect keywords like "misunderstanding", "wrong", "incorrect" in Critic output
  const correctionKeywords = [
    'incorrect', 'wrong', 'misunderstand', 'false positive',
    'exaggerated', 'actually', 'in fact'
  ];

  const hasCorrection = correctionKeywords.some(kw =>
    criticOutput.toLowerCase().includes(kw.toLowerCase())
  );

  if (!hasCorrection) return null;

  // Try to extract which issues were disputed
  const lastVerifierRound = session.rounds
    .filter(r => r.role === 'verifier')
    .pop();

  if (!lastVerifierRound) return null;

  const disputedIssues = lastVerifierRound.issuesRaised.filter(issueId => {
    const issue = session.issues.find(i => i.id === issueId);
    return issue && (
      criticOutput.includes(issue.id) ||
      criticOutput.includes(issue.summary)
    );
  });

  if (disputedIssues.length === 0) return null;

  return {
    type: 'CONTEXT_CORRECTION',
    severity: 'INFO',
    reason: `Critic disputed ${disputedIssues.length} issues`,
    action: 'Re-review these issues and check code context again',
    relatedIssues: disputedIssues,
    suggestedChecks: [
      'Verify if evidence matches actual behavior',
      'Re-read the full context of related code',
      'Check intended behavior in tests or documentation'
    ]
  };
}

// =============================================================================
// Coverage Tracking
// =============================================================================

/**
 * Update coverage
 */
function updateCoverage(
  state: MediatorState,
  mentionedFiles: Map<string, number[]>,
  round: number
): void {
  for (const [file, lines] of mentionedFiles) {
    state.coverage.verifiedFiles.add(file);

    // Line level coverage
    const existing = state.coverage.partiallyVerified.get(file);
    if (existing) {
      lines.forEach(l => {
        if (!existing.linesMentioned.includes(l)) {
          existing.linesMentioned.push(l);
        }
      });
      existing.lastVerifiedRound = round;
    } else {
      const node = state.graph.nodes.get(file);
      state.coverage.partiallyVerified.set(file, {
        path: file,
        functionsTotal: node?.functions.length || 0,
        functionsVerified: [],
        linesTotal: 0,  // Calculate later
        linesMentioned: lines,
        lastVerifiedRound: round
      });
    }

    // Remove from critical files list
    const idx = state.coverage.unverifiedCritical.indexOf(file);
    if (idx !== -1) {
      state.coverage.unverifiedCritical.splice(idx, 1);
    }
  }
}

// =============================================================================
// Ripple Effect Analysis
// =============================================================================

/**
 * Analyze ripple effect on change
 */
export function analyzeRippleEffect(
  sessionId: string,
  changedFile: string,
  changedFunction?: string
): RippleEffect | null {
  const state = mediatorStates.get(sessionId);
  if (!state) return null;

  // [FIX: MNT-01] Use MEDIATOR_CONFIG for max depth
  const affected = findAffectedFiles(changedFile, state.graph, MEDIATOR_CONFIG.RIPPLE_EFFECT_MAX_DEPTH);
  if (affected.length === 0) return null;

  const affectedDetails: AffectedFile[] = [];

  for (const file of affected) {
    const node = state.graph.nodes.get(file);
    if (!node) continue;

    // Which functions are affected
    const affectedFunctions: string[] = [];
    const changedNode = state.graph.nodes.get(changedFile);

    if (changedFunction && changedNode) {
      // Find functions that call the changed function
      for (const fn of node.functions) {
        if (fn.calls.includes(changedFunction)) {
          affectedFunctions.push(fn.name);
        }
      }
    }

    // Calculate dependency depth
    const depth = calculateDependencyDepth(state.graph, changedFile, file);

    affectedDetails.push({
      path: file,
      depth,
      affectedFunctions,
      impactType: depth === 1 ? 'direct' : 'indirect',
      reason: depth === 1
        ? `Directly imports ${changedFile}`
        : `${depth}-level dependency`
    });
  }

  return {
    changedFile,
    changedFunction,
    affectedFiles: affectedDetails.sort((a, b) => a.depth - b.depth),
    depth: Math.max(...affectedDetails.map(a => a.depth)),
    totalAffected: affectedDetails.length
  };
}


// =============================================================================
// [ENH: AUTO-IMPACT] Automatic Impact Analysis for Issues
// Proactively attaches impact analysis when issues are raised
// =============================================================================

/**
 * Automatically analyze impact for an issue based on its location
 * Called when issues are raised to proactively provide impact info
 */
export function analyzeIssueImpact(
  sessionId: string,
  issueLocation: string
): IssueImpactAnalysis | null {
  const state = mediatorStates.get(sessionId);
  if (!state) return null;

  // Extract file from location (file:line format)
  const fileMatch = issueLocation.match(/^([^:]+)/);
  if (!fileMatch) return null;
  
  const file = fileMatch[1];
  const node = state.graph.nodes.get(file);
  if (!node) return null;

  // 1. Find direct callers (files that import this file)
  const callers: ImpactedCode[] = [];
  const reverseEdges = state.graph.reverseEdges.get(file) || [];
  
  for (const caller of reverseEdges) {
    const callerNode = state.graph.nodes.get(caller);
    const callerFunctions: string[] = [];
    
    if (callerNode) {
      // Find functions in caller that use this file
      for (const fn of callerNode.functions) {
        for (const imp of callerNode.imports) {
          if (imp.source.includes(file) || file.includes(imp.source.replace(/^\.\//, ''))) {
            if (imp.specifiers.some(s => fn.calls.includes(s))) {
              callerFunctions.push(fn.name);
            }
          }
        }
      }
    }
    
    callers.push({
      file: caller,
      functions: callerFunctions.length > 0 ? callerFunctions : undefined,
      impactType: 'DIRECT',
      depth: 1
    });
  }

  // 2. Find indirect callers (2 levels deep)
  const indirectCallers: ImpactedCode[] = [];
  for (const caller of callers) {
    const secondLevel = state.graph.reverseEdges.get(caller.file) || [];
    for (const indirect of secondLevel) {
      if (!callers.find(c => c.file === indirect) && indirect !== file) {
        indirectCallers.push({
          file: indirect,
          impactType: 'INDIRECT',
          depth: 2
        });
      }
    }
  }

  // 3. Find dependencies (files this file imports)
  const dependencies: ImpactedCode[] = [];
  for (const imp of node.imports) {
    if (imp.source.startsWith('.')) {
      const depFile = findResolvedImport(state.graph, file, imp.source);
      if (depFile) {
        dependencies.push({
          file: depFile,
          functions: imp.specifiers.length > 0 ? imp.specifiers : undefined,
          impactType: 'DIRECT',
          depth: 1
        });
      }
    }
  }

  // 4. Find related test files
  const relatedTests: string[] = [];
  const testPatterns = [
    file.replace(/\.ts$/, '.test.ts'),
    file.replace(/\.ts$/, '.spec.ts'),
    file.replace(/\.tsx$/, '.test.tsx'),
    file.replace(/\.js$/, '.test.js'),
    file.replace(/src\//, 'test/').replace(/\.ts$/, '.test.ts'),
    file.replace(/src\//, '__tests__/').replace(/\.ts$/, '.test.ts')
  ];
  
  for (const testFile of testPatterns) {
    if (state.graph.nodes.has(testFile)) {
      relatedTests.push(testFile);
    }
  }

  // 5. Get affected functions in the same file
  const affectedFunctions = node.functions.map(fn => fn.name);

  // 6. Calculate totals
  const totalAffectedFiles = callers.length + indirectCallers.length;
  const cascadeDepth = indirectCallers.length > 0 ? 2 : (callers.length > 0 ? 1 : 0);

  // 7. Assess risk level
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
  if (totalAffectedFiles > 10) {
    riskLevel = 'CRITICAL';
  } else if (totalAffectedFiles > 5) {
    riskLevel = 'HIGH';
  } else if (totalAffectedFiles > 2) {
    riskLevel = 'MEDIUM';
  }

  // 8. Generate summary
  const summary = generateImpactSummary(
    file, callers.length, indirectCallers.length, 
    dependencies.length, relatedTests.length, riskLevel
  );

  return {
    callers: [...callers, ...indirectCallers].slice(0, 10),
    dependencies: dependencies.slice(0, 5),
    relatedTests,
    affectedFunctions,
    cascadeDepth,
    totalAffectedFiles,
    riskLevel,
    summary
  };
}

/**
 * Generate human-readable impact summary
 */
function generateImpactSummary(
  file: string,
  directCallers: number,
  indirectCallers: number,
  dependencies: number,
  tests: number,
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
): string {
  const parts: string[] = [];
  
  parts.push(`Impact analysis for ${file}:`);
  
  if (directCallers > 0) {
    parts.push(`${directCallers} direct callers`);
  }
  if (indirectCallers > 0) {
    parts.push(`${indirectCallers} indirect callers`);
  }
  if (dependencies > 0) {
    parts.push(`${dependencies} dependencies`);
  }
  if (tests > 0) {
    parts.push(`${tests} related tests`);
  }
  
  parts.push(`Risk: ${riskLevel}`);
  
  if (riskLevel === 'CRITICAL' || riskLevel === 'HIGH') {
    parts.push('⚠️ Changes may have widespread effects');
  }
  
  return parts.join(' | ');
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract mentioned files from output
 */
function extractMentionedFiles(output: string): Map<string, number[]> {
  const mentioned = new Map<string, number[]>();

  // Pattern: path/to/file.ts:123 or path/to/file.ts (line 123)
  const patterns = [
    /([a-zA-Z0-9_\-./]+\.[a-zA-Z]+):(\d+)/g,  // file.ts:123
    /([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)\s*\(line\s*(\d+)\)/gi,  // file.ts (line 123)
    /`([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)`/g  // `file.ts`
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(output)) !== null) {
      const file = match[1];
      const line = match[2] ? parseInt(match[2], 10) : 0;

      const existing = mentioned.get(file) || [];
      if (line > 0 && !existing.includes(line)) {
        existing.push(line);
      }
      mentioned.set(file, existing);
    }
  }

  return mentioned;
}

/**
 * Resolve import path
 * [ENH: ALGO] Use outgoingEdges Map for O(k) lookup instead of O(E) filter
 */
function findResolvedImport(
  graph: DependencyGraph,
  fromFile: string,
  importSource: string
): string | null {
  // [ENH: ALGO] Use outgoingEdges for O(k) lookup where k = edges from this file
  const edges = graph.outgoingEdges.get(fromFile) || [];
  const normalizedSource = importSource.replace(/^\.\//, '');
  const edge = edges.find(e => e.to.includes(normalizedSource));
  return edge?.to || null;
}

/**
 * Calculate dependency depth
 * [FIX: COR-03] Added maxDepth parameter to prevent infinite loops
 * [FIX: MNT-01] Use MEDIATOR_CONFIG for default maxDepth
 * [ENH: ALGO] Use Deque for O(1) dequeue instead of O(n) Array.shift()
 */
function calculateDependencyDepth(
  graph: DependencyGraph,
  from: string,
  to: string,
  maxDepth: number = MEDIATOR_CONFIG.DEFAULT_MAX_DEPTH
): number {
  const visited = new Set<string>();
  // [ENH: ALGO] Use Deque for O(1) operations
  const queue = new Deque<{ file: string; depth: number }>();
  queue.pushBack({ file: from, depth: 0 });

  while (!queue.isEmpty()) {
    const item = queue.popFront()!;
    const { file, depth } = item;

    if (file === to) return depth;
    if (visited.has(file)) continue;
    // [FIX: COR-03] Early termination if maxDepth exceeded
    if (depth >= maxDepth) continue;
    visited.add(file);

    const dependents = graph.reverseEdges.get(file) || [];
    for (const dep of dependents) {
      queue.pushBack({ file: dep, depth: depth + 1 });
    }
  }

  return Infinity;
}

// =============================================================================
// Export Summary for Tools
// =============================================================================

/**
 * Mediator state summary
 */
export function getMediatorSummary(sessionId: string): object | null {
  const state = mediatorStates.get(sessionId);
  if (!state) return null;

  const totalInterventions = state.interventions.length;
  const byType = new Map<ActiveInterventionType, number>();
  for (const i of state.interventions) {
    byType.set(i.type, (byType.get(i.type) || 0) + 1);
  }

  return {
    graphStats: {
      totalNodes: state.graph.nodes.size,
      totalEdges: state.graph.edges.length,
      circularDeps: detectCircularDependencies(state.graph).length
    },
    coverage: {
      totalFiles: state.coverage.totalFiles,
      verifiedFiles: state.coverage.verifiedFiles.size,
      coverageRate: (state.coverage.verifiedFiles.size / state.coverage.totalFiles * 100).toFixed(1) + '%',
      unverifiedCritical: state.coverage.unverifiedCritical.length
    },
    interventions: {
      total: totalInterventions,
      byType: Object.fromEntries(byType),
      lastIntervention: state.interventions[state.interventions.length - 1] || null
    }
  };
}

/**
 * [FIX: REL-02] Delete mediator state from memory cache
 * Called when session is ended to prevent memory leaks
 */
export function deleteMediatorState(sessionId: string): boolean {
  return mediatorStates.delete(sessionId);
}
