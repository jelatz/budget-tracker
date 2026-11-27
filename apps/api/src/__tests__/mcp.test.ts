import { createHash } from 'node:crypto';
import {
  applySyncMutations,
  createInitialSyncDataState,
  DEFAULT_CURRENCY,
  type AuthUser,
  type SyncDataState,
  type Transaction,
} from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { AuthRepository } from '../capabilities/auth/repository';
import type { SyncRepository } from '../capabilities/sync/repository';
import type { TransactionsRepository } from '../capabilities/transactions/repository';
import { hashPassword } from '../core/auth/crypto';
import { AppError } from '../core/errors';

function createTestHarness(options?: {
  mcpStaticClient?: { clientId: string; clientSecret?: string };
}) {
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
      if (!rec) throw new AppError('UNAUTHORIZED', 'Account not found.');
      const fresh = mutations.filter((m) => !rec.appliedOpIds.has(m.opId));
      if (fresh.length === 0) {
        return {
          revision: rec.revision,
          appliedOpIds: mutations.map((m) => m.opId),
          state: rec.state,
        };
      }
      rec.state = applySyncMutations(rec.state, fresh);
      rec.revision += 1;
      for (const m of fresh) rec.appliedOpIds.add(m.opId);
      return {
        revision: rec.revision,
        appliedOpIds: mutations.map((m) => m.opId),
        state: rec.state,
      };
    },
  };

  const transactionsRepo: TransactionsRepository = {
    async listTransactions(userId, query) {
      const rec = usersById.get(userId);
      if (!rec) throw new AppError('UNAUTHORIZED', 'Account not found.');
      const filtered = rec.state.transactions.filter((tx) => {
        if (query.accountId && tx.accountId !== query.accountId) return false;
        if (query.type && tx.type !== query.type) return false;
        return true;
      });
      return {
        transactions: filtered.slice(query.offset, query.offset + query.limit),
        total: filtered.length,
        revision: rec.revision,
      };
    },
    async getTransactionById(userId, transactionId) {
      const rec = usersById.get(userId);
      if (!rec) throw new AppError('UNAUTHORIZED', 'Account not found.');
      const tx = rec.state.transactions.find((t) => t.id === transactionId);
      if (!tx) return null;
      return { transaction: tx, revision: rec.revision };
    },
    async createTransaction(userId, txData: Transaction) {
      const rec = usersById.get(userId);
      if (!rec) throw new AppError('UNAUTHORIZED', 'Account not found.');
      rec.state = applySyncMutations(rec.state, [
        {
          opId: `op-tx-${txData.id}`,
          clientTimestamp: new Date().toISOString(),
          type: 'transaction.create',
          transaction: txData,
        },
      ]);
      rec.revision += 1;
      return { transaction: txData, revision: rec.revision };
    },
    async updateTransaction() {
      return null;
    },
    async deleteTransactionById(userId, transactionId) {
      const rec = usersById.get(userId);
      if (!rec) throw new AppError('UNAUTHORIZED', 'Account not found.');
      const exists = rec.state.transactions.some((t) => t.id === transactionId);
      if (!exists) return null;
      rec.state = applySyncMutations(rec.state, [
        {
          opId: `op-del-${transactionId}-${Date.now()}`,
          clientTimestamp: new Date().toISOString(),
          type: 'transaction.delete',
          id: transactionId,
        },
      ]);
      rec.revision += 1;
      return { deletedTransactionId: transactionId, revision: rec.revision };
    },
    async clearAllTransactions() {
      return { clearedCount: 0, revision: 1 };
    },
  };

  const app = createApp({
    authRepo,
    syncRepo,
    transactionsRepo,
    disableRateLimit: true,
    mcpOAuthSecret: 'test-mcp-oauth-secret-0123456789abcdef',
    ...(options?.mcpStaticClient ? { mcpStaticClient: options.mcpStaticClient } : {}),
  });

  const seedUser = async () => {
    const initial = createInitialSyncDataState(new Date('2026-11-27T12:00:00.000Z'));
    const seeded = applySyncMutations(initial, [
      {
        opId: 'op-seed-acc',
        clientTimestamp: '2026-11-27T12:00:00.000Z',
        type: 'account.upsert',
        account: {
          id: 'acc-maribank-cc',
          name: 'Maribank CC',
          accountType: 'CREDIT_CARD',
          icon: '💳',
          color: '#2C5F6E',
          currency: DEFAULT_CURRENCY,
          balanceMinor: 0,
          dueDay: 7,
        },
      },
      {
        opId: 'op-seed-bank-bal',
        clientTimestamp: '2026-11-27T12:00:01.000Z',
        type: 'account.setBalance',
        accountId: 'account-bank',
        balanceMinor: 500000, // PHP 5,000.00
      },
      {
        opId: 'op-seed-loan',
        clientTimestamp: '2026-11-27T12:00:02.000Z',
        type: 'commitment.upsert',
        commitment: {
          id: 'commitment-jbl-partybox',
          name: 'JBL Partybox',
          kind: 'LOAN',
          amountMinor: 250000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          categoryId: 'cat-loans',
          frequency: 'MONTHLY',
          dueDay: 25,
          nextDueDate: '2026-11-25',
          isAutoPaid: false,
          isActive: true,
          totalInstallments: 6,
          paidInstallments: 1,
        },
      },
    ]);

    const passwordHash = await hashPassword('CorrectHorseBattery99!');
    await authRepo.createUserWithSessionAndState({
      userId: 'user-mcp-1',
      email: 'alice@example.com',
      name: 'Alice',
      passwordHash,
      initialState: seeded,
      sessionId: 'sess-seed',
      tokenHash: 'seed-hash',
      expiresAt: new Date(Date.now() + 86400_000),
    });
  };

  return { app, seedUser, usersById };
}

