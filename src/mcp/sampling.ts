/**
 * MCP Sampling Implementation
 *
 * Enables server to request LLM completions via client.
 * Supports both native MCP sampling and fallback patterns.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type {
  SamplingRequest,
  SamplingResponse,
  MCPSamplingInterface,
  SamplingMessage,
  ModelPreferences
} from './types.js';
import { mcpLogger, LOGGER_CATEGORIES } from './logging.js';

// =============================================================================
// MCP Sampling Implementation
// =============================================================================

/**
 * MCP Sampling manager
 */
export class MCPSampling implements MCPSamplingInterface {
  private server: Server | null = null;
  private _enabled: boolean = false;

  /**
   * Initialize sampling with server and capability check
   */
  initialize(server: Server, enabled: boolean = false): void {
    this.server = server;
    this._enabled = enabled;

    if (enabled) {
      mcpLogger.info(
        'MCP Sampling initialized',
        undefined,
        LOGGER_CATEGORIES.SAMPLING
      );
    }
  }

  /**
   * Enable or disable sampling
   */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  /**
   * Check if sampling is available
   */
  isEnabled(): boolean {
    return this._enabled && this.server !== null;
  }

  /**
   * Create a message request via MCP sampling
   *
   * @param request - Sampling request parameters
   * @returns Sampling response from client
   * @throws Error if sampling is not enabled or request fails
   */
  async createMessage(request: SamplingRequest): Promise<SamplingResponse> {
    if (!this.isEnabled()) {
      throw new Error('MCP Sampling is not enabled. Use fallback evaluation methods.');
    }

    if (!this.server) {
      throw new Error('Server not initialized');
    }

    await mcpLogger.debug(
      'Sending sampling request',
      {
        messageCount: request.messages.length,
        maxTokens: request.maxTokens,
        hasSystemPrompt: !!request.systemPrompt
      },
      LOGGER_CATEGORIES.SAMPLING
    );

    try {
      // MCP SDK sampling request
      const result = await this.server.createMessage({
        messages: request.messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        modelPreferences: request.modelPreferences,
        systemPrompt: request.systemPrompt,
        includeContext: request.includeContext,
        maxTokens: request.maxTokens
      });

      const response: SamplingResponse = {
        role: 'assistant',
        content: result.content as SamplingResponse['content'],
        model: result.model,
        stopReason: result.stopReason as SamplingResponse['stopReason']
      };

      await mcpLogger.debug(
        'Received sampling response',
        {
          model: response.model,
          stopReason: response.stopReason
        },
        LOGGER_CATEGORIES.SAMPLING
      );

      return response;
    } catch (error) {
      await mcpLogger.error(
        'Sampling request failed',
        { error },
        LOGGER_CATEGORIES.SAMPLING
      );
      throw error;
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

/**
 * Global sampling manager instance
 */
export const mcpSampling = new MCPSampling();

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Default model preferences for verification tasks
 */
export const DEFAULT_VERIFICATION_PREFERENCES: ModelPreferences = {
  hints: [{ name: 'claude-3-5-sonnet' }, { name: 'claude-3-opus' }],
  intelligencePriority: 0.8,
  speedPriority: 0.3,
  costPriority: 0.2
};

/**
 * Default model preferences for quick evaluations
 */
export const DEFAULT_EVALUATION_PREFERENCES: ModelPreferences = {
  hints: [{ name: 'claude-3-5-sonnet' }, { name: 'claude-3-haiku' }],
  intelligencePriority: 0.5,
  speedPriority: 0.7,
  costPriority: 0.5
};

/**
 * Create a simple text message for sampling
 */
export function createTextMessage(role: 'user' | 'assistant', text: string): SamplingMessage {
  return {
    role,
    content: { type: 'text', text }
  };
}

/**
 * Create a sampling request with defaults
 */
export function createSamplingRequest(
  userPrompt: string,
  options: {
    systemPrompt?: string;
    maxTokens?: number;
    modelPreferences?: ModelPreferences;
    previousMessages?: SamplingMessage[];
  } = {}
): SamplingRequest {
  const messages: SamplingMessage[] = [
    ...(options.previousMessages ?? []),
    createTextMessage('user', userPrompt)
  ];

  return {
    messages,
    systemPrompt: options.systemPrompt,
    maxTokens: options.maxTokens ?? 4096,
    modelPreferences: options.modelPreferences ?? DEFAULT_EVALUATION_PREFERENCES,
    includeContext: 'thisServer'
  };
}

/**
 * Extract text content from sampling response
 */
export function extractResponseText(response: SamplingResponse): string {
  if (response.content.type === 'text') {
    return response.content.text;
  }
  return '';
}

/**
 * Try sampling with fallback
 *
 * @param request - Sampling request
 * @param fallback - Fallback function to call if sampling is not available
 * @returns Sampling response or fallback result
 */
export async function trySamplingWithFallback<T>(
  request: SamplingRequest,
  fallback: () => Promise<T>,
  transformer: (response: SamplingResponse) => T
): Promise<T> {
  if (!mcpSampling.isEnabled()) {
    await mcpLogger.debug(
      'Sampling not available, using fallback',
      undefined,
      LOGGER_CATEGORIES.SAMPLING
    );
    return fallback();
  }

  try {
    const response = await mcpSampling.createMessage(request);
    return transformer(response);
  } catch (error) {
    await mcpLogger.warning(
      'Sampling failed, using fallback',
      { error },
      LOGGER_CATEGORIES.SAMPLING
    );
    return fallback();
  }
}
