import {
  accountResponseSchema,
  accountsListResponseSchema,
  createAccountRequestSchema,
  deleteAccountRequestSchema,
  deleteAccountResponseSchema,
  updateAccountRequestSchema,
} from '@repo/contracts';
import { z } from 'zod';

export const accountIdParamSchema = z.object({
  id: z.string().trim().min(1).max(120),
});

export {
  accountResponseSchema,
  accountsListResponseSchema,
  createAccountRequestSchema,
  deleteAccountRequestSchema,
  deleteAccountResponseSchema,
  updateAccountRequestSchema,
};
