import { and, asc, eq, sql } from 'drizzle-orm';
import {
  categoryBudgetSchema,
  computeEnvelopeRollovers,
  computeSafeToSpend,
  getCurrentPeriodMonth,
  isWalletLiquidForSafeToSpend,
  quickPresetSchema,
  recurringCommitmentSchema,
  sinkingFundSchema,
  type CategoryBudget,
  type CategoryBudgetStatus,
  type QuickPreset,
  type RecurringCommitment,
  type SafeToSpendMetrics,
  type SinkingFund,
  type Transaction,
  type UpsertCategoryBudgetInput,
  type UpsertQuickPresetInput,
  type UpsertRecurringCommitmentInput,
  type UpsertSinkingFundInput,
} from '@repo/contracts';
import type { AppDb } from '../../core/db/client';
import {
  categoryBudgets,
  quickPresets,
  recurringCommitments,
  sinkingFunds,
  wallets,
} from '../../core/db/schema';
import { AppError } from '../../core/errors';
import {
  assertOwnedCategories,
  assertOwnedWallet,
  createTransactionInTx,
  generateId,
  loadTransactionsWithSplits,
  mapWalletRow,
} from '../shared/tx-helpers';

function mapCategoryBudgetRow(
  row: typeof categoryBudgets.$inferSelect,
): CategoryBudget {
  return categoryBudgetSchema.parse({
    id: row.id,
    categoryId: row.categoryId,
    periodMonth: row.periodMonth,
    assignedMinor: row.assignedMinor,
    rolloverEnabled: row.rolloverEnabled,
    ...(row.notes !== null ? { notes: row.notes } : {}),
  });
}

function mapRecurringCommitmentRow(
  row: typeof recurringCommitments.$inferSelect,
): RecurringCommitment {
  return recurringCommitmentSchema.parse({
    id: row.id,
    name: row.name,
    type: row.type,
    amountMinor: row.amountMinor,
    currency: row.currency,
    walletId: row.walletId,
    categoryId: row.categoryId,
    frequency: row.frequency,
    dueDay: row.dueDay,
    isAutoPaid: row.isAutoPaid,
    isActive: row.isActive,
    ...(row.lastPaidPeriod !== null ? { lastPaidPeriod: row.lastPaidPeriod } : {}),
    ...(row.notes !== null ? { notes: row.notes } : {}),
  });
}

function mapSinkingFundRow(
  row: typeof sinkingFunds.$inferSelect,
): SinkingFund {
  return sinkingFundSchema.parse({
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    targetAmountMinor: row.targetAmountMinor,
    currentSavedMinor: row.currentSavedMinor,
    targetDate: row.targetDate,
    walletId: row.walletId,
    monthlyContributionMinor: row.monthlyContributionMinor,
    isCompleted: row.isCompleted,
    ...(row.notes !== null ? { notes: row.notes } : {}),
  });
}

function mapQuickPresetRow(
  row: typeof quickPresets.$inferSelect,
): QuickPreset {
  return quickPresetSchema.parse({
    id: row.id,
    label: row.label,
    icon: row.icon,
    type: row.type,
    amountMinor: row.amountMinor,
    walletId: row.walletId,
    ...(row.toWalletId !== null ? { toWalletId: row.toWalletId } : {}),
    ...(row.categoryId !== null ? { categoryId: row.categoryId } : {}),
    ...(row.merchant !== null ? { merchant: row.merchant } : {}),
    tags: row.tags ?? [],
    defaultOrder: row.defaultOrder,
  });
}

// ==========================================
// Category Budgets
// ==========================================

export async function listCategoryBudgetStatuses(
  db: AppDb,
  userId: string,
  periodMonth: string,
): Promise<CategoryBudgetStatus[]> {
  const [budgetRows, userTransactions] = await Promise.all([
    db.select().from(categoryBudgets).where(eq(categoryBudgets.userId, userId)),
    loadTransactionsWithSplits(db, userId),
  ]);

  return computeEnvelopeRollovers({
    budgets: budgetRows.map(mapCategoryBudgetRow),
    transactions: userTransactions,
    periodMonth,
  });
}

