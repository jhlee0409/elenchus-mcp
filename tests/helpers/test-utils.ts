/**
 * Common Test Utilities
 * [ENH: TEST-UTILS] Shared helpers to reduce test code duplication
 */

import { Issue, Round, Session, IssueCategory } from '../../src/types/index.js';

/**
 * Create a mock Round object
 */
export function createMockRound(
  number: number,
  role: 'verifier' | 'critic',
  options: {
    issuesRaised?: string[];
    issuesResolved?: string[];
    output?: string;
    contextExpanded?: boolean;
    newFilesDiscovered?: string[];
  } = {}
): Round {
  return {
    number,
    role,
    input: '',
    output: options.output || '',
    timestamp: new Date().toISOString(),
    issuesRaised: options.issuesRaised || [],
    issuesResolved: options.issuesResolved || [],
    contextExpanded: options.contextExpanded || false,
    newFilesDiscovered: options.newFilesDiscovered || []
  };
}

/**
 * Create a mock Issue object
 */
export function createMockIssue(
  id: string,
  options: {
    category?: IssueCategory;
    severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    status?: 'RAISED' | 'CHALLENGED' | 'RESOLVED' | 'DISMISSED' | 'MERGED' | 'SPLIT';
    summary?: string;
    location?: string;
    raisedBy?: 'verifier' | 'critic';
    raisedInRound?: number;
  } = {}
): Issue {
  return {
    id,
    category: options.category || 'CORRECTNESS',
    severity: options.severity || 'MEDIUM',
    status: options.status || 'RAISED',
    summary: options.summary || `Test issue ${id}`,
    location: options.location || 'test.ts:1',
    description: '',
    evidence: '',
    raisedBy: options.raisedBy || 'verifier',
    raisedInRound: options.raisedInRound || 1
  };
}

/**
 * Create a mock Session object
 */
export function createMockSession(
  id: string,
  options: {
    currentRound?: number;
    status?: 'initialized' | 'verifying' | 'converged';
    mode?: 'standard' | 'fast-track' | 'single-pass';
    stableRoundsRequired?: number;
    minRounds?: number;
    issues?: Issue[];
    rounds?: Round[];
    maxRounds?: number;
  } = {}
): Session {
  return {
    id,
    target: '/test',
    requirements: 'Test requirements',
    status: options.status || 'verifying',
    currentRound: options.currentRound || 0,
    maxRounds: options.maxRounds || 10,
    context: {
      target: '/test',
      requirements: 'Test requirements',
      files: new Map()
    },
    issues: options.issues || [],
    rounds: options.rounds || [],
    checkpoints: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    verificationMode: {
      mode: options.mode || 'standard',
      stableRoundsRequired: options.stableRoundsRequired,
      minRounds: options.minRounds
    }
  };
}

/**
 * Generate standard verifier output covering all 5 categories
 */
export function generateVerifierOutput(options: {
  issues?: Array<{ category: IssueCategory; summary: string }>;
  clean?: boolean;
} = {}): string {
  const categories = ['SECURITY', 'CORRECTNESS', 'RELIABILITY', 'MAINTAINABILITY', 'PERFORMANCE'];

  if (options.clean) {
    return categories.map(cat => `### ${cat} ✓\nNo issues found.`).join('\n\n');
  }

  let output = '## Verification Report\n\n';

  for (const category of categories) {
    const categoryIssues = options.issues?.filter(i => i.category === category) || [];
    if (categoryIssues.length > 0) {
      output += `### ${category}\n`;
      categoryIssues.forEach(issue => {
        output += `- ${issue.summary}\n`;
      });
    } else {
      output += `### ${category} ✓\nNo issues found.\n`;
    }
    output += '\n';
  }

  return output;
}

/**
 * Generate standard critic output
 */
export function generateCriticOutput(verdicts: Array<{
  issueId: string;
  verdict: 'VALID' | 'INVALID' | 'PARTIAL';
  reason?: string;
}>): string {
  let output = '## Critic Review\n\n';

  for (const v of verdicts) {
    output += `### ${v.issueId}: ${v.verdict}\n`;
    if (v.reason) {
      output += `${v.reason}\n`;
    }
    output += '\n';
  }

  return output;
}

/**
 * Wait for a specified duration (useful for async tests)
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
