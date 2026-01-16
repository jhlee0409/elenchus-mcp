/**
 * Tool Result Types
 * Consistent error handling patterns following MCP best practices
 */

// =============================================================================
// Result Types
// =============================================================================

/**
 * Success result with data
 */
export interface ToolSuccess<T> {
  success: true;
  data: T;
}

/**
 * Error result with structured error information
 */
export interface ToolError {
  success: false;
  error: {
    code: ToolErrorCode;
    message: string;
    details?: Record<string, unknown>;
    suggestions?: string[];
  };
}

/**
 * Unified tool result type
 */
export type ToolResult<T> = ToolSuccess<T> | ToolError;

/**
 * Standardized error codes for tools
 */
export type ToolErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'ISSUE_NOT_FOUND'
  | 'INVALID_INPUT'
  | 'INVALID_STATE'
  | 'OPERATION_FAILED'
  | 'NOT_INITIALIZED'
  | 'CONFIGURATION_ERROR'
  | 'INTERNAL_ERROR';

// =============================================================================
// Result Builders
// =============================================================================

/**
 * Create a success result
 */
export function success<T>(data: T): ToolSuccess<T> {
  return { success: true, data };
}

/**
 * Create an error result
 */
export function error(
  code: ToolErrorCode,
  message: string,
  details?: Record<string, unknown>,
  suggestions?: string[]
): ToolError {
  return {
    success: false,
    error: {
      code,
      message,
      details,
      suggestions
    }
  };
}

/**
 * Session not found error
 */
export function sessionNotFound(sessionId: string): ToolError {
  return error(
    'SESSION_NOT_FOUND',
    `Session not found: ${sessionId}`,
    { sessionId },
    ['Verify the session ID is correct', 'Use elenchus_get_sessions to list active sessions']
  );
}

/**
 * Issue not found error
 */
export function issueNotFound(issueId: string, sessionId?: string): ToolError {
  return error(
    'ISSUE_NOT_FOUND',
    `Issue not found: ${issueId}`,
    { issueId, sessionId },
    ['Verify the issue ID is correct', 'Use elenchus_get_issues to list issues in the session']
  );
}

/**
 * Invalid state error
 */
export function invalidState(
  message: string,
  currentState?: string,
  expectedState?: string
): ToolError {
  return error(
    'INVALID_STATE',
    message,
    { currentState, expectedState },
    currentState && expectedState
      ? [`Current state is '${currentState}', expected '${expectedState}'`]
      : undefined
  );
}

/**
 * Not initialized error
 */
export function notInitialized(component: string): ToolError {
  return error(
    'NOT_INITIALIZED',
    `${component} is not initialized`,
    { component },
    [`Initialize ${component} first using the appropriate tool`]
  );
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if result is a success
 */
export function isSuccess<T>(result: ToolResult<T>): result is ToolSuccess<T> {
  return result.success === true;
}

/**
 * Check if result is an error
 */
export function isError<T>(result: ToolResult<T>): result is ToolError {
  return result.success === false;
}

// =============================================================================
// Result Unwrapping
// =============================================================================

/**
 * Unwrap a result, throwing if it's an error
 */
export function unwrap<T>(result: ToolResult<T>): T {
  if (isError(result)) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Unwrap a result with a default value for errors
 */
export function unwrapOr<T>(result: ToolResult<T>, defaultValue: T): T {
  if (isError(result)) {
    return defaultValue;
  }
  return result.data;
}
