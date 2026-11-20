import { eq } from 'drizzle-orm';
import type { SmartDefaults } from '@repo/contracts';
import type { AppDb } from '../../core/db/client';
import { userSettings } from '../../core/db/schema';
import { getUserSettings } from '../shared/tx-helpers';

export async function getSettings(
  db: AppDb,
  userId: string,
): Promise<SmartDefaults> {
  return getUserSettings(db, userId);
}

export async function updateMonthlyBudget(
  db: AppDb,
  userId: string,
  monthlyBudgetMinor: number,
): Promise<SmartDefaults> {
  const current = await getUserSettings(db, userId);

  await db
    .insert(userSettings)
    .values({
      userId,
      lastWalletId: current.lastWalletId,
      lastTransferToWalletId: current.lastTransferToWalletId ?? null,
      recentMerchants: current.recentMerchants,
      knownTags: current.knownTags,
      monthlyBudgetMinor,
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        monthlyBudgetMinor,
      },
    });

  return getUserSettings(db, userId);
}
