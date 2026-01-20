/**
 * MCP Client Capabilities Detection
 *
 * Detects and manages client capabilities for graceful feature degradation.
 */

import type { ClientCapabilities, ClientInfo } from './types.js';

// =============================================================================
// Default Capabilities
// =============================================================================

/**
 * Default capabilities when client info is not available
 */
export const DEFAULT_CAPABILITIES: ClientCapabilities = {
  sampling: false,
  logging: true,  // Most clients support basic logging
  progress: false,
  cancellation: false,
  subscriptions: false
};

// =============================================================================
// Capability Detection
// =============================================================================

/**
 * Detect client capabilities from client info
 *
 * @param clientInfo - Client information from MCP handshake
 * @returns Detected capabilities
 */
export function detectCapabilities(clientInfo?: unknown): ClientCapabilities {
  if (!clientInfo || typeof clientInfo !== 'object') {
    return { ...DEFAULT_CAPABILITIES };
  }

  const info = clientInfo as Record<string, unknown>;
  const capabilities: ClientCapabilities = { ...DEFAULT_CAPABILITIES };

  // Check if client explicitly declares capabilities
  if (info.capabilities && typeof info.capabilities === 'object') {
    const clientCaps = info.capabilities as Record<string, unknown>;

    // Sampling capability
    if (clientCaps.sampling !== undefined) {
      capabilities.sampling = Boolean(clientCaps.sampling);
    }

    // Logging capability
    if (clientCaps.logging !== undefined) {
      capabilities.logging = Boolean(clientCaps.logging);
    }

    // Progress capability (often part of experimental or roots)
    if (clientCaps.experimental && typeof clientCaps.experimental === 'object') {
      const experimental = clientCaps.experimental as Record<string, unknown>;
      if (experimental.progress !== undefined) {
        capabilities.progress = Boolean(experimental.progress);
      }
    }
  }

  // Known client detection for better defaults
  const clientName = (info.name as string)?.toLowerCase() ?? '';

  if (clientName.includes('claude') || clientName.includes('desktop')) {
    // Claude Desktop typically supports these
    capabilities.sampling = true;
    capabilities.logging = true;
    capabilities.progress = true;
  }

  if (clientName.includes('inspector') || clientName.includes('mcp-inspector')) {
    // MCP Inspector supports most features for testing
    capabilities.logging = true;
    capabilities.progress = true;
    capabilities.subscriptions = true;
  }

  return capabilities;
}

/**
 * Parse client info from MCP connection
 *
 * @param rawClientInfo - Raw client info from connection
 * @returns Parsed client info
 */
export function parseClientInfo(rawClientInfo?: unknown): ClientInfo {
  if (!rawClientInfo || typeof rawClientInfo !== 'object') {
    return {
      name: 'unknown',
      version: 'unknown',
      capabilities: DEFAULT_CAPABILITIES
    };
  }

  const info = rawClientInfo as Record<string, unknown>;

  return {
    name: typeof info.name === 'string' ? info.name : 'unknown',
    version: typeof info.version === 'string' ? info.version : 'unknown',
    capabilities: detectCapabilities(rawClientInfo)
  };
}

// =============================================================================
// Capability Manager
// =============================================================================

/**
 * Manages client capabilities for the current session
 */
export class CapabilityManager {
  private _capabilities: ClientCapabilities;
  private _clientInfo: ClientInfo;

  constructor() {
    this._capabilities = { ...DEFAULT_CAPABILITIES };
    this._clientInfo = {
      name: 'unknown',
      version: 'unknown',
      capabilities: this._capabilities
    };
  }

  /**
   * Initialize capabilities from client info
   */
  initialize(clientInfo?: unknown): void {
    this._clientInfo = parseClientInfo(clientInfo);
    this._capabilities = this._clientInfo.capabilities ?? { ...DEFAULT_CAPABILITIES };
  }

  /**
   * Get current client info
   */
  get clientInfo(): ClientInfo {
    return this._clientInfo;
  }

  /**
   * Get current capabilities
   */
  get capabilities(): ClientCapabilities {
    return this._capabilities;
  }

  /**
   * Check if a specific capability is supported
   */
  hasCapability(capability: keyof ClientCapabilities): boolean {
    return this._capabilities[capability] ?? false;
  }

  /**
   * Check if sampling is supported
   */
  get supportsSampling(): boolean {
    return this._capabilities.sampling ?? false;
  }

  /**
   * Check if logging is supported
   */
  get supportsLogging(): boolean {
    return this._capabilities.logging ?? false;
  }

  /**
   * Check if progress notifications are supported
   */
  get supportsProgress(): boolean {
    return this._capabilities.progress ?? false;
  }

  /**
   * Check if cancellation is supported
   */
  get supportsCancellation(): boolean {
    return this._capabilities.cancellation ?? false;
  }

  /**
   * Check if subscriptions are supported
   */
  get supportsSubscriptions(): boolean {
    return this._capabilities.subscriptions ?? false;
  }

  /**
   * Override a capability (for testing or manual configuration)
   */
  setCapability(capability: keyof ClientCapabilities, enabled: boolean): void {
    this._capabilities[capability] = enabled;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

/**
 * Global capability manager instance
 */
export const capabilityManager = new CapabilityManager();
