import {
  applySyncMutations,
  createInitialSyncDataState,
  syncDataStateSchema,
  type SyncDataState,
  type SyncMutation,
} from '@repo/contracts';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { AppDatabase } from '../../core/db/client';
import {
  accounts,
  balanceReconciliations,
  categories,
  categoryBudgets,
  quickPresets,
  recurringCommitments,
  sinkingFunds,
  syncOperations,
  transactions,
  transactionSplits,
  users,
  userSettings,
} from '../../core/db/schema';
import { AppError } from '../../core/errors';

export type DbOrTx = Pick<
  AppDatabase,
  'select' | 'insert' | 'update' | 'delete'
>;

export interface SyncPullResult {
  revision: number;
  state: SyncDataState;
}

export interface SyncPushResult {
  revision: number;
  appliedOpIds: string[];
  state: SyncDataState;
}

export interface SyncRepository {
  getUserRevision(userId: string): Promise<number | null>;
  pullState(userId: string): Promise<SyncPullResult | null>;
  pushMutations(params: {
    userId: string;
    lastKnownRevision?: number;
    mutations: readonly SyncMutation[];
  }): Promise<SyncPushResult>;
}

export function isConflictingSyncMutation(
  mutation: SyncMutation,
  currentState: SyncDataState,
): boolean {
  switch (mutation.type) {
    case 'transactions.clearAll':
    case 'state.resetDemo':
    case 'transaction.update':
    case 'account.delete':
    case 'reconciliation.apply':
      return true;
    case 'backup.import':
      return mutation.mode === 'overwrite';
    case 'account.upsert':
      return currentState.accounts.some((a) => a.id === mutation.account.id);
    default:
      return false;
  }
}

