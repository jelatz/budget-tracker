import { z } from 'zod';
import { amountMinorSchema } from './money';

export const balanceReconciliationSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  appBalanceMinor: amountMinorSchema,
  actualBalanceMinor: amountMinorSchema,
  discrepancyMinor: amountMinorSchema,
  reconciledAt: z.string().datetime(),
  adjustmentTransactionId: z.string().min(1).optional(),
});
export type BalanceReconciliation = z.infer<typeof balanceReconciliationSchema>;

export const applyReconciliationInputSchema = z.object({
  accountId: z.string().min(1),
  actualBalanceMinor: amountMinorSchema,
  createAdjustment: z.boolean().default(true),
  notes: z.string().trim().max(280).optional(),
});
export type ApplyReconciliationInput = z.infer<typeof applyReconciliationInputSchema>;

export type ReconciliationAdjustmentType = 'INCOME' | 'EXPENSE' | 'NONE';

export interface ReconciliationDeltaResult {
  discrepancyMinor: number;
  needsAdjustment: boolean;
  adjustmentType: ReconciliationAdjustmentType;
  adjustmentAmountMinor: number;
}

/**
 * Computes balance reconciliation discrepancy (actual - app) and determines
 * the necessary balancing transaction polarity and magnitude.
 *
 * - If actual > app: app is missing funds, so an INCOME adjustment is needed (+).
 * - If actual < app: app has excess funds, so an EXPENSE adjustment is needed (-).
 * - If actual === app: balances match, no adjustment needed.
 */
export function computeReconciliationDelta(
  appBalanceMinor: number,
  actualBalanceMinor: number,
): ReconciliationDeltaResult {
  const discrepancyMinor = actualBalanceMinor - appBalanceMinor;

  if (discrepancyMinor === 0) {
    return {
      discrepancyMinor: 0,
      needsAdjustment: false,
      adjustmentType: 'NONE',
      adjustmentAmountMinor: 0,
    };
  }

  if (discrepancyMinor > 0) {
    return {
      discrepancyMinor,
      needsAdjustment: true,
      adjustmentType: 'INCOME',
      adjustmentAmountMinor: discrepancyMinor,
    };
  }

  return {
    discrepancyMinor,
    needsAdjustment: true,
    adjustmentType: 'EXPENSE',
    adjustmentAmountMinor: Math.abs(discrepancyMinor),
  };
}
