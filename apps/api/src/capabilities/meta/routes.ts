import { metaResponseSchema } from '@repo/contracts';
import { Hono } from 'hono';

export function createMetaRoutes(getMinSupportedVersion: () => string) {
  return new Hono().get('/v1/meta', (c) => {
    const payload = metaResponseSchema.parse({
      minSupportedVersion: getMinSupportedVersion(),
    });
    return c.json(payload);
  });
}
