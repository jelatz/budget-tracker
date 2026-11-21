import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { getEnv } from '../env';
import * as schema from './schema';

export type AppDatabase = NodePgDatabase<typeof schema>;

let cachedPool: Pool | null = null;
let cachedDb: AppDatabase | null = null;

export function getDb(): AppDatabase {
  if (cachedDb) {
    return cachedDb;
  }

  const env = getEnv();
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DB_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    allowExitOnIdle: true,
  });

  cachedPool = pool;
  cachedDb = drizzle(pool, { schema });
  return cachedDb;
}

export function getPool(): Pool | null {
  return cachedPool;
}

export async function checkDbConnection(): Promise<boolean> {
  try {
    getDb();
    if (!cachedPool) {
      return false;
    }
    await cachedPool.query('SELECT 1');
    return true;
  } catch (error: unknown) {
    return false;
  }
}

export async function closeDbPool(): Promise<void> {
  const pool = cachedPool;
  cachedPool = null;
  cachedDb = null;
  if (pool) {
    await pool.end();
  }
}
