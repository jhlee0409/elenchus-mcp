/**
 * Elenchus MCP Tools
 * Composition layer for all tool modules
 */

// Re-export all schemas
export * from './schemas.js';

// Re-export result types
export * from './result-types.js';

// Import domain tools
import { sessionLifecycleTools, getSessions } from './session-lifecycle.js';
import { issueManagementTools } from './issue-management.js';
import { mediatorTools } from './mediator-tools.js';
import { roleTools } from './role-tools.js';
import { reverifyTools } from './reverify-tools.js';
import { diffTools } from './diff-tools.js';
import { cacheTools } from './cache-tools.js';
import { pipelineTools } from './pipeline-tools.js';
import { safeguardsTools } from './safeguards-tools.js';
import { optimizationTools } from './optimization-tools.js';

// Re-export individual handlers for direct imports
export { startSession, getContext, submitRound, endSession } from './session-lifecycle.js';
export { getIssues, checkpoint, rollback, applyFix } from './issue-management.js';
export { rippleEffect, mediatorSummary } from './mediator-tools.js';
export { getRolePromptTool, roleSummary, updateRoleConfigTool } from './role-tools.js';
export { startReVerification } from './reverify-tools.js';
export { saveBaselineTool, getDiffSummaryTool, getProjectHistoryTool } from './diff-tools.js';
export { getCacheStatsTool, clearCacheTool } from './cache-tools.js';
export { getPipelineStatusTool, escalateTierTool, completeTierTool } from './pipeline-tools.js';
export { getSafeguardsStatusTool, updateConfidenceTool, recordSamplingResultTool, checkConvergenceAllowedTool } from './safeguards-tools.js';
export { setCompressionMode, getOptimizationStats, configureOptimization, estimateSavings } from './optimization-tools.js';
export { getSessions };

// Compose all tools into a single export
export const tools = {
  ...sessionLifecycleTools,
  ...issueManagementTools,
  ...mediatorTools,
  ...roleTools,
  ...reverifyTools,
  ...diffTools,
  ...cacheTools,
  ...pipelineTools,
  ...safeguardsTools,
  ...optimizationTools
};
