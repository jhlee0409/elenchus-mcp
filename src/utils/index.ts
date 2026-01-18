/**
 * Utils Module - Advanced data structures and utilities
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
