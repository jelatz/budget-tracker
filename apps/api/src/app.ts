import type { AppErrorCode } from '@repo/contracts';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { isSecureCookieRequest } from './core/auth/cookie';
import {
  createPgAccountsRepository,
  type AccountsRepository,
} from './capabilities/accounts/repository';
import { createAccountsRoutes } from './capabilities/accounts/routes';
import {
  createPgAuthRepository,
  type AuthRepository,
} from './capabilities/auth/repository';
import { createAuthRoutes } from './capabilities/auth/routes';
import { createHealthRoutes } from './capabilities/health/routes';
import {
  createMcpOAuthRoutes,
  type McpStaticOAuthClient,
} from './capabilities/mcp/oauth';
import { createMcpRoutes } from './capabilities/mcp/routes';
import { createMetaRoutes } from './capabilities/meta/routes';
import {
  createPgSyncRepository,
  type SyncRepository,
} from './capabilities/sync/repository';
import { createSyncRoutes } from './capabilities/sync/routes';
import {
  createPgTransactionsRepository,
  type TransactionsRepository,
} from './capabilities/transactions/repository';
import { createTransactionsRoutes } from './capabilities/transactions/routes';
import { createRequireAuthMiddleware } from './core/auth/middleware';
import { checkDbConnection, getDb } from './core/db/client';
import {
  getMinSupportedVersion,
  isLocalDevOrigin,
  parseAllowedCorsOrigins,
} from './core/env';
import { handleApiError } from './core/errors';
import {
  createRequestLoggerMiddleware,
  type RequestLogVariables,
} from './core/logger';
import { createRateLimitMiddleware } from './core/rate-limit';

export interface AppDependencies {
  authRepo?: AuthRepository;
  syncRepo?: SyncRepository;
  accountsRepo?: AccountsRepository;
  transactionsRepo?: TransactionsRepository;
  checkDb?: () => Promise<boolean>;
  getMinSupportedVersion?: () => string;
  allowDemoEndpoint?: () => boolean;
  allowedOrigins?: readonly string[];
  allowLocalhostCors?: boolean;
  disableRateLimit?: boolean;
  mcpOAuthSecret?: string;
  mcpStaticClient?: McpStaticOAuthClient;
}

