/**
 * MCP Cancellation Support
 *
 * Provides cancellation tokens for long-running operations.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { CancellationTokenInterface, MCPCancellationInterface } from './types.js';
import { CancellationError } from './types.js';
import { mcpLogger, LOGGER_CATEGORIES } from './logging.js';

// Re-export CancellationError for convenience
export { CancellationError };

// =============================================================================
// Cancellation Token Implementation
// =============================================================================

/**
 * Cancellation token that can be used to cancel an operation
 */
class CancellationToken implements CancellationTokenInterface {
  private _cancelled = false;
  private _reason?: string;
  private _callbacks: Array<(reason?: string) => void> = [];

  /**
   * Check if the operation has been cancelled
   */
  isCancelled(): boolean {
    return this._cancelled;
  }

  /**
   * Get the cancellation reason
   */
  get reason(): string | undefined {
    return this._reason;
  }

  /**
   * Cancel the operation
   *
   * @param reason - Optional reason for cancellation
   */
  cancel(reason?: string): void {
    if (this._cancelled) return;

    this._cancelled = true;
    this._reason = reason;

    // Notify all callbacks
    for (const callback of this._callbacks) {
      try {
        callback(reason);
      } catch {
        // Ignore callback errors
      }
    }
  }

  /**
   * Throw CancellationError if cancelled
   */
  throwIfCancelled(): void {
    if (this._cancelled) {
      throw new CancellationError(this._reason);
    }
  }

  /**
   * Register a callback to be called when cancelled
   *
   * @param callback - Function to call on cancellation
   */
  onCancelled(callback: (reason?: string) => void): void {
    if (this._cancelled) {
      // Already cancelled, call immediately
      callback(this._reason);
    } else {
      this._callbacks.push(callback);
    }
  }
}

// =============================================================================
// MCP Cancellation Manager
// =============================================================================

/**
 * Manages cancellation tokens for all operations
 */
export class MCPCancellation implements MCPCancellationInterface {
  private server: Server | null = null;
  private tokens = new Map<string | number, CancellationToken>();

  /**
   * Initialize cancellation manager with server
   *
   * Note: MCP cancellation notifications are handled at the protocol level.
   * This manager provides application-level cancellation token management.
   */
  initialize(server: Server): void {
    this.server = server;
    // Cancellation is handled via the token system below
    // The client can request cancellation by calling a tool or
    // through the protocol-level cancellation mechanism
  }

  /**
   * Create a new cancellation token
   *
   * @param requestId - Request ID to associate with the token
   * @returns Cancellation token
   */
  createToken(requestId: string | number): CancellationTokenInterface {
    const token = new CancellationToken();
    this.tokens.set(requestId, token);
    return token;
  }

  /**
   * Get an existing token
   *
   * @param requestId - Request ID
   * @returns Token if exists, undefined otherwise
   */
  getToken(requestId: string | number): CancellationTokenInterface | undefined {
    return this.tokens.get(requestId);
  }

  /**
   * Remove a token (cleanup after operation completes)
   *
   * @param requestId - Request ID
   */
  removeToken(requestId: string | number): void {
    this.tokens.delete(requestId);
  }

  /**
   * Check if a request has been cancelled
   *
   * @param requestId - Request ID
   * @returns True if cancelled
   */
  isCancelled(requestId: string | number): boolean {
    const token = this.tokens.get(requestId);
    return token?.isCancelled() ?? false;
  }

  /**
   * Get count of active tokens
   */
  get activeCount(): number {
    return this.tokens.size;
  }

  /**
   * Clear all tokens (for cleanup)
   */
  clear(): void {
    this.tokens.clear();
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

/**
 * Global cancellation manager instance
 */
export const mcpCancellation = new MCPCancellation();

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Run an operation with cancellation support
 *
 * @param requestId - Request ID for cancellation tracking
 * @param operation - Async operation that receives cancellation token
 * @returns Result of the operation
 */
export async function withCancellation<T>(
  requestId: string | number,
  operation: (token: CancellationTokenInterface) => Promise<T>
): Promise<T> {
  const token = mcpCancellation.createToken(requestId);

  try {
    return await operation(token);
  } finally {
    mcpCancellation.removeToken(requestId);
  }
}

/**
 * Check cancellation in a loop
 *
 * @param token - Cancellation token
 * @param checkInterval - How often to actually check (for performance)
 * @returns A function that checks cancellation
 */
export function createCancellationChecker(
  token: CancellationTokenInterface,
  checkInterval: number = 1
): (iteration: number) => void {
  return (iteration: number): void => {
    if (iteration % checkInterval === 0) {
      token.throwIfCancelled();
    }
  };
}

/**
 * Create a cancellable delay
 *
 * @param ms - Milliseconds to wait
 * @param token - Cancellation token
 * @returns Promise that resolves after delay or rejects on cancellation
 */
export function cancellableDelay(
  ms: number,
  token: CancellationTokenInterface
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);

    token.onCancelled((reason) => {
      clearTimeout(timeout);
      reject(new CancellationError(reason));
    });

    // Check if already cancelled
    if (token.isCancelled()) {
      clearTimeout(timeout);
      reject(new CancellationError(token.reason ?? 'Already cancelled'));
    }
  });
}
