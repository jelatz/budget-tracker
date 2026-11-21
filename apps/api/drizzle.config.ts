import { defineConfig } from 'drizzle-kit';

const connectionUrl =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/budget_tracker';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/core/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: connectionUrl,
  },
});