function chunkArray<T>(items: readonly T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

export async function loadUserSyncStateInTx(
  db: DbOrTx,
  userId: string,
): Promise<SyncDataState> {
  const [
    settingsRows,
    accountRows,
    categoryRows,
    txRows,
    splitRows,
    budgetRows,
    commitmentRows,
    fundRows,
    presetRows,
    reconciliationRows,
  ] = await Promise.all([
    db.select().from(userSettings).where(eq(userSettings.userId, userId)),
    db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, userId))
      .orderBy(asc(accounts.sortOrder)),
    db
      .select()
      .from(categories)
      .where(eq(categories.userId, userId))
      .orderBy(asc(categories.defaultOrder)),
    db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(asc(transactions.sortOrder)),
    db
      .select()
      .from(transactionSplits)
      .where(eq(transactionSplits.userId, userId))
      .orderBy(asc(transactionSplits.sortOrder)),
    db
      .select()
      .from(categoryBudgets)
      .where(eq(categoryBudgets.userId, userId))
      .orderBy(asc(categoryBudgets.sortOrder)),
    db
      .select()
      .from(recurringCommitments)
      .where(eq(recurringCommitments.userId, userId))
      .orderBy(asc(recurringCommitments.sortOrder)),
    db
      .select()
      .from(sinkingFunds)
      .where(eq(sinkingFunds.userId, userId))
      .orderBy(asc(sinkingFunds.sortOrder)),
    db
      .select()
      .from(quickPresets)
      .where(eq(quickPresets.userId, userId))
      .orderBy(asc(quickPresets.sortOrder)),
    db
      .select()
      .from(balanceReconciliations)
      .where(eq(balanceReconciliations.userId, userId))
      .orderBy(asc(balanceReconciliations.sortOrder)),
  ]);

  const settings = settingsRows[0];
  if (!settings) {
    return createInitialSyncDataState();
  }

  const splitsByTxId = new Map<
    string,
    Array<{ id: string; categoryId: string; amountMinor: number; note?: string }>
  >();
  for (const split of splitRows) {
    const existing = splitsByTxId.get(split.transactionId) ?? [];
    existing.push({
      id: split.id,
      categoryId: split.categoryId,
      amountMinor: split.amountMinor,
      ...(split.note ? { note: split.note } : {}),
    });
    splitsByTxId.set(split.transactionId, existing);
  }

  return syncDataStateSchema.parse({
    accounts: accountRows.map((a) => ({
      id: a.id,
      name: a.name,
      accountType: a.accountType,
      icon: a.icon,
      color: a.color,
      currency: a.currency,
      balanceMinor: a.balanceMinor,
    })),
    categories: categoryRows.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      icon: c.icon,
      color: c.color,
      usageCount: c.usageCount,
      defaultOrder: c.defaultOrder,
      isCustom: c.isCustom,
    })),
    transactions: txRows.map((t) => {
      const splits = splitsByTxId.get(t.id);
      return {
        id: t.id,
        type: t.type,
        amountMinor: t.amountMinor,
        currency: t.currency,
        accountId: t.accountId,
        ...(t.toAccountId ? { toAccountId: t.toAccountId } : {}),
        ...(t.categoryId ? { categoryId: t.categoryId } : {}),
        ...(splits && splits.length > 0 ? { splits } : {}),
        ...(t.merchant ? { merchant: t.merchant } : {}),
        tags: t.tags,
        ...(t.note ? { note: t.note } : {}),
        ...(t.receiptUri ? { receiptUri: t.receiptUri } : {}),
        occurredAt: t.occurredAt.toISOString(),
        createdAt: t.createdAt.toISOString(),
      };
    }),
    smartDefaults: {
      lastAccountId: settings.lastAccountId,
      ...(settings.lastTransferToAccountId
        ? { lastTransferToAccountId: settings.lastTransferToAccountId }
        : {}),
      recentMerchants: settings.recentMerchants,
      knownTags: settings.knownTags,
      monthlyBudgetMinor: settings.monthlyBudgetMinor,
    },
    categoryBudgets: budgetRows.map((b) => ({
      id: b.id,
      categoryId: b.categoryId,
      periodMonth: b.periodMonth,
      assignedMinor: b.assignedMinor,
      rolloverEnabled: b.rolloverEnabled,
      ...(b.notes ? { notes: b.notes } : {}),
    })),
    recurringCommitments: commitmentRows.map((rc) => ({
      id: rc.id,
      name: rc.name,
      kind: rc.kind,
      amountMinor: rc.amountMinor,
      currency: rc.currency,
      accountId: rc.accountId,
      categoryId: rc.categoryId,
      frequency: rc.frequency,
      dueDay: rc.dueDay,
      ...(rc.dueLabel ? { dueLabel: rc.dueLabel } : {}),
      ...(rc.nextDueDate ? { nextDueDate: rc.nextDueDate } : {}),
      ...(rc.previousNextDueDate
        ? { previousNextDueDate: rc.previousNextDueDate }
        : {}),
      isAutoPaid: rc.isAutoPaid,
      isActive: rc.isActive,
      ...(rc.totalInstallments !== null
        ? { totalInstallments: rc.totalInstallments }
        : {}),
      paidInstallments: rc.paidInstallments,
      ...(rc.lastPaidPeriod ? { lastPaidPeriod: rc.lastPaidPeriod } : {}),
      ...(rc.lastPaidTransactionId
        ? { lastPaidTransactionId: rc.lastPaidTransactionId }
        : {}),
      ...(rc.notes ? { notes: rc.notes } : {}),
    })),
    sinkingFunds: fundRows.map((sf) => ({
      id: sf.id,
      name: sf.name,
      icon: sf.icon,
      color: sf.color,
      targetAmountMinor: sf.targetAmountMinor,
      currentSavedMinor: sf.currentSavedMinor,
      targetDate: sf.targetDate,
      accountId: sf.accountId,
      monthlyContributionMinor: sf.monthlyContributionMinor,
      isCompleted: sf.isCompleted,
      ...(sf.notes ? { notes: sf.notes } : {}),
    })),
    quickPresets: presetRows.map((qp) => ({
      id: qp.id,
      label: qp.label,
      icon: qp.icon,
      type: qp.type,
      amountMinor: qp.amountMinor,
      accountId: qp.accountId,
      ...(qp.toAccountId ? { toAccountId: qp.toAccountId } : {}),
      ...(qp.categoryId ? { categoryId: qp.categoryId } : {}),
      ...(qp.merchant ? { merchant: qp.merchant } : {}),
      tags: qp.tags,
      defaultOrder: qp.defaultOrder,
    })),
    reconciliations: reconciliationRows.map((rec) => ({
      id: rec.id,
      accountId: rec.accountId,
      appBalanceMinor: rec.appBalanceMinor,
      actualBalanceMinor: rec.actualBalanceMinor,
      discrepancyMinor: rec.discrepancyMinor,
      reconciledAt: rec.reconciledAt.toISOString(),
      ...(rec.adjustmentTransactionId
        ? { adjustmentTransactionId: rec.adjustmentTransactionId }
        : {}),
    })),
  });
}

