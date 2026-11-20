import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_PRESETS,
  DEFAULT_TAGS,
  DEFAULT_WALLETS,
  SUPPORTED_CURRENCY,
  categorySchema,
  createDefaultTransactions,
  smartDefaultsSchema,
  transactionSchema,
  walletSchema,
  type Category,
  type CreateTransactionInput,
  type SmartDefaults,
  type Transaction,
  type TransactionSplit,
  type Wallet,
} from '@repo/contracts';
import type { AppDb } from '../../core/db/client';
import {
  balanceReconciliations,
  categories,
  categoryBudgets,
  quickPresets,
  recurringCommitments,
  sinkingFunds,
  transactionSplits,
  transactions,
  userSettings,
  wallets,
} from '../../core/db/schema';
import { AppError } from '../../core/errors';

export function generateId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

export function mapWalletRow(row: typeof wallets.$inferSelect): Wallet {
  return walletSchema.parse({
    id: row.id,
    name: row.name,
    type: row.type,
    icon: row.icon,
    color: row.color,
    currency: row.currency,
    openingBalanceMinor: row.openingBalanceMinor,
    balanceMinor: row.balanceMinor,
    ...(row.includeInSafeToSpend !== null
      ? { includeInSafeToSpend: row.includeInSafeToSpend }
      : {}),
  });
}

export function mapCategoryRow(row: typeof categories.$inferSelect): Category {
  return categorySchema.parse({
    id: row.id,
    name: row.name,
    type: row.type,
    icon: row.icon,
    color: row.color,
    usageCount: row.usageCount,
    defaultOrder: row.defaultOrder,
    isCustom: row.isCustom,
  });
}

export async function assertOwnedWallet(
  db: AppDb,
  userId: string,
  walletId: string,
  label = 'Wallet',
  options: { forUpdate?: boolean } = {},
): Promise<typeof wallets.$inferSelect> {
  const baseQuery = db
    .select()
    .from(wallets)
    .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)))
    .limit(1);
  const rows = options.forUpdate ? await baseQuery.for('update') : await baseQuery;
  if (!rows[0]) {
    throw new AppError('NOT_FOUND', `${label} not found`);
  }
  return rows[0];
}

export function assertTransactionCurrencyConsistency(
  txCurrency: string,
  sourceWallet: typeof wallets.$inferSelect,
  destWallet?: typeof wallets.$inferSelect,
): void {
  if (
    sourceWallet.currency !== SUPPORTED_CURRENCY ||
    txCurrency !== sourceWallet.currency
  ) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Transaction currency must match PHP wallet currency',
    );
  }
  if (destWallet && destWallet.currency !== sourceWallet.currency) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Cross-currency transfers are not supported',
    );
  }
}

export async function assertOwnedCategories(
  db: AppDb,
  userId: string,
  categoryIds: readonly string[],
): Promise<void> {
  const uniqueIds = Array.from(new Set(categoryIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return;
  }

  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.userId, userId), inArray(categories.id, uniqueIds)));

  if (rows.length !== uniqueIds.length) {
    throw new AppError('NOT_FOUND', 'Category not found');
  }
}

