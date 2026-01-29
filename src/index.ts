#!/usr/bin/env node

/**
 * Elenchus MCP Server
 *
 * MCP server for the Elenchus verification system.
 * Provides state management, context sharing, and orchestration
 * for adversarial verification loops.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
  SetLevelRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import { tools } from './tools/index.js';
import { listSessions, getSession } from './state/session.js';
import { generatePromptContent } from './prompts/index.js';
import { APP_CONSTANTS } from './config/constants.js';
import { initTreeSitter } from './mediator/languages/index.js';

// MCP Protocol Extensions
import {
  initializeMCP,
  mcpLogger,
  mcpSubscriptions,
  capabilityManager,
  LOGGER_CATEGORIES,
  type LogLevel
} from './mcp/index.js';

// zod-to-json-schema for proper JSON Schema generation
import { zodToJsonSchema as zodToJsonSchemaLib } from 'zod-to-json-schema';

// =============================================================================
// Server Setup
// =============================================================================

const server = new Server(
  {
    name: APP_CONSTANTS.NAME,
    version: APP_CONSTANTS.VERSION
  },
  {
    capabilities: {
      tools: {},
      resources: {
        subscribe: true,
        listChanged: true
      },
      prompts: {},
      logging: {}
    }
  }
);

// =============================================================================
// Tool Handlers
// =============================================================================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: Object.entries(tools).map(([name, tool]) => {
      // Use zod-to-json-schema for proper JSON Schema generation
      const jsonSchema = zodToJsonSchemaLib(tool.schema, {
        $refStrategy: 'none',
        target: 'jsonSchema7'
      });

      // Remove $schema property as MCP doesn't expect it
      const { $schema, ...inputSchema } = jsonSchema as Record<string, unknown>;

      return {
        name,
        description: tool.description,
        inputSchema
      };
    })
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const tool = tools[name as keyof typeof tools];
  if (!tool) {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true
    };
  }

  try {
    const parsed = tool.schema.parse(args);
    const result = await tool.handler(parsed as any);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  } catch (error) {
    // [FIX: REL-01] Distinguish between validation and execution errors
    const isValidationError = error instanceof Error &&
      error.name === 'ZodError';

    const errorType = isValidationError ? 'Validation Error' : 'Execution Error';
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      content: [
        {
          type: 'text',
          text: `${errorType}: ${errorMessage}`
        }
      ],
      isError: true
    };
  }
});

// =============================================================================
// Resource Handlers (Session Data)
// =============================================================================

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const sessionIds = await listSessions();

  return {
    resources: sessionIds.map(id => ({
      uri: `elenchus://sessions/${id}`,
      name: `Session: ${id}`,
      mimeType: 'application/json',
      description: `Elenchus verification session ${id}`
    })),
    resourceTemplates: [
      {
        uriTemplate: 'elenchus://sessions/{sessionId}/issues',
        name: 'Session Issues',
        mimeType: 'application/json',
        description: 'All issues in a verification session'
      },
      {
        uriTemplate: 'elenchus://sessions/{sessionId}/issues/{issueId}',
        name: 'Single Issue',
        mimeType: 'application/json',
        description: 'A specific issue by ID'
      },
      {
        uriTemplate: 'elenchus://sessions/{sessionId}/rounds',
        name: 'Session Rounds',
        mimeType: 'application/json',
        description: 'All rounds in a verification session'
      },
      {
        uriTemplate: 'elenchus://sessions/{sessionId}/rounds/{roundNumber}',
        name: 'Single Round',
        mimeType: 'application/json',
        description: 'A specific round by number'
      },
      {
        uriTemplate: 'elenchus://sessions/{sessionId}/convergence',
        name: 'Convergence Status',
        mimeType: 'application/json',
        description: 'Current convergence status for a session'
      }
    ]
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  // Resource URI pattern handlers
  const patterns: Array<{
    regex: RegExp;
    handler: (matches: string[]) => Promise<unknown>;
  }> = [
    // Single issue: elenchus://sessions/{sessionId}/issues/{issueId}
    {
      regex: /^elenchus:\/\/sessions\/([^/]+)\/issues\/([^/]+)$/,
      handler: async ([sessionId, issueId]) => {
        const session = await getSession(sessionId);
        if (!session) throw new Error(`Session not found: ${sessionId}`);
        const issue = session.issues.find(i => i.id === issueId);
        if (!issue) throw new Error(`Issue not found: ${issueId}`);
        return issue;
      }
    },
    // All issues: elenchus://sessions/{sessionId}/issues
    {
      regex: /^elenchus:\/\/sessions\/([^/]+)\/issues$/,
      handler: async ([sessionId]) => {
        const session = await getSession(sessionId);
        if (!session) throw new Error(`Session not found: ${sessionId}`);
        return {
          sessionId,
          totalCount: session.issues.length,
          issues: session.issues
        };
      }
    },
    // Single round: elenchus://sessions/{sessionId}/rounds/{roundNumber}
    {
      regex: /^elenchus:\/\/sessions\/([^/]+)\/rounds\/(\d+)$/,
      handler: async ([sessionId, roundStr]) => {
        const session = await getSession(sessionId);
        if (!session) throw new Error(`Session not found: ${sessionId}`);
        const roundNumber = parseInt(roundStr, 10);
        const round = session.rounds.find(r => r.number === roundNumber);
        if (!round) throw new Error(`Round not found: ${roundNumber}`);
        return round;
      }
    },
    // All rounds: elenchus://sessions/{sessionId}/rounds
    {
      regex: /^elenchus:\/\/sessions\/([^/]+)\/rounds$/,
      handler: async ([sessionId]) => {
        const session = await getSession(sessionId);
        if (!session) throw new Error(`Session not found: ${sessionId}`);
        return {
          sessionId,
          totalCount: session.rounds.length,
          currentRound: session.currentRound,
          rounds: session.rounds
        };
      }
    },
    // Convergence: elenchus://sessions/{sessionId}/convergence
    {
      regex: /^elenchus:\/\/sessions\/([^/]+)\/convergence$/,
      handler: async ([sessionId]) => {
        const session = await getSession(sessionId);
        if (!session) throw new Error(`Session not found: ${sessionId}`);
        return {
          sessionId,
          status: session.status,
          isConverged: session.status === 'converged',
          currentRound: session.currentRound,
          maxRounds: session.maxRounds,
          issueStats: {
            total: session.issues.length,
            byStatus: session.issues.reduce((acc, issue) => {
              acc[issue.status] = (acc[issue.status] || 0) + 1;
              return acc;
            }, {} as Record<string, number>),
            bySeverity: session.issues.reduce((acc, issue) => {
              acc[issue.severity] = (acc[issue.severity] || 0) + 1;
              return acc;
            }, {} as Record<string, number>)
          },
          llmEvalResults: session.llmEvalResults
        };
      }
    },
    // Full session: elenchus://sessions/{sessionId}
    {
      regex: /^elenchus:\/\/sessions\/([^/]+)$/,
      handler: async ([sessionId]) => {
        const session = await getSession(sessionId);
        if (!session) throw new Error(`Session not found: ${sessionId}`);
        // Convert Map to object for serialization
        return {
          ...session,
          context: {
            ...session.context,
            files: Object.fromEntries(session.context.files)
          }
        };
      }
    }
  ];

  // Try each pattern
  for (const { regex, handler } of patterns) {
    const match = uri.match(regex);
    if (match) {
      const data = await handler(match.slice(1));
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(data, null, 2)
          }
        ]
      };
    }
  }

  throw new Error(`Invalid resource URI: ${uri}`);
});

// =============================================================================
// Prompt Handlers (Slash Commands)
// =============================================================================

/**
 * Prompt definitions for MCP slash commands
 * Clients may expose these as: /mcp__elenchus__[name] or similar patterns
 */
