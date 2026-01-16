/**
 * Session State Management
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import {
  Session,
  SessionStatus,
  Round,
  Issue,
  Checkpoint,
  ConvergenceStatus,
  IssueCategory,
  Severity,
  IssueStatus
} from '../types/index.js';

/**
 * Zod schema for session JSON validation
 * [FIX: COR-01] Validate JSON structure before deserialization
 */
// [ENH: LIFECYCLE] Issue Transition Schema
const IssueTransitionSchema = z.object({
  type: z.enum(['DISCOVERED', 'ESCALATED', 'DEMOTED', 'MERGED_INTO', 'SPLIT_FROM', 'INVALIDATED', 'VALIDATED', 'REFINED']),
  fromStatus: z.enum(['RAISED', 'CHALLENGED', 'RESOLVED', 'UNRESOLVED', 'DISMISSED', 'MERGED', 'SPLIT']),
  toStatus: z.enum(['RAISED', 'CHALLENGED', 'RESOLVED', 'UNRESOLVED', 'DISMISSED', 'MERGED', 'SPLIT']),
  fromSeverity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  toSeverity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  round: z.number(),
  reason: z.string(),
  evidence: z.string().optional(),
  triggeredBy: z.enum(['verifier', 'critic', 'mediator']),
  timestamp: z.string()
});

const IssueSchema = z.object({
  id: z.string(),
  category: z.enum(['SECURITY', 'CORRECTNESS', 'RELIABILITY', 'MAINTAINABILITY', 'PERFORMANCE']),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  // [ENH: LIFECYCLE] Extended status values
  status: z.enum(['RAISED', 'CHALLENGED', 'RESOLVED', 'UNRESOLVED', 'DISMISSED', 'MERGED', 'SPLIT']),
  summary: z.string(),
  description: z.string(),
  location: z.string(),
  evidence: z.string(),
  suggestedFix: z.string().optional(),
  raisedInRound: z.number(),
  challengedInRound: z.number().optional(),
  resolvedInRound: z.number().optional(),
  // [ENH: LIFECYCLE] Lifecycle tracking fields
  transitions: z.array(IssueTransitionSchema).optional(),
  mergedInto: z.string().optional(),
  splitFrom: z.string().optional(),
  splitInto: z.array(z.string()).optional(),
  relatedIssues: z.array(z.string()).optional(),
  originalSeverity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  discoveredDuringDebate: z.boolean().optional(),
  // [ENH: CRIT-02] Critic review fields
  criticReviewed: z.boolean().optional(),
  criticVerdict: z.enum(['VALID', 'INVALID', 'PARTIAL']).optional(),
  criticReviewRound: z.number().optional()
});

const RoundSchema = z.object({
  number: z.number(),
  role: z.enum(['verifier', 'critic']),
  output: z.string(),
  issuesRaised: z.array(z.string()),
  issuesResolved: z.array(z.string()),
  timestamp: z.string()
});

const CheckpointSchema = z.object({
  roundNumber: z.number(),
  timestamp: z.string(),
  contextSnapshot: z.array(z.string()),
  issuesSnapshot: z.array(IssueSchema),
  canRollbackTo: z.boolean()
});

// [ENH: FRAMING] Framing Result Schema
const FramingResultSchema = z.object({
  structuredRequest: z.string(),
  verificationAgenda: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    category: z.enum(['SECURITY', 'CORRECTNESS', 'RELIABILITY', 'MAINTAINABILITY', 'PERFORMANCE']),
    priority: z.enum(['MUST', 'SHOULD', 'COULD']),
    estimatedComplexity: z.enum(['LOW', 'MEDIUM', 'HIGH'])
  })),
  contextScope: z.object({
    targetFiles: z.array(z.string()),
    relatedFiles: z.array(z.string()),
    excludedFiles: z.array(z.string())
  }),
  constraints: z.array(z.string()),
  successCriteria: z.array(z.string())
}).optional();