export async function loadTransactionsWithSplits(
  db: AppDb,
  userId: string,
): Promise<Transaction[]> {
  const txRows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.occurredAt), desc(transactions.createdAt));

  if (txRows.length === 0) {
    return [];
  }

  const txIds = txRows.map((row) => row.id);
  const splitRows = await db
    .select()
    .from(transactionSplits)
    .where(inArray(transactionSplits.transactionId, txIds));

  const splitsByTxId = new Map<string, TransactionSplit[]>();
  for (const split of splitRows) {
    const list = splitsByTxId.get(split.transactionId) ?? [];
    list.push({
      id: split.id,
      categoryId: split.categoryId,
      amountMinor: split.amountMinor,
      ...(split.note !== null ? { note: split.note } : {}),
    });
    splitsByTxId.set(split.transactionId, list);
  }

  return txRows.map((row) => {
    const splits = splitsByTxId.get(row.id);
    return transactionSchema.parse({
      id: row.id,
      type: row.type,
      amountMinor: row.amountMinor,
      currency: row.currency,
      walletId: row.walletId,
      ...(row.toWalletId !== null ? { toWalletId: row.toWalletId } : {}),
      ...(row.categoryId !== null ? { categoryId: row.categoryId } : {}),
      ...(splits && splits.length > 0 ? { splits } : {}),
      ...(row.merchant !== null ? { merchant: row.merchant } : {}),
      tags: row.tags ?? [],
      ...(row.note !== null ? { note: row.note } : {}),
      ...(row.receiptUri !== null ? { receiptUri: row.receiptUri } : {}),
      occurredAt: row.occurredAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    });
  });
}

export async function loadTransactionById(
  db: AppDb,
  userId: string,
  transactionId: string,
  options: { forUpdate?: boolean } = {},
): Promise<Transaction> {
  const baseQuery = db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)))
    .limit(1);
  const rows = options.forUpdate ? await baseQuery.for('update') : await baseQuery;

  const row = rows[0];
  if (!row) {
    throw new AppError('NOT_FOUND', 'Transaction not found');
  }

  const splitRows = await db
    .select()
    .from(transactionSplits)
    .where(eq(transactionSplits.transactionId, row.id));

  const splits: TransactionSplit[] = splitRows.map((s) => ({
    id: s.id,
    categoryId: s.categoryId,
    amountMinor: s.amountMinor,
    ...(s.note !== null ? { note: s.note } : {}),
  }));

  return transactionSchema.parse({
    id: row.id,
    type: row.type,
    amountMinor: row.amountMinor,
    currency: row.currency,
    walletId: row.walletId,
    ...(row.toWalletId !== null ? { toWalletId: row.toWalletId } : {}),
    ...(row.categoryId !== null ? { categoryId: row.categoryId } : {}),
    ...(splits.length > 0 ? { splits } : {}),
    ...(row.merchant !== null ? { merchant: row.merchant } : {}),
    tags: row.tags ?? [],
    ...(row.note !== null ? { note: row.note } : {}),
    ...(row.receiptUri !== null ? { receiptUri: row.receiptUri } : {}),
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  });
}

export async function applyTxSideEffects(
  db: AppDb,
  userId: string,
  tx: {
    type: string;
    amountMinor: number;
    walletId: string;
    toWalletId?: string;
    categoryId?: string;
    splits?: readonly { categoryId: string }[];
  },
  direction: 1 | -1,
): Promise<void> {
  const walletDeltas = new Map<string, number>();

  if (tx.type === 'EXPENSE') {
    walletDeltas.set(tx.walletId, -tx.amountMinor * direction);
  } else if (tx.type === 'INCOME') {
    walletDeltas.set(tx.walletId, tx.amountMinor * direction);
  } else if (tx.type === 'TRANSFER') {
    walletDeltas.set(tx.walletId, -tx.amountMinor * direction);
    if (tx.toWalletId) {
      walletDeltas.set(
        tx.toWalletId,
        (walletDeltas.get(tx.toWalletId) ?? 0) + tx.amountMinor * direction,
      );
    }
  }

  for (const [targetWalletId, delta] of walletDeltas.entries()) {
    if (delta === 0) continue;
    await db
      .update(wallets)
      .set({
        balanceMinor: sql`${wallets.balanceMinor} + ${delta}`,
      })
      .where(and(eq(wallets.id, targetWalletId), eq(wallets.userId, userId)));
  }

  const categoryIds = new Set<string>();
  if (tx.splits && tx.splits.length > 0) {
    for (const split of tx.splits) {
      categoryIds.add(split.categoryId);
    }
  } else if (tx.categoryId) {
    categoryIds.add(tx.categoryId);
  }

  const uniqueCatIds = Array.from(categoryIds);
  if (uniqueCatIds.length > 0) {
    await db
      .update(categories)
      .set({
        usageCount: sql`GREATEST(0, ${categories.usageCount} + ${direction})`,
      })
      .where(
        and(eq(categories.userId, userId), inArray(categories.id, uniqueCatIds)),
      );
  }
}

