import {
  bigint,
  boolean,
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
  monthlyBudgetMinor: text('monthly_budget_minor').notNull(),
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
    balanceMinor: text('balance_minor').notNull(),
    creditLimitMinor: text('credit_limit_minor'),
    monthlyPaymentTargetMinor: text('monthly_payment_target_minor'),
    statementDay: integer('statement_day'),
    dueDay: integer('due_day'),
    dueWeekday: integer('due_weekday'),
    dueWeekdayOrdinal: integer('due_weekday_ordinal'),
    dueStartDate: text('due_start_date'),
    paidThroughPeriod: varchar('paid_through_period', { length: 7 }),
    previousPaidThroughPeriod: varchar('previous_paid_through_period', {
      length: 7,
    }),
    lastPaymentTransactionId: text('last_payment_transaction_id'),
    lastPaymentInstallmentTxPrefix: text('last_payment_installment_tx_prefix'),
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
    amountMinor: text('amount_minor').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    accountId: text('account_id').notNull(),
    toAccountId: text('to_account_id'),
    categoryId: text('category_id'),
    incomeSourceId: text('income_source_id'),
    commitmentId: text('commitment_id'),
    merchant: text('merchant'),
    note: text('note'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    index('transactions_user_occurred_idx').on(table.userId, table.occurredAt),
  ],
);

export const recurringCommitments = pgTable(
  'recurring_commitments',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    name: text('name').notNull(),
    kind: text('kind').notNull().default('BILL'),
    amountMinor: text('amount_minor').notNull(),
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
    previousLastPaidPeriod: varchar('previous_last_paid_period', { length: 7 }),
    lastPaidCycles: integer('last_paid_cycles'),
    lastPaidTransactionId: text('last_paid_transaction_id'),
    notes: text('notes'),
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
    expectedMonthlyMinor: text('expected_monthly_minor').notNull(),
    typicalPayoutMinor: text('typical_payout_minor'),
    currency: varchar('currency', { length: 3 }).notNull(),
    accountId: text('account_id').notNull(),
    categoryId: text('category_id').notNull(),
    paySchedule: text('pay_schedule').notNull().default('SEMI_MONTHLY'),
    payDays: jsonb('pay_days').$type<[number, number]>(),
    weekday: integer('weekday'),
    weekdayOrdinals: jsonb('weekday_ordinals').$type<[number, number]>(),
    monthlyPayDay: integer('monthly_pay_day'),
    anchorDate: text('anchor_date'),
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
