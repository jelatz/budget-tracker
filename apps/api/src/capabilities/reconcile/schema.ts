import {
  applyReconciliationRequestSchema,
  applyReconciliationResponseSchema,
  reconciliationResponseSchema,
  reconciliationsListResponseSchema,
} from '@repo/contracts';
import { z } from 'zod';

export const reconciliationIdParamSchema = z.object({
  id: z.string().trim().min(1).max(120),
});

export {
  applyReconciliationRequestSchema,
  applyReconciliationResponseSchema,
  reconciliationResponseSchema,
  reconciliationsListResponseSchema,
};
