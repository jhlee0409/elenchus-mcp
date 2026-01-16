/**
 * Centralized Storage Configuration for Elenchus MCP Server
 *
 * MCP (Model Context Protocol) is client-agnostic by design.
 * This module provides flexible storage paths that work across all MCP clients:
 * - Claude Code / Claude Desktop
 * - VS Code (GitHub Copilot)
 * - Cursor
 * - Any other MCP-compatible client
 *
 * Storage Location Priority:
 * 1. ELENCHUS_DATA_DIR environment variable (explicit override)
 * 2. XDG_DATA_HOME/elenchus (Linux/macOS XDG spec)
 * 3. ~/.elenchus (fallback default)
 */

import { join } from 'path';
import { homedir } from 'os';

/**
 * Get the base data directory for Elenchus storage.
 *
 * Follows XDG Base Directory Specification for cross-platform compatibility:
 * https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html
 *
 * @returns Absolute path to the Elenchus data directory
 */
export function getDataDir(): string {
  // 1. Explicit override via environment variable
  if (process.env.ELENCHUS_DATA_DIR) {
    return process.env.ELENCHUS_DATA_DIR;
  }

  // 2. XDG Base Directory spec (Linux/macOS standard)
  if (process.env.XDG_DATA_HOME) {
    return join(process.env.XDG_DATA_HOME, 'elenchus');
  }

  // 3. Platform-specific defaults
  const home = homedir();

  // On Windows, use AppData/Local if available
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return join(process.env.LOCALAPPDATA, 'elenchus');
  }

  // Default: ~/.local/share/elenchus (XDG default) or ~/.elenchus
  // Using ~/.elenchus for simplicity and visibility
  return join(home, '.elenchus');
}

/**
 * Storage subdirectories
 */
export const StoragePaths = {
  /** Session data storage */
  get sessions(): string {
    return join(getDataDir(), 'sessions');
  },

  /** Verification baselines for differential analysis */
  get baselines(): string {
    return join(getDataDir(), 'baselines');
  },

  /** Response cache storage */
  get cache(): string {
    return join(getDataDir(), 'cache');
  },

  /** Quality safeguards data */
  get safeguards(): string {
    return join(getDataDir(), 'safeguards');
  },

  /** Get session directory for a specific session ID */
  sessionDir(sessionId: string): string {
    // Validate session ID to prevent path traversal
    if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
      throw new Error(`Invalid session ID format: ${sessionId}`);
    }
    return join(this.sessions, sessionId);
  },

  /** Get baseline file path for a project */
  baselineFile(projectHash: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(projectHash)) {
      throw new Error(`Invalid project hash format: ${projectHash}`);
    }
    return join(this.baselines, `${projectHash}.json`);
  },

  /** Get cache file path */
  cacheFile(cacheKey: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(cacheKey)) {
      throw new Error(`Invalid cache key format: ${cacheKey}`);
    }
    return join(this.cache, `${cacheKey}.json`);
  }
} as const;

/**
 * Environment variable documentation for users
 */
export const StorageEnvVars = {
  ELENCHUS_DATA_DIR: 'Override the default data directory (e.g., ~/.elenchus)',
} as const;
