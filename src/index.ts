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
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import { tools } from './tools/index.js';
import { listSessions, getSession } from './state/session.js';
import { generatePromptContent } from './prompts/index.js';
import { APP_CONSTANTS } from './config/constants.js';

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
      resources: {},
      prompts: {}
    }
  }
);

// =============================================================================
// Tool Handlers
// =============================================================================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: Object.entries(tools).map(([name, tool]) => ({
      name,
      description: tool.description,
      inputSchema: {
        type: 'object' as const,
        properties: Object.fromEntries(
          Object.entries(tool.schema.shape).map(([key, value]) => [
            key,
            {
              type: getZodType(value as ZodSchemaLike),
              description: getZodDescription(value as ZodSchemaLike)
            }
          ])
        ),
        required: Object.keys(tool.schema.shape).filter(
          key => !isZodOptional((tool.schema.shape as Record<string, ZodSchemaLike>)[key])
        )
      }
    }))
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
    }))
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  // Parse URI
  const match = uri.match(/^elenchus:\/\/sessions\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid resource URI: ${uri}`);
  }

  const sessionId = match[1];
  const session = await getSession(sessionId);

  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  // Convert Map to object for serialization
  const serializable = {
    ...session,
    context: {
      ...session.context,
      files: Object.fromEntries(session.context.files)
    }
  };

  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(serializable, null, 2)
      }
    ]
  };
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
// Helpers - Zod Schema Introspection
// =============================================================================

/**
 * Zod schema internal definition type (for introspection)
 * Note: This accesses Zod internals which may change between versions
 * [FIX: CORR-02] Extended to support nested objects and arrays
 */
interface ZodSchemaDef {
  typeName?: string;
  description?: string;
  innerType?: { _def?: ZodSchemaDef };
  type?: { _def?: ZodSchemaDef };  // For ZodArray items
  shape?: () => Record<string, ZodSchemaLike>;  // For ZodObject properties
  values?: ZodSchemaLike[];  // For ZodEnum values
}

interface ZodSchemaLike {
  _def?: ZodSchemaDef;
  isOptional?: () => boolean;
  shape?: Record<string, ZodSchemaLike>;  // Direct shape access for objects
}

/**
 * Convert Zod schema to JSON Schema representation
 * [FIX: CORR-02] Now properly handles nested objects, arrays with item types, and enums
 */
function zodToJsonSchema(schema: ZodSchemaLike): Record<string, unknown> {
  const typeName = schema._def?.typeName;

  switch (typeName) {
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodArray': {
      const itemSchema = schema._def?.type;
      return {
        type: 'array',
        items: itemSchema ? zodToJsonSchema(itemSchema) : {}
      };
    }
    case 'ZodObject': {
      const shape = schema.shape ?? (schema._def?.shape?.() as Record<string, ZodSchemaLike> | undefined);
      if (shape) {
        return {
          type: 'object',
          properties: Object.fromEntries(
            Object.entries(shape).map(([key, value]) => [
              key,
              {
                ...zodToJsonSchema(value),
                description: getZodDescription(value)
              }
            ])
          )
        };
      }
      return { type: 'object' };
    }
    case 'ZodEnum':
      return { type: 'string' };
    case 'ZodOptional':
    case 'ZodDefault':
      return zodToJsonSchema(schema._def?.innerType ?? {});
    default:
      return { type: 'string' };
  }
}

/**
 * Extract JSON Schema type from Zod schema (simplified for top-level)
 */
function getZodType(schema: ZodSchemaLike): string {
  const jsonSchema = zodToJsonSchema(schema);
  return (jsonSchema.type as string) ?? 'string';
}

/**
 * Extract description from Zod schema
 */
function getZodDescription(schema: ZodSchemaLike): string {
  return schema._def?.description ?? '';
}

/**
 * Check if Zod schema field is optional
 */
function isZodOptional(schema: ZodSchemaLike): boolean {
  return schema._def?.typeName === 'ZodOptional' ||
         schema._def?.typeName === 'ZodDefault' ||
         (typeof schema.isOptional === 'function' && schema.isOptional());
}

// =============================================================================
// Main
// =============================================================================

/**
 * Graceful shutdown handler
 * [FIX: REL-02] Properly cleanup before exit
 */
async function gracefulShutdown(signal: string): Promise<void> {
  console.error(`\n[Elenchus] Received ${signal}, shutting down gracefully...`);

  try {
    // Close the server connection
    await server.close();
    console.error('[Elenchus] Server closed successfully');
  } catch (error) {
    console.error('[Elenchus] Error during shutdown:', error);
  }

  process.exit(0);
}

async function main() {
  const transport = new StdioServerTransport();

  // [FIX: REL-02] Register shutdown handlers
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  await server.connect(transport);

  console.error('Elenchus MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  // [FIX: REL-02] Give a moment for error logging before exit
  setTimeout(() => process.exit(1), APP_CONSTANTS.SHUTDOWN_TIMEOUT_MS);
});
