import { pathToFileURL } from 'node:url';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { closeDbPool } from './core/db/client';
import { getEnv, parseAllowedCorsOrigins } from './core/env';
import { logError, logInfo } from './core/logger';

export { createApp, type AppType } from './app';

export function startServer() {
  const env = getEnv();
  const allowedOrigins = parseAllowedCorsOrigins(env.CORS_ORIGINS, env.NODE_ENV);
  const app = createApp({
    allowedOrigins,
    getMinSupportedVersion: () => env.MIN_SUPPORTED_VERSION,
    allowDemoEndpoint: () => env.ALLOW_UNAUTHENTICATED_DEMO,
  });

  const server = serve(
    {
      fetch: app.fetch,
      hostname: env.HOST,
      port: env.PORT,
    },
    (info) => {
      const memoryRssMb =
        Math.round((process.memoryUsage().rss / (1024 * 1024)) * 100) / 100;
      logInfo('server_started', {
        service: 'budget-tracker-api',
        host: env.HOST,
        port: info.port,
        nodeEnv: env.NODE_ENV,
        allowedOriginsCount: allowedOrigins.length,
        memoryRssMb,
      });
    },
  );

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logInfo('server_shutting_down', { signal });

    const forceTimer = setTimeout(() => {
      logError('server_shutdown_timeout', { signal });
      process.exit(1);
    }, 10_000);
    forceTimer.unref();

    server.close(async (err) => {
      if (err) {
        logError('server_close_error', { message: err.message });
      }
      try {
        await closeDbPool();
      } catch (poolError: unknown) {
        logError('db_pool_close_error', {
          message:
            poolError instanceof Error ? poolError.message : String(poolError),
        });
      }
      clearTimeout(forceTimer);
      process.exit(err ? 1 : 0);
    });
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));

  return server;
}

const isEntrypoint =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  startServer();
}
