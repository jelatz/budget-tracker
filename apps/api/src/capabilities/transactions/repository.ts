import {
  MAX_SAFE_MONEY_MINOR,
  transactionSchema,
  type ListTransactionsQuery,
  type Transaction,
} from '@repo/contracts';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  getMoneyCipher,
  type MoneyCipher,
} from '../../core/crypto/field-encryption';
import type { AppDatabase } from '../../core/db/client';
import {
  accounts,
  categories,
  transactions,
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
  cipher: MoneyCipher,
): Transaction {
  return transactionSchema.parse({
    id: row.id,
    type: row.type,
    amountMinor: cipher.decrypt(row.amountMinor, {
      userId: row.userId,
      table: 'transactions',
      rowId: row.id,
      column: 'amount_minor',
    }),
    currency: row.currency,
    accountId: row.accountId,
    ...(row.toAccountId ? { toAccountId: row.toAccountId } : {}),
    ...(row.categoryId ? { categoryId: row.categoryId } : {}),
    ...(row.incomeSourceId ? { incomeSourceId: row.incomeSourceId } : {}),
    ...(row.commitmentId ? { commitmentId: row.commitmentId } : {}),
    ...(row.merchant ? { merchant: row.merchant } : {}),
    ...(row.note ? { note: row.note } : {}),
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  });
}

export function createPgTransactionsRepository(
  db: AppDatabase,
  cipher: MoneyCipher = getMoneyCipher(),
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

      return {
        transactions: txRows.map((row) => mapTransactionRow(row, cipher)),
        total: Number(countRows[0]?.count ?? 0),
        revision: Number(userRow.stateRevision),
      };
    },

    async getTransactionById(userId, transactionId) {
      const [userRows, txRows] = await Promise.all([
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
      ]);

      const userRow = userRows[0];
      if (!userRow) {
        throw new AppError('UNAUTHORIZED', 'Account not found.');
      }
      const row = txRows[0];
      if (!row) {
        return null;
      }

      return {
        transaction: mapTransactionRow(row, cipher),
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
          amountMinor: cipher.encrypt(txData.amountMinor, {
            userId,
            table: 'transactions',
            rowId: txData.id,
            column: 'amount_minor',
          }),
          currency: txData.currency,
          accountId: txData.accountId,
          toAccountId: txData.toAccountId ?? null,
          categoryId: txData.categoryId ?? null,
          incomeSourceId: txData.incomeSourceId ?? null,
          commitmentId: txData.commitmentId ?? null,
          merchant: txData.merchant ?? null,
          note: txData.note ?? null,
          occurredAt: new Date(txData.occurredAt),
          createdAt: new Date(txData.createdAt),
          sortOrder: 0,
        });

        const deltas = computeAccountDeltas(txData, 1);
        for (const [accountId, delta] of deltas.entries()) {
          const acc = accountMap.get(accountId);
          if (acc && delta !== 0) {
            const currentBalance = cipher.decrypt(acc.balanceMinor, {
              userId,
              table: 'accounts',
              rowId: accountId,
              column: 'balance_minor',
            });
            const nextBalance = clampMinor(currentBalance + delta);
            await tx
              .update(accounts)
              .set({
                balanceMinor: cipher.encrypt(nextBalance, {
                  userId,
                  table: 'accounts',
                  rowId: accountId,
                  column: 'balance_minor',
                }),
              })
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

        const existingTx = mapTransactionRow(existingRow, cipher);
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
            amountMinor: cipher.encrypt(updatedTx.amountMinor, {
              userId,
              table: 'transactions',
              rowId: transactionId,
              column: 'amount_minor',
            }),
            currency: updatedTx.currency,
            accountId: updatedTx.accountId,
            toAccountId: updatedTx.toAccountId ?? null,
            categoryId: updatedTx.categoryId ?? null,
            incomeSourceId: updatedTx.incomeSourceId ?? null,
            commitmentId: updatedTx.commitmentId ?? null,
            merchant: updatedTx.merchant ?? null,
            note: updatedTx.note ?? null,
            occurredAt: new Date(updatedTx.occurredAt),
          })
          .where(
            and(
              eq(transactions.userId, userId),
              eq(transactions.id, transactionId),
            ),
          );

        for (const [accId, delta] of combinedDeltas.entries()) {
          const acc = accountMap.get(accId);
          if (acc && delta !== 0) {
            const currentBalance = cipher.decrypt(acc.balanceMinor, {
              userId,
              table: 'accounts',
              rowId: accId,
              column: 'balance_minor',
            });
            const nextBalance = clampMinor(currentBalance + delta);
            await tx
              .update(accounts)
              .set({
                balanceMinor: cipher.encrypt(nextBalance, {
                  userId,
                  table: 'accounts',
                  rowId: accId,
                  column: 'balance_minor',
                }),
              })
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

        const existingTx = mapTransactionRow(existingRow, cipher);
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
              const currentBalance = cipher.decrypt(acc.balanceMinor, {
                userId,
                table: 'accounts',
                rowId: acc.id,
                column: 'balance_minor',
              });
              const nextBalance = clampMinor(currentBalance + delta);
              await tx
                .update(accounts)
                .set({
                  balanceMinor: cipher.encrypt(nextBalance, {
                    userId,
                    table: 'accounts',
                    rowId: acc.id,
                    column: 'balance_minor',
                  }),
                })
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

        const userAccounts = await tx
          .select({ id: accounts.id })
          .from(accounts)
          .where(eq(accounts.userId, userId));

        for (const acc of userAccounts) {
          await tx
            .update(accounts)
            .set({
              balanceMinor: cipher.encrypt(0, {
                userId,
                table: 'accounts',
                rowId: acc.id,
                column: 'balance_minor',
              }),
            })
            .where(and(eq(accounts.userId, userId), eq(accounts.id, acc.id)));
        }

        await tx
          .update(categories)
          .set({ usageCount: 0 })
          .where(eq(categories.userId, userId));

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
