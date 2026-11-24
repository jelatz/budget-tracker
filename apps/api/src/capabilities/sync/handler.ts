import {
  syncPullResponseSchema,
  syncPushResponseSchema,
  verifyConfirmationToken,
  type SyncMutation,
  type SyncPullResponse,
  type SyncPushRequest,
  type SyncPushResponse,
} from '@repo/contracts';
import { AppError } from '../../core/errors';
import type { SyncRepository } from './repository';

function assertSyncMutationConfirmed(mutation: SyncMutation): void {
  switch (mutation.type) {
    case 'account.delete':
      if (!verifyConfirmationToken(mutation.confirmation, 'delete-account', mutation.id)) {
        throw new AppError(
          'CONFIRMATION_REQUIRED',
          'Explicit confirmation required for destructive sync mutation.',
        );
      }
      return;
    case 'transactions.clearAll':
      if (!verifyConfirmationToken(mutation.confirmation, 'clear-transactions', 'all')) {
        throw new AppError(
          'CONFIRMATION_REQUIRED',
          'Explicit confirmation required for destructive sync mutation.',
        );
      }
      return;
    case 'state.resetDemo':
      if (!verifyConfirmationToken(mutation.confirmation, 'reset-demo', 'all')) {
        throw new AppError(
          'CONFIRMATION_REQUIRED',
          'Explicit confirmation required for destructive sync mutation.',
        );
      }
      return;
    case 'backup.import':
      if (
        mutation.mode === 'overwrite' &&
        !verifyConfirmationToken(mutation.confirmation, 'overwrite-backup', 'all')
      ) {
        throw new AppError(
          'CONFIRMATION_REQUIRED',
          'Explicit confirmation required for destructive sync mutation.',
        );
      }
      return;
    case 'reconciliation.apply':
      if (
        !verifyConfirmationToken(
          mutation.confirmation,
          'reconcile-account',
          mutation.accountId,
        )
      ) {
        throw new AppError(
          'CONFIRMATION_REQUIRED',
          'Explicit confirmation required for destructive sync mutation.',
        );
      }
      return;
    default:
      return;
  }
}

export async function handleSyncPull(
  repo: SyncRepository,
  params: { userId: string; sinceRevision?: number },
): Promise<SyncPullResponse> {
  const serverTime = new Date().toISOString();

  if (typeof params.sinceRevision === 'number') {
    const currentRevision = await repo.getUserRevision(params.userId);
    if (currentRevision === null) {
      throw new AppError('UNAUTHORIZED', 'Account not found.');
    }
    if (currentRevision === params.sinceRevision) {
      return syncPullResponseSchema.parse({
        unchanged: true,
        revision: currentRevision,
        serverTime,
      });
    }
  }

  const result = await repo.pullState(params.userId);
  if (!result) {
    throw new AppError('UNAUTHORIZED', 'Account not found.');
  }

  return syncPullResponseSchema.parse({
    unchanged: false,
    revision: result.revision,
    serverTime,
    state: result.state,
  });
}

export async function handleSyncPush(
  repo: SyncRepository,
  params: { userId: string; body: SyncPushRequest },
): Promise<SyncPushResponse> {
  for (const mutation of params.body.mutations) {
    assertSyncMutationConfirmed(mutation);
  }

  const result = await repo.pushMutations({
    userId: params.userId,
    lastKnownRevision: params.body.lastKnownRevision,
    mutations: params.body.mutations,
  });

  return syncPushResponseSchema.parse({
    revision: result.revision,
    serverTime: new Date().toISOString(),
    appliedOpIds: result.appliedOpIds,
    state: result.state,
  });
}
