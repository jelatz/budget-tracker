import {
  accountSchema,
  balanceReconciliationSchema,
  computeReconciliationDelta,
  DEFAULT_CURRENCY,
  MAX_SAFE_MONEY_MINOR,
  normalizeLegacyAccountType,
  transactionSchema,
  type Account,
  type BalanceReconciliation,
  type Transaction,
} from '@repo/contracts';
import { and, desc, eq } from 'drizzle-orm';
import type { AppDatabase } from '../../core/db/client';
import {
  accounts,
  balanceReconciliations,
  transactions,
  users,
} from '../../core/db/schema';
import { AppError } from '../../core/errors';

export interface ReconcileApplyParams {
  userId: string;
  reconciliationId: string;
  accountId: string;
  actualBalanceMinor: number;
  createAdjustment: boolean;
  notes?: string;
  reconciledAt: string;
}

export interface ReconcileApplyResult {
  reconciliation: BalanceReconciliation;
  account: Account;
  adjustmentTransaction?: Transaction;
  revision: number;
}

export interface ReconcileRepository {
  listReconciliations(
    userId: string,
  ): Promise<{ reconciliations: BalanceReconciliation[]; revision: number }>;
  getReconciliationById(
    userId: string,
    reconciliationId: string,
  ): Promise<{ reconciliation: BalanceReconciliation; revision: number } | null>;
  applyReconciliation(
    params: ReconcileApplyParams,
  ): Promise<ReconcileApplyResult>;
}

function mapReconciliationRow(
  row: typeof balanceReconciliations.$inferSelect,
): BalanceReconciliation {
  return balanceReconciliationSchema.parse({
    id: row.id,
    accountId: row.accountId,
    appBalanceMinor: Number(row.appBalanceMinor),
    actualBalanceMinor: Number(row.actualBalanceMinor),
    discrepancyMinor: Number(row.discrepancyMinor),
    reconciledAt: row.reconciledAt.toISOString(),
    ...(row.adjustmentTransactionId
      ? { adjustmentTransactionId: row.adjustmentTransactionId }
      : {}),
  });
}

function mapAccountRow(row: typeof accounts.$inferSelect): Account {
  return accountSchema.parse({
    id: row.id,
    name: row.name,
    accountType: normalizeLegacyAccountType(row.accountType),
    icon: row.icon,
    color: row.color,
    currency: row.currency,
    balanceMinor: Number(row.balanceMinor),
  });
}

