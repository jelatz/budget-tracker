import { and, desc, eq } from 'drizzle-orm';
import {
  balanceReconciliationSchema,
  computeReconciliationDelta,
  type ApplyReconciliationInput,
  type BalanceReconciliation,
  type Transaction,
  type Wallet,
} from '@repo/contracts';
import type { AppDb } from '../../core/db/client';
import {
  balanceReconciliations,
  categories,
  wallets,
} from '../../core/db/schema';
import { AppError } from '../../core/errors';
import {
  assertOwnedWallet,
  createTransactionInTx,
  generateId,
  mapWalletRow,
} from '../shared/tx-helpers';

export async function listReconciliations(
  db: AppDb,
  userId: string,
  walletId?: string,
): Promise<BalanceReconciliation[]> {
  const condition = walletId
    ? and(
        eq(balanceReconciliations.userId, userId),
        eq(balanceReconciliations.walletId, walletId),
      )
    : eq(balanceReconciliations.userId, userId);

  const rows = await db
    .select()
    .from(balanceReconciliations)
    .where(condition)
    .orderBy(desc(balanceReconciliations.reconciledAt));

  return rows.map((row) =>
    balanceReconciliationSchema.parse({
      id: row.id,
      walletId: row.walletId,
      appBalanceMinor: row.appBalanceMinor,
      actualBalanceMinor: row.actualBalanceMinor,
      discrepancyMinor: row.discrepancyMinor,
      reconciledAt: row.reconciledAt.toISOString(),
      ...(row.adjustmentTransactionId !== null
        ? { adjustmentTransactionId: row.adjustmentTransactionId }
        : {}),
    }),
  );
}

export async function applyReconciliation(
  db: AppDb,
  userId: string,
  input: ApplyReconciliationInput,
): Promise<{
  reconciliation: BalanceReconciliation;
  adjustmentTransaction?: Transaction;
  wallet: Wallet;
}> {
  return db.transaction(async (tx) => {
    const existingWallet = await assertOwnedWallet(
      tx,
      userId,
      input.walletId,
      'Wallet',
      { forUpdate: true },
    );
    const delta = computeReconciliationDelta(
      existingWallet.balanceMinor,
      input.actualBalanceMinor,
    );

    let adjustmentTransaction: Transaction | undefined;
    let updatedWalletRow = existingWallet;

    if (input.createAdjustment && delta.needsAdjustment) {
      const userCats = await tx
        .select()
        .from(categories)
        .where(eq(categories.userId, userId));

      if (delta.adjustmentType === 'INCOME') {
        const incomeCat =
          userCats.find((c) => c.systemKey === 'cat-other-income') ??
          userCats.find((c) => c.type === 'INCOME');
        if (!incomeCat) {
          throw new AppError('NOT_FOUND', 'No income category available for adjustment');
        }
        adjustmentTransaction = await createTransactionInTx(
          tx,
          userId,
          {
            type: 'INCOME',
            amountMinor: delta.adjustmentAmountMinor,
            currency: existingWallet.currency,
            walletId: existingWallet.id,
            categoryId: incomeCat.id,
            merchant: 'Balance Adjustment',
            note: input.notes || 'Reconciliation adjustment',
            tags: ['reconciliation'],
            occurredAt: new Date().toISOString(),
          },
          { updateLastWallets: false, refreshSettings: false },
        );
      } else if (delta.adjustmentType === 'EXPENSE') {
        const expenseCat =
          userCats.find((c) => c.systemKey === 'cat-adjustment') ??
          userCats.find((c) => c.systemKey === 'cat-bills') ??
          userCats.find((c) => c.type === 'EXPENSE');
        if (!expenseCat) {
          throw new AppError('NOT_FOUND', 'No expense category available for adjustment');
        }
        adjustmentTransaction = await createTransactionInTx(
          tx,
          userId,
          {
            type: 'EXPENSE',
            amountMinor: delta.adjustmentAmountMinor,
            currency: existingWallet.currency,
            walletId: existingWallet.id,
            categoryId: expenseCat.id,
            merchant: 'Balance Adjustment',
            note: input.notes || 'Reconciliation adjustment',
            tags: ['reconciliation'],
            occurredAt: new Date().toISOString(),
          },
          { updateLastWallets: false, refreshSettings: false },
        );
      }

      updatedWalletRow = await assertOwnedWallet(tx, userId, existingWallet.id);
    } else if (delta.needsAdjustment) {
      const [shiftedWalletRow] = await tx
        .update(wallets)
        .set({
          openingBalanceMinor:
            existingWallet.openingBalanceMinor + delta.discrepancyMinor,
          balanceMinor: input.actualBalanceMinor,
        })
        .where(and(eq(wallets.id, existingWallet.id), eq(wallets.userId, userId)))
        .returning();
      updatedWalletRow = shiftedWalletRow;
    }

    const recId = generateId('rec');
    const reconciledAt = new Date();

    await tx.insert(balanceReconciliations).values({
      id: recId,
      userId,
      walletId: existingWallet.id,
      appBalanceMinor: existingWallet.balanceMinor,
      actualBalanceMinor: input.actualBalanceMinor,
      discrepancyMinor: delta.discrepancyMinor,
      reconciledAt,
      adjustmentTransactionId: adjustmentTransaction?.id ?? null,
    });

    const reconciliation = balanceReconciliationSchema.parse({
      id: recId,
      walletId: existingWallet.id,
      appBalanceMinor: existingWallet.balanceMinor,
      actualBalanceMinor: input.actualBalanceMinor,
      discrepancyMinor: delta.discrepancyMinor,
      reconciledAt: reconciledAt.toISOString(),
      ...(adjustmentTransaction
        ? { adjustmentTransactionId: adjustmentTransaction.id }
        : {}),
    });

    return {
      reconciliation,
      adjustmentTransaction,
      wallet: mapWalletRow(updatedWalletRow),
    };
  });
}
