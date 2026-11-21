import {
  accountResponseSchema,
  accountsListResponseSchema,
  apiErrorResponseSchema,
  applyReconciliationResponseSchema,
  clearTransactionsResponseSchema,
  computeReconciliationDelta,
  createDestructiveConfirmation,
  createInitialSyncDataState,
  DEFAULT_CURRENCY,
  deleteAccountResponseSchema,
  deleteTransactionResponseSchema,
  healthResponseSchema,
  reconciliationsListResponseSchema,
  transactionResponseSchema,
  transactionsListResponseSchema,
  type Account,
  type AuthUser,
  type BalanceReconciliation,
  type SyncDataState,
  type Transaction,
} from '@repo/contracts';
import { hc } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { createApp, type AppType } from '../app';
import type { AccountsRepository } from '../capabilities/accounts/repository';
import type { AuthRepository } from '../capabilities/auth/repository';
import type { ReconcileRepository } from '../capabilities/reconcile/repository';
import type { SyncRepository } from '../capabilities/sync/repository';
import type { TransactionsRepository } from '../capabilities/transactions/repository';
import { AppError } from '../core/errors';

function createCapabilityTestHarness() {
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
      if (!state.accounts.some((a) => a.id === txData.accountId)) {
        throw new AppError('NOT_FOUND', 'Account not found');
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
      revision += 1;
      return { clearedCount, revision };
    },
  };

  const reconcileRepo: ReconcileRepository = {
    async listReconciliations() {
      return { reconciliations: [...state.reconciliations], revision };
    },
    async getReconciliationById(_userId, id) {
      const rec = state.reconciliations.find((r) => r.id === id);
      return rec ? { reconciliation: rec, revision } : null;
    },
    async applyReconciliation(params) {
      const accIdx = state.accounts.findIndex((a) => a.id === params.accountId);
      if (accIdx === -1) {
        throw new AppError('NOT_FOUND', `Account "${params.accountId}" not found.`);
      }
      const acc = state.accounts[accIdx];
      const delta = computeReconciliationDelta(
        acc.balanceMinor,
        params.actualBalanceMinor,
      );

      let adjustmentTransaction: Transaction | undefined;
      if (params.createAdjustment && delta.needsAdjustment) {
        adjustmentTransaction = {
          id: `${params.reconciliationId}-adj`,
          type: delta.adjustmentType === 'INCOME' ? 'INCOME' : 'EXPENSE',
          amountMinor: delta.adjustmentAmountMinor,
          currency: acc.currency,
          accountId: acc.id,
          categoryId:
            delta.adjustmentType === 'INCOME' ? 'cat-other-income' : 'cat-dues',
          merchant: 'Balance Adjustment',
          note: params.notes || 'Reconciliation adjustment',
          tags: ['reconciliation'],
          occurredAt: params.reconciledAt,
          createdAt: params.reconciledAt,
        };
        state.transactions.unshift(adjustmentTransaction);
      }

      const updatedAccount: Account = {
        ...acc,
        balanceMinor: params.actualBalanceMinor,
      };
      state.accounts[accIdx] = updatedAccount;

      const reconciliation: BalanceReconciliation = {
        id: params.reconciliationId,
        accountId: acc.id,
        appBalanceMinor: acc.balanceMinor,
        actualBalanceMinor: params.actualBalanceMinor,
        discrepancyMinor: delta.discrepancyMinor,
        reconciledAt: params.reconciledAt,
        ...(adjustmentTransaction
          ? { adjustmentTransactionId: adjustmentTransaction.id }
          : {}),
      };
      state.reconciliations.unshift(reconciliation);
      revision += 1;

      return {
        reconciliation,
        account: updatedAccount,
        ...(adjustmentTransaction ? { adjustmentTransaction } : {}),
        revision,
      };
    },
  };

  let dbHealthy = true;
  const app = createApp({
    authRepo,
    syncRepo,
    accountsRepo,
    transactionsRepo,
    reconcileRepo,
    checkDb: async () => dbHealthy,
    allowedOrigins: ['https://budget-tracker.pages.dev', 'http://localhost:8081'],
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

    // Missing confirmation must fail with CONFIRMATION_REQUIRED
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

    // Mismatched confirmation token must fail
    const wrongTokenDelete = await app.request(
      `/v1/accounts/${created.account.id}`,
      {
        method: 'DELETE',
        headers: authHeaders,
        body: JSON.stringify(
          createDestructiveConfirmation('delete-account', 'wrong-id'),
        ),
      },
    );
    expect(wrongTokenDelete.status).toBe(400);

    // Valid confirmation token succeeds
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
        tags: ['food'],
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

    // Bulk clear requires explicit confirmation
    const unconfirmedClear = await app.request('/v1/transactions/clear', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({}),
    });
    expect(unconfirmedClear.status).toBe(400);

    const confirmedClear = await app.request('/v1/transactions/clear', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(
        createDestructiveConfirmation('clear-transactions', 'all'),
      ),
    });
    expect(confirmedClear.status).toBe(200);
    const cleared = clearTransactionsResponseSchema.parse(
      await confirmedClear.json(),
    );
    expect(cleared.clearedCount).toBeGreaterThan(0);
    expect(state.transactions).toHaveLength(0);
  });

  it('reconciles accounts by ID loading fresh balance and requiring confirmation', async () => {
    const { app, state, authHeaders } = createCapabilityTestHarness();
    const bankAccount = state.accounts.find((a) => a.id === 'account-bank')!;
    const targetBalance = bankAccount.balanceMinor + 1500;

    // Without confirmation -> 400 CONFIRMATION_REQUIRED
    const unconfirmed = await app.request('/v1/reconcile', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        accountId: 'account-bank',
        actualBalanceMinor: targetBalance,
        createAdjustment: true,
      }),
    });
    expect(unconfirmed.status).toBe(400);
    const err = apiErrorResponseSchema.parse(await unconfirmed.json());
    expect(err.error.code).toBe('CONFIRMATION_REQUIRED');

    // With confirmation -> computes discrepancy from fresh DB balance & creates adjustment tx
    const confirmed = await app.request('/v1/reconcile', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        accountId: 'account-bank',
        actualBalanceMinor: targetBalance,
        createAdjustment: true,
        notes: 'Bank statement sync',
        ...createDestructiveConfirmation('reconcile-account', 'account-bank'),
      }),
    });
    expect(confirmed.status).toBe(201);
    const applied = applyReconciliationResponseSchema.parse(
      await confirmed.json(),
    );
    expect(applied.reconciliation.discrepancyMinor).toBe(1500);
    expect(applied.account.balanceMinor).toBe(targetBalance);
    expect(applied.adjustmentTransaction?.type).toBe('INCOME');
    expect(applied.adjustmentTransaction?.amountMinor).toBe(1500);

    const historyRes = await app.request('/v1/reconcile', {
      headers: authHeaders,
    });
    expect(historyRes.status).toBe(200);
    const history = reconciliationsListResponseSchema.parse(
      await historyRes.json(),
    );
    expect(history.reconciliations[0]?.id).toBe(applied.reconciliation.id);
  });

  it('exports typed AppType compatible with Hono RPC hc<AppType>', () => {
    const { app } = createCapabilityTestHarness();
    const rpcClient = hc<AppType>('http://localhost:3000', {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        Promise.resolve(app.request(input, init)),
    });
    expect(typeof rpcClient.health.$get).toBe('function');
    expect(typeof rpcClient.v1.accounts.$get).toBe('function');
    expect(typeof rpcClient.v1.transactions.$get).toBe('function');
    expect(typeof rpcClient.v1.reconcile.$post).toBe('function');
  });
});
