import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  applyReconciliationResponseSchema,
  authMeResponseSchema,
  authResponseSchema,
  categoriesResponseSchema,
  categoryBudgetsStatusResponseSchema,
  contributeSinkingFundResponseSchema,
  importBackupResponseSchema,
  metaResponseSchema,
  quickPresetsResponseSchema,
  recurringCommitmentSchema,
  safeToSpendMetricsSchema,
  settleRecurringCommitmentResponseSchema,
  sinkingFundSchema,
  smartDefaultsSchema,
  transactionSchema,
  transactionsResponseSchema,
  walletSchema,
  walletsResponseSchema,
} from '@repo/contracts';
import { createApp } from '../app';
import type { AppDb } from '../core/db/client';
import * as schema from '../core/db/schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, '../../drizzle');

let pglite: PGlite;
let db: AppDb;
let app: ReturnType<typeof createApp>;

async function jsonRequest(
  method: string,
  urlPath: string,
  options: { token?: string; body?: unknown } = {},
): Promise<{ status: number; data: unknown }> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const res = await app.request(urlPath, {
    method,
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  return { status: res.status, data };
}

describe('Budget Tracker API Integration Tests (PostgreSQL + Drizzle)', () => {
  beforeAll(async () => {
    pglite = new PGlite();
    const pgDb = drizzle(pglite, { schema });
    await migrate(pgDb, { migrationsFolder });
    db = pgDb as unknown as AppDb;
    app = createApp({ db, minSupportedVersion: '1.0.0' });
  }, 30_000);

  afterAll(async () => {
    await pglite.close();
  });

  beforeEach(async () => {
    await pglite.exec('TRUNCATE TABLE users RESTART IDENTITY CASCADE');
  });

  it('serves public health and meta endpoints', async () => {
    const health = await jsonRequest('GET', '/health');
    expect(health.status).toBe(200);
    expect(health.data).toEqual({ status: 'ok' });

    const meta = await jsonRequest('GET', '/v1/meta');
    expect(meta.status).toBe(200);
    expect(metaResponseSchema.parse(meta.data)).toEqual({
      minSupportedVersion: '1.0.0',
    });
  });

  it('handles registration, multi-device login, duplicate conflict, /me, and single-session logout', async () => {
    // Unauthenticated /v1/auth/me -> 401
    const unauthMe = await jsonRequest('GET', '/v1/auth/me');
    expect(unauthMe.status).toBe(401);

    // Register User A
    const reg = await jsonRequest('POST', '/v1/auth/register', {
      body: {
        name: 'Alice Santos',
        email: 'Alice@Example.com',
        password: 'password123',
      },
    });
    expect(reg.status).toBe(201);
    const parsedReg = authResponseSchema.parse(reg.data);
    expect(parsedReg.user.email).toBe('alice@example.com');

    // Duplicate registration -> 409
    const dup = await jsonRequest('POST', '/v1/auth/register', {
      body: {
        name: 'Alice 2',
        email: 'alice@example.com',
        password: 'password123',
      },
    });
    expect(dup.status).toBe(409);

    // Seeded wallets, categories, presets exist
    const walletsRes = await jsonRequest('GET', '/v1/wallets', {
      token: parsedReg.token,
    });
    expect(walletsRes.status).toBe(200);
    const walletsList = walletsResponseSchema.parse(walletsRes.data);
    expect(walletsList).toHaveLength(4);
    expect(walletsList.every((w) => w.balanceMinor === 0)).toBe(true);

    const catsRes = await jsonRequest('GET', '/v1/categories', {
      token: parsedReg.token,
    });
    expect(categoriesResponseSchema.parse(catsRes.data)).toHaveLength(21);

    const presetsRes = await jsonRequest('GET', '/v1/quick-presets', {
      token: parsedReg.token,
    });
    expect(quickPresetsResponseSchema.parse(presetsRes.data)).toHaveLength(4);

    // Wrong password -> 401
    const badLogin = await jsonRequest('POST', '/v1/auth/login', {
      body: { email: 'alice@example.com', password: 'wrong' },
    });
    expect(badLogin.status).toBe(401);

    // Second device login -> new session token
    const login2 = await jsonRequest('POST', '/v1/auth/login', {
      body: { email: 'alice@example.com', password: 'password123' },
    });
    expect(login2.status).toBe(200);
    const parsedLogin2 = authResponseSchema.parse(login2.data);
    expect(parsedLogin2.token).not.toBe(parsedReg.token);

    // Logout device 1 -> device 1 fails, device 2 still works
    const logout1 = await jsonRequest('POST', '/v1/auth/logout', {
      token: parsedReg.token,
    });
    expect(logout1.status).toBe(200);

    const me1 = await jsonRequest('GET', '/v1/auth/me', {
      token: parsedReg.token,
    });
    expect(me1.status).toBe(401);

    const me2 = await jsonRequest('GET', '/v1/auth/me', {
      token: parsedLogin2.token,
    });
    expect(me2.status).toBe(200);
    expect(authMeResponseSchema.parse(me2.data).user.email).toBe('alice@example.com');
  });

  it('enforces strict cross-user isolation on wallets and transactions', async () => {
    const regA = authResponseSchema.parse(
      (
        await jsonRequest('POST', '/v1/auth/register', {
          body: { name: 'User A', email: 'a@example.com', password: 'password123' },
        })
      ).data,
    );
    const regB = authResponseSchema.parse(
      (
        await jsonRequest('POST', '/v1/auth/register', {
          body: { name: 'User B', email: 'b@example.com', password: 'password123' },
        })
      ).data,
    );

    const walletsA = walletsResponseSchema.parse(
      (await jsonRequest('GET', '/v1/wallets', { token: regA.token })).data,
    );
    const catsA = categoriesResponseSchema.parse(
      (await jsonRequest('GET', '/v1/categories', { token: regA.token })).data,
    );
    const checkingA = walletsA.find((w) => w.name === 'Checking')!;
    const coffeeA = catsA.find((c) => c.name === 'Coffee & Drinks')!;

    const txA = transactionSchema.parse(
      (
        await jsonRequest('POST', '/v1/transactions', {
          token: regA.token,
          body: {
            type: 'EXPENSE',
            amountMinor: 18000,
            currency: 'PHP',
            walletId: checkingA.id,
            categoryId: coffeeA.id,
            occurredAt: '2026-11-15T08:00:00.000Z',
          },
        })
      ).data,
    );

    // User B cannot see, update, or delete User A's wallet or transaction
    const walletsB = walletsResponseSchema.parse(
      (await jsonRequest('GET', '/v1/wallets', { token: regB.token })).data,
    );
    expect(walletsB.some((w) => w.id === checkingA.id)).toBe(false);

    const patchWalletB = await jsonRequest('PATCH', `/v1/wallets/${checkingA.id}`, {
      token: regB.token,
      body: { name: 'Hacked' },
    });
    expect(patchWalletB.status).toBe(404);

    const delTxB = await jsonRequest('DELETE', `/v1/transactions/${txA.id}`, {
      token: regB.token,
    });
    expect(delTxB.status).toBe(404);

    const txsB = transactionsResponseSchema.parse(
      (await jsonRequest('GET', '/v1/transactions', { token: regB.token })).data,
    );
    expect(txsB).toHaveLength(0);
  });

  it('supports wallet CRUD and protects wallets with transactions from deletion', async () => {
    const { token } = authResponseSchema.parse(
      (
        await jsonRequest('POST', '/v1/auth/register', {
          body: { name: 'Wallets User', email: 'wallets@example.com', password: 'password123' },
        })
      ).data,
    );

    const createdRes = await jsonRequest('POST', '/v1/wallets', {
      token,
      body: {
        name: 'GCash',
        type: 'EWALLET',
        icon: '📱',
        color: '#208AEF',
        currency: 'PHP',
        balanceMinor: 500000,
      },
    });
    expect(createdRes.status).toBe(201);
    const gcash = walletSchema.parse(createdRes.data);
    expect(gcash.type).toBe('EWALLET');
    expect(typeof gcash.balanceMinor).toBe('number');
    expect(gcash.balanceMinor).toBe(500000);

    const updatedRes = await jsonRequest('PATCH', `/v1/wallets/${gcash.id}`, {
      token,
      body: { name: 'GCash Main', includeInSafeToSpend: false },
    });
    expect(updatedRes.status).toBe(200);
    expect(walletSchema.parse(updatedRes.data)).toMatchObject({
      name: 'GCash Main',
      includeInSafeToSpend: false,
    });

    const cats = categoriesResponseSchema.parse(
      (await jsonRequest('GET', '/v1/categories', { token })).data,
    );
    const coffeeCat = cats.find((c) => c.name === 'Coffee & Drinks')!;

    await jsonRequest('POST', '/v1/transactions', {
      token,
      body: {
        type: 'EXPENSE',
        amountMinor: 15000,
        walletId: gcash.id,
        categoryId: coffeeCat.id,
        occurredAt: '2026-11-15T10:00:00.000Z',
      },
    });

    // Cannot delete wallet with transactions -> 409
    const blockedDelete = await jsonRequest('DELETE', `/v1/wallets/${gcash.id}`, {
      token,
    });
    expect(blockedDelete.status).toBe(409);

    // Unused new wallet can be deleted -> 200
    const spareWallet = walletSchema.parse(
      (
        await jsonRequest('POST', '/v1/wallets', {
          token,
          body: { name: 'Spare', type: 'CASH', balanceMinor: 0 },
        })
      ).data,
    );
    const delSpare = await jsonRequest('DELETE', `/v1/wallets/${spareWallet.id}`, {
      token,
    });
    expect(delSpare.status).toBe(200);
  });

  it('executes full transaction lifecycle (INCOME, EXPENSE, splits, TRANSFER, PUT edit, DELETE)', async () => {
    const { token } = authResponseSchema.parse(
      (
        await jsonRequest('POST', '/v1/auth/register', {
          body: { name: 'Tx User', email: 'tx@example.com', password: 'password123' },
        })
      ).data,
    );

    const initialWallets = walletsResponseSchema.parse(
      (await jsonRequest('GET', '/v1/wallets', { token })).data,
    );
    const cats = categoriesResponseSchema.parse(
      (await jsonRequest('GET', '/v1/categories', { token })).data,
    );
    const checking = initialWallets.find((w) => w.name === 'Checking')!;
    const savings = initialWallets.find((w) => w.name === 'Savings')!;
    const cash = initialWallets.find((w) => w.name === 'Cash')!;
    const salaryCat = cats.find((c) => c.name === 'Salary')!;
    const groceriesCat = cats.find((c) => c.name === 'Groceries')!;
    const householdCat = cats.find((c) => c.name === 'Household')!;

    // 1. INCOME +5,500,000 -> Checking = 5,500,000
    const incRes = await jsonRequest('POST', '/v1/transactions', {
      token,
      body: {
        type: 'INCOME',
        amountMinor: 5500000,
        walletId: checking.id,
        categoryId: salaryCat.id,
        merchant: 'Acme Corp',
        tags: ['salary'],
        occurredAt: '2026-11-01T09:00:00.000Z',
      },
    });
    expect(incRes.status).toBe(201);
    const incTx = transactionSchema.parse(incRes.data);
    expect(typeof incTx.amountMinor).toBe('number');

    // 2. Split EXPENSE -450,000 -> Checking = 5,050,000
    const splitRes = await jsonRequest('POST', '/v1/transactions', {
      token,
      body: {
        type: 'EXPENSE',
        amountMinor: 450000,
        walletId: checking.id,
        splits: [
          { id: 's1', categoryId: groceriesCat.id, amountMinor: 300000 },
          { id: 's2', categoryId: householdCat.id, amountMinor: 150000 },
        ],
        merchant: 'SM Supermarket',
        occurredAt: '2026-11-02T12:00:00.000Z',
      },
    });
    expect(splitRes.status).toBe(201);
    const splitTx = transactionSchema.parse(splitRes.data);
    expect(splitTx.splits).toHaveLength(2);

    // 3. TRANSFER 1,000,000 Checking -> Savings (Checking = 4,050,000, Savings = 1,000,000)
    const transferRes = await jsonRequest('POST', '/v1/transactions', {
      token,
      body: {
        type: 'TRANSFER',
        amountMinor: 1000000,
        walletId: checking.id,
        toWalletId: savings.id,
        occurredAt: '2026-11-03T12:00:00.000Z',
      },
    });
    expect(transferRes.status).toBe(201);

    // 4. PUT Edit splitTx: move from Checking (450,000) to Cash (200,000 single category)
    // Checking should recover +450,000 -> 4,500,000; Cash should become -200,000
    const editRes = await jsonRequest('PUT', `/v1/transactions/${splitTx.id}`, {
      token,
      body: {
        type: 'EXPENSE',
        amountMinor: 200000,
        walletId: cash.id,
        categoryId: groceriesCat.id,
        merchant: 'SM Supermarket Updated',
        occurredAt: '2026-11-02T12:00:00.000Z',
      },
    });
    expect(editRes.status).toBe(200);
    const editedTx = transactionSchema.parse(editRes.data);
    expect(editedTx.splits).toBeUndefined();
    expect(editedTx.walletId).toBe(cash.id);

    let afterEditWallets = walletsResponseSchema.parse(
      (await jsonRequest('GET', '/v1/wallets', { token })).data,
    );
    expect(afterEditWallets.find((w) => w.id === checking.id)?.balanceMinor).toBe(4500000);
    expect(afterEditWallets.find((w) => w.id === savings.id)?.balanceMinor).toBe(1000000);
    expect(afterEditWallets.find((w) => w.id === cash.id)?.balanceMinor).toBe(-200000);

    // 5. DELETE editedTx -> Cash restores to 0
    const delRes = await jsonRequest('DELETE', `/v1/transactions/${splitTx.id}`, {
      token,
    });
    expect(delRes.status).toBe(200);
    afterEditWallets = walletsResponseSchema.parse(
      (await jsonRequest('GET', '/v1/wallets', { token })).data,
    );
    expect(afterEditWallets.find((w) => w.id === cash.id)?.balanceMinor).toBe(0);
  });

  it('handles recurring commitments (EXPENSE & INCOME), Safe-to-Spend, sinking funds, budgets, and reconciliation', async () => {
    const { token } = authResponseSchema.parse(
      (
        await jsonRequest('POST', '/v1/auth/register', {
          body: { name: 'Plan User', email: 'plan@example.com', password: 'password123' },
        })
      ).data,
    );

    const wallets = walletsResponseSchema.parse(
      (await jsonRequest('GET', '/v1/wallets', { token })).data,
    );
    const cats = categoriesResponseSchema.parse(
      (await jsonRequest('GET', '/v1/categories', { token })).data,
    );
    const checking = wallets.find((w) => w.name === 'Checking')!;
    const savings = wallets.find((w) => w.name === 'Savings')!;
    const salaryCat = cats.find((c) => c.name === 'Salary')!;
    const billsCat = cats.find((c) => c.name === 'Bills & Utilities')!;
    const groceriesCat = cats.find((c) => c.name === 'Groceries')!;

    // Seed checking with 5,000,000 (₱50,000) via INCOME
    await jsonRequest('POST', '/v1/transactions', {
      token,
      body: {
        type: 'INCOME',
        amountMinor: 5000000,
        walletId: checking.id,
        categoryId: salaryCat.id,
        occurredAt: '2026-11-01T08:00:00.000Z',
      },
    });

    // Envelope budget: 1,000,000 for Groceries in 2026-11
    await jsonRequest('POST', '/v1/category-budgets', {
      token,
      body: {
        categoryId: groceriesCat.id,
        periodMonth: '2026-11',
        assignedMinor: 1000000,
        rolloverEnabled: false,
      },
    });
    const budgetStatuses = categoryBudgetsStatusResponseSchema.parse(
      (await jsonRequest('GET', '/v1/category-budgets?periodMonth=2026-11', { token })).data,
    );
    expect(budgetStatuses).toHaveLength(1);
    expect(budgetStatuses[0].remainingMinor).toBe(1000000);

    // Create overdue unpaid bill (dueDay: 3, amount 450,000) and recurring income (dueDay: 30, amount 2,000,000)
    const electricBill = recurringCommitmentSchema.parse(
      (
        await jsonRequest('POST', '/v1/recurring-commitments', {
          token,
          body: {
            name: 'Meralco',
            type: 'EXPENSE',
            amountMinor: 450000,
            currency: 'PHP',
            walletId: checking.id,
            categoryId: billsCat.id,
            frequency: 'MONTHLY',
            dueDay: 3,
            isAutoPaid: false,
            isActive: true,
          },
        })
      ).data,
    );

    await jsonRequest('POST', '/v1/recurring-commitments', {
      token,
      body: {
        name: 'Payday Bonus',
        type: 'INCOME',
        amountMinor: 2000000,
        currency: 'PHP',
        walletId: checking.id,
        categoryId: salaryCat.id,
        frequency: 'MONTHLY',
        dueDay: 30,
        isAutoPaid: false,
        isActive: true,
      },
    });

    // Safe-to-Spend on 2026-11-15:
    // Liquid = 5,000,000; Overdue bill = 450,000; Envelope = 1,000,000 -> Safe = 3,550,000
    // Expected income = 2,000,000 (must NOT inflate safeToSpendMinor)
    const sts = safeToSpendMetricsSchema.parse(
      (await jsonRequest('GET', '/v1/safe-to-spend?date=2026-11-15', { token })).data,
    );
    expect(sts.totalLiquidBalanceMinor).toBe(5000000);
    expect(sts.overdueFixedBillsMinor).toBe(450000);
    expect(sts.upcomingFixedBillsMinor).toBe(450000);
    expect(sts.expectedRemainingIncomeMinor).toBe(2000000);
    expect(sts.safeToSpendMinor).toBe(3550000);

    // Settle overdue bill & record transaction -> creates EXPENSE and drops Checking to 4,550,000
    const settled = settleRecurringCommitmentResponseSchema.parse(
      (
        await jsonRequest('POST', `/v1/recurring-commitments/${electricBill.id}/settle`, {
          token,
          body: { periodMonth: '2026-11', recordTransaction: true },
        })
      ).data,
    );
    expect(settled.commitment.lastPaidPeriod).toBe('2026-11');
    expect(settled.transaction?.type).toBe('EXPENSE');
    expect(settled.transaction?.amountMinor).toBe(450000);

    // Sinking fund: same-wallet earmark creates NO transaction; cross-wallet creates TRANSFER
    const checkingFund = sinkingFundSchema.parse(
      (
        await jsonRequest('POST', '/v1/sinking-funds', {
          token,
          body: {
            name: 'Emergency Buffer',
            icon: '🛡️',
            color: '#10B981',
            targetAmountMinor: 1000000,
            currentSavedMinor: 0,
            targetDate: '2027-06-01',
            walletId: checking.id,
          },
        })
      ).data,
    );
    const sameWalletContrib = contributeSinkingFundResponseSchema.parse(
      (
        await jsonRequest('POST', `/v1/sinking-funds/${checkingFund.id}/contribute`, {
          token,
          body: { amountMinor: 200000, sourceWalletId: checking.id },
        })
      ).data,
    );
    expect(sameWalletContrib.fund.currentSavedMinor).toBe(200000);
    expect(sameWalletContrib.transaction).toBeUndefined();

    const savingsFund = sinkingFundSchema.parse(
      (
        await jsonRequest('POST', '/v1/sinking-funds', {
          token,
          body: {
            name: 'Travel Vault',
            icon: '✈️',
            color: '#3B82F6',
            targetAmountMinor: 2000000,
            currentSavedMinor: 0,
            targetDate: '2027-06-01',
            walletId: savings.id,
          },
        })
      ).data,
    );
    const crossWalletContrib = contributeSinkingFundResponseSchema.parse(
      (
        await jsonRequest('POST', `/v1/sinking-funds/${savingsFund.id}/contribute`, {
          token,
          body: { amountMinor: 300000, sourceWalletId: checking.id },
        })
      ).data,
    );
    expect(crossWalletContrib.transaction?.type).toBe('TRANSFER');

    // Checking is now 4,550,000 - 300,000 = 4,250,000. Reconcile down to 4,200,000 -> cat-adjustment EXPENSE
    const recRes = applyReconciliationResponseSchema.parse(
      (
        await jsonRequest('POST', '/v1/reconciliations', {
          token,
          body: {
            walletId: checking.id,
            actualBalanceMinor: 4200000,
            createAdjustment: true,
            notes: 'Statement check',
          },
        })
      ).data,
    );
    expect(recRes.wallet.balanceMinor).toBe(4200000);
    expect(recRes.reconciliation.discrepancyMinor).toBe(-50000);
    expect(recRes.adjustmentTransaction?.type).toBe('EXPENSE');
    const adjCat = cats.find((c) => c.id === recRes.adjustmentTransaction?.categoryId);
    expect(adjCat?.name).toBe('Balance Adjustment');
  });

  it('supports backup export/import (merge and overwrite), reset-demo, and clear-transactions', async () => {
    const regA = authResponseSchema.parse(
      (
        await jsonRequest('POST', '/v1/auth/register', {
          body: { name: 'Port User', email: 'port@example.com', password: 'password123' },
        })
      ).data,
    );
    const regB = authResponseSchema.parse(
      (
        await jsonRequest('POST', '/v1/auth/register', {
          body: { name: 'Port User B', email: 'portb@example.com', password: 'password123' },
        })
      ).data,
    );

    // Reset demo on User A -> creates 6 starter transactions and PHP settings
    const resetRes = await jsonRequest('POST', '/v1/account/reset-demo', {
      token: regA.token,
    });
    expect(resetRes.status).toBe(200);

    const aTxs = transactionsResponseSchema.parse(
      (await jsonRequest('GET', '/v1/transactions', { token: regA.token })).data,
    );
    expect(aTxs).toHaveLength(6);
    const aSettings = smartDefaultsSchema.parse(
      (await jsonRequest('GET', '/v1/settings', { token: regA.token })).data,
    );
    expect(aSettings.monthlyBudgetMinor).toBe(3000000);

    // Export User A backup and import into User B (both overwrite and merge) without PK conflicts
    const exported = (
      await jsonRequest('GET', '/v1/portability/export', { token: regA.token })
    ).data;

    const importOverwrite = importBackupResponseSchema.parse(
      (
        await jsonRequest('POST', '/v1/portability/import', {
          token: regB.token,
          body: { envelope: exported, mode: 'overwrite' },
        })
      ).data,
    );
    expect(importOverwrite.importedCount).toBe(6);

    const bTxs = transactionsResponseSchema.parse(
      (await jsonRequest('GET', '/v1/transactions', { token: regB.token })).data,
    );
    expect(bTxs).toHaveLength(6);

    // Clear all transactions on User A -> 0 transactions and balances reset to openingBalanceMinor
    const clearRes = await jsonRequest('POST', '/v1/account/clear-transactions', {
      token: regA.token,
    });
    expect(clearRes.status).toBe(200);

    const aTxsAfterClear = transactionsResponseSchema.parse(
      (await jsonRequest('GET', '/v1/transactions', { token: regA.token })).data,
    );
    expect(aTxsAfterClear).toHaveLength(0);
    const aWalletsAfterClear = walletsResponseSchema.parse(
      (await jsonRequest('GET', '/v1/wallets', { token: regA.token })).data,
    );
    expect(
      aWalletsAfterClear.every((w) => w.balanceMinor === w.openingBalanceMinor),
    ).toBe(true);
    expect(aWalletsAfterClear.some((w) => w.balanceMinor > 0)).toBe(true);

    // Re-import in merge mode into User A -> restores 6 transactions and exact demo balances
    const importMerge = importBackupResponseSchema.parse(
      (
        await jsonRequest('POST', '/v1/portability/import', {
          token: regA.token,
          body: { envelope: exported, mode: 'merge' },
        })
      ).data,
    );
    expect(importMerge.importedCount).toBe(6);
    const aTxsAfterMerge = transactionsResponseSchema.parse(
      (await jsonRequest('GET', '/v1/transactions', { token: regA.token })).data,
    );
    expect(aTxsAfterMerge).toHaveLength(6);
    const aWalletsAfterMerge = walletsResponseSchema.parse(
      (await jsonRequest('GET', '/v1/wallets', { token: regA.token })).data,
    );
    expect(aWalletsAfterMerge.find((w) => w.name === 'Checking')?.balanceMinor).toBe(4500000);
    expect(aWalletsAfterMerge.find((w) => w.name === 'Credit Card')?.balanceMinor).toBe(0);
    expect(aWalletsAfterMerge.find((w) => w.name === 'Cash')?.balanceMinor).toBe(350000);
    expect(aWalletsAfterMerge.find((w) => w.name === 'Savings')?.balanceMinor).toBe(12000000);
  });

  it('maintains ledger invariants across opening balance edits, merge backups, silent reconciliations, PHP currency guard, and duplicate settle guard', async () => {
    const { token } = authResponseSchema.parse(
      (
        await jsonRequest('POST', '/v1/auth/register', {
          body: { name: 'Ledger User', email: 'ledger@example.com', password: 'password123' },
        })
      ).data,
    );
    const regBackup = authResponseSchema.parse(
      (
        await jsonRequest('POST', '/v1/auth/register', {
          body: { name: 'Backup Source', email: 'source@example.com', password: 'password123' },
        })
      ).data,
    );

    // 1. Reject non-PHP currencies on wallet & transaction creation
    const usdWalletRes = await jsonRequest('POST', '/v1/wallets', {
      token,
      body: { name: 'USD Stash', currency: 'USD', balanceMinor: 10000 },
    });
    expect(usdWalletRes.status).toBe(400);

    // 2. Create wallet with openingBalanceMinor and record tx, then edit openingBalanceMinor
    const gcash = walletSchema.parse(
      (
        await jsonRequest('POST', '/v1/wallets', {
          token,
          body: {
            name: 'GCash',
            type: 'EWALLET',
            openingBalanceMinor: 100000,
          },
        })
      ).data,
    );
    expect(gcash.openingBalanceMinor).toBe(100000);
    expect(gcash.balanceMinor).toBe(100000);

    const cats = categoriesResponseSchema.parse(
      (await jsonRequest('GET', '/v1/categories', { token })).data,
    );
    const groceriesCat = cats.find((c) => c.name === 'Groceries')!;
    const billsCat = cats.find((c) => c.name === 'Bills & Utilities')!;

    const usdTxRes = await jsonRequest('POST', '/v1/transactions', {
      token,
      body: {
        type: 'EXPENSE',
        amountMinor: 5000,
        currency: 'USD',
        walletId: gcash.id,
        categoryId: groceriesCat.id,
        occurredAt: '2026-11-10T10:00:00.000Z',
      },
    });
    expect(usdTxRes.status).toBe(400);

    await jsonRequest('POST', '/v1/transactions', {
      token,
      body: {
        type: 'EXPENSE',
        amountMinor: 25000,
        currency: 'PHP',
        walletId: gcash.id,
        categoryId: groceriesCat.id,
        occurredAt: '2026-11-10T10:00:00.000Z',
      },
    });

    const editedGcash = walletSchema.parse(
      (
        await jsonRequest('PATCH', `/v1/wallets/${gcash.id}`, {
          token,
          body: { openingBalanceMinor: 150000 },
        })
      ).data,
    );
    // Opening shifted by +50,000 -> balance shifts from 75,000 to 125,000
    expect(editedGcash.openingBalanceMinor).toBe(150000);
    expect(editedGcash.balanceMinor).toBe(125000);

    // 3. Merge import into an existing wallet that already has transactions (must sum, not clobber)
    const srcWallets = walletsResponseSchema.parse(
      (await jsonRequest('GET', '/v1/wallets', { token: regBackup.token })).data,
    );
    const srcCats = categoriesResponseSchema.parse(
      (await jsonRequest('GET', '/v1/categories', { token: regBackup.token })).data,
    );
    const srcChecking = srcWallets.find((w) => w.name === 'Checking')!;
    const srcSalary = srcCats.find((c) => c.name === 'Salary')!;

    // Source has +40,000 income on Checking
    await jsonRequest('POST', '/v1/transactions', {
      token: regBackup.token,
      body: {
        type: 'INCOME',
        amountMinor: 40000,
        walletId: srcChecking.id,
        categoryId: srcSalary.id,
        occurredAt: '2026-11-11T09:00:00.000Z',
      },
    });
    const srcExport = (
      await jsonRequest('GET', '/v1/portability/export', { token: regBackup.token })
    ).data;

    // Target user adds +10,000 income on their own Checking first (opening 0 -> balance 10,000)
    const targetWallets = walletsResponseSchema.parse(
      (await jsonRequest('GET', '/v1/wallets', { token })).data,
    );
    const targetChecking = targetWallets.find((w) => w.name === 'Checking')!;
    const targetSalary = cats.find((c) => c.name === 'Salary')!;
    await jsonRequest('POST', '/v1/transactions', {
      token,
      body: {
        type: 'INCOME',
        amountMinor: 10000,
        walletId: targetChecking.id,
        categoryId: targetSalary.id,
        occurredAt: '2026-11-12T09:00:00.000Z',
      },
    });

    const mergeRes = await jsonRequest('POST', '/v1/portability/import', {
      token,
      body: { envelope: srcExport, mode: 'merge' },
    });
    expect(mergeRes.status).toBe(200);

    const postMergeWallets = walletsResponseSchema.parse(
      (await jsonRequest('GET', '/v1/wallets', { token })).data,
    );
    const mergedChecking = postMergeWallets.find((w) => w.id === targetChecking.id)!;
    // Checking opening (0) + existing (+10,000) + imported (+40,000) = 50,000
    expect(mergedChecking.balanceMinor).toBe(50000);

    // 4. Silent reconciliation (createAdjustment: false) shifts openingBalanceMinor; adjusted keeps invariant
    const silentRec = applyReconciliationResponseSchema.parse(
      (
        await jsonRequest('POST', '/v1/reconciliations', {
          token,
          body: {
            walletId: gcash.id,
            actualBalanceMinor: 130000,
            createAdjustment: false,
            notes: 'Silent fix',
          },
        })
      ).data,
    );
    expect(silentRec.adjustmentTransaction).toBeUndefined();
    expect(silentRec.wallet.balanceMinor).toBe(130000);
    // Previous opening 150,000 + discrepancy +5,000 = 155,000
    expect(silentRec.wallet.openingBalanceMinor).toBe(155000);

    const adjRec = applyReconciliationResponseSchema.parse(
      (
        await jsonRequest('POST', '/v1/reconciliations', {
          token,
          body: {
            walletId: gcash.id,
            actualBalanceMinor: 140000,
            createAdjustment: true,
            notes: 'Interest credit',
          },
        })
      ).data,
    );
    expect(adjRec.adjustmentTransaction?.type).toBe('INCOME');
    expect(adjRec.wallet.balanceMinor).toBe(140000);
    expect(adjRec.wallet.openingBalanceMinor).toBe(155000);

    await jsonRequest('POST', '/v1/account/clear-transactions', { token });
    const clearedWallets = walletsResponseSchema.parse(
      (await jsonRequest('GET', '/v1/wallets', { token })).data,
    );
    expect(clearedWallets.every((w) => w.balanceMinor === w.openingBalanceMinor)).toBe(true);
    expect(clearedWallets.find((w) => w.id === gcash.id)?.balanceMinor).toBe(155000);

    // 5. Duplicate settle guard on recurring commitments -> 409 CONFLICT, no duplicate tx
    const commitment = recurringCommitmentSchema.parse(
      (
        await jsonRequest('POST', '/v1/recurring-commitments', {
          token,
          body: {
            name: 'Fiber Internet',
            type: 'EXPENSE',
            amountMinor: 150000,
            currency: 'PHP',
            walletId: targetChecking.id,
            categoryId: billsCat.id,
            frequency: 'MONTHLY',
            dueDay: 15,
            isAutoPaid: false,
            isActive: true,
          },
        })
      ).data,
    );

    const firstSettle = await jsonRequest(
      'POST',
      `/v1/recurring-commitments/${commitment.id}/settle`,
      {
        token,
        body: { periodMonth: '2026-11', recordTransaction: true },
      },
    );
    expect(firstSettle.status).toBe(200);

    const duplicateSettle = await jsonRequest(
      'POST',
      `/v1/recurring-commitments/${commitment.id}/settle`,
      {
        token,
        body: { periodMonth: '2026-11', recordTransaction: true },
      },
    );
    expect(duplicateSettle.status).toBe(409);

    const txsAfterDuplicateSettle = transactionsResponseSchema.parse(
      (await jsonRequest('GET', '/v1/transactions', { token })).data,
    );
    expect(txsAfterDuplicateSettle).toHaveLength(1);
  });
});
