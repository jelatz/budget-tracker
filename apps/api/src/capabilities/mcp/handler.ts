import { z } from 'zod';
import { AppError } from '../../core/errors';
import { logError } from '../../core/logger';
import {
  executeMcpTool,
  MCP_TOOL_DEFINITIONS,
  type McpToolDependencies,
} from './tools';

export const SUPPORTED_MCP_PROTOCOL_VERSIONS = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
] as const;

export const DEFAULT_MCP_PROTOCOL_VERSION = '2025-06-18';

export type JsonRpcId = string | number | null;

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

const jsonRpcMessageSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string().min(1),
  params: z.unknown().optional(),
});

const initializeParamsSchema = z
  .object({
    protocolVersion: z.string().optional(),
  })
  .passthrough();

const toolCallParamsSchema = z.object({
  name: z.string().min(1),
  arguments: z.unknown().optional(),
});

function negotiateProtocolVersion(requested?: string): string {
  if (
    requested &&
    (SUPPORTED_MCP_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
  ) {
    return requested;
  }
  return DEFAULT_MCP_PROTOCOL_VERSION;
}

function rpcError(
  id: JsonRpcId,
  code: number,
  message: string,
): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message },
  };
}

export async function handleMcpRpcMessage(
  rawMessage: unknown,
  deps: McpToolDependencies,
): Promise<JsonRpcResponse | null> {
  const parsed = jsonRpcMessageSchema.safeParse(rawMessage);
  if (!parsed.success) {
    const rawId =
      rawMessage &&
      typeof rawMessage === 'object' &&
      'id' in rawMessage &&
      (typeof rawMessage.id === 'string' ||
        typeof rawMessage.id === 'number' ||
        rawMessage.id === null)
        ? rawMessage.id
        : null;
    return rpcError(rawId, -32600, 'Invalid JSON-RPC 2.0 request.');
  }

  const msg = parsed.data;
  const isNotification = msg.id === undefined;
  const id: JsonRpcId = msg.id ?? null;

  if (isNotification) {
    return null;
  }

  try {
    switch (msg.method) {
      case 'initialize': {
        const initParsed = initializeParamsSchema.safeParse(msg.params ?? {});
        const protocolVersion = negotiateProtocolVersion(
          initParsed.success ? initParsed.data.protocolVersion : undefined,
        );
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion,
            capabilities: {
              tools: { listChanged: false },
            },
            serverInfo: {
              name: 'budget-tracker-mcp',
              version: '1.0.0',
            },
            instructions:
              'Budget Tracker MCP server. NEVER guess, invent, or assume missing required fields (type, amount, account, toAccount for TRANSFER, category for EXPENSE/INCOME, or obligation). If the user omits any required field or an account/category/obligation name is ambiguous, call get_budget_context if needed to list valid options and ask the user a brief clarifying question BEFORE calling log_transaction or pay_obligation.',
          },
        };
      }

      case 'ping':
        return {
          jsonrpc: '2.0',
          id,
          result: {},
        };

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: MCP_TOOL_DEFINITIONS,
          },
        };

      case 'tools/call': {
        const callParsed = toolCallParamsSchema.safeParse(msg.params);
        if (!callParsed.success) {
          return rpcError(id, -32602, 'Invalid tools/call parameters.');
        }
        const toolResult = await executeMcpTool(
          callParsed.data.name,
          callParsed.data.arguments,
          deps,
        );
        return {
          jsonrpc: '2.0',
          id,
          result: toolResult,
        };
      }

      case 'resources/list':
        return {
          jsonrpc: '2.0',
          id,
          result: { resources: [] },
        };

      case 'prompts/list':
        return {
          jsonrpc: '2.0',
          id,
          result: { prompts: [] },
        };

      default:
        return rpcError(id, -32601, `Method "${msg.method}" not found.`);
    }
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: error.message }],
          isError: true,
        },
      };
    }

    logError('mcp_rpc_internal_error', {
      method: msg.method,
      error:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : String(error),
    });
    return rpcError(id, -32603, 'Internal server error.');
  }
}
