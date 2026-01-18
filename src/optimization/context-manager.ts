/**
 * Adaptive Context Manager
 * [ENH: TOKEN-OPT] Manages context size adaptively to optimize token usage
 */

import {
  AdaptiveContextConfig,
  ContextBudgetStatus,
  ContextSizeTier,
  DEFAULT_ADAPTIVE_CONTEXT_CONFIG
} from './types.js';
import { FileContext } from '../types/index.js';

/**
 * Adaptive context manager for token optimization
 */
export class AdaptiveContextManager {
  private config: AdaptiveContextConfig;
  private currentBudget: ContextBudgetStatus;

  constructor(config: Partial<AdaptiveContextConfig> = {}) {
    this.config = { ...DEFAULT_ADAPTIVE_CONTEXT_CONFIG, ...config };
    this.currentBudget = {
      currentTokens: 0,
      maxTokens: this.config.maxContextTokens,
      utilization: 0,
      exceeded: false,
      reductionsApplied: [],
      tokensSaved: 0,
      truncatedFiles: [],
      summarizedFiles: []
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AdaptiveContextConfig>): void {
    this.config = { ...this.config, ...config };
    this.currentBudget.maxTokens = this.config.maxContextTokens;
  }

  /**
   * Get current budget status
   */
  getBudgetStatus(): ContextBudgetStatus {
    return { ...this.currentBudget };
  }

  /**
   * Optimize context to fit within budget
   */
  optimizeContext(
    files: Map<string, FileContext>,
    options: {
      changedFiles?: string[];
      securityFiles?: string[];
      dependencyHubs?: string[];
    } = {}
  ): {
    optimizedFiles: Map<string, FileContext>;
    status: ContextBudgetStatus;
    tier: ContextSizeTier;
  } {
    if (!this.config.enabled) {
      return {
        optimizedFiles: files,
        status: this.currentBudget,
        tier: 'full'
      };
    }

    // Calculate current token usage
    let totalTokens = 0;
    const fileTokens: Map<string, number> = new Map();

    for (const [path, context] of files) {
      const tokens = this.estimateTokens(context.content || '');
      fileTokens.set(path, tokens);
      totalTokens += tokens;
    }

    this.currentBudget.currentTokens = totalTokens;
    this.currentBudget.utilization = totalTokens / this.config.maxContextTokens;

    // If within budget, no optimization needed
    if (totalTokens <= this.config.maxContextTokens * this.config.targetUtilization) {
      return {
        optimizedFiles: files,
        status: this.currentBudget,
        tier: 'full'
      };
    }

    // Apply reduction strategies
    const optimizedFiles = new Map(files);
    let currentTokens = totalTokens;
    const targetTokens = this.config.maxContextTokens * this.config.targetUtilization;

    // Sort strategies by order
    const sortedStrategies = [...this.config.reductionStrategies].sort(
      (a, b) => a.order - b.order
    );

    for (const strategy of sortedStrategies) {
      if (currentTokens <= targetTokens) break;

      const result = this.applyStrategy(
        optimizedFiles,
        fileTokens,
        strategy.action,
        {
          targetReduction: currentTokens - targetTokens,
          changedFiles: options.changedFiles || [],
          securityFiles: options.securityFiles || [],
          dependencyHubs: options.dependencyHubs || []
        }
      );

      currentTokens -= result.tokensSaved;
      this.currentBudget.tokensSaved += result.tokensSaved;
      this.currentBudget.reductionsApplied.push(strategy.name);

      if (result.truncatedFiles) {
        this.currentBudget.truncatedFiles.push(...result.truncatedFiles);
      }
      if (result.summarizedFiles) {
        this.currentBudget.summarizedFiles.push(...result.summarizedFiles);
      }
    }

    this.currentBudget.currentTokens = currentTokens;
    this.currentBudget.utilization = currentTokens / this.config.maxContextTokens;
    this.currentBudget.exceeded = currentTokens > this.config.maxContextTokens;

    // Determine tier based on reductions applied
    const tier = this.determineTier();

    return {
      optimizedFiles,
      status: this.currentBudget,
      tier
    };
  }

  /**
   * Apply a specific reduction strategy
   */
  private applyStrategy(
    files: Map<string, FileContext>,
    fileTokens: Map<string, number>,
    action: string,
    options: {
      targetReduction: number;
      changedFiles: string[];
      securityFiles: string[];
      dependencyHubs: string[];
    }
  ): {
    tokensSaved: number;
    truncatedFiles?: string[];
    summarizedFiles?: string[];
  } {
    let tokensSaved = 0;
    const truncatedFiles: string[] = [];
    const summarizedFiles: string[] = [];

    switch (action) {
      case 'remove_comments': {
        for (const [path, context] of files) {
          if (!context.content) continue;

          const original = context.content;
          const stripped = this.stripComments(original, path);

          if (stripped.length < original.length) {
            const saved = this.estimateTokens(original) - this.estimateTokens(stripped);
            tokensSaved += saved;
            context.content = stripped;
            fileTokens.set(path, this.estimateTokens(stripped));
          }
        }
        break;
      }

      case 'truncate_large_files': {
        // Sort files by size, largest first
        const sorted = [...files.entries()]
          .filter(([path]) => !options.securityFiles.includes(path))
          .filter(([path]) => !options.changedFiles.includes(path))
          .sort((a, b) => (fileTokens.get(b[0]) || 0) - (fileTokens.get(a[0]) || 0));

        for (const [path, context] of sorted) {
          if (tokensSaved >= options.targetReduction) break;
          if (!context.content) continue;

          const currentSize = fileTokens.get(path) || 0;
          if (currentSize > 1000) {
            // Truncate to first 500 tokens worth (~2000 chars)
            const truncated = context.content.slice(0, 2000) +
              '\n\n... [TRUNCATED - file too large for context budget] ...';

            const saved = currentSize - this.estimateTokens(truncated);
            tokensSaved += saved;
            context.content = truncated;
            fileTokens.set(path, this.estimateTokens(truncated));
            truncatedFiles.push(path);
          }
        }
        break;
      }

      case 'summarize_unchanged': {
        // Summarize unchanged files
        for (const [path, context] of files) {
          if (tokensSaved >= options.targetReduction) break;
          if (!context.content) continue;

          // Skip changed, security, and dependency hub files
          if (options.changedFiles.includes(path)) continue;
          if (options.securityFiles.includes(path)) continue;
          if (options.dependencyHubs.includes(path)) continue;

          const currentSize = fileTokens.get(path) || 0;
          if (currentSize > 500) {
            const summary = this.generateFileSummary(context.content, path);
            const saved = currentSize - this.estimateTokens(summary);
            tokensSaved += saved;
            context.content = summary;
            fileTokens.set(path, this.estimateTokens(summary));
            summarizedFiles.push(path);
          }
        }
        break;
      }

      case 'chunk_files': {
        // Extract only key functions/classes
        for (const [path, context] of files) {
          if (tokensSaved >= options.targetReduction) break;
          if (!context.content) continue;

          // Skip priority files
          if (options.changedFiles.includes(path)) continue;
          if (options.securityFiles.includes(path)) continue;

          const currentSize = fileTokens.get(path) || 0;
          if (currentSize > 800) {
            const chunked = this.extractKeySymbols(context.content, path);
            const saved = currentSize - this.estimateTokens(chunked);
            tokensSaved += saved;
            context.content = chunked;
            fileTokens.set(path, this.estimateTokens(chunked));
          }
        }
        break;
      }

      case 'prioritize_changed': {
        // Remove files that aren't changed, security, or hubs
        const toRemove: string[] = [];

        for (const [path] of files) {
          if (options.changedFiles.includes(path)) continue;
          if (options.securityFiles.includes(path)) continue;
          if (options.dependencyHubs.includes(path)) continue;

          toRemove.push(path);
          tokensSaved += fileTokens.get(path) || 0;
        }

        for (const path of toRemove) {
          if (tokensSaved >= options.targetReduction) break;
          files.delete(path);
        }
        break;
      }
    }

    return { tokensSaved, truncatedFiles, summarizedFiles };
  }

  /**
   * Strip comments from code
   */
  private stripComments(content: string, path: string): string {
    const ext = path.split('.').pop()?.toLowerCase() || '';

    switch (ext) {
      case 'ts':
      case 'tsx':
      case 'js':
      case 'jsx':
      case 'java':
      case 'c':
      case 'cpp':
      case 'go':
      case 'rs':
        return content
          .replace(/\/\/.*$/gm, '')
          .replace(/\/\*[\s\S]*?\*\//g, '');

      case 'py':
        return content
          .replace(/#.*$/gm, '')
          .replace(/"""[\s\S]*?"""/g, '')
          .replace(/'''[\s\S]*?'''/g, '');

      default:
        return content;
    }
  }

  /**
   * Generate a summary of a file
   */
  private generateFileSummary(content: string, path: string): string {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    const lines = content.split('\n');
    const summary: string[] = [];

    summary.push(`// File: ${path}`);
    summary.push(`// Lines: ${lines.length}`);
    summary.push('// [SUMMARIZED - full content available on request]');
    summary.push('');

    // Extract imports/exports
    for (const line of lines.slice(0, 20)) {
      if (line.match(/^import|^export|^from|^require|^use/)) {
        summary.push(line);
      }
    }

    // Extract function/class signatures
    const signatures = this.extractSignatures(content, ext);
    if (signatures.length > 0) {
      summary.push('');
      summary.push('// Key symbols:');
      for (const sig of signatures.slice(0, 15)) {
        summary.push(`//   ${sig}`);
      }
    }

    return summary.join('\n');
  }

  /**
   * Extract key symbols from a file
   */
  private extractKeySymbols(content: string, path: string): string {
    const result: string[] = [];

    result.push(`// File: ${path} [CHUNKED]`);
    result.push('');

    // Extract imports
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.match(/^import|^export.*from|^require|^use\s/)) {
        result.push(line);
      }
    }

    result.push('');

    // Extract function bodies for exported functions
    const exportedFunctions = content.matchAll(
      /export\s+(?:async\s+)?function\s+(\w+)[^{]*{/g
    );

    for (const match of exportedFunctions) {
      const funcName = match[1];
      const startIdx = match.index!;

      // Find the end of the function (simple brace counting)
      let braceCount = 0;
      let inFunction = false;
      let endIdx = startIdx;

      for (let i = startIdx; i < content.length; i++) {
        if (content[i] === '{') {
          braceCount++;
          inFunction = true;
        } else if (content[i] === '}') {
          braceCount--;
          if (inFunction && braceCount === 0) {
            endIdx = i + 1;
            break;
          }
        }
      }

      const funcBody = content.slice(startIdx, endIdx);
      // Only include if not too large
      if (funcBody.length < 2000) {
        result.push(funcBody);
        result.push('');
      } else {
        result.push(`// export function ${funcName}(...) { ... } // [TOO LARGE]`);
        result.push('');
      }
    }

    return result.join('\n');
  }

  /**
   * Extract function/class signatures
   */
  private extractSignatures(content: string, ext: string): string[] {
    const signatures: string[] = [];

    switch (ext) {
      case 'ts':
      case 'tsx':
      case 'js':
      case 'jsx':
        // Functions
        const funcs = content.matchAll(
          /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)/g
        );
        for (const m of funcs) signatures.push(`function ${m[1]}()`);

        // Classes
        const classes = content.matchAll(/(?:export\s+)?class\s+(\w+)/g);
        for (const m of classes) signatures.push(`class ${m[1]}`);

        // Interfaces
        const interfaces = content.matchAll(/(?:export\s+)?interface\s+(\w+)/g);
        for (const m of interfaces) signatures.push(`interface ${m[1]}`);
        break;

      case 'py':
        const pyFuncs = content.matchAll(/def\s+(\w+)\s*\([^)]*\)/g);
        for (const m of pyFuncs) signatures.push(`def ${m[1]}()`);

        const pyClasses = content.matchAll(/class\s+(\w+)/g);
        for (const m of pyClasses) signatures.push(`class ${m[1]}`);
        break;
    }

    return signatures;
  }

  /**
   * Determine context tier based on reductions
   */
  private determineTier(): ContextSizeTier {
    const reductions = this.currentBudget.reductionsApplied;

    if (reductions.length === 0) return 'full';
    if (reductions.length === 1 && reductions[0] === 'remove_comments') return 'extended';
    if (reductions.includes('summarize_unchanged') || reductions.includes('chunk_large_files')) return 'standard';
    return 'minimal';
  }

  /**
   * Estimate tokens for content
   */
  private estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }

  /**
   * Reset budget tracking
   */
  reset(): void {
    this.currentBudget = {
      currentTokens: 0,
      maxTokens: this.config.maxContextTokens,
      utilization: 0,
      exceeded: false,
      reductionsApplied: [],
      tokensSaved: 0,
      truncatedFiles: [],
      summarizedFiles: []
    };
  }
}

// Singleton instance
let globalContextManager: AdaptiveContextManager | null = null;

/**
 * Get or create global context manager
 */
export function getGlobalContextManager(): AdaptiveContextManager {
  if (!globalContextManager) {
    globalContextManager = new AdaptiveContextManager();
  }
  return globalContextManager;
}
