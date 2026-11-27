import { Hono, type Context } from 'hono';
import { hashSessionToken } from '../../core/auth/crypto';
import {
  isNonAccessToken,
  type AuthenticatedSession,
  type SessionVerifier,
} from '../../core/auth/middleware';
import type { SyncRepository } from '../sync/repository';
import type { TransactionsRepository } from '../transactions/repository';
import {
  DEFAULT_MCP_PROTOCOL_VERSION,
  handleMcpRpcMessage,
  SUPPORTED_MCP_PROTOCOL_VERSIONS,
  type JsonRpcResponse,
} from './handler';
import { resolvePublicOrigin } from './oauth';

export interface McpRoutesDependencies {
  verifySessionTokenHash: SessionVerifier;
  transactionsRepo: TransactionsRepository;
  syncRepo: SyncRepository;
}

async function authenticateMcpBearer(
  c: Context,
  verifySessionTokenHash: SessionVerifier,
): Promise<AuthenticatedSession | null> {
  const authHeader = c.req.header('authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  if (!token || isNonAccessToken(token)) {
    return null;
  }
  return verifySessionTokenHash(hashSessionToken(token));
}

function unauthorizedMcpResponse(c: Context): Response {
  const origin = resolvePublicOrigin(c);
  c.header(
    'WWW-Authenticate',
    `Bearer realm="budget-tracker", resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
  );
  return c.json(
    {
      error: 'unauthorized',
      error_description: 'Valid OAuth Bearer access token is required.',
    },
    401,
  );
}

export function createMcpRoutes(deps: McpRoutesDependencies) {
  return new Hono()
    .get('/mcp', async (c) => {
      const session = await authenticateMcpBearer(c, deps.verifySessionTokenHash);
      if (!session) {
        return unauthorizedMcpResponse(c);
      }
      c.header('Allow', 'POST, DELETE, OPTIONS');
      return c.json(
        {
          error: 'method_not_allowed',
          message:
            'This stateless MCP endpoint handles JSON-RPC over POST /mcp; SSE GET streams are not used.',
        },
        405,
      );
    })
    .delete('/mcp', async (c) => {
      const session = await authenticateMcpBearer(c, deps.verifySessionTokenHash);
      if (!session) {
        return unauthorizedMcpResponse(c);
      }
      return c.body(null, 204);
    })
    .post('/mcp', async (c) => {
      const session = await authenticateMcpBearer(c, deps.verifySessionTokenHash);
      if (!session) {
        return unauthorizedMcpResponse(c);
      }

      let rawBody: unknown;
      try {
        rawBody = await c.req.json();
      } catch {
        return c.json(
          {
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32700,
              message: 'Parse error: request body must be valid JSON.',
            },
          },
          400,
        );
      }

      const requestedHeaderVersion = c.req.header('mcp-protocol-version')?.trim();
      const headerProtocolVersion =
        requestedHeaderVersion &&
        (SUPPORTED_MCP_PROTOCOL_VERSIONS as readonly string[]).includes(
          requestedHeaderVersion,
        )
          ? requestedHeaderVersion
          : DEFAULT_MCP_PROTOCOL_VERSION;
      c.header('MCP-Protocol-Version', headerProtocolVersion);

      const toolDeps = {
        userId: session.user.id,
        transactionsRepo: deps.transactionsRepo,
        syncRepo: deps.syncRepo,
      };

      if (Array.isArray(rawBody)) {
        if (rawBody.length === 0) {
          return c.json(
            {
              jsonrpc: '2.0',
              id: null,
              error: {
                code: -32600,
                message: 'Invalid Request: batch array must not be empty.',
              },
            },
            400,
          );
        }
        const responses: JsonRpcResponse[] = [];
        for (const entry of rawBody) {
          const res = await handleMcpRpcMessage(entry, toolDeps);
          if (res !== null) {
            responses.push(res);
          }
        }
        if (responses.length === 0) {
          return c.body(null, 202);
        }
        return c.json(responses, 200);
      }

      const response = await handleMcpRpcMessage(rawBody, toolDeps);
      if (response === null) {
        return c.body(null, 202);
      }
      return c.json(response, 200);
    });
}
