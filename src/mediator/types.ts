/**
 * Mediator Types - Code relationship analysis and mediation logic
 */

// =============================================================================
// Dependency Graph Types
// =============================================================================

export interface DependencyNode {
  path: string;
  imports: ImportInfo[];
  exports: ExportInfo[];
  functions: FunctionInfo[];
  classes: ClassInfo[];
}

export interface ImportInfo {
  source: string;           // import from 'source'
  specifiers: string[];     // { a, b, c }
  isDefault: boolean;
  isDynamic: boolean;       // dynamic import()
  line: number;
}

export interface ExportInfo {
  name: string;
  isDefault: boolean;
  type: 'function' | 'class' | 'variable' | 'type' | 're-export';
  line: number;
}

export interface FunctionInfo {
  name: string;
  line: number;
  endLine: number;
  calls: string[];          // Other functions called
  isAsync: boolean;
  isExported: boolean;
  parameters: string[];
}

export interface ClassInfo {
  name: string;
  line: number;
  endLine: number;
  methods: string[];
  extends?: string;
  implements?: string[];
  isExported: boolean;
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  edges: DependencyEdge[];
  reverseEdges: Map<string, string[]>;  // path -> files that import this
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: 'import' | 'dynamic-import' | 'type-import';
  specifiers: string[];
}

// =============================================================================
// Coverage Tracking Types
// =============================================================================

export interface VerificationCoverage {
  totalFiles: number;
  verifiedFiles: Set<string>;
  partiallyVerified: Map<string, CoverageDetail>;
  unverifiedCritical: string[];   // Critical files not yet verified
}

export interface CoverageDetail {
  path: string;
  functionsTotal: number;
  functionsVerified: string[];
  linesTotal: number;
  linesMentioned: number[];       // Lines mentioned in verification output
  lastVerifiedRound: number;
}

// =============================================================================
// Active Intervention Types
// =============================================================================

export type ActiveInterventionType =
  | 'MISSED_DEPENDENCY'      // Related code not reviewed
  | 'INCOMPLETE_COVERAGE'    // Critical section not verified
  | 'SIDE_EFFECT_WARNING'    // Potential side effects
  | 'RIPPLE_EFFECT'          // Change impact scope
  | 'CONTEXT_CORRECTION'     // Verifier misunderstanding
  | 'SCOPE_DRIFT'            // Scope deviation
  | 'CIRCULAR_DEPENDENCY'    // Circular dependency detected
  | 'CRITICAL_PATH_IGNORED'  // Critical path ignored
  | 'QUICK_AGREEMENT';       // [ENH: MED-02] Quick agreement / collusion detected

export interface ActiveIntervention {
  type: ActiveInterventionType;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  reason: string;
  action: string;

  // Specific details
  affectedFiles?: string[];
  missedCode?: MissedCodeInfo[];
  suggestedChecks?: string[];
  relatedIssues?: string[];
}

export interface MissedCodeInfo {
  file: string;
  functions?: string[];
  lines?: number[];
  reason: string;           // Why this code should be reviewed
  importance: 'HIGH' | 'MEDIUM' | 'LOW';
}

// =============================================================================
// Ripple Effect Analysis
// =============================================================================

export interface RippleEffect {
  changedFile: string;
  changedFunction?: string;
  affectedFiles: AffectedFile[];
  depth: number;              // Impact depth (1=direct, 2=indirect...)
  totalAffected: number;
}

export interface AffectedFile {
  path: string;
  depth: number;
  affectedFunctions: string[];
  impactType: 'direct' | 'indirect' | 'type-only';
  reason: string;
}

// =============================================================================
// Mediator State
// =============================================================================

export interface MediatorState {
  sessionId: string;
  graph: DependencyGraph;
  coverage: VerificationCoverage;
  interventions: ActiveIntervention[];
  mentionedLocations: Map<string, Set<number>>;  // file -> mentioned lines
  verifierFocus: string[];      // Files the verifier is focusing on
  ignoredWarnings: string[];    // Ignored warnings
}
