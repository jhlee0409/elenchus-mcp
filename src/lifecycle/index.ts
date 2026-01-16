/**
 * Issue Lifecycle Management
 * [ENH: LIFECYCLE] Handles issue transitions during adversarial verification
 */

import {
  Issue,
  IssueStatus,
  IssueTransitionType,
  IssueTransitionRecord,
  Severity,
  IssueCategory,
  Session
} from '../types/index.js';

// =============================================================================
// Issue Transition Detection
// =============================================================================

export interface IssueTransitionResult {
  transitions: IssueTransitionRecord[];
  newIssues: Partial<Issue>[];
  mergeRequests: MergeRequest[];
  splitRequests: SplitRequest[];
  severityChanges: SeverityChangeRequest[];
}

export interface MergeRequest {
  sourceIds: string[];
  targetId: string;
  reason: string;
}

export interface SplitRequest {
  sourceId: string;
  newIssues: Partial<Issue>[];
  reason: string;
}

export interface SeverityChangeRequest {
  issueId: string;
  fromSeverity: Severity;
  toSeverity: Severity;
  reason: string;
}

/**
 * Detect issue transitions from round output
 */
export function detectIssueTransitions(
  session: Session,
  role: 'verifier' | 'critic',
  output: string,
  existingIssues: Issue[]
): IssueTransitionResult {
  const transitions: IssueTransitionRecord[] = [];
  const newIssues: Partial<Issue>[] = [];
  const mergeRequests: MergeRequest[] = [];
  const splitRequests: SplitRequest[] = [];
  const severityChanges: SeverityChangeRequest[] = [];

  // 1. Detect new issues discovered during debate (especially by Critic)
  if (role === 'critic') {
    const discoveredIssues = detectDiscoveredIssues(output, existingIssues);
    newIssues.push(...discoveredIssues);
  }

  // 2. Detect severity changes
  const severityPatterns = detectSeverityChanges(output, existingIssues);
  severityChanges.push(...severityPatterns);

  // 3. Detect merge requests
  const merges = detectMergeRequests(output, existingIssues);
  mergeRequests.push(...merges);

  // 4. Detect split requests
  const splits = detectSplitRequests(output, existingIssues);
  splitRequests.push(...splits);

  // 5. Detect invalidation
  const invalidations = detectInvalidations(output, existingIssues);
  for (const inv of invalidations) {
    transitions.push({
      type: 'INVALIDATED',
      fromStatus: inv.currentStatus,
      toStatus: 'DISMISSED',
      round: session.currentRound + 1,
      reason: inv.reason,
      triggeredBy: role,
      timestamp: new Date().toISOString()
    });
  }

  return {
    transitions,
    newIssues,
    mergeRequests,
    splitRequests,
    severityChanges
  };
}

// =============================================================================
// Detection Helpers
// =============================================================================

/**
 * Detect new issues discovered during debate
 */
function detectDiscoveredIssues(
  output: string,
  existingIssues: Issue[]
): Partial<Issue>[] {
  const newIssues: Partial<Issue>[] = [];

  // Patterns indicating new issue discovery
  const discoveryPatterns = [
    /(?:also|additionally|furthermore|moreover)[,\s]+(?:found|discovered|noticed|identified)\s+(?:a\s+)?(?:new\s+)?(?:issue|problem|concern|vulnerability)/gi,
    /(?:new|additional)\s+(?:issue|problem|concern|vulnerability)[:\s]+([^\n.]+)/gi,
    /(?:missed|overlooked|not\s+mentioned)[:\s]+([^\n.]+)/gi,
    /(?:should\s+also\s+(?:check|verify|consider))[:\s]+([^\n.]+)/gi
  ];

  const existingIds = new Set(existingIssues.map(i => i.id.toLowerCase()));

  for (const pattern of discoveryPatterns) {
    let match;
    while ((match = pattern.exec(output)) !== null) {
      const context = match[1] || match[0];

      // Try to extract issue details
      const categoryMatch = context.match(/(security|correctness|reliability|maintainability|performance)/i);
      const severityMatch = context.match(/(critical|high|medium|low)/i);

      // Generate a potential ID
      const potentialId = generateIssueIdFromContext(context, categoryMatch?.[1]);

      // Skip if already exists
      if (existingIds.has(potentialId.toLowerCase())) continue;

      newIssues.push({
        id: potentialId,
        summary: context.slice(0, 100),
        category: categoryMatch ?
          categoryMatch[1].toUpperCase() as IssueCategory :
          'CORRECTNESS',
        severity: severityMatch ?
          severityMatch[1].toUpperCase() as Severity :
          'MEDIUM',
        discoveredDuringDebate: true,
        raisedBy: 'critic'
      });
    }
  }

  return newIssues;
}

