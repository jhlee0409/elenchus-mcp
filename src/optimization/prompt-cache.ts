/**
 * Prompt Cache Hints
 * [ENH: TOKEN-OPT] Generates cache hints for Claude API prompt caching
 */

import {
  CacheablePromptSections,
  TokenOptimizationStats
} from './types.js';

/**
 * Prompt cache hint generator for Claude API
 */
export class PromptCacheHintGenerator {
  private static MINIMUM_CACHE_TOKENS = 1024;
  private static CACHE_WRITE_COST_MULTIPLIER = 1.25;
  private static CACHE_READ_COST_MULTIPLIER = 0.10;

  /**
   * Generate cache hints for prompt sections
   */
  generateCacheHints(sections: {
    systemInstructions?: string;
    toolDefinitions?: string;
    fileContext?: string;
    examples?: string;
  }): CacheablePromptSections {
    const result: Partial<CacheablePromptSections> = {};

    // System instructions - highest cache priority
    if (sections.systemInstructions) {
      const tokens = this.estimateTokens(sections.systemInstructions);
      if (tokens >= PromptCacheHintGenerator.MINIMUM_CACHE_TOKENS) {
        result.systemInstructions = {
          content: sections.systemInstructions,
          cacheHint: {
            cacheControl: { type: 'ephemeral' },
            estimatedTokens: tokens,
            category: 'system'
          }
        };
      }
    }

    // Tool definitions - cache across session
    if (sections.toolDefinitions) {
      const tokens = this.estimateTokens(sections.toolDefinitions);
      if (tokens >= PromptCacheHintGenerator.MINIMUM_CACHE_TOKENS) {
        result.toolDefinitions = {
          content: sections.toolDefinitions,
          cacheHint: {
            cacheControl: { type: 'ephemeral' },
            estimatedTokens: tokens,
            category: 'tools'
          }
        };
      }
    }

    // File context - cache within verification session
    if (sections.fileContext) {
      const tokens = this.estimateTokens(sections.fileContext);
      if (tokens >= PromptCacheHintGenerator.MINIMUM_CACHE_TOKENS) {
        result.fileContext = {
          content: sections.fileContext,
          cacheHint: {
            cacheControl: { type: 'ephemeral' },
            estimatedTokens: tokens,
            category: 'context'
          },
          filesIncluded: []
        };
      }
    }

    // Examples - highly cacheable
    if (sections.examples) {
      const tokens = this.estimateTokens(sections.examples);
      if (tokens >= PromptCacheHintGenerator.MINIMUM_CACHE_TOKENS) {
        result.examples = {
          content: sections.examples,
          cacheHint: {
            cacheControl: { type: 'ephemeral' },
            estimatedTokens: tokens,
            category: 'examples'
          }
        };
      }
    }

    return result as CacheablePromptSections;
  }

  /**
   * Format content with cache breakpoint markers
   */
  formatWithCacheBreakpoints(
    sections: CacheablePromptSections
  ): { content: string; totalCacheableTokens: number } {
    const parts: string[] = [];
    let totalCacheableTokens = 0;

    // Order: system → tools → context → examples
    // Each section ends with cache_control marker

    if (sections.systemInstructions) {
      parts.push(sections.systemInstructions.content);
      parts.push('<!-- cache_control: ephemeral -->');
      totalCacheableTokens += sections.systemInstructions.cacheHint.estimatedTokens;
    }

    if (sections.toolDefinitions) {
      parts.push(sections.toolDefinitions.content);
      parts.push('<!-- cache_control: ephemeral -->');
      totalCacheableTokens += sections.toolDefinitions.cacheHint.estimatedTokens;
    }

    if (sections.fileContext) {
      parts.push(sections.fileContext.content);
      parts.push('<!-- cache_control: ephemeral -->');
      totalCacheableTokens += sections.fileContext.cacheHint.estimatedTokens;
    }

    if (sections.examples) {
      parts.push(sections.examples.content);
      parts.push('<!-- cache_control: ephemeral -->');
      totalCacheableTokens += sections.examples.cacheHint.estimatedTokens;
    }

    return {
      content: parts.join('\n'),
      totalCacheableTokens
    };
  }

