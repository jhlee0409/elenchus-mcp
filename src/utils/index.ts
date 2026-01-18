/**
 * Utils Module - Advanced data structures and utilities
 * [REFACTOR: ZOD-UNIFY] Added safe JSON parsing utilities
 */

export {
  Deque,
  LRUCache,
  MultiIndexStore,
  UnionFind,
  SlidingWindowCounter,
  IssueIndex
} from './data-structures.js';

// User preferences detection
export {
  detectAutonomyLevel,
  detectVerbosity,
  detectUserPreferences,
  getAutonomyConfig,
  getVerbosityConfig,
  formatResponseForVerbosity,
  getStatusMessageFormat,
  AUTONOMY_CONFIGS,
  VERBOSITY_CONFIGS,
  AUTONOMY_DESCRIPTIONS,
  type AutonomyLevel,
  type AutonomyConfig,
  type VerbosityLevel,
  type VerbosityConfig,
  type UserPreferences
} from './user-preferences.js';

// Safe JSON parsing with Zod validation
export {
  safeJsonParse,
  safeJsonParseSafe,
  safeJsonParseWithDefault,
  parseJson,
  safeJsonParsePassthrough,
  safeJsonParseStrict,
  isValidType,
  assertType,
  extractJsonFromLLMOutput,
  parseLLMJsonOutput,
  parseLLMJsonOutputSafe,
  SafeParseError,
  type SafeParseResult
} from './safe-parse.js';
