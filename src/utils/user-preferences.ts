/**
 * User Preferences Detection Module
 *
 * Detects user communication style preferences from input text:
 * - Autonomy level (L1-L4)
 * - Verbosity preference
 * - Language (delegated to i18n-prompts.ts)
 */

// ============================================================================
// AUTONOMY LEVELS
// ============================================================================

/**
 * Autonomy levels for agent behavior
 *
 * L1: Confirmation - Ask before each step
 * L2: Suggestion - Propose plan, wait for approval
 * L3: Proceed - Execute autonomously, report progress
 * L4: Delegate - Full autonomy, report only results
 */
export type AutonomyLevel = 1 | 2 | 3 | 4;

export interface AutonomyConfig {
  level: AutonomyLevel;
  escalationThreshold: 'error' | 'warning' | 'never';
  reportFrequency: 'each-step' | 'milestones' | 'completion';
}

export const AUTONOMY_CONFIGS: Record<AutonomyLevel, AutonomyConfig> = {
  1: { level: 1, escalationThreshold: 'warning', reportFrequency: 'each-step' },
  2: { level: 2, escalationThreshold: 'warning', reportFrequency: 'milestones' },
  3: { level: 3, escalationThreshold: 'error', reportFrequency: 'milestones' },
  4: { level: 4, escalationThreshold: 'error', reportFrequency: 'completion' }
};

// ============================================================================
// AUTONOMY DETECTION PATTERNS
// ============================================================================

/**
 * Patterns for detecting autonomy level from user input
 */
const AUTONOMY_PATTERNS: Record<AutonomyLevel, {
  patterns: RegExp[];
  keywords: string[];
}> = {
  // L4: Full delegation - "알아서", "/ultrawork", "전권 위임"
  4: {
    patterns: [
      /\/ultrawork/i,
      /\/sisyphus/i,
      /알아서/,
      /마음대로/,
      /전권/,
      /완전.*자율/,
      /do\s+whatever/i,
      /full\s+autonomy/i,
      /just\s+do\s+it/i,
      /handle\s+it/i
    ],
    keywords: ['ultrawork', 'sisyphus', '알아서', 'autonomy', 'delegate']
  },

  // L3: Proceed autonomously - "진행해", "해줘", "수정해", "ㅇㅇ"
  3: {
    patterns: [
      /진행해/,
      /해\s*줘/,
      /수정해/,
      /고쳐/,
      /바꿔/,
      /만들어/,
      /추가해/,
      /삭제해/,
      /ㅇㅇ/,
      /응\s*$/,
      /네\s*$/,
      /그래\s*$/,
      /좋아\s*$/,
      /proceed/i,
      /go\s+ahead/i,
      /do\s+it/i,
      /fix\s+it/i,
      /make\s+it/i,
      /yes\s*$/i,
      /ok\s*$/i,
      /sure\s*$/i
    ],
    keywords: ['진행', '해줘', '수정', 'proceed', 'fix', 'make', 'yes']
  },

  // L2: Suggest and wait - "어때", "어떨까", "괜찮을까"
  2: {
    patterns: [
      /어때/,
      /어떨까/,
      /괜찮을까/,
      /할까요/,
      /할까\?/,
      /좋을까/,
      /what\s+do\s+you\s+think/i,
      /would\s+you\s+suggest/i,
      /should\s+we/i,
      /how\s+about/i,
      /could\s+you\s+recommend/i
    ],
    keywords: ['어때', '어떨까', 'think', 'suggest', 'recommend']
  },

  // L1: Confirm each step - "?", "확인", "맞나요"
  1: {
    patterns: [
      /확인.*해/,
      /맞나요/,
      /맞아요\?/,
      /정확한가요/,
      /검토.*해/,
      /\?\s*$/,
      /can\s+you\s+confirm/i,
      /is\s+this\s+correct/i,
      /please\s+verify/i,
      /check\s+if/i,
      /am\s+i\s+right/i
    ],
    keywords: ['확인', '맞나요', 'confirm', 'verify', 'correct']
  }
};

/**
 * Detect autonomy level from user input
 * Returns the highest matching level (L4 > L3 > L2 > L1)
 */
export function detectAutonomyLevel(input: string): AutonomyLevel {
  if (!input || input.length === 0) return 2; // Default to L2

  const normalizedInput = input.trim();

  // Check from highest to lowest level
  for (const level of [4, 3, 2, 1] as AutonomyLevel[]) {
    const { patterns } = AUTONOMY_PATTERNS[level];

    for (const pattern of patterns) {
      if (pattern.test(normalizedInput)) {
        return level;
      }
    }
  }

  // Default based on input characteristics
  // Short affirmative responses default to L3
  if (normalizedInput.length < 10 && !/\?/.test(normalizedInput)) {
    return 3;
  }

  // Questions default to L1-L2
  if (/\?/.test(normalizedInput)) {
    return 1;
  }

  return 2; // Default to L2
}

