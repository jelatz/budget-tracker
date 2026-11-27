import {
  accountResponseSchema,
  accountsListResponseSchema,
  apiErrorResponseSchema,
  clearTransactionsResponseSchema,
  createDestructiveConfirmation,
  createInitialSyncDataState,
  DEFAULT_CURRENCY,
  deleteAccountResponseSchema,
  deleteTransactionResponseSchema,
  healthResponseSchema,
  transactionResponseSchema,
  transactionsListResponseSchema,
  type Account,
  type AuthUser,
  type SyncDataState,
  type Transaction,
} from '@repo/contracts';
import { hc } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { createApp, type AppType } from '../app';
import type { AccountsRepository } from '../capabilities/accounts/repository';
import type { AuthRepository } from '../capabilities/auth/repository';
import type { SyncRepository } from '../capabilities/sync/repository';
import {
  createPgTransactionsRepository,
  type TransactionsRepository,
} from '../capabilities/transactions/repository';
import {
  createMoneyCipher,
  isEncryptedMoneyValue,
} from '../core/crypto/field-encryption';
import type { AppDatabase } from '../core/db/client';
import {
  accounts as accountsTable,
  categories as categoriesTable,
  transactions as transactionsTable,
} from '../core/db/schema';
import { AppError } from '../core/errors';

function createCapabilityTestHarness(options?: { allowLocalhostCors?: boolean }) {
  const user: AuthUser = {
    id: 'user-1',
    email: 'tester@example.com',
    name: 'Tester',
    createdAt: new Date().toISOString(),
  };

  let revision = 1;
  const state: SyncDataState = createInitialSyncDataState();
  const validToken = 'test-session-token';

  const authRepo: AuthRepository = {
    async findUserByEmail() {
      return null;
    },
    async createUserWithSessionAndState() {
      return user;
    },
    async createSession() {},
    async verifySessionTokenHash() {
      return { sessionId: 'sess-1', user };
    },
    async revokeSession() {},
  };

  const syncRepo: SyncRepository = {
    async getUserRevision() {
      return revision;
    },
    async pullState() {
      return { revision, state };
    },
    async pushMutations() {
      return { revision, appliedOpIds: [], state };
    },
  };

  const accountsRepo: AccountsRepository = {
    async listAccounts() {
      return { accounts: [...state.accounts], revision };
    },
    async getAccountById(_userId, accountId) {
      const account = state.accounts.find((a) => a.id === accountId);
      return account ? { account: { ...account }, revision } : null;
    },
    async createAccount(_userId, account) {
      if (state.accounts.some((a) => a.id === account.id)) {
        throw new AppError('CONFLICT', 'Duplicate account id');
      }
      state.accounts.push(account);
      revision += 1;
      return { account, revision };
    },
    async updateAccountMetadata(_userId, accountId, patch) {
      const idx = state.accounts.findIndex((a) => a.id === accountId);
      if (idx === -1) return null;
      const updated: Account = {
        ...state.accounts[idx],
        ...patch,
      };
      state.accounts[idx] = updated;
      revision += 1;
      return { account: updated, revision };
    },
    async deleteAccountById(_userId, accountId) {
      const exists = state.accounts.some((a) => a.id === accountId);
      if (!exists) {
        throw new AppError('NOT_FOUND', `Account "${accountId}" not found.`);
      }
      if (state.accounts.length <= 1) {
        throw new AppError('CONFLICT', 'Cannot delete the last remaining account.');
      }
      state.accounts = state.accounts.filter((a) => a.id !== accountId);
      revision += 1;
      return { deletedAccountId: accountId, revision };
    },
  };

  const applyTxDelta = (tx: Transaction, direction: 1 | -1) => {
    state.accounts = state.accounts.map((acc) => {
      if (tx.type === 'EXPENSE' && acc.id === tx.accountId) {
        return { ...acc, balanceMinor: acc.balanceMinor - direction * tx.amountMinor };
      }
      if (tx.type === 'INCOME' && acc.id === tx.accountId) {
        return { ...acc, balanceMinor: acc.balanceMinor + direction * tx.amountMinor };
      }
      if (tx.type === 'TRANSFER') {
        if (acc.id === tx.accountId) {
          return { ...acc, balanceMinor: acc.balanceMinor - direction * tx.amountMinor };
        }
        if (tx.toAccountId && acc.id === tx.toAccountId) {
          return { ...acc, balanceMinor: acc.balanceMinor + direction * tx.amountMinor };
        }
      }
      return acc;
    });
  };

  const transactionsRepo: TransactionsRepository = {
    async listTransactions(_userId, query) {
      let filtered = [...state.transactions];
      if (query.accountId) {
        filtered = filtered.filter((t) => t.accountId === query.accountId);
      }
      if (query.type) {
        filtered = filtered.filter((t) => t.type === query.type);
      }
      return {
        transactions: filtered.slice(query.offset, query.offset + query.limit),
        total: filtered.length,
        revision,
      };
    },
    async getTransactionById(_userId, transactionId) {
      const tx = state.transactions.find((t) => t.id === transactionId);
      return tx ? { transaction: tx, revision } : null;
    },
    async createTransaction(_userId, txData) {
      const source = state.accounts.find((a) => a.id === txData.accountId);
      if (!source) {
        throw new AppError('NOT_FOUND', 'Account not found');
      }
      if (source.currency !== txData.currency) {
        throw new AppError('VALIDATION_ERROR', 'Transaction currency must match account currency.');
      }
      state.transactions.unshift(txData);
      applyTxDelta(txData, 1);
      revision += 1;
      return { transaction: txData, revision };
    },
    async updateTransaction(_userId, transactionId, nextData) {
      const idx = state.transactions.findIndex((t) => t.id === transactionId);
      if (idx === -1) return null;
      const prev = state.transactions[idx];
      const next: Transaction = {
        ...nextData,
        id: prev.id,
        createdAt: prev.createdAt,
      };
      applyTxDelta(prev, -1);
      applyTxDelta(next, 1);
      state.transactions[idx] = next;
      revision += 1;
      return { transaction: next, revision };
    },
    async deleteTransactionById(_userId, transactionId) {
      const idx = state.transactions.findIndex((t) => t.id === transactionId);
      if (idx === -1) return null;
      const prev = state.transactions[idx];
      applyTxDelta(prev, -1);
      state.transactions.splice(idx, 1);
      revision += 1;
      return { deletedTransactionId: transactionId, revision };
    },
    async clearAllTransactions() {
      const clearedCount = state.transactions.length;
      state.transactions = [];
      state.accounts = state.accounts.map((a) => ({ ...a, balanceMinor: 0 }));
      state.categories = state.categories.map((c) => ({ ...c, usageCount: 0 }));
      revision += 1;
      return { clearedCount, revision };
    },
  };

  let dbHealthy = true;
  const app = createApp({
    authRepo,
    syncRepo,
    accountsRepo,
    transactionsRepo,
    checkDb: async () => dbHealthy,
    allowedOrigins: ['https://budget-tracker.pages.dev', 'http://localhost:8081'],
    ...(options?.allowLocalhostCors !== undefined
      ? { allowLocalhostCors: options.allowLocalhostCors }
      : {}),
  });

  const authHeaders = {
    Authorization: `Bearer ${validToken}`,
    'Content-Type': 'application/json',
  };

  return {
    app,
    state,
    authHeaders,
    setDbHealthy: (value: boolean) => {
      dbHealthy = value;
    },
  };
}

