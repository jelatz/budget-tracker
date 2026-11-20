import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_URL_UNPOOLED: z.string().min(1).optional(),
  MIN_SUPPORTED_VERSION: z.string().min(1).default('1.0.0'),
  CORS_ORIGIN: z.string().min(1).default('*'),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validates and returns API runtime environment variables.
 * Throws immediately on missing or malformed config.
 */
export function loadEnv(): EnvConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join('.') || 'env'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid API environment configuration: ${details}`);
  }
  return parsed.data;
}