export function computeNetTxDeltaByWallet(
  txs: ReadonlyArray<{
    type: string;
    amountMinor: number;
    walletId: string;
    toWalletId?: string | null;
  }>,
): Map<string, number> {
  const deltas = new Map<string, number>();
  for (const tx of txs) {
    if (tx.type === 'INCOME') {
      deltas.set(tx.walletId, (deltas.get(tx.walletId) ?? 0) + tx.amountMinor);
    } else if (tx.type === 'EXPENSE') {
      deltas.set(tx.walletId, (deltas.get(tx.walletId) ?? 0) - tx.amountMinor);
    } else if (tx.type === 'TRANSFER') {
      deltas.set(tx.walletId, (deltas.get(tx.walletId) ?? 0) - tx.amountMinor);
      if (tx.toWalletId) {
        deltas.set(tx.toWalletId, (deltas.get(tx.toWalletId) ?? 0) + tx.amountMinor);
      }
    }
  }
  return deltas;
}

export async function recomputeUserWalletBalances(
  db: AppDb,
  userId: string,
): Promise<void> {
  const userWallets = await db
    .select()
    .from(wallets)
    .where(eq(wallets.userId, userId))
    .for('update');

  const userTxs = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      amountMinor: transactions.amountMinor,
      walletId: transactions.walletId,
      toWalletId: transactions.toWalletId,
      categoryId: transactions.categoryId,
    })
    .from(transactions)
    .where(eq(transactions.userId, userId));

  const deltas = computeNetTxDeltaByWallet(userTxs);

  for (const w of userWallets) {
    const expectedBalance = w.openingBalanceMinor + (deltas.get(w.id) ?? 0);
    await db
      .update(wallets)
      .set({ balanceMinor: expectedBalance })
      .where(and(eq(wallets.id, w.id), eq(wallets.userId, userId)));
  }

  const splitCatIdsByTx = new Map<string, Set<string>>();
  if (userTxs.length > 0) {
    const splitRows = await db
      .select({
        transactionId: transactionSplits.transactionId,
        categoryId: transactionSplits.categoryId,
      })
      .from(transactionSplits)
      .where(
        inArray(
          transactionSplits.transactionId,
          userTxs.map((t) => t.id),
        ),
      );

    for (const split of splitRows) {
      const catSet = splitCatIdsByTx.get(split.transactionId) ?? new Set<string>();
      catSet.add(split.categoryId);
      splitCatIdsByTx.set(split.transactionId, catSet);
    }
  }

  const usageCounts = new Map<string, number>();
  for (const tx of userTxs) {
    const splitCats = splitCatIdsByTx.get(tx.id);
    if (splitCats && splitCats.size > 0) {
      for (const catId of splitCats) {
        usageCounts.set(catId, (usageCounts.get(catId) ?? 0) + 1);
      }
    } else if (tx.categoryId) {
      usageCounts.set(tx.categoryId, (usageCounts.get(tx.categoryId) ?? 0) + 1);
    }
  }

  const userCategories = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.userId, userId));

  for (const cat of userCategories) {
    const count = usageCounts.get(cat.id) ?? 0;
    await db
      .update(categories)
      .set({ usageCount: count })
      .where(and(eq(categories.id, cat.id), eq(categories.userId, userId)));
  }
}