function pkcePair(verifier: string) {
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function extractHiddenInput(html: string, name: string): string {
  const regex = new RegExp(`<input[^>]+name="${name}"[^>]+value="([^"]*)"`, 'i');
  const match = html.match(regex);
  if (!match) {
    throw new Error(`Could not find hidden input "${name}" in HTML`);
  }
  return match[1];
}

function extractMetaRefreshUrl(html: string): string {
  const match = html.match(
    /<meta\s+http-equiv="refresh"\s+content="0;url=([^"]+)"/i,
  );
  if (!match) {
    throw new Error('Could not find meta refresh redirect URL in HTML');
  }
  return match[1].replace(/&amp;/g, '&');
}

describe('MCP OAuth 2.1 + StreamableHTTP Server', () => {
  it('returns 401 with RFC 9728 WWW-Authenticate on unauthenticated /mcp and serves discovery metadata', async () => {
    const { app } = createTestHarness();

    const unauthPost = await app.request('https://budget.example.com/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        host: 'budget.example.com',
        'x-forwarded-proto': 'https',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
    });
    expect(unauthPost.status).toBe(401);
    expect(unauthPost.headers.get('www-authenticate')).toContain(
      'resource_metadata="https://budget.example.com/.well-known/oauth-protected-resource"',
    );

    const unauthGet = await app.request('https://budget.example.com/mcp', {
      method: 'GET',
      headers: { host: 'budget.example.com', 'x-forwarded-proto': 'https' },
    });
    expect(unauthGet.status).toBe(401);

    const prRes = await app.request(
      'https://budget.example.com/.well-known/oauth-protected-resource',
      { headers: { host: 'budget.example.com', 'x-forwarded-proto': 'https' } },
    );
    expect(prRes.status).toBe(200);
    expect(await prRes.json()).toMatchObject({
      resource: 'https://budget.example.com/mcp',
      authorization_servers: ['https://budget.example.com'],
    });

    const asRes = await app.request(
      'https://budget.example.com/.well-known/oauth-authorization-server',
      { headers: { host: 'budget.example.com', 'x-forwarded-proto': 'https' } },
    );
    expect(asRes.status).toBe(200);
    expect(await asRes.json()).toMatchObject({
      issuer: 'https://budget.example.com',
      authorization_endpoint: 'https://budget.example.com/oauth/authorize',
      token_endpoint: 'https://budget.example.com/oauth/token',
      registration_endpoint: 'https://budget.example.com/oauth/register',
      code_challenge_methods_supported: ['S256'],
    });
  });

  it('completes OAuth 2.1 DCR + PKCE S256 flow, enforces token isolation & rotation, and runs MCP tools', async () => {
    const { app, seedUser, usersById } = createTestHarness();
    await seedUser();

    // 1. Dynamic Client Registration
    const regRes = await app.request('https://budget.example.com/oauth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Gemini Connected Apps',
        redirect_uris: ['https://gemini.google.com/callback'],
        token_endpoint_auth_method: 'client_secret_post',
      }),
    });
    expect(regRes.status).toBe(201);
    const regJson = (await regRes.json()) as {
      client_id: string;
      client_secret: string;
    };
    expect(regJson.client_id.startsWith('dcr_')).toBe(true);
    expect(regJson.client_secret.startsWith('dcs_')).toBe(true);

    // 2. GET /oauth/authorize
    const { verifier, challenge } = pkcePair('super-secret-pkce-verifier-string-1234567890');
    const authUrl = new URL('https://budget.example.com/oauth/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', regJson.client_id);
    authUrl.searchParams.set('redirect_uri', 'https://gemini.google.com/callback');
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', 'xyz-state');

    const getAuthRes = await app.request(authUrl.toString());
    expect(getAuthRes.status).toBe(200);
    const authHtml = await getAuthRes.text();
    expect(authHtml.indexOf('value="approve"')).toBeLessThan(
      authHtml.indexOf('value="deny"'),
    );
    const csrfToken = extractHiddenInput(authHtml, 'csrf_token');

    // 3. Invalid password returns 401 inline error
    const badLoginBody = new URLSearchParams({
      csrf_token: csrfToken,
      client_id: regJson.client_id,
      redirect_uri: 'https://gemini.google.com/callback',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'xyz-state',
      scope: 'budget:read budget:write',
      resource: '',
      email: 'alice@example.com',
      password: 'WrongPassword!',
      decision: 'approve',
    });
    const badLoginRes = await app.request('https://budget.example.com/oauth/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: badLoginBody.toString(),
    });
    expect(badLoginRes.status).toBe(401);
    const retryCsrf = extractHiddenInput(await badLoginRes.text(), 'csrf_token');

    // 4. Valid login redirects with bt_code_
    const goodLoginBody = new URLSearchParams({
      csrf_token: retryCsrf,
      client_id: regJson.client_id,
      redirect_uri: 'https://gemini.google.com/callback',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'xyz-state',
      scope: 'budget:read budget:write',
      resource: '',
      email: 'alice@example.com',
      password: 'CorrectHorseBattery99!',
      decision: 'approve',
    });
    const goodLoginRes = await app.request('https://budget.example.com/oauth/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: goodLoginBody.toString(),
    });
    expect(goodLoginRes.status).toBe(200);
    const location = extractMetaRefreshUrl(await goodLoginRes.text());
    const redirected = new URL(location);
    const code = redirected.searchParams.get('code')!;
    expect(code.startsWith('bt_code_')).toBe(true);
    expect(redirected.searchParams.get('state')).toBe('xyz-state');

    // Auth code cannot be used as Bearer token
    const codeAsBearer = await app.request('https://budget.example.com/mcp', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${code}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(codeAsBearer.status).toBe(401);

    // 5. Wrong PKCE verifier rejected
    const badVerifierRes = await app.request('https://budget.example.com/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'https://gemini.google.com/callback',
        client_id: regJson.client_id,
        client_secret: regJson.client_secret,
        code_verifier: 'wrong-verifier-value',
      }).toString(),
    });
    expect(badVerifierRes.status).toBe(400);

    // 6. Valid token exchange
    const tokenRes = await app.request('https://budget.example.com/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'https://gemini.google.com/callback',
        client_id: regJson.client_id,
        client_secret: regJson.client_secret,
        code_verifier: verifier,
      }).toString(),
    });
    expect(tokenRes.status).toBe(200);
    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token: string;
      token_type: string;
    };
    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.access_token.startsWith('bt_at_')).toBe(true);
    expect(tokens.refresh_token.startsWith('bt_rt_')).toBe(true);

    // Replaying single-use code fails
    const replayRes = await app.request('https://budget.example.com/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'https://gemini.google.com/callback',
        client_id: regJson.client_id,
        client_secret: regJson.client_secret,
        code_verifier: verifier,
      }).toString(),
    });
    expect(replayRes.status).toBe(400);

    // Refresh token cannot be used as Bearer token on /mcp or /v1/accounts
    const rtOnMcp = await app.request('https://budget.example.com/mcp', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokens.refresh_token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(rtOnMcp.status).toBe(401);

    const rtOnV1 = await app.request('https://budget.example.com/v1/accounts', {
      headers: { authorization: `Bearer ${tokens.refresh_token}` },
    });
    expect(rtOnV1.status).toBe(401);

    // 7. Refresh token rotation
    const refreshRes = await app.request('https://budget.example.com/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: regJson.client_id,
        client_secret: regJson.client_secret,
      }).toString(),
    });
    expect(refreshRes.status).toBe(200);
    const rotated = (await refreshRes.json()) as {
      access_token: string;
      refresh_token: string;
    };
    expect(rotated.access_token.startsWith('bt_at_')).toBe(true);

    // Replaying old refresh token fails
    const oldRefreshReplay = await app.request('https://budget.example.com/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: regJson.client_id,
        client_secret: regJson.client_secret,
      }).toString(),
    });
    expect(oldRefreshReplay.status).toBe(400);

    // 8. MCP initialize + notification + GET/DELETE + tools/list
    const callMcp = (body: unknown) =>
      app.request('https://budget.example.com/mcp', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${rotated.access_token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });

    const initRes = await callMcp({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'gemini', version: '1.0' },
      },
    });
    expect(initRes.status).toBe(200);
    expect(initRes.headers.get('mcp-protocol-version')).toBe('2025-06-18');
    const initJson = (await initRes.json()) as {
      jsonrpc: string;
      id: number;
      result: { protocolVersion: string; instructions: string };
    };
    expect(initJson).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: { protocolVersion: '2025-06-18' },
    });
    expect(initJson.result.instructions).toContain('NEVER guess');

    const notifRes = await callMcp({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    expect(notifRes.status).toBe(202);

    const authGetMcp = await app.request('https://budget.example.com/mcp', {
      method: 'GET',
      headers: { authorization: `Bearer ${rotated.access_token}` },
    });
    expect(authGetMcp.status).toBe(405);

    const listRes = await callMcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const listJson = (await listRes.json()) as {
      result: { tools: Array<{ name: string }> };
    };
    expect(listJson.result.tools.map((t) => t.name)).toEqual([
      'get_budget_context',
      'log_transaction',
      'list_recent_transactions',
      'delete_transaction',
      'pay_obligation',
      'unpay_obligation',
      'pay_credit_card',
      'unpay_credit_card',
    ]);

    // 9. Tool calls: get_budget_context, log_transaction (+ idempotency), list, delete, pay/unpay
    const ctxRes = await callMcp({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'get_budget_context', arguments: {} },
    });
    const ctxJson = (await ctxRes.json()) as {
      result: { structuredContent: { accounts: Array<{ name: string }> } };
    };
    expect(ctxJson.result.structuredContent.accounts.map((a) => a.name)).toContain(
      'Maribank CC',
    );

    const logArgs = {
      type: 'EXPENSE',
      amount: 350.5,
      account: 'Maribank CC',
      category: 'Daily Living',
      merchant: 'Starbucks',
      idempotencyKey: 'voice-coffee-1',
    };
    const log1 = await callMcp({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'log_transaction', arguments: logArgs },
    });
    const log1Json = (await log1.json()) as {
      result: {
        isError?: boolean;
        structuredContent: {
          deduplicated: boolean;
          transaction: { id: string; amountMinor: number };
        };
      };
    };
    expect(log1Json.result.isError).toBeUndefined();
    expect(log1Json.result.structuredContent.deduplicated).toBe(false);
    expect(log1Json.result.structuredContent.transaction.amountMinor).toBe(35050);

    const log2 = await callMcp({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'log_transaction', arguments: logArgs },
    });
    const log2Json = (await log2.json()) as {
      result: { structuredContent: { deduplicated: boolean } };
    };
    expect(log2Json.result.structuredContent.deduplicated).toBe(true);

    const ccBalanceAfter = usersById
      .get('user-mcp-1')!
      .state.accounts.find((a) => a.id === 'acc-maribank-cc')!.balanceMinor;
    expect(ccBalanceAfter).toBe(-35050);

    const recentRes = await callMcp({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'list_recent_transactions',
        arguments: { search: 'starbucks', limit: 5 },
      },
    });
    const recentJson = (await recentRes.json()) as {
      result: { structuredContent: { count: number } };
    };
    expect(recentJson.result.structuredContent.count).toBe(1);

    const delRes = await callMcp({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'delete_transaction',
        arguments: {
          transactionId: log1Json.result.structuredContent.transaction.id,
        },
      },
    });
    expect(delRes.status).toBe(200);
    expect(
      usersById
        .get('user-mcp-1')!
        .state.accounts.find((a) => a.id === 'acc-maribank-cc')!.balanceMinor,
    ).toBe(0);

    const payRes = await callMcp({
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: {
        name: 'pay_obligation',
        arguments: { obligation: 'JBL Partybox', paidAt: '2026-11-27' },
      },
    });
    const payJson = (await payRes.json()) as {
      result: {
        structuredContent: {
          obligation: { paidInstallments: number; lastPaidPeriod: string };
        };
      };
    };
    expect(payJson.result.structuredContent.obligation.paidInstallments).toBe(2);
    expect(payJson.result.structuredContent.obligation.lastPaidPeriod).toBe('2026-11');

    const unpayRes = await callMcp({
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: {
        name: 'unpay_obligation',
        arguments: { obligation: 'JBL Partybox' },
      },
    });
    const unpayJson = (await unpayRes.json()) as {
      result: {
        structuredContent: {
          obligation: { paidInstallments: number; lastPaidPeriod: string | null };
        };
      };
    };
    expect(unpayJson.result.structuredContent.obligation.paidInstallments).toBe(1);
    expect(unpayJson.result.structuredContent.obligation.lastPaidPeriod).toBeNull();

    // 9b. Advance pay obligation for 2 cycles, then undo back to original state
    const advPayRes = await callMcp({
      jsonrpc: '2.0',
      id: 91,
      method: 'tools/call',
      params: {
        name: 'pay_obligation',
        arguments: {
          obligation: 'JBL Partybox',
          paidAt: '2026-11-27',
          cycles: 2,
          advance: true,
        },
      },
    });
    const advPayJson = (await advPayRes.json()) as {
      result: {
        isError?: boolean;
        structuredContent: {
          obligation: {
            paidInstallments: number;
            lastPaidPeriod: string;
            isPaidAhead: boolean;
            lastPaidCycles: number;
          };
        };
      };
    };
    expect(advPayJson.result.isError).toBeUndefined();
    expect(advPayJson.result.structuredContent.obligation.paidInstallments).toBe(3);
    expect(advPayJson.result.structuredContent.obligation.lastPaidPeriod).toBe('2026-12');
    expect(advPayJson.result.structuredContent.obligation.isPaidAhead).toBe(true);
    expect(advPayJson.result.structuredContent.obligation.lastPaidCycles).toBe(2);

    const undoAdvRes = await callMcp({
      jsonrpc: '2.0',
      id: 92,
      method: 'tools/call',
      params: {
        name: 'unpay_obligation',
        arguments: { obligation: 'JBL Partybox' },
      },
    });
    const undoAdvJson = (await undoAdvRes.json()) as {
      result: {
        structuredContent: {
          obligation: { paidInstallments: number; lastPaidPeriod: string | null };
        };
      };
    };
    expect(undoAdvJson.result.structuredContent.obligation.paidInstallments).toBe(1);
    expect(undoAdvJson.result.structuredContent.obligation.lastPaidPeriod).toBeNull();

    // 9c. pay_credit_card missing required fields prompts user, then advance-paying updates paidThroughPeriod
    const missingCardRes = await callMcp({
      jsonrpc: '2.0',
      id: 93,
      method: 'tools/call',
      params: {
        name: 'pay_credit_card',
        arguments: { card: '', paymentAccount: '' },
      },
    });
    const missingCardJson = (await missingCardRes.json()) as {
      result: {
        isError: boolean;
        structuredContent: {
          needsUserInput: boolean;
          missingFields: string[];
          availableCreditCards: string[];
        };
      };
    };
    expect(missingCardJson.result.isError).toBe(true);
    expect(missingCardJson.result.structuredContent.needsUserInput).toBe(true);
    expect(missingCardJson.result.structuredContent.missingFields).toEqual([
      'card',
      'paymentAccount',
    ]);
    expect(missingCardJson.result.structuredContent.availableCreditCards).toContain(
      'Maribank CC',
    );

    // Seed swipe balance on Maribank CC and cash on Main Bank for card payment
    const seededRec = usersById.get('user-mcp-1')!;
    seededRec.state = applySyncMutations(seededRec.state, [
      {
        opId: 'op-mcp-seed-bank',
        clientTimestamp: '2026-11-27T10:00:00.000Z',
        type: 'account.setBalance',
        accountId: 'account-bank',
        balanceMinor: 2_000_000,
      },
      {
        opId: 'op-mcp-seed-cc',
        clientTimestamp: '2026-11-27T10:01:00.000Z',
        type: 'account.setBalance',
        accountId: 'acc-maribank-cc',
        balanceMinor: -1_000_000,
      },
    ]);

    const payCardRes = await callMcp({
      jsonrpc: '2.0',
      id: 94,
      method: 'tools/call',
      params: {
        name: 'pay_credit_card',
        arguments: {
          card: 'Maribank CC',
          paymentAccount: 'Main Bank',
          amount: 4000,
          advanceMonths: 2,
          paidAt: '2026-11-27',
        },
      },
    });
    const payCardJson = (await payCardRes.json()) as {
      result: {
        isError?: boolean;
        structuredContent: {
          creditCard: {
            balanceMinor: number;
            paidThroughPeriod: string;
            isPaidAhead: boolean;
          };
        };
      };
    };
    expect(payCardJson.result.isError).toBeUndefined();
    expect(payCardJson.result.structuredContent.creditCard.balanceMinor).toBe(-600_000);
    expect(payCardJson.result.structuredContent.creditCard.paidThroughPeriod).toBe(
      '2026-12',
    );
    expect(payCardJson.result.structuredContent.creditCard.isPaidAhead).toBe(true);

    const unpayCardRes = await callMcp({
      jsonrpc: '2.0',
      id: 95,
      method: 'tools/call',
      params: {
        name: 'unpay_credit_card',
        arguments: { card: 'Maribank CC' },
      },
    });
    const unpayCardJson = (await unpayCardRes.json()) as {
      result: {
        isError?: boolean;
        structuredContent: {
          creditCard: {
            balanceMinor: number;
            paidThroughPeriod: string | null;
            isPaidAhead: boolean;
          };
        };
      };
    };
    expect(unpayCardJson.result.isError).toBeUndefined();
    expect(unpayCardJson.result.structuredContent.creditCard.balanceMinor).toBe(
      -1_000_000,
    );
    expect(unpayCardJson.result.structuredContent.creditCard.paidThroughPeriod).toBeNull();
    expect(unpayCardJson.result.structuredContent.creditCard.isPaidAhead).toBe(false);

    // 10. Missing/empty required fields return structured needsUserInput prompts without mutating state
    const missingExpenseRes = await callMcp({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: {
        name: 'log_transaction',
        arguments: { type: 'EXPENSE', amount: 350, account: '', category: '' },
      },
    });
    const missingExpenseJson = (await missingExpenseRes.json()) as {
      result: {
        isError: boolean;
        structuredContent: {
          needsUserInput: boolean;
          missingFields: string[];
          availableAccounts: string[];
          availableCategories: string[];
        };
      };
    };
    expect(missingExpenseJson.result.isError).toBe(true);
    expect(missingExpenseJson.result.structuredContent.needsUserInput).toBe(true);
    expect(missingExpenseJson.result.structuredContent.missingFields).toEqual([
      'account',
      'category',
    ]);
    expect(missingExpenseJson.result.structuredContent.availableAccounts).toContain(
      'Maribank CC',
    );
    expect(missingExpenseJson.result.structuredContent.availableCategories).toContain(
      'Daily Living',
    );

    const missingTransferRes = await callMcp({
      jsonrpc: '2.0',
      id: 11,
      method: 'tools/call',
      params: {
        name: 'log_transaction',
        arguments: { type: 'TRANSFER', amount: 500, account: 'Main Bank' },
      },
    });
    const missingTransferJson = (await missingTransferRes.json()) as {
      result: {
        isError: boolean;
        structuredContent: { needsUserInput: boolean; missingFields: string[] };
      };
    };
    expect(missingTransferJson.result.isError).toBe(true);
    expect(missingTransferJson.result.structuredContent.needsUserInput).toBe(true);
    expect(missingTransferJson.result.structuredContent.missingFields).toEqual([
      'toAccount',
    ]);

    const ambiguousAccountRes = await callMcp({
      jsonrpc: '2.0',
      id: 12,
      method: 'tools/call',
      params: {
        name: 'log_transaction',
        arguments: {
          type: 'EXPENSE',
          amount: 100,
          account: 'a',
          category: 'Daily Living',
        },
      },
    });
    const ambiguousAccountJson = (await ambiguousAccountRes.json()) as {
      result: {
        isError: boolean;
        structuredContent: { needsUserInput: boolean; availableAccounts: string[] };
      };
    };
    expect(ambiguousAccountJson.result.isError).toBe(true);
    expect(ambiguousAccountJson.result.structuredContent.needsUserInput).toBe(true);
    expect(
      ambiguousAccountJson.result.structuredContent.availableAccounts.length,
    ).toBeGreaterThan(1);

    const missingObligationRes = await callMcp({
      jsonrpc: '2.0',
      id: 13,
      method: 'tools/call',
      params: { name: 'pay_obligation', arguments: { obligation: '' } },
    });
    const missingObligationJson = (await missingObligationRes.json()) as {
      result: {
        isError: boolean;
        structuredContent: {
          needsUserInput: boolean;
          missingFields: string[];
          availableObligations: string[];
        };
      };
    };
    expect(missingObligationJson.result.isError).toBe(true);
    expect(missingObligationJson.result.structuredContent.needsUserInput).toBe(true);
    expect(missingObligationJson.result.structuredContent.missingFields).toEqual([
      'obligation',
    ]);
    expect(
      missingObligationJson.result.structuredContent.availableObligations,
    ).toContain('JBL Partybox');
  });

  it('supports static Client ID + Client Secret via HTTP Basic Auth', async () => {
    const { app, seedUser } = createTestHarness({
      mcpStaticClient: {
        clientId: 'gemini-static-id',
        clientSecret: 'gemini-static-secret',
      },
    });
    await seedUser();

    const { verifier, challenge } = pkcePair('static-client-pkce-verifier-0123456789abcdefgh');
    const authUrl = new URL('https://budget.example.com/oauth/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', 'gemini-static-id');
    authUrl.searchParams.set('redirect_uri', 'https://gemini.google.com/callback');
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', 'static-state');

    const getRes = await app.request(authUrl.toString());
    expect(getRes.status).toBe(200);
    const csrfToken = extractHiddenInput(await getRes.text(), 'csrf_token');

    const postRes = await app.request('https://budget.example.com/oauth/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        csrf_token: csrfToken,
        client_id: 'gemini-static-id',
        redirect_uri: 'https://gemini.google.com/callback',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state: 'static-state',
        scope: 'budget:read budget:write',
        resource: '',
        email: 'alice@example.com',
        password: 'CorrectHorseBattery99!',
        decision: 'approve',
      }).toString(),
    });
    expect(postRes.status).toBe(200);
    const code = new URL(extractMetaRefreshUrl(await postRes.text())).searchParams.get(
      'code',
    )!;

    const basicHeader = `Basic ${Buffer.from('gemini-static-id:gemini-static-secret').toString('base64')}`;
    const tokenRes = await app.request('https://budget.example.com/oauth/token', {
      method: 'POST',
      headers: {
        authorization: basicHeader,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'https://gemini.google.com/callback',
        code_verifier: verifier,
      }).toString(),
    });
    expect(tokenRes.status).toBe(200);
    const tokens = (await tokenRes.json()) as { access_token: string };
    expect(tokens.access_token.startsWith('bt_at_')).toBe(true);
  });
});