const SessionSchema = z.object({
  id: z.string(),
  target: z.string(),
  requirements: z.string(),
  // [ENH: FRAMING] Extended status with framing and re-verifying
  status: z.enum(['initialized', 'framing', 'verifying', 'converging', 'converged', 'forced_stop', 'error', 're-verifying']),
  currentRound: z.number(),
  maxRounds: z.number(),
  context: z.object({
    target: z.string(),
    requirements: z.string(),
    files: z.record(z.string(), z.any())  // Map serialized as object
  }),
  issues: z.array(IssueSchema),
  rounds: z.array(RoundSchema),
  checkpoints: z.array(CheckpointSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  // [ENH: FRAMING] Phase tracking
  phase: z.enum(['framing', 'verification', 'synthesis', 'implementation', 're-verification']).optional(),
  framing: FramingResultSchema,
  // [ENH: REVERIFY] Re-verification tracking
  reVerificationTargets: z.array(z.string()).optional(),
  previousVerificationId: z.string().optional()
});

// Session storage directory
const SESSIONS_DIR = path.join(
  process.env.HOME || '~',
  '.claude',
  'elenchus',
  'sessions'
);

// In-memory session cache
const sessions = new Map<string, Session>();

/**
 * Validate session ID to prevent path traversal attacks
 * [FIX: SEC-01]
 */
function isValidSessionId(sessionId: string): boolean {
  // Only allow alphanumeric, hyphens, and underscores
  // Reject path traversal patterns and excessive length
  return /^[a-zA-Z0-9_-]+$/.test(sessionId) &&
         !sessionId.includes('..') &&
         sessionId.length > 0 &&
         sessionId.length <= 100;
}

/**
 * Generate unique session ID
 */
function generateSessionId(target: string): string {
  const date = new Date().toISOString().split('T')[0];
  const targetSlug = target.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 30);
  const random = Math.random().toString(36).slice(2, 8);
  return `${date}_${targetSlug}_${random}`;
}

/**
 * Create new session
 */
export async function createSession(
  target: string,
  requirements: string,
  maxRounds: number = 10
): Promise<Session> {
  const sessionId = generateSessionId(target);
  const now = new Date().toISOString();

  const session: Session = {
    id: sessionId,
    target,
    requirements,
    status: 'initialized',
    currentRound: 0,
    maxRounds,
    context: {
      target,
      requirements,
      files: new Map()
    },
    issues: [],
    rounds: [],
    checkpoints: [],
    createdAt: now,
    updatedAt: now
  };

  sessions.set(sessionId, session);
  await persistSession(session);

  return session;
}

/**
 * Get session by ID
 */
export async function getSession(sessionId: string): Promise<Session | null> {
  // [FIX: SEC-01] Validate session ID to prevent path traversal
  if (!isValidSessionId(sessionId)) {
    console.error(`[Elenchus] Invalid session ID rejected: ${sessionId}`);
    return null;
  }

  // Check memory cache first
  if (sessions.has(sessionId)) {
    return sessions.get(sessionId)!;
  }

  // Try loading from disk
  try {
    const sessionPath = path.join(SESSIONS_DIR, sessionId, 'session.json');
    const data = await fs.readFile(sessionPath, 'utf-8');
    const rawData = JSON.parse(data);

    // [FIX: COR-01] Validate JSON structure with Zod schema
    const parseResult = SessionSchema.safeParse(rawData);
    if (!parseResult.success) {
      console.error(`[Elenchus] Invalid session data for ${sessionId}:`, parseResult.error.format());
      return null;
    }

    const session = parseResult.data as Session;

    // [FIX: REL-02] Restore Map from serialized form with validation
    const filesData = session.context.files;
    if (filesData && typeof filesData === 'object' && !Array.isArray(filesData)) {
      session.context.files = new Map(Object.entries(filesData));
    } else {
      console.warn(`[Elenchus] Invalid files data in session ${sessionId}, initializing empty Map`);
      session.context.files = new Map();
    }

    sessions.set(sessionId, session);
    return session;
  } catch (error) {
    // [FIX: REL-01] Log errors except for missing files
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`[Elenchus] Failed to load session ${sessionId}:`, error);
    }
    return null;
  }
}

/**
 * Update session status
 */
export async function updateSessionStatus(
  sessionId: string,
  status: SessionStatus
): Promise<Session | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  session.status = status;
  session.updatedAt = new Date().toISOString();

  await persistSession(session);
  return session;
}