export async function getUserSettings(
  db: AppDb,
  userId: string,
): Promise<SmartDefaults> {
  const [settingsRow] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  const userWallets = await db
    .select()
    .from(wallets)
    .where(eq(wallets.userId, userId))
    .orderBy(wallets.createdAt);

  const fallbackWalletId = userWallets[0]?.id ?? 'wallet-checking';
  const fallbackToWalletId = userWallets[1]?.id ?? fallbackWalletId;

  if (!settingsRow) {
    return smartDefaultsSchema.parse({
      lastWalletId: fallbackWalletId,
      lastTransferToWalletId: fallbackToWalletId,
      recentMerchants: [],
      knownTags: [...DEFAULT_TAGS],
      monthlyBudgetMinor: 3000000,
    });
  }

  return smartDefaultsSchema.parse({
    lastWalletId: settingsRow.lastWalletId ?? fallbackWalletId,
    lastTransferToWalletId:
      settingsRow.lastTransferToWalletId ?? fallbackToWalletId,
    recentMerchants: settingsRow.recentMerchants ?? [],
    knownTags: settingsRow.knownTags ?? [],
    monthlyBudgetMinor: settingsRow.monthlyBudgetMinor,
  });
}

export async function refreshSettingsFromTransaction(
  db: AppDb,
  userId: string,
  tx: Transaction,
  updateLastWallets: boolean,
): Promise<void> {
  const current = await getUserSettings(db, userId);

  let recentMerchants = [...current.recentMerchants];
  if (tx.merchant && tx.merchant.trim().length > 0) {
    const trimmed = tx.merchant.trim();
    const lower = trimmed.toLowerCase();
    recentMerchants = [
      trimmed,
      ...recentMerchants.filter((m) => m.toLowerCase() !== lower),
    ].slice(0, 12);
  }

  const knownTags = [...current.knownTags];
  if (tx.tags && tx.tags.length > 0) {
    const existingLower = new Set(knownTags.map((t) => t.toLowerCase()));
    for (const rawTag of tx.tags) {
      const normalized = rawTag.trim().replace(/^#+/, '');
      if (normalized && !existingLower.has(normalized.toLowerCase())) {
        knownTags.push(normalized);
        existingLower.add(normalized.toLowerCase());
      }
    }
  }

  const nextLastWalletId = updateLastWallets ? tx.walletId : current.lastWalletId;
  const nextLastTransferToWalletId =
    updateLastWallets && tx.type === 'TRANSFER' && tx.toWalletId
      ? tx.toWalletId
      : current.lastTransferToWalletId;

  await db
    .insert(userSettings)
    .values({
      userId,
      lastWalletId: nextLastWalletId,
      lastTransferToWalletId: nextLastTransferToWalletId ?? null,
      recentMerchants,
      knownTags,
      monthlyBudgetMinor: current.monthlyBudgetMinor,
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        lastWalletId: nextLastWalletId,
        lastTransferToWalletId: nextLastTransferToWalletId ?? null,
        recentMerchants,
        knownTags,
      },
    });
}

