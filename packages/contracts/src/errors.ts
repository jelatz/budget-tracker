import { z } from 'zod';

export const appErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'CONFIRMATION_REQUIRED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
]);
export type AppErrorCode = z.infer<typeof appErrorCodeSchema>;

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: appErrorCodeSchema,
    message: z.string().min(1),
    requestId: z.string().min(1).optional(),
  }),
});
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
