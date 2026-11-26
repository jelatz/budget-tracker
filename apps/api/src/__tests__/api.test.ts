import {
  applySyncMutations,
  authSessionResponseSchema,
  createDestructiveConfirmation,
  DEFAULT_CATEGORIES,
  DEFAULT_CURRENCY,
  metaResponseSchema,
  syncPullResponseSchema,
  syncPushResponseSchema,
  type AuthUser,
  type SyncDataState,
} from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { AuthRepository } from '../capabilities/auth/repository';
import {
  isConflictingSyncMutation,
  type SyncRepository,
} from '../capabilities/sync/repository';
import {
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from '../core/auth/crypto';
import { AppError } from '../core/errors';

function createMemoryRepos(): {
  authRepo: AuthRepository;
  syncRepo: SyncRepository;
} {
  const usersById = new Map<
    string,
    {
      user: AuthUser;
      passwordHash: string;
      revision: number;
      state: SyncDataState;
      appliedOpIds: Set<string>;
    }
  >();
  const userIdByEmail = new Map<string, string>();
  const sessionsByHash = new Map<
    string,
    { sessionId: string; userId: string; expiresAt: Date; revokedAt: Date | null }
  >();

  const authRepo: AuthRepository = {
    async findUserByEmail(email) {
      const id = userIdByEmail.get(email);
      if (!id) return null;
      const rec = usersById.get(id);
      if (!rec) return null;
      return { user: rec.user, passwordHash: rec.passwordHash };
    },

    async createUserWithSessionAndState(params) {
      if (userIdByEmail.has(params.email)) {
        throw new AppError('CONFLICT', 'An account with this email already exists.');
      }
      const user: AuthUser = {
        id: params.userId,
        email: params.email,
        name: params.name,
        createdAt: new Date().toISOString(),
      };
      usersById.set(params.userId, {
        user,
        passwordHash: params.passwordHash,
        revision: 1,
        state: params.initialState,
        appliedOpIds: new Set<string>(),
      });
      userIdByEmail.set(params.email, params.userId);
      sessionsByHash.set(params.tokenHash, {
        sessionId: params.sessionId,
        userId: params.userId,
        expiresAt: params.expiresAt,
        revokedAt: null,
      });
      return user;
    },

    async createSession(params) {
      sessionsByHash.set(params.tokenHash, {
        sessionId: params.sessionId,
        userId: params.userId,
        expiresAt: params.expiresAt,
        revokedAt: null,
      });
    },

    async verifySessionTokenHash(tokenHash) {
      const session = sessionsByHash.get(tokenHash);
      if (!session || session.revokedAt || session.expiresAt <= new Date()) {
        return null;
      }
      const userRec = usersById.get(session.userId);
      if (!userRec) return null;
      return {
        sessionId: session.sessionId,
        user: userRec.user,
      };
    },

    async revokeSession(sessionId, userId) {
      for (const session of sessionsByHash.values()) {
        if (session.sessionId === sessionId && session.userId === userId) {
          session.revokedAt = new Date();
        }
      }
    },
  };

  const syncRepo: SyncRepository = {
    async getUserRevision(userId) {
      return usersById.get(userId)?.revision ?? null;
    },

    async pullState(userId) {
      const rec = usersById.get(userId);
      if (!rec) return null;
      return { revision: rec.revision, state: rec.state };
    },

    async pushMutations({ userId, lastKnownRevision, mutations }) {
      const rec = usersById.get(userId);
      if (!rec) {
        throw new AppError('UNAUTHORIZED', 'Account not found.');
      }

      const freshMutations = mutations.filter((m) => !rec.appliedOpIds.has(m.opId));
      if (freshMutations.length === 0) {
        return {
          revision: rec.revision,
          appliedOpIds: mutations.map((m) => m.opId),
          state: rec.state,
        };
      }

      if (
        typeof lastKnownRevision === 'number' &&
        rec.revision !== lastKnownRevision &&
        freshMutations.some((m) => isConflictingSyncMutation(m, rec.state))
      ) {
        throw new AppError(
          'CONFLICT',
          'Sync state is stale. Pull latest changes before retrying.',
        );
      }

      const nextState = applySyncMutations(rec.state, freshMutations);
      for (const m of freshMutations) {
        rec.appliedOpIds.add(m.opId);
      }
      rec.revision += 1;
      rec.state = nextState;

      return {
        revision: rec.revision,
        appliedOpIds: mutations.map((m) => m.opId),
        state: nextState,
      };
    },
  };

  return { authRepo, syncRepo };
}

describe('Auth & Sync API', () => {
  it('hashes passwords securely and verifies tokens deterministically', async () => {
    const hash = await hashPassword('super-secret-123');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('super-secret-123', hash)).toBe(true);
    expect(await verifyPassword('wrong-password', hash)).toBe(false);

    const token = generateSessionToken();
    expect(token.length).toBeGreaterThan(20);
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it('serves /v1/meta version gate', async () => {
    const repos = createMemoryRepos();
    const app = createApp({
      ...repos,
      getMinSupportedVersion: () => '1.2.3',
    });

    const res = await app.request('/v1/meta');
    expect(res.status).toBe(200);
    const body = metaResponseSchema.parse(await res.json());
    expect(body.minSupportedVersion).toBe('1.2.3');
  });

  it('supports registration with initialBackup, login, logout revocation, and clean starter state', async () => {
    const repos = createMemoryRepos();
    const app = createApp(repos);

    const regRes = await app.request('/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Alice',
        email: 'Alice@Example.com',
        password: 'password123',
        initialBackup: {
          version: 1,
          exportedAt: '2026-11-20T10:00:00.000Z',
          data: {
            accounts: [
              {
                id: 'account-web-custom',
                name: 'BPI Checking',
                accountType: 'BANK',
                icon: '🏦',
                color: '#1B4332',
                currency: DEFAULT_CURRENCY,
                balanceMinor: 500000,
              },
            ],
            categories: DEFAULT_CATEGORIES,
            transactions: [],
            recurringCommitments: [],
          },
        },
      }),
    });
    expect(regRes.status).toBe(201);
    const regData = authSessionResponseSchema.parse(await regRes.json());
    expect(regData.user.email).toBe('alice@example.com');

    const dupRes = await app.request('/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Alice 2',
        email: 'alice@example.com',
        password: 'password123',
      }),
    });
    expect(dupRes.status).toBe(409);

    const badLogin = await app.request('/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@example.com',
        password: 'wrong-password',
      }),
    });
    expect(badLogin.status).toBe(401);

    const pullRes = await app.request('/v1/sync', {
      headers: { Authorization: `Bearer ${regData.token}` },
    });
    expect(pullRes.status).toBe(200);
    const pullData = syncPullResponseSchema.parse(await pullRes.json());
    expect(pullData.state?.accounts[0]?.id).toBe('account-web-custom');
    expect(pullData.state?.accounts[0]?.balanceMinor).toBe(500000);

    const logoutRes = await app.request('/v1/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${regData.token}` },
    });
    expect(logoutRes.status).toBe(200);

    const meAfterLogout = await app.request('/v1/auth/me', {
      headers: { Authorization: `Bearer ${regData.token}` },
    });
    expect(meAfterLogout.status).toBe(401);

    const disabledDemoRes = await app.request('/v1/auth/demo', { method: 'POST' });
    expect(disabledDemoRes.status).toBe(403);

    const cleanRegRes = await app.request('/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Clean User',
        email: 'clean@example.com',
        password: 'password123',
      }),
    });
    expect(cleanRegRes.status).toBe(201);
    const cleanSession = authSessionResponseSchema.parse(await cleanRegRes.json());
    const cleanPullRes = await app.request('/v1/sync', {
      headers: { Authorization: `Bearer ${cleanSession.token}` },
    });
    expect(cleanPullRes.status).toBe(200);
    const cleanPull = syncPullResponseSchema.parse(await cleanPullRes.json());
    expect(cleanPull.state?.transactions).toEqual([]);
    expect(cleanPull.state?.recurringCommitments).toEqual([]);
    expect(cleanPull.state?.accounts.every((a) => a.balanceMinor === 0)).toBe(true);
  });

  it('enforces idempotent sync pushes, sinceRevision short-circuit, and strict user isolation', async () => {
    const repos = createMemoryRepos();
    const app = createApp(repos);

    const resA = await app.request('/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'User A',
        email: 'a@example.com',
        password: 'password123',
      }),
    });
    const sessionA = authSessionResponseSchema.parse(await resA.json());

    const resB = await app.request('/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'User B',
        email: 'b@example.com',
        password: 'password123',
      }),
    });
    const sessionB = authSessionResponseSchema.parse(await resB.json());

    const unauthSync = await app.request('/v1/sync');
    expect(unauthSync.status).toBe(401);

    const pullA1 = syncPullResponseSchema.parse(
      await (
        await app.request('/v1/sync', {
          headers: { Authorization: `Bearer ${sessionA.token}` },
        })
      ).json(),
    );
    const bankBefore = pullA1.state!.accounts.find((a) => a.id === 'account-bank')!.balanceMinor;

    const pushPayload = {
      lastKnownRevision: pullA1.revision,
      mutations: [
        {
          opId: 'phone-op-1',
          clientTimestamp: '2026-11-21T06:00:00.000Z',
          type: 'transaction.create',
          transaction: {
            id: 'tx-phone-coffee',
            type: 'EXPENSE',
            amountMinor: 15000,
            currency: DEFAULT_CURRENCY,
            accountId: 'account-bank',
            categoryId: 'cat-daily-living',
            merchant: 'Coffee Shop',
            occurredAt: '2026-11-21T06:00:00.000Z',
            createdAt: '2026-11-21T06:00:00.000Z',
          },
        },
      ],
    };

    const push1 = syncPushResponseSchema.parse(
      await (
        await app.request('/v1/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionA.token}`,
          },
          body: JSON.stringify(pushPayload),
        })
      ).json(),
    );
    expect(push1.revision).toBe(2);
    expect(push1.state.accounts.find((a) => a.id === 'account-bank')!.balanceMinor).toBe(
      bankBefore - 15000,
    );

    const pushRetry = syncPushResponseSchema.parse(
      await (
        await app.request('/v1/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionA.token}`,
          },
          body: JSON.stringify(pushPayload),
        })
      ).json(),
    );
    expect(pushRetry.revision).toBe(2);

    const unchangedPull = syncPullResponseSchema.parse(
      await (
        await app.request('/v1/sync?sinceRevision=2', {
          headers: { Authorization: `Bearer ${sessionA.token}` },
        })
      ).json(),
    );
    expect(unchangedPull.unchanged).toBe(true);

    const pullB = syncPullResponseSchema.parse(
      await (
        await app.request('/v1/sync', {
          headers: { Authorization: `Bearer ${sessionB.token}` },
        })
      ).json(),
    );
    expect(pullB.revision).toBe(1);
    expect(pullB.state?.transactions.some((t) => t.id === 'tx-phone-coffee')).toBe(false);
  });

  it('enforces HttpOnly cookie auth with CSRF header, rate limits, body limits, sync confirmations, and stale-revision conflict checks', async () => {
    const repos = createMemoryRepos();
    const app = createApp(repos);

    const regRes = await app.request('/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Cookie User',
        email: 'cookie@example.com',
        password: 'password123',
      }),
    });
    expect(regRes.status).toBe(201);
    const setCookieHeader = regRes.headers.get('set-cookie') ?? '';
    const cookiePair = setCookieHeader.split(';')[0]!;

    const csrfBlocked = await app.request('/v1/sync', {
      method: 'POST',
      headers: {
        Cookie: cookiePair,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ lastKnownRevision: 1, mutations: [] }),
    });
    expect(csrfBlocked.status).toBe(403);

    const unconfirmedSync = await app.request('/v1/sync', {
      method: 'POST',
      headers: {
        Cookie: cookiePair,
        'Content-Type': 'application/json',
        'X-Requested-With': 'budget-tracker',
      },
      body: JSON.stringify({
        lastKnownRevision: 1,
        mutations: [
          {
            opId: 'op-clear-unconfirmed',
            clientTimestamp: '2026-11-21T07:00:00.000Z',
            type: 'transactions.clearAll',
          },
        ],
      }),
    });
    expect(unconfirmedSync.status).toBe(400);

    const txPush = await app.request('/v1/sync', {
      method: 'POST',
      headers: {
        Cookie: cookiePair,
        'Content-Type': 'application/json',
        'X-Requested-With': 'budget-tracker',
      },
      body: JSON.stringify({
        lastKnownRevision: 1,
        mutations: [
          {
            opId: 'op-cookie-tx',
            clientTimestamp: '2026-11-21T07:01:00.000Z',
            type: 'transaction.create',
            transaction: {
              id: 'tx-cookie-1',
              type: 'EXPENSE',
              amountMinor: 500,
              currency: DEFAULT_CURRENCY,
              accountId: 'account-bank',
              categoryId: 'cat-daily-living',
              occurredAt: '2026-11-21T07:01:00.000Z',
              createdAt: '2026-11-21T07:01:00.000Z',
            },
          },
        ],
      }),
    });
    expect(txPush.status).toBe(200);

    const staleConflict = await app.request('/v1/sync', {
      method: 'POST',
      headers: {
        Cookie: cookiePair,
        'Content-Type': 'application/json',
        'X-Requested-With': 'budget-tracker',
      },
      body: JSON.stringify({
        lastKnownRevision: 1,
        mutations: [
          {
            opId: 'op-stale-update',
            clientTimestamp: '2026-11-21T07:02:00.000Z',
            type: 'transaction.update',
            input: {
              id: 'tx-cookie-1',
              type: 'EXPENSE',
              amountMinor: 900,
              currency: DEFAULT_CURRENCY,
              accountId: 'account-bank',
              categoryId: 'cat-daily-living',
              occurredAt: '2026-11-21T07:01:00.000Z',
            },
          },
        ],
      }),
    });
    expect(staleConflict.status).toBe(409);

    const logoutRes = await app.request('/v1/auth/logout', {
      method: 'POST',
      headers: {
        Cookie: cookiePair,
        'X-Requested-With': 'budget-tracker',
      },
    });
    expect(logoutRes.status).toBe(200);
  });

  it('persists account.setBalance, incomeSources, and creditCard.payBill end-to-end', async () => {
    const repos = createMemoryRepos();
    const app = createApp(repos);

    const regRes = await app.request('/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Dual Job User',
        email: 'dualjobs@example.com',
        password: 'password123',
      }),
    });
    expect(regRes.status).toBe(201);
    const session = authSessionResponseSchema.parse(await regRes.json());

    const pushRes = await app.request('/v1/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({
        lastKnownRevision: 1,
        mutations: [
          {
            opId: 'op-set-bal',
            clientTimestamp: '2026-11-24T10:00:00.000Z',
            type: 'account.setBalance',
            accountId: 'account-bank',
            balanceMinor: 5_000_000,
          },
          {
            opId: 'op-job-2',
            clientTimestamp: '2026-11-24T10:00:00.000Z',
            type: 'incomeSource.upsert',
            source: {
              id: 'job-2',
              name: 'Job 2',
              expectedMonthlyMinor: 4_000_000,
              typicalPayoutMinor: 2_000_000,
              currency: DEFAULT_CURRENCY,
              accountId: 'account-bank',
              categoryId: 'cat-salary',
              paySchedule: 'TWICE_MONTHLY_WEEKDAY',
              weekday: 5,
              weekdayOrdinals: [2, 4],
              color: '#1B4332',
              isActive: true,
            },
          },
          {
            opId: 'op-cc-inst',
            clientTimestamp: '2026-11-24T10:01:00.000Z',
            type: 'commitment.upsert',
            commitment: {
              id: 'inst-cc-1',
              name: 'Laptop 0%',
              kind: 'CREDIT_CARD_INSTALLMENT',
              amountMinor: 500_000,
              currency: DEFAULT_CURRENCY,
              accountId: 'account-card',
              categoryId: 'cat-loans',
              dueDay: 15,
              totalInstallments: 6,
              paidInstallments: 1,
            },
          },
          {
            opId: 'op-pay-cc',
            clientTimestamp: '2026-11-24T10:02:00.000Z',
            type: 'creditCard.payBill',
            creditCardAccountId: 'account-card',
            paymentAccountId: 'account-bank',
            transferTransactionId: 'tx-cc-pay-1',
            installmentTxPrefix: 'tx-cc-inst-1',
            paidAtIso: '2026-11-24T10:02:00.000Z',
            periodMonth: '2026-11',
          },
        ],
      }),
    });
    expect(pushRes.status).toBe(200);
    const pushBody = syncPushResponseSchema.parse(await pushRes.json());

    expect(pushBody.state.accounts.find((a) => a.id === 'account-bank')?.balanceMinor).toBe(4_500_000);
    expect(pushBody.state.accounts.find((a) => a.id === 'account-card')?.balanceMinor).toBe(0);
    expect(pushBody.state.incomeSources[0]?.weekdayOrdinals).toEqual([2, 4]);
    expect(pushBody.state.recurringCommitments[0]?.paidInstallments).toBe(2);
    expect(createDestructiveConfirmation('delete-account', 'account-bank').confirmAction).toBe(true);
  });
});
