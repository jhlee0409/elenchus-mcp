/**
 * Tests for Safeguards Auto-Activation
 * [ENH: AUTO-SAFEGUARDS] Automatic safeguards when optimizations are enabled
 */

import { describe, it, expect } from 'vitest';
import {
  getEffectiveSafeguardsConfig,
  DEFAULT_PERIODIC_CONFIG,
  DEFAULT_CONFIDENCE_CONFIG,
  DEFAULT_SAMPLING_CONFIG,
  DEFAULT_AUTO_ACTIVATION_CONFIG,
  SafeguardsAutoActivationConfig
} from '../src/safeguards/types.js';

describe('Safeguards Auto-Activation', () => {
  const baseConfig = {
    periodic: DEFAULT_PERIODIC_CONFIG,
    confidence: DEFAULT_CONFIDENCE_CONFIG,
    sampling: DEFAULT_SAMPLING_CONFIG
  };

  describe('getEffectiveSafeguardsConfig', () => {
    it('should return base config when no optimizations are active', () => {
      const result = getEffectiveSafeguardsConfig(
        baseConfig,
        { differential: false, cache: false, chunking: false, pipeline: false }
      );

      expect(result).toEqual(baseConfig);
    });

    it('should force enable safeguards when differential is active', () => {
      const result = getEffectiveSafeguardsConfig(
        { ...baseConfig, sampling: { ...baseConfig.sampling, enabled: false } },
        { differential: true }
      );

      expect(result.sampling.enabled).toBe(true);
      expect(result.periodic.enabled).toBe(true);
    });

    it('should use highest applicable sampling rate when multiple optimizations active', () => {
      const result = getEffectiveSafeguardsConfig(
        baseConfig,
        { differential: true, cache: true, pipeline: true }
      );

      // differential has highest rate (15), so should use that
      expect(result.sampling.rate).toBe(DEFAULT_AUTO_ACTIVATION_CONFIG.differentialSamplingRate);
    });

    it('should use cache sampling rate when only cache is active', () => {
      const result = getEffectiveSafeguardsConfig(
        baseConfig,
        { cache: true }
      );

      expect(result.sampling.rate).toBe(DEFAULT_AUTO_ACTIVATION_CONFIG.cacheSamplingRate);
    });

    it('should use pipeline sampling rate when only pipeline is active', () => {
      const result = getEffectiveSafeguardsConfig(
        baseConfig,
        { pipeline: true }
      );

      expect(result.sampling.rate).toBe(DEFAULT_AUTO_ACTIVATION_CONFIG.pipelineSamplingRate);
    });

    it('should merge alwaysFullPatterns with extended patterns', () => {
      const result = getEffectiveSafeguardsConfig(
        baseConfig,
        { differential: true }
      );

      // Should include both original and extended patterns
      expect(result.periodic.alwaysFullPatterns).toContain('**/auth/**');
      expect(result.periodic.alwaysFullPatterns).toContain('**/security/**');
      expect(result.periodic.alwaysFullPatterns).toContain('**/utils/**');
      expect(result.periodic.alwaysFullPatterns).toContain('**/core/**');
    });

    it('should use lower incremental threshold when optimizations active', () => {
      const result = getEffectiveSafeguardsConfig(
        baseConfig,
        { differential: true }
      );

      // Should use the more aggressive threshold
      expect(result.periodic.incrementalThreshold).toBe(
        Math.min(
          DEFAULT_PERIODIC_CONFIG.incrementalThreshold,
          DEFAULT_AUTO_ACTIVATION_CONFIG.optimizedIncrementalThreshold
        )
      );
    });

    it('should respect autoEnableWithOptimizations = false', () => {
      const customAutoConfig: SafeguardsAutoActivationConfig = {
        ...DEFAULT_AUTO_ACTIVATION_CONFIG,
        autoEnableWithOptimizations: false
      };

      const result = getEffectiveSafeguardsConfig(
        { ...baseConfig, sampling: { ...baseConfig.sampling, enabled: false } },
        { differential: true },
        customAutoConfig
      );

      // Should not force enable since auto-activation is disabled
      expect(result.sampling.enabled).toBe(false);
    });

    it('should preserve base sampling rate if higher than optimization rate', () => {
      const highRateConfig = {
        ...baseConfig,
        sampling: { ...baseConfig.sampling, rate: 50 }
      };

      const result = getEffectiveSafeguardsConfig(
        highRateConfig,
        { pipeline: true } // pipeline rate is 10
      );

      // Should keep the higher base rate
      expect(result.sampling.rate).toBe(50);
    });

    it('should handle chunking optimization', () => {
      const result = getEffectiveSafeguardsConfig(
        baseConfig,
        { chunking: true }
      );

      // Chunking alone uses base rate but still enables safeguards
      expect(result.sampling.enabled).toBe(true);
      expect(result.periodic.enabled).toBe(true);
    });

    it('should deduplicate merged patterns', () => {
      const configWithDuplicates = {
        ...baseConfig,
        periodic: {
          ...baseConfig.periodic,
          alwaysFullPatterns: ['**/auth/**', '**/utils/**'] // utils is in extended too
        }
      };

      const result = getEffectiveSafeguardsConfig(
        configWithDuplicates,
        { differential: true }
      );

      // Count occurrences of **/utils/**
      const utilsCount = result.periodic.alwaysFullPatterns.filter(
        p => p === '**/utils/**'
      ).length;

      expect(utilsCount).toBe(1); // Should be deduplicated
    });
  });

  describe('Default Configuration Values', () => {
    it('should have sensible default auto-activation config', () => {
      expect(DEFAULT_AUTO_ACTIVATION_CONFIG.autoEnableWithOptimizations).toBe(true);
      expect(DEFAULT_AUTO_ACTIVATION_CONFIG.differentialSamplingRate).toBeGreaterThan(
        DEFAULT_AUTO_ACTIVATION_CONFIG.cacheSamplingRate
      );
      expect(DEFAULT_AUTO_ACTIVATION_CONFIG.cacheSamplingRate).toBeGreaterThanOrEqual(
        DEFAULT_AUTO_ACTIVATION_CONFIG.pipelineSamplingRate
      );
    });

    it('should include critical directories in extended patterns', () => {
      const criticalDirs = ['utils', 'helpers', 'common', 'shared', 'core'];

      for (const dir of criticalDirs) {
        const hasPattern = DEFAULT_AUTO_ACTIVATION_CONFIG.extendedAlwaysFullPatterns.some(
          p => p.includes(dir)
        );
        expect(hasPattern).toBe(true);
      }
    });
  });
});
