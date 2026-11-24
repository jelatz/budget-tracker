import {
  MAX_SAFE_MONEY_MINOR,
  transactionSchema,
  type ListTransactionsQuery,
  type Transaction,
  type TransactionSplit,
} from '@repo/contracts';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { AppDatabase } from '../../core/db/client';
import {
  accounts,
  balanceReconciliations,
  categories,
  transactions,
  transactionSplits,
  users,
} from '../../core/db/schema';
import { AppError } from '../../core/errors';

export interface TransactionsRepository {
  listTransactions(
    userId: string,
    query: ListTransactionsQuery,
  ): Promise<{ transactions: Transaction[]; total: number; revision: number }>;
  getTransactionById(
    userId: string,
    transactionId: string,
  ): Promise<{ transaction: Transaction; revision: number } | null>;
  createTransaction(
    userId: string,
    txData: Transaction,
  ): Promise<{ transaction: Transaction; revision: number }>;
  updateTransaction(
    userId: string,
    transactionId: string,
    nextData: Omit<Transaction, 'id' | 'createdAt'>,
  ): Promise<{ transaction: Transaction; revision: number } | null>;
  deleteTransactionById(
    userId: string,
    transactionId: string,
  ): Promise<{ deletedTransactionId: string; revision: number } | null>;
  clearAllTransactions(
    userId: string,
  ): Promise<{ clearedCount: number; revision: number }>;
}

function clampMinor(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(
    -MAX_SAFE_MONEY_MINOR,
    Math.min(MAX_SAFE_MONEY_MINOR, Math.trunc(value)),
  );
}

function computeAccountDeltas(
  tx: Pick<Transaction, 'type' | 'amountMinor' | 'accountId' | 'toAccountId'>,
  direction: 1 | -1,
): Map<string, number> {
  const deltas = new Map<string, number>();
  const addDelta = (accountId: string, delta: number) => {
    deltas.set(accountId, (deltas.get(accountId) ?? 0) + delta);
  };

  if (tx.type === 'EXPENSE') {
    addDelta(tx.accountId, -direction * tx.amountMinor);
  } else if (tx.type === 'INCOME') {
    addDelta(tx.accountId, direction * tx.amountMinor);
  } else if (tx.type === 'TRANSFER') {
    addDelta(tx.accountId, -direction * tx.amountMinor);
    if (tx.toAccountId) {
      addDelta(tx.toAccountId, direction * tx.amountMinor);
    }
  }
  return deltas;
}

function mapTransactionRow(
  row: typeof transactions.$inferSelect,
  splits: TransactionSplit[],
): Transaction {
  return transactionSchema.parse({
    id: row.id,
    type: row.type,
    amountMinor: Number(row.amountMinor),
    currency: row.currency,
    accountId: row.accountId,
    ...(row.toAccountId ? { toAccountId: row.toAccountId } : {}),
    ...(row.categoryId ? { categoryId: row.categoryId } : {}),
    ...(splits.length > 0 ? { splits } : {}),
    ...(row.merchant ? { merchant: row.merchant } : {}),
    tags: Array.isArray(row.tags) ? row.tags : [],
    ...(row.note ? { note: row.note } : {}),
    ...(row.receiptUri ? { receiptUri: row.receiptUri } : {}),
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  });
}