export async function saveUserSyncStateInTx(
  tx: DbOrTx,
  userId: string,
  state: SyncDataState,
): Promise<void> {
  await tx
    .insert(userSettings)
    .values({
      userId,
      lastAccountId: state.smartDefaults.lastAccountId,
      lastTransferToAccountId:
        state.smartDefaults.lastTransferToAccountId ?? null,
      recentMerchants: state.smartDefaults.recentMerchants,
      knownTags: state.smartDefaults.knownTags,
      monthlyBudgetMinor: state.smartDefaults.monthlyBudgetMinor,
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        lastAccountId: state.smartDefaults.lastAccountId,
        lastTransferToAccountId:
          state.smartDefaults.lastTransferToAccountId ?? null,
        recentMerchants: state.smartDefaults.recentMerchants,
        knownTags: state.smartDefaults.knownTags,
        monthlyBudgetMinor: state.smartDefaults.monthlyBudgetMinor,
      },
    });

  await tx
    .delete(transactionSplits)
    .where(eq(transactionSplits.userId, userId));
  await tx.delete(transactions).where(eq(transactions.userId, userId));
  await tx.delete(accounts).where(eq(accounts.userId, userId));
  await tx.delete(categories).where(eq(categories.userId, userId));
  await tx.delete(categoryBudgets).where(eq(categoryBudgets.userId, userId));
  await tx
    .delete(recurringCommitments)
    .where(eq(recurringCommitments.userId, userId));
  await tx.delete(sinkingFunds).where(eq(sinkingFunds.userId, userId));
  await tx.delete(quickPresets).where(eq(quickPresets.userId, userId));
  await tx
    .delete(balanceReconciliations)
    .where(eq(balanceReconciliations.userId, userId));

  if (state.accounts.length > 0) {
    for (const chunk of chunkArray(
      state.accounts.map((a, index) => ({
        userId,
        id: a.id,
        name: a.name,
        accountType: a.accountType,
        icon: a.icon,
        color: a.color,
        currency: a.currency,
        balanceMinor: a.balanceMinor,
        sortOrder: index,
      })),
      200,
    )) {
      await tx.insert(accounts).values(chunk);
    }
  }

  if (state.categories.length > 0) {
    for (const chunk of chunkArray(
      state.categories.map((c) => ({
        userId,
        id: c.id,
        name: c.name,
        type: c.type,
        icon: c.icon,
        color: c.color,
        usageCount: c.usageCount,
        defaultOrder: c.defaultOrder,
        isCustom: c.isCustom,
      })),
      200,
    )) {
      await tx.insert(categories).values(chunk);
    }
  }

  if (state.transactions.length > 0) {
    const txValues = state.transactions.map((t, index) => ({
      userId,
      id: t.id,
      type: t.type,
      amountMinor: t.amountMinor,
      currency: t.currency,
      accountId: t.accountId,
      toAccountId: t.toAccountId ?? null,
      categoryId: t.categoryId ?? null,
      merchant: t.merchant ?? null,
      tags: t.tags,
      note: t.note ?? null,
      receiptUri: t.receiptUri ?? null,
      occurredAt: new Date(t.occurredAt),
      createdAt: new Date(t.createdAt),
      sortOrder: index,
    }));
    for (const chunk of chunkArray(txValues, 200)) {
      await tx.insert(transactions).values(chunk);
    }

    const splitValues = state.transactions.flatMap((t) =>
      (t.splits ?? []).map((split, splitIndex) => ({
        userId,
        transactionId: t.id,
        id: split.id,
        categoryId: split.categoryId,
        amountMinor: split.amountMinor,
        note: split.note ?? null,
        sortOrder: splitIndex,
      })),
    );
    for (const chunk of chunkArray(splitValues, 200)) {
      await tx.insert(transactionSplits).values(chunk);
    }
  }

  if (state.categoryBudgets.length > 0) {
    for (const chunk of chunkArray(
      state.categoryBudgets.map((b, index) => ({
        userId,
        id: b.id,
        categoryId: b.categoryId,
        periodMonth: b.periodMonth,
        assignedMinor: b.assignedMinor,
        rolloverEnabled: b.rolloverEnabled,
        notes: b.notes ?? null,
        sortOrder: index,
      })),
      200,
    )) {
      await tx.insert(categoryBudgets).values(chunk);
    }
  }

  if (state.recurringCommitments.length > 0) {
    for (const chunk of chunkArray(
      state.recurringCommitments.map((rc, index) => ({
        userId,
        id: rc.id,
        name: rc.name,
        kind: rc.kind,
        amountMinor: rc.amountMinor,
        currency: rc.currency,
        accountId: rc.accountId,
        categoryId: rc.categoryId,
        frequency: rc.frequency,
        dueDay: rc.dueDay,
        dueLabel: rc.dueLabel ?? null,
        nextDueDate: rc.nextDueDate ?? null,
        previousNextDueDate: rc.previousNextDueDate ?? null,
        isAutoPaid: rc.isAutoPaid,
        isActive: rc.isActive,
        totalInstallments: rc.totalInstallments ?? null,
        paidInstallments: rc.paidInstallments,
        lastPaidPeriod: rc.lastPaidPeriod ?? null,
        lastPaidTransactionId: rc.lastPaidTransactionId ?? null,
        notes: rc.notes ?? null,
        sortOrder: index,
      })),
      200,
    )) {
      await tx.insert(recurringCommitments).values(chunk);
    }
  }

  if (state.sinkingFunds.length > 0) {
    for (const chunk of chunkArray(
      state.sinkingFunds.map((sf, index) => ({
        userId,
        id: sf.id,
        name: sf.name,
        icon: sf.icon,
        color: sf.color,
        targetAmountMinor: sf.targetAmountMinor,
        currentSavedMinor: sf.currentSavedMinor,
        targetDate: sf.targetDate,
        accountId: sf.accountId,
        monthlyContributionMinor: sf.monthlyContributionMinor,
        isCompleted: sf.isCompleted,
        notes: sf.notes ?? null,
        sortOrder: index,
      })),
      200,
    )) {
      await tx.insert(sinkingFunds).values(chunk);
    }
  }

  if (state.quickPresets.length > 0) {
    for (const chunk of chunkArray(
      state.quickPresets.map((qp, index) => ({
        userId,
        id: qp.id,
        label: qp.label,
        icon: qp.icon,
        type: qp.type,
        amountMinor: qp.amountMinor,
        accountId: qp.accountId,
        toAccountId: qp.toAccountId ?? null,
        categoryId: qp.categoryId ?? null,
        merchant: qp.merchant ?? null,
        tags: qp.tags,
        defaultOrder: qp.defaultOrder,
        sortOrder: index,
      })),
      200,
    )) {
      await tx.insert(quickPresets).values(chunk);
    }
  }

  if (state.reconciliations.length > 0) {
    for (const chunk of chunkArray(
      state.reconciliations.map((rec, index) => ({
        userId,
        id: rec.id,
        accountId: rec.accountId,
        appBalanceMinor: rec.appBalanceMinor,
        actualBalanceMinor: rec.actualBalanceMinor,
        discrepancyMinor: rec.discrepancyMinor,
        reconciledAt: new Date(rec.reconciledAt),
        adjustmentTransactionId: rec.adjustmentTransactionId ?? null,
        sortOrder: index,
      })),
      200,
    )) {
      await tx.insert(balanceReconciliations).values(chunk);
    }
  }
}