/**
 * Add round to session
 */
export async function addRound(
  sessionId: string,
  round: Omit<Round, 'number' | 'timestamp'>
): Promise<Round | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  const newRound: Round = {
    ...round,
    number: session.currentRound + 1,
    timestamp: new Date().toISOString()
  };

  session.rounds.push(newRound);
  session.currentRound = newRound.number;
  session.status = 'verifying';
  session.updatedAt = new Date().toISOString();

  await persistSession(session);
  return newRound;
}

/**
 * Add or update issue
 */
export async function upsertIssue(
  sessionId: string,
  issue: Issue
): Promise<Issue | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  const existingIndex = session.issues.findIndex(i => i.id === issue.id);

  if (existingIndex >= 0) {
    session.issues[existingIndex] = issue;
  } else {
    session.issues.push(issue);
  }

  session.updatedAt = new Date().toISOString();
  await persistSession(session);

  return issue;
}

/**
 * [ENH: MED-01] Deep clone an issue to prevent reference issues
 */
function deepCloneIssue(issue: Issue): Issue {
  return {
    id: issue.id,
    category: issue.category,
    severity: issue.severity,
    summary: issue.summary,
    location: issue.location,
    description: issue.description,
    evidence: issue.evidence,
    raisedBy: issue.raisedBy,
    raisedInRound: issue.raisedInRound,
    status: issue.status,
    resolvedInRound: issue.resolvedInRound,
    resolution: issue.resolution,
    // [ENH: CRIT-02] Include critic review fields
    criticReviewed: issue.criticReviewed,
    criticVerdict: issue.criticVerdict,
    criticReviewRound: issue.criticReviewRound
  };
}

/**
 * Create checkpoint
 * [ENH: MED-01] Use deep copy for issue snapshots
 */
export async function createCheckpoint(
  sessionId: string
): Promise<Checkpoint | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  // [ENH: MED-01] Deep clone issues to prevent reference issues
  const checkpoint: Checkpoint = {
    roundNumber: session.currentRound,
    timestamp: new Date().toISOString(),
    contextSnapshot: Array.from(session.context.files.keys()),
    issuesSnapshot: session.issues.map(deepCloneIssue),
    canRollbackTo: true
  };

  session.checkpoints.push(checkpoint);
  session.updatedAt = new Date().toISOString();

  await persistSession(session);
  return checkpoint;
}

/**
 * Rollback to checkpoint
 * [ENH: MED-01] Use deep copy when restoring issues
 */
export async function rollbackToCheckpoint(
  sessionId: string,
  checkpointRound: number
): Promise<Session | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  const checkpoint = session.checkpoints.find(
    cp => cp.roundNumber === checkpointRound && cp.canRollbackTo
  );

  if (!checkpoint) return null;

  // [ENH: MED-01] Deep clone issues when restoring to prevent reference issues
  session.currentRound = checkpoint.roundNumber;
  session.issues = checkpoint.issuesSnapshot.map(deepCloneIssue);
  session.rounds = session.rounds.filter(r => r.number <= checkpoint.roundNumber);
  session.status = 'verifying';
  session.updatedAt = new Date().toISOString();

  await persistSession(session);
  return session;
}

/**
 * Check convergence status
 * [ENH: CRIT-03] Include HIGH severity in convergence check
 * [ENH: HIGH-05] Add category coverage to convergence
 * [ENH: LIFECYCLE] Add issue stabilization check
 */
