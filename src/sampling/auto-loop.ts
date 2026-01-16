/**
 * Auto Loop Module
 *
 * MCP Sampling-based automatic Verifier↔Critic loop
 * The server autonomously orchestrates verification rounds by requesting
 * LLM completions from the connected client.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  AutoLoopConfig,
  AutoLoopState,
  AutoLoopResult,
  AutoLoopRound,
  AutoLoopEvent,
  PromptContext,
  DEFAULT_AUTO_LOOP_CONFIG
} from './types.js';
import {
  generateSamplingMessages,
  parseVerifierResponse,
  parseCriticResponse
} from './prompts.js';
import { Issue, IssueCategory, Severity, Session } from '../types/index.js';
import {
  createSession,
  getSession,
  updateSessionStatus,
  upsertIssue,
  addRound
} from '../state/session.js';
import { initializeContext, getContextSummary } from '../state/context.js';
import { checkConvergence } from '../state/session.js';

// =============================================================================
// Auto Loop State Management
// =============================================================================

const autoLoopStates = new Map<string, AutoLoopState>();

/**
 * Get auto-loop state
 */
export function getAutoLoopState(sessionId: string): AutoLoopState | undefined {
  return autoLoopStates.get(sessionId);
}

// =============================================================================
// Event Emission (for progress tracking)
// =============================================================================

type EventListener = (event: AutoLoopEvent) => void;
const eventListeners = new Map<string, EventListener[]>();

export function onAutoLoopEvent(sessionId: string, listener: EventListener): () => void {
  const listeners = eventListeners.get(sessionId) || [];
  listeners.push(listener);
  eventListeners.set(sessionId, listeners);

  // Return unsubscribe function
  return () => {
    const current = eventListeners.get(sessionId) || [];
    eventListeners.set(sessionId, current.filter(l => l !== listener));
  };
}

function emitEvent(event: AutoLoopEvent): void {
  const listeners = eventListeners.get(event.sessionId) || [];
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      console.error('Event listener error:', error);
    }
  }
}

// =============================================================================
// Main Auto Loop
// =============================================================================

/**
 * Run automatic verification loop using MCP Sampling
 *
 * The server will:
 * 1. Start a verification session
 * 2. Generate Verifier prompt and request LLM completion
 * 3. Parse Verifier output and extract issues
 * 4. Generate Critic prompt and request LLM completion
 * 5. Parse Critic verdicts and update issues
 * 6. Repeat until convergence or max rounds
 * 7. Return consolidated results
 */
