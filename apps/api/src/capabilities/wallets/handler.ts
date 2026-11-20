import { and, asc, eq, or } from 'drizzle-orm';
import type { CreateWalletInput, UpdateWalletInput, Wallet } from '@repo/contracts';
import type { AppDb } from '../../core/db/client';
import {
  quickPresets,
  recurringCommitments,
  sinkingFunds,
  transactions,
  userSettings,
  wallets,
} from '../../core/db/schema';
import { AppError } from '../../core/errors';
import { assertOwnedWallet, generateId, mapWalletRow } from '../shared/tx-helpers';

export async function listWallets(db: AppDb, userId: string): Promise<Wallet[]> {
  const rows = await db
    .select()
    .from(wallets)
    .where(eq(wallets.userId, userId))
    .orderBy(asc(wallets.createdAt));

  return rows.map(mapWalletRow);
}

export async function createWallet(
  db: AppDb,
  userId: string,
  input: CreateWalletInput,
): Promise<Wallet> {
  const id = generateId('wallet');
  const openingBalanceMinor = input.openingBalanceMinor ?? input.balanceMinor ?? 0;
  const [inserted] = await db
    .insert(wallets)
    .values({
      id,
      userId,
      systemKey: null,
      name: input.name,
      type: input.type,
      icon: input.icon,
      color: input.color,
      currency: input.currency,
      openingBalanceMinor,
      balanceMinor: openingBalanceMinor,
      includeInSafeToSpend: input.includeInSafeToSpend ?? null,
    })
    .returning();

  return mapWalletRow(inserted);
}

export async function updateWallet(
  db: AppDb,
  userId: string,
  walletId: string,
  input: UpdateWalletInput,
): Promise<Wallet> {
  return db.transaction(async (tx) => {
    const existing = await assertOwnedWallet(tx, userId, walletId, 'Wallet', {
      forUpdate: true,
    });

    const nextOpening = input.openingBalanceMinor ?? existing.openingBalanceMinor;
    const openingDelta = nextOpening - existing.openingBalanceMinor;

    const [updated] = await tx
      .update(wallets)
      .set({
        name: input.name ?? existing.name,
        type: input.type ?? existing.type,
        icon: input.icon ?? existing.icon,
        color: input.color ?? existing.color,
        openingBalanceMinor: nextOpening,
        balanceMinor: existing.balanceMinor + openingDelta,
        includeInSafeToSpend:
          input.includeInSafeToSpend !== undefined
            ? input.includeInSafeToSpend
            : existing.includeInSafeToSpend,
      })
      .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)))
      .returning();

    return mapWalletRow(updated);
  });
}

export async function deleteWallet(
  db: AppDb,
  userId: string,
  walletId: string,
): Promise<void> {
  await assertOwnedWallet(db, userId, walletId);

  const allUserWallets = await db
    .select({ id: wallets.id })
    .from(wallets)
    .where(eq(wallets.userId, userId));

  if (allUserWallets.length <= 1) {
    throw new AppError('CONFLICT', 'Cannot delete your only wallet.');
  }

  const [txRef] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        or(eq(transactions.walletId, walletId), eq(transactions.toWalletId, walletId)),
      ),
    )
    .limit(1);

  if (txRef) {
    throw new AppError(
      'CONFLICT',
      'Cannot delete a wallet that has recorded transactions. Reassign or delete those transactions first.',
    );
  }

  const [commitmentRef] = await db
    .select({ id: recurringCommitments.id })
    .from(recurringCommitments)
    .where(
      and(
        eq(recurringCommitments.userId, userId),
        eq(recurringCommitments.walletId, walletId),
      ),
    )
    .limit(1);

  const [fundRef] = await db
    .select({ id: sinkingFunds.id })
    .from(sinkingFunds)
    .where(and(eq(sinkingFunds.userId, userId), eq(sinkingFunds.walletId, walletId)))
    .limit(1);

  const [presetRef] = await db
    .select({ id: quickPresets.id })
    .from(quickPresets)
    .where(
      and(
        eq(quickPresets.userId, userId),
        or(eq(quickPresets.walletId, walletId), eq(quickPresets.toWalletId, walletId)),
      ),
    )
    .limit(1);

  if (commitmentRef || fundRef || presetRef) {
    throw new AppError(
      'CONFLICT',
      'Cannot delete a wallet linked to recurring commitments, sinking funds, or quick presets.',
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(wallets)
      .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)));

    const remaining = allUserWallets.filter((w) => w.id !== walletId);
    const fallbackWalletId = remaining[0]?.id ?? null;
    const fallbackToWalletId = remaining[1]?.id ?? fallbackWalletId;

    const [settings] = await tx
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    if (
      settings &&
      (settings.lastWalletId === walletId || settings.lastTransferToWalletId === walletId)
    ) {
      await tx
        .update(userSettings)
        .set({
          lastWalletId:
            settings.lastWalletId === walletId ? fallbackWalletId : settings.lastWalletId,
          lastTransferToWalletId:
            settings.lastTransferToWalletId === walletId
              ? fallbackToWalletId
              : settings.lastTransferToWalletId,
        })
        .where(eq(userSettings.userId, userId));
    }
  });
}
