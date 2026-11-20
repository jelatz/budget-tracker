import { and, eq } from 'drizzle-orm';
import {
  transactionSchema,
  type CreateTransactionInput,
  type Transaction,
  type TransactionSplit,
  type UpdateTransactionInput,
} from '@repo/contracts';
import type { AppDb } from '../../core/db/client';
import { transactionSplits, transactions } from '../../core/db/schema';
import { AppError } from '../../core/errors';
import {
  applyTxSideEffects,
  assertOwnedCategories,
  assertOwnedWallet,
  assertTransactionCurrencyConsistency,
  createTransactionInTx,
  generateId,
  loadTransactionById,
  loadTransactionsWithSplits,
  refreshSettingsFromTransaction,
} from '../shared/tx-helpers';

export async function listTransactions(
  db: AppDb,
  userId: string,
): Promise<Transaction[]> {
  return loadTransactionsWithSplits(db, userId);
}

export async function createTransaction(
  db: AppDb,
  userId: string,
  input: CreateTransactionInput,
): Promise<Transaction> {
  return db.transaction(async (tx) =>
    createTransactionInTx(tx, userId, input, {
      updateLastWallets: true,
      refreshSettings: true,
    }),
  );
}

export async function createTransactionsBatch(
  db: AppDb,
  userId: string,
  inputs: readonly CreateTransactionInput[],
): Promise<Transaction[]> {
  return db.transaction(async (tx) => {
    const created: Transaction[] = [];
    for (const input of inputs) {
      const item = await createTransactionInTx(tx, userId, input, {
        updateLastWallets: false,
        refreshSettings: false,
      });
      created.push(item);
    }
    return created;
  });
}

export async function updateTransaction(
  db: AppDb,
  userId: string,
  transactionId: string,
  input: UpdateTransactionInput,
): Promise<Transaction> {
  return db.transaction(async (tx) => {
    const existing = await loadTransactionById(tx, userId, transactionId, {
      forUpdate: true,
    });

    const sourceWallet = await assertOwnedWallet(tx, userId, input.walletId, 'Source wallet');
    const destWallet =
      input.type === 'TRANSFER' && input.toWalletId
        ? await assertOwnedWallet(tx, userId, input.toWalletId, 'Destination wallet')
        : undefined;
    assertTransactionCurrencyConsistency(input.currency, sourceWallet, destWallet);

    const catIdsToCheck: string[] = [];
    if (input.categoryId) catIdsToCheck.push(input.categoryId);
    if (input.splits) {
      for (const split of input.splits) {
        catIdsToCheck.push(split.categoryId);
      }
    }
    await assertOwnedCategories(tx, userId, catIdsToCheck);

    // Reverse old transaction wallet & category usage effects
    await applyTxSideEffects(tx, userId, existing, -1);

    const occurredAtDate = new Date(input.occurredAt);
    await tx
      .update(transactions)
      .set({
        type: input.type,
        amountMinor: input.amountMinor,
        currency: input.currency,
        walletId: input.walletId,
        toWalletId: input.type === 'TRANSFER' ? (input.toWalletId ?? null) : null,
        categoryId:
          input.type !== 'TRANSFER' && (!input.splits || input.splits.length === 0)
            ? (input.categoryId ?? null)
            : null,
        merchant: input.merchant ?? null,
        tags: input.tags ?? [],
        note: input.note ?? null,
        receiptUri: input.receiptUri ?? null,
        occurredAt: occurredAtDate,
      })
      .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)));

    await tx
      .delete(transactionSplits)
      .where(eq(transactionSplits.transactionId, transactionId));

    const persistedSplits: TransactionSplit[] = [];
    if (input.type !== 'TRANSFER' && input.splits && input.splits.length > 0) {
      const splitRows = input.splits.map((s) => {
        const splitId = generateId('split');
        persistedSplits.push({
          id: splitId,
          categoryId: s.categoryId,
          amountMinor: s.amountMinor,
          ...(s.note !== undefined ? { note: s.note } : {}),
        });
        return {
          id: splitId,
          transactionId,
          categoryId: s.categoryId,
          amountMinor: s.amountMinor,
          note: s.note ?? null,
        };
      });
      await tx.insert(transactionSplits).values(splitRows);
    }

    const updatedTx = transactionSchema.parse({
      id: existing.id,
      type: input.type,
      amountMinor: input.amountMinor,
      currency: input.currency,
      walletId: input.walletId,
      ...(input.type === 'TRANSFER' && input.toWalletId !== undefined
        ? { toWalletId: input.toWalletId }
        : {}),
      ...(input.type !== 'TRANSFER' &&
      (!input.splits || input.splits.length === 0) &&
      input.categoryId !== undefined
        ? { categoryId: input.categoryId }
        : {}),
      ...(persistedSplits.length > 0 ? { splits: persistedSplits } : {}),
      ...(input.merchant !== undefined ? { merchant: input.merchant } : {}),
      tags: input.tags ?? [],
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.receiptUri !== undefined ? { receiptUri: input.receiptUri } : {}),
      occurredAt: occurredAtDate.toISOString(),
      createdAt: existing.createdAt,
    });

    await applyTxSideEffects(tx, userId, updatedTx, 1);
    await refreshSettingsFromTransaction(tx, userId, updatedTx, false);

    return updatedTx;
  });
}

export async function deleteTransaction(
  db: AppDb,
  userId: string,
  transactionId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const existing = await loadTransactionById(tx, userId, transactionId, {
      forUpdate: true,
    });
    const deleted = await tx
      .delete(transactions)
      .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)))
      .returning({ id: transactions.id });
    if (!deleted[0]) {
      throw new AppError('NOT_FOUND', 'Transaction not found');
    }
    await applyTxSideEffects(tx, userId, existing, -1);
  });
}
