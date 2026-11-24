import { randomUUID } from 'node:crypto';
import {
  accountSchema,
  verifyConfirmationToken,
  type AccountResponse,
  type AccountsListResponse,
  type CreateAccountRequest,
  type DeleteAccountRequest,
  type DeleteAccountResponse,
  type UpdateAccountRequest,
} from '@repo/contracts';
import { AppError } from '../../core/errors';
import type { AccountsRepository } from './repository';
import {
  accountResponseSchema,
  accountsListResponseSchema,
  deleteAccountResponseSchema,
} from './schema';

export async function handleListAccounts(
  repo: AccountsRepository,
  userId: string,
): Promise<AccountsListResponse> {
  const result = await repo.listAccounts(userId);
  return accountsListResponseSchema.parse(result);
}

export async function handleGetAccount(
  repo: AccountsRepository,
  params: { userId: string; accountId: string },
): Promise<AccountResponse> {
  const result = await repo.getAccountById(params.userId, params.accountId);
  if (!result) {
    throw new AppError('NOT_FOUND', `Account "${params.accountId}" not found.`);
  }
  return accountResponseSchema.parse(result);
}

export async function handleCreateAccount(
  repo: AccountsRepository,
  params: { userId: string; input: CreateAccountRequest },
): Promise<AccountResponse> {
  const account = accountSchema.parse({
    id: params.input.id ?? `acc-${randomUUID()}`,
    name: params.input.name,
    accountType: params.input.accountType,
    icon: params.input.icon,
    color: params.input.color,
    currency: params.input.currency,
    balanceMinor: params.input.balanceMinor,
  });

  const result = await repo.createAccount(params.userId, account);
  return accountResponseSchema.parse(result);
}

export async function handleUpdateAccount(
  repo: AccountsRepository,
  params: { userId: string; accountId: string; input: UpdateAccountRequest },
): Promise<AccountResponse> {
  const result = await repo.updateAccountMetadata(
    params.userId,
    params.accountId,
    params.input,
  );
  if (!result) {
    throw new AppError('NOT_FOUND', `Account "${params.accountId}" not found.`);
  }
  return accountResponseSchema.parse(result);
}

export async function handleDeleteAccount(
  repo: AccountsRepository,
  params: {
    userId: string;
    accountId: string;
    confirmation: DeleteAccountRequest;
  },
): Promise<DeleteAccountResponse> {
  if (
    !verifyConfirmationToken(
      params.confirmation,
      'delete-account',
      params.accountId,
    )
  ) {
    throw new AppError(
      'CONFIRMATION_REQUIRED',
      'Explicit confirmation required. Provide confirmAction: true and a valid confirmationToken.',
    );
  }

  const result = await repo.deleteAccountById(params.userId, params.accountId);
  return deleteAccountResponseSchema.parse(result);
}
