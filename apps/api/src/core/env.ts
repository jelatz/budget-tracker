import { z } from 'zod';
import {
  parseEncryptionKeyMaterial,
  resetMoneyCipherCache,
} from './crypto/field-encryption';

const DEFAULT_DEV_CORS_ORIGINS = [
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  'http://localhost:19006',
  'http://127.0.0.1:19006',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
] as const;

const booleanStringSchema = z
  .enum(['true', 'false'])
  .default('false')
  .transform((val) => val === 'true');

function encryptionKeySchema(varName: string) {
  return z
    .string()
    .trim()
    .min(1, `${varName} is required`)
    .superRefine((val, ctx) => {
      try {
        parseEncryptionKeyMaterial(val, varName);
      } catch (error: unknown) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            error instanceof Error
              ? error.message
              : `${varName} must be a valid 32-byte hex or base64 key.`,
        });
      }
    });
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_URL_UNPOOLED: z.string().min(1).optional(),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
  DATA_ENCRYPTION_KEY: encryptionKeySchema('DATA_ENCRYPTION_KEY'),
  DATA_ENCRYPTION_KEY_PREVIOUS: encryptionKeySchema(
    'DATA_ENCRYPTION_KEY_PREVIOUS',
  ).optional(),
  MIN_SUPPORTED_VERSION: z.string().trim().min(1).default('1.0.0'),
  CORS_ORIGINS: z.string().default(''),
  ALLOW_UNAUTHENTICATED_DEMO: booleanStringSchema,
});

export type ApiEnv = z.infer<typeof envSchema>;

let cachedEnv: ApiEnv | null = null;

export function getEnv(): ApiEnv {
  if (cachedEnv) {
    return cachedEnv;
  }
  const defaultPoolMax = process.env.VERCEL === '1' ? '2' : '5';
  const previousKeyRaw = process.env.DATA_ENCRYPTION_KEY_PREVIOUS?.trim();
  const parsed = envSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV ?? 'development',
    HOST: process.env.HOST ?? '0.0.0.0',
    PORT: process.env.PORT ?? '3000',
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
    DB_POOL_MAX: process.env.DB_POOL_MAX ?? defaultPoolMax,
    DATA_ENCRYPTION_KEY: process.env.DATA_ENCRYPTION_KEY,
    DATA_ENCRYPTION_KEY_PREVIOUS: previousKeyRaw || undefined,
    MIN_SUPPORTED_VERSION: process.env.MIN_SUPPORTED_VERSION ?? '1.0.0',
    CORS_ORIGINS: process.env.CORS_ORIGINS ?? '',
    ALLOW_UNAUTHENTICATED_DEMO: process.env.ALLOW_UNAUTHENTICATED_DEMO ?? 'false',
  });
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid API environment configuration: ${details}`);
  }
  cachedEnv = parsed.data;
  return cachedEnv;
}

export function resetEnvCache(): void {
  cachedEnv = null;
  resetMoneyCipherCache();
}

export function getMinSupportedVersion(): string {
  return process.env.MIN_SUPPORTED_VERSION?.trim() || '1.0.0';
}

function normalizeOrigin(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export function getVercelDeploymentOrigins(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const candidates = [
    env.VERCEL_URL,
    env.VERCEL_BRANCH_URL,
    env.VERCEL_PROJECT_PRODUCTION_URL,
  ];
  const origins: string[] = [];
  for (const candidate of candidates) {
    const normalized = normalizeOrigin(candidate);
    if (normalized) {
      origins.push(normalized);
    }
  }
  return Array.from(new Set(origins));
}

export function isLocalDevOrigin(origin: string): boolean {
  return /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d+$/i.test(
    origin.trim().replace(/\/+$/, ''),
  );
}

export function parseAllowedCorsOrigins(
  rawOrigins: string | undefined = process.env.CORS_ORIGINS,
  nodeEnv: string | undefined = process.env.NODE_ENV,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const configured = (rawOrigins ?? '')
    .split(',')
    .map((item) => item.trim().replace(/\/+$/, ''))
    .filter((item) => item.length > 0);
  const vercelOrigins = getVercelDeploymentOrigins(env);

  if (nodeEnv === 'production') {
    return Array.from(new Set([...configured, ...vercelOrigins]));
  }

  return Array.from(
    new Set([...DEFAULT_DEV_CORS_ORIGINS, ...configured, ...vercelOrigins]),
  );
}
