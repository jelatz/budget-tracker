import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import pg from 'pg';
import * as schema from './schema';

export type AppDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export function createDbClient(databaseUrl: string): {
  db: NodePgDatabase<typeof schema>;
  pool: pg.Pool;
} {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
  });
  const db = drizzle(pool, { schema });
  return { db, pool };
}
