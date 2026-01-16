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
  getRoleState      // [ENH: CRIT-01] For strict mode check
} from '../roles/index.js';
import { RoleComplianceResult, VerifierRole } from '../roles/types.js';
// [ENH: LIFECYCLE] Import lifecycle management
import {
  detectIssueTransitions,
  applyTransition,
  mergeIssues,
  splitIssue,
  changeSeverity,
  IssueTransitionResult
} from '../lifecycle/index.js';

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

export const StartSessionSchema = z.object({
  target: z.string().describe('Target path to verify (file or directory)'),
  requirements: z.string().describe('User verification requirements'),
  workingDir: z.string().describe('Working directory for relative paths'),
  maxRounds: z.number().optional().default(10).describe('Maximum rounds before forced stop'),
  // [ENH: ONE-SHOT] Verification mode for one-shot verification
  verificationMode: VerificationModeSchema.describe(
    'Verification mode configuration for controlling convergence behavior. Use "fast-track" or "single-pass" for one-shot verification.'
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

// =============================================================================
// Tool Implementations
// =============================================================================

/**
 * Start a new verification session
 * [ENH: ONE-SHOT] Added verificationMode support for one-shot verification
 */
export async function startSession(
  args: z.infer<typeof StartSessionSchema>
): Promise<StartSessionResponse & {
  mediator?: object;
  roles?: object;
  verificationMode?: object;
  preAnalysis?: object;  // [ENH: ONE-SHOT] Pre-analysis results
}> {
  const session = await createSession(args.target, args.requirements, args.maxRounds);

  // [ENH: ONE-SHOT] Set verification mode on session
  if (args.verificationMode) {
    session.verificationMode = args.verificationMode;
  }

  // Initialize context
  await initializeContext(session.id, args.target, args.workingDir);
  await updateSessionStatus(session.id, 'initialized');

  const updatedSession = await getSession(session.id);

  // [ENH: ONE-SHOT] Persist verification mode to session
  if (updatedSession && args.verificationMode) {
    updatedSession.verificationMode = args.verificationMode;
  }

  // [ENH: ONE-SHOT] Perform pre-analysis on collected files
  const preAnalysisResults = updatedSession
    ? analyzeContextForIssues(updatedSession.context)
    : [];
  const preAnalysisSummary = generatePreAnalysisSummary(preAnalysisResults);

  // Initialize Mediator
  const files = updatedSession
    ? Array.from(updatedSession.context.files.keys())
    : [];
  const mediatorState = await initializeMediator(session.id, files, args.workingDir);

  // Initialize Role Enforcement
  const roleState = initializeRoleEnforcement(session.id);
  const verifierPrompt = getRolePrompt('verifier');

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
    }
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
  const raisedIds: string[] = [];
  const newIssues: Issue[] = [];
  const evidenceValidation: Record<string, EvidenceValidationResult> = {};

  if (args.issuesRaised) {
    for (const issueData of args.issuesRaised) {
      // [ENH: HIGH-01] Validate evidence against actual file content
      const validationResult = await validateIssueEvidence(
        session.context,
        issueData.location,
        issueData.evidence
      );
      evidenceValidation[issueData.id] = validationResult;

      // [ENH: AUTO-IMPACT] Automatically analyze impact for the issue
      const impactAnalysis = analyzeIssueImpact(session.id, issueData.location);

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

      await upsertIssue(session.id, issue);
      raisedIds.push(issue.id);
      newIssues.push(issue);
    }
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

  // Get next role prompt if not complete
  const nextRolePrompt = nextRole !== 'complete'
    ? getRolePrompt(nextRole)
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
  }
};
