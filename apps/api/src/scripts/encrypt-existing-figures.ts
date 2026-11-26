import { pathToFileURL } from 'node:url';
import { and, eq, type SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PgTable } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import {
  createMoneyCipher,
  isEncryptedMoneyValue,
  parseEncryptionKeyMaterial,
  parsePlaintextMinorString,
  type MoneyCipher,
  type MoneyFieldContext,
} from '../core/crypto/field-encryption';
import type { AppDatabase } from '../core/db/client';
import * as schema from '../core/db/schema';
import {
  accounts,
  incomeSources,
  recurringCommitments,
  transactions,
  userSettings,
} from '../core/db/schema';

export interface TableEncryptionSummary {
  table: string;
  rowsScanned: number;
  rowsUpdated: number;
  fieldsEncrypted: number;
  fieldsAlreadyEncrypted: number;
  fieldsRekeyed: number;
}

export interface EncryptFiguresOptions {
  dryRun?: boolean;
  rekey?: boolean;
}

interface FieldSpec<Row> {
  prop: keyof Row & string;
  column: string;
  nullable?: boolean;
}

interface TableMigrationSpec<Row extends { userId: string }> {
  tableName: string;
  table: PgTable;
  getRowId: (row: Row) => string;
  getWhere: (row: Row) => SQL | undefined;
  fields: readonly FieldSpec<Row>[];
}

function processMoneyField(
  rawValue: unknown,
  context: MoneyFieldContext,
  cipher: MoneyCipher,
  options: EncryptFiguresOptions,
  summary: TableEncryptionSummary,
  nullable = false,
): string | null {
  if (nullable && (rawValue === null || rawValue === undefined)) {
    return null;
  }

  if (typeof rawValue !== 'string') {
    throw new Error(
      `Expected string value for ${context.table}.${context.column} (row ${context.rowId}).`,
    );
  }

  if (isEncryptedMoneyValue(rawValue)) {
    const { value, usedPreviousKey } = cipher.decryptWithKeyInfo(
      rawValue,
      context,
    );
    if (options.rekey && usedPreviousKey) {
      const rekeyed = cipher.encrypt(value, context);
      if (cipher.decrypt(rekeyed, context) !== value) {
        throw new Error(
          `Round-trip verification failed while rekeying ${context.table}.${context.column}.`,
        );
      }
      summary.fieldsRekeyed += 1;
      return rekeyed;
    }

    summary.fieldsAlreadyEncrypted += 1;
    return null;
  }

  const numericValue = parsePlaintextMinorString(rawValue);
  const encrypted = cipher.encrypt(numericValue, context);
  if (cipher.decrypt(encrypted, context) !== numericValue) {
    throw new Error(
      `Round-trip verification failed while encrypting ${context.table}.${context.column}.`,
    );
  }
  summary.fieldsEncrypted += 1;
  return encrypted;
}

const TABLE_SPECS: readonly TableMigrationSpec<any>[] = [
  {
    tableName: 'user_settings',
    table: userSettings,
    getRowId: (row: typeof userSettings.$inferSelect) => row.userId,
    getWhere: (row: typeof userSettings.$inferSelect) =>
      eq(userSettings.userId, row.userId),
    fields: [{ prop: 'monthlyBudgetMinor', column: 'monthly_budget_minor' }],
  },
  {
    tableName: 'accounts',
    table: accounts,
    getRowId: (row: typeof accounts.$inferSelect) => row.id,
    getWhere: (row: typeof accounts.$inferSelect) =>
      and(eq(accounts.userId, row.userId), eq(accounts.id, row.id)),
    fields: [{ prop: 'balanceMinor', column: 'balance_minor' }],
  },
  {
    tableName: 'transactions',
    table: transactions,
    getRowId: (row: typeof transactions.$inferSelect) => row.id,
    getWhere: (row: typeof transactions.$inferSelect) =>
      and(eq(transactions.userId, row.userId), eq(transactions.id, row.id)),
    fields: [{ prop: 'amountMinor', column: 'amount_minor' }],
  },
  {
    tableName: 'recurring_commitments',
    table: recurringCommitments,
    getRowId: (row: typeof recurringCommitments.$inferSelect) => row.id,
    getWhere: (row: typeof recurringCommitments.$inferSelect) =>
      and(
        eq(recurringCommitments.userId, row.userId),
        eq(recurringCommitments.id, row.id),
      ),
    fields: [{ prop: 'amountMinor', column: 'amount_minor' }],
  },
  {
    tableName: 'income_sources',
    table: incomeSources,
    getRowId: (row: typeof incomeSources.$inferSelect) => row.id,
    getWhere: (row: typeof incomeSources.$inferSelect) =>
      and(eq(incomeSources.userId, row.userId), eq(incomeSources.id, row.id)),
    fields: [
      { prop: 'expectedMonthlyMinor', column: 'expected_monthly_minor' },
      {
        prop: 'typicalPayoutMinor',
        column: 'typical_payout_minor',
        nullable: true,
      },
    ],
  },
];

