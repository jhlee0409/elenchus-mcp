/**
 * Configuration Module
 *
 * Centralized configuration for the Elenchus MCP Server.
 * Designed to be client-agnostic and follow MCP best practices.
 */

export { getDataDir, StoragePaths, StorageEnvVars } from './storage.js';

export {
  SESSION_CONSTANTS,
  DIFFERENTIAL_CONSTANTS,
  CACHE_CONSTANTS,
  CHUNKING_CONSTANTS,
  PIPELINE_CONSTANTS,
  SAFEGUARDS_CONSTANTS,
  AUTO_LOOP_CONSTANTS,
  ROLE_CONSTANTS,
  CONVERGENCE_CONSTANTS,
  DISPLAY_CONSTANTS,
  ISSUE_CONSTANTS,
  MEDIATOR_CONSTANTS
} from './constants.js';