export async function runAutoLoop(
  server: Server,
  target: string,
  requirements: string,
  workingDir: string,
  config: Partial<AutoLoopConfig> = {}
): Promise<AutoLoopResult> {
  const fullConfig = { ...DEFAULT_AUTO_LOOP_CONFIG, ...config };
  const startTime = Date.now();

  // Initialize session
  const session = await createSession(target, requirements, fullConfig.maxRounds);
  await initializeContext(session.id, target, workingDir);
  await updateSessionStatus(session.id, 'initialized');

  // Initialize auto-loop state
  const state: AutoLoopState = {
    sessionId: session.id,
    status: 'running',
    currentRound: 0,
    currentRole: 'verifier',
    rounds: [],
    issues: [],
    startTime
  };
  autoLoopStates.set(session.id, state);

  try {
    // Main loop
    while (state.currentRound < fullConfig.maxRounds && state.status === 'running') {
      state.currentRound++;

      // Get updated session
      const currentSession = await getSession(session.id);
      if (!currentSession) {
        throw new Error('Session not found');
      }

      // === Verifier Round ===
      emitEvent({
        type: 'round_start',
        sessionId: session.id,
        timestamp: Date.now(),
        data: { round: state.currentRound, role: 'verifier' }
      });

      const verifierResult = await runVerifierRound(
        server,
        currentSession,
        state,
        fullConfig
      );
      state.rounds.push(verifierResult);

      emitEvent({
        type: 'round_complete',
        sessionId: session.id,
        timestamp: Date.now(),
        data: {
          round: state.currentRound,
          role: 'verifier',
          issuesRaised: verifierResult.issuesRaised.length
        }
      });

      // Check convergence after Verifier
      const afterVerifier = await getSession(session.id);
      const verifierConvergence = checkConvergence(afterVerifier!);

      emitEvent({
        type: 'convergence_check',
        sessionId: session.id,
        timestamp: Date.now(),
        data: {
          isConverged: verifierConvergence.isConverged,
          reason: verifierConvergence.reason,
          unresolvedIssues: verifierConvergence.unresolvedIssues
        }
      });

      // Early exit conditions
      if (verifierConvergence.isConverged && state.currentRound >= fullConfig.minRounds) {
        state.status = 'converged';
        state.convergenceReason = verifierConvergence.reason;
        break;
      }

      if (fullConfig.stopOnCritical && verifierConvergence.criticalUnresolved > 0) {
        state.status = 'stopped';
        state.convergenceReason = `Stopped: ${verifierConvergence.criticalUnresolved} CRITICAL issues found`;
        break;
      }

      // Skip Critic if no issues raised (fast-track)
      if (verifierResult.issuesRaised.length === 0) {
        continue;
      }

      // === Critic Round ===
      emitEvent({
        type: 'round_start',
        sessionId: session.id,
        timestamp: Date.now(),
        data: { round: state.currentRound, role: 'critic' }
      });

      const criticSession = await getSession(session.id);
      if (!criticSession) {
        throw new Error('Session not found for Critic round');
      }
      const criticResult = await runCriticRound(
        server,
        criticSession,
        state,
        verifierResult.response,
        fullConfig
      );
      state.rounds.push(criticResult);

      emitEvent({
        type: 'round_complete',
        sessionId: session.id,
        timestamp: Date.now(),
        data: {
          round: state.currentRound,
          role: 'critic',
          issuesResolved: criticResult.issuesResolved.length
        }
      });

      // Check convergence after Critic
      const afterCritic = await getSession(session.id);
      const criticConvergence = checkConvergence(afterCritic!);

      if (criticConvergence.isConverged && state.currentRound >= fullConfig.minRounds) {
        state.status = 'converged';
        state.convergenceReason = criticConvergence.reason;
        break;
      }
    }

    // Max rounds reached
    if (state.status === 'running') {
      state.status = 'stopped';
      state.convergenceReason = `Max rounds (${fullConfig.maxRounds}) reached`;
    }

  } catch (error) {
    state.status = 'error';
    state.error = error instanceof Error ? error.message : 'Unknown error';

    emitEvent({
      type: 'error',
      sessionId: session.id,
      timestamp: Date.now(),
      data: { error: state.error }
    });
  }

  state.endTime = Date.now();

  // Get final session state
  const finalSession = await getSession(session.id);
  const issues = finalSession?.issues || [];

  // Build result
  const result: AutoLoopResult = {
    sessionId: session.id,
    status: state.status === 'error' ? 'error' : state.status,
    totalRounds: state.currentRound,
    duration: state.endTime - state.startTime,
    issues: {
      total: issues.length,
      critical: issues.filter(i => i.severity === 'CRITICAL').length,
      high: issues.filter(i => i.severity === 'HIGH').length,
      resolved: issues.filter(i => i.status === 'RESOLVED').length
    },
    convergenceReason: state.convergenceReason,
    error: state.error
  };

  // Auto-consolidate if enabled
  if (fullConfig.autoConsolidate && issues.length > 0) {
    result.consolidatedPlan = consolidateIssues(issues);
  }

  emitEvent({
    type: 'complete',
    sessionId: session.id,
    timestamp: Date.now(),
    data: JSON.parse(JSON.stringify(result))
  });

  return result;
}

// =============================================================================
// Round Execution
// =============================================================================

async function runVerifierRound(
  server: Server,
  session: Session,
  state: AutoLoopState,
  config: AutoLoopConfig
): Promise<AutoLoopRound> {
  const roundStart = Date.now();

  // Build context
  const context: PromptContext = {
    sessionId: session.id,
    round: state.currentRound,
    role: 'verifier',
    targetFiles: Array.from(session.context.files.keys()),
    requirements: session.context.requirements || '',
    previousRounds: state.rounds.map(r => ({
      role: r.role,
      summary: summarizeRound(r)
    })),
    existingIssues: session.issues.map(i => ({
      id: i.id,
      severity: i.severity,
      category: i.category,
      summary: i.summary,
      status: i.status
    }))
  };

  // Generate messages
  const messages = generateSamplingMessages('verifier', context);

  // Request LLM completion via sampling
  const response = await server.createMessage({
    messages,
    maxTokens: config.maxTokens,
    includeContext: 'thisServer'
  });

  const output = response.content.type === 'text' ? response.content.text : '';
  const parsed = parseVerifierResponse(output);

  // Process issues
  const issuesRaised: string[] = [];
  for (const issueData of parsed.issues) {
    const issue: Issue = {
      id: issueData.id,
      category: issueData.category as IssueCategory,
      severity: issueData.severity as Severity,
      summary: issueData.summary,
      location: issueData.location,
      description: issueData.description,
      evidence: issueData.evidence,
      raisedBy: 'verifier',
      raisedInRound: state.currentRound,
      status: 'RAISED'
    };

    await upsertIssue(session.id, issue);
    issuesRaised.push(issue.id);
    state.issues.push(issue);

    emitEvent({
      type: 'issue_raised',
      sessionId: session.id,
      timestamp: Date.now(),
      data: { issueId: issue.id, severity: issue.severity, summary: issue.summary }
    });
  }

  // Add round to session
  await addRound(session.id, {
    role: 'verifier',
    input: getContextSummary(session.context),
    output,
    issuesRaised,
    issuesResolved: [],
    contextExpanded: false,
    newFilesDiscovered: []
  });

  return {
    number: state.currentRound,
    role: 'verifier',
    prompt: messages[0].content.text,
    response: output,
    issuesRaised,
    issuesResolved: [],
    duration: Date.now() - roundStart
  };
}