/**
 * Detect severity change requests
 */
function detectSeverityChanges(
  output: string,
  existingIssues: Issue[]
): SeverityChangeRequest[] {
  const changes: SeverityChangeRequest[] = [];

  // Escalation patterns
  const escalationPatterns = [
    /(?:issue\s+)?([A-Z]{3}-\d+)[:\s]+.*(?:more\s+)?(?:severe|serious|critical)\s+than/gi,
    /(?:issue\s+)?([A-Z]{3}-\d+)[:\s]+.*(?:actually|in\s+fact)\s+(?:a\s+)?(HIGH|CRITICAL)/gi,
    /(?:issue\s+)?([A-Z]{3}-\d+)[:\s]+.*underestimated/gi,
    /(?:升級|상향|escalate)[:\s]+([A-Z]{3}-\d+)/gi
  ];

  // Demotion patterns
  const demotionPatterns = [
    /(?:issue\s+)?([A-Z]{3}-\d+)[:\s]+.*(?:not\s+as\s+)?(?:severe|serious|critical)/gi,
    /(?:issue\s+)?([A-Z]{3}-\d+)[:\s]+.*(?:actually|in\s+fact)\s+(?:a\s+)?(LOW|MEDIUM)/gi,
    /(?:issue\s+)?([A-Z]{3}-\d+)[:\s]+.*(?:overestimated|exaggerated)/gi,
    /(?:降級|하향|demote)[:\s]+([A-Z]{3}-\d+)/gi
  ];

  for (const pattern of escalationPatterns) {
    let match;
    while ((match = pattern.exec(output)) !== null) {
      const issueId = match[1];
      const issue = existingIssues.find(i =>
        i.id.toUpperCase() === issueId.toUpperCase()
      );

      if (issue) {
        const newSeverity = match[2] ?
          match[2].toUpperCase() as Severity :
          getEscalatedSeverity(issue.severity);

        changes.push({
          issueId: issue.id,
          fromSeverity: issue.severity,
          toSeverity: newSeverity,
          reason: 'Severity escalated based on debate'
        });
      }
    }
  }

  for (const pattern of demotionPatterns) {
    let match;
    while ((match = pattern.exec(output)) !== null) {
      const issueId = match[1];
      const issue = existingIssues.find(i =>
        i.id.toUpperCase() === issueId.toUpperCase()
      );

      if (issue) {
        const newSeverity = match[2] ?
          match[2].toUpperCase() as Severity :
          getDemotedSeverity(issue.severity);

        changes.push({
          issueId: issue.id,
          fromSeverity: issue.severity,
          toSeverity: newSeverity,
          reason: 'Severity demoted based on debate'
        });
      }
    }
  }

  return changes;
}

/**
 * Detect merge requests
 */
function detectMergeRequests(
  output: string,
  existingIssues: Issue[]
): MergeRequest[] {
  const merges: MergeRequest[] = [];

  const mergePatterns = [
    /(?:same\s+(?:root\s+)?cause)[:\s]+([A-Z]{3}-\d+)[\s,]+(?:and\s+)?([A-Z]{3}-\d+)/gi,
    /(?:duplicate)[:\s]+([A-Z]{3}-\d+)\s+(?:of|and)\s+([A-Z]{3}-\d+)/gi,
    /(?:merge|combine)[:\s]+([A-Z]{3}-\d+)[\s,]+(?:and\s+)?([A-Z]{3}-\d+)/gi,
    /([A-Z]{3}-\d+)[\s,]+(?:and\s+)?([A-Z]{3}-\d+)\s+(?:should\s+be\s+)?(?:merged|combined)/gi
  ];

  for (const pattern of mergePatterns) {
    let match;
    while ((match = pattern.exec(output)) !== null) {
      const id1 = match[1];
      const id2 = match[2];

      // Verify both issues exist
      const issue1 = existingIssues.find(i => i.id.toUpperCase() === id1.toUpperCase());
      const issue2 = existingIssues.find(i => i.id.toUpperCase() === id2.toUpperCase());

      if (issue1 && issue2) {
        // Target is the one with higher severity
        const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        const targetId = severityOrder[issue1.severity] <= severityOrder[issue2.severity]
          ? issue1.id
          : issue2.id;
        const sourceId = targetId === issue1.id ? issue2.id : issue1.id;

        merges.push({
          sourceIds: [sourceId],
          targetId,
          reason: 'Same root cause identified'
        });
      }
    }
  }

  return merges;
}