const prompts = {
  verify: {
    name: 'verify',
    description: 'Run adversarial verification on target code with Verifier↔Critic loop',
    arguments: [
      {
        name: 'target',
        description: 'Target path to verify (file or directory)',
        required: true
      },
      {
        name: 'requirements',
        description: 'Verification requirements or focus areas',
        required: false
      }
    ]
  },
  consolidate: {
    name: 'consolidate',
    description: 'Consolidate verification results into prioritized fix plan',
    arguments: [
      {
        name: 'sessionId',
        description: 'Session ID from previous verify (optional - uses latest if not provided)',
        required: false
      }
    ]
  },
  apply: {
    name: 'apply',
    description: 'Apply consolidated fixes to codebase with verification',
    arguments: [
      {
        name: 'scope',
        description: 'Scope of fixes to apply: must_fix, should_fix, all',
        required: false
      }
    ]
  },
  complete: {
    name: 'complete',
    description: 'Run complete pipeline: VERIFY → CONSOLIDATE → APPLY → RE-VERIFY until zero issues',
    arguments: [
      {
        name: 'target',
        description: 'Target path to verify and fix',
        required: true
      },
      {
        name: 'maxCycles',
        description: 'Maximum cycles before stopping (default: 5)',
        required: false
      }
    ]
  },
  'cross-verify': {
    name: 'cross-verify',
    description: 'Adversarial cross-verification loop for thorough validation',
    arguments: [
      {
        name: 'target',
        description: 'Target to verify',
        required: true
      },
      {
        name: 'question',
        description: 'Specific question or aspect to verify',
        required: false
      }
    ]
  }
};

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: Object.values(prompts).map(p => ({
      name: p.name,
      description: p.description,
      arguments: p.arguments
    }))
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const prompt = prompts[name as keyof typeof prompts];
  if (!prompt) {
    throw new Error(`Unknown prompt: ${name}`);
  }

  // Generate prompt content based on name
  const content = generatePromptContent(name, args || {});

  return {
    description: prompt.description,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: content
        }
      }
    ]
  };
});