/**
 * Get autonomy config for detected level
 */
export function getAutonomyConfig(input: string): AutonomyConfig {
  const level = detectAutonomyLevel(input);
  return AUTONOMY_CONFIGS[level];
}

// ============================================================================
// VERBOSITY DETECTION
// ============================================================================

export type VerbosityLevel = 'minimal' | 'normal' | 'detailed';

export interface VerbosityConfig {
  level: VerbosityLevel;
  includeExamples: boolean;
  includeExplanations: boolean;
  maxOutputLength: 'short' | 'medium' | 'long';
}

export const VERBOSITY_CONFIGS: Record<VerbosityLevel, VerbosityConfig> = {
  minimal: {
    level: 'minimal',
    includeExamples: false,
    includeExplanations: false,
    maxOutputLength: 'short'
  },
  normal: {
    level: 'normal',
    includeExamples: true,
    includeExplanations: true,
    maxOutputLength: 'medium'
  },
  detailed: {
    level: 'detailed',
    includeExamples: true,
    includeExplanations: true,
    maxOutputLength: 'long'
  }
};

/**
 * Detect verbosity preference from user input
 */
export function detectVerbosity(input: string): VerbosityLevel {
  if (!input || input.length === 0) return 'normal';

  const normalizedInput = input.toLowerCase();

  // Explicit minimal markers
  if (/간단히|짧게|핵심만|요약|brief|short|concise|summary|tl;?dr/i.test(normalizedInput)) {
    return 'minimal';
  }

  // Explicit detailed markers
  if (/자세히|상세|전부|모두|설명.*해|detailed|explain|thorough|comprehensive/i.test(normalizedInput)) {
    return 'detailed';
  }

  // Infer from input length
  // Short inputs typically expect short responses
  if (input.length < 20) {
    return 'minimal';
  }

  if (input.length > 200) {
    return 'detailed';
  }

  return 'normal';
}

/**
 * Get verbosity config for detected level
 */
export function getVerbosityConfig(input: string): VerbosityConfig {
  const level = detectVerbosity(input);
  return VERBOSITY_CONFIGS[level];
}

// ============================================================================
// COMBINED USER PREFERENCES
// ============================================================================

export interface UserPreferences {
  autonomy: AutonomyConfig;
  verbosity: VerbosityConfig;
  detectedFrom: string;
}

/**
 * Detect all user preferences from input
 */
export function detectUserPreferences(input: string): UserPreferences {
  return {
    autonomy: getAutonomyConfig(input),
    verbosity: getVerbosityConfig(input),
    detectedFrom: input.slice(0, 100) // Keep first 100 chars for reference
  };
}

// ============================================================================
// RESPONSE FORMATTING HELPERS
// ============================================================================

/**
 * Format response based on verbosity level
 */
export function formatResponseForVerbosity(
  content: string,
  verbosity: VerbosityLevel
): string {
  if (verbosity === 'minimal') {
    // Strip examples and detailed explanations
    // Keep only essential information
    return content
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/\*\*Example[^*]*\*\*[\s\S]*?(?=\n\n|\n#|$)/gi, '') // Remove examples
      .replace(/\n{3,}/g, '\n\n') // Normalize spacing
      .trim();
  }

  if (verbosity === 'detailed') {
    // Keep everything as-is
    return content;
  }

  // Normal: light cleanup
  return content.trim();
}

/**
 * Get status message format based on autonomy level
 */
export function getStatusMessageFormat(autonomy: AutonomyLevel): {
  prefix: string;
  suffix: string;
  askPermission: boolean;
} {
  switch (autonomy) {
    case 4:
      return { prefix: '', suffix: '', askPermission: false };
    case 3:
      return { prefix: '', suffix: '', askPermission: false };
    case 2:
      return { prefix: '제안: ', suffix: ' (진행할까요?)', askPermission: true };
    case 1:
      return { prefix: '확인 필요: ', suffix: ' (맞으면 진행합니다)', askPermission: true };
  }
}

// ============================================================================
// AUTONOMY LEVEL DESCRIPTIONS
// ============================================================================

export const AUTONOMY_DESCRIPTIONS: Record<AutonomyLevel, {
  name: string;
  koName: string;
  description: string;
  koDescription: string;
}> = {
  1: {
    name: 'Confirmation',
    koName: '확인형',
    description: 'Ask before each step',
    koDescription: '매 단계 확인 요청'
  },
  2: {
    name: 'Suggestion',
    koName: '제안형',
    description: 'Propose plan, wait for approval',
    koDescription: '계획 제시 후 승인 대기'
  },
  3: {
    name: 'Proceed',
    koName: '진행형',
    description: 'Execute autonomously, report progress',
    koDescription: '자율 진행, 진행 상황 보고'
  },
  4: {
    name: 'Delegate',
    koName: '위임형',
    description: 'Full autonomy, report only results',
    koDescription: '전권 위임, 결과만 보고'
  }
};
