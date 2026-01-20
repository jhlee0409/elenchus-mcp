/**
 * MCP Module Type Definitions
 *
 * Type definitions for MCP protocol extensions:
 * - Client capabilities detection
 * - Logging levels and configuration
 * - Sampling request/response
 * - Progress tracking
 * - Cancellation tokens
 * - Resource subscriptions
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

// =============================================================================
// Client Capabilities
// =============================================================================

/**
 * Capabilities that a client may support
 */
export interface ClientCapabilities {
  /** Client supports sampling/createMessage requests */
  sampling?: boolean;
  /** Client supports logging notifications */
  logging?: boolean;
  /** Client supports progress notifications */
  progress?: boolean;
  /** Client supports cancellation */
  cancellation?: boolean;
  /** Client supports resource subscriptions */
  subscriptions?: boolean;
}

/**
 * Client information from the MCP handshake
 */
export interface ClientInfo {
  name?: string;
  version?: string;
  capabilities?: ClientCapabilities;
}

// =============================================================================
// Logging
// =============================================================================

/**
 * MCP logging levels (RFC 5424 syslog levels)
 */
export type LogLevel =
  | 'debug'
  | 'info'
  | 'notice'
  | 'warning'
  | 'error'
  | 'critical'
  | 'alert'
  | 'emergency';

/**
 * Logging configuration
 */
export interface LoggingConfig {
  /** Minimum level to log (default: 'info') */
  minLevel: LogLevel;
  /** Levels that are always logged regardless of minLevel */
  alwaysLogLevels: LogLevel[];
  /** Logger names to enable ('*' for all) */
  enabledLoggers: string[];
}

/**
 * Logger instance interface
 */
export interface MCPLoggerInterface {
  log(level: LogLevel, message: string, data?: unknown, logger?: string): Promise<void>;
  debug(message: string, data?: unknown, logger?: string): Promise<void>;
  info(message: string, data?: unknown, logger?: string): Promise<void>;
  notice(message: string, data?: unknown, logger?: string): Promise<void>;
  warning(message: string, data?: unknown, logger?: string): Promise<void>;
  error(message: string, data?: unknown, logger?: string): Promise<void>;
  critical(message: string, data?: unknown, logger?: string): Promise<void>;
  setMinLevel(level: LogLevel): void;
}

// =============================================================================
// Sampling
// =============================================================================

/**
 * Content types for sampling messages
 */
export type SamplingContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

/**
 * Sampling request message
 */
export interface SamplingMessage {
  role: 'user' | 'assistant';
  content: SamplingContent;
}

/**
 * Model preferences for sampling
 */
export interface ModelPreferences {
  /** Hints for model selection */
  hints?: Array<{ name?: string }>;
  /** Priority for cost optimization (0-1) */
  costPriority?: number;
  /** Priority for speed optimization (0-1) */
  speedPriority?: number;
  /** Priority for intelligence/quality (0-1) */
  intelligencePriority?: number;
}

/**
 * Sampling request parameters
 */
export interface SamplingRequest {
  messages: SamplingMessage[];
  modelPreferences?: ModelPreferences;
  systemPrompt?: string;
  includeContext?: 'none' | 'thisServer' | 'allServers';
  temperature?: number;
  maxTokens: number;
  stopSequences?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Sampling response from client
 */
export interface SamplingResponse {
  role: 'assistant';
  content: SamplingContent;
  model: string;
  stopReason?: 'endTurn' | 'stopSequence' | 'maxTokens';
}

/**
 * Sampling interface
 */
export interface MCPSamplingInterface {
  isEnabled(): boolean;
  createMessage(request: SamplingRequest): Promise<SamplingResponse>;
}

// =============================================================================
// Progress
// =============================================================================

/**
 * Progress notification parameters
 */
export interface ProgressParams {
  progressToken: string | number;
  progress: number;
  total?: number;
  message?: string;
}

/**
 * Progress tracker for a single operation
 */
export interface ProgressTracker {
  token: string;
  total?: number;
  current: number;
  update(current: number, message?: string): Promise<void>;
  complete(message?: string): Promise<void>;
}

/**
 * Progress manager interface
 */
export interface MCPProgressInterface {
  startProgress(total?: number, message?: string): Promise<ProgressTracker>;
}

// =============================================================================
// Cancellation
// =============================================================================

/**
 * Cancellation error thrown when operation is cancelled
 */
export class CancellationError extends Error {
  constructor(reason?: string) {
    super(reason ?? 'Operation cancelled');
    this.name = 'CancellationError';
  }
}

/**
 * Cancellation token interface
 */
export interface CancellationTokenInterface {
  isCancelled(): boolean;
  readonly reason: string | undefined;
  cancel(reason?: string): void;
  throwIfCancelled(): void;
  onCancelled(callback: (reason?: string) => void): void;
}

/**
 * Cancellation manager interface
 */
export interface MCPCancellationInterface {
  createToken(requestId: string | number): CancellationTokenInterface;
  getToken(requestId: string | number): CancellationTokenInterface | undefined;
  removeToken(requestId: string | number): void;
}

// =============================================================================
// Subscriptions
// =============================================================================

/**
 * Subscription record
 */
export interface Subscription {
  uri: string;
  clientId?: string;
}

/**
 * Subscription manager interface
 */
export interface MCPSubscriptionsInterface {
  subscribe(uri: string, clientId?: string): void;
  unsubscribe(uri: string, clientId?: string): void;
  isSubscribed(uri: string): boolean;
  notifyChange(uri: string): Promise<void>;
  notifyListChanged(): Promise<void>;
}

// =============================================================================
// Server Context
// =============================================================================

/**
 * MCP Server context with all protocol features
 */
export interface MCPServerContext {
  server: Server;
  clientInfo: ClientInfo;
  capabilities: ClientCapabilities;
  logger: MCPLoggerInterface;
  sampling?: MCPSamplingInterface;
  progress: MCPProgressInterface;
  cancellation: MCPCancellationInterface;
  subscriptions: MCPSubscriptionsInterface;
}
