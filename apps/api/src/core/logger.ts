import { randomUUID } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';

export type LogLevel = 'info' | 'warn' | 'error';

export interface RequestLogVariables {
  requestId: string;
}

function writeLog(
  level: LogLevel,
  event: string,
  fields?: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV === 'test' && level !== 'error') {
    return;
  }
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  };
  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function logInfo(event: string, fields?: Record<string, unknown>): void {
  writeLog('info', event, fields);
}

export function logWarn(event: string, fields?: Record<string, unknown>): void {
  writeLog('warn', event, fields);
}

export function logError(event: string, fields?: Record<string, unknown>): void {
  writeLog('error', event, fields);
}

export function createRequestLoggerMiddleware(): MiddlewareHandler<{
  Variables: RequestLogVariables;
}> {
  return async (c, next) => {
    const incomingId = c.req.header('x-request-id')?.trim();
    const requestId =
      incomingId && incomingId.length <= 128 ? incomingId : randomUUID();
    c.set('requestId', requestId);
    c.header('x-request-id', requestId);

    const startNs = process.hrtime.bigint();
    try {
      await next();
    } finally {
      const durationMs = Number(process.hrtime.bigint() - startNs) / 1_000_000;
      const status = c.res.status;
      const level: LogLevel =
        status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
      writeLog(level, 'http_request', {
        requestId,
        method: c.req.method,
        path: c.req.path,
        status,
        durationMs: Math.round(durationMs * 100) / 100,
      });
    }
  };
}
