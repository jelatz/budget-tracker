import { randomUUID } from 'node:crypto';
import {
  formatConfirmationToken,
  verifyConfirmationToken,
  type ApplyReconciliationRequest,
  type ApplyReconciliationResponse,
  type ReconciliationResponse,
  type ReconciliationsListResponse,
} from '@repo/contracts';
import { AppError } from '../../core/errors';
import type { ReconcileRepository } from './repository';
import {
  applyReconciliationResponseSchema,
  reconciliationResponseSchema,
  reconciliationsListResponseSchema,
} from './schema';

export async function handleListReconciliations(
  repo: ReconcileRepository,
  userId: string,
): Promise<ReconciliationsListResponse> {
  const result = await repo.listReconciliations(userId);
  return reconciliationsListResponseSchema.parse(result);
}

export async function handleGetReconciliation(
  repo: ReconcileRepository,
  params: { userId: string; reconciliationId: string },
): Promise<ReconciliationResponse> {
  const result = await repo.getReconciliationById(
    params.userId,
    params.reconciliationId,
  );
  if (!result) {
    throw new AppError(
      'NOT_FOUND',
      `Reconciliation "${params.reconciliationId}" not found.`,
    );
  }
  return reconciliationResponseSchema.parse(result);
}

export async function handleApplyReconciliation(
  repo: ReconcileRepository,
  params: { userId: string; input: ApplyReconciliationRequest },
): Promise<ApplyReconciliationResponse> {
  const confirmation = {
    confirmAction: params.input.confirmAction,
    confirmationToken: params.input.confirmationToken,
  };

  if (
    !verifyConfirmationToken(
      confirmation,
      'reconcile-account',
      params.input.accountId,
    )
  ) {
    const expected = formatConfirmationToken(
      'reconcile-account',
      params.input.accountId,
    );
    throw new AppError(
      'CONFIRMATION_REQUIRED',
      `Explicit confirmation required. Provide confirmAction: true and confirmationToken "${expected}".`,
    );
  }

  const result = await repo.applyReconciliation({
    userId: params.userId,
    reconciliationId: `rec-${randomUUID()}`,
    accountId: params.input.accountId,
    actualBalanceMinor: params.input.actualBalanceMinor,
    createAdjustment: params.input.createAdjustment,
    notes: params.input.notes,
    reconciledAt: new Date().toISOString(),
  });

  return applyReconciliationResponseSchema.parse(result);
}