export async function upsertCategoryBudget(
  db: AppDb,
  userId: string,
  input: UpsertCategoryBudgetInput,
): Promise<CategoryBudget> {
  await assertOwnedCategories(db, userId, [input.categoryId]);

  const existingById = input.id
    ? (
        await db
          .select()
          .from(categoryBudgets)
          .where(
            and(eq(categoryBudgets.id, input.id), eq(categoryBudgets.userId, userId)),
          )
          .limit(1)
      )[0]
    : undefined;

  const existingByPair = existingById
    ? existingById
    : (
        await db
          .select()
          .from(categoryBudgets)
          .where(
            and(
              eq(categoryBudgets.userId, userId),
              eq(categoryBudgets.categoryId, input.categoryId),
              eq(categoryBudgets.periodMonth, input.periodMonth),
            ),
          )
          .limit(1)
      )[0];

  if (existingByPair) {
    const [updated] = await db
      .update(categoryBudgets)
      .set({
        categoryId: input.categoryId,
        periodMonth: input.periodMonth,
        assignedMinor: input.assignedMinor,
        rolloverEnabled: input.rolloverEnabled,
        notes: input.notes ?? null,
      })
      .where(
        and(
          eq(categoryBudgets.id, existingByPair.id),
          eq(categoryBudgets.userId, userId),
        ),
      )
      .returning();

    return mapCategoryBudgetRow(updated);
  }

  const [inserted] = await db
    .insert(categoryBudgets)
    .values({
      id: generateId('budget'),
      userId,
      categoryId: input.categoryId,
      periodMonth: input.periodMonth,
      assignedMinor: input.assignedMinor,
      rolloverEnabled: input.rolloverEnabled,
      notes: input.notes ?? null,
    })
    .returning();

  return mapCategoryBudgetRow(inserted);
}

export async function deleteCategoryBudget(
  db: AppDb,
  userId: string,
  budgetId: string,
): Promise<void> {
  const deleted = await db
    .delete(categoryBudgets)
    .where(and(eq(categoryBudgets.id, budgetId), eq(categoryBudgets.userId, userId)))
    .returning({ id: categoryBudgets.id });

  if (!deleted[0]) {
    throw new AppError('NOT_FOUND', 'Category budget not found');
  }
}

// ==========================================
// Recurring Commitments
// ==========================================

export async function listRecurringCommitments(
  db: AppDb,
  userId: string,
): Promise<RecurringCommitment[]> {
  const rows = await db
    .select()
    .from(recurringCommitments)
    .where(eq(recurringCommitments.userId, userId))
    .orderBy(asc(recurringCommitments.dueDay));

  return rows.map(mapRecurringCommitmentRow);
}

export async function upsertRecurringCommitment(
  db: AppDb,
  userId: string,
  input: UpsertRecurringCommitmentInput,
): Promise<RecurringCommitment> {
  await assertOwnedWallet(db, userId, input.walletId);
  await assertOwnedCategories(db, userId, [input.categoryId]);

  if (input.id) {
    const existing = await db
      .select()
      .from(recurringCommitments)
      .where(
        and(
          eq(recurringCommitments.id, input.id),
          eq(recurringCommitments.userId, userId),
        ),
      )
      .limit(1);

    if (!existing[0]) {
      throw new AppError('NOT_FOUND', 'Recurring commitment not found');
    }

    const [updated] = await db
      .update(recurringCommitments)
      .set({
        name: input.name,
        type: input.type,
        amountMinor: input.amountMinor,
        currency: input.currency,
        walletId: input.walletId,
        categoryId: input.categoryId,
        frequency: input.frequency,
        dueDay: input.dueDay,
        isAutoPaid: input.isAutoPaid,
        isActive: input.isActive,
        lastPaidPeriod: input.lastPaidPeriod ?? null,
        notes: input.notes ?? null,
      })
      .where(
        and(
          eq(recurringCommitments.id, input.id),
          eq(recurringCommitments.userId, userId),
        ),
      )
      .returning();

    return mapRecurringCommitmentRow(updated);
  }

  const [inserted] = await db
    .insert(recurringCommitments)
    .values({
      id: generateId('commitment'),
      userId,
      name: input.name,
      type: input.type,
      amountMinor: input.amountMinor,
      currency: input.currency,
      walletId: input.walletId,
      categoryId: input.categoryId,
      frequency: input.frequency,
      dueDay: input.dueDay,
      isAutoPaid: input.isAutoPaid,
      isActive: input.isActive,
      lastPaidPeriod: input.lastPaidPeriod ?? null,
      notes: input.notes ?? null,
    })
    .returning();

  return mapRecurringCommitmentRow(inserted);
}

