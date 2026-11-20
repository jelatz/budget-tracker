import { Hono } from 'hono';
import { createWalletInputSchema, updateWalletInputSchema } from '@repo/contracts';
import type { AppEnv } from '../../core/auth/middleware';
import type { AppDb } from '../../core/db/client';
import { parseJsonBody } from '../../core/validate';
import { createWallet, deleteWallet, listWallets, updateWallet } from './handler';

export function createWalletRoutes(db: AppDb) {
  return new Hono<AppEnv>()
    .get('/v1/wallets', async (c) => {
      const { userId } = c.get('auth');
      const items = await listWallets(db, userId);
      return c.json(items);
    })
    .post('/v1/wallets', async (c) => {
      const { userId } = c.get('auth');
      const input = await parseJsonBody(c, createWalletInputSchema);
      const created = await createWallet(db, userId, input);
      return c.json(created, 201);
    })
    .patch('/v1/wallets/:id', async (c) => {
      const { userId } = c.get('auth');
      const walletId = c.req.param('id');
      const input = await parseJsonBody(c, updateWalletInputSchema);
      const updated = await updateWallet(db, userId, walletId, input);
      return c.json(updated);
    })
    .delete('/v1/wallets/:id', async (c) => {
      const { userId } = c.get('auth');
      const walletId = c.req.param('id');
      await deleteWallet(db, userId, walletId);
      return c.json({ ok: true as const });
    });
}
