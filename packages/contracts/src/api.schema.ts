import { z } from 'zod';
import { positiveAmountMinorSchema } from './money';
import {
  categoryBudgetSchema,
  categoryBudgetStatusSchema,
  periodMonthSchema,
} from './category-budget.schema';
import { backupEnvelopeSchema } from './portability.schema';
import {
  baseQuickPresetSchema,
  quickPresetSchema,
  refineQuickPresetRules,
} from './presets.schema';
import { balanceReconciliationSchema } from './reconciliation.schema';
import { recurringCommitmentSchema } from './recurring.schema';
import { sinkingFundSchema } from './sinking-funds.schema';
import {
  categorySchema,
  createTransactionInputSchema,
  transactionSchema,
  walletSchema,
} from './transactions.schema';

export const okResponseSchema = z.object({
  ok: z.literal(true),
});
export type OkResponse = z.infer<typeof okResponseSchema>;

export const metaResponseSchema = z.object({
  minSupportedVersion: z.string().min(1),
});
export type MetaResponse = z.infer<typeof metaResponseSchema>;

export const updateMonthlyBudgetInputSchema = z.object({
  monthlyBudgetMinor: positiveAmountMinorSchema,
});
export type UpdateMonthlyBudgetInput = z.infer<typeof updateMonthlyBudgetInputSchema>;

export const batchCreateTransactionsInputSchema = z.object({
  transactions: z.array(createTransactionInputSchema).min(1).max(500),
});
export type BatchCreateTransactionsInput = z.infer<typeof batchCreateTransactionsInputSchema>;

export const upsertCategoryBudgetInputSchema = categoryBudgetSchema
  .omit({ id: true })
  .extend({
    id: z.string().min(1).optional(),
  });
export type UpsertCategoryBudgetInput = z.infer<typeof upsertCategoryBudgetInputSchema>;

export const upsertRecurringCommitmentInputSchema = recurringCommitmentSchema
  .omit({ id: true })
  .extend({
    id: z.string().min(1).optional(),
  });
export type UpsertRecurringCommitmentInput = z.infer<
  typeof upsertRecurringCommitmentInputSchema
>;

export const settleRecurringCommitmentInputSchema = z.object({
  periodMonth: periodMonthSchema,
  recordTransaction: z.boolean(),
});
export type SettleRecurringCommitmentInput = z.infer<
  typeof settleRecurringCommitmentInputSchema
>;

export const settleRecurringCommitmentResponseSchema = z.object({
  commitment: recurringCommitmentSchema,
  transaction: transactionSchema.optional(),
});
export type SettleRecurringCommitmentResponse = z.infer<
  typeof settleRecurringCommitmentResponseSchema
>;

export const upsertSinkingFundInputSchema = sinkingFundSchema
  .omit({ id: true })
  .extend({
    id: z.string().min(1).optional(),
  });
export type UpsertSinkingFundInput = z.infer<typeof upsertSinkingFundInputSchema>;

export const contributeSinkingFundInputSchema = z.object({
  amountMinor: positiveAmountMinorSchema,
  sourceWalletId: z.string().min(1),
});
export type ContributeSinkingFundInput = z.infer<typeof contributeSinkingFundInputSchema>;

export const contributeSinkingFundResponseSchema = z.object({
  fund: sinkingFundSchema,
  transaction: transactionSchema.optional(),
});
export type ContributeSinkingFundResponse = z.infer<
  typeof contributeSinkingFundResponseSchema
>;

export const upsertQuickPresetInputSchema = baseQuickPresetSchema
  .omit({ id: true })
  .extend({
    id: z.string().min(1).optional(),
  })
  .superRefine(refineQuickPresetRules);
export type UpsertQuickPresetInput = z.infer<typeof upsertQuickPresetInputSchema>;

export const applyReconciliationResponseSchema = z.object({
  reconciliation: balanceReconciliationSchema,
  adjustmentTransaction: transactionSchema.optional(),
  wallet: walletSchema,
});
export type ApplyReconciliationResponse = z.infer<typeof applyReconciliationResponseSchema>;

export const importBackupInputSchema = z.object({
  envelope: backupEnvelopeSchema,
  mode: z.enum(['merge', 'overwrite']),
});
export type ImportBackupInput = z.infer<typeof importBackupInputSchema>;

export const importBackupResponseSchema = z.object({
  success: z.literal(true),
  importedCount: z.number().int().nonnegative(),
});
export type ImportBackupResponse = z.infer<typeof importBackupResponseSchema>;

export const walletsResponseSchema = z.array(walletSchema);
export const categoriesResponseSchema = z.array(categorySchema);
export const transactionsResponseSchema = z.array(transactionSchema);
export const categoryBudgetsStatusResponseSchema = z.array(categoryBudgetStatusSchema);
export const recurringCommitmentsResponseSchema = z.array(recurringCommitmentSchema);
export const sinkingFundsResponseSchema = z.array(sinkingFundSchema);
export const quickPresetsResponseSchema = z.array(quickPresetSchema);
export const reconciliationsResponseSchema = z.array(balanceReconciliationSchema);