export async function deleteRecurringCommitment(
  db: AppDb,
  userId: string,
  commitmentId: string,
): Promise<void> {
  const deleted = await db
    .delete(recurringCommitments)
    .where(
      and(
        eq(recurringCommitments.id, commitmentId),
        eq(recurringCommitments.userId, userId),
      ),
    )
    .returning({ id: recurringCommitments.id });

  if (!deleted[0]) {
    throw new AppError('NOT_FOUND', 'Recurring commitment not found');
  }
}

export async function settleRecurringCommitment(
  db: AppDb,
  userId: string,
  commitmentId: string,
  options: { periodMonth: string; recordTransaction: boolean },
): Promise<{ commitment: RecurringCommitment; transaction?: Transaction }> {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(recurringCommitments)
      .set({ lastPaidPeriod: options.periodMonth })
      .where(
        and(
          eq(recurringCommitments.id, commitmentId),
          eq(recurringCommitments.userId, userId),
          sql`${recurringCommitments.lastPaidPeriod} IS DISTINCT FROM ${options.periodMonth}`,
        ),
      )
      .returning();

    if (!updated) {
      const [existing] = await tx
        .select({ id: recurringCommitments.id })
        .from(recurringCommitments)
        .where(
          and(
            eq(recurringCommitments.id, commitmentId),
            eq(recurringCommitments.userId, userId),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new AppError('NOT_FOUND', 'Recurring commitment not found');
      }
      throw new AppError(
        'CONFLICT',
        'Recurring commitment already settled for this period',
      );
    }

    let transaction: Transaction | undefined;
    if (options.recordTransaction) {
      const txType = updated.type === 'INCOME' ? 'INCOME' : 'EXPENSE';
      transaction = await createTransactionInTx(
        tx,
        userId,
        {
          type: txType,
          amountMinor: updated.amountMinor,
          currency: updated.currency,
          walletId: updated.walletId,
          categoryId: updated.categoryId,
          merchant: updated.name,
          tags: ['recurring'],
          note:
            txType === 'INCOME'
              ? 'Recurring income received'
              : 'Recurring bill payment',
          occurredAt: new Date().toISOString(),
        },
        { updateLastWallets: true, refreshSettings: true },
      );
    }

    return {
      commitment: mapRecurringCommitmentRow(updated),
      transaction,
    };
  });
}

export async function unmarkRecurringCommitmentPaid(
  db: AppDb,
  userId: string,
  commitmentId: string,
): Promise<RecurringCommitment> {
  const [updated] = await db
    .update(recurringCommitments)
    .set({ lastPaidPeriod: null })
    .where(
      and(
        eq(recurringCommitments.id, commitmentId),
        eq(recurringCommitments.userId, userId),
      ),
    )
    .returning();

  if (!updated) {
    throw new AppError('NOT_FOUND', 'Recurring commitment not found');
  }

  return mapRecurringCommitmentRow(updated);
}

// ==========================================
// Sinking Funds
// ==========================================

export async function listSinkingFunds(
  db: AppDb,
  userId: string,
): Promise<SinkingFund[]> {
  const rows = await db
    .select()
    .from(sinkingFunds)
    .where(eq(sinkingFunds.userId, userId));

  return rows.map(mapSinkingFundRow);
}

