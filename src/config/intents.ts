/**
 * Intent-Based Configuration
 *
 * Instead of hardcoded regex patterns, we define INTENTS that describe
 * what we're looking for. This allows:
 * 1. LLM to understand semantically what to detect
 * 2. Users to customize based on their domain
 * 3. Better adaptability across different project types
 */


// ============================================================================
// FILE RISK INTENTS - For sampling and prioritization
// ============================================================================

/**
 * Intent describing a category of files that warrant higher scrutiny
 */
export interface FileRiskIntent {
  id: string;
  name: string;
  /** Natural language description for LLM understanding */
  description: string;
  /** Risk weight (0.0 - 1.0) */
  weight: number;
  /** Whether this intent is enabled by default */
  enabled: boolean;
}

/**
 * Default file risk intents
 * Users can extend or override these based on their domain
 */
export const DEFAULT_FILE_RISK_INTENTS: FileRiskIntent[] = [
  {
    id: 'security-critical',
    name: 'Security-Critical Files',
    description: 'Files handling authentication, authorization, session management, cryptography, encryption, payment processing, secrets/credentials management, or access control',
    weight: 0.3,
    enabled: true,
  },
  {
    id: 'entry-points',
    name: 'Application Entry Points',
    description: 'Main application entry files, server initialization, API route definitions, application bootstrapping, or configuration loading',
    weight: 0.1,
    enabled: true,
  },
  {
    id: 'data-handling',
    name: 'Data Processing Files',
    description: 'Files handling data serialization, database operations, file I/O, external API calls, or user input processing',
    weight: 0.2,
    enabled: true,
  },
  {
    id: 'shared-utilities',
    name: 'Shared Utility Code',
    description: 'Utility functions, helper modules, or shared libraries used across multiple parts of the codebase',
    weight: 0.15,
    enabled: true,
  },
];

// ============================================================================
// ISSUE DETECTION INTENTS - For pre-analysis
// ============================================================================

export type IssueCategory = 'security' | 'correctness' | 'reliability' | 'performance' | 'maintainability';
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Intent describing a type of issue to detect
 */
export interface IssueDetectionIntent {
  id: string;
  category: IssueCategory;
  name: string;
  /**
   * Natural language description of what to look for
   * LLM will use this to identify matching patterns in code
   */
  lookFor: string;
  /**
   * Examples of what matches this intent (for LLM guidance)
   * NOT regex patterns - just illustrative examples
   */
  examples?: string[];
  /** Default severity when this issue is found */
  severity: IssueSeverity;
  /** Whether this intent is enabled by default */
  enabled: boolean;
}

/**
 * Default issue detection intents
 * These describe WHAT to look for, not HOW to find it
 */
export const DEFAULT_ISSUE_DETECTION_INTENTS: IssueDetectionIntent[] = [
  // Security Intents
  {
    id: 'code-injection',
    category: 'security',
    name: 'Code Injection Vulnerabilities',
    lookFor: 'Dynamic code execution that could allow injection attacks, such as eval(), Function constructor, or template-based code generation with untrusted input',
    examples: ['eval(userInput)', 'new Function(data)', 'vm.runInContext(untrusted)'],
    severity: 'critical',
    enabled: true,
  },
  {
    id: 'xss-vulnerability',
    category: 'security',
    name: 'Cross-Site Scripting (XSS)',
    lookFor: 'Unsafe HTML rendering or DOM manipulation that could execute malicious scripts, including innerHTML assignments, dangerouslySetInnerHTML, or document.write with untrusted content',
    examples: ['element.innerHTML = userContent', 'dangerouslySetInnerHTML={{__html: data}}'],
    severity: 'critical',
    enabled: true,
  },
  {
    id: 'sql-injection',
    category: 'security',
    name: 'SQL Injection',
    lookFor: 'SQL queries constructed by concatenating or interpolating user input without proper parameterization',
    examples: ['query = "SELECT * FROM users WHERE id = " + userId', '`DELETE FROM ${table}`'],
    severity: 'critical',
    enabled: true,
  },
  {
    id: 'hardcoded-secrets',
    category: 'security',
    name: 'Hardcoded Secrets',
    lookFor: 'Credentials, API keys, tokens, passwords, or other secrets hardcoded in source code rather than loaded from environment or secure storage',
    examples: ['password = "admin123"', 'API_KEY = "sk-..."', 'const token = "eyJ..."'],
    severity: 'high',
    enabled: true,
  },
  {
    id: 'command-injection',
    category: 'security',
    name: 'Command Injection',
    lookFor: 'Shell command execution with user-controlled input that could allow arbitrary command execution',
    examples: ['exec(`rm -rf ${userPath}`),' , 'spawn(cmd, userArgs)'],
    severity: 'critical',
    enabled: true,
  },

  // Correctness Intents
  {
    id: 'error-suppression',
    category: 'correctness',
    name: 'Error Suppression',
    lookFor: 'Empty catch blocks, ignored promise rejections, or swallowed errors that hide failures',
    examples: ['catch (e) {}', '.catch(() => {})', 'try { ... } catch { }'],
    severity: 'high',
    enabled: true,
  },
  {
    id: 'null-safety',
    category: 'correctness',
    name: 'Null/Undefined Safety Issues',
    lookFor: 'Potential null or undefined dereferences, incorrect nullish checks, or missing optional chaining where needed',
    examples: ['obj.prop without null check', 'x === null || x === undefined (should be x == null)'],
    severity: 'medium',
    enabled: true,
  },
  {
    id: 'async-error-handling',
    category: 'correctness',
    name: 'Async Error Handling',
    lookFor: 'Promises without catch handlers, missing await keywords, or async operations that could fail silently',
    examples: ['promise.then(success) without .catch', 'async function without try-catch'],
    severity: 'medium',
    enabled: true,
  },
  {
    id: 'incomplete-code',
    category: 'correctness',
    name: 'Incomplete Implementation',
    lookFor: 'TODO comments, FIXME markers, placeholder code, or functions that are not fully implemented',
    examples: ['// TODO: implement this', '// FIXME: broken', 'throw new Error("Not implemented")'],
    severity: 'low',
    enabled: true,
  },

  // Reliability Intents
  {
    id: 'race-conditions',
    category: 'reliability',
    name: 'Race Condition Risks',
    lookFor: 'Timing-dependent code that could behave inconsistently, including setTimeout(0), unsynchronized shared state access, or order-dependent async operations',
    examples: ['setTimeout(fn, 0)', 'Promise.all with side effects', 'shared mutable state'],
    severity: 'medium',
    enabled: true,
  },
  {
    id: 'resource-management',
    category: 'reliability',
    name: 'Resource Management Issues',
    lookFor: 'Resources (files, connections, streams) that may not be properly closed or cleaned up, missing finally blocks, or leaked event listeners',
    examples: ['file opened without close', 'addEventListener without removeEventListener'],
    severity: 'medium',
    enabled: true,
  },
  {
    id: 'abrupt-termination',
    category: 'reliability',
    name: 'Abrupt Process Termination',
    lookFor: 'Code that could cause unexpected application termination without proper cleanup',
    examples: ['process.exit()', 'os.Exit()', 'System.exit()'],
    severity: 'medium',
    enabled: true,
  },

  // Performance Intents
  {
    id: 'inefficient-patterns',
    category: 'performance',
    name: 'Inefficient Code Patterns',
    lookFor: 'Obviously inefficient patterns like N+1 queries, repeated expensive operations in loops, or unnecessary data copying',
    examples: ['JSON.parse(JSON.stringify(obj))', 'array.push in tight loop', 'regex compilation in loop'],
    severity: 'low',
    enabled: true,
  },
  {
    id: 'memory-concerns',
    category: 'performance',
    name: 'Memory Efficiency Concerns',
    lookFor: 'Patterns that could lead to excessive memory usage, such as unbounded caches, large array accumulation, or retained references',
    examples: ['unbounded array growth', 'caching without eviction', 'closure over large objects'],
    severity: 'low',
    enabled: true,
  },
];