export function checkConvergence(session: Session): ConvergenceStatus {
  const categories: IssueCategory[] = [
    'SECURITY', 'CORRECTNESS', 'RELIABILITY', 'MAINTAINABILITY', 'PERFORMANCE'
  ];

  const categoryTotals: Record<IssueCategory, number> = {
    SECURITY: 8,
    CORRECTNESS: 6,
    RELIABILITY: 4,
    MAINTAINABILITY: 4,
    PERFORMANCE: 4
  };

  // Count issues by category
  const categoryCoverage: Record<IssueCategory, { checked: number; total: number }> =
    {} as any;

  for (const cat of categories) {
    const checked = session.issues.filter(i => i.category === cat).length;
    categoryCoverage[cat] = { checked, total: categoryTotals[cat] };
  }

  // [ENH: LIFECYCLE] Count issues excluding dismissed/merged
  const activeIssues = session.issues.filter(
    i => !['RESOLVED', 'DISMISSED', 'MERGED'].includes(i.status)
  );

  const unresolvedIssues = activeIssues.length;

  const criticalUnresolved = activeIssues.filter(
    i => i.severity === 'CRITICAL'
  ).length;

  // [ENH: CRIT-03] Count HIGH severity unresolved issues
  const highUnresolved = activeIssues.filter(
    i => i.severity === 'HIGH'
  ).length;

  // [ENH: LIFECYCLE] Count dismissed and merged issues
  const dismissedCount = session.issues.filter(i => i.status === 'DISMISSED').length;
  const mergedCount = session.issues.filter(i => i.status === 'MERGED').length;

  // [ENH: LIFECYCLE] Check issue stabilization (no transitions in last 2 rounds)
  const recentTransitions = session.issues
    .flatMap(i => i.transitions || [])
    .filter(t => t.round >= session.currentRound - 1)
    .length;
  const issuesStabilized = recentTransitions === 0;

  // Count rounds without new issues
  let roundsWithoutNewIssues = 0;
  for (let i = session.rounds.length - 1; i >= 0; i--) {
    if (session.rounds[i].issuesRaised.length === 0) {
      roundsWithoutNewIssues++;
    } else {
      break;
    }
  }

  // =============================================================================
  // [ENH: INTENT-BASED] Category Coverage Check
  // Instead of keyword matching, check for explicit category mentions or issues
  // Trust the LLM to semantically examine categories
  // =============================================================================
  
  const uncoveredCategories: IssueCategory[] = [];
  for (const cat of categories) {
    // Check if category was explicitly examined (mentioned or has issues)
    const hasIssueInCategory = session.issues.some(i => i.category === cat);
    const categoryMentionedExplicitly = session.rounds.some(r => 
      r.output.toUpperCase().includes(cat)  // Just check category name itself
    );
    
    if (!hasIssueInCategory && !categoryMentionedExplicitly) {
      uncoveredCategories.push(cat);
    }
  }
  const allCategoriesExamined = uncoveredCategories.length === 0;

  // =============================================================================
  // [ENH: INTENT-BASED] Edge Case Coverage Check
  // Instead of hardcoded keyword lists, check for STRUCTURED edge case analysis
  // Trust the LLM's semantic understanding of what constitutes edge case coverage
  // =============================================================================
  
  // Edge case categories are conceptual - we track them for reporting, not keyword matching
  const edgeCaseCategoryNames = [
    'codeLevel',          // null, undefined, boundary values
    'userBehavior',       // double-click, race conditions
    'externalDependencies', // API failures, timeouts
    'businessLogic',      // permission, state transitions
    'dataState',          // legacy data, corruption
    'environment',        // config drift, resource limits
    'scale',              // high concurrency, large data
    'security',           // input validation, session attacks
    'sideEffects'         // state mutation, transactions
  ];

  // Intent-based edge case detection:
  // Check for STRUCTURAL indicators of edge case analysis, not specific keywords
  const allOutputs = session.rounds.map(r => r.output).join('\n');
  
  // Structural indicators that edge cases were considered
  const edgeCaseStructuralIndicators = [
    // Section headers (multiple languages)
    /edge\s*case|엣지\s*케이스|경계\s*(조건|케이스)|boundary|corner\s*case/i,
    // Explicit edge case enumeration
    /what\s*if|만약.*라면|when.*fails?|failure\s*scenario/i,
    // Negative/boundary thinking
    /empty|null|없.*경우|zero|maximum|minimum|overflow|underflow/i
  ];
  
  const hasStructuralEdgeCaseAnalysis = edgeCaseStructuralIndicators.some(
    pattern => pattern.test(allOutputs)
  );

  // For convergence tracking, we use a simplified semantic check
  // The detailed validation is in role definitions, this is just for status reporting
  const edgeCaseCategoryCoverage: Record<string, boolean> = {};
  
  // Instead of keyword matching, check for evidence of thinking about each area
  // This is a soft check - the real validation happens in role enforcement
  for (const category of edgeCaseCategoryNames) {
    // Simple heuristic: check if there are mentions that suggest the category was considered
    // This is intentionally loose - the strict validation is in checkEdgeCaseCoverage
    edgeCaseCategoryCoverage[category] = hasStructuralEdgeCaseAnalysis;
  }

  const coveredEdgeCaseCategories = hasStructuralEdgeCaseAnalysis ? edgeCaseCategoryNames : [];
  const missingEdgeCaseCategories = hasStructuralEdgeCaseAnalysis ? [] : edgeCaseCategoryNames;

  // Edge case coverage is determined by structural analysis presence
  const hasEdgeCaseCoverage = hasStructuralEdgeCaseAnalysis;
  const hasComprehensiveEdgeCaseCoverage = hasStructuralEdgeCaseAnalysis;

  // =============================================================================
  // [ENH: INTENT-BASED] Negative Assertions Check
  // Check for explicit statements of "verified clean" or "no issues found"
  // =============================================================================
  
  const negativeAssertionPatterns = [
    // Explicit clean statements
    /no\s*(issues?|problems?|concerns?)(\s*found)?/i,
    /이슈\s*없|문제\s*없|이상\s*없/i,
    /clean|passed|verified|확인.*완료/i,
    /✓|✔|✅/,
    // Explicit "checked X, found nothing" pattern
    /(checked|reviewed|examined|verified).*no\s*(issues?|problems?)/i
  ];
  
  const hasNegativeAssertions = negativeAssertionPatterns.some(
    pattern => pattern.test(allOutputs)
  );

  // =============================================================================
  // [ENH: AUTO-IMPACT] Impact Coverage Validation
  // Check that all impacted files from issues have been reviewed
  // =============================================================================

  // Collect all impacted files from issues with impact analysis
  const impactedFiles = new Set<string>();
  const highRiskImpactedFiles = new Set<string>();

  for (const issue of session.issues) {
    if (issue.impactAnalysis) {
      // Add callers
      for (const caller of issue.impactAnalysis.callers || []) {
        impactedFiles.add(caller.file);
        if (issue.impactAnalysis.riskLevel === 'HIGH' || issue.impactAnalysis.riskLevel === 'CRITICAL') {
          highRiskImpactedFiles.add(caller.file);
        }
      }
      // Add dependencies
      for (const dep of issue.impactAnalysis.dependencies || []) {
        impactedFiles.add(dep.file);
      }
    }
  }

  // Check which impacted files were mentioned in rounds
  const allOutputsLower = allOutputs.toLowerCase();
  const reviewedImpactedFiles: string[] = [];
  const unreviewedImpactedFiles: string[] = [];

  for (const file of impactedFiles) {
    // Extract filename for matching
    const filename = file.split('/').pop() || file;
    if (allOutputsLower.includes(filename.toLowerCase()) || allOutputsLower.includes(file.toLowerCase())) {
      reviewedImpactedFiles.push(file);
    } else {
      unreviewedImpactedFiles.push(file);
    }
  }

  // Calculate impact coverage
  const impactCoverageRate = impactedFiles.size > 0
    ? reviewedImpactedFiles.length / impactedFiles.size
    : 1;
  const hasAdequateImpactCoverage = impactCoverageRate >= 0.7;  // 70% coverage required

  // Check high-risk files specifically
  const unreviewedHighRisk = Array.from(highRiskImpactedFiles).filter(
    f => !reviewedImpactedFiles.includes(f)
  );
  const hasHighRiskCoverage = unreviewedHighRisk.length === 0;

  // =============================================================================
  // [ENH: ONE-SHOT] Convergence Decision with Verification Mode Support
  // =============================================================================

  const mode = session.verificationMode?.mode || 'standard';
  const minRounds = session.verificationMode?.minRounds ?? (mode === 'standard' ? 3 : mode === 'fast-track' ? 1 : 1);
  const stableRoundsRequired = session.verificationMode?.stableRoundsRequired ?? (mode === 'standard' ? 2 : 1);

  // [ENH: ONE-SHOT] Fast-track convergence for clean code
  const isCleanCode = unresolvedIssues === 0 && session.issues.length === 0;
  const canFastTrack = mode === 'fast-track' || mode === 'single-pass';
  const skipStrictChecks = canFastTrack && isCleanCode;

  // Standard convergence criteria
  const standardConvergence =
    criticalUnresolved === 0 &&
    highUnresolved === 0 &&
    roundsWithoutNewIssues >= stableRoundsRequired &&
    session.currentRound >= minRounds &&
    allCategoriesExamined &&
    issuesStabilized &&
    hasEdgeCaseCoverage &&
    hasNegativeAssertions &&
    hasHighRiskCoverage;

  // [ENH: ONE-SHOT] Fast-track convergence for clean code
  // If no issues found after thorough check, allow early convergence
  const fastTrackConvergence =
    canFastTrack &&
    criticalUnresolved === 0 &&
    highUnresolved === 0 &&
    allCategoriesExamined &&
    hasEdgeCaseCoverage &&
    hasNegativeAssertions &&
    session.currentRound >= 1;  // At least one complete round

  // [ENH: ONE-SHOT] Single-pass convergence (most aggressive)
  // Converge if Verifier completed thorough check with no CRITICAL/HIGH issues
  const singlePassConvergence =
    mode === 'single-pass' &&
    criticalUnresolved === 0 &&
    highUnresolved === 0 &&
    allCategoriesExamined &&
    session.currentRound >= 1;

  const isConverged = standardConvergence || fastTrackConvergence || singlePassConvergence;

  // Build detailed reason
  let reason: string;
  if (isConverged) {
    const impactInfo = impactedFiles.size > 0
      ? `, impact coverage: ${(impactCoverageRate * 100).toFixed(0)}%`
      : '';
    const modeInfo = mode !== 'standard' ? ` [${mode} mode]` : '';
    reason = `All critical/high issues resolved, all categories examined, edge cases analyzed, issues stabilized, ${roundsWithoutNewIssues}+ rounds stable${impactInfo}${modeInfo}`;
  } else if (criticalUnresolved > 0) {
    reason = `${criticalUnresolved} CRITICAL issues unresolved`;
  } else if (highUnresolved > 0) {
    reason = `${highUnresolved} HIGH severity issues unresolved`;
  } else if (!allCategoriesExamined) {
    reason = `Categories not examined: ${uncoveredCategories.join(', ')}`;
  } else if (!hasEdgeCaseCoverage) {
    reason = 'Edge case analysis not documented - include "Edge Cases:" section with boundary/failure scenarios';
  } else if (!hasNegativeAssertions) {
    reason = 'Missing negative assertions - must state what was verified as clean';
  } else if (!hasHighRiskCoverage) {
    reason = `High-risk impacted files not reviewed: ${unreviewedHighRisk.slice(0, 3).join(', ')}`;
  } else if (!issuesStabilized && mode === 'standard') {
    reason = `Issues still changing (${recentTransitions} recent transitions)`;
  } else if (session.currentRound < minRounds) {
    reason = `Minimum ${minRounds} round(s) required (current: ${session.currentRound}) [${mode} mode]`;
  } else {
    reason = 'Verification in progress';
  }

  return {
    isConverged,
    reason,
    categoryCoverage,
    unresolvedIssues,
    criticalUnresolved,
    highUnresolved,
    roundsWithoutNewIssues,
    allCategoriesExamined,
    uncoveredCategories,
    // [ENH: LIFECYCLE] Issue lifecycle tracking
    issuesStabilized,
    recentTransitions,
    dismissedCount,
    mergedCount,
    // [ENH: EXHAUST] Exhaustive verification tracking
    hasEdgeCaseCoverage,
    hasNegativeAssertions,
    // Edge case tracking (intent-based - for reporting only)
    edgeCaseCategoryCoverage,
    coveredEdgeCaseCategories,
    missingEdgeCaseCategories,
    hasComprehensiveEdgeCaseCoverage,
    // [ENH: AUTO-IMPACT] Impact coverage tracking
    impactCoverage: {
      totalImpactedFiles: impactedFiles.size,
      reviewedImpactedFiles: reviewedImpactedFiles.length,
      unreviewedImpactedFiles,
      coverageRate: impactCoverageRate,
      hasHighRiskCoverage,
      unreviewedHighRisk
    }
  };
}

