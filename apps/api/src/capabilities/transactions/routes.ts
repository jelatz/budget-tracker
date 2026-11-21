import { Hono, type MiddlewareHandler } from 'hono';
import type { AuthEnvVariables } from '../../core/auth/middleware';
import { AppError } from '../../core/errors';
import { parseJsonBody, parseQueryParams } from '../../core/validation';
import {
  handleClearTransactions,
  handleCreateTransaction,
  handleDeleteTransaction,
  handleGetTransaction,
  handleListTransactions,
  handleUpdateTransaction,
} from './handler';
import type { TransactionsRepository } from './repository';
import {
  clearTransactionsRequestSchema,
  createTransactionRequestSchema,
  listTransactionsQuerySchema,
  patchTransactionRequestSchema,
  transactionIdParamSchema,
} from './schema';

function parseTransactionId(rawId: string | undefined): string {
  const parsed = transactionIdParamSchema.safeParse({ id: rawId });
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 'Transaction id is required.');
  }
  return parsed.data.id;
}

export function createTransactionsRoutes(
  transactionsRepo: TransactionsRepository,
  requireAuth: MiddlewareHandler<{ Variables: AuthEnvVariables }>,
) {
  return new Hono<{ Variables: AuthEnvVariables }>()
    .get('/v1/transactions', requireAuth, async (c) => {
      const session = c.get('authSession');
      const query = parseQueryParams(c, listTransactionsQuerySchema);
      const response = await handleListTransactions(transactionsRepo, {
        userId: session.user.id,
        query,
      });
      return c.json(response);
    })
    .post('/v1/transactions/clear', requireAuth, async (c) => {
      const session = c.get('authSession');
      let rawBody: unknown;
      try {
        rawBody = await c.req.json();
      } catch (error: unknown) {
        throw new AppError(
          'CONFIRMATION_REQUIRED',
          'Clearing all transactions requires confirmAction: true and confirmationToken.',
        );
      }
      const parsed = clearTransactionsRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        throw new AppError(
          'CONFIRMATION_REQUIRED',
          'Clearing all transactions requires confirmAction: true and a valid confirmationToken.',
        );
      }
      const response = await handleClearTransactions(transactionsRepo, {
        userId: session.user.id,
        confirmation: parsed.data,
      });
      return c.json(response);
    })
    .get('/v1/transactions/:id', requireAuth, async (c) => {
      const session = c.get('authSession');
      const transactionId = parseTransactionId(c.req.param('id'));
      const response = await handleGetTransaction(transactionsRepo, {
        userId: session.user.id,
        transactionId,
      });
      return c.json(response);
    })
    .post('/v1/transactions', requireAuth, async (c) => {
      const session = c.get('authSession');
      const input = await parseJsonBody(c, createTransactionRequestSchema);
      const response = await handleCreateTransaction(transactionsRepo, {
        userId: session.user.id,
        input,
      });
      return c.json(response, 201);
    })
    .patch('/v1/transactions/:id', requireAuth, async (c) => {
      const session = c.get('authSession');
      const transactionId = parseTransactionId(c.req.param('id'));
      const input = await parseJsonBody(c, patchTransactionRequestSchema);
      const response = await handleUpdateTransaction(transactionsRepo, {
        userId: session.user.id,
        transactionId,
        input,
      });
      return c.json(response);
    })
    .delete('/v1/transactions/:id', requireAuth, async (c) => {
      const session = c.get('authSession');
      const transactionId = parseTransactionId(c.req.param('id'));
      const response = await handleDeleteTransaction(transactionsRepo, {
        userId: session.user.id,
        transactionId,
      });
      return c.json(response);
    });
}