// ============================================================================
// INTENT CONFIGURATION
// ============================================================================

export interface IntentConfiguration {
  fileRiskIntents: FileRiskIntent[];
  issueDetectionIntents: IssueDetectionIntent[];
}

/**
 * Default intent configuration
 */
export const DEFAULT_INTENT_CONFIGURATION: IntentConfiguration = {
  fileRiskIntents: DEFAULT_FILE_RISK_INTENTS,
  issueDetectionIntents: DEFAULT_ISSUE_DETECTION_INTENTS,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get enabled file risk intents
 */
export function getEnabledFileRiskIntents(config?: IntentConfiguration): FileRiskIntent[] {
  const intents = config?.fileRiskIntents ?? DEFAULT_FILE_RISK_INTENTS;
  return intents.filter(intent => intent.enabled);
}

/**
 * Get enabled issue detection intents by category
 */
export function getEnabledIssueIntentsByCategory(
  category: IssueCategory,
  config?: IntentConfiguration
): IssueDetectionIntent[] {
  const intents = config?.issueDetectionIntents ?? DEFAULT_ISSUE_DETECTION_INTENTS;
  return intents.filter(intent => intent.enabled && intent.category === category);
}

/**
 * Get all enabled issue detection intents
 */
export function getEnabledIssueIntents(config?: IntentConfiguration): IssueDetectionIntent[] {
  const intents = config?.issueDetectionIntents ?? DEFAULT_ISSUE_DETECTION_INTENTS;
  return intents.filter(intent => intent.enabled);
}

/**
 * Generate a prompt section describing what to look for based on intents
 * This can be included in LLM prompts for better guidance
 */
export function generateIssueDetectionPrompt(config?: IntentConfiguration): string {
  const intents = getEnabledIssueIntents(config);

  const byCategory = new Map<IssueCategory, IssueDetectionIntent[]>();
  for (const intent of intents) {
    const list = byCategory.get(intent.category) ?? [];
    list.push(intent);
    byCategory.set(intent.category, list);
  }

  let prompt = '## Issue Detection Guidelines\n\n';
  prompt += 'When analyzing code, look for the following types of issues:\n\n';

  for (const [category, categoryIntents] of byCategory) {
    prompt += `### ${category.charAt(0).toUpperCase() + category.slice(1)} Issues\n\n`;

    for (const intent of categoryIntents) {
      prompt += `**${intent.name}** (${intent.severity})\n`;
      prompt += `${intent.lookFor}\n`;
      if (intent.examples && intent.examples.length > 0) {
        prompt += `Examples: ${intent.examples.slice(0, 2).join(', ')}\n`;
      }
      prompt += '\n';
    }
  }

  return prompt;
}

/**
 * Generate a prompt section describing file risk assessment
 */
export function generateFileRiskPrompt(config?: IntentConfiguration): string {
  const intents = getEnabledFileRiskIntents(config);

  let prompt = '## File Risk Assessment\n\n';
  prompt += 'Consider these factors when assessing file importance for verification:\n\n';

  for (const intent of intents) {
    prompt += `**${intent.name}** (weight: ${intent.weight})\n`;
    prompt += `${intent.description}\n\n`;
  }

  return prompt;
}
