import type { Context } from 'hono';
import type { z } from 'zod';
import { AppError } from './errors';

function formatZodIssue(error: z.ZodError): string {
  const firstIssue = error.issues[0];
  return firstIssue
    ? `${firstIssue.path.length > 0 ? `${firstIssue.path.join('.')}: ` : ''}${firstIssue.message}`
    : 'Validation failed.';
}

export async function parseJsonBody<T>(
  c: Context,
  schema: z.ZodType<T>,
): Promise<T> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch (error: unknown) {
    throw new AppError('VALIDATION_ERROR', 'Invalid JSON request body.');
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', formatZodIssue(parsed.error));
  }

  return parsed.data;
}

export function parseQueryParams<T>(c: Context, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(c.req.query());
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', formatZodIssue(parsed.error));
  }
  return parsed.data;
}
