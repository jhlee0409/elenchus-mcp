/**
 * Zod Validation Helpers
 * Centralized utilities for Zod schema creation and validation
 * [FIX: SCHEMA-06] Descriptive error messages for enum validation
 * [FIX: SCHEMA-07] Handle missing/undefined values with helpful messages
 */

import { z } from 'zod';

/**
 * Creates a custom error map for enum validation with descriptive messages
 *
 * @param fieldName - The name of the field (used in error messages)
 * @param validValues - Array of valid enum values
 * @returns Zod error map that provides helpful messages for:
 *   - Invalid enum values (wrong value provided)
 *   - Missing/undefined values (field omitted)
 *
 * @example
 * const StatusValues = ['ACTIVE', 'INACTIVE'] as const;
 * const StatusEnum = z.enum(StatusValues, { errorMap: enumErrorMap('status', StatusValues) });
 */
export function enumErrorMap(fieldName: string, validValues: readonly string[]): z.ZodErrorMap {
  return (issue, ctx) => {
    const validOptions = validValues.join('", "');

    if (issue.code === 'invalid_enum_value') {
      return {
        message: `Invalid ${fieldName} "${ctx.data}". Must be exactly one of: "${validOptions}" (case-sensitive).`
      };
    }

    // [FIX: SCHEMA-07] Handle missing/undefined values
    if (issue.code === 'invalid_type' && ctx.data === undefined) {
      return {
        message: `Missing required field "${fieldName}". Must be one of: "${validOptions}". This field cannot be omitted.`
      };
    }

    return { message: ctx.defaultError };
  };
}
