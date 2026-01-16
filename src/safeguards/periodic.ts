/**
 * Periodic Full Verification
 * [ENH: SAFEGUARDS] Forces full verification after N incrementals
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  PeriodicVerificationConfig,
  IncrementalTracker,
  FullVerificationDecision,
  FullVerificationReason,
  HistoricalMiss,
  DEFAULT_PERIODIC_CONFIG
} from './types.js';
import { Issue, Severity, IssueCategory } from '../types/index.js';
import { StoragePaths } from '../config/index.js';

// Storage path for persistent trackers (client-agnostic, configurable via ELENCHUS_DATA_DIR)
const STORAGE_DIR = StoragePaths.safeguards;
const TRACKERS_FILE = join(STORAGE_DIR, 'periodic-trackers.json');

// In-memory cache (loaded from disk on first access)
let trackers: Map<string, IncrementalTracker> | null = null;

/**
 * Ensure storage directory exists
 */
function ensureStorageDir(): void {
  if (!existsSync(STORAGE_DIR)) {
    mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

/**
 * Load trackers from disk
 */
function loadTrackers(): Map<string, IncrementalTracker> {
  if (trackers !== null) return trackers;

  ensureStorageDir();

  if (existsSync(TRACKERS_FILE)) {
    try {
      const data = JSON.parse(readFileSync(TRACKERS_FILE, 'utf-8'));
      trackers = new Map(Object.entries(data));
    } catch {
      trackers = new Map();
    }
  } else {
    trackers = new Map();
  }

  return trackers;
}

/**
 * Save trackers to disk
 */
function saveTrackers(): void {
  if (!trackers) return;

  ensureStorageDir();

  const data = Object.fromEntries(trackers);
  writeFileSync(TRACKERS_FILE, JSON.stringify(data, null, 2));
}

/**
 * Initialize tracker for a project
 */
export function initializePeriodicTracker(projectId: string): IncrementalTracker {
  const allTrackers = loadTrackers();
  const tracker: IncrementalTracker = {
    incrementalCount: 0,
    lastFullAt: null,
    lastFullSessionId: null,
    incrementalOnlyFiles: [],
    historicalMisses: []
  };
  allTrackers.set(projectId, tracker);
  saveTrackers();
  return tracker;
}

/**
 * Get or create tracker for a project
 */
export function getPeriodicTracker(projectId: string): IncrementalTracker {
  const allTrackers = loadTrackers();
  return allTrackers.get(projectId) || initializePeriodicTracker(projectId);
}

/**
 * Record an incremental verification
 */
export function recordIncremental(
  projectId: string,
  files: string[]
): IncrementalTracker {
  const tracker = getPeriodicTracker(projectId);
  tracker.incrementalCount++;

  // Track files only verified incrementally
  for (const file of files) {
    if (!tracker.incrementalOnlyFiles.includes(file)) {
      tracker.incrementalOnlyFiles.push(file);
    }
  }

  saveTrackers();
  return tracker;
}

/**
 * Record a full verification
 */
export function recordFullVerification(
  projectId: string,
  sessionId: string
): IncrementalTracker {
  const tracker = getPeriodicTracker(projectId);
  tracker.incrementalCount = 0;
  tracker.lastFullAt = new Date().toISOString();
  tracker.lastFullSessionId = sessionId;
  tracker.incrementalOnlyFiles = [];
  saveTrackers();
  return tracker;
}

/**
 * Record issues that were missed by incremental verification
 */
export function recordHistoricalMiss(
  projectId: string,
  sessionId: string,
  issue: Issue
): void {
  const tracker = getPeriodicTracker(projectId);
  tracker.historicalMisses.push({
    sessionId,
    issueId: issue.id,
    severity: issue.severity,
    category: issue.category,
    file: issue.location.split(':')[0],
    foundAt: new Date().toISOString()
  });

  // Keep only last 100 misses
  if (tracker.historicalMisses.length > 100) {
    tracker.historicalMisses = tracker.historicalMisses.slice(-100);
  }

  saveTrackers();
}

/**
 * Check if full verification should be forced
 */
export function shouldForceFullVerification(
  projectId: string,
  files: string[],
  currentConfidence: number,
  config: PeriodicVerificationConfig = DEFAULT_PERIODIC_CONFIG
): FullVerificationDecision {
  if (!config.enabled) {
    return {
      forceFullVerification: false,
      reasons: [],
      mandatoryFiles: []
    };
  }

  const tracker = getPeriodicTracker(projectId);
  const reasons: FullVerificationReason[] = [];
  const mandatoryFiles: string[] = [];

  // Check incremental threshold
  if (tracker.incrementalCount >= config.incrementalThreshold) {
    reasons.push('INCREMENTAL_THRESHOLD');
  }

  // Check time threshold
  if (tracker.lastFullAt) {
    const hoursSinceFull =
      (Date.now() - new Date(tracker.lastFullAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceFull >= config.maxHoursSinceFull) {
      reasons.push('TIME_THRESHOLD');
    }
  } else {
    // Never had a full verification
    reasons.push('TIME_THRESHOLD');
  }

  // Check confidence floor
  if (currentConfidence < config.confidenceFloor) {
    reasons.push('CONFIDENCE_FLOOR');
  }

  // Check for critical patterns
  for (const file of files) {
    for (const pattern of config.alwaysFullPatterns) {
      const regex = new RegExp(
        pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')
      );
      if (regex.test(file)) {
        reasons.push('CRITICAL_PATTERN');
        mandatoryFiles.push(file);
      }
    }
  }

  // Check for historical miss patterns
  const recentMisses = tracker.historicalMisses.filter(m => {
    const age = Date.now() - new Date(m.foundAt).getTime();
    return age < 7 * 24 * 60 * 60 * 1000; // Last 7 days
  });

  if (recentMisses.length >= 3) {
    const missedFiles = [...new Set(recentMisses.map(m => m.file))];
    for (const file of missedFiles) {
      if (files.includes(file)) {
        reasons.push('HISTORICAL_MISS_PATTERN');
        if (!mandatoryFiles.includes(file)) {
          mandatoryFiles.push(file);
        }
      }
    }
  }

  return {
    forceFullVerification: reasons.length > 0,
    reasons: [...new Set(reasons)],
    mandatoryFiles: [...new Set(mandatoryFiles)]
  };
}

/**
 * Get summary of periodic verification status
 */
export function getPeriodicStatus(
  projectId: string,
  config: PeriodicVerificationConfig = DEFAULT_PERIODIC_CONFIG
): {
  incrementalCount: number;
  threshold: number;
  hoursSinceFull: number | null;
  maxHours: number;
  incrementalOnlyFiles: number;
  historicalMisses: number;
  status: 'OK' | 'APPROACHING' | 'OVERDUE';
} {
  const tracker = getPeriodicTracker(projectId);

  const hoursSinceFull = tracker.lastFullAt
    ? (Date.now() - new Date(tracker.lastFullAt).getTime()) / (1000 * 60 * 60)
    : null;

  let status: 'OK' | 'APPROACHING' | 'OVERDUE' = 'OK';

  if (tracker.incrementalCount >= config.incrementalThreshold) {
    status = 'OVERDUE';
  } else if (tracker.incrementalCount >= config.incrementalThreshold * 0.8) {
    status = 'APPROACHING';
  } else if (hoursSinceFull && hoursSinceFull >= config.maxHoursSinceFull) {
    status = 'OVERDUE';
  } else if (hoursSinceFull && hoursSinceFull >= config.maxHoursSinceFull * 0.8) {
    status = 'APPROACHING';
  }

  return {
    incrementalCount: tracker.incrementalCount,
    threshold: config.incrementalThreshold,
    hoursSinceFull: hoursSinceFull ? Math.round(hoursSinceFull * 10) / 10 : null,
    maxHours: config.maxHoursSinceFull,
    incrementalOnlyFiles: tracker.incrementalOnlyFiles.length,
    historicalMisses: tracker.historicalMisses.length,
    status
  };
}

/**
 * Generate periodic verification summary for LLM
 */
export function generatePeriodicSummary(
  projectId: string,
  config: PeriodicVerificationConfig = DEFAULT_PERIODIC_CONFIG
): string {
  const status = getPeriodicStatus(projectId, config);

  let summary = `## Periodic Verification Status

**Status**: ${status.status}
**Incremental Count**: ${status.incrementalCount}/${status.threshold}
**Hours Since Full**: ${status.hoursSinceFull !== null ? status.hoursSinceFull : 'Never'}/${status.maxHours}
**Files Only Incrementally Verified**: ${status.incrementalOnlyFiles}
**Historical Misses**: ${status.historicalMisses}
`;

  if (status.status === 'OVERDUE') {
    summary += `
### RECOMMENDATION
Full verification is recommended. Incremental-only verification may be missing issues.`;
  } else if (status.status === 'APPROACHING') {
    summary += `
### NOTE
Approaching periodic verification threshold. Consider scheduling full verification soon.`;
  }

  return summary;
}