/**
 * Detect split requests
 */
function detectSplitRequests(
  output: string,
  existingIssues: Issue[]
): SplitRequest[] {
  const splits: SplitRequest[] = [];

  const splitPatterns = [
    /(?:issue\s+)?([A-Z]{3}-\d+)[:\s]+.*(?:actually\s+)?(?:multiple|several|two|three)\s+(?:issues|problems)/gi,
    /(?:split|separate)[:\s]+([A-Z]{3}-\d+)/gi,
    /([A-Z]{3}-\d+)\s+(?:should\s+be\s+)?(?:split|separated)/gi
  ];

  for (const pattern of splitPatterns) {
    let match;
    while ((match = pattern.exec(output)) !== null) {
      const issueId = match[1];
      const issue = existingIssues.find(i =>
        i.id.toUpperCase() === issueId.toUpperCase()
      );

      if (issue) {
        // Create placeholder for split issues
        splits.push({
          sourceId: issue.id,
          newIssues: [
            { summary: `${issue.summary} (part 1)`, splitFrom: issue.id },
            { summary: `${issue.summary} (part 2)`, splitFrom: issue.id }
          ],
          reason: 'Issue contains multiple distinct problems'
        });
      }
    }
  }

  return splits;
}

/**
 * Detect invalidations
 */
function detectInvalidations(
  output: string,
  existingIssues: Issue[]
): Array<{ issueId: string; currentStatus: IssueStatus; reason: string }> {
  const invalidations: Array<{ issueId: string; currentStatus: IssueStatus; reason: string }> = [];

  const invalidPatterns = [
    /(?:issue\s+)?([A-Z]{3}-\d+)[:\s]+.*(?:not\s+(?:a|an)\s+)?(?:issue|problem|bug)/gi,
    /(?:issue\s+)?([A-Z]{3}-\d+)[:\s]+.*(?:false\s+positive|invalid|incorrect)/gi,
    /(?:issue\s+)?([A-Z]{3}-\d+)[:\s]+.*(?:intended|expected)\s+behavior/gi,
    /(?:dismiss|invalidate|reject)[:\s]+([A-Z]{3}-\d+)/gi
  ];

  for (const pattern of invalidPatterns) {
    let match;
    while ((match = pattern.exec(output)) !== null) {
      const issueId = match[1];
      const issue = existingIssues.find(i =>
        i.id.toUpperCase() === issueId.toUpperCase()
      );

      if (issue && issue.status !== 'DISMISSED') {
        invalidations.push({
          issueId: issue.id,
          currentStatus: issue.status,
          reason: 'Issue determined to be invalid/false positive'
        });
      }
    }
  }

  return invalidations;
}

// =============================================================================
// Issue Lifecycle Operations
// =============================================================================

/**
 * Apply a transition to an issue
 */
export function applyTransition(
  issue: Issue,
  transition: IssueTransitionRecord
): Issue {
  const updated = { ...issue };

  // Initialize transitions array if needed
  if (!updated.transitions) {
    updated.transitions = [];
  }

  // Record original severity if first change
  if (transition.fromSeverity && !updated.originalSeverity) {
    updated.originalSeverity = transition.fromSeverity;
  }

  // Apply the transition
  updated.status = transition.toStatus;
  if (transition.toSeverity) {
    updated.severity = transition.toSeverity;
  }

  // Add to transition history
  updated.transitions.push(transition);

  return updated;
}

/**
 * Merge issues
 */
