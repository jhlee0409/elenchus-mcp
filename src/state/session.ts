/**
 * Session State Management
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import { StoragePaths } from '../config/index.js';
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

// Session storage directory (client-agnostic, configurable via ELENCHUS_DATA_DIR)
const SESSIONS_DIR = StoragePaths.sessions;

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
 * Batch upsert multiple issues in a single session write.
 * More efficient than calling upsertIssue multiple times.
 * [ENH: PARALLEL] Parallel issue processing support
 */
export async function batchUpsertIssues(
  sessionId: string,
  issues: Issue[]
): Promise<Issue[]> {
  if (issues.length === 0) return [];

  const session = await getSession(sessionId);
  if (!session) return [];

  for (const issue of issues) {
    const existingIndex = session.issues.findIndex(i => i.id === issue.id);
    if (existingIndex >= 0) {
      session.issues[existingIndex] = issue;
    } else {
      session.issues.push(issue);
    }
  }

  session.updatedAt = new Date().toISOString();
  await persistSession(session);

  return issues;
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
    criticReviewRound: issue.criticReviewRound,
    // [ENH: LIFECYCLE] Issue lifecycle tracking fields
    transitions: issue.transitions ? issue.transitions.map(t => ({ ...t })) : undefined,
    mergedInto: issue.mergedInto,
    splitFrom: issue.splitFrom,
    splitInto: issue.splitInto ? [...issue.splitInto] : undefined,
    relatedIssues: issue.relatedIssues ? [...issue.relatedIssues] : undefined,
    originalSeverity: issue.originalSeverity,
    discoveredDuringDebate: issue.discoveredDuringDebate,
    // [ENH: AUTO-IMPACT] Impact analysis (deep clone nested object)
    impactAnalysis: issue.impactAnalysis ? {
      callers: issue.impactAnalysis.callers.map(c => ({ ...c, functions: c.functions ? [...c.functions] : undefined })),
      dependencies: issue.impactAnalysis.dependencies.map(d => ({ ...d, functions: d.functions ? [...d.functions] : undefined })),
      relatedTests: [...issue.impactAnalysis.relatedTests],
      affectedFunctions: [...issue.impactAnalysis.affectedFunctions],
      cascadeDepth: issue.impactAnalysis.cascadeDepth,
      totalAffectedFiles: issue.impactAnalysis.totalAffectedFiles,
      riskLevel: issue.impactAnalysis.riskLevel,
      summary: issue.impactAnalysis.summary
    } : undefined
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
 * [REFACTORED] Uses helper functions from convergence-helpers.ts for better maintainability
 */
export function checkConvergence(session: Session): ConvergenceStatus {
  // Import helpers inline to avoid circular dependencies
  const {
    aggregateIssues,
    calculateCategoryCoverage,
    countRoundsWithoutNewIssues,
    analyzeEdgeCaseCoverage,
    hasNegativeAssertions: checkNegativeAssertions,
    calculateImpactCoverage,
    evaluateConvergence,
    buildConvergenceReason
  } = require('./convergence-helpers.js');

  // Step 1: Single-pass aggregation of all issue counts
  const aggregation = aggregateIssues(session.issues, session.currentRound);
  const {
    categoryCounts,
    unresolvedIssues,
    criticalUnresolved,
    highUnresolved,
    dismissedCount,
    mergedCount,
    recentTransitions
  } = aggregation;

  const issuesStabilized = recentTransitions === 0;

  // Step 2: Calculate category coverage
  const {
    categoryCoverage,
    allCategoriesExamined,
    uncoveredCategories
  } = calculateCategoryCoverage(categoryCounts, session.rounds, session.issues);

  // Step 3: Count rounds without new issues
  const roundsWithoutNewIssues = countRoundsWithoutNewIssues(session.rounds);

  // Step 4: Analyze edge case coverage
  const allOutputs = session.rounds.map(r => r.output).join('\n');
  const {
    hasEdgeCaseCoverage,
    hasComprehensiveEdgeCaseCoverage,
    edgeCaseCategoryCoverage,
    coveredEdgeCaseCategories,
    missingEdgeCaseCategories
  } = analyzeEdgeCaseCoverage(allOutputs);

  // Step 5: Check negative assertions
  const hasNegativeAssertions = checkNegativeAssertions(allOutputs);

  // Step 6: Calculate impact coverage
  const impactResult = calculateImpactCoverage(session.issues, allOutputs);

  // Step 7: Evaluate convergence
  const { isConverged } = evaluateConvergence(
    session,
    aggregation,
    allCategoriesExamined,
    roundsWithoutNewIssues,
    hasEdgeCaseCoverage,
    hasNegativeAssertions,
    impactResult.hasHighRiskCoverage
  );

  // Step 8: Build reason string
  const reason = buildConvergenceReason(
    isConverged,
    null, // convergenceType not needed for reason
    aggregation,
    session,
    allCategoriesExamined,
    uncoveredCategories,
    hasEdgeCaseCoverage,
    hasNegativeAssertions,
    impactResult.hasHighRiskCoverage,
    impactResult.unreviewedHighRisk,
    roundsWithoutNewIssues,
    impactResult.coverageRate,
    impactResult.totalImpactedFiles
  );

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
    issuesStabilized,
    recentTransitions,
    dismissedCount,
    mergedCount,
    hasEdgeCaseCoverage,
    hasNegativeAssertions,
    edgeCaseCategoryCoverage,
    coveredEdgeCaseCategories,
    missingEdgeCaseCategories,
    hasComprehensiveEdgeCaseCoverage,
    impactCoverage: {
      totalImpactedFiles: impactResult.totalImpactedFiles,
      reviewedImpactedFiles: impactResult.reviewedImpactedFiles,
      unreviewedImpactedFiles: impactResult.unreviewedImpactedFiles,
      coverageRate: impactResult.coverageRate,
      hasHighRiskCoverage: impactResult.hasHighRiskCoverage,
      unreviewedHighRisk: impactResult.unreviewedHighRisk
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
 * [ENH: ALGO] Single-pass aggregation - O(n) instead of O(2n)
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

  // [ENH: ALGO] Single pass - count severity, status, and active in one iteration
  let activeIssues = 0;
  const inactiveStatuses: IssueStatus[] = ['RESOLVED', 'DISMISSED', 'MERGED'];

  for (const issue of session.issues) {
    bySeverity[issue.severity]++;
    byStatus[issue.status]++;

    // Count active issues in same pass
    if (!inactiveStatuses.includes(issue.status)) {
      activeIssues++;
    }
  }

  return {
    total: session.issues.length,
    bySeverity,
    byStatus,
    // [ENH: LIFECYCLE] Additional lifecycle stats
    activeIssues
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
