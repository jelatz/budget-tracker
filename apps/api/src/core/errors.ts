import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export type AppErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

export function mapErrorToStatus(code: AppErrorCode): ContentfulStatusCode {
  switch (code) {
    case 'VALIDATION_ERROR':
      return 400;
    case 'UNAUTHORIZED':
      return 401;
    case 'FORBIDDEN':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'CONFLICT':
      return 409;
    case 'INTERNAL_ERROR':
      return 500;
  }
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: ContentfulStatusCode;
  readonly details?: unknown;

  constructor(code: AppErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = mapErrorToStatus(code);
    this.details = details;
  }
}

export function isPgErrorCode(error: unknown, targetCode: string): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const errObj = error as { code?: unknown; cause?: unknown };
  if (errObj.code === targetCode) {
    return true;
  }
  if (errObj.cause && typeof errObj.cause === 'object') {
    const causeObj = errObj.cause as { code?: unknown };
    if (causeObj.code === targetCode) {
      return true;
    }
  }
  return false;
}

/**
 * Global Hono error handler translating AppError and unexpected failures into consistent JSON responses.
 */
export function errorHandler(error: unknown, c: Context) {
  if (error instanceof AppError) {
    return c.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      },
      error.status,
    );
  }

  if (isPgErrorCode(error, '23505')) {
    return c.json(
      {
        error: {
          code: 'CONFLICT' as const,
          message: 'A conflicting record already exists',
        },
      },
      409,
    );
  }

  console.error('[API Error]', error);
  return c.json(
    {
      error: {
        code: 'INTERNAL_ERROR' as const,
        message: 'An unexpected server error occurred',
      },
    },
    500,
  );
}