export function createPgTransactionsRepository(
  db: AppDatabase,
): TransactionsRepository {
  return {
    async listTransactions(userId, query) {
      const conditions = [eq(transactions.userId, userId)];
      if (query.accountId) {
        conditions.push(eq(transactions.accountId, query.accountId));
      }
      if (query.type) {
        conditions.push(eq(transactions.type, query.type));
      }
      const whereClause = and(...conditions);

      const [userRows, countRows, txRows] = await Promise.all([
        db
          .select({ stateRevision: users.stateRevision })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(transactions)
          .where(whereClause),
        db
          .select()
          .from(transactions)
          .where(whereClause)
          .orderBy(desc(transactions.occurredAt), asc(transactions.sortOrder))
          .limit(query.limit)
          .offset(query.offset),
      ]);

      const userRow = userRows[0];
      if (!userRow) {
        throw new AppError('UNAUTHORIZED', 'Account not found.');
      }

      const txIds = txRows.map((row) => row.id);
      const splitsByTxId = new Map<string, TransactionSplit[]>();
      if (txIds.length > 0) {
        const splitRows = await db
          .select()
          .from(transactionSplits)
          .where(
            and(
              eq(transactionSplits.userId, userId),
              inArray(transactionSplits.transactionId, txIds),
            ),
          )
          .orderBy(asc(transactionSplits.sortOrder));

        for (const s of splitRows) {
          const list = splitsByTxId.get(s.transactionId) ?? [];
          list.push({
            id: s.id,
            categoryId: s.categoryId,
            amountMinor: Number(s.amountMinor),
            ...(s.note ? { note: s.note } : {}),
          });
          splitsByTxId.set(s.transactionId, list);
        }
      }

      return {
        transactions: txRows.map((row) =>
          mapTransactionRow(row, splitsByTxId.get(row.id) ?? []),
        ),
        total: Number(countRows[0]?.count ?? 0),
        revision: Number(userRow.stateRevision),
      };
    },

    async getTransactionById(userId, transactionId) {
      const [userRows, txRows, splitRows] = await Promise.all([
        db
          .select({ stateRevision: users.stateRevision })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1),
        db
          .select()
          .from(transactions)
          .where(
            and(
              eq(transactions.userId, userId),
              eq(transactions.id, transactionId),
            ),
          )
          .limit(1),
        db
          .select()
          .from(transactionSplits)
          .where(
            and(
              eq(transactionSplits.userId, userId),
              eq(transactionSplits.transactionId, transactionId),
            ),
          )
          .orderBy(asc(transactionSplits.sortOrder)),
      ]);

      const userRow = userRows[0];
      if (!userRow) {
        throw new AppError('UNAUTHORIZED', 'Account not found.');
      }
      const row = txRows[0];
      if (!row) {
        return null;
      }

      const splits: TransactionSplit[] = splitRows.map((s) => ({
        id: s.id,
        categoryId: s.categoryId,
        amountMinor: Number(s.amountMinor),
        ...(s.note ? { note: s.note } : {}),
      }));

      return {
        transaction: mapTransactionRow(row, splits),
        revision: Number(userRow.stateRevision),
      };
    },

    async createTransaction(userId, txData) {
      return db.transaction(async (tx) => {
        const [userRow] = await tx
          .select({ stateRevision: users.stateRevision })
          .from(users)
          .where(eq(users.id, userId))
          .for('update');

        if (!userRow) {
          throw new AppError('UNAUTHORIZED', 'Account not found.');
        }

        const requiredAccountIds = txData.toAccountId
          ? [txData.accountId, txData.toAccountId]
          : [txData.accountId];
        const matchedAccounts = await tx
          .select()
          .from(accounts)
          .where(
            and(
              eq(accounts.userId, userId),
              inArray(accounts.id, requiredAccountIds),
            ),
          );

        const accountMap = new Map(matchedAccounts.map((a) => [a.id, a]));
        for (const reqId of requiredAccountIds) {
          const matched = accountMap.get(reqId);
          if (!matched) {
            throw new AppError('NOT_FOUND', `Account "${reqId}" not found.`);
          }
          if (matched.currency !== txData.currency) {
            throw new AppError(
              'VALIDATION_ERROR',
              'Transaction currency must match account currency.',
            );
          }
        }

        await tx.insert(transactions).values({
          userId,
          id: txData.id,
          type: txData.type,
          amountMinor: txData.amountMinor,
          currency: txData.currency,
          accountId: txData.accountId,
          toAccountId: txData.toAccountId ?? null,
          categoryId: txData.categoryId ?? null,
          merchant: txData.merchant ?? null,
          tags: txData.tags,
          note: txData.note ?? null,
          receiptUri: txData.receiptUri ?? null,
          occurredAt: new Date(txData.occurredAt),
          createdAt: new Date(txData.createdAt),
          sortOrder: 0,
        });

        if (txData.splits && txData.splits.length > 0) {
          await tx.insert(transactionSplits).values(
            txData.splits.map((split, index) => ({
              userId,
              transactionId: txData.id,
              id: split.id,
              categoryId: split.categoryId,
              amountMinor: split.amountMinor,
              note: split.note ?? null,
              sortOrder: index,
            })),
          );
        }

        const deltas = computeAccountDeltas(txData, 1);
        for (const [accountId, delta] of deltas.entries()) {
          const acc = accountMap.get(accountId);
          if (acc && delta !== 0) {
            await tx
              .update(accounts)
              .set({ balanceMinor: clampMinor(Number(acc.balanceMinor) + delta) })
              .where(and(eq(accounts.userId, userId), eq(accounts.id, accountId)));
          }
        }

        const nextRevision = Number(userRow.stateRevision) + 1;
        await tx
          .update(users)
          .set({ stateRevision: nextRevision, updatedAt: new Date() })
          .where(eq(users.id, userId));

        return { transaction: txData, revision: nextRevision };
      });
    },

    async updateTransaction(userId, transactionId, nextData) {
      return db.transaction(async (tx) => {
        const [userRow] = await tx
          .select({ stateRevision: users.stateRevision })
          .from(users)
          .where(eq(users.id, userId))
          .for('update');

        if (!userRow) {
          throw new AppError('UNAUTHORIZED', 'Account not found.');
        }

        const [existingRow] = await tx
          .select()
          .from(transactions)
          .where(
            and(
              eq(transactions.userId, userId),
              eq(transactions.id, transactionId),
            ),
          )
          .limit(1);

        if (!existingRow) {
          return null;
        }

        const existingSplitRows = await tx
          .select()
          .from(transactionSplits)
          .where(
            and(
              eq(transactionSplits.userId, userId),
              eq(transactionSplits.transactionId, transactionId),
            ),
          )
          .orderBy(asc(transactionSplits.sortOrder));

        const existingSplits: TransactionSplit[] = existingSplitRows.map((s) => ({
          id: s.id,
          categoryId: s.categoryId,
          amountMinor: Number(s.amountMinor),
          ...(s.note ? { note: s.note } : {}),
        }));

        const existingTx = mapTransactionRow(existingRow, existingSplits);
        const updatedTx = transactionSchema.parse({
          ...nextData,
          id: existingRow.id,
          createdAt: existingRow.createdAt.toISOString(),
        });

        const involvedIds = Array.from(
          new Set(
            [
              existingTx.accountId,
              existingTx.toAccountId,
              updatedTx.accountId,
              updatedTx.toAccountId,
            ].filter((id): id is string => Boolean(id)),
          ),
        );
        const matchedAccounts = await tx
          .select()
          .from(accounts)
          .where(
            and(eq(accounts.userId, userId), inArray(accounts.id, involvedIds)),
          );
        const accountMap = new Map(matchedAccounts.map((a) => [a.id, a]));

        for (const reqId of [updatedTx.accountId, updatedTx.toAccountId].filter(
          (id): id is string => Boolean(id),
        )) {
          const matched = accountMap.get(reqId);
          if (!matched) {
            throw new AppError('NOT_FOUND', `Account "${reqId}" not found.`);
          }
          if (matched.currency !== updatedTx.currency) {
            throw new AppError(
              'VALIDATION_ERROR',
              'Transaction currency must match account currency.',
            );
          }
        }

        const combinedDeltas = new Map<string, number>();
        for (const [accId, delta] of computeAccountDeltas(existingTx, -1)) {
          combinedDeltas.set(accId, (combinedDeltas.get(accId) ?? 0) + delta);
        }
        for (const [accId, delta] of computeAccountDeltas(updatedTx, 1)) {
          combinedDeltas.set(accId, (combinedDeltas.get(accId) ?? 0) + delta);
        }

        await tx
          .update(transactions)
          .set({
            type: updatedTx.type,
            amountMinor: updatedTx.amountMinor,
            currency: updatedTx.currency,
            accountId: updatedTx.accountId,
            toAccountId: updatedTx.toAccountId ?? null,
            categoryId: updatedTx.categoryId ?? null,
            merchant: updatedTx.merchant ?? null,
            tags: updatedTx.tags,
            note: updatedTx.note ?? null,
            receiptUri: updatedTx.receiptUri ?? null,
            occurredAt: new Date(updatedTx.occurredAt),
          })
          .where(
            and(
              eq(transactions.userId, userId),
              eq(transactions.id, transactionId),
            ),
          );

        await tx
          .delete(transactionSplits)
          .where(
            and(
              eq(transactionSplits.userId, userId),
              eq(transactionSplits.transactionId, transactionId),
            ),
          );

        if (updatedTx.splits && updatedTx.splits.length > 0) {
          await tx.insert(transactionSplits).values(
            updatedTx.splits.map((split, index) => ({
              userId,
              transactionId,
              id: split.id,
              categoryId: split.categoryId,
              amountMinor: split.amountMinor,
              note: split.note ?? null,
              sortOrder: index,
            })),
          );
        }

        for (const [accId, delta] of combinedDeltas.entries()) {
          const acc = accountMap.get(accId);
          if (acc && delta !== 0) {
            await tx
              .update(accounts)
              .set({ balanceMinor: clampMinor(Number(acc.balanceMinor) + delta) })
              .where(and(eq(accounts.userId, userId), eq(accounts.id, accId)));
          }
        }

        const nextRevision = Number(userRow.stateRevision) + 1;
        await tx
          .update(users)
          .set({ stateRevision: nextRevision, updatedAt: new Date() })
          .where(eq(users.id, userId));

        return { transaction: updatedTx, revision: nextRevision };
      });
    },

    async deleteTransactionById(userId, transactionId) {
      return db.transaction(async (tx) => {
        const [userRow] = await tx
          .select({ stateRevision: users.stateRevision })
          .from(users)
          .where(eq(users.id, userId))
          .for('update');

        if (!userRow) {
          throw new AppError('UNAUTHORIZED', 'Account not found.');
        }

        const [existingRow] = await tx
          .select()
          .from(transactions)
          .where(
            and(
              eq(transactions.userId, userId),
              eq(transactions.id, transactionId),
            ),
          )
          .limit(1);

        if (!existingRow) {
          return null;
        }

        const existingSplitRows = await tx
          .select()
          .from(transactionSplits)
          .where(
            and(
              eq(transactionSplits.userId, userId),
              eq(transactionSplits.transactionId, transactionId),
            ),
          )
          .orderBy(asc(transactionSplits.sortOrder));

        const existingSplits: TransactionSplit[] = existingSplitRows.map((s) => ({
          id: s.id,
          categoryId: s.categoryId,
          amountMinor: Number(s.amountMinor),
          ...(s.note ? { note: s.note } : {}),
        }));

        const existingTx = mapTransactionRow(existingRow, existingSplits);
        const reverseDeltas = computeAccountDeltas(existingTx, -1);
        const affectedAccountIds = Array.from(reverseDeltas.keys());

        if (affectedAccountIds.length > 0) {
          const matchedAccounts = await tx
            .select()
            .from(accounts)
            .where(
              and(
                eq(accounts.userId, userId),
                inArray(accounts.id, affectedAccountIds),
              ),
            );
          for (const acc of matchedAccounts) {
            const delta = reverseDeltas.get(acc.id) ?? 0;
            if (delta !== 0) {
              await tx
                .update(accounts)
                .set({ balanceMinor: clampMinor(Number(acc.balanceMinor) + delta) })
                .where(and(eq(accounts.userId, userId), eq(accounts.id, acc.id)));
            }
          }
        }

        await tx
          .delete(transactions)
          .where(
            and(
              eq(transactions.userId, userId),
              eq(transactions.id, transactionId),
            ),
          );

        const nextRevision = Number(userRow.stateRevision) + 1;
        await tx
          .update(users)
          .set({ stateRevision: nextRevision, updatedAt: new Date() })
          .where(eq(users.id, userId));

        return { deletedTransactionId: transactionId, revision: nextRevision };
      });
    },

    async clearAllTransactions(userId) {
      return db.transaction(async (tx) => {
        const [userRow] = await tx
          .select({ stateRevision: users.stateRevision })
          .from(users)
          .where(eq(users.id, userId))
          .for('update');

        if (!userRow) {
          throw new AppError('UNAUTHORIZED', 'Account not found.');
        }

        const deletedRows = await tx
          .delete(transactions)
          .where(eq(transactions.userId, userId))
          .returning({ id: transactions.id });

        await tx
          .update(accounts)
          .set({ balanceMinor: 0 })
          .where(eq(accounts.userId, userId));

        await tx
          .update(categories)
          .set({ usageCount: 0 })
          .where(eq(categories.userId, userId));

        await tx
          .delete(balanceReconciliations)
          .where(eq(balanceReconciliations.userId, userId));

        const nextRevision = Number(userRow.stateRevision) + 1;
        await tx
          .update(users)
          .set({ stateRevision: nextRevision, updatedAt: new Date() })
          .where(eq(users.id, userId));

        return { clearedCount: deletedRows.length, revision: nextRevision };
      });
    },
  };
}
