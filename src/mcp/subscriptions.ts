/**
 * MCP Resource Subscriptions
 *
 * Enables real-time updates for session state changes.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { MCPSubscriptionsInterface } from './types.js';
import { mcpLogger, LOGGER_CATEGORIES } from './logging.js';

// =============================================================================
// Subscription Manager Implementation
// =============================================================================

/**
 * Manages resource subscriptions
 */
export class MCPSubscriptions implements MCPSubscriptionsInterface {
  private server: Server | null = null;
  private enabled: boolean = false;
  private subscriptions = new Map<string, Set<string>>(); // uri -> Set of clientIds
  private pendingNotifications: Map<string, NodeJS.Timeout> = new Map();
  private notificationDebounceMs: number = 100;

  /**
   * Initialize subscription manager with server
   */
  initialize(server: Server, enabled: boolean = true): void {
    this.server = server;
    this.enabled = enabled;
  }

  /**
   * Set debounce time for notifications
   */
  setDebounceMs(ms: number): void {
    this.notificationDebounceMs = ms;
  }

  /**
   * Subscribe to a resource
   *
   * @param uri - Resource URI to subscribe to
   * @param clientId - Optional client identifier
   */
  subscribe(uri: string, clientId: string = 'default'): void {
    if (!this.subscriptions.has(uri)) {
      this.subscriptions.set(uri, new Set());
    }
    this.subscriptions.get(uri)!.add(clientId);

    mcpLogger.debug(
      `Subscribed to resource: ${uri}`,
      { clientId },
      LOGGER_CATEGORIES.SUBSCRIPTION
    );
  }

  /**
   * Unsubscribe from a resource
   *
   * @param uri - Resource URI to unsubscribe from
   * @param clientId - Optional client identifier
   */
  unsubscribe(uri: string, clientId: string = 'default'): void {
    const subs = this.subscriptions.get(uri);
    if (subs) {
      subs.delete(clientId);
      if (subs.size === 0) {
        this.subscriptions.delete(uri);
      }
    }

    mcpLogger.debug(
      `Unsubscribed from resource: ${uri}`,
      { clientId },
      LOGGER_CATEGORIES.SUBSCRIPTION
    );
  }

  /**
   * Check if a resource has any subscribers
   */
  isSubscribed(uri: string): boolean {
    return this.subscriptions.has(uri) && this.subscriptions.get(uri)!.size > 0;
  }

  /**
   * Get subscriber count for a resource
   */
  getSubscriberCount(uri: string): number {
    return this.subscriptions.get(uri)?.size ?? 0;
  }

  /**
   * Notify subscribers that a resource has changed
   * Uses debouncing to prevent rapid-fire notifications
   *
   * @param uri - Resource URI that changed
   */
  async notifyChange(uri: string): Promise<void> {
    if (!this.enabled || !this.server || !this.isSubscribed(uri)) {
      return;
    }

    // Cancel any pending notification for this URI
    const pendingTimeout = this.pendingNotifications.get(uri);
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
    }

    // Schedule debounced notification
    const timeout = setTimeout(async () => {
      this.pendingNotifications.delete(uri);

      try {
        await this.server!.notification({
          method: 'notifications/resources/updated',
          params: { uri }
        });

        await mcpLogger.debug(
          `Resource updated notification sent: ${uri}`,
          { subscriberCount: this.getSubscriberCount(uri) },
          LOGGER_CATEGORIES.SUBSCRIPTION
        );
      } catch (error) {
        await mcpLogger.warning(
          `Failed to send resource update notification: ${uri}`,
          { error },
          LOGGER_CATEGORIES.SUBSCRIPTION
        );
      }
    }, this.notificationDebounceMs);

    this.pendingNotifications.set(uri, timeout);
  }

  /**
   * Notify that the resource list has changed
   */
  async notifyListChanged(): Promise<void> {
    if (!this.enabled || !this.server) {
      return;
    }

    try {
      await this.server.notification({
        method: 'notifications/resources/list_changed'
      });

      await mcpLogger.debug(
        'Resource list changed notification sent',
        undefined,
        LOGGER_CATEGORIES.SUBSCRIPTION
      );
    } catch (error) {
      await mcpLogger.warning(
        'Failed to send resource list changed notification',
        { error },
        LOGGER_CATEGORIES.SUBSCRIPTION
      );
    }
  }

  /**
   * Get all subscribed URIs
   */
  getSubscribedUris(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  /**
   * Clear all subscriptions (for cleanup)
   */
  clear(): void {
    // Clear pending notifications
    for (const timeout of this.pendingNotifications.values()) {
      clearTimeout(timeout);
    }
    this.pendingNotifications.clear();
    this.subscriptions.clear();
  }

  /**
   * Get subscription statistics
   */
  getStats(): { totalUris: number; totalSubscriptions: number } {
    let totalSubscriptions = 0;
    for (const subs of this.subscriptions.values()) {
      totalSubscriptions += subs.size;
    }
    return {
      totalUris: this.subscriptions.size,
      totalSubscriptions
    };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

/**
 * Global subscription manager instance
 */
export const mcpSubscriptions = new MCPSubscriptions();

// =============================================================================
// Resource URI Helpers
// =============================================================================

/**
 * Resource URI patterns
 */
export const RESOURCE_URIS = {
  session: (sessionId: string) => `elenchus://sessions/${sessionId}`,
  sessionIssues: (sessionId: string) => `elenchus://sessions/${sessionId}/issues`,
  sessionIssue: (sessionId: string, issueId: string) =>
    `elenchus://sessions/${sessionId}/issues/${issueId}`,
  sessionRounds: (sessionId: string) => `elenchus://sessions/${sessionId}/rounds`,
  sessionRound: (sessionId: string, roundNumber: number) =>
    `elenchus://sessions/${sessionId}/rounds/${roundNumber}`,
  sessionConvergence: (sessionId: string) => `elenchus://sessions/${sessionId}/convergence`
} as const;

/**
 * Notify session-related changes
 */
export async function notifySessionChange(sessionId: string): Promise<void> {
  const uris = [
    RESOURCE_URIS.session(sessionId),
    RESOURCE_URIS.sessionConvergence(sessionId)
  ];

  for (const uri of uris) {
    await mcpSubscriptions.notifyChange(uri);
  }
}

/**
 * Notify issue-related changes
 */
export async function notifyIssueChange(
  sessionId: string,
  issueId?: string
): Promise<void> {
  await mcpSubscriptions.notifyChange(RESOURCE_URIS.sessionIssues(sessionId));

  if (issueId) {
    await mcpSubscriptions.notifyChange(RESOURCE_URIS.sessionIssue(sessionId, issueId));
  }
}

/**
 * Notify round-related changes
 */
export async function notifyRoundChange(
  sessionId: string,
  roundNumber: number
): Promise<void> {
  await mcpSubscriptions.notifyChange(RESOURCE_URIS.sessionRounds(sessionId));
  await mcpSubscriptions.notifyChange(RESOURCE_URIS.sessionRound(sessionId, roundNumber));
}
