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

  it('supports registration with initialBackup, login, logout revocation, and demo login', async () => {
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
                color: '#208AEF',
                currency: DEFAULT_CURRENCY,
                balanceMinor: 500000,
              },
            ],
            categories: DEFAULT_CATEGORIES,
            transactions: [],
            categoryBudgets: [],
            recurringCommitments: [],
            sinkingFunds: [],
            quickPresets: [],
          },
        },
      }),
    });
    expect(regRes.status).toBe(201);
    const regData = authSessionResponseSchema.parse(await regRes.json());
    expect(regData.user.email).toBe('alice@example.com');

    // Duplicate email returns 409
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

    // Wrong password returns 401
    const badLogin = await app.request('/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@example.com',
        password: 'wrong-password',
      }),
    });
    expect(badLogin.status).toBe(401);

    // Pull confirms initialBackup persisted
    const pullRes = await app.request('/v1/sync', {
      headers: { Authorization: `Bearer ${regData.token}` },
    });
    expect(pullRes.status).toBe(200);
    const pullData = syncPullResponseSchema.parse(await pullRes.json());
    expect(pullData.state?.accounts[0]?.id).toBe('account-web-custom');
    expect(pullData.state?.accounts[0]?.balanceMinor).toBe(500000);

    // Logout revokes token
    const logoutRes = await app.request('/v1/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${regData.token}` },
    });
    expect(logoutRes.status).toBe(200);

    const meAfterLogout = await app.request('/v1/auth/me', {
      headers: { Authorization: `Bearer ${regData.token}` },
    });
    expect(meAfterLogout.status).toBe(401);

    // Unauthenticated /v1/auth/demo is disabled by default and even when flag is set
    const disabledDemoRes = await app.request('/v1/auth/demo', { method: 'POST' });
    expect(disabledDemoRes.status).toBe(403);

    const demoApp = createApp({
      ...repos,
      allowDemoEndpoint: () => true,
    });
    const enabledDemoRes = await demoApp.request('/v1/auth/demo', { method: 'POST' });
    expect(enabledDemoRes.status).toBe(403);

    // Nonexistent demo@budgettracker.app does NOT auto-seed or authenticate on login
    const demoLoginRes = await app.request('/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'demo@budgettracker.app',
        password: 'password123',
      }),
    });
    expect(demoLoginRes.status).toBe(401);

    // Newly registered user without initialBackup gets clean zeroed starter state
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
    expect(cleanPull.state?.sinkingFunds).toEqual([]);
    expect(cleanPull.state?.quickPresets).toEqual([]);
    expect(cleanPull.state?.categoryBudgets).toEqual([]);
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

    // Unauthenticated sync is rejected
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

    // Push an expense from Phone
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
            tags: ['coffee'],
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

    // Retry exact same opId (simulating mobile network drop before receiving response)
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
    expect(pushRetry.state.accounts.find((a) => a.id === 'account-bank')!.balanceMinor).toBe(
      bankBefore - 15000,
    );

    // sinceRevision short-circuit returns unchanged: true
    const unchangedPull = syncPullResponseSchema.parse(
      await (
        await app.request('/v1/sync?sinceRevision=2', {
          headers: { Authorization: `Bearer ${sessionA.token}` },
        })
      ).json(),
    );
    expect(unchangedPull.unchanged).toBe(true);
    expect(unchangedPull.state).toBeUndefined();

    // User B does not see User A's transaction
    const pullB = syncPullResponseSchema.parse(
      await (
        await app.request('/v1/sync', {
          headers: { Authorization: `Bearer ${sessionB.token}` },
        })
      ).json(),
    );
    expect(pullB.revision).toBe(1);
    expect(pullB.state?.transactions.some((t) => t.id === 'tx-phone-coffee')).toBe(false);
    expect(pullB.state?.accounts.find((a) => a.id === 'account-bank')!.balanceMinor).toBe(
      bankBefore,
    );
  });

  it('enforces HttpOnly cookie auth with CSRF header, rate limits, body limits, sync confirmations, and stale-revision conflict checks', async () => {
    const repos = createMemoryRepos();
    const app = createApp(repos);

    // Weak 7-char password rejected on register (F-01)
    const weakReg = await app.request('/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Short Pw',
        email: 'short@example.com',
        password: '1234567',
      }),
    });
    expect(weakReg.status).toBe(400);

    // Valid registration sets HttpOnly bt_session cookie + security headers (F-08, F-11)
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
    expect(regRes.headers.get('x-content-type-options')).toBe('nosniff');
    expect(regRes.headers.get('x-frame-options')).toBe('DENY');
    expect(regRes.headers.get('cache-control')).toBe('private, no-store');
    const setCookieHeader = regRes.headers.get('set-cookie') ?? '';
    expect(setCookieHeader).toContain('bt_session=');
    expect(setCookieHeader).toContain('HttpOnly');
    expect(setCookieHeader).toContain('SameSite=Lax');
    const cookiePair = setCookieHeader.split(';')[0]!;

    // Cookie auth works for GET /v1/auth/me without Authorization header
    const meCookie = await app.request('/v1/auth/me', {
      headers: { Cookie: cookiePair },
    });
    expect(meCookie.status).toBe(200);

    // Cookie auth POST without X-Requested-With is blocked by CSRF guard (403)
    const csrfBlocked = await app.request('/v1/sync', {
      method: 'POST',
      headers: {
        Cookie: cookiePair,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ lastKnownRevision: 1, mutations: [] }),
    });
    expect(csrfBlocked.status).toBe(403);

    // Unconfirmed destructive sync mutation returns 400 CONFIRMATION_REQUIRED without leaking token (F-03)
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
    const unconfirmedJson = (await unconfirmedSync.json()) as {
      error: { code: string; message: string };
    };
    expect(unconfirmedJson.error.code).toBe('CONFIRMATION_REQUIRED');
    expect(unconfirmedJson.error.message).not.toContain('clear-transactions:all');

    // Valid transaction push bumps revision 1 -> 2
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
              tags: [],
              occurredAt: '2026-11-21T07:01:00.000Z',
              createdAt: '2026-11-21T07:01:00.000Z',
            },
          },
        ],
      }),
    });
    expect(txPush.status).toBe(200);

    // Stale lastKnownRevision (1) on conflicting update returns 409 CONFLICT (F-04)
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
              tags: [],
              occurredAt: '2026-11-21T07:01:00.000Z',
            },
          },
        ],
      }),
    });
    expect(staleConflict.status).toBe(409);

    // Oversized body (> 64 KiB on login) returns 413 (F-02)
    const oversizedLogin = await app.request('/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'cookie@example.com',
        password: 'password123',
        pad: 'x'.repeat(70_000),
      }),
    });
    expect(oversizedLogin.status).toBe(413);

    // Auth rate limit triggers 429 after 20 requests on /v1/auth/* from same IP (F-01)
    let rateLimitedStatus = 200;
    for (let i = 0; i < 20; i += 1) {
      const res = await app.request('/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '203.0.113.99',
        },
        body: JSON.stringify({
          email: 'nobody@example.com',
          password: 'wrong-password',
        }),
      });
      rateLimitedStatus = res.status;
    }
    const overLimit = await app.request('/v1/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '203.0.113.99',
      },
      body: JSON.stringify({
        email: 'nobody@example.com',
        password: 'wrong-password',
      }),
    });
    expect(rateLimitedStatus).toBe(401);
    expect(overLimit.status).toBe(429);

    // Logout clears cookie and revokes session
    const logoutRes = await app.request('/v1/auth/logout', {
      method: 'POST',
      headers: {
        Cookie: cookiePair,
        'X-Requested-With': 'budget-tracker',
      },
    });
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.headers.get('set-cookie') ?? '').toContain('Max-Age=0');

    const meAfterLogout = await app.request('/v1/auth/me', {
      headers: { Cookie: cookiePair },
    });
    expect(meAfterLogout.status).toBe(401);
  });

  it('persists account metadata and balance updates via account.updateMetadata + confirmed reconciliation.apply without adjustment transactions', async () => {
    const repos = createMemoryRepos();
    const app = createApp(repos);

    const regRes = await app.request('/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Account Editor',
        email: 'editor@example.com',
        password: 'password123',
      }),
    });
    expect(regRes.status).toBe(201);
    const session = authSessionResponseSchema.parse(await regRes.json());

    const pullInitial = syncPullResponseSchema.parse(
      await (
        await app.request('/v1/sync', {
          headers: { Authorization: `Bearer ${session.token}` },
        })
      ).json(),
    );

    const pushEditRes = await app.request('/v1/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({
        lastKnownRevision: pullInitial.revision,
        mutations: [
          {
            opId: 'op-acc-meta-1',
            clientTimestamp: '2026-11-24T10:00:00.000Z',
            type: 'account.updateMetadata',
            account: {
              id: 'account-bank',
              name: 'Updated Payroll Bank',
              accountType: 'BANK',
              icon: '🏛️',
              color: '#1E6F4E',
              currency: DEFAULT_CURRENCY,
            },
          },
          {
            opId: 'op-acc-bal-1',
            clientTimestamp: '2026-11-24T10:00:00.000Z',
            type: 'reconciliation.apply',
            reconciliationId: 'rec-acc-edit-1',
            accountId: 'account-bank',
            actualBalanceMinor: 84525,
            createAdjustment: false,
            notes: 'Account balance updated',
            reconciledAt: '2026-11-24T10:00:00.000Z',
            confirmation: createDestructiveConfirmation(
              'reconcile-account',
              'account-bank',
            ),
          },
        ],
      }),
    });
    expect(pushEditRes.status).toBe(200);
    const pushEditBody = syncPushResponseSchema.parse(await pushEditRes.json());

    const updatedAccount = pushEditBody.state.accounts.find(
      (a) => a.id === 'account-bank',
    );
    expect(updatedAccount?.name).toBe('Updated Payroll Bank');
    expect(updatedAccount?.balanceMinor).toBe(84525);
    expect(pushEditBody.state.transactions).toHaveLength(0);

    const pullAfterRes = await app.request('/v1/sync', {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    expect(pullAfterRes.status).toBe(200);
    const pullAfter = syncPullResponseSchema.parse(await pullAfterRes.json());
    const persistedAccount = pullAfter.state?.accounts.find(
      (a) => a.id === 'account-bank',
    );
    expect(persistedAccount?.name).toBe('Updated Payroll Bank');
    expect(persistedAccount?.balanceMinor).toBe(84525);
    expect(pullAfter.state?.transactions).toHaveLength(0);
  });
});
