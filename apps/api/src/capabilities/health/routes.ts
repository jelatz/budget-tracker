import { healthResponseSchema } from '@repo/contracts';
import { Hono } from 'hono';

export interface HealthRouteDeps {
  checkDb?: () => Promise<boolean>;
}

export function createHealthRoutes(deps?: HealthRouteDeps) {
  return new Hono().get('/health', async (c) => {
    const shouldCheckDb = c.req.query('check') === 'db';
    let database: 'ok' | 'error' | 'skipped' = 'skipped';

    if (shouldCheckDb) {
      const ok = deps?.checkDb ? await deps.checkDb() : false;
      database = ok ? 'ok' : 'error';
    }

    const status = database === 'error' ? 'degraded' : 'ok';
    const memoryRssMb =
      Math.round((process.memoryUsage().rss / (1024 * 1024)) * 100) / 100;

    const payload = healthResponseSchema.parse({
      status,
      service: 'budget-tracker-api',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      memoryRssMb,
      database,
    });

    return c.json(payload, status === 'ok' ? 200 : 503);
  });
}
