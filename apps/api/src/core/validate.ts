import type { Context } from 'hono';
import type { z } from 'zod';
import { AppError } from './errors';

/**
 * Parses and validates JSON request body against a Zod schema.
 */
export async function parseJsonBody<T>(
  c: Context,
  schema: z.ZodType<T>,
): Promise<T> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch (error: unknown) {
    throw new AppError('VALIDATION_ERROR', 'Request body must be valid JSON');
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .slice(0, 5)
      .join('; ');
    throw new AppError('VALIDATION_ERROR', message || 'Invalid request payload', {
      issues: parsed.error.issues,
    });
  }

  return parsed.data;
}

/**
 * Parses and validates URL query parameters against a Zod schema.
 */
export function parseQuery<T>(c: Context, schema: z.ZodType<T>): T {
  const raw = c.req.query();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'query'}: ${issue.message}`)
      .slice(0, 5)
      .join('; ');
    throw new AppError('VALIDATION_ERROR', message || 'Invalid query parameters', {
      issues: parsed.error.issues,
    });
  }
  return parsed.data;
}