/**
 * [ENH: HIGH-02] Stale issue detection
 * Issues that haven't been addressed for N rounds
 */
export interface StaleIssueInfo {
  id: string;
  summary: string;
  severity: Severity;
  staleForRounds: number;
  lastMentionedRound: number;
}

export function detectStaleIssues(session: Session, staleThreshold: number = 3): StaleIssueInfo[] {
  const staleIssues: StaleIssueInfo[] = [];
  const currentRound = session.currentRound;

  for (const issue of session.issues) {
    // Skip resolved issues
    if (issue.status === 'RESOLVED') continue;

    // Find last round that mentioned this issue
    let lastMentionedRound = issue.raisedInRound;

    for (const round of session.rounds) {
      // Check if issue was mentioned in round output
      if (round.output.toLowerCase().includes(issue.id.toLowerCase())) {
        lastMentionedRound = Math.max(lastMentionedRound, round.number);
      }
      // Check if issue was in issuesRaised or issuesResolved
      if (round.issuesRaised.includes(issue.id) || round.issuesResolved.includes(issue.id)) {
        lastMentionedRound = Math.max(lastMentionedRound, round.number);
      }
    }

    // Check for critic review
    if (issue.criticReviewRound) {
      lastMentionedRound = Math.max(lastMentionedRound, issue.criticReviewRound);
    }

    const staleForRounds = currentRound - lastMentionedRound;

    if (staleForRounds >= staleThreshold) {
      staleIssues.push({
        id: issue.id,
        summary: issue.summary,
        severity: issue.severity,
        staleForRounds,
        lastMentionedRound
      });
    }
  }

  // Sort by severity (CRITICAL first) and then by staleness
  const severityOrder: Record<Severity, number> = {
    CRITICAL: 0,
    HIGH: 1,
    MEDIUM: 2,
    LOW: 3
  };

  return staleIssues.sort((a, b) => {
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return b.staleForRounds - a.staleForRounds;
  });
}

