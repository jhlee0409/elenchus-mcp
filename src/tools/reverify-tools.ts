/**
 * Re-verification Tools
 * [ENH: REVERIFY] Re-verification session management
 */

import { z } from 'zod';
import { StartSessionResponse } from '../types/index.js';
import {
  createSession,
  getSession,
  updateSessionStatus
} from '../state/session.js';
import { initializeContext } from '../state/context.js';
import { initializeMediator } from '../mediator/index.js';
import {
  initializeRoleEnforcement,
  getRolePrompt,
  getRoleDefinition
} from '../roles/index.js';
import { StartReVerificationSchema } from './schemas.js';

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
    status: 're-verifying',
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
// Export Tool Definitions
// =============================================================================

export const reverifyTools = {
  elenchus_start_reverification: {
    description: 'Start a re-verification session for resolved issues. Links to a previous verification session and focuses on verifying that fixes are correct and complete. Returns focused verification context with target issues.',
    schema: StartReVerificationSchema,
    handler: startReVerification
  }
};
