/**
 * Context Management - Layered context with lazy loading
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  FileContext,
  VerificationContext,
  Session
} from '../types/index.js';
import { getSession } from './session.js';

/**
 * Initialize base context for a session
 * Layer 0: Target files + direct dependencies
 */
export async function initializeContext(
  sessionId: string,
  targetPath: string,
  workingDir: string
): Promise<VerificationContext | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  const context = session.context;

  // Resolve target path
  const absoluteTarget = path.isAbsolute(targetPath)
    ? targetPath
    : path.join(workingDir, targetPath);

  // Check if directory or file
  const stat = await fs.stat(absoluteTarget).catch(() => null);
  if (!stat) {
    return context; // Target doesn't exist, return empty context
  }

  if (stat.isDirectory()) {
    // Collect all files in directory
    await collectFilesFromDirectory(absoluteTarget, context, 'base');
  } else {
    // Single file
    await addFileToContext(absoluteTarget, context, 'base');
  }

  return context;
}

/**
 * Expand context with discovered files
 * Layer 1: Files discovered during verification
 */
export async function expandContext(
  sessionId: string,
  filePaths: string[],
  roundNumber: number
): Promise<string[]> {
  const session = await getSession(sessionId);
  if (!session) return [];

  const addedFiles: string[] = [];

  for (const filePath of filePaths) {
    // Skip if already in context
    if (session.context.files.has(filePath)) continue;

    const added = await addFileToContext(
      filePath,
      session.context,
      'discovered',
      roundNumber
    );

    if (added) {
      addedFiles.push(filePath);
    }
  }

  return addedFiles;
}

/**
 * Extract file references from round output
 */
export function extractFileReferences(output: string): string[] {
  const patterns = [
    // file:line format
    /([a-zA-Z0-9_\-./]+\.[a-zA-Z]+):(\d+)/g,
    // Markdown code block with filename
    /```\w*\s+([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)/g,
    // Import statements
    /import\s+.*from\s+['"]([^'"]+)['"]/g,
    /require\(['"]([^'"]+)['"]\)/g,
    // Explicit file mentions
    /(?:file|path|in)\s*[:=]?\s*[`'"]?([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)[`'"]?/gi
  ];

  const files = new Set<string>();

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(output)) !== null) {
      const filePath = match[1];
      // Filter out common non-file matches
      if (isValidFilePath(filePath)) {
        files.add(filePath);
      }
    }
  }

  return Array.from(files);
}

/**
 * Check if round output mentions files not in context
 */
export function findNewFileReferences(
  output: string,
  context: VerificationContext
): string[] {
  const mentioned = extractFileReferences(output);
  const contextFiles = Array.from(context.files.keys());

  return mentioned.filter(f => {
    // Check if file is not in context
    const inContext = contextFiles.some(cf =>
      cf.endsWith(f) || f.endsWith(cf) || cf === f
    );
    return !inContext;
  });
}

/**
 * Get context summary for agent prompt
 */
export function getContextSummary(context: VerificationContext): string {
  const baseFiles = Array.from(context.files.values())
    .filter(f => f.layer === 'base')
    .map(f => f.path);

  const discoveredFiles = Array.from(context.files.values())
    .filter(f => f.layer === 'discovered')
    .map(f => `${f.path} (discovered in round ${f.addedInRound})`);

  return `
## Verification Context

**Target**: ${context.target}
**Requirements**: ${context.requirements}

### Base Files (Layer 0)
${baseFiles.map(f => `- ${f}`).join('\n')}

### Discovered Files (Layer 1)
${discoveredFiles.length > 0
  ? discoveredFiles.map(f => `- ${f}`).join('\n')
  : '(none yet)'}
`.trim();
}

// =============================================================================
// Helper Functions
// =============================================================================

async function collectFilesFromDirectory(
  dirPath: string,
  context: VerificationContext,
  layer: 'base' | 'discovered'
): Promise<void> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      // Skip common non-code directories
      if (['node_modules', '.git', 'dist', 'build', '__pycache__'].includes(entry.name)) {
        continue;
      }
      await collectFilesFromDirectory(fullPath, context, layer);
    } else if (entry.isFile() && isCodeFile(entry.name)) {
      await addFileToContext(fullPath, context, layer);
    }
  }
}

async function addFileToContext(
  filePath: string,
  context: VerificationContext,
  layer: 'base' | 'discovered',
  roundNumber?: number
): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const dependencies = extractImports(content, filePath);

    const fileContext: FileContext = {
      path: filePath,
      content,
      dependencies,
      layer,
      addedInRound: roundNumber
    };

    context.files.set(filePath, fileContext);
    return true;
  } catch (error) {
    // [FIX: REL-01] Log unexpected errors (not ENOENT)
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`[Elenchus] Failed to add file to context: ${filePath}`, error);
    }
    return false;
  }
}

