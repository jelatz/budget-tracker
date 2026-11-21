import type { AppErrorCode } from '@repo/contracts';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { logError } from './logger';

export type { AppErrorCode };

const STATUS_MAP: Record<AppErrorCode, ContentfulStatusCode> = {
  VALIDATION_ERROR: 400,
  CONFIRMATION_REQUIRED: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: ContentfulStatusCode;

  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_MAP[code];
  }
}

export function handleApiError(error: unknown, c: Context): Response {
  const rawRequestId: unknown = c.get('requestId');
  const requestId = typeof rawRequestId === 'string' ? rawRequestId : undefined;

  if (error instanceof AppError) {
    return c.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(requestId ? { requestId } : {}),
        },
      },
      error.status,
    );
  }

  logError('unhandled_api_error', {
    requestId,
    method: c.req.method,
    path: c.req.path,
    error:
      error instanceof Error
        ? { name: error.name, message: error.message }
        : String(error),
  });

  return c.json(
    {
      error: {
        code: 'INTERNAL_ERROR' satisfies AppErrorCode,
        message: 'An unexpected server error occurred.',
        ...(requestId ? { requestId } : {}),
      },
    },
    500,
  );
}