export async function upsertSinkingFund(
  db: AppDb,
  userId: string,
  input: UpsertSinkingFundInput,
): Promise<SinkingFund> {
  await assertOwnedWallet(db, userId, input.walletId);

  if (input.id) {
    const existing = await db
      .select()
      .from(sinkingFunds)
      .where(and(eq(sinkingFunds.id, input.id), eq(sinkingFunds.userId, userId)))
      .limit(1);

    if (!existing[0]) {
      throw new AppError('NOT_FOUND', 'Sinking fund not found');
    }

    const [updated] = await db
      .update(sinkingFunds)
      .set({
        name: input.name,
        icon: input.icon,
        color: input.color,
        targetAmountMinor: input.targetAmountMinor,
        currentSavedMinor: input.currentSavedMinor,
        targetDate: input.targetDate,
        walletId: input.walletId,
        monthlyContributionMinor: input.monthlyContributionMinor,
        isCompleted: input.isCompleted,
        notes: input.notes ?? null,
      })
      .where(and(eq(sinkingFunds.id, input.id), eq(sinkingFunds.userId, userId)))
      .returning();

    return mapSinkingFundRow(updated);
  }

  const [inserted] = await db
    .insert(sinkingFunds)
    .values({
      id: generateId('fund'),
      userId,
      name: input.name,
      icon: input.icon,
      color: input.color,
      targetAmountMinor: input.targetAmountMinor,
      currentSavedMinor: input.currentSavedMinor,
      targetDate: input.targetDate,
      walletId: input.walletId,
      monthlyContributionMinor: input.monthlyContributionMinor,
      isCompleted: input.isCompleted,
      notes: input.notes ?? null,
    })
    .returning();

  return mapSinkingFundRow(inserted);
}

export async function contributeToSinkingFund(
  db: AppDb,
  userId: string,
  fundId: string,
  amountMinor: number,
  sourceWalletId: string,
): Promise<{ fund: SinkingFund; transaction?: Transaction }> {
  return db.transaction(async (tx) => {
    const fundRows = await tx
      .select()
      .from(sinkingFunds)
      .where(and(eq(sinkingFunds.id, fundId), eq(sinkingFunds.userId, userId)))
      .limit(1)
      .for('update');

    const fund = fundRows[0];
    if (!fund) {
      throw new AppError('NOT_FOUND', 'Sinking fund not found');
    }

    const sourceWallet = await assertOwnedWallet(
      tx,
      userId,
      sourceWalletId,
      'Source wallet',
    );

    let transaction: Transaction | undefined;
    if (sourceWalletId !== fund.walletId) {
      transaction = await createTransactionInTx(
        tx,
        userId,
        {
          type: 'TRANSFER',
          amountMinor,
          currency: sourceWallet.currency,
          walletId: sourceWalletId,
          toWalletId: fund.walletId,
          merchant: fund.name,
          note: `Contribution to ${fund.name}`,
          tags: ['sinking-fund'],
          occurredAt: new Date().toISOString(),
        },
        { updateLastWallets: true, refreshSettings: true },
      );
    }

    const [updated] = await tx
      .update(sinkingFunds)
      .set({
        currentSavedMinor: sql`${sinkingFunds.currentSavedMinor} + ${amountMinor}`,
        isCompleted: sql`${sinkingFunds.currentSavedMinor} + ${amountMinor} >= ${sinkingFunds.targetAmountMinor}`,
      })
      .where(and(eq(sinkingFunds.id, fundId), eq(sinkingFunds.userId, userId)))
      .returning();

    return {
      fund: mapSinkingFundRow(updated),
      transaction,
    };
  });
}

export async function deleteSinkingFund(
  db: AppDb,
  userId: string,
  fundId: string,
): Promise<void> {
  const deleted = await db
    .delete(sinkingFunds)
    .where(and(eq(sinkingFunds.id, fundId), eq(sinkingFunds.userId, userId)))
    .returning({ id: sinkingFunds.id });

  if (!deleted[0]) {
    throw new AppError('NOT_FOUND', 'Sinking fund not found');
  }
}

// ==========================================
// Quick Presets
// ==========================================

export async function listQuickPresets(
  db: AppDb,
  userId: string,
): Promise<QuickPreset[]> {
  const rows = await db
    .select()
    .from(quickPresets)
    .where(eq(quickPresets.userId, userId))
    .orderBy(asc(quickPresets.defaultOrder));

  return rows.map(mapQuickPresetRow);
}