function extractImports(content: string, filePath: string): string[] {
  const imports: string[] = [];
  const ext = path.extname(filePath);
  const dir = path.dirname(filePath);

  // TypeScript/JavaScript imports
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(ext)) {
    const importRegex = /import\s+.*from\s+['"]([^'"]+)['"]/g;
    const requireRegex = /require\(['"]([^'"]+)['"]\)/g;

    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(resolveImportPath(match[1], dir));
    }
    while ((match = requireRegex.exec(content)) !== null) {
      imports.push(resolveImportPath(match[1], dir));
    }
  }

  // Python imports
  if (ext === '.py') {
    const fromImportRegex = /from\s+([a-zA-Z0-9_.]+)\s+import/g;
    const importRegex = /^import\s+([a-zA-Z0-9_.]+)/gm;

    let match;
    while ((match = fromImportRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
  }

  return imports;
}

function resolveImportPath(importPath: string, fromDir: string): string {
  if (importPath.startsWith('.')) {
    return path.resolve(fromDir, importPath);
  }
  return importPath; // Package import
}

function isCodeFile(filename: string): boolean {
  const codeExtensions = [
    '.ts', '.tsx', '.js', '.jsx', '.mjs',
    '.py', '.rb', '.go', '.rs', '.java',
    '.c', '.cpp', '.h', '.hpp',
    '.cs', '.php', '.swift', '.kt'
  ];
  return codeExtensions.some(ext => filename.endsWith(ext));
}

function isValidFilePath(str: string): boolean {
  // Filter out common false positives
  const invalid = [
    'http', 'https', 'mailto',
    'node_modules', 'package.json',
    '.git', '.env'
  ];

  if (invalid.some(i => str.includes(i))) return false;
  if (str.length < 3 || str.length > 200) return false;
  if (!str.includes('.')) return false;

  return true;
}

// =============================================================================
// [ENH: HIGH-01] Evidence Validation
// =============================================================================

export interface EvidenceValidationResult {
  isValid: boolean;
  location: {
    file: string;
    line?: number;
    found: boolean;
    fileExists: boolean;
  };
  evidence: {
    provided: string;
    matchFound: boolean;
    matchScore: number;  // 0-100
    actualContent?: string;
  };
  warnings: string[];
}

/**
 * Validate issue evidence against actual file content
 * [ENH: HIGH-01] Ensure evidence references real code
 */
export async function validateIssueEvidence(
  context: VerificationContext,
  location: string,  // file:line format
  evidence: string
): Promise<EvidenceValidationResult> {
  const warnings: string[] = [];

  // Parse location
  const locationMatch = location.match(/^(.+?):(\d+)$/);
  const filePath = locationMatch ? locationMatch[1] : location;
  const lineNumber = locationMatch ? parseInt(locationMatch[2], 10) : undefined;

  // Find file in context
  let fileContent: string | undefined;
  let fileExists = false;

  for (const [ctxPath, fileCtx] of context.files.entries()) {
    if (ctxPath === filePath || ctxPath.endsWith(filePath) || filePath.endsWith(ctxPath)) {
      fileContent = fileCtx.content;
      fileExists = true;
      break;
    }
  }

  // If not in context, try reading directly
  if (!fileContent) {
    try {
      const fs = await import('fs/promises');
      fileContent = await fs.readFile(filePath, 'utf-8');
      fileExists = true;
    } catch {
      fileExists = false;
    }
  }

  if (!fileExists) {
    return {
      isValid: false,
      location: { file: filePath, line: lineNumber, found: false, fileExists: false },
      evidence: { provided: evidence, matchFound: false, matchScore: 0 },
      warnings: [`File not found: ${filePath}`]
    };
  }

  // Validate line number if provided
  const lines = fileContent!.split('\n');
  if (lineNumber !== undefined) {
    if (lineNumber < 1 || lineNumber > lines.length) {
      warnings.push(`Line ${lineNumber} is out of range (file has ${lines.length} lines)`);
    }
  }

  // Validate evidence content
  const evidenceLines = evidence
    .replace(/```[\w]*\n?/g, '')  // Remove code block markers
    .trim()
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  let matchScore = 0;
  let matchFound = false;
  let actualContent: string | undefined;

  // Check each evidence line against file content
  const normalizedContent = fileContent!.toLowerCase().replace(/\s+/g, ' ');
  let matchedLines = 0;

  for (const evidenceLine of evidenceLines) {
    const normalizedEvidence = evidenceLine.toLowerCase().replace(/\s+/g, ' ');

    // Skip very short lines or common patterns
    if (normalizedEvidence.length < 5) continue;
    if (/^[{}()\[\];,]+$/.test(normalizedEvidence)) continue;

    if (normalizedContent.includes(normalizedEvidence)) {
      matchedLines++;
    }
  }

  // Calculate match score
  const significantLines = evidenceLines.filter(l =>
    l.length >= 5 && !/^[{}()\[\];,]+$/.test(l)
  ).length;

  if (significantLines > 0) {
    matchScore = Math.round((matchedLines / significantLines) * 100);
    matchFound = matchScore >= 50;  // At least 50% of evidence lines must match
  }

  // Get actual content around specified line
  if (lineNumber !== undefined && lineNumber <= lines.length) {
    const startLine = Math.max(0, lineNumber - 3);
    const endLine = Math.min(lines.length, lineNumber + 2);
    actualContent = lines.slice(startLine, endLine).join('\n');
  }

  if (!matchFound && matchScore < 30) {
    warnings.push('Evidence code does not closely match file content');
  }

  return {
    isValid: matchFound && fileExists,
    location: {
      file: filePath,
      line: lineNumber,
      found: lineNumber ? lineNumber <= lines.length : true,
      fileExists
    },
    evidence: {
      provided: evidence,
      matchFound,
      matchScore,
      actualContent
    },
    warnings
  };
}

/**
 * Batch validate multiple issues
 */
export async function validateIssuesEvidence(
  context: VerificationContext,
  issues: Array<{ id: string; location: string; evidence: string }>
): Promise<Map<string, EvidenceValidationResult>> {
  const results = new Map<string, EvidenceValidationResult>();

  for (const issue of issues) {
    const result = await validateIssueEvidence(context, issue.location, issue.evidence);
    results.set(issue.id, result);
  }

  return results;
}

// =============================================================================
// [ENH: ONE-SHOT] Pre-verification Static Analysis
// Lightweight static analysis to catch obvious issues before LLM verification
// =============================================================================

export interface PreAnalysisResult {
  file: string;
  findings: PreAnalysisFinding[];
}

export interface PreAnalysisFinding {
  type: 'security' | 'correctness' | 'reliability' | 'performance';
  pattern: string;
  line: number;
  snippet: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
}

// Common patterns that indicate potential issues
const ANALYSIS_PATTERNS: Array<{
  type: PreAnalysisFinding['type'];
  pattern: RegExp;
  description: string;
  confidence: PreAnalysisFinding['confidence'];
}> = [
  // Security patterns
  { type: 'security', pattern: /eval\s*\(/g, description: 'Potential code injection via eval()', confidence: 'HIGH' },
  { type: 'security', pattern: /innerHTML\s*=/g, description: 'Potential XSS via innerHTML assignment', confidence: 'HIGH' },
  { type: 'security', pattern: /\$\{.*\}\s*(?:WHERE|SELECT|INSERT|UPDATE|DELETE)/gi, description: 'Potential SQL injection (template literal in SQL)', confidence: 'HIGH' },
  { type: 'security', pattern: /password.*=\s*['"][^'"]+['"]/gi, description: 'Hardcoded password detected', confidence: 'HIGH' },
  { type: 'security', pattern: /api[_-]?key.*=\s*['"][^'"]+['"]/gi, description: 'Hardcoded API key detected', confidence: 'HIGH' },
  { type: 'security', pattern: /exec\s*\(/g, description: 'Potential command injection via exec()', confidence: 'MEDIUM' },
  { type: 'security', pattern: /dangerouslySetInnerHTML/g, description: 'React dangerouslySetInnerHTML usage', confidence: 'MEDIUM' },

  // Correctness patterns
  { type: 'correctness', pattern: /===?\s*undefined\s*\|\|\s*===?\s*null/g, description: 'Incorrect null/undefined check (use ?? or !=)', confidence: 'MEDIUM' },
  { type: 'correctness', pattern: /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/g, description: 'Empty catch block (error suppression)', confidence: 'HIGH' },
  { type: 'correctness', pattern: /console\.(log|warn|error)\s*\(/g, description: 'Console statement in production code', confidence: 'LOW' },
  { type: 'correctness', pattern: /TODO|FIXME|HACK|XXX/gi, description: 'TODO/FIXME comment indicates incomplete code', confidence: 'LOW' },
  { type: 'correctness', pattern: /\.then\([^)]*\)\s*$/gm, description: 'Promise without error handling', confidence: 'MEDIUM' },

  // Reliability patterns
  { type: 'reliability', pattern: /setTimeout\s*\([^,]+,\s*0\s*\)/g, description: 'setTimeout with 0 delay (race condition risk)', confidence: 'MEDIUM' },
  { type: 'reliability', pattern: /new\s+Promise\s*\(\s*\(/g, description: 'Promise constructor (consider async/await)', confidence: 'LOW' },
  { type: 'reliability', pattern: /process\.exit\s*\(/g, description: 'process.exit() can cause abrupt termination', confidence: 'MEDIUM' },

  // Performance patterns
  { type: 'performance', pattern: /for\s*\([^)]+\)\s*\{[^}]*\.push\(/gs, description: 'Array.push in loop (consider pre-allocation)', confidence: 'LOW' },
  { type: 'performance', pattern: /JSON\.parse\s*\(\s*JSON\.stringify/g, description: 'JSON clone (consider structuredClone)', confidence: 'LOW' },
  { type: 'performance', pattern: /new\s+RegExp\s*\(/g, description: 'Dynamic RegExp creation (consider literal)', confidence: 'LOW' }
];

/**
 * [ENH: ONE-SHOT] Perform lightweight static analysis on files
 * This runs automatically during context initialization to pre-identify obvious issues
 */
export function analyzeFileForIssues(content: string, filePath: string): PreAnalysisResult {
  const findings: PreAnalysisFinding[] = [];
  const lines = content.split('\n');

  for (const patternDef of ANALYSIS_PATTERNS) {
    const regex = new RegExp(patternDef.pattern.source, patternDef.pattern.flags);
    let match;

    while ((match = regex.exec(content)) !== null) {
      // Find line number
      const beforeMatch = content.substring(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;

      // Get snippet
      const snippet = lines[lineNumber - 1]?.trim() || '';

      // Skip if in comment
      if (isInComment(content, match.index)) continue;

      findings.push({
        type: patternDef.type,
        pattern: patternDef.pattern.source,
        line: lineNumber,
        snippet: snippet.length > 100 ? snippet.substring(0, 100) + '...' : snippet,
        confidence: patternDef.confidence,
        description: patternDef.description
      });
    }
  }

  return { file: filePath, findings };
}

/**
 * Check if position is inside a comment
 */
function isInComment(content: string, position: number): boolean {
  // Check for single-line comment
  const lineStart = content.lastIndexOf('\n', position) + 1;
  const lineBeforePos = content.substring(lineStart, position);
  if (lineBeforePos.includes('//')) return true;

  // Check for multi-line comment
  const beforePos = content.substring(0, position);
  const lastCommentStart = beforePos.lastIndexOf('/*');
  const lastCommentEnd = beforePos.lastIndexOf('*/');
  if (lastCommentStart > lastCommentEnd) return true;

  return false;
}

/**
 * [ENH: ONE-SHOT] Analyze all files in context
 * Returns pre-analysis hints for LLM to focus on
 */
export function analyzeContextForIssues(context: VerificationContext): PreAnalysisResult[] {
  const results: PreAnalysisResult[] = [];

  for (const [filePath, fileCtx] of context.files.entries()) {
    if (!fileCtx.content) continue;

    const result = analyzeFileForIssues(fileCtx.content, filePath);
    if (result.findings.length > 0) {
      results.push(result);
    }
  }

  return results;
}

/**
 * [ENH: ONE-SHOT] Generate pre-analysis summary for LLM prompt
 */
export function generatePreAnalysisSummary(results: PreAnalysisResult[]): string {
  if (results.length === 0) {
    return '**Pre-analysis**: No obvious issues detected by static analysis.';
  }

  const totalFindings = results.reduce((sum, r) => sum + r.findings.length, 0);
  const highConfidence = results.flatMap(r => r.findings).filter(f => f.confidence === 'HIGH');

  let summary = `**Pre-analysis**: ${totalFindings} potential issue(s) detected in ${results.length} file(s).\n\n`;

  if (highConfidence.length > 0) {
    summary += '### High-Confidence Findings (Verify These First)\n';
    for (const finding of highConfidence.slice(0, 5)) {
      const file = results.find(r => r.findings.includes(finding))?.file || 'unknown';
      summary += `- **${finding.type.toUpperCase()}** @ ${file}:${finding.line}: ${finding.description}\n`;
      summary += `  \`${finding.snippet}\`\n`;
    }
    if (highConfidence.length > 5) {
      summary += `  ... and ${highConfidence.length - 5} more high-confidence findings\n`;
    }
  }

  return summary;
}
