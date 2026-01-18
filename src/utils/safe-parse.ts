/**
 * Safe JSON Parsing Utilities
 * [REFACTOR: ZOD-UNIFY] Phase 4: Type-safe JSON parsing with Zod validation
 *
 * These utilities standardize the pattern of parsing JSON and validating
 * with Zod schemas, replacing unsafe JSON.parse() + type assertion patterns.
 */

import { z, ZodError, ZodType } from 'zod';

// =============================================================================
// Core Parsing Functions
// =============================================================================

/**
 * Parse JSON string and validate against a Zod schema.
 * Throws on invalid JSON or validation failure.
 *
 * @param json - JSON string to parse
 * @param schema - Zod schema to validate against
 * @returns Validated and typed result
 * @throws SyntaxError if JSON is invalid
 * @throws ZodError if validation fails
 *
 * @example
 * const issue = safeJsonParse(jsonString, IssueStorageSchema);
 */
export function safeJsonParse<T>(json: string, schema: ZodType<T>): T {
  const parsed = JSON.parse(json);
  return schema.parse(parsed);
}

/**
 * Parse JSON string and validate against a Zod schema.
 * Returns a result object instead of throwing.
 *
 * @param json - JSON string to parse
 * @param schema - Zod schema to validate against
 * @returns Result object with success flag, data, and optional error
 *
 * @example
 * const result = safeJsonParseSafe(jsonString, IssueStorageSchema);
 * if (result.success) {
 *   console.log(result.data);
 * } else {
 *   console.error(result.error);
 * }
 */
export function safeJsonParseSafe<T>(
  json: string,
  schema: ZodType<T>
): SafeParseResult<T> {
  try {
    const parsed = JSON.parse(json);
    const result = schema.safeParse(parsed);
    if (result.success) {
      return { success: true, data: result.data };
    } else {
      return {
        success: false,
        error: new SafeParseError('Validation failed', result.error)
      };
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        success: false,
        error: new SafeParseError('Invalid JSON', error)
      };
    }
    return {
      success: false,
      error: new SafeParseError('Unknown error', error as Error)
    };
  }
}

/**
 * Parse JSON string and validate against a Zod schema.
 * Returns default value on failure instead of throwing.
 *
 * @param json - JSON string to parse
 * @param schema - Zod schema to validate against
 * @param defaultValue - Value to return on parse/validation failure
 * @returns Validated data or default value
 *
 * @example
 * const config = safeJsonParseWithDefault(jsonString, ConfigSchema, defaultConfig);
 */
export function safeJsonParseWithDefault<T>(
  json: string,
  schema: ZodType<T>,
  defaultValue: T
): T {
  const result = safeJsonParseSafe(json, schema);
  return result.success ? result.data : defaultValue;
}

/**
 * Parse JSON string with optional schema validation.
 * If no schema provided, returns unknown type (caller must handle).
 *
 * @param json - JSON string to parse
 * @param schema - Optional Zod schema to validate against
 * @returns Parsed and optionally validated data
 *
 * @example
 * // With schema (type-safe)
 * const issue = parseJson(jsonString, IssueStorageSchema);
 *
 * // Without schema (returns unknown, caller must validate)
 * const data = parseJson(jsonString);
 */
export function parseJson<T>(json: string, schema?: ZodType<T>): T | unknown {
  const parsed = JSON.parse(json);
  if (schema) {
    return schema.parse(parsed);
  }
  return parsed;
}

// =============================================================================
// Partial/Loose Parsing Functions
// =============================================================================

/**
 * Parse JSON and validate, allowing extra fields (passthrough).
 * Useful for forward compatibility when new fields may be added.
 *
 * @param json - JSON string to parse
 * @param schema - Zod object schema (must be z.object())
 * @returns Validated data with extra fields preserved
 */
export function safeJsonParsePassthrough<T extends z.ZodObject<z.ZodRawShape>>(
  json: string,
  schema: T
): z.infer<T> & Record<string, unknown> {
  const parsed = JSON.parse(json);
  return schema.passthrough().parse(parsed);
}

