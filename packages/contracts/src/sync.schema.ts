import { z } from 'zod';
import { destructiveConfirmationSchema } from './confirmation';
import { amountMinorSchema, positiveAmountMinorSchema } from './money';
import { incomeSourceSchema } from './income-plan.schema';
import { backupEnvelopeSchema } from './portability.schema';
import { periodMonthSchema, recurringCommitmentSchema } from './recurring.schema';
import {
  accountSchema,
  categorySchema,
  smartDefaultsSchema,
  transactionSchema,
  updateTransactionInputSchema,
} from './transactions.schema';

export const syncDataStateSchema = z.object({
  accounts: z.array(accountSchema),
  categories: z.array(categorySchema),
  transactions: z.array(transactionSchema),
  smartDefaults: smartDefaultsSchema,
  recurringCommitments: z.array(recurringCommitmentSchema),
  incomeSources: z.array(incomeSourceSchema).default([]),
});
export type SyncDataState = z.infer<typeof syncDataStateSchema>;

const baseMutationFields = {
  opId: z.string().min(1).max(120),
  clientTimestamp: z.string().datetime(),
};

export const syncMutationSchema = z.discriminatedUnion('type', [
  z.object({
    ...baseMutationFields,
    type: z.literal('account.upsert'),
    account: accountSchema,
  }),
  z.object({
    ...baseMutationFields,
    type: z.literal('account.updateMetadata'),
    account: accountSchema.omit({ balanceMinor: true }),
  }),
  z.object({
    ...baseMutationFields,
    type: z.literal('account.setBalance'),
    accountId: z.string().min(1),
    balanceMinor: amountMinorSchema,
  }),
  z.object({
    ...baseMutationFields,
    type: z.literal('account.delete'),
    id: z.string().min(1),
    confirmation: destructiveConfirmationSchema.optional(),
  }),
  z.object({
    ...baseMutationFields,
    type: z.literal('category.create'),
    category: categorySchema,
  }),
  z.object({
    ...baseMutationFields,
    type: z.literal('transaction.create'),
    transaction: transactionSchema,
  }),
  z.object({
    ...baseMutationFields,
    type: z.literal('transaction.createBatch'),
    transactions: z.array(transactionSchema).max(500),
  }),
  z.object({
    ...baseMutationFields,
    type: z.literal('transaction.update'),
    input: updateTransactionInputSchema,
  }),
  z.object({
    ...baseMutationFields,
    type: z.literal('transaction.delete'),
    id: z.string().min(1),
  }),
  z.object({
    ...baseMutationFields,
    type: z.literal('transactions.clearAll'),
    confirmation: destructiveConfirmationSchema.optional(),
  }),
  z.object({
    ...baseMutationFields,
    type: z.literal('budget.updateMonthly'),
    monthlyBudgetMinor: positiveAmountMinorSchema,
  }),
  z.object({
    ...baseMutationFields,
    type: z.literal('incomeSource.upsert'),
    source: incomeSourceSchema,
  }),
  z.object({
    ...baseMutationFields,
    type: z.literal('incomeSource.delete'),
    id: z.string().min(1),
  }),
  z.object({
    ...baseMutationFields,
    type: z.literal('incomeSource.logPayday'),
    sourceId: z.string().min(1),
    transactionId: z.string().min(1),
    amountMinor: positiveAmountMinorSchema,
    accountId: z.string().min(1).optional(),
    occurredAt: z.string().datetime(),
    note: z.string().trim().max(280).optional(),
  }),
  z.object({
    ...baseMutationFields,
    type: z.literal('commitment.upsert'),
    commitment: recurringCommitmentSchema,
  }),
  z.object({
    ...baseMutationFields,
    type: z.literal('commitment.delete'),
    id: z.string().min(1),
  }),
  z.object({
    ...baseMutationFields,
    type: z.literal('commitment.pay'),
    commitmentId: z.string().min(1),
    transactionId: z.string().min(1),
    paidAtIso: z.string().datetime(),
    periodMonth: periodMonthSchema.optional(),
    accountId: z.string().min(1).optional(),
    actualAmountMinor: positiveAmountMinorSchema.optional(),
    cyclesCount: z.number().int().min(1).max(120).optional(),
    isAdvancePayment: z.boolean().optional(),
  }),
  z.object({
    ...baseMutationFields,
    type: z.literal('commitment.unpay'),
    commitmentId: z.string().min(1),
  }),
  z.object({
    ...baseMutationFields,
    type: z.literal('creditCard.payBill'),
    creditCardAccountId: z.string().min(1),
    paymentAccountId: z.string().min(1),
    transferTransactionId: z.string().min(1),
    installmentTxPrefix: z.string().min(1).max(80),
    paidAtIso: z.string().datetime(),
    periodMonth: periodMonthSchema.optional(),
    amountOverrideMinor: positiveAmountMinorSchema.optional(),
    advanceMonths: z.number().int().min(1).max(120).optional(),
  }),
  z.object({
    ...baseMutationFields,
    type: z.literal('creditCard.unpayBill'),
    creditCardAccountId: z.string().min(1),
  }),
  z.object({
    ...baseMutationFields,
    type: z.literal('state.resetDemo'),
    referenceIso: z.string().datetime(),
    confirmation: destructiveConfirmationSchema.optional(),
  }),
  z.object({
    ...baseMutationFields,
    type: z.literal('backup.import'),
    envelope: backupEnvelopeSchema,
    mode: z.enum(['merge', 'overwrite']),
    confirmation: destructiveConfirmationSchema.optional(),
  }),
]);
export type SyncMutation = z.infer<typeof syncMutationSchema>;

export const syncPushRequestSchema = z
  .object({
    lastKnownRevision: z.number().int().nonnegative(),
    mutations: z.array(syncMutationSchema).max(500),
  })
  .superRefine((req, ctx) => {
    let backupImportCount = 0;
    let txCount = 0;
    for (const mutation of req.mutations) {
      if (mutation.type === 'backup.import') {
        backupImportCount += 1;
      } else if (mutation.type === 'transaction.create') {
        txCount += 1;
      } else if (mutation.type === 'transaction.createBatch') {
        txCount += mutation.transactions.length;
      }
    }
    if (backupImportCount > 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At most 2 backup.import mutations are allowed per sync push.',
        path: ['mutations'],
      });
    }
    if (txCount > 2000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At most 2000 transactions may be created in a single sync push.',
        path: ['mutations'],
      });
    }
  });
export type SyncPushRequest = z.infer<typeof syncPushRequestSchema>;

export const syncPullResponseSchema = z.object({
  unchanged: z.boolean(),
  revision: z.number().int().nonnegative(),
  serverTime: z.string().datetime(),
  state: syncDataStateSchema.optional(),
});
export type SyncPullResponse = z.infer<typeof syncPullResponseSchema>;

export const syncPushResponseSchema = z.object({
  revision: z.number().int().nonnegative(),
  serverTime: z.string().datetime(),
  appliedOpIds: z.array(z.string()),
  state: syncDataStateSchema,
});
export type SyncPushResponse = z.infer<typeof syncPushResponseSchema>;

export const metaResponseSchema = z.object({
  minSupportedVersion: z.string().min(1),
});
export type MetaResponse = z.infer<typeof metaResponseSchema>;