async function runCriticRound(
  server: Server,
  session: Session,
  state: AutoLoopState,
  verifierOutput: string,
  config: AutoLoopConfig
): Promise<AutoLoopRound> {
  const roundStart = Date.now();

  // Build context
  const context: PromptContext = {
    sessionId: session.id,
    round: state.currentRound,
    role: 'critic',
    targetFiles: Array.from(session.context.files.keys()),
    requirements: session.context.requirements || '',
    previousRounds: state.rounds.map(r => ({
      role: r.role,
      summary: summarizeRound(r)
    })),
    existingIssues: session.issues.map(i => ({
      id: i.id,
      severity: i.severity,
      category: i.category,
      summary: i.summary,
      status: i.status
    }))
  };

  // Generate messages
  const messages = generateSamplingMessages('critic', context, verifierOutput);

  // Request LLM completion
  const response = await server.createMessage({
    messages,
    maxTokens: config.maxTokens,
    includeContext: 'thisServer'
  });

  const output = response.content.type === 'text' ? response.content.text : '';
  const parsed = parseCriticResponse(output);

  // Process verdicts
  const issuesResolved: string[] = [];
  for (const verdict of parsed.verdicts) {
    const issue = session.issues.find(i => i.id === verdict.issueId);
    if (issue) {
      issue.criticReviewed = true;
      issue.criticVerdict = verdict.verdict;
      issue.criticReviewRound = state.currentRound;

      if (verdict.verdict === 'INVALID') {
        issue.status = 'RESOLVED';
        issue.resolvedInRound = state.currentRound;
        issue.resolution = `False positive: ${verdict.reasoning}`;
        issuesResolved.push(issue.id);

        emitEvent({
          type: 'issue_resolved',
          sessionId: session.id,
          timestamp: Date.now(),
          data: { issueId: issue.id, verdict: 'INVALID', reason: verdict.reasoning }
        });
      }

      await upsertIssue(session.id, issue);
    }
  }

  // Process new issues from Critic
  if (parsed.newIssues) {
    for (const issueData of parsed.newIssues) {
      const issue: Issue = {
        id: issueData.id,
        category: issueData.category as IssueCategory,
        severity: issueData.severity as Severity,
        summary: issueData.summary,
        location: issueData.location,
        description: issueData.description,
        evidence: issueData.evidence,
        raisedBy: 'critic',
        raisedInRound: state.currentRound,
        status: 'RAISED',
        discoveredDuringDebate: true
      };

      await upsertIssue(session.id, issue);
      state.issues.push(issue);

      emitEvent({
        type: 'issue_raised',
        sessionId: session.id,
        timestamp: Date.now(),
        data: { issueId: issue.id, severity: issue.severity, summary: issue.summary, raisedBy: 'critic' }
      });
    }
  }

  // Add round
  await addRound(session.id, {
    role: 'critic',
    input: verifierOutput,
    output,
    issuesRaised: parsed.newIssues?.map(i => i.id) || [],
    issuesResolved,
    contextExpanded: false,
    newFilesDiscovered: []
  });

  return {
    number: state.currentRound,
    role: 'critic',
    prompt: messages[0].content.text,
    response: output,
    issuesRaised: parsed.newIssues?.map(i => i.id) || [],
    issuesResolved,
    duration: Date.now() - roundStart
  };
}

// =============================================================================
// Utilities
// =============================================================================

function summarizeRound(round: AutoLoopRound): string {
  return `${round.role} round ${round.number}: ${round.issuesRaised.length} issues raised, ${round.issuesResolved.length} resolved`;
}

function consolidateIssues(issues: Issue[]): AutoLoopResult['consolidatedPlan'] {
  const mustFix = issues.filter(i =>
    i.status !== 'RESOLVED' && (i.severity === 'CRITICAL' || i.severity === 'HIGH')
  );

  const shouldFix = issues.filter(i =>
    i.status !== 'RESOLVED' && i.severity === 'MEDIUM'
  );

  const couldFix = issues.filter(i =>
    i.status !== 'RESOLVED' && i.severity === 'LOW'
  );

  const wontFix = issues.filter(i =>
    i.status === 'RESOLVED' || i.status === 'DISMISSED'
  );

  // Simple effort estimation
  const effortPoints = mustFix.length * 3 + shouldFix.length * 2 + couldFix.length;
  const totalEffort = effortPoints <= 5 ? 'Low' :
                      effortPoints <= 15 ? 'Medium' :
                      effortPoints <= 30 ? 'High' : 'Very High';

  return {
    mustFix,
    shouldFix,
    couldFix,
    wontFix,
    totalEffort
  };
}
