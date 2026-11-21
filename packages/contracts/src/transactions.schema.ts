import { z } from 'zod';
import {
  amountMinorSchema,
  currencyCodeSchema,
  DEFAULT_CURRENCY,
  positiveAmountMinorSchema,
} from './money';

export const transactionTypeSchema = z.enum(['EXPENSE', 'INCOME', 'TRANSFER']);
export type TransactionType = z.infer<typeof transactionTypeSchema>;

export const categoryTypeSchema = z.enum(['EXPENSE', 'INCOME']);
export type CategoryType = z.infer<typeof categoryTypeSchema>;

export const accountTypeSchema = z.enum(['BANK', 'E_WALLET', 'CASH', 'CREDIT_CARD']);
export type AccountType = z.infer<typeof accountTypeSchema>;

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  BANK: 'Bank',
  E_WALLET: 'E-Wallet',
  CASH: 'Cash',
  CREDIT_CARD: 'Credit Card',
};

/**
 * Returns the human-readable Account Type tag label.
 */
export function getAccountTypeLabel(accountType: AccountType): string {
  return ACCOUNT_TYPE_LABELS[accountType] ?? 'Bank';
}

/**
 * Normalizes legacy account types (e.g. DEBIT / CREDIT) into the canonical 4 AccountType tags.
 */
export function normalizeLegacyAccountType(raw?: unknown): AccountType {
  if (raw === 'CREDIT' || raw === 'CREDIT_CARD') return 'CREDIT_CARD';
  if (raw === 'E_WALLET') return 'E_WALLET';
  if (raw === 'CASH') return 'CASH';
  return 'BANK';
}

export const accountSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  accountType: accountTypeSchema.default('BANK'),
  icon: z.string().min(1),
  color: z.string().min(1),
  currency: currencyCodeSchema,
  balanceMinor: amountMinorSchema,
});
export type Account = z.infer<typeof accountSchema>;

export const upsertAccountInputSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, 'Account name is required').max(40),
  accountType: accountTypeSchema.default('BANK'),
  icon: z.string().min(1).default('🏦'),
  color: z.string().min(1).default('#208AEF'),
  currency: currencyCodeSchema.default(DEFAULT_CURRENCY),
  balanceMinor: amountMinorSchema.default(0),
});
export type UpsertAccountInput = z.infer<typeof upsertAccountInputSchema>;

export const categorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: categoryTypeSchema,
  icon: z.string().min(1),
  color: z.string().min(1),
  usageCount: z.number().int().nonnegative().default(0),
  defaultOrder: z.number().int().nonnegative().default(0),
  isCustom: z.boolean().default(false),
});
export type Category = z.infer<typeof categorySchema>;

export const createCategoryInputSchema = z.object({
  name: z.string().trim().min(1).max(40),
  type: categoryTypeSchema,
  icon: z.string().min(1).default('🏷️'),
  color: z.string().min(1).default('#208AEF'),
});
export type CreateCategoryInput = z.infer<typeof createCategoryInputSchema>;

export const transactionSplitSchema = z.object({
  id: z.string().min(1),
  categoryId: z.string().min(1),
  amountMinor: positiveAmountMinorSchema,
  note: z.string().max(120).optional(),
});
export type TransactionSplit = z.infer<typeof transactionSplitSchema>;

export const baseCreateTransactionInputSchema = z.object({
  type: transactionTypeSchema,
  amountMinor: positiveAmountMinorSchema,
  currency: currencyCodeSchema.default(DEFAULT_CURRENCY),
  accountId: z.string().min(1),
  toAccountId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  splits: z.array(transactionSplitSchema).optional(),
  merchant: z.string().trim().max(80).optional(),
  tags: z.array(z.string().trim().min(1).max(32)).default([]),
  note: z.string().trim().max(280).optional(),
  receiptUri: z.string().trim().min(1).optional(),
  occurredAt: z.string().datetime(),
});

