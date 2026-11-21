import {
  clearTransactionsRequestSchema,
  clearTransactionsResponseSchema,
  createTransactionRequestSchema,
  deleteTransactionResponseSchema,
  listTransactionsQuerySchema,
  patchTransactionRequestSchema,
  transactionResponseSchema,
  transactionsListResponseSchema,
} from '@repo/contracts';
import { z } from 'zod';

export const transactionIdParamSchema = z.object({
  id: z.string().trim().min(1).max(120),
});

export {
  clearTransactionsRequestSchema,
  clearTransactionsResponseSchema,
  createTransactionRequestSchema,
  deleteTransactionResponseSchema,
  listTransactionsQuerySchema,
  patchTransactionRequestSchema,
  transactionResponseSchema,
  transactionsListResponseSchema,
};
