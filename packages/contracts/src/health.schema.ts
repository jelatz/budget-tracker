import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  service: z.string().min(1),
  timestamp: z.string().datetime(),
  uptimeSeconds: z.number().nonnegative(),
  memoryRssMb: z.number().nonnegative(),
  database: z.enum(['ok', 'error', 'skipped']),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