function refineTransactionRules(
  val: {
    type: TransactionType;
    amountMinor: number;
    accountId: string;
    toAccountId?: string;
    categoryId?: string;
    splits?: TransactionSplit[];
  },
  ctx: z.RefinementCtx,
) {
  if (val.type === 'TRANSFER') {
    if (!val.toAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Destination account is required for transfers',
        path: ['toAccountId'],
      });
    } else if (val.accountId === val.toAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Destination account must differ from source account',
        path: ['toAccountId'],
      });
    }

    if (val.splits && val.splits.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Transfers cannot have splits',
        path: ['splits'],
      });
    }

    if (val.categoryId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Transfers cannot have a category',
        path: ['categoryId'],
      });
    }
  } else if (val.type === 'EXPENSE' || val.type === 'INCOME') {
    if (val.splits && val.splits.length > 0) {
      if (val.splits.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Splits must contain at least 2 categories',
          path: ['splits'],
        });
      }
      const splitTotal = val.splits.reduce((acc, split) => acc + split.amountMinor, 0);
      if (splitTotal !== val.amountMinor) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Split amounts must equal total transaction amount',
          path: ['splits'],
        });
      }
    } else {
      if (!val.categoryId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Category is required',
          path: ['categoryId'],
        });
      }
    }
  }
}

export const createTransactionInputSchema = Object.assign(
  baseCreateTransactionInputSchema.superRefine(refineTransactionRules),
  {
    innerType: () => baseCreateTransactionInputSchema,
  },
);
export type CreateTransactionInput = z.infer<typeof baseCreateTransactionInputSchema>;

export const updateTransactionInputSchema = Object.assign(
  baseCreateTransactionInputSchema
    .extend({
      id: z.string().min(1),
    })
    .superRefine(refineTransactionRules),
  {
    innerType: () =>
      baseCreateTransactionInputSchema.extend({
        id: z.string().min(1),
      }),
  },
);
export type UpdateTransactionInput = z.infer<typeof updateTransactionInputSchema>;

export const transactionSchema = Object.assign(
  baseCreateTransactionInputSchema
    .extend({
      id: z.string().min(1),
      createdAt: z.string().datetime(),
    })
    .superRefine(refineTransactionRules),
  {
    innerType: () =>
      baseCreateTransactionInputSchema.extend({
        id: z.string().min(1),
        createdAt: z.string().datetime(),
      }),
  },
);
export type Transaction = z.infer<typeof transactionSchema>;

export const smartDefaultsSchema = z.object({
  lastAccountId: z.string().min(1),
  lastTransferToAccountId: z.string().min(1).optional(),
  recentMerchants: z.array(z.string()).default([]),
  knownTags: z.array(z.string()).default([]),
  monthlyBudgetMinor: positiveAmountMinorSchema.default(250000),
});
export type SmartDefaults = z.infer<typeof smartDefaultsSchema>;

export const DEFAULT_ACCOUNTS: Account[] = [
  {
    id: 'account-bank',
    name: 'Main Bank',
    accountType: 'BANK',
    icon: '🏦',
    color: '#208AEF',
    currency: DEFAULT_CURRENCY,
    balanceMinor: 245000,
  },
  {
    id: 'account-card',
    name: 'Credit Card',
    accountType: 'CREDIT_CARD',
    icon: '💳',
    color: '#8B5CF6',
    currency: DEFAULT_CURRENCY,
    balanceMinor: 0,
  },
  {
    id: 'account-cash',
    name: 'Cash',
    accountType: 'CASH',
    icon: '💵',
    color: '#10B981',
    currency: DEFAULT_CURRENCY,
    balanceMinor: 18000,
  },
  {
    id: 'account-savings',
    name: 'Savings',
    accountType: 'BANK',
    icon: '🐷',
    color: '#F59E0B',
    currency: DEFAULT_CURRENCY,
    balanceMinor: 850000,
  },
];