export async function upsertQuickPreset(
  db: AppDb,
  userId: string,
  input: UpsertQuickPresetInput,
): Promise<QuickPreset> {
  await assertOwnedWallet(db, userId, input.walletId, 'Source wallet');
  if (input.toWalletId) {
    await assertOwnedWallet(db, userId, input.toWalletId, 'Destination wallet');
  }
  if (input.categoryId) {
    await assertOwnedCategories(db, userId, [input.categoryId]);
  }

  if (input.id) {
    const existing = await db
      .select()
      .from(quickPresets)
      .where(and(eq(quickPresets.id, input.id), eq(quickPresets.userId, userId)))
      .limit(1);

    if (!existing[0]) {
      throw new AppError('NOT_FOUND', 'Quick preset not found');
    }

    const [updated] = await db
      .update(quickPresets)
      .set({
        label: input.label,
        icon: input.icon,
        type: input.type,
        amountMinor: input.amountMinor,
        walletId: input.walletId,
        toWalletId: input.toWalletId ?? null,
        categoryId: input.categoryId ?? null,
        merchant: input.merchant ?? null,
        tags: input.tags ?? [],
        defaultOrder: input.defaultOrder,
      })
      .where(and(eq(quickPresets.id, input.id), eq(quickPresets.userId, userId)))
      .returning();

    return mapQuickPresetRow(updated);
  }

  const [inserted] = await db
    .insert(quickPresets)
    .values({
      id: generateId('preset'),
      userId,
      label: input.label,
      icon: input.icon,
      type: input.type,
      amountMinor: input.amountMinor,
      walletId: input.walletId,
      toWalletId: input.toWalletId ?? null,
      categoryId: input.categoryId ?? null,
      merchant: input.merchant ?? null,
      tags: input.tags ?? [],
      defaultOrder: input.defaultOrder,
    })
    .returning();

  return mapQuickPresetRow(inserted);
}

export async function deleteQuickPreset(
  db: AppDb,
  userId: string,
  presetId: string,
): Promise<void> {
  const deleted = await db
    .delete(quickPresets)
    .where(and(eq(quickPresets.id, presetId), eq(quickPresets.userId, userId)))
    .returning({ id: quickPresets.id });

  if (!deleted[0]) {
    throw new AppError('NOT_FOUND', 'Quick preset not found');
  }
}

// ==========================================
// Safe-to-Spend
// ==========================================

export async function getSafeToSpend(
  db: AppDb,
  userId: string,
  currentDate?: Date,
): Promise<SafeToSpendMetrics> {
  const date = currentDate ?? new Date();
  const periodMonth = getCurrentPeriodMonth(date);

  const [walletRows, commitmentRows, budgetRows, fundRows, userTransactions] =
    await Promise.all([
      db.select().from(wallets).where(eq(wallets.userId, userId)),
      db
        .select()
        .from(recurringCommitments)
        .where(eq(recurringCommitments.userId, userId)),
      db.select().from(categoryBudgets).where(eq(categoryBudgets.userId, userId)),
      db.select().from(sinkingFunds).where(eq(sinkingFunds.userId, userId)),
      loadTransactionsWithSplits(db, userId),
    ]);

  const userWallets = walletRows.map(mapWalletRow);
  const liquidWallets = userWallets.filter((w) => isWalletLiquidForSafeToSpend(w));
  const liquidWalletIds = new Set(liquidWallets.map((w) => w.id));

  const categoryBudgetStatuses = computeEnvelopeRollovers({
    budgets: budgetRows.map(mapCategoryBudgetRow),
    transactions: userTransactions,
    periodMonth,
  });

  const userFunds = fundRows
    .map(mapSinkingFundRow)
    .filter((sf) => liquidWalletIds.has(sf.walletId));

  return computeSafeToSpend({
    liquidWallets,
    commitments: commitmentRows.map(mapRecurringCommitmentRow),
    categoryBudgets: categoryBudgetStatuses,
    sinkingFunds: userFunds,
    currentDate: date,
  });
}
