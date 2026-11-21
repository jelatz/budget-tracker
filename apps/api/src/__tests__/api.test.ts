import {
  applySyncMutations,
  authSessionResponseSchema,
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
import type { SyncRepository } from '../capabilities/sync/repository';
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

    async pushMutations({ userId, mutations }) {
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

    // Public registration cannot reserve demo@budgettracker.app
    const demoRegRes = await app.request('/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Hijacker',
        email: 'demo@budgettracker.app',
        password: 'evilpassword',
      }),
    });
    expect(demoRegRes.status).toBe(409);

    // Unauthenticated /v1/auth/demo is disabled by default
    const disabledDemoRes = await app.request('/v1/auth/demo', { method: 'POST' });
    expect(disabledDemoRes.status).toBe(403);

    // Demo login works cleanly via explicit demo credentials on /v1/auth/login
    const demoLoginRes = await app.request('/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'demo@budgettracker.app',
        password: 'password123',
      }),
    });
    expect(demoLoginRes.status).toBe(200);
    const demoData = authSessionResponseSchema.parse(await demoLoginRes.json());
    expect(demoData.user.email).toBe('demo@budgettracker.app');

    // /v1/auth/demo works only when explicitly enabled
    const demoApp = createApp({
      ...repos,
      allowDemoEndpoint: () => true,
    });
    const enabledDemoRes = await demoApp.request('/v1/auth/demo', { method: 'POST' });
    expect(enabledDemoRes.status).toBe(200);
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
});