export function mergeIssues(
  target: Issue,
  sources: Issue[],
  round: number,
  triggeredBy: 'verifier' | 'critic' | 'mediator'
): { target: Issue; sources: Issue[] } {
  const updatedTarget = { ...target };
  const updatedSources: Issue[] = [];

  // Update target with related issues
  updatedTarget.relatedIssues = [
    ...(updatedTarget.relatedIssues || []),
    ...sources.map(s => s.id)
  ];

  // Merge evidence and descriptions
  for (const source of sources) {
    updatedTarget.description += `\n\n[Merged from ${source.id}]: ${source.description}`;
    updatedTarget.evidence += `\n\n[From ${source.id}]: ${source.evidence}`;

    // Mark source as merged
    const updatedSource = applyTransition(source, {
      type: 'MERGED_INTO',
      fromStatus: source.status,
      toStatus: 'MERGED',
      round,
      reason: `Merged into ${target.id}`,
      triggeredBy,
      timestamp: new Date().toISOString()
    });
    updatedSource.mergedInto = target.id;
    updatedSources.push(updatedSource);
  }

  return { target: updatedTarget, sources: updatedSources };
}

/**
 * Split an issue into multiple issues
 */
export function splitIssue(
  source: Issue,
  newIssueData: Partial<Issue>[],
  round: number,
  triggeredBy: 'verifier' | 'critic' | 'mediator'
): { source: Issue; newIssues: Issue[] } {
  const newIssues: Issue[] = [];

  for (let i = 0; i < newIssueData.length; i++) {
    const data = newIssueData[i];
    const newId = `${source.id}-${String.fromCharCode(65 + i)}`; // SEC-01-A, SEC-01-B

    const newIssue: Issue = {
      id: newId,
      category: data.category || source.category,
      severity: data.severity || source.severity,
      summary: data.summary || `${source.summary} (part ${i + 1})`,
      location: data.location || source.location,
      description: data.description || source.description,
      evidence: data.evidence || source.evidence,
      raisedBy: source.raisedBy,
      raisedInRound: round,
      status: 'RAISED',
      splitFrom: source.id,
      transitions: [{
        type: 'SPLIT_FROM',
        fromStatus: 'RAISED',
        toStatus: 'RAISED',
        round,
        reason: `Split from ${source.id}`,
        triggeredBy,
        timestamp: new Date().toISOString()
      }]
    };

    newIssues.push(newIssue);
  }

  // Mark source as split
  const updatedSource = applyTransition(source, {
    type: 'SPLIT_FROM',
    fromStatus: source.status,
    toStatus: 'SPLIT',
    round,
    reason: `Split into ${newIssues.map(i => i.id).join(', ')}`,
    triggeredBy,
    timestamp: new Date().toISOString()
  });
  updatedSource.splitInto = newIssues.map(i => i.id);

  return { source: updatedSource, newIssues };
}

/**
 * Change issue severity
 */
export function changeSeverity(
  issue: Issue,
  newSeverity: Severity,
  round: number,
  reason: string,
  triggeredBy: 'verifier' | 'critic' | 'mediator'
): Issue {
  const transitionType: IssueTransitionType =
    getSeverityOrder(newSeverity) < getSeverityOrder(issue.severity)
      ? 'ESCALATED'
      : 'DEMOTED';

  return applyTransition(issue, {
    type: transitionType,
    fromStatus: issue.status,
    toStatus: issue.status, // Status doesn't change
    fromSeverity: issue.severity,
    toSeverity: newSeverity,
    round,
    reason,
    triggeredBy,
    timestamp: new Date().toISOString()
  });
}

// =============================================================================
// Utility Functions
// =============================================================================

function generateIssueIdFromContext(context: string, category?: string): string {
  const prefix = category ?
    category.slice(0, 3).toUpperCase() :
    'COR';

  const hash = context.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);

  return `${prefix}-D${Math.abs(hash % 1000).toString().padStart(3, '0')}`;
}

function getEscalatedSeverity(current: Severity): Severity {
  const order: Severity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const idx = order.indexOf(current);
  return order[Math.min(idx + 1, order.length - 1)];
}

function getDemotedSeverity(current: Severity): Severity {
  const order: Severity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const idx = order.indexOf(current);
  return order[Math.max(idx - 1, 0)];
}

function getSeverityOrder(severity: Severity): number {
  const order: Record<Severity, number> = {
    CRITICAL: 0,
    HIGH: 1,
    MEDIUM: 2,
    LOW: 3
  };
  return order[severity];
}

