/**
 * Verification Baseline Management
 * [ENH: DIFF] Stores and retrieves verification baselines
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import { VerificationBaseline, ProjectIndex } from './types.js';
import { Session } from '../types/index.js';
import { computeFileHash } from './hash.js';
import { StoragePaths } from '../config/index.js';

// Baselines storage (client-agnostic, configurable via ELENCHUS_DATA_DIR)
const BASELINES_DIR = StoragePaths.baselines;

/**
 * Generate a unique hash for a project path
 */
export function getProjectHash(projectPath: string): string {
  return createHash('sha256')
    .update(projectPath)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Get project index directory
 */
function getProjectDir(projectPath: string): string {
  return path.join(BASELINES_DIR, getProjectHash(projectPath));
}

/**
 * Save verification baseline for a project
 */
export async function saveBaseline(
  projectPath: string,
  baseline: VerificationBaseline
): Promise<void> {
  const projectDir = getProjectDir(projectPath);
  await fs.mkdir(projectDir, { recursive: true });

  // Save baseline
  const baselinePath = path.join(projectDir, 'baseline.json');
  await fs.writeFile(baselinePath, JSON.stringify(baseline, null, 2));

  // Update project index
  await updateProjectIndex(projectPath, baseline);
}

/**
 * Load verification baseline for a project
 */
export async function loadBaseline(
  projectPath: string
): Promise<VerificationBaseline | null> {
  try {
    const baselinePath = path.join(getProjectDir(projectPath), 'baseline.json');
    const content = await fs.readFile(baselinePath, 'utf-8');
    return JSON.parse(content) as VerificationBaseline;
  } catch {
    return null;
  }
}

/**
 * Update project index with new verification
 */
async function updateProjectIndex(
  projectPath: string,
  baseline: VerificationBaseline
): Promise<void> {
  const projectDir = getProjectDir(projectPath);
  const indexPath = path.join(projectDir, 'index.json');

  let index: ProjectIndex;

  try {
    const content = await fs.readFile(indexPath, 'utf-8');
    index = JSON.parse(content);
  } catch {
    index = {
      projectPath,
      projectHash: getProjectHash(projectPath),
      history: []
    };
  }

  // Update index
  index.lastVerifiedSession = baseline.sessionId;
  index.lastVerifiedTimestamp = baseline.timestamp;
  index.lastVerifiedCommit = baseline.gitCommit;

  // Add to history (keep last 10)
  index.history.unshift({
    sessionId: baseline.sessionId,
    timestamp: baseline.timestamp,
    verdict: baseline.verdict,
    target: baseline.target
  });
  index.history = index.history.slice(0, 10);

  await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
}

/**
 * Get project index
 */
export async function getProjectIndex(
  projectPath: string
): Promise<ProjectIndex | null> {
  try {
    const indexPath = path.join(getProjectDir(projectPath), 'index.json');
    const content = await fs.readFile(indexPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Create baseline from session
 */
export function createBaselineFromSession(
  session: Session,
  workingDir: string,
  gitInfo: { commit?: string; branch?: string; remote?: string } = {}
): VerificationBaseline {
  // Compute file hashes from context
  const fileHashes: Record<string, string> = {};
  for (const [filePath, fileCtx] of session.context.files) {
    if (fileCtx.content) {
      fileHashes[filePath] = computeFileHash(fileCtx.content);
    }
  }

  return {
    timestamp: new Date().toISOString(),
    projectPath: workingDir,
    target: session.target,
    sessionId: session.id,
    verdict: 'PASS',  // Only save baseline on PASS
    gitCommit: gitInfo.commit,
    gitBranch: gitInfo.branch,
    gitRemote: gitInfo.remote,
    fileHashes,
    totalFiles: session.context.files.size,
    issueCount: session.issues.filter(i => i.status !== 'RESOLVED').length
  };
}

/**
 * Delete baseline for a project
 */
export async function deleteBaseline(projectPath: string): Promise<boolean> {
  try {
    const projectDir = getProjectDir(projectPath);
    await fs.rm(projectDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}
