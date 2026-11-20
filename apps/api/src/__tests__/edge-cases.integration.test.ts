import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  applyReconciliationResponseSchema,
  authMeResponseSchema,
  authResponseSchema,
  backupEnvelopeSchema,
  categoriesResponseSchema,
  contributeSinkingFundResponseSchema,
  metaResponseSchema,
  quickPresetSchema,
  safeToSpendMetricsSchema,
  settleRecurringCommitmentResponseSchema,
  sinkingFundSchema,
  transactionSchema,
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
  options: { token?: string; headers?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; data: unknown }> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
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

async function registerUser(name: string, email: string, password = 'password123') {
  const res = await jsonRequest('POST', '/v1/auth/register', {
    body: { name, email, password },
  });
  expect(res.status).toBe(201);
  return authResponseSchema.parse(res.data);
}

describe('Universal App Testing — API Edge-Case Integration Suite', () => {
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

  it('TC-01 & TC-06: validates auth trim/lowercase/bounds, duplicate email 409, and strict response schemas', async () => {
    const health = await jsonRequest('GET', '/health');
    expect(health.status).toBe(200);
    const meta = await jsonRequest('GET', '/v1/meta');
    expect(meta.status).toBe(200);
    expect(metaResponseSchema.parse(meta.data).minSupportedVersion).toBe('1.0.0');

    // Valid registration with surrounding whitespace & uppercase email
    const reg = await jsonRequest('POST', '/v1/auth/register', {
      body: {
        name: "  Dana O'Neil  ",
        email: '  DANA+QA@EXAMPLE.COM  ',
        password: 'secret1',
      },
    });
    expect(reg.status).toBe(201);
    const parsed = authResponseSchema.parse(reg.data);
    expect(parsed.user.name).toBe("Dana O'Neil");
    expect(parsed.user.email).toBe('dana+qa@example.com');
    expect((reg.data as { user: Record<string, unknown> }).user.passwordHash).toBeUndefined();

    // Invalid payloads -> 400
    for (const badBody of [
      { name: '   ', email: 'ok@example.com', password: 'secret1' },
      { name: 'a'.repeat(81), email: 'ok@example.com', password: 'secret1' },
      { name: 'Dana', email: 'qa@localhost', password: 'secret1' },
      { name: 'Dana', email: 'ok2@example.com', password: '12345' },
    ]) {
      const bad = await jsonRequest('POST', '/v1/auth/register', { body: badBody });
      expect(bad.status).toBe(400);
    }

    // Case-insensitive duplicate email -> 409
    const dup = await jsonRequest('POST', '/v1/auth/register', {
      body: { name: 'Other Dana', email: 'dana+qa@example.com', password: 'secret1' },
    });
    expect(dup.status).toBe(409);

    const me = await jsonRequest('GET', '/v1/auth/me', { token: parsed.token });
    expect(me.status).toBe(200);
    expect(authMeResponseSchema.parse(me.data).user.email).toBe('dana+qa@example.com');
  });

  it('TC-03, TC-04, TC-07 & TC-08: enforces input boundaries, mass-assignment stripping, and atomic tx update/delete side effects', async () => {
    const auth = await registerUser('Alice', 'alice@example.com');
    const wallets = walletsResponseSchema.parse(
      (await jsonRequest('GET', '/v1/wallets', { token: auth.token })).data,
    );
    const categories = categoriesResponseSchema.parse(
      (await jsonRequest('GET', '/v1/categories', { token: auth.token })).data,
    );
    const w1 = wallets[0]!;
    const w2 = wallets[1]!;
    const expCat = categories.find((c) => c.type === 'EXPENSE')!;
    const initialUsage = expCat.usageCount;

    // TC-03: invalid transaction payloads leave balances untouched
    for (const badTx of [
      {
        type: 'EXPENSE',
        amountMinor: 1000,
        currency: 'USD',
        walletId: w1.id,
        categoryId: expCat.id,
        occurredAt: '2026-11-20T10:00:00.000Z',
      },
      {
        type: 'EXPENSE',
        amountMinor: 0,
        currency: 'PHP',
        walletId: w1.id,
        categoryId: expCat.id,
        occurredAt: '2026-11-20T10:00:00.000Z',
      },
      {
        type: 'TRANSFER',
        amountMinor: 1000,
        currency: 'PHP',
        walletId: w1.id,
        toWalletId: w1.id,
        occurredAt: '2026-11-20T10:00:00.000Z',
      },
      {
        type: 'EXPENSE',
        amountMinor: 1000,
        currency: 'PHP',
        walletId: w1.id,
        splits: [
          { categoryId: expCat.id, amountMinor: 400 },
          { categoryId: categories.find((c) => c.type === 'EXPENSE' && c.id !== expCat.id)!.id, amountMinor: 500 },
        ],
        occurredAt: '2026-11-20T10:00:00.000Z',
      },
    ]) {
      const res = await jsonRequest('POST', '/v1/transactions', {
        token: auth.token,
        body: badTx,
      });
      expect(res.status).toBe(400);
    }

    // TC-04: Unicode + XSS literal wallet name & negative credit-card opening balance
    const ccRes = await jsonRequest('POST', '/v1/wallets', {
      token: auth.token,
      body: {
        name: 'Card 💳 <script>alert(1)</script>',
        type: 'CREDIT_CARD',
        openingBalanceMinor: -50000,
      },
    });
    expect(ccRes.status).toBe(201);
    const ccWallet = walletSchema.parse(ccRes.data);
    expect(ccWallet.name).toBe('Card 💳 <script>alert(1)</script>');
    expect(ccWallet.balanceMinor).toBe(-50000);

    // Monthly budget 0 rejected, positive accepted
    expect(
      (
        await jsonRequest('PATCH', '/v1/settings/monthly-budget', {
          token: auth.token,
          body: { monthlyBudgetMinor: 0 },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await jsonRequest('PATCH', '/v1/settings/monthly-budget', {
          token: auth.token,
          body: { monthlyBudgetMinor: 5000000 },
        })
      ).status,
    ).toBe(200);

    // TC-07: Mass-assignment stripping on PATCH /v1/wallets/:id
    const patchRes = await jsonRequest('PATCH', `/v1/wallets/${ccWallet.id}`, {
      token: auth.token,
      body: {
        name: 'Renamed Card',
        currency: 'USD',
        userId: 'other-user-id',
        balanceMinor: 99999999,
      },
    });
    expect(patchRes.status).toBe(200);
    const patchedWallet = walletSchema.parse(patchRes.data);
    expect(patchedWallet.name).toBe('Renamed Card');
    expect(patchedWallet.currency).toBe('PHP');
    expect(patchedWallet.balanceMinor).toBe(-50000);

    // TC-08: Create EXPENSE -> Update to TRANSFER -> Delete reverses balances and usageCount
    const createTx = await jsonRequest('POST', '/v1/transactions', {
      token: auth.token,
      body: {
        type: 'EXPENSE',
        amountMinor: 50000,
        currency: 'PHP',
        walletId: w1.id,
        categoryId: expCat.id,
        occurredAt: '2026-11-20T10:00:00.000Z',
      },
    });
    expect(createTx.status).toBe(201);
    const created = transactionSchema.parse(createTx.data);

    const afterCreateWallets = walletsResponseSchema.parse(
      (await jsonRequest('GET', '/v1/wallets', { token: auth.token })).data,
    );
    expect(afterCreateWallets.find((w) => w.id === w1.id)?.balanceMinor).toBe(
      w1.balanceMinor - 50000,
    );

    const updTx = await jsonRequest('PUT', `/v1/transactions/${created.id}`, {
      token: auth.token,
      body: {
        type: 'TRANSFER',
        amountMinor: 20000,
        currency: 'PHP',
        walletId: w1.id,
        toWalletId: w2.id,
        occurredAt: '2026-11-20T11:00:00.000Z',
      },
    });
    expect(updTx.status).toBe(200);

    const afterUpdWallets = walletsResponseSchema.parse(
      (await jsonRequest('GET', '/v1/wallets', { token: auth.token })).data,
    );
    expect(afterUpdWallets.find((w) => w.id === w1.id)?.balanceMinor).toBe(
      w1.balanceMinor - 20000,
    );
    expect(afterUpdWallets.find((w) => w.id === w2.id)?.balanceMinor).toBe(
      w2.balanceMinor + 20000,
    );

    const delTx = await jsonRequest('DELETE', `/v1/transactions/${created.id}`, {
      token: auth.token,
    });
    expect(delTx.status).toBe(200);

    const afterDelWallets = walletsResponseSchema.parse(
      (await jsonRequest('GET', '/v1/wallets', { token: auth.token })).data,
    );
    expect(afterDelWallets.find((w) => w.id === w1.id)?.balanceMinor).toBe(w1.balanceMinor);
    expect(afterDelWallets.find((w) => w.id === w2.id)?.balanceMinor).toBe(w2.balanceMinor);

    const afterDelCats = categoriesResponseSchema.parse(
      (await jsonRequest('GET', '/v1/categories', { token: auth.token })).data,
    );
    expect(afterDelCats.find((c) => c.id === expCat.id)?.usageCount).toBe(initialUsage);
  });

  it('TC-10, TC-11 & TC-12: enforces auth fail-closed (missing/malformed/revoked/expired) and strict cross-user IDOR isolation', async () => {
    const userA = await registerUser('User A', 'usera@example.com');
    const userB = await registerUser('User B', 'userb@example.com');

    // TC-10: Missing, Basic, random token -> 401
    for (const protectedPath of [
      '/v1/wallets',
      '/v1/transactions',
      '/v1/safe-to-spend',
      '/v1/portability/export',
    ]) {
      expect((await jsonRequest('GET', protectedPath)).status).toBe(401);
      expect(
        (await jsonRequest('GET', protectedPath, { headers: { Authorization: 'Basic abc' } }))
          .status,
      ).toBe(401);
      expect((await jsonRequest('GET', protectedPath, { token: 'random-invalid' })).status).toBe(
        401,
      );
    }

    // Revoked session -> 401
    const tempUser = await registerUser('Temp', 'temp@example.com');
    expect((await jsonRequest('POST', '/v1/auth/logout', { token: tempUser.token })).status).toBe(
      200,
    );
    expect((await jsonRequest('GET', '/v1/wallets', { token: tempUser.token })).status).toBe(401);

    // Expired session -> 401
    const expUser = await registerUser('Expired', 'expired@example.com');
    await db
      .update(schema.sessions)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(schema.sessions.userId, expUser.user.id));
    expect((await jsonRequest('GET', '/v1/wallets', { token: expUser.token })).status).toBe(401);

    // Seed resources for User A
    const aWallets = walletsResponseSchema.parse(
      (await jsonRequest('GET', '/v1/wallets', { token: userA.token })).data,
    );
    const aCats = categoriesResponseSchema.parse(
      (await jsonRequest('GET', '/v1/categories', { token: userA.token })).data,
    );
    const bWallets = walletsResponseSchema.parse(
      (await jsonRequest('GET', '/v1/wallets', { token: userB.token })).data,
    );
    const aExpCat = aCats.find((c) => c.type === 'EXPENSE')!;

    const aTx = transactionSchema.parse(
      (
        await jsonRequest('POST', '/v1/transactions', {
          token: userA.token,
          body: {
            type: 'EXPENSE',
            amountMinor: 15000,
            currency: 'PHP',
            walletId: aWallets[0]!.id,
            categoryId: aExpCat.id,
            occurredAt: '2026-11-20T10:00:00.000Z',
          },
        })
      ).data,
    );

    const aBudget = (
      await jsonRequest('POST', '/v1/category-budgets', {
        token: userA.token,
        body: { categoryId: aExpCat.id, periodMonth: '2026-11', assignedMinor: 100000 },
      })
    ).data as { id: string };

    const aRc = (
      await jsonRequest('POST', '/v1/recurring-commitments', {
        token: userA.token,
        body: {
          name: 'Fiber',
          amountMinor: 150000,
          walletId: aWallets[0]!.id,
          categoryId: aExpCat.id,
          dueDay: 15,
        },
      })
    ).data as { id: string };

    const aSf = sinkingFundSchema.parse(
      (
        await jsonRequest('POST', '/v1/sinking-funds', {
          token: userA.token,
          body: {
            name: 'Travel',
            targetAmountMinor: 500000,
            targetDate: '2027-06',
            walletId: aWallets[0]!.id,
          },
        })
      ).data,
    );

    const aPreset = quickPresetSchema.parse(
      (
        await jsonRequest('POST', '/v1/quick-presets', {
          token: userA.token,
          body: {
            label: 'A Coffee',
            icon: '☕',
            type: 'EXPENSE',
            amountMinor: 15000,
            walletId: aWallets[0]!.id,
            categoryId: aExpCat.id,
          },
        })
      ).data,
    );

    // TC-11: User B IDOR against User A wallets, transactions, reconciliations
    expect(
      (
        await jsonRequest('PATCH', `/v1/wallets/${aWallets[0]!.id}`, {
          token: userB.token,
          body: { name: 'Hacked' },
        })
      ).status,
    ).toBe(404);
    expect(
      (await jsonRequest('DELETE', `/v1/wallets/${aWallets[0]!.id}`, { token: userB.token }))
        .status,
    ).toBe(404);
    expect(
      (
        await jsonRequest('POST', '/v1/transactions', {
          token: userB.token,
          body: {
            type: 'EXPENSE',
            amountMinor: 5000,
            currency: 'PHP',
            walletId: aWallets[0]!.id,
            categoryId: aExpCat.id,
            occurredAt: '2026-11-20T10:00:00.000Z',
          },
        })
      ).status,
    ).toBe(404);
    expect(
      (await jsonRequest('DELETE', `/v1/transactions/${aTx.id}`, { token: userB.token })).status,
    ).toBe(404);
    expect(
      (
        await jsonRequest('POST', '/v1/reconciliations', {
          token: userB.token,
          body: { walletId: aWallets[0]!.id, actualBalanceMinor: 0 },
        })
      ).status,
    ).toBe(404);

    // TC-12: User B IDOR against User A planning endpoints
    expect(
      (
        await jsonRequest('POST', '/v1/category-budgets', {
          token: userB.token,
          body: { categoryId: aExpCat.id, periodMonth: '2026-11', assignedMinor: 10000 },
        })
      ).status,
    ).toBe(404);
    expect(
      (await jsonRequest('DELETE', `/v1/category-budgets/${aBudget.id}`, { token: userB.token }))
        .status,
    ).toBe(404);
    expect(
      (
        await jsonRequest('POST', `/v1/recurring-commitments/${aRc.id}/settle`, {
          token: userB.token,
          body: { periodMonth: '2026-11', recordTransaction: true },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await jsonRequest('POST', `/v1/recurring-commitments/${aRc.id}/unmark`, {
          token: userB.token,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await jsonRequest('POST', `/v1/sinking-funds/${aSf.id}/contribute`, {
          token: userB.token,
          body: { amountMinor: 10000, sourceWalletId: bWallets[0]!.id },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await jsonRequest('POST', '/v1/quick-presets', {
          token: userB.token,
          body: {
            label: 'Stolen Wallet Preset',
            icon: '☕',
            type: 'EXPENSE',
            amountMinor: 10000,
            walletId: aWallets[0]!.id,
          },
        })
      ).status,
    ).toBe(404);
    expect(
      (await jsonRequest('DELETE', `/v1/quick-presets/${aPreset.id}`, { token: userB.token }))
        .status,
    ).toBe(404);
  });

  it('TC-13, TC-14 & TC-15: enforces wallet delete guards, stale-ID 404s, and batch atomicity rollback', async () => {
    const auth = await registerUser('Bob', 'bob@example.com');
    const wallets = walletsResponseSchema.parse(
      (await jsonRequest('GET', '/v1/wallets', { token: auth.token })).data,
    );
    const cats = categoriesResponseSchema.parse(
      (await jsonRequest('GET', '/v1/categories', { token: auth.token })).data,
    );
    const expCat = cats.find((c) => c.type === 'EXPENSE')!;

    // Create two extra unreferenced wallets
    const extraW1 = walletSchema.parse(
      (
        await jsonRequest('POST', '/v1/wallets', {
          token: auth.token,
          body: { name: 'Temp Wallet 1', openingBalanceMinor: 10000 },
        })
      ).data,
    );
    const extraW2 = walletSchema.parse(
      (
        await jsonRequest('POST', '/v1/wallets', {
          token: auth.token,
          body: { name: 'Temp Wallet 2', openingBalanceMinor: 20000 },
        })
      ).data,
    );

    // Link extraW1 to a transaction -> delete blocked 409
    await jsonRequest('POST', '/v1/transactions', {
      token: auth.token,
      body: {
        type: 'EXPENSE',
        amountMinor: 5000,
        currency: 'PHP',
        walletId: extraW1.id,
        categoryId: expCat.id,
        occurredAt: '2026-11-20T10:00:00.000Z',
      },
    });
    expect(
      (await jsonRequest('DELETE', `/v1/wallets/${extraW1.id}`, { token: auth.token })).status,
    ).toBe(409);

    // Link extraW2 to a sinking fund -> delete blocked 409
    const sf = sinkingFundSchema.parse(
      (
        await jsonRequest('POST', '/v1/sinking-funds', {
          token: auth.token,
          body: {
            name: 'Linked Fund',
            targetAmountMinor: 100000,
            targetDate: '2027-01',
            walletId: extraW2.id,
          },
        })
      ).data,
    );
    expect(
      (await jsonRequest('DELETE', `/v1/wallets/${extraW2.id}`, { token: auth.token })).status,
    ).toBe(409);

    // Remove sinking fund -> now extraW2 can be deleted cleanly
    expect(
      (await jsonRequest('DELETE', `/v1/sinking-funds/${sf.id}`, { token: auth.token })).status,
    ).toBe(200);
    expect(
      (await jsonRequest('DELETE', `/v1/wallets/${extraW2.id}`, { token: auth.token })).status,
    ).toBe(200);

    // TC-14: Nonexistent / stale IDs return deterministic 404
    for (const [method, endpoint, body] of [
      ['DELETE', '/v1/transactions/nonexistent-id', undefined],
      ['DELETE', '/v1/category-budgets/nonexistent-id', undefined],
      ['DELETE', '/v1/sinking-funds/nonexistent-id', undefined],
      ['DELETE', '/v1/quick-presets/nonexistent-id', undefined],
      [
        'POST',
        '/v1/recurring-commitments/nonexistent-id/settle',
        { periodMonth: '2026-11', recordTransaction: false },
      ],
      [
        'POST',
        '/v1/sinking-funds/nonexistent-id/contribute',
        { amountMinor: 1000, sourceWalletId: wallets[0]!.id },
      ],
    ] as const) {
      expect((await jsonRequest(method, endpoint, { token: auth.token, body })).status).toBe(404);
    }

    // TC-15: Batch create rolls back atomically when item 2 fails
    const w0Before = walletsResponseSchema
      .parse((await jsonRequest('GET', '/v1/wallets', { token: auth.token })).data)
      .find((w) => w.id === wallets[0]!.id)!;
    const txsBefore = (
      await jsonRequest('GET', '/v1/transactions', { token: auth.token })
    ).data as unknown[];

    const batchFail = await jsonRequest('POST', '/v1/transactions/batch', {
      token: auth.token,
      body: {
        transactions: [
          {
            type: 'EXPENSE',
            amountMinor: 10000,
            currency: 'PHP',
            walletId: wallets[0]!.id,
            categoryId: expCat.id,
            occurredAt: '2026-11-20T10:00:00.000Z',
          },
          {
            type: 'EXPENSE',
            amountMinor: 5000,
            currency: 'PHP',
            walletId: 'missing-wallet-id',
            categoryId: expCat.id,
            occurredAt: '2026-11-20T10:05:00.000Z',
          },
        ],
      },
    });
    expect(batchFail.status).toBe(404);

    const w0After = walletsResponseSchema
      .parse((await jsonRequest('GET', '/v1/wallets', { token: auth.token })).data)
      .find((w) => w.id === wallets[0]!.id)!;
    const txsAfter = (
      await jsonRequest('GET', '/v1/transactions', { token: auth.token })
    ).data as unknown[];
    expect(w0After.balanceMinor).toBe(w0Before.balanceMinor);
    expect(txsAfter).toHaveLength(txsBefore.length);
  });

  it('TC-16, TC-17, TC-25, TC-26, TC-27, TC-31 & TC-32: covers CAS concurrency, calendar date validation, workflows, reconciliations, portability & presets', async () => {
    // TC-17: Concurrent duplicate registration race
    const [r1, r2] = await Promise.all([
      jsonRequest('POST', '/v1/auth/register', {
        body: { name: 'Racer 1', email: 'race@example.com', password: 'password123' },
      }),
      jsonRequest('POST', '/v1/auth/register', {
        body: { name: 'Racer 2', email: 'RACE@EXAMPLE.COM', password: 'password123' },
      }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);

    const auth = authResponseSchema.parse(r1.status === 201 ? r1.data : r2.data);
    const wallets = walletsResponseSchema.parse(
      (await jsonRequest('GET', '/v1/wallets', { token: auth.token })).data,
    );
    const cats = categoriesResponseSchema.parse(
      (await jsonRequest('GET', '/v1/categories', { token: auth.token })).data,
    );
    const expCat = cats.find((c) => c.type === 'EXPENSE')!;

    // TC-25: Invalid calendar months & dates rejected 400; leap year accepted 200
    expect(
      (
        await jsonRequest('POST', '/v1/category-budgets', {
          token: auth.token,
          body: { categoryId: expCat.id, periodMonth: '2026-13', assignedMinor: 50000 },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await jsonRequest('POST', '/v1/category-budgets', {
          token: auth.token,
          body: { categoryId: expCat.id, periodMonth: '2026-00', assignedMinor: 50000 },
        })
      ).status,
    ).toBe(400);
    expect(
      (await jsonRequest('GET', '/v1/safe-to-spend?date=2026-02-30', { token: auth.token })).status,
    ).toBe(400);
    expect(
      (await jsonRequest('GET', '/v1/safe-to-spend?date=2026-13-01', { token: auth.token })).status,
    ).toBe(400);
    const leapRes = await jsonRequest('GET', '/v1/safe-to-spend?date=2028-02-29', {
      token: auth.token,
    });
    expect(leapRes.status).toBe(200);
    expect(safeToSpendMetricsSchema.parse(leapRes.data).daysRemainingInMonth).toBe(1);

    // TC-16 & TC-26: CAS double-settle guard & idempotent unmark
    const rc = (
      await jsonRequest('POST', '/v1/recurring-commitments', {
        token: auth.token,
        body: {
          name: 'Electricity',
          amountMinor: 250000,
          walletId: wallets[0]!.id,
          categoryId: expCat.id,
          dueDay: 18,
        },
      })
    ).data as { id: string };

    const [s1, s2] = await Promise.all([
      jsonRequest('POST', `/v1/recurring-commitments/${rc.id}/settle`, {
        token: auth.token,
        body: { periodMonth: '2026-11', recordTransaction: true },
      }),
      jsonRequest('POST', `/v1/recurring-commitments/${rc.id}/settle`, {
        token: auth.token,
        body: { periodMonth: '2026-11', recordTransaction: true },
      }),
    ]);
    expect([s1.status, s2.status].sort()).toEqual([200, 409]);
    const winner = s1.status === 200 ? s1.data : s2.data;
    expect(settleRecurringCommitmentResponseSchema.parse(winner).transaction).toBeDefined();

    // Unmark twice idempotently
    expect(
      (
        await jsonRequest('POST', `/v1/recurring-commitments/${rc.id}/unmark`, {
          token: auth.token,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await jsonRequest('POST', `/v1/recurring-commitments/${rc.id}/unmark`, {
          token: auth.token,
        })
      ).status,
    ).toBe(200);

    // TC-26: Sinking fund same-wallet vs cross-wallet contribution + target completion
    const sf = sinkingFundSchema.parse(
      (
        await jsonRequest('POST', '/v1/sinking-funds', {
          token: auth.token,
          body: {
            name: 'Laptop',
            targetAmountMinor: 100000,
            targetDate: '2027-06',
            walletId: wallets[1]!.id,
          },
        })
      ).data,
    );
    const sameWalletContrib = contributeSinkingFundResponseSchema.parse(
      (
        await jsonRequest('POST', `/v1/sinking-funds/${sf.id}/contribute`, {
          token: auth.token,
          body: { amountMinor: 40000, sourceWalletId: wallets[1]!.id },
        })
      ).data,
    );
    expect(sameWalletContrib.transaction).toBeUndefined();
    expect(sameWalletContrib.fund.isCompleted).toBe(false);

    const crossWalletContrib = contributeSinkingFundResponseSchema.parse(
      (
        await jsonRequest('POST', `/v1/sinking-funds/${sf.id}/contribute`, {
          token: auth.token,
          body: { amountMinor: 70000, sourceWalletId: wallets[0]!.id },
        })
      ).data,
    );
    expect(crossWalletContrib.transaction?.type).toBe('TRANSFER');
    expect(crossWalletContrib.transaction?.tags).toContain('sinking-fund');
    expect(crossWalletContrib.fund.currentSavedMinor).toBe(110000);
    expect(crossWalletContrib.fund.isCompleted).toBe(true);

    // TC-27: Zero-delta reconciliation, createAdjustment: false, and createAdjustment: true
    const currentW0 = walletsResponseSchema
      .parse((await jsonRequest('GET', '/v1/wallets', { token: auth.token })).data)
      .find((w) => w.id === wallets[0]!.id)!;

    const zeroRec = applyReconciliationResponseSchema.parse(
      (
        await jsonRequest('POST', '/v1/reconciliations', {
          token: auth.token,
          body: { walletId: currentW0.id, actualBalanceMinor: currentW0.balanceMinor },
        })
      ).data,
    );
    expect(zeroRec.reconciliation.discrepancyMinor).toBe(0);
    expect(zeroRec.adjustmentTransaction).toBeUndefined();

    const noAdjRec = applyReconciliationResponseSchema.parse(
      (
        await jsonRequest('POST', '/v1/reconciliations', {
          token: auth.token,
          body: {
            walletId: currentW0.id,
            actualBalanceMinor: currentW0.balanceMinor + 5000,
            createAdjustment: false,
          },
        })
      ).data,
    );
    expect(noAdjRec.adjustmentTransaction).toBeUndefined();
    expect(noAdjRec.wallet.openingBalanceMinor).toBe((currentW0.openingBalanceMinor ?? 0) + 5000);
    expect(noAdjRec.wallet.balanceMinor).toBe(currentW0.balanceMinor + 5000);

    const withAdjRec = applyReconciliationResponseSchema.parse(
      (
        await jsonRequest('POST', '/v1/reconciliations', {
          token: auth.token,
          body: {
            walletId: currentW0.id,
            actualBalanceMinor: noAdjRec.wallet.balanceMinor - 3000,
            createAdjustment: true,
          },
        })
      ).data,
    );
    expect(withAdjRec.adjustmentTransaction?.type).toBe('EXPENSE');
    expect(withAdjRec.adjustmentTransaction?.tags).toContain('reconciliation');
    expect(withAdjRec.wallet.balanceMinor).toBe(noAdjRec.wallet.balanceMinor - 3000);

    // TC-32: Quick preset cross-field 400
    expect(
      (
        await jsonRequest('POST', '/v1/quick-presets', {
          token: auth.token,
          body: {
            label: 'Bad Self Transfer',
            icon: '🔄',
            type: 'TRANSFER',
            amountMinor: 10000,
            walletId: wallets[0]!.id,
            toWalletId: wallets[0]!.id,
          },
        })
      ).status,
    ).toBe(400);

    // TC-31: Export, invalid v2 import rejection, clear-transactions & reset-demo
    const exported = backupEnvelopeSchema.parse(
      (await jsonRequest('GET', '/v1/portability/export', { token: auth.token })).data,
    );
    expect(
      (
        await jsonRequest('POST', '/v1/portability/import', {
          token: auth.token,
          body: { envelope: { ...exported, version: 2 }, mode: 'merge' },
        })
      ).status,
    ).toBe(400);

    expect(
      (await jsonRequest('POST', '/v1/account/clear-transactions', { token: auth.token })).status,
    ).toBe(200);
    const clearedWallets = walletsResponseSchema.parse(
      (await jsonRequest('GET', '/v1/wallets', { token: auth.token })).data,
    );
    for (const w of clearedWallets) {
      expect(w.balanceMinor).toBe(w.openingBalanceMinor);
    }

    expect(
      (await jsonRequest('POST', '/v1/account/reset-demo', { token: auth.token })).status,
    ).toBe(200);
    expect(
      ((await jsonRequest('GET', '/v1/transactions', { token: auth.token })).data as unknown[])
        .length,
    ).toBeGreaterThanOrEqual(6);
  });
});