export function createPgSyncRepository(db: AppDatabase): SyncRepository {
  return {
    async getUserRevision(userId) {
      const rows = await db
        .select({ stateRevision: users.stateRevision })
        .from(users)
        .where(eq(users.id, userId));
      return rows[0]?.stateRevision ?? null;
    },

    async pullState(userId) {
      return db.transaction(
        async (tx) => {
          const rows = await tx
            .select({ stateRevision: users.stateRevision })
            .from(users)
            .where(eq(users.id, userId));
          const userRow = rows[0];
          if (!userRow) {
            return null;
          }
          const state = await loadUserSyncStateInTx(tx, userId);
          return {
            revision: userRow.stateRevision,
            state,
          };
        },
        { isolationLevel: 'repeatable read' },
      );
    },

    async pushMutations({ userId, lastKnownRevision, mutations }) {
      return db.transaction(async (tx) => {
        const lockedUsers = await tx
          .select({
            id: users.id,
            stateRevision: users.stateRevision,
          })
          .from(users)
          .where(eq(users.id, userId))
          .for('update');

        const userRow = lockedUsers[0];
        if (!userRow) {
          throw new AppError('UNAUTHORIZED', 'Account not found.');
        }

        const currentState = await loadUserSyncStateInTx(tx, userId);
        if (mutations.length === 0) {
          return {
            revision: userRow.stateRevision,
            appliedOpIds: [],
            state: currentState,
          };
        }

        const incomingOpIds = Array.from(
          new Set(mutations.map((m) => m.opId)),
        );
        const existingOps = await tx
          .select({ opId: syncOperations.opId })
          .from(syncOperations)
          .where(
            and(
              eq(syncOperations.userId, userId),
              inArray(syncOperations.opId, incomingOpIds),
            ),
          );

        const seenOpIds = new Set(existingOps.map((row) => row.opId));
        const newMutations: SyncMutation[] = [];
        for (const mutation of mutations) {
          if (!seenOpIds.has(mutation.opId)) {
            seenOpIds.add(mutation.opId);
            newMutations.push(mutation);
          }
        }

        if (newMutations.length === 0) {
          return {
            revision: userRow.stateRevision,
            appliedOpIds: mutations.map((m) => m.opId),
            state: currentState,
          };
        }

        if (
          typeof lastKnownRevision === 'number' &&
          Number(userRow.stateRevision) !== lastKnownRevision &&
          newMutations.some((m) => isConflictingSyncMutation(m, currentState))
        ) {
          throw new AppError(
            'CONFLICT',
            'Sync state is stale. Pull latest changes before retrying.',
          );
        }

        const nextState = applySyncMutations(currentState, newMutations);
        const nextRevision = userRow.stateRevision + 1;

        await saveUserSyncStateInTx(tx, userId, nextState);

        for (const chunk of chunkArray(
          newMutations.map((m) => ({
            userId,
            opId: m.opId,
            mutationType: m.type,
            appliedRevision: nextRevision,
          })),
          200,
        )) {
          await tx.insert(syncOperations).values(chunk).onConflictDoNothing();
        }

        await tx
          .update(users)
          .set({
            stateRevision: nextRevision,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));

        return {
          revision: nextRevision,
          appliedOpIds: mutations.map((m) => m.opId),
          state: nextState,
        };
      });
    },
  };
}
