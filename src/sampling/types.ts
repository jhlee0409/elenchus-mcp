/**
 * Sampling Types
 *
 * Types for MCP Sampling-based automatic verification loop
 */

import { Issue, IssueCategory, Severity } from '../types/index.js';

// =============================================================================
// Auto Loop Configuration
// =============================================================================

/**
 * Configuration for automatic verification loop
 */
export interface AutoLoopConfig {
  /**
   * Maximum rounds before forcibly stopping
   * @default 10
   */
  maxRounds: number;

  /**
   * Maximum tokens per LLM request
   * @default 4000
   */
  maxTokens: number;

  /**
   * Stop on first CRITICAL issue found
   * @default false
   */
  stopOnCritical: boolean;

  /**
   * Minimum rounds before allowing convergence
   * @default 2
   */
  minRounds: number;

  /**
   * Enable streaming progress updates
   * @default true
   */
  enableProgress: boolean;

  /**
   * Model hint for client (optional - client decides actual model)
   */
  modelHint?: 'fast' | 'balanced' | 'thorough';

  /**
   * Include pre-analysis findings in first prompt
   * @default true
   */
  includePreAnalysis: boolean;

  /**
   * Auto-consolidate issues at end
   * @default true
   */
  autoConsolidate: boolean;
}

export const DEFAULT_AUTO_LOOP_CONFIG: AutoLoopConfig = {
  maxRounds: 10,
  maxTokens: 4000,
  stopOnCritical: false,
  minRounds: 2,
  enableProgress: true,
  modelHint: 'balanced',
  includePreAnalysis: true,
  autoConsolidate: true
};

// =============================================================================
// Auto Loop State
// =============================================================================

/**
 * State of an auto-loop verification session
 */
export interface AutoLoopState {
  sessionId: string;
  status: 'running' | 'converged' | 'stopped' | 'error';
  currentRound: number;
  currentRole: 'verifier' | 'critic';
  rounds: AutoLoopRound[];
  issues: Issue[];
  startTime: number;
  endTime?: number;
  error?: string;
  convergenceReason?: string;
}

/**
 * Single round in auto-loop
 */
export interface AutoLoopRound {
  number: number;
  role: 'verifier' | 'critic';
  prompt: string;
  response: string;
  issuesRaised: string[];
  issuesResolved: string[];
  duration: number;
  tokenUsage?: {
    prompt: number;
    completion: number;
  };
}

// =============================================================================
// Progress Events
// =============================================================================

export type AutoLoopEventType =
  | 'round_start'
  | 'round_complete'
  | 'issue_raised'
  | 'issue_resolved'
  | 'convergence_check'
  | 'error'
  | 'complete';

export interface AutoLoopEvent {
  type: AutoLoopEventType;
  sessionId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

// =============================================================================
// Prompt Generation
// =============================================================================

export interface PromptContext {
  sessionId: string;
  round: number;
  role: 'verifier' | 'critic';
  targetFiles: string[];
  requirements: string;
  previousRounds: Array<{
    role: 'verifier' | 'critic';
    summary: string;
  }>;
  existingIssues: Array<{
    id: string;
    severity: Severity;
    category: IssueCategory;
    summary: string;
    status: string;
  }>;
  preAnalysisFindings?: Array<{
    file: string;
    findings: string[];
  }>;
}

// =============================================================================
// Result Types
// =============================================================================

export interface AutoLoopResult {
  sessionId: string;
  status: 'converged' | 'stopped' | 'error';
  totalRounds: number;
  duration: number;
  issues: {
    total: number;
    critical: number;
    high: number;
    resolved: number;
  };
  convergenceReason?: string;
  error?: string;
  consolidatedPlan?: ConsolidatedPlan;
}

export interface ConsolidatedPlan {
  mustFix: Issue[];
  shouldFix: Issue[];
  couldFix: Issue[];
  wontFix: Issue[];
  totalEffort: string;
}
