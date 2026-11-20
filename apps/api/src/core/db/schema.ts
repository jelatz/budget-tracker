import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
);

export const userSettings = pgTable('user_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  lastWalletId: text('last_wallet_id'),
  lastTransferToWalletId: text('last_transfer_to_wallet_id'),
  recentMerchants: jsonb('recent_merchants').$type<string[]>().notNull().default([]),
  knownTags: jsonb('known_tags').$type<string[]>().notNull().default([]),
  monthlyBudgetMinor: bigint('monthly_budget_minor', { mode: 'number' })
    .notNull()
    .default(3000000),
});

export const wallets = pgTable(
  'wallets',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    systemKey: text('system_key'),
    name: text('name').notNull(),
    type: text('type').notNull().default('CHECKING'),
    icon: text('icon').notNull(),
    color: text('color').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('PHP'),
    openingBalanceMinor: bigint('opening_balance_minor', { mode: 'number' }).notNull().default(0),
    balanceMinor: bigint('balance_minor', { mode: 'number' }).notNull().default(0),
    includeInSafeToSpend: boolean('include_in_safe_to_spend'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('wallets_user_system_key_uidx').on(table.userId, table.systemKey),
    index('wallets_user_id_idx').on(table.userId),
  ],
);

export const categories = pgTable(
  'categories',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    systemKey: text('system_key'),
    name: text('name').notNull(),
    type: text('type').notNull(),
    icon: text('icon').notNull(),
    color: text('color').notNull(),
    usageCount: integer('usage_count').notNull().default(0),
    defaultOrder: integer('default_order').notNull().default(0),
    isCustom: boolean('is_custom').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('categories_user_system_key_uidx').on(table.userId, table.systemKey),
    index('categories_user_id_idx').on(table.userId),
  ],
);

export const transactions = pgTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('PHP'),
    walletId: text('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),
    toWalletId: text('to_wallet_id').references(() => wallets.id, {
      onDelete: 'set null',
    }),
    categoryId: text('category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),
    merchant: text('merchant'),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    note: text('note'),
    receiptUri: text('receipt_uri'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('transactions_user_occurred_at_idx').on(table.userId, table.occurredAt)],
);

export const transactionSplits = pgTable(
  'transaction_splits',
  {
    id: text('id').primaryKey(),
    transactionId: text('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    note: text('note'),
  },
  (table) => [index('transaction_splits_tx_id_idx').on(table.transactionId)],
);

export const categoryBudgets = pgTable(
  'category_budgets',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    periodMonth: varchar('period_month', { length: 7 }).notNull(),
    assignedMinor: bigint('assigned_minor', { mode: 'number' }).notNull(),
    rolloverEnabled: boolean('rollover_enabled').notNull().default(false),
    notes: text('notes'),
  },
  (table) => [
    uniqueIndex('category_budgets_user_cat_month_uidx').on(
      table.userId,
      table.categoryId,
      table.periodMonth,
    ),
  ],
);

export const recurringCommitments = pgTable(
  'recurring_commitments',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type').notNull().default('EXPENSE'),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('PHP'),
    walletId: text('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    frequency: text('frequency').notNull().default('MONTHLY'),
    dueDay: integer('due_day').notNull(),
    isAutoPaid: boolean('is_auto_paid').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    lastPaidPeriod: varchar('last_paid_period', { length: 7 }),
    notes: text('notes'),
  },
  (table) => [index('recurring_commitments_user_id_idx').on(table.userId)],
);

export const sinkingFunds = pgTable(
  'sinking_funds',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    icon: text('icon').notNull(),
    color: text('color').notNull(),
    targetAmountMinor: bigint('target_amount_minor', { mode: 'number' }).notNull(),
    currentSavedMinor: bigint('current_saved_minor', { mode: 'number' }).notNull().default(0),
    targetDate: text('target_date').notNull(),
    walletId: text('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),
    monthlyContributionMinor: bigint('monthly_contribution_minor', { mode: 'number' })
      .notNull()
      .default(0),
    isCompleted: boolean('is_completed').notNull().default(false),
    notes: text('notes'),
  },
  (table) => [index('sinking_funds_user_id_idx').on(table.userId)],
);

export const quickPresets = pgTable(
  'quick_presets',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    icon: text('icon').notNull(),
    type: text('type').notNull(),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    walletId: text('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),
    toWalletId: text('to_wallet_id').references(() => wallets.id, {
      onDelete: 'set null',
    }),
    categoryId: text('category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),
    merchant: text('merchant'),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    defaultOrder: integer('default_order').notNull().default(0),
  },
  (table) => [index('quick_presets_user_id_idx').on(table.userId)],
);

export const balanceReconciliations = pgTable(
  'balance_reconciliations',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    walletId: text('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),
    appBalanceMinor: bigint('app_balance_minor', { mode: 'number' }).notNull(),
    actualBalanceMinor: bigint('actual_balance_minor', { mode: 'number' }).notNull(),
    discrepancyMinor: bigint('discrepancy_minor', { mode: 'number' }).notNull(),
    reconciledAt: timestamp('reconciled_at', { withTimezone: true }).notNull().defaultNow(),
    adjustmentTransactionId: text('adjustment_transaction_id').references(
      () => transactions.id,
      { onDelete: 'set null' },
    ),
  },
  (table) => [index('balance_reconciliations_user_id_idx').on(table.userId)],
);
