import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadEnv } from '../env';
import { createDbClient } from './client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, '../../../drizzle');

async function main() {
  const env = loadEnv();
  const migrationUrl = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
  const { db, pool } = createDbClient(migrationUrl);
  try {
    console.log(`Running Drizzle migrations from ${migrationsFolder}...`);
    await migrate(db, { migrationsFolder });
    console.log('Migrations completed successfully.');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