  /**
   * Calculate potential savings from prompt caching
   */
  calculateCacheSavings(params: {
    totalTokens: number;
    cacheableTokens: number;
    expectedRounds: number;
    cacheHitRate: number;
  }): {
    tokensSavedPerRound: number;
    totalTokensSaved: number;
    costSavingsPercent: number;
    breakEvenRounds: number;
  } {
    const { cacheableTokens, expectedRounds, cacheHitRate } = params;

    // First round: cache write (1.25x cost)
    const firstRoundCost = cacheableTokens * PromptCacheHintGenerator.CACHE_WRITE_COST_MULTIPLIER;

    // Subsequent rounds: cache read (0.1x cost) for hits
    const subsequentRoundCost = (
      cacheableTokens * cacheHitRate * PromptCacheHintGenerator.CACHE_READ_COST_MULTIPLIER +
      cacheableTokens * (1 - cacheHitRate) * 1.0  // Cache miss = full cost
    );

    // Without caching: full cost every round
    const noCacheCost = cacheableTokens * expectedRounds;

    // With caching
    const withCacheCost = firstRoundCost + subsequentRoundCost * (expectedRounds - 1);

    const tokensSaved = noCacheCost - withCacheCost;
    const tokensSavedPerRound = tokensSaved / expectedRounds;
    const costSavingsPercent = (tokensSaved / noCacheCost) * 100;

    // Break-even calculation
    // firstRoundCost + x * subsequentRoundCost = (1 + x) * cacheableTokens
    // Solving for x (rounds after first where we break even)
    const breakEvenRounds = Math.ceil(
      (firstRoundCost - cacheableTokens) /
      (cacheableTokens - subsequentRoundCost)
    ) + 1;

    return {
      tokensSavedPerRound: Math.round(tokensSavedPerRound),
      totalTokensSaved: Math.round(tokensSaved),
      costSavingsPercent: Math.round(costSavingsPercent),
      breakEvenRounds: Math.max(2, breakEvenRounds)
    };
  }

  /**
   * Generate optimization statistics
   */
  generateStats(
    sessionId: string,
    breakdown: {
      compression?: number;
      caching?: number;
      contextReduction?: number;
      promptCaching?: number;
      chunking?: number;
      differential?: number;
    },
    originalTokens: number
  ): TokenOptimizationStats {
    const totalSaved = Object.values(breakdown).reduce((sum, v) => sum + (v || 0), 0);
    const finalTokens = originalTokens - totalSaved;

    // Cost estimation (Claude Sonnet pricing approximation)
    const INPUT_TOKEN_COST = 0.003 / 1000;  // $3 per million
    const estimatedCostSavings = totalSaved * INPUT_TOKEN_COST;

    return {
      sessionId,
      tokensBeforeOptimization: originalTokens,
      tokensAfterOptimization: finalTokens,
      tokensSaved: totalSaved,
      savingsPercent: Math.round((totalSaved / originalTokens) * 100),
      breakdown: {
        compression: breakdown.compression || 0,
        caching: breakdown.caching || 0,
        contextReduction: breakdown.contextReduction || 0,
        promptCaching: breakdown.promptCaching || 0,
        chunking: breakdown.chunking || 0,
        differential: breakdown.differential || 0
      },
      estimatedCostSavings: Math.round(estimatedCostSavings * 10000) / 10000,
      calculatedAt: new Date().toISOString()
    };
  }

  /**
   * Recommend optimal caching strategy
   */
  recommendStrategy(params: {
    sessionType: 'single' | 'multi-round' | 're-verification';
    expectedRounds: number;
    fileCount: number;
    totalFileTokens: number;
    hasStableContext: boolean;
  }): {
    strategy: 'aggressive' | 'moderate' | 'minimal' | 'none';
    recommendations: string[];
    expectedSavings: number;
  } {
    const { sessionType, expectedRounds, totalFileTokens, hasStableContext } = params;

    // Single-pass verification: minimal caching benefit
    if (sessionType === 'single' || expectedRounds <= 1) {
      return {
        strategy: 'none',
        recommendations: [
          'Single-pass verification does not benefit from prompt caching',
          'Consider using response compression instead'
        ],
        expectedSavings: 0
      };
    }

    // Re-verification: moderate caching (context may have changed)
    if (sessionType === 're-verification') {
      return {
        strategy: 'moderate',
        recommendations: [
          'Cache tool definitions and system prompts',
          'Re-validate file context before caching',
          'Use differential analysis to minimize context'
        ],
        expectedSavings: Math.round(totalFileTokens * 0.4)
      };
    }

    // Multi-round with stable context: aggressive caching
    if (hasStableContext && expectedRounds >= 3) {
      return {
        strategy: 'aggressive',
        recommendations: [
          'Cache all static content (system, tools, examples)',
          'Cache file context after first round',
          'Use prompt caching TTL reset on each round',
          `Expected ${expectedRounds} rounds with 90% cache hit rate`
        ],
        expectedSavings: Math.round(totalFileTokens * 0.7 * (expectedRounds - 1))
      };
    }

    // Default: moderate caching
    return {
      strategy: 'moderate',
      recommendations: [
        'Cache system instructions and tool definitions',
        'Consider caching file context if stable',
        'Monitor cache hit rate and adjust'
      ],
      expectedSavings: Math.round(totalFileTokens * 0.3 * (expectedRounds - 1))
    };
  }

  /**
   * Estimate tokens for content
   */
  private estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }
}

// Singleton instance
let globalHintGenerator: PromptCacheHintGenerator | null = null;

/**
 * Get or create global hint generator
 */
export function getGlobalHintGenerator(): PromptCacheHintGenerator {
  if (!globalHintGenerator) {
    globalHintGenerator = new PromptCacheHintGenerator();
  }
  return globalHintGenerator;
}
