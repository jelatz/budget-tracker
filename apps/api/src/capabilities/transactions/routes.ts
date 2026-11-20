import { Hono } from 'hono';
import {
  batchCreateTransactionsInputSchema,
  createTransactionInputSchema,
  updateTransactionInputSchema,
} from '@repo/contracts';
import type { AppEnv } from '../../core/auth/middleware';
import type { AppDb } from '../../core/db/client';
import { parseJsonBody } from '../../core/validate';
import {
  createTransaction,
  createTransactionsBatch,
  deleteTransaction,
  listTransactions,
  updateTransaction,
} from './handler';

export function createTransactionRoutes(db: AppDb) {
  return new Hono<AppEnv>()
    .get('/v1/transactions', async (c) => {
      const { userId } = c.get('auth');
      const items = await listTransactions(db, userId);
      return c.json(items);
    })
    .post('/v1/transactions', async (c) => {
      const { userId } = c.get('auth');
      const input = await parseJsonBody(c, createTransactionInputSchema);
      const created = await createTransaction(db, userId, input);
      return c.json(created, 201);
    })
    .post('/v1/transactions/batch', async (c) => {
      const { userId } = c.get('auth');
      const { transactions: inputs } = await parseJsonBody(
        c,
        batchCreateTransactionsInputSchema,
      );
      const created = await createTransactionsBatch(db, userId, inputs);
      return c.json(created, 201);
    })
    .put('/v1/transactions/:id', async (c) => {
      const { userId } = c.get('auth');
      const txId = c.req.param('id');
      const input = await parseJsonBody(c, updateTransactionInputSchema);
      const updated = await updateTransaction(db, userId, txId, input);
      return c.json(updated, 200);
    })
    .delete('/v1/transactions/:id', async (c) => {
      const { userId } = c.get('auth');
      const txId = c.req.param('id');
      await deleteTransaction(db, userId, txId);
      return c.json({ ok: true as const });
    });
}