export async function encryptExistingFiguresInDb(
  db: AppDatabase,
  cipher: MoneyCipher,
  options: EncryptFiguresOptions = {},
): Promise<TableEncryptionSummary[]> {
  return db.transaction(async (tx) => {
    const summaries: TableEncryptionSummary[] = [];

    for (const spec of TABLE_SPECS) {
      const summary: TableEncryptionSummary = {
        table: spec.tableName,
        rowsScanned: 0,
        rowsUpdated: 0,
        fieldsEncrypted: 0,
        fieldsAlreadyEncrypted: 0,
        fieldsRekeyed: 0,
      };

      const rows = (await tx.select().from(spec.table)) as Array<
        Record<string, unknown> & { userId: string }
      >;
      summary.rowsScanned = rows.length;

      for (const row of rows) {
        const rowId = spec.getRowId(row);
        const patch: Record<string, string> = {};

        for (const field of spec.fields) {
          const nextValue = processMoneyField(
            row[field.prop],
            {
              userId: row.userId,
              table: spec.tableName,
              rowId,
              column: field.column,
            },
            cipher,
            options,
            summary,
            Boolean(field.nullable),
          );
          if (nextValue !== null) {
            patch[field.prop] = nextValue;
          }
        }

        if (Object.keys(patch).length > 0) {
          summary.rowsUpdated += 1;
          if (!options.dryRun) {
            await tx.update(spec.table).set(patch).where(spec.getWhere(row));
          }
        }
      }

      summaries.push(summary);
    }

    return summaries;
  });
}

async function runCli(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const rekey = args.has('--rekey');

  const connectionString =
    process.env.DATABASE_URL_UNPOOLED?.trim() ||
    process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL_UNPOOLED or DATABASE_URL is required to run db:encrypt-figures.',
    );
  }

  const rawPrimaryKey = process.env.DATA_ENCRYPTION_KEY?.trim();
  if (!rawPrimaryKey) {
    throw new Error('DATA_ENCRYPTION_KEY is required to run db:encrypt-figures.');
  }

  const primaryKey = parseEncryptionKeyMaterial(
    rawPrimaryKey,
    'DATA_ENCRYPTION_KEY',
  );
  const rawPreviousKey = process.env.DATA_ENCRYPTION_KEY_PREVIOUS?.trim();
  const previousKey = rawPreviousKey
    ? parseEncryptionKeyMaterial(rawPreviousKey, 'DATA_ENCRYPTION_KEY_PREVIOUS')
    : undefined;

  const cipher = createMoneyCipher({ primaryKey, previousKey });
  const pool = new Pool({
    connectionString,
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });

  try {
    const db = drizzle(pool, { schema });
    const summaries = await encryptExistingFiguresInDb(db, cipher, {
      dryRun,
      rekey,
    });
    console.log(
      JSON.stringify(
        {
          ok: true,
          dryRun,
          rekey,
          tables: summaries,
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

const isEntrypoint =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  runCli().catch((error: unknown) => {
    console.error(
      JSON.stringify({
        ok: false,
        message:
          error instanceof Error ? error.message : 'Backfill script failed.',
      }),
    );
    process.exit(1);
  });
}