describe('Railway Hono API capabilities & production guardrails', () => {
  it('exposes /health liveness and optional ?check=db readiness with request ID', async () => {
    const { app, setDbHealthy } = createCapabilityTestHarness();

    const livenessRes = await app.request('/health');
    expect(livenessRes.status).toBe(200);
    expect(livenessRes.headers.get('x-request-id')).toBeTruthy();
    const liveness = healthResponseSchema.parse(await livenessRes.json());
    expect(liveness.status).toBe('ok');
    expect(liveness.database).toBe('skipped');

    const dbOkRes = await app.request('/health?check=db');
    expect(dbOkRes.status).toBe(200);
    const dbOk = healthResponseSchema.parse(await dbOkRes.json());
    expect(dbOk.database).toBe('ok');

    setDbHealthy(false);
    const dbFailRes = await app.request('/health?check=db');
    expect(dbFailRes.status).toBe(503);
    const dbFail = healthResponseSchema.parse(await dbFailRes.json());
    expect(dbFail.status).toBe('degraded');
    expect(dbFail.database).toBe('error');
  });

  it('enforces explicit CORS allowlist for Expo Web & local dev origins', async () => {
    const { app } = createCapabilityTestHarness();

    const allowedRes = await app.request('/health', {
      headers: { Origin: 'https://budget-tracker.pages.dev' },
    });
    expect(allowedRes.headers.get('access-control-allow-origin')).toBe(
      'https://budget-tracker.pages.dev',
    );

    const blockedRes = await app.request('/health', {
      headers: { Origin: 'https://evil.example.com' },
    });
    expect(blockedRes.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('allows loopback dev origins when allowLocalhostCors is true and blocks them when false', async () => {
    const devHarness = createCapabilityTestHarness({ allowLocalhostCors: true });
    const allowedDevRes = await devHarness.app.request('/health', {
      headers: { Origin: 'http://localhost:8082' },
    });
    expect(allowedDevRes.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:8082',
    );

    const prodHarness = createCapabilityTestHarness({ allowLocalhostCors: false });
    const blockedDevRes = await prodHarness.app.request('/health', {
      headers: { Origin: 'http://localhost:8082' },
    });
    expect(blockedDevRes.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('supports accounts CRUD and enforces confirmation tokens on account deletion', async () => {
    const { app, authHeaders } = createCapabilityTestHarness();

    const listRes = await app.request('/v1/accounts', { headers: authHeaders });
    expect(listRes.status).toBe(200);
    const initial = accountsListResponseSchema.parse(await listRes.json());
    expect(initial.accounts.length).toBeGreaterThan(1);

    const createRes = await app.request('/v1/accounts', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Travel Wallet',
        accountType: 'E_WALLET',
        icon: '✈️',
        color: '#06B6D4',
        currency: DEFAULT_CURRENCY,
        balanceMinor: 50000,
      }),
    });
    expect(createRes.status).toBe(201);
    const created = accountResponseSchema.parse(await createRes.json());

    const patchRes = await app.request(`/v1/accounts/${created.account.id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ name: 'Japan Trip Wallet' }),
    });
    expect(patchRes.status).toBe(200);
    const patched = accountResponseSchema.parse(await patchRes.json());
    expect(patched.account.name).toBe('Japan Trip Wallet');

    const unconfirmedDelete = await app.request(
      `/v1/accounts/${created.account.id}`,
      {
        method: 'DELETE',
        headers: authHeaders,
      },
    );
    expect(unconfirmedDelete.status).toBe(400);
    const errPayload = apiErrorResponseSchema.parse(
      await unconfirmedDelete.json(),
    );
    expect(errPayload.error.code).toBe('CONFIRMATION_REQUIRED');

    const validDelete = await app.request(
      `/v1/accounts/${created.account.id}`,
      {
        method: 'DELETE',
        headers: authHeaders,
        body: JSON.stringify(
          createDestructiveConfirmation('delete-account', created.account.id),
        ),
      },
    );
    expect(validDelete.status).toBe(200);
    const deleted = deleteAccountResponseSchema.parse(await validDelete.json());
    expect(deleted.deletedAccountId).toBe(created.account.id);
  });

  it('supports transactions CRUD with balance adjustments and confirmation-gated clear', async () => {
    const { app, state, authHeaders } = createCapabilityTestHarness();
    const startingBalance = state.accounts.find(
      (a) => a.id === 'account-bank',
    )!.balanceMinor;

    const createRes = await app.request('/v1/transactions', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        type: 'EXPENSE',
        amountMinor: 2500,
        currency: DEFAULT_CURRENCY,
        accountId: 'account-bank',
        categoryId: 'cat-daily-living',
        merchant: 'Local Bakery',
        occurredAt: new Date().toISOString(),
      }),
    });
    expect(createRes.status).toBe(201);
    const created = transactionResponseSchema.parse(await createRes.json());
    expect(
      state.accounts.find((a) => a.id === 'account-bank')!.balanceMinor,
    ).toBe(startingBalance - 2500);

    const listRes = await app.request(
      '/v1/transactions?accountId=account-bank&type=EXPENSE&limit=10&offset=0',
      { headers: authHeaders },
    );
    expect(listRes.status).toBe(200);
    const listed = transactionsListResponseSchema.parse(await listRes.json());
    expect(listed.transactions.some((t) => t.id === created.transaction.id)).toBe(
      true,
    );

    const deleteRes = await app.request(
      `/v1/transactions/${created.transaction.id}`,
      {
        method: 'DELETE',
        headers: authHeaders,
      },
    );
    expect(deleteRes.status).toBe(200);
    deleteTransactionResponseSchema.parse(await deleteRes.json());
    expect(
      state.accounts.find((a) => a.id === 'account-bank')!.balanceMinor,
    ).toBe(startingBalance);

    const confirmedClear = await app.request('/v1/transactions/clear', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(
        createDestructiveConfirmation('clear-transactions', 'all'),
      ),
    });
    expect(confirmedClear.status).toBe(200);
    clearTransactionsResponseSchema.parse(await confirmedClear.json());
    expect(state.transactions).toHaveLength(0);
    expect(state.accounts.every((a) => a.balanceMinor === 0)).toBe(true);
  });

  it('exports typed AppType compatible with Hono RPC hc<AppType> without removed reconcile route', async () => {
    const { app } = createCapabilityTestHarness();
    const rpcClient = hc<AppType>('http://localhost:3000', {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        Promise.resolve(app.request(input, init)),
    });
    expect(typeof rpcClient.health.$get).toBe('function');
    expect(typeof rpcClient.v1.accounts.$get).toBe('function');
    expect(typeof rpcClient.v1.transactions.$get).toBe('function');

    const removedRoute = await app.request('/v1/reconcile');
    expect(removedRoute.status).toBe(404);
  });

  it('createPgTransactionsRepository handles transaction deletes and resets balances on clearAll', async () => {
    const now = new Date('2026-11-24T00:00:00.000Z');
    const cipher = createMoneyCipher({
      primaryKey: Buffer.from('0123456789abcdef'.repeat(4), 'hex'),
    });
    const updatedTables: unknown[] = [];
    const updatedPayloads: Array<{ table: unknown; payload: Record<string, unknown> }> = [];
    const deletedTables: unknown[] = [];

    const mockSelectQueue: unknown[][] = [
      [{ stateRevision: 3 }],
      [
        {
          userId: 'user-1',
          id: 'tx-1',
          type: 'EXPENSE',
          amountMinor: cipher.encrypt(1000, {
            userId: 'user-1',
            table: 'transactions',
            rowId: 'tx-1',
            column: 'amount_minor',
          }),
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          toAccountId: null,
          categoryId: 'cat-daily-living',
          incomeSourceId: null,
          commitmentId: null,
          merchant: 'Mart',
          note: null,
          occurredAt: now,
          createdAt: now,
          sortOrder: 0,
        },
      ],
      [
        {
          userId: 'user-1',
          id: 'account-bank',
          name: 'Bank',
          accountType: 'BANK',
          icon: '🏦',
          color: '#1B4332',
          currency: DEFAULT_CURRENCY,
          balanceMinor: cipher.encrypt(4000, {
            userId: 'user-1',
            table: 'accounts',
            rowId: 'account-bank',
            column: 'balance_minor',
          }),
          creditLimitMinor: null,
          monthlyPaymentTargetMinor: null,
          statementDay: null,
          dueDay: null,
          dueWeekday: null,
          dueWeekdayOrdinal: null,
          dueStartDate: null,
          sortOrder: 0,
        },
      ],
    ];

    const makeChain = (rows: unknown[]) => {
      const chain: Record<string, unknown> = {
        from: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: () => chain,
        for: () => Promise.resolve(rows),
        then: (resolve: (val: unknown[]) => void) => Promise.resolve(rows).then(resolve),
      };
      return chain;
    };

    const mockTx = {
      select: () => makeChain(mockSelectQueue.shift() ?? []),
      insert: () => ({ values: async () => undefined }),
      update: (table: unknown) => {
        updatedTables.push(table);
        return {
          set: (payload: Record<string, unknown>) => {
            updatedPayloads.push({ table, payload });
            return {
              where: async () => undefined,
            };
          },
        };
      },
      delete: (table: unknown) => {
        deletedTables.push(table);
        return {
          where: () => ({
            returning: async () => [{ id: 'tx-1' }],
            then: (resolve: (val: undefined) => void) =>
              Promise.resolve(undefined).then(resolve),
          }),
        };
      },
    };

    const mockDb = {
      transaction: async <T>(fn: (tx: typeof mockTx) => Promise<T>) => fn(mockTx),
    } as unknown as AppDatabase;

    const pgRepo = createPgTransactionsRepository(mockDb, cipher);

    const deleted = await pgRepo.deleteTransactionById('user-1', 'tx-1');
    expect(deleted?.deletedTransactionId).toBe('tx-1');
    expect(deleted?.revision).toBe(4);
    expect(deletedTables).toContain(transactionsTable);

    const deleteAccountUpdate = updatedPayloads.find(
      (entry) => entry.table === accountsTable,
    );
    expect(
      isEncryptedMoneyValue(String(deleteAccountUpdate?.payload.balanceMinor)),
    ).toBe(true);
    expect(
      cipher.decrypt(String(deleteAccountUpdate?.payload.balanceMinor), {
        userId: 'user-1',
        table: 'accounts',
        rowId: 'account-bank',
        column: 'balance_minor',
      }),
    ).toBe(5000);

    updatedTables.length = 0;
    updatedPayloads.length = 0;
    deletedTables.length = 0;
    mockSelectQueue.push(
      [{ stateRevision: 4 }],
      [{ id: 'account-bank' }, { id: 'account-cash' }],
    );
    const cleared = await pgRepo.clearAllTransactions('user-1');
    expect(cleared.clearedCount).toBe(1);
    expect(cleared.revision).toBe(5);
    expect(updatedTables).toContain(accountsTable);
    expect(updatedTables).toContain(categoriesTable);
  });
});
