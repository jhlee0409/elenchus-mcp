/**
 * Response Compressor
 * [ENH: TOKEN-OPT] Compresses tool responses to reduce token usage
 */

import {
  CompressionConfig,
  CompressionMode,
  FIELD_ABBREVIATIONS,
  FIELD_EXPANSIONS,
  ENUM_ABBREVIATIONS,
  ENUM_EXPANSIONS,
  DEFAULT_COMPRESSION_CONFIG
} from './types.js';

/**
 * Response compressor for MCP tool responses
 */
export class ResponseCompressor {
  private config: CompressionConfig;

  constructor(config: Partial<CompressionConfig> = {}) {
    this.config = { ...DEFAULT_COMPRESSION_CONFIG, ...config };
  }

  /**
   * Update compression configuration
   */
  updateConfig(config: Partial<CompressionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): CompressionConfig {
    return { ...this.config };
  }

  /**
   * Compress a response object
   */
  compress<T extends object>(response: T): T | object {
    if (!this.config.enabled) {
      return response;
    }

    return this.compressValue(response, 0) as T;
  }

  /**
   * Decompress a compressed response
   */
  decompress<T extends object>(compressed: object): T {
    return this.decompressValue(compressed, 0) as T;
  }

  /**
   * Compress a value recursively
   */
  private compressValue(value: unknown, depth: number): unknown {
    if (value === null || value === undefined) {
      return this.config.omitNullFields ? undefined : value;
    }

    if (Array.isArray(value)) {
      return this.compressArray(value, depth);
    }

    if (typeof value === 'object') {
      return this.compressObject(value as Record<string, unknown>, depth);
    }

    if (typeof value === 'string') {
      return this.compressString(value);
    }

    return value;
  }

  /**
   * Compress an object
   */
  private compressObject(
    obj: Record<string, unknown>,
    depth: number
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      // Skip null/undefined if configured
      if (this.config.omitNullFields && (value === null || value === undefined)) {
        continue;
      }

      // Abbreviate field name
      const compressedKey = this.config.abbreviateFields
        ? (FIELD_ABBREVIATIONS[key] || key)
        : key;

      // Compress value
      let compressedValue = this.compressValue(value, depth + 1);

      // Apply enum abbreviation if applicable
      if (this.config.useShortEnums && typeof value === 'string') {
        compressedValue = this.abbreviateEnum(key, value as string);
      }

      // Skip undefined values
      if (compressedValue !== undefined) {
        result[compressedKey] = compressedValue;
      }
    }

    return result;
  }

  /**
   * Compress an array
   */
  private compressArray(arr: unknown[], depth: number): unknown[] | object {
    // Truncate long arrays in minimal/compact mode
    if (arr.length > this.config.maxArrayItems) {
      if (this.config.useSummaryMode || this.config.mode === 'minimal') {
        return {
          _count: arr.length,
          _sample: arr.slice(0, 3).map(item => this.compressValue(item, depth + 1)),
          _truncated: true
        };
      }

      // Just truncate
      return arr
        .slice(0, this.config.maxArrayItems)
        .map(item => this.compressValue(item, depth + 1));
    }

    return arr.map(item => this.compressValue(item, depth + 1));
  }

  /**
   * Compress a string
   */
  private compressString(str: string): string {
    if (str.length > this.config.maxStringLength) {
      return str.slice(0, this.config.maxStringLength) + '…';
    }
    return str;
  }

  /**
   * Abbreviate enum value
   */
  private abbreviateEnum(fieldName: string, value: string): string {
    // Check if this field has enum abbreviations
    const enumMap = ENUM_ABBREVIATIONS[fieldName];
    if (enumMap && enumMap[value]) {
      return enumMap[value];
    }
    return value;
  }

  /**
   * Decompress a value recursively
   */
  private decompressValue(value: unknown, depth: number): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map(item => this.decompressValue(item, depth + 1));
    }

    if (typeof value === 'object') {
      return this.decompressObject(value as Record<string, unknown>, depth);
    }

    return value;
  }

  /**
   * Decompress an object
   */
  private decompressObject(
    obj: Record<string, unknown>,
    depth: number
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      // Expand abbreviated field name
      const expandedKey = FIELD_EXPANSIONS[key] || key;

      // Decompress value
      let decompressedValue = this.decompressValue(value, depth + 1);

      // Expand enum abbreviation if applicable
      if (typeof value === 'string') {
        decompressedValue = this.expandEnum(expandedKey, value as string);
      }

      result[expandedKey] = decompressedValue;
    }

    return result;
  }

  /**
   * Expand enum abbreviation
   */
  private expandEnum(fieldName: string, value: string): string {
    const enumMap = ENUM_EXPANSIONS[fieldName];
    if (enumMap && enumMap[value]) {
      return enumMap[value];
    }
    return value;
  }

  /**
   * Estimate token savings from compression
   */
  estimateSavings(original: object, compressed: object): {
    originalTokens: number;
    compressedTokens: number;
    savedTokens: number;
    savingsPercent: number;
  } {
    const originalStr = JSON.stringify(original);
    const compressedStr = JSON.stringify(compressed);

    // Rough token estimation (4 chars ≈ 1 token)
    const originalTokens = Math.ceil(originalStr.length / 4);
    const compressedTokens = Math.ceil(compressedStr.length / 4);
    const savedTokens = originalTokens - compressedTokens;
    const savingsPercent = originalTokens > 0
      ? Math.round((savedTokens / originalTokens) * 100)
      : 0;

    return {
      originalTokens,
      compressedTokens,
      savedTokens,
      savingsPercent
    };
  }
}

/**
 * Create a compressor with specified mode
 */
export function createCompressor(mode: CompressionMode): ResponseCompressor {
  const configs: Record<CompressionMode, Partial<CompressionConfig>> = {
    full: {
      enabled: false
    },
    compact: {
      enabled: true,
      mode: 'compact',
      abbreviateFields: true,
      omitNullFields: true,
      useShortEnums: true,
      maxArrayItems: 20,
      maxStringLength: 500,
      useSummaryMode: false
    },
    minimal: {
      enabled: true,
      mode: 'minimal',
      abbreviateFields: true,
      omitNullFields: true,
      useShortEnums: true,
      maxArrayItems: 5,
      maxStringLength: 200,
      useSummaryMode: true
    }
  };

  return new ResponseCompressor(configs[mode]);
}

// Singleton instance for global use
let globalCompressor: ResponseCompressor | null = null;

/**
 * Get or create global compressor
 */
export function getGlobalCompressor(): ResponseCompressor {
  if (!globalCompressor) {
    globalCompressor = new ResponseCompressor();
  }
  return globalCompressor;
}

/**
 * Set global compression mode
 */
export function setGlobalCompressionMode(mode: CompressionMode): void {
  globalCompressor = createCompressor(mode);
}