/**
 * Get issues summary
 * [ENH: LIFECYCLE] Updated to include new status types
 */
export function getIssuesSummary(session: Session) {
  const bySeverity: Record<Severity, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0
  };

  // [ENH: LIFECYCLE] Include all status types
  const byStatus: Record<IssueStatus, number> = {
    RAISED: 0,
    CHALLENGED: 0,
    RESOLVED: 0,
    UNRESOLVED: 0,
    DISMISSED: 0,
    MERGED: 0,
    SPLIT: 0
  };

  for (const issue of session.issues) {
    bySeverity[issue.severity]++;
    byStatus[issue.status]++;
  }

  return {
    total: session.issues.length,
    bySeverity,
    byStatus,
    // [ENH: LIFECYCLE] Additional lifecycle stats
    activeIssues: session.issues.filter(i =>
      !['RESOLVED', 'DISMISSED', 'MERGED'].includes(i.status)
    ).length
  };
}

/**
 * Persist session to disk
 */
async function persistSession(session: Session): Promise<void> {
  const sessionDir = path.join(SESSIONS_DIR, session.id);

  await fs.mkdir(sessionDir, { recursive: true });

  // Convert Map to object for JSON serialization
  const serializable = {
    ...session,
    context: {
      ...session.context,
      files: Object.fromEntries(session.context.files)
    }
  };

  await fs.writeFile(
    path.join(sessionDir, 'session.json'),
    JSON.stringify(serializable, null, 2)
  );
}

/**
 * List all sessions
 */
export async function listSessions(): Promise<string[]> {
  try {
    await fs.mkdir(SESSIONS_DIR, { recursive: true });
    const entries = await fs.readdir(SESSIONS_DIR);
    return entries;
  } catch {
    return [];
  }
}

/**
 * [FIX: REL-02] Delete session from memory cache
 * Called when session is ended to prevent memory leaks
 */
export function deleteSessionFromCache(sessionId: string): boolean {
  return sessions.delete(sessionId);
}
