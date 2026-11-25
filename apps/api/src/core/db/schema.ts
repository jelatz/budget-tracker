import {
  bigint,
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  stateRevision: bigint('state_revision', { mode: 'number' }).notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
  lastAccountId: text('last_account_id').notNull(),
  lastTransferToAccountId: text('last_transfer_to_account_id'),
  recentMerchants: jsonb('recent_merchants').$type<string[]>().notNull(),
  knownTags: jsonb('known_tags').$type<string[]>().notNull(),
  monthlyBudgetMinor: bigint('monthly_budget_minor', { mode: 'number' }).notNull(),
});

export const accounts = pgTable(
  'accounts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    name: text('name').notNull(),
    accountType: text('account_type').notNull(),
    icon: text('icon').notNull(),
    color: text('color').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    balanceMinor: bigint('balance_minor', { mode: 'number' }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.id] })],
);

export const categories = pgTable(
  'categories',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    icon: text('icon').notNull(),
    color: text('color').notNull(),
    usageCount: integer('usage_count').notNull().default(0),
    defaultOrder: integer('default_order').notNull().default(0),
    isCustom: boolean('is_custom').notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.userId, table.id] })],
);

export const transactions = pgTable(
  'transactions',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    type: text('type').notNull(),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    accountId: text('account_id').notNull(),
    toAccountId: text('to_account_id'),
    categoryId: text('category_id'),
    incomeSourceId: text('income_source_id'),
    merchant: text('merchant'),
    tags: jsonb('tags').$type<string[]>().notNull(),
    note: text('note'),
    receiptUri: text('receipt_uri'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    index('transactions_user_occurred_idx').on(table.userId, table.occurredAt),
  ],
);

export const transactionSplits = pgTable(
  'transaction_splits',
  {
    userId: text('user_id').notNull(),
    transactionId: text('transaction_id').notNull(),
    id: text('id').notNull(),
    categoryId: text('category_id').notNull(),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    note: text('note'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.transactionId, table.id] }),
    foreignKey({
      columns: [table.userId, table.transactionId],
      foreignColumns: [transactions.userId, transactions.id],
    }).onDelete('cascade'),
  ],
);

export const categoryBudgets = pgTable(
  'category_budgets',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    categoryId: text('category_id').notNull(),
    periodMonth: varchar('period_month', { length: 7 }).notNull(),
    assignedMinor: bigint('assigned_minor', { mode: 'number' }).notNull(),
    rolloverEnabled: boolean('rollover_enabled').notNull().default(false),
    notes: text('notes'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.id] })],
);

export const recurringCommitments = pgTable(
  'recurring_commitments',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    name: text('name').notNull(),
    kind: text('kind').notNull().default('RECURRING'),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    accountId: text('account_id').notNull(),
    categoryId: text('category_id').notNull(),
    frequency: text('frequency').notNull().default('MONTHLY'),
    dueDay: integer('due_day').notNull(),
    dueLabel: text('due_label'),
    nextDueDate: text('next_due_date'),
    previousNextDueDate: text('previous_next_due_date'),
    isAutoPaid: boolean('is_auto_paid').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    totalInstallments: integer('total_installments'),
    paidInstallments: integer('paid_installments').notNull().default(0),
    lastPaidPeriod: varchar('last_paid_period', { length: 7 }),
    lastPaidTransactionId: text('last_paid_transaction_id'),
    notes: text('notes'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.id] })],
);

export const sinkingFunds = pgTable(
  'sinking_funds',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    name: text('name').notNull(),
    icon: text('icon').notNull(),
    color: text('color').notNull(),
    targetAmountMinor: bigint('target_amount_minor', { mode: 'number' }).notNull(),
    currentSavedMinor: bigint('current_saved_minor', { mode: 'number' }).notNull(),
    targetDate: text('target_date').notNull(),
    accountId: text('account_id').notNull(),
    monthlyContributionMinor: bigint('monthly_contribution_minor', {
      mode: 'number',
    }).notNull(),
    isCompleted: boolean('is_completed').notNull().default(false),
    notes: text('notes'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.id] })],
);

export const quickPresets = pgTable(
  'quick_presets',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    label: text('label').notNull(),
    icon: text('icon').notNull(),
    type: text('type').notNull(),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    accountId: text('account_id').notNull(),
    toAccountId: text('to_account_id'),
    categoryId: text('category_id'),
    merchant: text('merchant'),
    tags: jsonb('tags').$type<string[]>().notNull(),
    defaultOrder: integer('default_order').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.id] })],
);

export const balanceReconciliations = pgTable(
  'balance_reconciliations',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    accountId: text('account_id').notNull(),
    appBalanceMinor: bigint('app_balance_minor', { mode: 'number' }).notNull(),
    actualBalanceMinor: bigint('actual_balance_minor', { mode: 'number' }).notNull(),
    discrepancyMinor: bigint('discrepancy_minor', { mode: 'number' }).notNull(),
    reconciledAt: timestamp('reconciled_at', { withTimezone: true }).notNull(),
    adjustmentTransactionId: text('adjustment_transaction_id'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.id] })],
);

export const incomeSources = pgTable(
  'income_sources',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    name: text('name').notNull(),
    expectedMonthlyMinor: bigint('expected_monthly_minor', { mode: 'number' }).notNull(),
    typicalPayoutMinor: bigint('typical_payout_minor', { mode: 'number' }),
    currency: varchar('currency', { length: 3 }).notNull(),
    accountId: text('account_id').notNull(),
    categoryId: text('category_id').notNull(),
    paySchedule: text('pay_schedule').notNull().default('SEMI_MONTHLY'),
    payDaysLabel: text('pay_days_label'),
    color: text('color').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    notes: text('notes'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.id] })],
);

export const syncOperations = pgTable(
  'sync_operations',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    opId: text('op_id').notNull(),
    mutationType: text('mutation_type').notNull(),
    appliedRevision: bigint('applied_revision', { mode: 'number' }).notNull(),
    appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.opId] })],
);
