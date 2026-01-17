/**
 * Role Enforcement Tools
 * Role prompt management and configuration
 */

import { z } from 'zod';
import {
  getRolePrompt,
  getRoleDefinition,
  getRoleEnforcementSummary,
  updateRoleConfig
} from '../roles/index.js';
import { VerifierRole } from '../roles/types.js';
import {
  GetRolePromptSchema,
  RoleSummarySchema,
  UpdateRoleConfigSchema
} from './schemas.js';

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
// Export Tool Definitions
// =============================================================================

export const roleTools = {
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
  }
};
