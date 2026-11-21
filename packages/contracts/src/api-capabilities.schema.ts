import { z } from 'zod';
import { destructiveConfirmationSchema } from './confirmation';
import {
  applyReconciliationInputSchema,
  balanceReconciliationSchema,
} from './reconciliation.schema';
import {
  accountSchema,
  accountTypeSchema,
  createTransactionInputSchema,
  transactionSchema,
  transactionTypeSchema,
  upsertAccountInputSchema,
} from './transactions.schema';

// --- Accounts capability contracts ---

export const accountsListResponseSchema = z.object({
  accounts: z.array(accountSchema),
  revision: z.number().int().nonnegative(),
});
export type AccountsListResponse = z.infer<typeof accountsListResponseSchema>;

export const accountResponseSchema = z.object({
  account: accountSchema,
  revision: z.number().int().nonnegative(),
});
export type AccountResponse = z.infer<typeof accountResponseSchema>;

export const createAccountRequestSchema = upsertAccountInputSchema;
export type CreateAccountRequest = z.infer<typeof createAccountRequestSchema>;

export const updateAccountRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    accountType: accountTypeSchema.optional(),
    icon: z.string().min(1).optional(),
    color: z.string().min(1).optional(),
  })
  .refine(
    (val) =>
      val.name !== undefined ||
      val.accountType !== undefined ||
      val.icon !== undefined ||
      val.color !== undefined,
    { message: 'At least one account metadata field is required' },
  );
export type UpdateAccountRequest = z.infer<typeof updateAccountRequestSchema>;

export const deleteAccountRequestSchema = destructiveConfirmationSchema;
export type DeleteAccountRequest = z.infer<typeof deleteAccountRequestSchema>;

export const deleteAccountResponseSchema = z.object({
  deletedAccountId: z.string().min(1),
  revision: z.number().int().nonnegative(),
});
export type DeleteAccountResponse = z.infer<typeof deleteAccountResponseSchema>;

// --- Transactions capability contracts ---

export const listTransactionsQuerySchema = z.object({
  accountId: z.string().min(1).optional(),
  type: transactionTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;

export const transactionsListResponseSchema = z.object({
  transactions: z.array(transactionSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
});
export type TransactionsListResponse = z.infer<typeof transactionsListResponseSchema>;

export const transactionResponseSchema = z.object({
  transaction: transactionSchema,
  revision: z.number().int().nonnegative(),
});
export type TransactionResponse = z.infer<typeof transactionResponseSchema>;

export const createTransactionRequestSchema = createTransactionInputSchema;
export type CreateTransactionRequest = z.infer<typeof createTransactionRequestSchema>;

export const patchTransactionRequestSchema = createTransactionInputSchema;
export type PatchTransactionRequest = z.infer<typeof patchTransactionRequestSchema>;

export const deleteTransactionResponseSchema = z.object({
  deletedTransactionId: z.string().min(1),
  revision: z.number().int().nonnegative(),
});
export type DeleteTransactionResponse = z.infer<typeof deleteTransactionResponseSchema>;

export const clearTransactionsRequestSchema = destructiveConfirmationSchema;
export type ClearTransactionsRequest = z.infer<typeof clearTransactionsRequestSchema>;

export const clearTransactionsResponseSchema = z.object({
  clearedCount: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
});
export type ClearTransactionsResponse = z.infer<typeof clearTransactionsResponseSchema>;

// --- Reconcile capability contracts ---

export const reconciliationsListResponseSchema = z.object({
  reconciliations: z.array(balanceReconciliationSchema),
  revision: z.number().int().nonnegative(),
});
export type ReconciliationsListResponse = z.infer<
  typeof reconciliationsListResponseSchema
>;

export const reconciliationResponseSchema = z.object({
  reconciliation: balanceReconciliationSchema,
  revision: z.number().int().nonnegative(),
});
export type ReconciliationResponse = z.infer<typeof reconciliationResponseSchema>;

export const applyReconciliationRequestSchema = applyReconciliationInputSchema.extend({
  confirmAction: z.literal(true),
  confirmationToken: z.string().trim().min(1).max(160),
});
export type ApplyReconciliationRequest = z.infer<
  typeof applyReconciliationRequestSchema
>;

export const applyReconciliationResponseSchema = z.object({
  reconciliation: balanceReconciliationSchema,
  account: accountSchema,
  adjustmentTransaction: transactionSchema.optional(),
  revision: z.number().int().nonnegative(),
});
export type ApplyReconciliationResponse = z.infer<
  typeof applyReconciliationResponseSchema
>;
