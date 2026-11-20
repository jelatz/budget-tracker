import { Hono } from 'hono';

/**
 * Health check and minimum supported client version endpoints.
 */
export function createMetaRoutes(minSupportedVersion: string) {
  return new Hono()
    .get('/health', (c) => c.json({ status: 'ok' }))
    .get('/v1/meta', (c) => c.json({ minSupportedVersion }));
}
