/**
 * File Hash Comparison
 * [ENH: DIFF] Hash-based change detection for non-Git repositories
 */

import { createHash } from 'crypto';
import { ChangedFile, FileChangeStatus } from './types.js';
import { FileContext } from '../types/index.js';

/**
 * Compute SHA-256 hash of file content
 */
export function computeFileHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Compute hashes for all files in context
 */
export function computeContextHashes(
  files: Map<string, FileContext>
): Record<string, string> {
  const hashes: Record<string, string> = {};

  for (const [path, fileCtx] of files) {
    if (fileCtx.content) {
      hashes[path] = computeFileHash(fileCtx.content);
    }
  }

  return hashes;
}

/**
 * Compare current file hashes against baseline hashes
 */
export function compareHashes(
  currentHashes: Record<string, string>,
  baselineHashes: Record<string, string>
): ChangedFile[] {
  const changedFiles: ChangedFile[] = [];
  const allPaths = new Set([
    ...Object.keys(currentHashes),
    ...Object.keys(baselineHashes)
  ]);

  for (const path of allPaths) {
    const currentHash = currentHashes[path];
    const baselineHash = baselineHashes[path];

    let status: FileChangeStatus;

    if (!baselineHash && currentHash) {
      status = 'added';
    } else if (baselineHash && !currentHash) {
      status = 'deleted';
    } else if (currentHash !== baselineHash) {
      status = 'modified';
    } else {
      status = 'unchanged';
    }

    if (status !== 'unchanged') {
      changedFiles.push({
        path,
        status,
        linesAdded: 0,  // Can't determine without content comparison
        linesDeleted: 0
      });
    }
  }

  return changedFiles;
}
