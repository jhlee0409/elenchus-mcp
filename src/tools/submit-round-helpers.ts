/**
 * Submit Round Helper Functions
 *
 * Extracted from submitRound() for better maintainability and testability.
 * Each function handles a single responsibility in the round submission process.
 */

import { z } from 'zod';
import { Session, Issue } from '../types/index.js';
import { upsertIssue, batchUpsertIssues } from '../state/session.js';
import { validateIssueEvidence, EvidenceValidationResult } from '../state/context.js';
import { analyzeIssueImpact } from '../mediator/index.js';
import { IssueTransitionResult, changeSeverity, mergeIssues, splitIssue } from '../lifecycle/index.js';
import { SubmitRoundSchema } from './schemas.js';
import { getFreshVerdictPatterns } from '../utils/patterns.js';

// =============================================================================
// Types
// =============================================================================

export interface ProcessedIssue {
  issue: Issue;
  validationResult: EvidenceValidationResult;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Process new issues with validation and impact analysis
 */
export async function processNewIssues(
  issuesData: NonNullable<z.infer<typeof SubmitRoundSchema>['issuesRaised']>,
  session: Session,
  role: 'verifier' | 'critic'
): Promise<{
  issues: Issue[];
  evidenceValidation: Record<string, EvidenceValidationResult>;
  raisedIds: string[];
}> {
  const raisedIds: string[] = [];
  const newIssues: Issue[] = [];
  const evidenceValidation: Record<string, EvidenceValidationResult> = {};

  // Phase 1: Parallel validation and impact analysis
  const processedResults = await Promise.all(
    issuesData.map(async (issueData) => {
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
      raisedBy: role,
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

  return { issues: newIssues, evidenceValidation, raisedIds };
}

/**
 * Process Critic verdicts from output text
 */
export async function processCriticVerdicts(
  session: Session,
  output: string,
  currentRound: number
): Promise<void> {
  const verdictPatterns = getFreshVerdictPatterns();
  for (const pattern of verdictPatterns) {
    let match;
    while ((match = pattern.exec(output)) !== null) {
      const issueId = match[1].includes('-') ? match[1] : `${match[1]}-${match[2]}`;
      const verdict = (match[2] || match[3]).toUpperCase() as 'VALID' | 'INVALID' | 'PARTIAL';

      const issue = session.issues.find(i => i.id.toUpperCase() === issueId.toUpperCase());
      if (issue) {
        issue.criticReviewed = true;
        issue.criticVerdict = verdict;
        issue.criticReviewRound = currentRound + 1;

        if (verdict === 'INVALID') {
          issue.status = 'RESOLVED';
          issue.resolvedInRound = currentRound + 1;
          issue.resolution = 'Marked as false positive by Critic';
        }

        await upsertIssue(session.id, issue);
      }
    }
  }
}

/**
 * Process resolved issues
 */
export async function processResolvedIssues(
  session: Session,
  issueIds: string[],
  role: string,
  currentRound: number
): Promise<void> {
  for (const issueId of issueIds) {
    const issue = session.issues.find(i => i.id === issueId);
    if (issue && issue.status !== 'RESOLVED') {
      if (issue.criticReviewed) {
        if (issue.criticVerdict === 'VALID' || issue.criticVerdict === 'INVALID') {
          issue.status = 'RESOLVED';
          issue.resolvedInRound = currentRound + 1;
          issue.resolution = issue.criticVerdict === 'INVALID'
            ? 'Dismissed as false positive'
            : 'Confirmed and resolved';
          await upsertIssue(session.id, issue);
        }
      } else {
        issue.status = 'RESOLVED';
        issue.resolvedInRound = currentRound + 1;
        issue.resolution = 'Resolved by ' + role;
        await upsertIssue(session.id, issue);
      }
    }
  }
}

/**
 * Process issue lifecycle transitions (severity changes, merges, splits, discoveries)
 */
export async function processLifecycleTransitions(
  session: Session,
  lifecycleResult: IssueTransitionResult,
  role: string,
  raisedIds: string[],
  newIssues: Issue[]
): Promise<{ updatedRaisedIds: string[]; updatedNewIssues: Issue[] }> {
  const updatedRaisedIds = [...raisedIds];
  const updatedNewIssues = [...newIssues];

  // Process severity changes
  for (const change of lifecycleResult.severityChanges) {
    const issue = session.issues.find(i => i.id === change.issueId);
    if (issue) {
      const updated = changeSeverity(
        issue,
        change.toSeverity,
        session.currentRound + 1,
        change.reason,
        role as 'verifier' | 'critic'
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
        role as 'verifier' | 'critic'
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
        role as 'verifier' | 'critic'
      );
      await upsertIssue(session.id, updatedSource);
      for (const newIssue of splitIssues) {
        await upsertIssue(session.id, newIssue);
        updatedRaisedIds.push(newIssue.id);
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
      updatedRaisedIds.push(issue.id);
      updatedNewIssues.push(issue);
    }
  }

  return { updatedRaisedIds, updatedNewIssues };
}

/**
 * Determine next role based on verification mode and convergence
 */
export function determineNextRole(
  isConverged: boolean,
  currentRound: number,
  maxRounds: number,
  verificationMode: string,
  currentRole: string,
  raisedIdsCount: number,
  skipCriticForCleanCode: boolean,
  expectedNextRole: 'verifier' | 'critic'
): 'verifier' | 'critic' | 'complete' {
  if (isConverged || currentRound >= maxRounds) {
    return 'complete';
  }

  if (verificationMode === 'single-pass') {
    return 'verifier';
  }

  if (verificationMode === 'fast-track' &&
      currentRole === 'verifier' &&
      raisedIdsCount === 0 &&
      skipCriticForCleanCode) {
    return 'verifier';
  }

  return expectedNextRole;
}