// =============================================================================
// Subscription Handlers
// =============================================================================

server.setRequestHandler(SubscribeRequestSchema, async (request) => {
  const { uri } = request.params;
  mcpSubscriptions.subscribe(uri);
  await mcpLogger.debug(`Subscribed to resource: ${uri}`, undefined, LOGGER_CATEGORIES.SUBSCRIPTION);
  return {};
});

server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
  const { uri } = request.params;
  mcpSubscriptions.unsubscribe(uri);
  await mcpLogger.debug(`Unsubscribed from resource: ${uri}`, undefined, LOGGER_CATEGORIES.SUBSCRIPTION);
  return {};
});

// =============================================================================
// Logging Handler
// =============================================================================

server.setRequestHandler(SetLevelRequestSchema, async (request) => {
  const { level } = request.params;
  mcpLogger.setMinLevel(level as LogLevel);
  await mcpLogger.info(`Log level set to: ${level}`, undefined, LOGGER_CATEGORIES.GENERAL);
  return {};
});

// =============================================================================
// Main
// =============================================================================

/**
 * Graceful shutdown handler
 * [FIX: REL-02] Properly cleanup before exit
 */
async function gracefulShutdown(signal: string): Promise<void> {
  await mcpLogger.info(`Received ${signal}, shutting down gracefully...`, undefined, LOGGER_CATEGORIES.GENERAL);

  try {
    // Clear subscriptions
    mcpSubscriptions.clear();

    // Close the server connection
    await server.close();
    await mcpLogger.info('Server closed successfully', undefined, LOGGER_CATEGORIES.GENERAL);
  } catch (error) {
    await mcpLogger.error('Error during shutdown', { error }, LOGGER_CATEGORIES.GENERAL);
  }

  process.exit(0);
}

async function main() {
  const transport = new StdioServerTransport();

  // [FIX: REL-02] Register shutdown handlers
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  // [ENH: TREE-SITTER] Initialize multi-language support
  try {
    await initTreeSitter();
  } catch (error) {
    // Use console.error before MCP is initialized
    console.error('[Elenchus] Tree-sitter initialization failed, falling back to TypeScript-only:', error);
  }

  // Connect server first
  await server.connect(transport);

  // Initialize MCP modules after connection
  // Note: Client info is available after connection for capability detection
  initializeMCP(server);

  await mcpLogger.info('Elenchus MCP Server running on stdio', {
    version: APP_CONSTANTS.VERSION,
    capabilities: {
      logging: true,
      subscriptions: capabilityManager.supportsSubscriptions,
      sampling: capabilityManager.supportsSampling,
      progress: capabilityManager.supportsProgress
    }
  }, LOGGER_CATEGORIES.GENERAL);
}

main().catch(async (error) => {
  await mcpLogger.emergency('Fatal error', { error }, LOGGER_CATEGORIES.GENERAL);
  // [FIX: REL-02] Give a moment for error logging before exit
  setTimeout(() => process.exit(1), APP_CONSTANTS.SHUTDOWN_TIMEOUT_MS);
});
