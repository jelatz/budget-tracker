import { serve } from '@hono/node-server';
import { createApp } from './app';
import { createDbClient } from './core/db/client';
import { loadEnv } from './core/env';

const env = loadEnv();
const { db, pool } = createDbClient(env.DATABASE_URL);

const app = createApp({
  db,
  minSupportedVersion: env.MIN_SUPPORTED_VERSION,
  corsOrigin: env.CORS_ORIGIN,
});

const server = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    console.log(`Budget Tracker API listening on http://localhost:${info.port}`);
  },
);

const shutdown = async () => {
  server.close();
  await pool.end();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
