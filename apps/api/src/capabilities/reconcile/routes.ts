import { Hono, type MiddlewareHandler } from 'hono';
import type { AuthEnvVariables } from '../../core/auth/middleware';
import { AppError } from '../../core/errors';
import {
  handleApplyReconciliation,
  handleGetReconciliation,
  handleListReconciliations,
} from './handler';
import type { ReconcileRepository } from './repository';
import {
  applyReconciliationRequestSchema,
  reconciliationIdParamSchema,
} from './schema';

function parseReconciliationId(rawId: string | undefined): string {
  const parsed = reconciliationIdParamSchema.safeParse({ id: rawId });
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 'Reconciliation id is required.');
  }
  return parsed.data.id;
}

export function createReconcileRoutes(
  reconcileRepo: ReconcileRepository,
  requireAuth: MiddlewareHandler<{ Variables: AuthEnvVariables }>,
) {
  return new Hono<{ Variables: AuthEnvVariables }>()
    .get('/v1/reconcile', requireAuth, async (c) => {
      const session = c.get('authSession');
      const response = await handleListReconciliations(
        reconcileRepo,
        session.user.id,
      );
      return c.json(response);
    })
    .get('/v1/reconcile/:id', requireAuth, async (c) => {
      const session = c.get('authSession');
      const reconciliationId = parseReconciliationId(c.req.param('id'));
      const response = await handleGetReconciliation(reconcileRepo, {
        userId: session.user.id,
        reconciliationId,
      });
      return c.json(response);
    })
    .post('/v1/reconcile', requireAuth, async (c) => {
      const session = c.get('authSession');
      let rawBody: unknown;
      try {
        rawBody = await c.req.json();
      } catch (error: unknown) {
        throw new AppError('VALIDATION_ERROR', 'Invalid JSON request body.');
      }

      if (
        !rawBody ||
        typeof rawBody !== 'object' ||
        (rawBody as { confirmAction?: unknown }).confirmAction !== true
      ) {
        throw new AppError(
          'CONFIRMATION_REQUIRED',
          'Reconciling an account balance requires confirmAction: true and a valid confirmationToken.',
        );
      }

      const parsed = applyReconciliationRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0];
        const isConfirmIssue =
          firstIssue?.path[0] === 'confirmAction' ||
          firstIssue?.path[0] === 'confirmationToken';
        throw new AppError(
          isConfirmIssue ? 'CONFIRMATION_REQUIRED' : 'VALIDATION_ERROR',
          firstIssue
            ? `${firstIssue.path.length > 0 ? `${firstIssue.path.join('.')}: ` : ''}${firstIssue.message}`
            : 'Validation failed.',
        );
      }

      const response = await handleApplyReconciliation(reconcileRepo, {
        userId: session.user.id,
        input: parsed.data,
      });
      return c.json(response, 201);
    });
}
