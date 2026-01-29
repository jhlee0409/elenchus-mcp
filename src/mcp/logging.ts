/**
 * MCP Structured Logging
 *
 * Replaces console.error with structured MCP logging protocol.
 * Supports log levels, filtering, and structured data.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { LogLevel, LoggingConfig, MCPLoggerInterface } from './types.js';

// =============================================================================
// Constants
// =============================================================================

/**
 * Log level priority (lower = more severe)
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  emergency: 0,
  alert: 1,
  critical: 2,
  error: 3,
  warning: 4,
  notice: 5,
  info: 6,
  debug: 7
};

/**
 * Default logging configuration
 */
export const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
  minLevel: 'info',
  alwaysLogLevels: ['emergency', 'alert', 'critical', 'error', 'warning'],
  enabledLoggers: ['*']
};

// =============================================================================
// Logger Categories
// =============================================================================

/**
 * Predefined logger categories
 */
export const LOGGER_CATEGORIES = {
  SESSION: 'elenchus.session',
  VERIFICATION: 'elenchus.verification',
  MEDIATOR: 'elenchus.mediator',
  CACHE: 'elenchus.cache',
  PIPELINE: 'elenchus.pipeline',
  SAMPLING: 'elenchus.sampling',
  PROGRESS: 'elenchus.progress',
  SUBSCRIPTION: 'elenchus.subscription',
  GENERAL: 'elenchus.general'
} as const;

// =============================================================================
// MCP Logger Implementation
// =============================================================================

/**
 * MCP Logger that sends structured logs via MCP protocol
 */
export class MCPLogger implements MCPLoggerInterface {
  private server: Server | null = null;
  private config: LoggingConfig;
  private enabled: boolean = false;
  private fallbackToConsole: boolean = true;

  constructor(config: Partial<LoggingConfig> = {}) {
    this.config = { ...DEFAULT_LOGGING_CONFIG, ...config };
  }

  /**
   * Initialize the logger with a server instance
   */
  initialize(server: Server, enabled: boolean = true): void {
    this.server = server;
    this.enabled = enabled;
  }

  /**
   * Set whether to fallback to console when MCP logging is unavailable
   */
  setFallbackToConsole(enabled: boolean): void {
    this.fallbackToConsole = enabled;
  }

  /**
   * Set minimum log level
   */
  setMinLevel(level: LogLevel): void {
    this.config.minLevel = level;
  }

  /**
   * Get current minimum log level
   */
  getMinLevel(): LogLevel {
    return this.config.minLevel;
  }

  /**
   * Check if a log level should be logged
   */
  private shouldLog(level: LogLevel, logger?: string): boolean {
    // Always log critical levels
    if (this.config.alwaysLogLevels.includes(level)) {
      return true;
    }

    // Check log level priority
    const levelPriority = LOG_LEVEL_PRIORITY[level];
    const minPriority = LOG_LEVEL_PRIORITY[this.config.minLevel];

    if (levelPriority > minPriority) {
      return false;
    }

    // Check if logger is enabled
    if (logger && this.config.enabledLoggers.length > 0) {
      if (!this.config.enabledLoggers.includes('*')) {
        const matchesLogger = this.config.enabledLoggers.some(
          pattern => logger.startsWith(pattern) || pattern.startsWith(logger)
        );
        if (!matchesLogger) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Format data for logging
   */
  private formatData(data: unknown): string | undefined {
    if (data === undefined || data === null) {
      return undefined;
    }

    if (typeof data === 'string') {
      return data;
    }

    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }

  /**
   * Log a message at the specified level
   */
  async log(
    level: LogLevel,
    message: string,
    data?: unknown,
    logger: string = LOGGER_CATEGORIES.GENERAL
  ): Promise<void> {
    if (!this.shouldLog(level, logger)) {
      return;
    }

    const formattedData = this.formatData(data);
    const fullMessage = formattedData
      ? `${message}\n${formattedData}`
      : message;

    // Try MCP logging first
    if (this.enabled && this.server) {
      try {
        await this.server.sendLoggingMessage({
          level,
          logger,
          data: { message: fullMessage, raw: data }
        });
        return;
      } catch {
        // Fall through to console if MCP logging fails
      }
    }

    // Fallback to console
    if (this.fallbackToConsole) {
      const prefix = `[${level.toUpperCase()}] [${logger}]`;
      const consoleMsg = `${prefix} ${message}`;

      switch (level) {
        case 'emergency':
        case 'alert':
        case 'critical':
        case 'error':
          console.error(consoleMsg, data ?? '');
          break;
        case 'warning':
          console.warn(consoleMsg, data ?? '');
          break;
        case 'debug':
          console.debug(consoleMsg, data ?? '');
          break;
        default:
          console.info(consoleMsg, data ?? '');
      }
    }
  }

  /**
   * Log debug message
   */
  async debug(message: string, data?: unknown, logger?: string): Promise<void> {
    return this.log('debug', message, data, logger);
  }

  /**
   * Log info message
   */
  async info(message: string, data?: unknown, logger?: string): Promise<void> {
    return this.log('info', message, data, logger);
  }

  /**
   * Log notice message
   */
  async notice(message: string, data?: unknown, logger?: string): Promise<void> {
    return this.log('notice', message, data, logger);
  }

  /**
   * Log warning message
   */
  async warning(message: string, data?: unknown, logger?: string): Promise<void> {
    return this.log('warning', message, data, logger);
  }

  /**
   * Log error message
   */
  async error(message: string, data?: unknown, logger?: string): Promise<void> {
    return this.log('error', message, data, logger);
  }

  /**
   * Log critical message
   */
  async critical(message: string, data?: unknown, logger?: string): Promise<void> {
    return this.log('critical', message, data, logger);
  }

  /**
   * Log alert message
   */
  async alert(message: string, data?: unknown, logger?: string): Promise<void> {
    return this.log('alert', message, data, logger);
  }

  /**
   * Log emergency message
   */
  async emergency(message: string, data?: unknown, logger?: string): Promise<void> {
    return this.log('emergency', message, data, logger);
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

/**
 * Global logger instance
 */
export const mcpLogger = new MCPLogger();

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Log an error with optional error object
 */
export async function logError(
  message: string,
  error?: Error | unknown,
  logger?: string
): Promise<void> {
  const data = error instanceof Error
    ? { message: error.message, stack: error.stack, name: error.name }
    : error;

  return mcpLogger.error(message, data, logger);
}

/**
 * Log session-related events
 */
export async function logSession(
  message: string,
  data?: unknown
): Promise<void> {
  return mcpLogger.info(message, data, LOGGER_CATEGORIES.SESSION);
}

/**
 * Log verification-related events
 */
export async function logVerification(
  message: string,
  data?: unknown
): Promise<void> {
  return mcpLogger.info(message, data, LOGGER_CATEGORIES.VERIFICATION);
}

/**
 * Log mediator-related events
 */
export async function logMediator(
  message: string,
  data?: unknown
): Promise<void> {
  return mcpLogger.info(message, data, LOGGER_CATEGORIES.MEDIATOR);
}