export function createPgReconcileRepository(
  db: AppDatabase,
): ReconcileRepository {
  return {
    async listReconciliations(userId) {
      const [userRows, rows] = await Promise.all([
        db
          .select({ stateRevision: users.stateRevision })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1),
        db
          .select()
          .from(balanceReconciliations)
          .where(eq(balanceReconciliations.userId, userId))
          .orderBy(desc(balanceReconciliations.reconciledAt)),
      ]);

      const userRow = userRows[0];
      if (!userRow) {
        throw new AppError('UNAUTHORIZED', 'Account not found.');
      }

      return {
        reconciliations: rows.map(mapReconciliationRow),
        revision: Number(userRow.stateRevision),
      };
    },

    async getReconciliationById(userId, reconciliationId) {
      const [userRows, rows] = await Promise.all([
        db
          .select({ stateRevision: users.stateRevision })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1),
        db
          .select()
          .from(balanceReconciliations)
          .where(
            and(
              eq(balanceReconciliations.userId, userId),
              eq(balanceReconciliations.id, reconciliationId),
            ),
          )
          .limit(1),
      ]);

      const userRow = userRows[0];
      if (!userRow) {
        throw new AppError('UNAUTHORIZED', 'Account not found.');
      }
      const row = rows[0];
      if (!row) {
        return null;
      }

      return {
        reconciliation: mapReconciliationRow(row),
        revision: Number(userRow.stateRevision),
      };
    },

    async applyReconciliation(params) {
      return db.transaction(async (tx) => {
        const [userRow] = await tx
          .select({ stateRevision: users.stateRevision })
          .from(users)
          .where(eq(users.id, params.userId))
          .for('update');

        if (!userRow) {
          throw new AppError('UNAUTHORIZED', 'Account not found.');
        }

        // Always load fresh account balance from PostgreSQL by ID
        const [accountRow] = await tx
          .select()
          .from(accounts)
          .where(
            and(
              eq(accounts.userId, params.userId),
              eq(accounts.id, params.accountId),
            ),
          )
          .limit(1);

        if (!accountRow) {
          throw new AppError(
            'NOT_FOUND',
            `Account "${params.accountId}" not found.`,
          );
        }

        const appBalanceMinor = Number(accountRow.balanceMinor);
        const delta = computeReconciliationDelta(
          appBalanceMinor,
          params.actualBalanceMinor,
        );

        let adjustmentTransaction: Transaction | undefined;
        let adjustmentTransactionId: string | undefined;

        if (params.createAdjustment && delta.needsAdjustment) {
          adjustmentTransactionId = `${params.reconciliationId}-adj`;
          adjustmentTransaction = transactionSchema.parse({
            id: adjustmentTransactionId,
            type: delta.adjustmentType === 'INCOME' ? 'INCOME' : 'EXPENSE',
            amountMinor: Math.min(
              delta.adjustmentAmountMinor,
              MAX_SAFE_MONEY_MINOR,
            ),
            currency: accountRow.currency ?? DEFAULT_CURRENCY,
            accountId: params.accountId,
            categoryId:
              delta.adjustmentType === 'INCOME' ? 'cat-other-income' : 'cat-dues',
            merchant: 'Balance Adjustment',
            note: (params.notes?.trim() || 'Reconciliation adjustment').slice(
              0,
              280,
            ),
            tags: ['reconciliation'],
            occurredAt: params.reconciledAt,
            createdAt: params.reconciledAt,
          });

          await tx.insert(transactions).values({
            userId: params.userId,
            id: adjustmentTransaction.id,
            type: adjustmentTransaction.type,
            amountMinor: adjustmentTransaction.amountMinor,
            currency: adjustmentTransaction.currency,
            accountId: adjustmentTransaction.accountId,
            toAccountId: null,
            categoryId: adjustmentTransaction.categoryId ?? null,
            merchant: adjustmentTransaction.merchant ?? null,
            tags: adjustmentTransaction.tags,
            note: adjustmentTransaction.note ?? null,
            receiptUri: null,
            occurredAt: new Date(adjustmentTransaction.occurredAt),
            createdAt: new Date(adjustmentTransaction.createdAt),
            sortOrder: 0,
          });
        }

        const [updatedAccountRow] = await tx
          .update(accounts)
          .set({ balanceMinor: params.actualBalanceMinor })
          .where(
            and(
              eq(accounts.userId, params.userId),
              eq(accounts.id, params.accountId),
            ),
          )
          .returning();

        const reconciliation = balanceReconciliationSchema.parse({
          id: params.reconciliationId,
          accountId: params.accountId,
          appBalanceMinor,
          actualBalanceMinor: params.actualBalanceMinor,
          discrepancyMinor: delta.discrepancyMinor,
          reconciledAt: params.reconciledAt,
          ...(adjustmentTransactionId ? { adjustmentTransactionId } : {}),
        });

        await tx.insert(balanceReconciliations).values({
          userId: params.userId,
          id: reconciliation.id,
          accountId: reconciliation.accountId,
          appBalanceMinor: reconciliation.appBalanceMinor,
          actualBalanceMinor: reconciliation.actualBalanceMinor,
          discrepancyMinor: reconciliation.discrepancyMinor,
          reconciledAt: new Date(reconciliation.reconciledAt),
          adjustmentTransactionId: reconciliation.adjustmentTransactionId ?? null,
          sortOrder: 0,
        });

        const nextRevision = Number(userRow.stateRevision) + 1;
        await tx
          .update(users)
          .set({ stateRevision: nextRevision, updatedAt: new Date() })
          .where(eq(users.id, params.userId));

        return {
          reconciliation,
          account: mapAccountRow(updatedAccountRow),
          ...(adjustmentTransaction ? { adjustmentTransaction } : {}),
          revision: nextRevision,
        };
      });
    },
  };
}
