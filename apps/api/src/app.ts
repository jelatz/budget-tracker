import type { AppErrorCode } from '@repo/contracts';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
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
import { createMetaRoutes } from './capabilities/meta/routes';
import {
  createPgReconcileRepository,
  type ReconcileRepository,
} from './capabilities/reconcile/repository';
import { createReconcileRoutes } from './capabilities/reconcile/routes';
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
import { getMinSupportedVersion, parseAllowedCorsOrigins } from './core/env';
import { handleApiError } from './core/errors';
import {
  createRequestLoggerMiddleware,
  type RequestLogVariables,
} from './core/logger';

export interface AppDependencies {
  authRepo?: AuthRepository;
  syncRepo?: SyncRepository;
  accountsRepo?: AccountsRepository;
  transactionsRepo?: TransactionsRepository;
  reconcileRepo?: ReconcileRepository;
  checkDb?: () => Promise<boolean>;
  getMinSupportedVersion?: () => string;
  allowDemoEndpoint?: () => boolean;
  allowedOrigins?: readonly string[];
}

export function createApp(deps?: AppDependencies) {
  const allowedOriginSet = new Set(
    (deps?.allowedOrigins ?? parseAllowedCorsOrigins()).map((origin) =>
      origin.trim().replace(/\/+$/, ''),
    ),
  );

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

  const reconcileRepo: ReconcileRepository =
    deps?.reconcileRepo ?? {
      listReconciliations: (userId) =>
        createPgReconcileRepository(getDb()).listReconciliations(userId),
      getReconciliationById: (userId, reconciliationId) =>
        createPgReconcileRepository(getDb()).getReconciliationById(
          userId,
          reconciliationId,
        ),
      applyReconciliation: (params) =>
        createPgReconcileRepository(getDb()).applyReconciliation(params),
    };

  const requireAuth = createRequireAuthMiddleware((tokenHash) =>
    authRepo.verifySessionTokenHash(tokenHash),
  );

  const app = new Hono<{ Variables: RequestLogVariables }>()
    .use('*', createRequestLoggerMiddleware())
    .use(
      '*',
      cors({
        origin: (origin) => {
          if (!origin) {
            return '';
          }
          const normalized = origin.trim().replace(/\/+$/, '');
          return allowedOriginSet.has(normalized) ? origin : null;
        },
        allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
        exposeHeaders: ['X-Request-Id'],
        maxAge: 86400,
      }),
    )
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
    .route('/', createReconcileRoutes(reconcileRepo, requireAuth));

  return app;
}

export type AppType = ReturnType<typeof createApp>;
