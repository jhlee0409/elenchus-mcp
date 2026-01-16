/**
 * Elenchus MCP Prompts
 *
 * Full instructions for each command, enabling MCP-only usage
 * without requiring the plugin installation.
 */

import { generateVerifyPrompt } from './verify.js';
import { generateConsolidatePrompt } from './consolidate.js';
import { generateApplyPrompt } from './apply.js';
import { generateCompletePrompt } from './complete.js';
import { generateCrossVerifyPrompt } from './cross-verify.js';

export {
  generateVerifyPrompt,
  generateConsolidatePrompt,
  generateApplyPrompt,
  generateCompletePrompt,
  generateCrossVerifyPrompt
};

/**
 * Generate prompt content for each command
 */
export function generatePromptContent(name: string, args: Record<string, string>): string {
  switch (name) {
    case 'verify':
      return generateVerifyPrompt(args);
    case 'consolidate':
      return generateConsolidatePrompt(args);
    case 'apply':
      return generateApplyPrompt(args);
    case 'complete':
      return generateCompletePrompt(args);
    case 'cross-verify':
      return generateCrossVerifyPrompt(args);
    default:
      return `Unknown command: ${name}`;
  }
}