export async function createTransactionInTx(
  db: AppDb,
  userId: string,
  input: CreateTransactionInput,
  options: { updateLastWallets?: boolean; refreshSettings?: boolean } = {},
): Promise<Transaction> {
  const sourceWallet = await assertOwnedWallet(db, userId, input.walletId, 'Source wallet');
  const destWallet =
    input.type === 'TRANSFER' && input.toWalletId
      ? await assertOwnedWallet(db, userId, input.toWalletId, 'Destination wallet')
      : undefined;
  assertTransactionCurrencyConsistency(input.currency, sourceWallet, destWallet);

  const catIdsToCheck: string[] = [];
  if (input.categoryId) catIdsToCheck.push(input.categoryId);
  if (input.splits) {
    for (const split of input.splits) {
      catIdsToCheck.push(split.categoryId);
    }
  }
  await assertOwnedCategories(db, userId, catIdsToCheck);

  const txId = generateId('tx');
  const now = new Date();
  const occurredAtDate = new Date(input.occurredAt);

  await db.insert(transactions).values({
    id: txId,
    userId,
    type: input.type,
    amountMinor: input.amountMinor,
    currency: input.currency,
    walletId: input.walletId,
    toWalletId: input.toWalletId ?? null,
    categoryId: input.categoryId ?? null,
    merchant: input.merchant ?? null,
    tags: input.tags ?? [],
    note: input.note ?? null,
    receiptUri: input.receiptUri ?? null,
    occurredAt: occurredAtDate,
    createdAt: now,
  });

  const persistedSplits: TransactionSplit[] = [];
  if (input.splits && input.splits.length > 0) {
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
        transactionId: txId,
        categoryId: s.categoryId,
        amountMinor: s.amountMinor,
        note: s.note ?? null,
      };
    });
    await db.insert(transactionSplits).values(splitRows);
  }

  const createdTx = transactionSchema.parse({
    id: txId,
    type: input.type,
    amountMinor: input.amountMinor,
    currency: input.currency,
    walletId: input.walletId,
    ...(input.toWalletId !== undefined ? { toWalletId: input.toWalletId } : {}),
    ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
    ...(persistedSplits.length > 0 ? { splits: persistedSplits } : {}),
    ...(input.merchant !== undefined ? { merchant: input.merchant } : {}),
    tags: input.tags ?? [],
    ...(input.note !== undefined ? { note: input.note } : {}),
    ...(input.receiptUri !== undefined ? { receiptUri: input.receiptUri } : {}),
    occurredAt: occurredAtDate.toISOString(),
    createdAt: now.toISOString(),
  });

  await applyTxSideEffects(db, userId, createdTx, 1);

  if (options.refreshSettings !== false) {
    await refreshSettingsFromTransaction(
      db,
      userId,
      createdTx,
      options.updateLastWallets ?? true,
    );
  }

  return createdTx;
}

export async function clearUserWorkspaceData(db: AppDb, userId: string): Promise<void> {
  await db
    .delete(balanceReconciliations)
    .where(eq(balanceReconciliations.userId, userId));
  await db.delete(transactions).where(eq(transactions.userId, userId));
  await db.delete(categoryBudgets).where(eq(categoryBudgets.userId, userId));
  await db
    .delete(recurringCommitments)
    .where(eq(recurringCommitments.userId, userId));
  await db.delete(sinkingFunds).where(eq(sinkingFunds.userId, userId));
  await db.delete(quickPresets).where(eq(quickPresets.userId, userId));
  await db.delete(wallets).where(eq(wallets.userId, userId));
  await db.delete(categories).where(eq(categories.userId, userId));
}

