/**
 * Differential Analysis Types
 * [ENH: DIFF] Types for incremental verification
 */

export type FileChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'unchanged';

export interface ChangedFile {
  path: string;
  status: FileChangeStatus;
  oldPath?: string;               // For renames
  hunks?: DiffHunk[];             // Line-level changes
  diffContent?: string;           // Raw diff content for LLM context
  linesAdded: number;
  linesDeleted: number;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content?: string;
}

export interface VerificationBaseline {
  timestamp: string;
  projectPath: string;
  target: string;
  sessionId: string;
  verdict: 'PASS' | 'CONDITIONAL';

  // Git info (if available)
  gitCommit?: string;
  gitBranch?: string;
  gitRemote?: string;

  // Hash fallback
  fileHashes: Record<string, string>;  // path -> SHA-256 hash

  // Metadata
  totalFiles: number;
  issueCount: number;
}

export interface DiffResult {
  method: 'git' | 'hash' | 'hybrid';
  baseRef: string;
  baseTimestamp?: string;

  changedFiles: ChangedFile[];
  addedFiles: string[];
  modifiedFiles: string[];
  deletedFiles: string[];
  renamedFiles: Array<{ from: string; to: string }>;

  summary: {
    totalChanged: number;
    totalAdded: number;
    totalModified: number;
    totalDeleted: number;
    totalLinesChanged: number;
  };
}

export interface DifferentialConfig {
  enabled: boolean;
  baseRef?: string;                          // 'last-verified', commit hash, branch, HEAD~N
  includeAffectedDependencies?: boolean;     // Include files that import changed files
  maxAffectedDepth?: number;                 // How deep to trace dependencies (default: 2)
  skipUnchangedTests?: boolean;
  fallbackToFullIfNoBaseline?: boolean;
  includeLineContext?: boolean;              // Include diff hunks in context
}

export interface ProjectIndex {
  projectPath: string;
  projectHash: string;
  lastVerifiedSession?: string;
  lastVerifiedTimestamp?: string;
  lastVerifiedCommit?: string;
  history: Array<{
    sessionId: string;
    timestamp: string;
    verdict: string;
    target: string;
  }>;
}

export const DEFAULT_DIFFERENTIAL_CONFIG: DifferentialConfig = {
  enabled: false,
  baseRef: 'last-verified',
  includeAffectedDependencies: true,
  maxAffectedDepth: 2,
  skipUnchangedTests: false,
  fallbackToFullIfNoBaseline: true,
  includeLineContext: false
};
