/**
 * MCP Progress Notifications
 *
 * Provides progress tracking and notifications for long-running operations.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { ProgressTracker, MCPProgressInterface } from './types.js';
import { mcpLogger, LOGGER_CATEGORIES } from './logging.js';

// =============================================================================
// Progress Implementation
// =============================================================================

/**
 * Creates a progress tracker for an operation
 */
function createProgressTracker(
  server: Server | null,
  enabled: boolean,
  token: string,
  total?: number,
  initialMessage?: string,
  onComplete?: () => void
): ProgressTracker {
  let current = 0;

  const sendNotification = async (
    progress: number,
    message?: string
  ): Promise<void> => {
    if (!enabled || !server) {
      // Log progress for debugging when notifications are disabled
      await mcpLogger.debug(
        `Progress: ${progress}${total ? `/${total}` : ''} - ${message ?? 'in progress'}`,
        { token, progress, total, message },
        LOGGER_CATEGORIES.PROGRESS
      );
      return;
    }

    try {
      await server.notification({
        method: 'notifications/progress',
        params: {
          progressToken: token,
          progress,
          total,
          message
        }
      });
    } catch (error) {
      // Log but don't throw - progress notifications are best-effort
      await mcpLogger.warning(
        'Failed to send progress notification',
        { error, token, progress },
        LOGGER_CATEGORIES.PROGRESS
      );
    }
  };

  // Send initial progress notification
  if (initialMessage) {
    sendNotification(0, initialMessage).catch(() => {});
  }

  return {
    token,
    total,
    current,

    async update(newCurrent: number, message?: string): Promise<void> {
      current = newCurrent;
      await sendNotification(current, message);
    },

    async complete(message?: string): Promise<void> {
      current = total ?? current;
      await sendNotification(current, message ?? 'Complete');
      // Auto-remove tracker from active list
      onComplete?.();
    }
  };
}

// =============================================================================
// MCP Progress Manager
// =============================================================================

/**
 * Manages progress tracking for all operations
 */
export class MCPProgress implements MCPProgressInterface {
  private server: Server | null = null;
  private enabled: boolean = false;
  private activeTrackers: Map<string, ProgressTracker> = new Map();

  /**
   * Initialize progress manager with server
   */
  initialize(server: Server, enabled: boolean = true): void {
    this.server = server;
    this.enabled = enabled;
  }

  /**
   * Check if progress notifications are enabled
   */
  isEnabled(): boolean {
    return this.enabled && this.server !== null;
  }

  /**
   * Start a new progress tracker
   *
   * @param total - Total number of steps (optional)
   * @param message - Initial message (optional)
   * @returns Progress tracker instance
   */
  async startProgress(total?: number, message?: string): Promise<ProgressTracker> {
    const token = crypto.randomUUID();
    const tracker = createProgressTracker(
      this.server,
      this.enabled,
      token,
      total,
      message,
      () => this.removeTracker(token)  // Auto-remove on complete
    );

    this.activeTrackers.set(token, tracker);
    return tracker;
  }

  /**
   * Get an active tracker by token
   */
  getTracker(token: string): ProgressTracker | undefined {
    return this.activeTrackers.get(token);
  }

  /**
   * Remove a tracker (called automatically on complete)
   */
  removeTracker(token: string): void {
    this.activeTrackers.delete(token);
  }

  /**
   * Get count of active trackers
   */
  get activeCount(): number {
    return this.activeTrackers.size;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

/**
 * Global progress manager instance
 */
export const mcpProgress = new MCPProgress();

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Progress stages for common operations
 */
export const PROGRESS_STAGES = {
  SESSION_START: {
    DISCOVER_FILES: 'Discovering files...',
    ANALYZE_DEPS: 'Analyzing dependencies...',
    PRE_ANALYSIS: 'Running pre-analysis...',
    CREATE_SESSION: 'Creating session...',
    COMPLETE: 'Session created'
  },
  SUBMIT_ROUND: {
    PARSE_OUTPUT: 'Parsing output...',
    ANALYZE_ISSUES: 'Analyzing issues...',
    CHECK_CONVERGENCE: 'Checking convergence...',
    UPDATE_STATE: 'Updating state...',
    COMPLETE: 'Round submitted'
  },
  RIPPLE_EFFECT: {
    BUILD_GRAPH: 'Building dependency graph...',
    ANALYZE_IMPACT: 'Analyzing impact...',
    CALCULATE_CASCADE: 'Calculating cascade effects...',
    COMPLETE: 'Analysis complete'
  },
  PIPELINE: {
    TIER_1: 'Running quick screen...',
    TIER_2: 'Running focused analysis...',
    TIER_3: 'Running exhaustive analysis...',
    COMPLETE: 'Pipeline complete'
  }
} as const;

/**
 * Helper to run an async operation with progress tracking
 *
 * @param stages - Array of stage names
 * @param operation - Async operation that receives progress update function
 * @returns Result of the operation
 */
export async function withProgress<T>(
  stages: string[],
  operation: (
    update: (stage: number, message?: string) => Promise<void>
  ) => Promise<T>
): Promise<T> {
  const tracker = await mcpProgress.startProgress(stages.length);

  const update = async (stage: number, message?: string): Promise<void> => {
    const stageMessage = message ?? stages[stage - 1] ?? `Stage ${stage}`;
    await tracker.update(stage, stageMessage);
  };

  try {
    const result = await operation(update);
    await tracker.complete();
    return result;
  } catch (error) {
    await tracker.complete('Failed');
    throw error;
  }
}