export const DEFAULT_CATEGORIES: Category[] = [
  // 8 Canonical Expense Categories
  {
    id: 'cat-home',
    name: 'Home',
    type: 'EXPENSE',
    icon: '🏠',
    color: '#14B8A6',
    usageCount: 0,
    defaultOrder: 0,
    isCustom: false,
  },
  {
    id: 'cat-daily-living',
    name: 'Daily Living',
    type: 'EXPENSE',
    icon: '🛒',
    color: '#10B981',
    usageCount: 0,
    defaultOrder: 1,
    isCustom: false,
  },
  {
    id: 'cat-transportation',
    name: 'Transportation',
    type: 'EXPENSE',
    icon: '🚕',
    color: '#3B82F6',
    usageCount: 0,
    defaultOrder: 2,
    isCustom: false,
  },
  {
    id: 'cat-entertainment',
    name: 'Entertainment',
    type: 'EXPENSE',
    icon: '🎬',
    color: '#6366F1',
    usageCount: 0,
    defaultOrder: 3,
    isCustom: false,
  },
  {
    id: 'cat-health',
    name: 'Health',
    type: 'EXPENSE',
    icon: '💊',
    color: '#EF4444',
    usageCount: 0,
    defaultOrder: 4,
    isCustom: false,
  },
  {
    id: 'cat-loans',
    name: 'Loans',
    type: 'EXPENSE',
    icon: '🏦',
    color: '#F97316',
    usageCount: 0,
    defaultOrder: 5,
    isCustom: false,
  },
  {
    id: 'cat-dues',
    name: 'Dues',
    type: 'EXPENSE',
    icon: '📅',
    color: '#EAB308',
    usageCount: 0,
    defaultOrder: 6,
    isCustom: false,
  },
  {
    id: 'cat-subscription',
    name: 'Subscription',
    type: 'EXPENSE',
    icon: '📱',
    color: '#8B5CF6',
    usageCount: 0,
    defaultOrder: 7,
    isCustom: false,
  },

  // 8 Income Categories
  {
    id: 'cat-salary',
    name: 'Salary',
    type: 'INCOME',
    icon: '💰',
    color: '#10B981',
    usageCount: 0,
    defaultOrder: 0,
    isCustom: false,
  },
  {
    id: 'cat-freelance',
    name: 'Freelance',
    type: 'INCOME',
    icon: '💻',
    color: '#3B82F6',
    usageCount: 0,
    defaultOrder: 1,
    isCustom: false,
  },
  {
    id: 'cat-bonus',
    name: 'Bonus',
    type: 'INCOME',
    icon: '🎉',
    color: '#F59E0B',
    usageCount: 0,
    defaultOrder: 2,
    isCustom: false,
  },
  {
    id: 'cat-investment',
    name: 'Investment',
    type: 'INCOME',
    icon: '📈',
    color: '#8B5CF6',
    usageCount: 0,
    defaultOrder: 3,
    isCustom: false,
  },
  {
    id: 'cat-gift',
    name: 'Gift',
    type: 'INCOME',
    icon: '🎁',
    color: '#EC4899',
    usageCount: 0,
    defaultOrder: 4,
    isCustom: false,
  },
  {
    id: 'cat-refund',
    name: 'Refund',
    type: 'INCOME',
    icon: '↩️',
    color: '#14B8A6',
    usageCount: 0,
    defaultOrder: 5,
    isCustom: false,
  },
  {
    id: 'cat-rental',
    name: 'Rental',
    type: 'INCOME',
    icon: '🏢',
    color: '#6366F1',
    usageCount: 0,
    defaultOrder: 6,
    isCustom: false,
  },
  {
    id: 'cat-other-income',
    name: 'Other Income',
    type: 'INCOME',
    icon: '➕',
    color: '#64748B',
    usageCount: 0,
    defaultOrder: 7,
    isCustom: false,
  },
];

export const LEGACY_EXPENSE_CATEGORY_MAP: Readonly<Record<string, string>> = {
  'cat-household': 'cat-home',
  'cat-housing': 'cat-home',
  'cat-groceries': 'cat-daily-living',
  'cat-dining': 'cat-daily-living',
  'cat-coffee': 'cat-daily-living',
  'cat-shopping': 'cat-daily-living',
  'cat-personal': 'cat-daily-living',
  'cat-transport': 'cat-transportation',
  'cat-travel': 'cat-transportation',
  'cat-debt': 'cat-loans',
  'cat-bills': 'cat-dues',
  'cat-utilities': 'cat-dues',
  'cat-subscriptions': 'cat-subscription',
};

/**
 * Maps legacy default expense category IDs onto the canonical 8 category IDs.
 * Preserves custom categories and already-canonical IDs unchanged.
 */
export function normalizeLegacyCategoryId(categoryId: string): string {
  return LEGACY_EXPENSE_CATEGORY_MAP[categoryId] ?? categoryId;
}

export const DEFAULT_TAGS: string[] = [
  'vacation',
  'reimbursable',
  'work',
  'shared',
  'recurring',
  'tax-deductible',
];

/**
 * Filters categories by type and sorts them primarily by usageCount descending,
 * breaking ties by defaultOrder ascending.
 */
