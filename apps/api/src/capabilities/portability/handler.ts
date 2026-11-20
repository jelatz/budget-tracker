import { and, asc, eq, sql } from 'drizzle-orm';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_WALLETS,
  backupEnvelopeSchema,
  categoryBudgetSchema,
  quickPresetSchema,
  recurringCommitmentSchema,
  sinkingFundSchema,
  type BackupEnvelope,
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
import {
  clearUserWorkspaceData,
  computeNetTxDeltaByWallet,
  generateId,
  getUserSettings,
  loadTransactionsWithSplits,
  mapCategoryRow,
  mapWalletRow,
  recomputeUserWalletBalances,
  seedWorkspaceForUser,
} from '../shared/tx-helpers';

const DEFAULT_WALLET_KEYS = new Set(DEFAULT_WALLETS.map((w) => w.id));
const DEFAULT_CATEGORY_KEYS = new Set(DEFAULT_CATEGORIES.map((c) => c.id));

export async function exportBackupEnvelope(
  db: AppDb,
  userId: string,
): Promise<BackupEnvelope> {
  const [
    walletRows,
    categoryRows,
    userTransactions,
    budgetRows,
    commitmentRows,
    fundRows,
    presetRows,
    settings,
  ] = await Promise.all([
    db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .orderBy(asc(wallets.createdAt)),
    db
      .select()
      .from(categories)
      .where(eq(categories.userId, userId))
      .orderBy(asc(categories.defaultOrder), asc(categories.createdAt)),
    loadTransactionsWithSplits(db, userId),
    db.select().from(categoryBudgets).where(eq(categoryBudgets.userId, userId)),
    db
      .select()
      .from(recurringCommitments)
      .where(eq(recurringCommitments.userId, userId)),
    db.select().from(sinkingFunds).where(eq(sinkingFunds.userId, userId)),
    db
      .select()
      .from(quickPresets)
      .where(eq(quickPresets.userId, userId))
      .orderBy(asc(quickPresets.defaultOrder)),
    getUserSettings(db, userId),
  ]);

  return backupEnvelopeSchema.parse({
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      wallets: walletRows.map(mapWalletRow),
      categories: categoryRows.map(mapCategoryRow),
      transactions: userTransactions,
      categoryBudgets: budgetRows.map((b) =>
        categoryBudgetSchema.parse({
          id: b.id,
          categoryId: b.categoryId,
          periodMonth: b.periodMonth,
          assignedMinor: b.assignedMinor,
          rolloverEnabled: b.rolloverEnabled,
          ...(b.notes !== null ? { notes: b.notes } : {}),
        }),
      ),
      recurringCommitments: commitmentRows.map((rc) =>
        recurringCommitmentSchema.parse({
          id: rc.id,
          name: rc.name,
          type: rc.type,
          amountMinor: rc.amountMinor,
          currency: rc.currency,
          walletId: rc.walletId,
          categoryId: rc.categoryId,
          frequency: rc.frequency,
          dueDay: rc.dueDay,
          isAutoPaid: rc.isAutoPaid,
          isActive: rc.isActive,
          ...(rc.lastPaidPeriod !== null ? { lastPaidPeriod: rc.lastPaidPeriod } : {}),
          ...(rc.notes !== null ? { notes: rc.notes } : {}),
        }),
      ),
      sinkingFunds: fundRows.map((sf) =>
        sinkingFundSchema.parse({
          id: sf.id,
          name: sf.name,
          icon: sf.icon,
          color: sf.color,
          targetAmountMinor: sf.targetAmountMinor,
          currentSavedMinor: sf.currentSavedMinor,
          targetDate: sf.targetDate,
          walletId: sf.walletId,
          monthlyContributionMinor: sf.monthlyContributionMinor,
          isCompleted: sf.isCompleted,
          ...(sf.notes !== null ? { notes: sf.notes } : {}),
        }),
      ),
      quickPresets: presetRows.map((qp) =>
        quickPresetSchema.parse({
          id: qp.id,
          label: qp.label,
          icon: qp.icon,
          type: qp.type,
          amountMinor: qp.amountMinor,
          walletId: qp.walletId,
          ...(qp.toWalletId !== null ? { toWalletId: qp.toWalletId } : {}),
          ...(qp.categoryId !== null ? { categoryId: qp.categoryId } : {}),
          ...(qp.merchant !== null ? { merchant: qp.merchant } : {}),
          tags: qp.tags ?? [],
          defaultOrder: qp.defaultOrder,
        }),
      ),
      smartDefaults: settings,
    },
  });
}

