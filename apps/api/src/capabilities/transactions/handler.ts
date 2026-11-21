import { randomUUID } from 'node:crypto';
import {
  formatConfirmationToken,
  transactionSchema,
  verifyConfirmationToken,
  type ClearTransactionsRequest,
  type ClearTransactionsResponse,
  type CreateTransactionRequest,
  type DeleteTransactionResponse,
  type ListTransactionsQuery,
  type PatchTransactionRequest,
  type TransactionResponse,
  type TransactionsListResponse,
} from '@repo/contracts';
import { AppError } from '../../core/errors';
import type { TransactionsRepository } from './repository';
import {
  clearTransactionsResponseSchema,
  deleteTransactionResponseSchema,
  transactionResponseSchema,
  transactionsListResponseSchema,
} from './schema';

export async function handleListTransactions(
  repo: TransactionsRepository,
  params: { userId: string; query: ListTransactionsQuery },
): Promise<TransactionsListResponse> {
  const result = await repo.listTransactions(params.userId, params.query);
  return transactionsListResponseSchema.parse({
    transactions: result.transactions,
    total: result.total,
    limit: params.query.limit,
    offset: params.query.offset,
    revision: result.revision,
  });
}

export async function handleGetTransaction(
  repo: TransactionsRepository,
  params: { userId: string; transactionId: string },
): Promise<TransactionResponse> {
  const result = await repo.getTransactionById(
    params.userId,
    params.transactionId,
  );
  if (!result) {
    throw new AppError(
      'NOT_FOUND',
      `Transaction "${params.transactionId}" not found.`,
    );
  }
  return transactionResponseSchema.parse(result);
}

export async function handleCreateTransaction(
  repo: TransactionsRepository,
  params: { userId: string; input: CreateTransactionRequest },
): Promise<TransactionResponse> {
  const tx = transactionSchema.parse({
    ...params.input,
    id: `tx-${randomUUID()}`,
    createdAt: new Date().toISOString(),
  });
  const result = await repo.createTransaction(params.userId, tx);
  return transactionResponseSchema.parse(result);
}

export async function handleUpdateTransaction(
  repo: TransactionsRepository,
  params: {
    userId: string;
    transactionId: string;
    input: PatchTransactionRequest;
  },
): Promise<TransactionResponse> {
  const result = await repo.updateTransaction(
    params.userId,
    params.transactionId,
    params.input,
  );
  if (!result) {
    throw new AppError(
      'NOT_FOUND',
      `Transaction "${params.transactionId}" not found.`,
    );
  }
  return transactionResponseSchema.parse(result);
}

export async function handleDeleteTransaction(
  repo: TransactionsRepository,
  params: { userId: string; transactionId: string },
): Promise<DeleteTransactionResponse> {
  const result = await repo.deleteTransactionById(
    params.userId,
    params.transactionId,
  );
  if (!result) {
    throw new AppError(
      'NOT_FOUND',
      `Transaction "${params.transactionId}" not found.`,
    );
  }
  return deleteTransactionResponseSchema.parse(result);
}

export async function handleClearTransactions(
  repo: TransactionsRepository,
  params: { userId: string; confirmation: ClearTransactionsRequest },
): Promise<ClearTransactionsResponse> {
  if (
    !verifyConfirmationToken(params.confirmation, 'clear-transactions', 'all')
  ) {
    const expected = formatConfirmationToken('clear-transactions', 'all');
    throw new AppError(
      'CONFIRMATION_REQUIRED',
      `Explicit confirmation required. Provide confirmAction: true and confirmationToken "${expected}".`,
    );
  }

  const result = await repo.clearAllTransactions(params.userId);
  return clearTransactionsResponseSchema.parse(result);
}