/**
 * Parse JSON and validate, stripping extra fields.
 * Useful for cleaning data to match exactly the schema.
 *
 * @param json - JSON string to parse
 * @param schema - Zod object schema (must be z.object())
 * @returns Validated data with extra fields removed
 */
export function safeJsonParseStrict<T extends z.ZodObject<z.ZodRawShape>>(
  json: string,
  schema: T
): z.infer<T> {
  const parsed = JSON.parse(json);
  return schema.strict().parse(parsed);
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard that validates data against a Zod schema.
 *
 * @param data - Data to validate
 * @param schema - Zod schema to validate against
 * @returns True if data matches schema
 *
 * @example
 * if (isValidType(data, IssueStorageSchema)) {
 *   // data is typed as IssueStorage
 * }
 */
export function isValidType<T>(data: unknown, schema: ZodType<T>): data is T {
  return schema.safeParse(data).success;
}

/**
 * Assert that data matches a Zod schema.
 * Throws if validation fails.
 *
 * @param data - Data to validate
 * @param schema - Zod schema to validate against
 * @param message - Optional error message
 *
 * @example
 * assertType(data, IssueStorageSchema, 'Invalid issue data');
 * // data is now typed as IssueStorage
 */
export function assertType<T>(
  data: unknown,
  schema: ZodType<T>,
  message?: string
): asserts data is T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new SafeParseError(
      message || 'Type assertion failed',
      result.error
    );
  }
}

// =============================================================================
// Result Types and Error Classes
// =============================================================================

/**
 * Result type for safe parsing operations
 */
export type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: SafeParseError };

/**
 * Custom error class for safe parsing failures
 */
export class SafeParseError extends Error {
  public readonly cause: Error | ZodError;
  public readonly isJsonError: boolean;
  public readonly isValidationError: boolean;

  constructor(message: string, cause: Error | ZodError) {
    super(message);
    this.name = 'SafeParseError';
    this.cause = cause;
    this.isJsonError = cause instanceof SyntaxError;
    this.isValidationError = cause instanceof ZodError;
  }

  /**
   * Get formatted error details for logging
   */
  getDetails(): string {
    if (this.isValidationError) {
      const zodError = this.cause as ZodError;
      return zodError.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join('; ');
    }
    return this.cause.message;
  }
}

// =============================================================================
// LLM Output Parsing Helpers
// =============================================================================

/**
 * Extract JSON from LLM output that may contain markdown code blocks.
 * Handles common patterns like ```json ... ``` or raw JSON.
 *
 * @param output - Raw LLM output string
 * @returns Extracted JSON string (may still be invalid)
 */
export function extractJsonFromLLMOutput(output: string): string {
  // Try to extract from markdown code block
  const codeBlockMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try to find JSON object or array
  const jsonMatch = output.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }

  // Return as-is
  return output.trim();
}

/**
 * Parse LLM output that may contain JSON with markdown formatting.
 * Extracts JSON and validates against schema.
 *
 * @param output - Raw LLM output string
 * @param schema - Zod schema to validate against
 * @returns Validated and typed result
 *
 * @example
 * const result = parseLLMJsonOutput(llmResponse, ResultSchema);
 */
export function parseLLMJsonOutput<T>(output: string, schema: ZodType<T>): T {
  const json = extractJsonFromLLMOutput(output);
  return safeJsonParse(json, schema);
}

/**
 * Safe version of parseLLMJsonOutput that returns a result object.
 *
 * @param output - Raw LLM output string
 * @param schema - Zod schema to validate against
 * @returns Result object with success flag, data, and optional error
 */
export function parseLLMJsonOutputSafe<T>(
  output: string,
  schema: ZodType<T>
): SafeParseResult<T> {
  const json = extractJsonFromLLMOutput(output);
  return safeJsonParseSafe(json, schema);
}