export async function importBackupEnvelope(
  db: AppDb,
  userId: string,
  envelope: BackupEnvelope,
  mode: 'merge' | 'overwrite',
): Promise<{ success: true; importedCount: number }> {
  await db.transaction(async (tx) => {
    const walletIdMap = new Map<string, string>();
    const categoryIdMap = new Map<string, string>();
    const incomingDeltas = computeNetTxDeltaByWallet(envelope.data.transactions);

    const resolveIncomingOpening = (w: BackupEnvelope['data']['wallets'][number]) =>
      w.openingBalanceMinor ?? w.balanceMinor - (incomingDeltas.get(w.id) ?? 0);

    if (mode === 'overwrite') {
      await clearUserWorkspaceData(tx, userId);

      const usedWalletKeys = new Set<string>();
      for (const w of envelope.data.wallets) {
        const newId = generateId('wallet');
        walletIdMap.set(w.id, newId);
        const sysKey =
          DEFAULT_WALLET_KEYS.has(w.id) && !usedWalletKeys.has(w.id) ? w.id : null;
        if (sysKey) usedWalletKeys.add(sysKey);
        const resolvedOpening = resolveIncomingOpening(w);

        await tx.insert(wallets).values({
          id: newId,
          userId,
          systemKey: sysKey,
          name: w.name,
          type: w.type,
          icon: w.icon,
          color: w.color,
          currency: w.currency,
          openingBalanceMinor: resolvedOpening,
          balanceMinor: resolvedOpening,
          includeInSafeToSpend: w.includeInSafeToSpend ?? null,
        });
      }

      const usedCategoryKeys = new Set<string>();
      for (const c of envelope.data.categories) {
        const newId = generateId('cat');
        categoryIdMap.set(c.id, newId);
        const sysKey =
          DEFAULT_CATEGORY_KEYS.has(c.id) && !usedCategoryKeys.has(c.id) ? c.id : null;
        if (sysKey) usedCategoryKeys.add(sysKey);

        await tx.insert(categories).values({
          id: newId,
          userId,
          systemKey: sysKey,
          name: c.name,
          type: c.type,
          icon: c.icon,
          color: c.color,
          usageCount: c.usageCount,
          defaultOrder: c.defaultOrder,
          isCustom: c.isCustom,
        });
      }
    } else {
      // Merge mode: match existing user wallets & categories by id, systemKey, or name
      const [existingWallets, existingWalletTxRefs] = await Promise.all([
        tx.select().from(wallets).where(eq(wallets.userId, userId)),
        tx
          .select({
            walletId: transactions.walletId,
            toWalletId: transactions.toWalletId,
          })
          .from(transactions)
          .where(eq(transactions.userId, userId)),
      ]);

      const existingWalletIdsWithTxs = new Set<string>();
      for (const ref of existingWalletTxRefs) {
        existingWalletIdsWithTxs.add(ref.walletId);
        if (ref.toWalletId) {
          existingWalletIdsWithTxs.add(ref.toWalletId);
        }
      }

      for (const w of envelope.data.wallets) {
        const resolvedOpening = resolveIncomingOpening(w);
        const match = existingWallets.find(
          (ew) =>
            ew.id === w.id ||
            (ew.systemKey !== null && ew.systemKey === w.id) ||
            ew.name.toLowerCase() === w.name.toLowerCase(),
        );
        if (match) {
          walletIdMap.set(w.id, match.id);
          const nextOpening =
            match.openingBalanceMinor === 0 && !existingWalletIdsWithTxs.has(match.id)
              ? resolvedOpening
              : match.openingBalanceMinor;

          await tx
            .update(wallets)
            .set({
              name: w.name,
              type: w.type,
              icon: w.icon,
              color: w.color,
              openingBalanceMinor: nextOpening,
              includeInSafeToSpend:
                w.includeInSafeToSpend !== undefined
                  ? w.includeInSafeToSpend
                  : match.includeInSafeToSpend,
            })
            .where(and(eq(wallets.id, match.id), eq(wallets.userId, userId)));
        } else {
          const newId = generateId('wallet');
          walletIdMap.set(w.id, newId);
          await tx.insert(wallets).values({
            id: newId,
            userId,
            systemKey: null,
            name: w.name,
            type: w.type,
            icon: w.icon,
            color: w.color,
            currency: w.currency,
            openingBalanceMinor: resolvedOpening,
            balanceMinor: resolvedOpening,
            includeInSafeToSpend: w.includeInSafeToSpend ?? null,
          });
        }
      }

      const existingCategories = await tx
        .select()
        .from(categories)
        .where(eq(categories.userId, userId));

      for (const c of envelope.data.categories) {
        const match = existingCategories.find(
          (ec) =>
            ec.id === c.id ||
            (ec.systemKey !== null && ec.systemKey === c.id) ||
            (ec.name.toLowerCase() === c.name.toLowerCase() && ec.type === c.type),
        );
        if (match) {
          categoryIdMap.set(c.id, match.id);
          await tx
            .update(categories)
            .set({
              name: c.name,
              icon: c.icon,
              color: c.color,
              usageCount: c.usageCount,
              defaultOrder: c.defaultOrder,
              isCustom: c.isCustom,
            })
            .where(and(eq(categories.id, match.id), eq(categories.userId, userId)));
        } else {
          const newId = generateId('cat');
          categoryIdMap.set(c.id, newId);
          await tx.insert(categories).values({
            id: newId,
            userId,
            systemKey: null,
            name: c.name,
            type: c.type,
            icon: c.icon,
            color: c.color,
            usageCount: c.usageCount,
            defaultOrder: c.defaultOrder,
            isCustom: c.isCustom,
          });
        }
      }
    }

    const resolveWalletId = (incomingId: string) =>
      walletIdMap.get(incomingId) ?? incomingId;
    const resolveCategoryId = (incomingId: string) =>
      categoryIdMap.get(incomingId) ?? incomingId;

    const currentUserWallets = await tx
      .select({ id: wallets.id })
      .from(wallets)
      .where(eq(wallets.userId, userId));
    const currentUserCats = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.userId, userId));

    const validWalletIds = new Set(currentUserWallets.map((w) => w.id));
    const validCategoryIds = new Set(currentUserCats.map((c) => c.id));

    const existingTxs =
      mode === 'merge'
        ? await tx
            .select({ id: transactions.id })
            .from(transactions)
            .where(eq(transactions.userId, userId))
        : [];
    const existingTxIdSet = new Set(existingTxs.map((t) => t.id));

    for (const incomingTx of envelope.data.transactions) {
      const mappedWalletId = resolveWalletId(incomingTx.walletId);
      if (!validWalletIds.has(mappedWalletId)) continue;

      const mappedToWalletId = incomingTx.toWalletId
        ? resolveWalletId(incomingTx.toWalletId)
        : null;
      if (mappedToWalletId && !validWalletIds.has(mappedToWalletId)) continue;

      const mappedCategoryId = incomingTx.categoryId
        ? resolveCategoryId(incomingTx.categoryId)
        : null;
      if (mappedCategoryId && !validCategoryIds.has(mappedCategoryId)) continue;

      const targetTxId =
        mode === 'merge' && existingTxIdSet.has(incomingTx.id)
          ? incomingTx.id
          : generateId('tx');

      if (mode === 'merge' && existingTxIdSet.has(incomingTx.id)) {
        await tx
          .update(transactions)
          .set({
            type: incomingTx.type,
            amountMinor: incomingTx.amountMinor,
            currency: incomingTx.currency,
            walletId: mappedWalletId,
            toWalletId: mappedToWalletId,
            categoryId: mappedCategoryId,
            merchant: incomingTx.merchant ?? null,
            tags: incomingTx.tags ?? [],
            note: incomingTx.note ?? null,
            receiptUri: incomingTx.receiptUri ?? null,
            occurredAt: new Date(incomingTx.occurredAt),
            createdAt: new Date(incomingTx.createdAt),
          })
          .where(and(eq(transactions.id, targetTxId), eq(transactions.userId, userId)));
        await tx
          .delete(transactionSplits)
          .where(eq(transactionSplits.transactionId, targetTxId));
      } else {
        await tx.insert(transactions).values({
          id: targetTxId,
          userId,
          type: incomingTx.type,
          amountMinor: incomingTx.amountMinor,
          currency: incomingTx.currency,
          walletId: mappedWalletId,
          toWalletId: mappedToWalletId,
          categoryId: mappedCategoryId,
          merchant: incomingTx.merchant ?? null,
          tags: incomingTx.tags ?? [],
          note: incomingTx.note ?? null,
          receiptUri: incomingTx.receiptUri ?? null,
          occurredAt: new Date(incomingTx.occurredAt),
          createdAt: new Date(incomingTx.createdAt),
        });
      }

      if (incomingTx.splits && incomingTx.splits.length > 0) {
        const splitValues = incomingTx.splits
          .map((s) => ({
            id: generateId('split'),
            transactionId: targetTxId,
            categoryId: resolveCategoryId(s.categoryId),
            amountMinor: s.amountMinor,
            note: s.note ?? null,
          }))
          .filter((s) => validCategoryIds.has(s.categoryId));

        if (splitValues.length > 0) {
          await tx.insert(transactionSplits).values(splitValues);
        }
      }
    }

    // Category budgets (respect unique (userId, categoryId, periodMonth))
    for (const b of envelope.data.categoryBudgets) {
      const mappedCatId = resolveCategoryId(b.categoryId);
      if (!validCategoryIds.has(mappedCatId)) continue;

      const [existingBudget] = await tx
        .select()
        .from(categoryBudgets)
        .where(
          and(
            eq(categoryBudgets.userId, userId),
            eq(categoryBudgets.categoryId, mappedCatId),
            eq(categoryBudgets.periodMonth, b.periodMonth),
          ),
        )
        .limit(1);

      if (existingBudget) {
        await tx
          .update(categoryBudgets)
          .set({
            assignedMinor: b.assignedMinor,
            rolloverEnabled: b.rolloverEnabled,
            notes: b.notes ?? null,
          })
          .where(
            and(
              eq(categoryBudgets.id, existingBudget.id),
              eq(categoryBudgets.userId, userId),
            ),
          );
      } else {
        await tx.insert(categoryBudgets).values({
          id: generateId('budget'),
          userId,
          categoryId: mappedCatId,
          periodMonth: b.periodMonth,
          assignedMinor: b.assignedMinor,
          rolloverEnabled: b.rolloverEnabled,
          notes: b.notes ?? null,
        });
      }
    }

    // Recurring commitments
    const existingCommitments =
      mode === 'merge'
        ? await tx
            .select({ id: recurringCommitments.id })
            .from(recurringCommitments)
            .where(eq(recurringCommitments.userId, userId))
        : [];
    const existingCommitmentIds = new Set(existingCommitments.map((c) => c.id));

    for (const rc of envelope.data.recurringCommitments) {
      const mappedWalletId = resolveWalletId(rc.walletId);
      const mappedCatId = resolveCategoryId(rc.categoryId);
      if (!validWalletIds.has(mappedWalletId) || !validCategoryIds.has(mappedCatId)) {
        continue;
      }

      if (mode === 'merge' && existingCommitmentIds.has(rc.id)) {
        await tx
          .update(recurringCommitments)
          .set({
            name: rc.name,
            type: rc.type,
            amountMinor: rc.amountMinor,
            currency: rc.currency,
            walletId: mappedWalletId,
            categoryId: mappedCatId,
            frequency: rc.frequency,
            dueDay: rc.dueDay,
            isAutoPaid: rc.isAutoPaid,
            isActive: rc.isActive,
            lastPaidPeriod: rc.lastPaidPeriod ?? null,
            notes: rc.notes ?? null,
          })
          .where(
            and(
              eq(recurringCommitments.id, rc.id),
              eq(recurringCommitments.userId, userId),
            ),
          );
      } else {
        await tx.insert(recurringCommitments).values({
          id: generateId('commitment'),
          userId,
          name: rc.name,
          type: rc.type,
          amountMinor: rc.amountMinor,
          currency: rc.currency,
          walletId: mappedWalletId,
          categoryId: mappedCatId,
          frequency: rc.frequency,
          dueDay: rc.dueDay,
          isAutoPaid: rc.isAutoPaid,
          isActive: rc.isActive,
          lastPaidPeriod: rc.lastPaidPeriod ?? null,
          notes: rc.notes ?? null,
        });
      }
    }

    // Sinking funds
    const existingFunds =
      mode === 'merge'
        ? await tx
            .select({ id: sinkingFunds.id })
            .from(sinkingFunds)
            .where(eq(sinkingFunds.userId, userId))
        : [];
    const existingFundIds = new Set(existingFunds.map((f) => f.id));

    for (const sf of envelope.data.sinkingFunds) {
      const mappedWalletId = resolveWalletId(sf.walletId);
      if (!validWalletIds.has(mappedWalletId)) continue;

      if (mode === 'merge' && existingFundIds.has(sf.id)) {
        await tx
          .update(sinkingFunds)
          .set({
            name: sf.name,
            icon: sf.icon,
            color: sf.color,
            targetAmountMinor: sf.targetAmountMinor,
            currentSavedMinor: sf.currentSavedMinor,
            targetDate: sf.targetDate,
            walletId: mappedWalletId,
            monthlyContributionMinor: sf.monthlyContributionMinor,
            isCompleted: sf.isCompleted,
            notes: sf.notes ?? null,
          })
          .where(and(eq(sinkingFunds.id, sf.id), eq(sinkingFunds.userId, userId)));
      } else {
        await tx.insert(sinkingFunds).values({
          id: generateId('fund'),
          userId,
          name: sf.name,
          icon: sf.icon,
          color: sf.color,
          targetAmountMinor: sf.targetAmountMinor,
          currentSavedMinor: sf.currentSavedMinor,
          targetDate: sf.targetDate,
          walletId: mappedWalletId,
          monthlyContributionMinor: sf.monthlyContributionMinor,
          isCompleted: sf.isCompleted,
          notes: sf.notes ?? null,
        });
      }
    }

    // Quick presets
    const existingPresets =
      mode === 'merge'
        ? await tx
            .select({ id: quickPresets.id })
            .from(quickPresets)
            .where(eq(quickPresets.userId, userId))
        : [];
    const existingPresetIds = new Set(existingPresets.map((p) => p.id));

    for (const qp of envelope.data.quickPresets) {
      const mappedWalletId = resolveWalletId(qp.walletId);
      if (!validWalletIds.has(mappedWalletId)) continue;
      const mappedToWalletId = qp.toWalletId ? resolveWalletId(qp.toWalletId) : null;
      const mappedCatId = qp.categoryId ? resolveCategoryId(qp.categoryId) : null;

      if (mode === 'merge' && existingPresetIds.has(qp.id)) {
        await tx
          .update(quickPresets)
          .set({
            label: qp.label,
            icon: qp.icon,
            type: qp.type,
            amountMinor: qp.amountMinor,
            walletId: mappedWalletId,
            toWalletId:
              mappedToWalletId && validWalletIds.has(mappedToWalletId)
                ? mappedToWalletId
                : null,
            categoryId:
              mappedCatId && validCategoryIds.has(mappedCatId) ? mappedCatId : null,
            merchant: qp.merchant ?? null,
            tags: qp.tags ?? [],
            defaultOrder: qp.defaultOrder,
          })
          .where(and(eq(quickPresets.id, qp.id), eq(quickPresets.userId, userId)));
      } else {
        await tx.insert(quickPresets).values({
          id: generateId('preset'),
          userId,
          label: qp.label,
          icon: qp.icon,
          type: qp.type,
          amountMinor: qp.amountMinor,
          walletId: mappedWalletId,
          toWalletId:
            mappedToWalletId && validWalletIds.has(mappedToWalletId)
              ? mappedToWalletId
              : null,
          categoryId:
            mappedCatId && validCategoryIds.has(mappedCatId) ? mappedCatId : null,
          merchant: qp.merchant ?? null,
          tags: qp.tags ?? [],
          defaultOrder: qp.defaultOrder,
        });
      }
    }

    // Smart defaults
    const currentSettings = await getUserSettings(tx, userId);
    const incomingSettings = envelope.data.smartDefaults;
    if (incomingSettings) {
      const mappedLastWalletId = resolveWalletId(incomingSettings.lastWalletId);
      const mappedLastToWalletId = incomingSettings.lastTransferToWalletId
        ? resolveWalletId(incomingSettings.lastTransferToWalletId)
        : undefined;

      const knownTags =
        mode === 'overwrite'
          ? incomingSettings.knownTags
          : Array.from(
              new Set([...currentSettings.knownTags, ...incomingSettings.knownTags]),
            );
      const recentMerchants =
        mode === 'overwrite'
          ? incomingSettings.recentMerchants
          : Array.from(
              new Set([
                ...currentSettings.recentMerchants,
                ...incomingSettings.recentMerchants,
              ]),
            ).slice(0, 16);

      await tx
        .insert(userSettings)
        .values({
          userId,
          lastWalletId: validWalletIds.has(mappedLastWalletId)
            ? mappedLastWalletId
            : currentSettings.lastWalletId,
          lastTransferToWalletId:
            mappedLastToWalletId && validWalletIds.has(mappedLastToWalletId)
              ? mappedLastToWalletId
              : (currentSettings.lastTransferToWalletId ?? null),
          recentMerchants,
          knownTags,
          monthlyBudgetMinor: incomingSettings.monthlyBudgetMinor,
        })
        .onConflictDoUpdate({
          target: userSettings.userId,
          set: {
            lastWalletId: validWalletIds.has(mappedLastWalletId)
              ? mappedLastWalletId
              : currentSettings.lastWalletId,
            lastTransferToWalletId:
              mappedLastToWalletId && validWalletIds.has(mappedLastToWalletId)
                ? mappedLastToWalletId
                : (currentSettings.lastTransferToWalletId ?? null),
            recentMerchants,
            knownTags,
            monthlyBudgetMinor: incomingSettings.monthlyBudgetMinor,
          },
        });
    }

    await recomputeUserWalletBalances(tx, userId);
  });

  return {
    success: true,
    importedCount: envelope.data.transactions.length,
  };
}

export async function resetDemoWorkspace(
  db: AppDb,
  userId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await clearUserWorkspaceData(tx, userId);
    await seedWorkspaceForUser(tx, userId, 'demo');
  });
}

export async function clearUserTransactions(
  db: AppDb,
  userId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(balanceReconciliations)
      .where(eq(balanceReconciliations.userId, userId));
    await tx.delete(transactions).where(eq(transactions.userId, userId));
    await tx
      .update(wallets)
      .set({ balanceMinor: sql`${wallets.openingBalanceMinor}` })
      .where(eq(wallets.userId, userId));
    await tx
      .update(categories)
      .set({ usageCount: 0 })
      .where(eq(categories.userId, userId));
  });
}
