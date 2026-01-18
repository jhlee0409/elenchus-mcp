/**
 * Integration Tests for MCP Session Lifecycle
 * [ENH: INTEGRATION] Full session lifecycle testing
 *
 * Tests the complete flow: start → submit rounds → convergence → end
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
// Import from compiled dist for integration tests
import {
  startSession,
  getContext,
  submitRound,
  endSession
} from '../../dist/tools/index.js';
import { deleteSessionFromCache } from '../../dist/state/session.js';
import { deleteMediatorState } from '../../dist/mediator/index.js';
import { deleteRoleState } from '../../dist/roles/index.js';
import { deletePipelineState } from '../../dist/pipeline/index.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Helper type for startSession args to handle optional maxRounds
type StartSessionArgs = Parameters<typeof startSession>[0];

describe('Session Lifecycle Integration', () => {
  let testDir: string;
  let sessionId: string | null = null;

  beforeEach(() => {
    // Create temporary test directory with sample files
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elenchus-test-'));

    // Create sample source files
    fs.writeFileSync(
      path.join(testDir, 'index.ts'),
      `export function main() {
  console.log('Hello');
}

export function add(a: number, b: number): number {
  return a + b;
}
`
    );

    fs.writeFileSync(
      path.join(testDir, 'utils.ts'),
      `export function helper(value: string): string {
  return value.toUpperCase();
}
`
    );
  });

  afterEach(async () => {
    // Clean up session state
    if (sessionId) {
      deleteSessionFromCache(sessionId);
      deleteMediatorState(sessionId);
      deleteRoleState(sessionId);
      deletePipelineState(sessionId);
      sessionId = null;
    }

    // Clean up test directory
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Complete Session Flow', () => {
    it('should complete a full verification session lifecycle', async () => {
      // Phase 1: Start Session
      const startResult = await startSession({
        target: testDir,
        requirements: 'Verify code correctness and security',
        workingDir: testDir
      } as StartSessionArgs);

      expect(startResult).toBeDefined();
      expect(startResult.sessionId).toBeDefined();
      expect(startResult.status).toBe('initialized');
      expect(startResult.context.filesCollected).toBeGreaterThan(0);
      expect(startResult.mediator).toBeDefined();
      expect(startResult.roles).toBeDefined();

      sessionId = startResult.sessionId;

      // Phase 2: Get Context
      const context = await getContext({ sessionId });
      expect(context).toBeDefined();
      expect(context?.sessionId).toBe(sessionId);
      expect(context?.files.length).toBeGreaterThan(0);
      expect(context?.currentRound).toBe(0);

      // Phase 3: Submit Verifier Round
      const verifierOutput = `
## Verification Report

### SECURITY ✓
No security vulnerabilities found in the code.

### CORRECTNESS ✓
- Functions are correctly implemented
- Return types are properly defined

### RELIABILITY ✓
- No unhandled exceptions
- Input validation present

### MAINTAINABILITY ✓
- Code is well-structured
- Functions are appropriately sized

### PERFORMANCE ✓
- No obvious performance issues
- Simple operations only

No issues found in this codebase.
`;

      const round1Result = await submitRound({
        sessionId,
        role: 'verifier',
        output: verifierOutput,
        issuesRaised: []
      });

      expect(round1Result).toBeDefined();
      expect(round1Result?.roundNumber).toBe(1);
      expect(round1Result?.role).toBe('verifier');
      expect(round1Result?.issuesRaised).toBe(0);
      expect(round1Result?.convergence).toBeDefined();

      // Phase 4: Submit Critic Round (if needed)
      if (round1Result?.nextRole === 'critic') {
        const criticOutput = `
## Critic Review

All categories properly reviewed by Verifier.
Coverage assessment: COMPLETE

No issues to challenge. Verification appears thorough.
`;

        const round2Result = await submitRound({
          sessionId,
          role: 'critic',
          output: criticOutput,
          issuesRaised: []
        });

        expect(round2Result).toBeDefined();
        expect(round2Result?.roundNumber).toBe(2);
        expect(round2Result?.role).toBe('critic');
      }

      // Phase 5: End Session
      const endResult = await endSession({
        sessionId,
        verdict: 'PASS'
      });

      expect(endResult).toBeDefined();
      expect(endResult?.sessionId).toBe(sessionId);
      expect(endResult?.verdict).toBe('PASS');
      expect(endResult?.summary).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((endResult?.summary as any).totalRounds).toBeGreaterThan(0);
    });

    it('should handle session with issues and resolution', async () => {
      // Start session
      const startResult = await startSession({
        target: testDir,
        requirements: 'Check for security and correctness issues',
        workingDir: testDir
      } as StartSessionArgs);

      sessionId = startResult.sessionId;

      // Submit verifier round with an issue
      const verifierOutput = `
## Verification Report

### SECURITY
Found potential issue with input validation.

### CORRECTNESS ✓
### RELIABILITY ✓
### MAINTAINABILITY ✓
### PERFORMANCE ✓
`;

      const round1Result = await submitRound({
        sessionId,
        role: 'verifier',
        output: verifierOutput,
        issuesRaised: [
          {
            id: 'SEC-01',
            category: 'SECURITY',
            severity: 'MEDIUM',
            summary: 'Missing input validation',
            location: 'index.ts:5',
            description: 'The add function does not validate input types at runtime',
            evidence: 'function add(a: number, b: number)'
          }
        ]
      });

      expect(round1Result).toBeDefined();
      expect(round1Result?.issuesRaised).toBe(1);

      // Submit critic round challenging the issue
      if (round1Result?.nextRole === 'critic') {
        const criticOutput = `
## Critic Review

### SEC-01: INVALID
TypeScript provides compile-time type checking. Runtime validation is not needed for internal functions.
This is a false positive.
`;

        const round2Result = await submitRound({
          sessionId,
          role: 'critic',
          output: criticOutput,
          issuesRaised: [],
          issuesResolved: ['SEC-01']
        });

        expect(round2Result).toBeDefined();
        expect(round2Result?.issuesResolved).toBe(1);
      }

      // End session
      const endResult = await endSession({
        sessionId,
        verdict: 'PASS'
      });

      expect(endResult).toBeDefined();
      expect(endResult?.verdict).toBe('PASS');
    });
  });

  describe('Fast-Track Mode', () => {
    it('should allow single-round convergence in fast-track mode', async () => {
      const startResult = await startSession({
        target: testDir,
        requirements: 'Quick verification',
        workingDir: testDir,
        verificationMode: {
          mode: 'fast-track',
          stableRoundsRequired: 0,
          minRounds: 1
        }
      } as StartSessionArgs);

      sessionId = startResult.sessionId;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((startResult.verificationMode as any)?.mode).toBe('fast-track');

      // Submit clean verifier round
      const verifierOutput = `
## Fast-Track Verification

SECURITY: ✓ No issues
CORRECTNESS: ✓ No issues
RELIABILITY: ✓ No issues
MAINTAINABILITY: ✓ No issues
PERFORMANCE: ✓ No issues

All categories examined. No issues found.
`;

      const roundResult = await submitRound({
        sessionId,
        role: 'verifier',
        output: verifierOutput,
        issuesRaised: []
      });

      expect(roundResult).toBeDefined();
      // In fast-track mode with no issues, can converge quickly
      expect(roundResult?.convergence).toBeDefined();

      const endResult = await endSession({
        sessionId,
        verdict: 'PASS'
      });

      expect(endResult?.verdict).toBe('PASS');
    });
  });

  describe('Single-Pass Mode', () => {
    it('should complete verification without critic in single-pass mode', async () => {
      const startResult = await startSession({
        target: testDir,
        requirements: 'Single-pass verification',
        workingDir: testDir,
        verificationMode: {
          mode: 'single-pass',
          stableRoundsRequired: 0,
          minRounds: 1
        }
      } as StartSessionArgs);

      sessionId = startResult.sessionId;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((startResult.verificationMode as any)?.mode).toBe('single-pass');

      const verifierOutput = `
## Single-Pass Verification

All 5 categories examined:
- SECURITY: ✓
- CORRECTNESS: ✓
- RELIABILITY: ✓
- MAINTAINABILITY: ✓
- PERFORMANCE: ✓
`;

      const roundResult = await submitRound({
        sessionId,
        role: 'verifier',
        output: verifierOutput,
        issuesRaised: []
      });

      expect(roundResult).toBeDefined();
      // Single-pass should indicate complete after verifier round
      expect(['verifier', 'complete']).toContain(roundResult?.nextRole);

      const endResult = await endSession({
        sessionId,
        verdict: 'PASS'
      });

      expect(endResult?.verdict).toBe('PASS');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((endResult?.summary as any).totalRounds).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Error Handling', () => {
    it('should return null for non-existent session', async () => {
      const context = await getContext({ sessionId: 'non-existent-session-id' });
      expect(context).toBeNull();
    });

    it('should return null when submitting round to non-existent session', async () => {
      const result = await submitRound({
        sessionId: 'non-existent-session-id',
        role: 'verifier',
        output: 'test output'
      });
      expect(result).toBeNull();
    });

    it('should return null when ending non-existent session', async () => {
      const result = await endSession({
        sessionId: 'non-existent-session-id',
        verdict: 'PASS'
      });
      expect(result).toBeNull();
    });
  });

  describe('Context Expansion', () => {
    it('should expand context when new files are referenced', async () => {
      // Create additional file
      fs.writeFileSync(
        path.join(testDir, 'additional.ts'),
        `export function extra() { return 42; }`
      );

      const startResult = await startSession({
        target: path.join(testDir, 'index.ts'), // Start with single file
        requirements: 'Test context expansion',
        workingDir: testDir
      } as StartSessionArgs);

      sessionId = startResult.sessionId;

      // Reference new file in output
      const verifierOutput = `
## Verification Report

Reviewing index.ts...
Also need to check utils.ts and additional.ts for complete coverage.

SECURITY: ✓
CORRECTNESS: ✓
RELIABILITY: ✓
MAINTAINABILITY: ✓
PERFORMANCE: ✓
`;

      const roundResult = await submitRound({
        sessionId,
        role: 'verifier',
        output: verifierOutput,
        issuesRaised: []
      });

      expect(roundResult).toBeDefined();
      // Context may expand if new files are discovered
      if (roundResult?.contextExpanded) {
        expect(roundResult.newFilesDiscovered.length).toBeGreaterThan(0);
      }

      await endSession({ sessionId, verdict: 'PASS' });
    });
  });

  describe('Role Compliance', () => {
    it('should include role compliance information in response', async () => {
      const startResult = await startSession({
        target: testDir,
        requirements: 'Test role compliance',
        workingDir: testDir
      } as StartSessionArgs);

      sessionId = startResult.sessionId;

      const verifierOutput = `
## Verification Report

SECURITY: Checked, no issues
CORRECTNESS: Checked, no issues
RELIABILITY: Checked, no issues
MAINTAINABILITY: Checked, no issues
PERFORMANCE: Checked, no issues
`;

      const roundResult = await submitRound({
        sessionId,
        role: 'verifier',
        output: verifierOutput,
        issuesRaised: []
      });

      expect(roundResult).toBeDefined();
      expect(roundResult?.roleCompliance).toBeDefined();
      expect(roundResult?.roleCompliance?.role).toBe('verifier');
      expect(roundResult?.roleCompliance?.score).toBeDefined();
      expect(roundResult?.roleCompliance?.isCompliant).toBeDefined();

      await endSession({ sessionId, verdict: 'PASS' });
    });
  });
});
