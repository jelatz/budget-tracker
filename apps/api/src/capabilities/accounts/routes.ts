import { Hono, type MiddlewareHandler } from 'hono';
import type { AuthEnvVariables } from '../../core/auth/middleware';
import { AppError } from '../../core/errors';
import { parseJsonBody } from '../../core/validation';
import {
  handleCreateAccount,
  handleDeleteAccount,
  handleGetAccount,
  handleListAccounts,
  handleUpdateAccount,
} from './handler';
import type { AccountsRepository } from './repository';
import {
  accountIdParamSchema,
  createAccountRequestSchema,
  deleteAccountRequestSchema,
  updateAccountRequestSchema,
} from './schema';

function parseAccountId(rawId: string | undefined): string {
  const parsed = accountIdParamSchema.safeParse({ id: rawId });
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 'Account id is required.');
  }
  return parsed.data.id;
}

export function createAccountsRoutes(
  accountsRepo: AccountsRepository,
  requireAuth: MiddlewareHandler<{ Variables: AuthEnvVariables }>,
) {
  return new Hono<{ Variables: AuthEnvVariables }>()
    .get('/v1/accounts', requireAuth, async (c) => {
      const session = c.get('authSession');
      const response = await handleListAccounts(accountsRepo, session.user.id);
      return c.json(response);
    })
    .get('/v1/accounts/:id', requireAuth, async (c) => {
      const session = c.get('authSession');
      const accountId = parseAccountId(c.req.param('id'));
      const response = await handleGetAccount(accountsRepo, {
        userId: session.user.id,
        accountId,
      });
      return c.json(response);
    })
    .post('/v1/accounts', requireAuth, async (c) => {
      const session = c.get('authSession');
      const input = await parseJsonBody(c, createAccountRequestSchema);
      const response = await handleCreateAccount(accountsRepo, {
        userId: session.user.id,
        input,
      });
      return c.json(response, 201);
    })
    .patch('/v1/accounts/:id', requireAuth, async (c) => {
      const session = c.get('authSession');
      const accountId = parseAccountId(c.req.param('id'));
      const input = await parseJsonBody(c, updateAccountRequestSchema);
      const response = await handleUpdateAccount(accountsRepo, {
        userId: session.user.id,
        accountId,
        input,
      });
      return c.json(response);
    })
    .delete('/v1/accounts/:id', requireAuth, async (c) => {
      const session = c.get('authSession');
      const accountId = parseAccountId(c.req.param('id'));

      let rawBody: unknown;
      try {
        rawBody = await c.req.json();
      } catch (error: unknown) {
        throw new AppError(
          'CONFIRMATION_REQUIRED',
          'Deleting an account requires a JSON body with confirmAction: true and confirmationToken.',
        );
      }
      const parsedConfirmation = deleteAccountRequestSchema.safeParse(rawBody);
      if (!parsedConfirmation.success) {
        throw new AppError(
          'CONFIRMATION_REQUIRED',
          'Deleting an account requires confirmAction: true and a valid confirmationToken.',
        );
      }

      const response = await handleDeleteAccount(accountsRepo, {
        userId: session.user.id,
        accountId,
        confirmation: parsedConfirmation.data,
      });
      return c.json(response);
    });
}