export function createApp(deps?: AppDependencies) {
  const allowedOriginSet = new Set(
    (deps?.allowedOrigins ?? parseAllowedCorsOrigins()).map((origin) =>
      origin.trim().replace(/\/+$/, ''),
    ),
  );
  const allowLocalhostCors =
    deps?.allowLocalhostCors ??
    (deps?.allowedOrigins === undefined && process.env.NODE_ENV !== 'production');

  const authRepo: AuthRepository =
    deps?.authRepo ?? {
      findUserByEmail: (email) =>
        createPgAuthRepository(getDb()).findUserByEmail(email),
      createUserWithSessionAndState: (params) =>
        createPgAuthRepository(getDb()).createUserWithSessionAndState(params),
      createSession: (params) =>
        createPgAuthRepository(getDb()).createSession(params),
      verifySessionTokenHash: (tokenHash) =>
        createPgAuthRepository(getDb()).verifySessionTokenHash(tokenHash),
      revokeSession: (sessionId, userId) =>
        createPgAuthRepository(getDb()).revokeSession(sessionId, userId),
    };

  const syncRepo: SyncRepository =
    deps?.syncRepo ?? {
      getUserRevision: (userId) =>
        createPgSyncRepository(getDb()).getUserRevision(userId),
      pullState: (userId) => createPgSyncRepository(getDb()).pullState(userId),
      pushMutations: (params) =>
        createPgSyncRepository(getDb()).pushMutations(params),
    };

  const accountsRepo: AccountsRepository =
    deps?.accountsRepo ?? {
      listAccounts: (userId) =>
        createPgAccountsRepository(getDb()).listAccounts(userId),
      getAccountById: (userId, accountId) =>
        createPgAccountsRepository(getDb()).getAccountById(userId, accountId),
      createAccount: (userId, account) =>
        createPgAccountsRepository(getDb()).createAccount(userId, account),
      updateAccountMetadata: (userId, accountId, patch) =>
        createPgAccountsRepository(getDb()).updateAccountMetadata(
          userId,
          accountId,
          patch,
        ),
      deleteAccountById: (userId, accountId) =>
        createPgAccountsRepository(getDb()).deleteAccountById(
          userId,
          accountId,
        ),
    };

  const transactionsRepo: TransactionsRepository =
    deps?.transactionsRepo ?? {
      listTransactions: (userId, query) =>
        createPgTransactionsRepository(getDb()).listTransactions(userId, query),
      getTransactionById: (userId, transactionId) =>
        createPgTransactionsRepository(getDb()).getTransactionById(
          userId,
          transactionId,
        ),
      createTransaction: (userId, txData) =>
        createPgTransactionsRepository(getDb()).createTransaction(
          userId,
          txData,
        ),
      updateTransaction: (userId, transactionId, nextData) =>
        createPgTransactionsRepository(getDb()).updateTransaction(
          userId,
          transactionId,
          nextData,
        ),
      deleteTransactionById: (userId, transactionId) =>
        createPgTransactionsRepository(getDb()).deleteTransactionById(
          userId,
          transactionId,
        ),
      clearAllTransactions: (userId) =>
        createPgTransactionsRepository(getDb()).clearAllTransactions(userId),
    };

  const requireAuth = createRequireAuthMiddleware((tokenHash) =>
    authRepo.verifySessionTokenHash(tokenHash),
  );

  const bodyTooLargeHandler = (c: {
    get: (key: 'requestId') => unknown;
    json: (data: unknown, status: 413) => Response;
  }) => {
    const rawRequestId: unknown = c.get('requestId');
    const requestId = typeof rawRequestId === 'string' ? rawRequestId : undefined;
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR' satisfies AppErrorCode,
          message: 'Request body exceeds maximum allowed size.',
          ...(requestId ? { requestId } : {}),
        },
      },
      413,
    );
  };

  const largeJsonBodyLimit = bodyLimit({
    maxSize: 1024 * 1024,
    onError: bodyTooLargeHandler,
  });

  const standardJsonBodyLimit = bodyLimit({
    maxSize: 64 * 1024,
    onError: bodyTooLargeHandler,
  });

  const rateLimitDisabled = Boolean(deps?.disableRateLimit);

  const isMcpCorsPath = (path: string): boolean =>
    path.startsWith('/.well-known/') ||
    path === '/oauth/register' ||
    path === '/oauth/token' ||
    path === '/mcp';

  const mcpPermissiveCors = cors({
    origin: '*',
    credentials: false,
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Mcp-Session-Id',
      'MCP-Protocol-Version',
    ],
    exposeHeaders: ['Mcp-Session-Id', 'MCP-Protocol-Version', 'WWW-Authenticate'],
    maxAge: 86400,
  });

  const appCors = cors({
    origin: (origin) => {
      if (!origin) {
        return '';
      }
      const normalized = origin.trim().replace(/\/+$/, '');
      if (
        allowedOriginSet.has(normalized) ||
        (allowLocalhostCors && isLocalDevOrigin(normalized))
      ) {
        return origin;
      }
      return null;
    },
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'X-Requested-With',
    ],
    exposeHeaders: ['X-Request-Id'],
    maxAge: 86400,
  });

  const app = new Hono<{ Variables: RequestLogVariables }>()
    .use('*', createRequestLoggerMiddleware())
    .use('*', async (c, next) => {
      await next();
      c.header('X-Content-Type-Options', 'nosniff');
      c.header('X-Frame-Options', 'DENY');
      c.header('Referrer-Policy', 'no-referrer');
      c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
      if (isSecureCookieRequest(c)) {
        c.header(
          'Strict-Transport-Security',
          'max-age=31536000; includeSubDomains',
        );
      }
    })
    .use('*', async (c, next) => {
      if (isMcpCorsPath(c.req.path)) {
        return mcpPermissiveCors(c, next);
      }
      return appCors(c, next);
    })
    .use('/v1/*', async (c, next) => {
      await next();
      c.header('Cache-Control', 'private, no-store');
      c.header('Pragma', 'no-cache');
    })
    .use(
      '/health',
      createRateLimitMiddleware({
        keyPrefix: 'health-db',
        windowMs: 60_000,
        maxRequests: 30,
        skip: (c) => rateLimitDisabled || c.req.query('check') !== 'db',
      }),
    )
    .use(
      '/v1/auth/*',
      createRateLimitMiddleware({
        keyPrefix: 'auth',
        windowMs: 15 * 60_000,
        maxRequests: 20,
        skip: () => rateLimitDisabled,
      }),
    )
    .use(
      '/oauth/*',
      createRateLimitMiddleware({
        keyPrefix: 'mcp-oauth',
        windowMs: 15 * 60_000,
        maxRequests: 30,
        skip: () => rateLimitDisabled,
      }),
    )
    .use(
      '/mcp',
      createRateLimitMiddleware({
        keyPrefix: 'mcp-api',
        windowMs: 60_000,
        maxRequests: 240,
        skip: () => rateLimitDisabled,
      }),
    )
    .use(
      '/v1/*',
      createRateLimitMiddleware({
        keyPrefix: 'api',
        windowMs: 60_000,
        maxRequests: 240,
        skip: () => rateLimitDisabled,
      }),
    )
    .use('/v1/sync', largeJsonBodyLimit)
    .use('/v1/auth/register', largeJsonBodyLimit)
    .use('/v1/auth/login', standardJsonBodyLimit)
    .use('/v1/auth/logout', standardJsonBodyLimit)
    .use('/v1/accounts', standardJsonBodyLimit)
    .use('/v1/accounts/*', standardJsonBodyLimit)
    .use('/v1/transactions', standardJsonBodyLimit)
    .use('/v1/transactions/*', standardJsonBodyLimit)
    .use('/oauth/*', standardJsonBodyLimit)
    .use('/mcp', standardJsonBodyLimit)
    .onError((error, c) => handleApiError(error, c))
    .notFound((c) => {
      const requestId = c.get('requestId');
      return c.json(
        {
          error: {
            code: 'NOT_FOUND' satisfies AppErrorCode,
            message: `Route ${c.req.method} ${c.req.path} not found.`,
            ...(requestId ? { requestId } : {}),
          },
        },
        404,
      );
    })
    .get('/', (c) =>
      c.json({
        service: 'budget-tracker-api',
        status: 'ok',
      }),
    )
    .route('/', createHealthRoutes({ checkDb: deps?.checkDb ?? checkDbConnection }))
    .route(
      '/',
      createMetaRoutes(deps?.getMinSupportedVersion ?? getMinSupportedVersion),
    )
    .route(
      '/',
      createAuthRoutes(authRepo, requireAuth, {
        allowDemoEndpoint:
          deps?.allowDemoEndpoint ??
          (() => process.env.ALLOW_UNAUTHENTICATED_DEMO === 'true'),
      }),
    )
    .route('/', createSyncRoutes(syncRepo, requireAuth))
    .route('/', createAccountsRoutes(accountsRepo, requireAuth))
    .route('/', createTransactionsRoutes(transactionsRepo, requireAuth))
    .route(
      '/',
      createMcpOAuthRoutes({
        authRepo,
        ...(deps?.mcpOAuthSecret
          ? { getSigningSecret: () => deps.mcpOAuthSecret! }
          : {}),
        ...(deps?.mcpStaticClient
          ? { getStaticClient: () => deps.mcpStaticClient }
          : {}),
      }),
    )
    .route(
      '/',
      createMcpRoutes({
        verifySessionTokenHash: (tokenHash) =>
          authRepo.verifySessionTokenHash(tokenHash),
        transactionsRepo,
        syncRepo,
      }),
    );

  return app;
}

export type AppType = ReturnType<typeof createApp>;
