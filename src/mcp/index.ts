/**
 * MCP Module - Protocol Extensions for Elenchus
 *
 * This module provides MCP protocol extensions:
 * - Client capability detection
 * - Structured logging
 * - Progress notifications
 * - Cancellation support
 * - Resource subscriptions
 * - Sampling (LLM requests via client)
 */

// Types
export type {
  ClientCapabilities,
  ClientInfo,
  LogLevel,
  LoggingConfig,
  MCPLoggerInterface,
  SamplingContent,
  SamplingMessage,
  ModelPreferences,
  SamplingRequest,
  SamplingResponse,
  MCPSamplingInterface,
  ProgressParams,
  ProgressTracker,
  MCPProgressInterface,
  CancellationTokenInterface,
  MCPCancellationInterface,
  Subscription,
  MCPSubscriptionsInterface,
  MCPServerContext
} from './types.js';

export { CancellationError } from './types.js';

// Capabilities
export {
  DEFAULT_CAPABILITIES,
  detectCapabilities,
  parseClientInfo,
  CapabilityManager,
  capabilityManager
} from './capabilities.js';

// Logging
export {
  DEFAULT_LOGGING_CONFIG,
  LOGGER_CATEGORIES,
  MCPLogger,
  mcpLogger,
  logError,
  logSession,
  logVerification,
  logMediator
} from './logging.js';

// Progress
export {
  MCPProgress,
  mcpProgress,
  PROGRESS_STAGES,
  withProgress
} from './progress.js';

// Cancellation
export {
  MCPCancellation,
  mcpCancellation,
  withCancellation,
  createCancellationChecker,
  cancellableDelay
} from './cancellation.js';

// Subscriptions
export {
  MCPSubscriptions,
  mcpSubscriptions,
  RESOURCE_URIS,
  notifySessionChange,
  notifyIssueChange,
  notifyRoundChange
} from './subscriptions.js';

// Sampling
export {
  MCPSampling,
  mcpSampling,
  DEFAULT_VERIFICATION_PREFERENCES,
  DEFAULT_EVALUATION_PREFERENCES,
  createTextMessage,
  createSamplingRequest,
  extractResponseText,
  trySamplingWithFallback
} from './sampling.js';

// =============================================================================
// Server Initialization Helper
// =============================================================================

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { capabilityManager } from './capabilities.js';
import { mcpLogger } from './logging.js';
import { mcpProgress } from './progress.js';
import { mcpCancellation } from './cancellation.js';
import { mcpSubscriptions } from './subscriptions.js';
import { mcpSampling } from './sampling.js';

/**
 * Initialize all MCP modules with a server instance
 *
 * @param server - MCP Server instance
 * @param clientInfo - Optional client info for capability detection
 */
export function initializeMCP(server: Server, clientInfo?: unknown): void {
  // Initialize capability detection
  capabilityManager.initialize(clientInfo);
  const caps = capabilityManager.capabilities;

  // Initialize modules based on detected capabilities
  mcpLogger.initialize(server, caps.logging ?? true);
  mcpProgress.initialize(server, caps.progress ?? false);
  mcpCancellation.initialize(server);
  mcpSubscriptions.initialize(server, caps.subscriptions ?? false);
  mcpSampling.initialize(server, caps.sampling ?? false);

  mcpLogger.info('MCP modules initialized', {
    clientName: capabilityManager.clientInfo.name,
    capabilities: caps
  });
}

/**
 * Get current MCP module status
 */
export function getMCPStatus(): {
  clientInfo: { name?: string; version?: string };
  capabilities: Record<string, boolean>;
  activeProgress: number;
  activeCancellations: number;
  subscriptionStats: { totalUris: number; totalSubscriptions: number };
} {
  return {
    clientInfo: {
      name: capabilityManager.clientInfo.name,
      version: capabilityManager.clientInfo.version
    },
    capabilities: {
      sampling: capabilityManager.supportsSampling,
      logging: capabilityManager.supportsLogging,
      progress: capabilityManager.supportsProgress,
      cancellation: capabilityManager.supportsCancellation,
      subscriptions: capabilityManager.supportsSubscriptions
    },
    activeProgress: mcpProgress.activeCount,
    activeCancellations: mcpCancellation.activeCount,
    subscriptionStats: mcpSubscriptions.getStats()
  };
}