export async function seedWorkspaceForUser(
  db: AppDb,
  userId: string,
  mode: 'empty' | 'demo',
): Promise<void> {
  const walletIdByKey = new Map<string, string>();
  const walletRows = DEFAULT_WALLETS.map((w) => {
    const id = generateId('wallet');
    walletIdByKey.set(w.id, id);
    const openingMinor = mode === 'demo' ? (w.openingBalanceMinor ?? 0) : 0;
    return {
      id,
      userId,
      systemKey: w.id,
      name: w.name,
      type: w.type,
      icon: w.icon,
      color: w.color,
      currency: w.currency,
      openingBalanceMinor: openingMinor,
      balanceMinor: openingMinor,
      includeInSafeToSpend: w.includeInSafeToSpend ?? null,
    };
  });
  await db.insert(wallets).values(walletRows);

  const categoryIdByKey = new Map<string, string>();
  const categoryRows = DEFAULT_CATEGORIES.map((c) => {
    const id = generateId('cat');
    categoryIdByKey.set(c.id, id);
    return {
      id,
      userId,
      systemKey: c.id,
      name: c.name,
      type: c.type,
      icon: c.icon,
      color: c.color,
      usageCount: 0,
      defaultOrder: c.defaultOrder,
      isCustom: c.isCustom,
    };
  });
  await db.insert(categories).values(categoryRows);

  const checkingId = walletIdByKey.get('wallet-checking') ?? walletRows[0].id;
  const cardId = walletIdByKey.get('wallet-card') ?? checkingId;
  const savingsId = walletIdByKey.get('wallet-savings') ?? checkingId;

  const presetRows = DEFAULT_PRESETS.map((p) => ({
    id: generateId('preset'),
    userId,
    label: p.label,
    icon: p.icon,
    type: p.type,
    amountMinor: p.amountMinor,
    walletId: walletIdByKey.get(p.walletId) ?? checkingId,
    toWalletId: p.toWalletId
      ? (walletIdByKey.get(p.toWalletId) ?? savingsId)
      : null,
    categoryId: p.categoryId
      ? (categoryIdByKey.get(p.categoryId) ?? null)
      : null,
    merchant: p.merchant ?? null,
    tags: p.tags,
    defaultOrder: p.defaultOrder,
  }));
  await db.insert(quickPresets).values(presetRows);

  if (mode === 'empty') {
    await db
      .insert(userSettings)
      .values({
        userId,
        lastWalletId: checkingId,
        lastTransferToWalletId: savingsId,
        recentMerchants: [],
        knownTags: [...DEFAULT_TAGS],
        monthlyBudgetMinor: 3000000,
      })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: {
          lastWalletId: checkingId,
          lastTransferToWalletId: savingsId,
          recentMerchants: [],
          knownTags: [...DEFAULT_TAGS],
          monthlyBudgetMinor: 3000000,
        },
      });
    return;
  }

  // Demo mode: seed transactions, budgets, recurring commitments, sinking funds
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const currentPeriod = `${year}-${month}`;

  await db
    .insert(userSettings)
    .values({
      userId,
      lastWalletId: checkingId,
      lastTransferToWalletId: savingsId,
      recentMerchants: ['SM Supermarket', 'Meralco', 'Starbucks', 'Grab', 'Shopee'],
      knownTags: [...DEFAULT_TAGS],
      monthlyBudgetMinor: 3000000,
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        lastWalletId: checkingId,
        lastTransferToWalletId: savingsId,
        recentMerchants: ['SM Supermarket', 'Meralco', 'Starbucks', 'Grab', 'Shopee'],
        knownTags: [...DEFAULT_TAGS],
        monthlyBudgetMinor: 3000000,
      },
    });

  const demoTxs = createDefaultTransactions(now);

  for (const tx of demoTxs) {
    const txId = generateId('tx');
    const mappedWalletId = walletIdByKey.get(tx.walletId) ?? checkingId;
    const mappedToWalletId = tx.toWalletId
      ? (walletIdByKey.get(tx.toWalletId) ?? savingsId)
      : null;
    const mappedCategoryId = tx.categoryId
      ? (categoryIdByKey.get(tx.categoryId) ?? null)
      : null;

    await db.insert(transactions).values({
      id: txId,
      userId,
      type: tx.type,
      amountMinor: tx.amountMinor,
      currency: tx.currency,
      walletId: mappedWalletId,
      toWalletId: mappedToWalletId,
      categoryId: mappedCategoryId,
      merchant: tx.merchant ?? null,
      tags: tx.tags,
      note: tx.note ?? null,
      receiptUri: tx.receiptUri ?? null,
      occurredAt: new Date(tx.occurredAt),
      createdAt: new Date(tx.createdAt),
    });

    if (tx.splits && tx.splits.length > 0) {
      const splitValues = tx.splits.map((s) => ({
        id: generateId('split'),
        transactionId: txId,
        categoryId: categoryIdByKey.get(s.categoryId) ?? categoryRows[0].id,
        amountMinor: s.amountMinor,
        note: s.note ?? null,
      }));
      await db.insert(transactionSplits).values(splitValues);
    }
  }

  await recomputeUserWalletBalances(db, userId);

  const budgetSeeds = [
    { key: 'cat-groceries', assignedMinor: 1000000, rollover: true, notes: 'Monthly starter grocery envelope' },
    { key: 'cat-dining', assignedMinor: 500000, rollover: false, notes: 'Monthly dining out envelope' },
    { key: 'cat-transport', assignedMinor: 300000, rollover: true, notes: 'Monthly transport envelope' },
    { key: 'cat-coffee', assignedMinor: 200000, rollover: false, notes: 'Monthly coffee and drinks envelope' },
  ];

  await db.insert(categoryBudgets).values(
    budgetSeeds.map((b) => ({
      id: generateId('budget'),
      userId,
      categoryId: categoryIdByKey.get(b.key) ?? categoryRows[0].id,
      periodMonth: currentPeriod,
      assignedMinor: b.assignedMinor,
      rolloverEnabled: b.rollover,
      notes: b.notes,
    })),
  );

  await db.insert(recurringCommitments).values([
    {
      id: generateId('commitment'),
      userId,
      name: 'Apartment Rent',
      type: 'EXPENSE',
      amountMinor: 1500000,
      currency: 'PHP',
      walletId: checkingId,
      categoryId: categoryIdByKey.get('cat-household') ?? categoryRows[0].id,
      frequency: 'MONTHLY',
      dueDay: 1,
      isAutoPaid: true,
      lastPaidPeriod: currentPeriod,
      isActive: true,
      notes: 'Monthly rent commitment',
    },
    {
      id: generateId('commitment'),
      userId,
      name: 'Electric Bill',
      type: 'EXPENSE',
      amountMinor: 450000,
      currency: 'PHP',
      walletId: checkingId,
      categoryId: categoryIdByKey.get('cat-bills') ?? categoryRows[0].id,
      frequency: 'MONTHLY',
      dueDay: 15,
      isAutoPaid: false,
      isActive: true,
      notes: 'Monthly electric utility',
    },
    {
      id: generateId('commitment'),
      userId,
      name: 'Netflix',
      type: 'EXPENSE',
      amountMinor: 54900,
      currency: 'PHP',
      walletId: cardId,
      categoryId: categoryIdByKey.get('cat-subscriptions') ?? categoryRows[0].id,
      frequency: 'MONTHLY',
      dueDay: 20,
      isAutoPaid: true,
      isActive: true,
      notes: 'Streaming subscription',
    },
    {
      id: generateId('commitment'),
      userId,
      name: 'Monthly Salary',
      type: 'INCOME',
      amountMinor: 5500000,
      currency: 'PHP',
      walletId: checkingId,
      categoryId: categoryIdByKey.get('cat-salary') ?? categoryRows[0].id,
      frequency: 'MONTHLY',
      dueDay: 30,
      isAutoPaid: true,
      lastPaidPeriod: currentPeriod,
      isActive: true,
      notes: 'Monthly payroll deposit',
    },
  ]);

  await db.insert(sinkingFunds).values([
    {
      id: generateId('fund'),
      userId,
      name: 'Car Insurance',
      icon: '🚗',
      color: '#3B82F6',
      targetAmountMinor: 2500000,
      currentSavedMinor: 1000000,
      targetDate: `${year}-12-31`,
      walletId: savingsId,
      monthlyContributionMinor: 500000,
      isCompleted: false,
      notes: 'Semi-annual car insurance premium',
    },
    {
      id: generateId('fund'),
      userId,
      name: 'Holiday Gifts',
      icon: '🎁',
      color: '#EC4899',
      targetAmountMinor: 1500000,
      currentSavedMinor: 500000,
      targetDate: `${year}-12-25`,
      walletId: savingsId,
      monthlyContributionMinor: 350000,
      isCompleted: false,
      notes: 'Year-end holiday gifts',
    },
  ]);
}
