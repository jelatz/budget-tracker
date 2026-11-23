import type { IncomingMessage, ServerResponse } from 'node:http';
import { getRequestListener } from '@hono/node-server';
import { createApp, type AppType } from './app';
import { getEnv, parseAllowedCorsOrigins } from './core/env';

type NodeRequestListener = (
  incoming: IncomingMessage,
  outgoing: ServerResponse,
) => void | Promise<void>;

let cachedListener: NodeRequestListener | null = null;

/**
 * Restores the original request pathname when Vercel Build Output API routes
 * forward `/health` or `/v1/*` to `/api/index?__path=/...`.
 */
export function restoreVercelRequestUrl(rawUrl: string | undefined): string {
  if (!rawUrl) {
    return '/';
  }

  const parsed = new URL(rawUrl, 'http://localhost');
  const forwardedPath = parsed.searchParams.get('__path');
  if (!forwardedPath) {
    return rawUrl;
  }

  parsed.searchParams.delete('__path');
  const normalizedPath = forwardedPath.startsWith('/')
    ? forwardedPath
    : `/${forwardedPath}`;
  const remainingQuery = parsed.searchParams.toString();
  return remainingQuery.length > 0
    ? `${normalizedPath}?${remainingQuery}`
    : normalizedPath;
}

export function createVercelApp(): AppType {
  const env = getEnv();
  const allowedOrigins = parseAllowedCorsOrigins(env.CORS_ORIGINS, env.NODE_ENV);
  return createApp({
    allowedOrigins,
    getMinSupportedVersion: () => env.MIN_SUPPORTED_VERSION,
    allowDemoEndpoint: () => env.ALLOW_UNAUTHENTICATED_DEMO,
  });
}

export function resetVercelHandlerCache(): void {
  cachedListener = null;
}

export default function handler(
  req: IncomingMessage,
  res: ServerResponse,
): void | Promise<void> {
  req.url = restoreVercelRequestUrl(req.url);
  if (!cachedListener) {
    cachedListener = getRequestListener(createVercelApp().fetch);
  }
  return cachedListener(req, res);
}