export function rankCategoriesByFrequency(
  categories: readonly Category[],
  type: CategoryType,
): Category[] {
  return categories
    .filter((c) => c.type === type)
    .slice()
    .sort((a, b) => {
      if (b.usageCount !== a.usageCount) {
        return b.usageCount - a.usageCount;
      }
      return a.defaultOrder - b.defaultOrder;
    });
}

/**
 * Creates 6 realistic starter transactions relative to `now`,
 * validated against `transactionSchema`.
 */
export function createDefaultTransactions(now = new Date()): Transaction[] {
  const baseTime = now.getTime();
  const tx1OccurredAt = new Date(baseTime - 1 * 60 * 60 * 1000).toISOString();
  const tx2OccurredAt = new Date(baseTime - 4 * 60 * 60 * 1000).toISOString();
  const tx3OccurredAt = new Date(baseTime - 24 * 60 * 60 * 1000).toISOString();
  const tx4OccurredAt = new Date(baseTime - 2 * 24 * 60 * 60 * 1000).toISOString();
  const tx5OccurredAt = new Date(baseTime - 3 * 24 * 60 * 60 * 1000).toISOString();
  const tx6OccurredAt = new Date(baseTime - 4 * 24 * 60 * 60 * 1000).toISOString();

  const rawTransactions = [
    {
      id: 'tx-seed-1',
      type: 'INCOME' as const,
      amountMinor: 420000,
      currency: DEFAULT_CURRENCY,
      accountId: 'account-bank',
      categoryId: 'cat-salary',
      merchant: 'Acme Corp Payroll',
      tags: ['work'],
      note: 'Monthly salary deposit',
      occurredAt: tx1OccurredAt,
      createdAt: tx1OccurredAt,
    },
    {
      id: 'tx-seed-2',
      type: 'EXPENSE' as const,
      amountMinor: 12000,
      currency: DEFAULT_CURRENCY,
      accountId: 'account-card',
      splits: [
        {
          id: 'split-seed-1',
          categoryId: 'cat-daily-living',
          amountMinor: 8500,
          note: 'Weekly produce & pantry',
        },
        {
          id: 'split-seed-2',
          categoryId: 'cat-home',
          amountMinor: 3500,
          note: 'Cleaning supplies',
        },
      ],
      merchant: 'Whole Foods',
      tags: ['shared'],
      note: 'Weekly grocery & household run',
      occurredAt: tx2OccurredAt,
      createdAt: tx2OccurredAt,
    },
    {
      id: 'tx-seed-3',
      type: 'EXPENSE' as const,
      amountMinor: 34000,
      currency: DEFAULT_CURRENCY,
      accountId: 'account-card',
      categoryId: 'cat-transportation',
      merchant: 'Delta Airlines',
      tags: ['vacation', 'reimbursable'],
      note: 'Flight booking',
      receiptUri: 'local://receipt-seed-delta.jpg',
      occurredAt: tx3OccurredAt,
      createdAt: tx3OccurredAt,
    },
    {
      id: 'tx-seed-4',
      type: 'EXPENSE' as const,
      amountMinor: 675,
      currency: DEFAULT_CURRENCY,
      accountId: 'account-cash',
      categoryId: 'cat-daily-living',
      merchant: 'Starbucks',
      tags: ['work'],
      occurredAt: tx4OccurredAt,
      createdAt: tx4OccurredAt,
    },
    {
      id: 'tx-seed-5',
      type: 'EXPENSE' as const,
      amountMinor: 14520,
      currency: DEFAULT_CURRENCY,
      accountId: 'account-bank',
      categoryId: 'cat-dues',
      merchant: 'City Power & Light',
      tags: ['recurring', 'shared'],
      note: 'Electric utility bill',
      occurredAt: tx5OccurredAt,
      createdAt: tx5OccurredAt,
    },
    {
      id: 'tx-seed-6',
      type: 'TRANSFER' as const,
      amountMinor: 50000,
      currency: DEFAULT_CURRENCY,
      accountId: 'account-bank',
      toAccountId: 'account-savings',
      tags: ['recurring'],
      note: 'Automated savings transfer',
      occurredAt: tx6OccurredAt,
      createdAt: tx6OccurredAt,
    },
  ];

  return rawTransactions.map((tx) => transactionSchema.parse(tx));
}

export const DEFAULT_TRANSACTIONS: Transaction[] = createDefaultTransactions();
