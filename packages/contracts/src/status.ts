import { z } from 'zod';

export const jobStatusSchema = z.enum([
  'QUEUED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const approvalStatusSchema = z.enum([
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'EXECUTED',
]);
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;

export const asyncJobRecordSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  status: jobStatusSchema,
  resultRefId: z.string().min(1).optional(),
  errorMessage: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AsyncJobRecord = z.infer<typeof asyncJobRecordSchema>;
