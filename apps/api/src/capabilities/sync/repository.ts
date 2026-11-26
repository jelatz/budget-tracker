import {
  applySyncMutations,
  createInitialSyncDataState,
  normalizeCommitmentKind,
  syncDataStateSchema,
  type SyncDataState,
  type SyncMutation,
} from '@repo/contracts';
import { and, asc, eq, inArray } from 'drizzle-orm';
import {
  getMoneyCipher,
  type MoneyCipher,
} from '../../core/crypto/field-encryption';
import type { AppDatabase } from '../../core/db/client';
import {
  accounts,
  categories,
  incomeSources,
  recurringCommitments,
  syncOperations,
  transactions,
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
    case 'account.setBalance':
    case 'creditCard.payBill':
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
  cipher: MoneyCipher = getMoneyCipher(),
): Promise<SyncDataState> {
  const [
    settingsRows,
    accountRows,
    categoryRows,
    txRows,
    commitmentRows,
    incomeSourceRows,
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
      .from(recurringCommitments)
      .where(eq(recurringCommitments.userId, userId))
      .orderBy(asc(recurringCommitments.sortOrder)),
    db
      .select()
      .from(incomeSources)
      .where(eq(incomeSources.userId, userId))
      .orderBy(asc(incomeSources.sortOrder)),
  ]);

  const settings = settingsRows[0];
  if (!settings) {
    return createInitialSyncDataState();
  }

  const accountTypeMap = new Map(
    accountRows.map((a) => [a.id, a.accountType] as const),
  );

  return syncDataStateSchema.parse({
    accounts: accountRows.map((a) => ({
      id: a.id,
      name: a.name,
      accountType: a.accountType,
      icon: a.icon,
      color: a.color,
      currency: a.currency,
      balanceMinor: cipher.decrypt(a.balanceMinor, {
        userId,
        table: 'accounts',
        rowId: a.id,
        column: 'balance_minor',
      }),
      ...(a.statementDay !== null ? { statementDay: a.statementDay } : {}),
      ...(a.dueDay !== null ? { dueDay: a.dueDay } : {}),
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
    transactions: txRows.map((t) => ({
      id: t.id,
      type: t.type,
      amountMinor: cipher.decrypt(t.amountMinor, {
        userId,
        table: 'transactions',
        rowId: t.id,
        column: 'amount_minor',
      }),
      currency: t.currency,
      accountId: t.accountId,
      ...(t.toAccountId ? { toAccountId: t.toAccountId } : {}),
      ...(t.categoryId ? { categoryId: t.categoryId } : {}),
      ...(t.incomeSourceId ? { incomeSourceId: t.incomeSourceId } : {}),
      ...(t.commitmentId ? { commitmentId: t.commitmentId } : {}),
      ...(t.merchant ? { merchant: t.merchant } : {}),
      ...(t.note ? { note: t.note } : {}),
      occurredAt: t.occurredAt.toISOString(),
      createdAt: t.createdAt.toISOString(),
    })),
    smartDefaults: {
      lastAccountId: settings.lastAccountId,
      ...(settings.lastTransferToAccountId
        ? { lastTransferToAccountId: settings.lastTransferToAccountId }
        : {}),
      recentMerchants: settings.recentMerchants,
      monthlyBudgetMinor: cipher.decrypt(settings.monthlyBudgetMinor, {
        userId,
        table: 'user_settings',
        rowId: userId,
        column: 'monthly_budget_minor',
      }),
    },
    recurringCommitments: commitmentRows.map((rc) => ({
      id: rc.id,
      name: rc.name,
      kind: normalizeCommitmentKind(
        rc.kind,
        accountTypeMap.get(rc.accountId) as 'BANK' | 'E_WALLET' | 'CASH' | 'CREDIT_CARD' | undefined,
      ),
      amountMinor: cipher.decrypt(rc.amountMinor, {
        userId,
        table: 'recurring_commitments',
        rowId: rc.id,
        column: 'amount_minor',
      }),
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
    incomeSources: incomeSourceRows.map((src) => ({
      id: src.id,
      name: src.name,
      expectedMonthlyMinor: cipher.decrypt(src.expectedMonthlyMinor, {
        userId,
        table: 'income_sources',
        rowId: src.id,
        column: 'expected_monthly_minor',
      }),
      ...(src.typicalPayoutMinor !== null
        ? {
            typicalPayoutMinor: cipher.decrypt(src.typicalPayoutMinor, {
              userId,
              table: 'income_sources',
              rowId: src.id,
              column: 'typical_payout_minor',
            }),
          }
        : {}),
      currency: src.currency,
      accountId: src.accountId,
      categoryId: src.categoryId,
      paySchedule: src.paySchedule,
      ...(src.payDays ? { payDays: src.payDays } : {}),
      ...(src.weekday !== null ? { weekday: src.weekday } : {}),
      ...(src.weekdayOrdinals ? { weekdayOrdinals: src.weekdayOrdinals } : {}),
      ...(src.monthlyPayDay !== null ? { monthlyPayDay: src.monthlyPayDay } : {}),
      ...(src.anchorDate ? { anchorDate: src.anchorDate } : {}),
      ...(src.payDaysLabel ? { payDaysLabel: src.payDaysLabel } : {}),
      color: src.color,
      isActive: src.isActive,
      ...(src.notes ? { notes: src.notes } : {}),
    })),
  });
}

export async function saveUserSyncStateInTx(
  tx: DbOrTx,
  userId: string,
  state: SyncDataState,
  cipher: MoneyCipher = getMoneyCipher(),
): Promise<void> {
  const encryptedMonthlyBudgetMinor = cipher.encrypt(
    state.smartDefaults.monthlyBudgetMinor,
    {
      userId,
      table: 'user_settings',
      rowId: userId,
      column: 'monthly_budget_minor',
    },
  );
  await tx
    .insert(userSettings)
    .values({
      userId,
      lastAccountId: state.smartDefaults.lastAccountId,
      lastTransferToAccountId:
        state.smartDefaults.lastTransferToAccountId ?? null,
      recentMerchants: state.smartDefaults.recentMerchants,
      monthlyBudgetMinor: encryptedMonthlyBudgetMinor,
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        lastAccountId: state.smartDefaults.lastAccountId,
        lastTransferToAccountId:
          state.smartDefaults.lastTransferToAccountId ?? null,
        recentMerchants: state.smartDefaults.recentMerchants,
        monthlyBudgetMinor: encryptedMonthlyBudgetMinor,
      },
    });

  await tx.delete(transactions).where(eq(transactions.userId, userId));
  await tx.delete(accounts).where(eq(accounts.userId, userId));
  await tx.delete(categories).where(eq(categories.userId, userId));
  await tx
    .delete(recurringCommitments)
    .where(eq(recurringCommitments.userId, userId));
  await tx.delete(incomeSources).where(eq(incomeSources.userId, userId));

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
        balanceMinor: cipher.encrypt(a.balanceMinor, {
          userId,
          table: 'accounts',
          rowId: a.id,
          column: 'balance_minor',
        }),
        statementDay: a.statementDay ?? null,
        dueDay: a.dueDay ?? null,
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
      amountMinor: cipher.encrypt(t.amountMinor, {
        userId,
        table: 'transactions',
        rowId: t.id,
        column: 'amount_minor',
      }),
      currency: t.currency,
      accountId: t.accountId,
      toAccountId: t.toAccountId ?? null,
      categoryId: t.categoryId ?? null,
      incomeSourceId: t.incomeSourceId ?? null,
      commitmentId: t.commitmentId ?? null,
      merchant: t.merchant ?? null,
      note: t.note ?? null,
      occurredAt: new Date(t.occurredAt),
      createdAt: new Date(t.createdAt),
      sortOrder: index,
    }));
    for (const chunk of chunkArray(txValues, 200)) {
      await tx.insert(transactions).values(chunk);
    }
  }

  if (state.recurringCommitments.length > 0) {
    for (const chunk of chunkArray(
      state.recurringCommitments.map((rc, index) => ({
        userId,
        id: rc.id,
        name: rc.name,
        kind: rc.kind,
        amountMinor: cipher.encrypt(rc.amountMinor, {
          userId,
          table: 'recurring_commitments',
          rowId: rc.id,
          column: 'amount_minor',
        }),
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

  if (state.incomeSources.length > 0) {
    for (const chunk of chunkArray(
      state.incomeSources.map((src, index) => ({
        userId,
        id: src.id,
        name: src.name,
        expectedMonthlyMinor: cipher.encrypt(src.expectedMonthlyMinor, {
          userId,
          table: 'income_sources',
          rowId: src.id,
          column: 'expected_monthly_minor',
        }),
        typicalPayoutMinor:
          typeof src.typicalPayoutMinor === 'number'
            ? cipher.encrypt(src.typicalPayoutMinor, {
                userId,
                table: 'income_sources',
                rowId: src.id,
                column: 'typical_payout_minor',
              })
            : null,
        currency: src.currency,
        accountId: src.accountId,
        categoryId: src.categoryId,
        paySchedule: src.paySchedule,
        payDays: src.payDays ?? null,
        weekday: src.weekday ?? null,
        weekdayOrdinals: src.weekdayOrdinals ?? null,
        monthlyPayDay: src.monthlyPayDay ?? null,
        anchorDate: src.anchorDate ?? null,
        payDaysLabel: src.payDaysLabel ?? null,
        color: src.color,
        isActive: src.isActive,
        notes: src.notes ?? null,
        sortOrder: index,
      })),
      200,
    )) {
      await tx.insert(incomeSources).values(chunk);
    }
  }
}

export function createPgSyncRepository(
  db: AppDatabase,
  cipher: MoneyCipher = getMoneyCipher(),
): SyncRepository {
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
          const state = await loadUserSyncStateInTx(tx, userId, cipher);
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

        const currentState = await loadUserSyncStateInTx(tx, userId, cipher);
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

        await saveUserSyncStateInTx(tx, userId, nextState, cipher);

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
