import { z } from 'zod';
import { amountMinorSchema, currencyCodeSchema, positiveAmountMinorSchema } from './money';

export const transactionTypeSchema = z.enum(['EXPENSE', 'INCOME', 'TRANSFER']);
export type TransactionType = z.infer<typeof transactionTypeSchema>;

export const categoryTypeSchema = z.enum(['EXPENSE', 'INCOME']);
export type CategoryType = z.infer<typeof categoryTypeSchema>;

export const walletTypeSchema = z.enum([
  'CHECKING',
  'CASH',
  'EWALLET',
  'SAVINGS',
  'CREDIT_CARD',
]);
export type WalletType = z.infer<typeof walletTypeSchema>;

export const walletSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: walletTypeSchema.default('CHECKING'),
  icon: z.string().min(1),
  color: z.string().min(1),
  currency: currencyCodeSchema,
  openingBalanceMinor: amountMinorSchema.optional(),
  balanceMinor: amountMinorSchema,
  includeInSafeToSpend: z.boolean().optional(),
});
export type Wallet = z.infer<typeof walletSchema>;

/**
 * Determines whether a wallet contributes liquid cash to Safe-to-Spend.
 * Honors an explicit per-wallet override, otherwise defaults to CHECKING, CASH, and EWALLET.
 */
export function isWalletLiquidForSafeToSpend(wallet: Wallet): boolean {
  if (typeof wallet.includeInSafeToSpend === 'boolean') {
    return wallet.includeInSafeToSpend;
  }
  return wallet.type === 'CHECKING' || wallet.type === 'CASH' || wallet.type === 'EWALLET';
}

export const createWalletInputSchema = z.object({
  name: z.string().trim().min(1).max(40),
  type: walletTypeSchema.default('CHECKING'),
  icon: z.string().min(1).default('🏦'),
  color: z.string().min(1).default('#208AEF'),
  currency: currencyCodeSchema.default('PHP'),
  openingBalanceMinor: amountMinorSchema.optional(),
  balanceMinor: amountMinorSchema.default(0),
  includeInSafeToSpend: z.boolean().optional(),
});
export type CreateWalletInput = z.infer<typeof createWalletInputSchema>;

export const updateWalletInputSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  type: walletTypeSchema.optional(),
  icon: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
  openingBalanceMinor: amountMinorSchema.optional(),
  includeInSafeToSpend: z.boolean().nullable().optional(),
});
export type UpdateWalletInput = z.infer<typeof updateWalletInputSchema>;

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
  currency: currencyCodeSchema.default('PHP'),
  walletId: z.string().min(1),
  toWalletId: z.string().min(1).optional(),
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
    walletId: string;
    toWalletId?: string;
    categoryId?: string;
    splits?: TransactionSplit[];
  },
  ctx: z.RefinementCtx,
) {
  if (val.type === 'TRANSFER') {
    if (!val.toWalletId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Destination wallet is required for transfers',
        path: ['toWalletId'],
      });
    } else if (val.walletId === val.toWalletId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Destination wallet must differ from source wallet',
        path: ['toWalletId'],
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

export const updateTransactionInputSchema = createTransactionInputSchema;
export type UpdateTransactionInput = CreateTransactionInput;

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
  lastWalletId: z.string().min(1),
  lastTransferToWalletId: z.string().min(1).optional(),
  recentMerchants: z.array(z.string()).default([]),
  knownTags: z.array(z.string()).default([]),
  monthlyBudgetMinor: positiveAmountMinorSchema.default(3000000),
});
export type SmartDefaults = z.infer<typeof smartDefaultsSchema>;

export const DEFAULT_WALLETS: Wallet[] = [
  {
    id: 'wallet-checking',
    name: 'Checking',
    type: 'CHECKING',
    icon: '🏦',
    color: '#208AEF',
    currency: 'PHP',
    openingBalanceMinor: 450000,
    balanceMinor: 4500000,
  },
  {
    id: 'wallet-card',
    name: 'Credit Card',
    type: 'CREDIT_CARD',
    icon: '💳',
    color: '#8B5CF6',
    currency: 'PHP',
    openingBalanceMinor: 1300000,
    balanceMinor: 0,
  },
  {
    id: 'wallet-cash',
    name: 'Cash',
    type: 'CASH',
    icon: '💵',
    color: '#10B981',
    currency: 'PHP',
    openingBalanceMinor: 368000,
    balanceMinor: 350000,
  },
  {
    id: 'wallet-savings',
    name: 'Savings',
    type: 'SAVINGS',
    icon: '🐷',
    color: '#F59E0B',
    currency: 'PHP',
    openingBalanceMinor: 11000000,
    balanceMinor: 12000000,
  },
];

export const DEFAULT_CATEGORIES: Category[] = [
  // 13 Expense Categories
  {
    id: 'cat-groceries',
    name: 'Groceries',
    type: 'EXPENSE',
    icon: '🛒',
    color: '#10B981',
    usageCount: 0,
    defaultOrder: 0,
    isCustom: false,
  },
  {
    id: 'cat-dining',
    name: 'Dining Out',
    type: 'EXPENSE',
    icon: '🍽️',
    color: '#F97316',
    usageCount: 0,
    defaultOrder: 1,
    isCustom: false,
  },
  {
    id: 'cat-coffee',
    name: 'Coffee & Drinks',
    type: 'EXPENSE',
    icon: '☕',
    color: '#A855F7',
    usageCount: 0,
    defaultOrder: 2,
    isCustom: false,
  },
  {
    id: 'cat-transport',
    name: 'Transport',
    type: 'EXPENSE',
    icon: '🚕',
    color: '#3B82F6',
    usageCount: 0,
    defaultOrder: 3,
    isCustom: false,
  },
  {
    id: 'cat-household',
    name: 'Household',
    type: 'EXPENSE',
    icon: '🏠',
    color: '#14B8A6',
    usageCount: 0,
    defaultOrder: 4,
    isCustom: false,
  },
  {
    id: 'cat-shopping',
    name: 'Shopping',
    type: 'EXPENSE',
    icon: '🛍️',
    color: '#EC4899',
    usageCount: 0,
    defaultOrder: 5,
    isCustom: false,
  },
  {
    id: 'cat-bills',
    name: 'Bills & Utilities',
    type: 'EXPENSE',
    icon: '⚡',
    color: '#EAB308',
    usageCount: 0,
    defaultOrder: 6,
    isCustom: false,
  },
  {
    id: 'cat-entertainment',
    name: 'Entertainment',
    type: 'EXPENSE',
    icon: '🎬',
    color: '#6366F1',
    usageCount: 0,
    defaultOrder: 7,
    isCustom: false,
  },
  {
    id: 'cat-health',
    name: 'Health & Fitness',
    type: 'EXPENSE',
    icon: '💊',
    color: '#EF4444',
    usageCount: 0,
    defaultOrder: 8,
    isCustom: false,
  },
  {
    id: 'cat-travel',
    name: 'Travel',
    type: 'EXPENSE',
    icon: '✈️',
    color: '#06B6D4',
    usageCount: 0,
    defaultOrder: 9,
    isCustom: false,
  },
  {
    id: 'cat-subscriptions',
    name: 'Subscriptions',
    type: 'EXPENSE',
    icon: '📱',
    color: '#8B5CF6',
    usageCount: 0,
    defaultOrder: 10,
    isCustom: false,
  },
  {
    id: 'cat-personal',
    name: 'Personal Care',
    type: 'EXPENSE',
    icon: '✨',
    color: '#F43F5E',
    usageCount: 0,
    defaultOrder: 11,
    isCustom: false,
  },
  {
    id: 'cat-adjustment',
    name: 'Balance Adjustment',
    type: 'EXPENSE',
    icon: '⚖️',
    color: '#64748B',
    usageCount: 0,
    defaultOrder: 12,
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
      amountMinor: 5500000,
      currency: 'PHP',
      walletId: 'wallet-checking',
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
      amountMinor: 450000,
      currency: 'PHP',
      walletId: 'wallet-card',
      splits: [
        {
          id: 'split-seed-1',
          categoryId: 'cat-groceries',
          amountMinor: 320000,
          note: 'Weekly produce & pantry',
        },
        {
          id: 'split-seed-2',
          categoryId: 'cat-household',
          amountMinor: 130000,
          note: 'Cleaning supplies',
        },
      ],
      merchant: 'SM Supermarket',
      tags: ['shared'],
      note: 'Weekly grocery & household run',
      occurredAt: tx2OccurredAt,
      createdAt: tx2OccurredAt,
    },
    {
      id: 'tx-seed-3',
      type: 'EXPENSE' as const,
      amountMinor: 850000,
      currency: 'PHP',
      walletId: 'wallet-card',
      categoryId: 'cat-travel',
      merchant: 'Philippine Airlines',
      tags: ['vacation', 'reimbursable'],
      note: 'Flight booking',
      receiptUri: 'local://receipt-seed-delta.jpg',
      occurredAt: tx3OccurredAt,
      createdAt: tx3OccurredAt,
    },
    {
      id: 'tx-seed-4',
      type: 'EXPENSE' as const,
      amountMinor: 18000,
      currency: 'PHP',
      walletId: 'wallet-cash',
      categoryId: 'cat-coffee',
      merchant: 'Starbucks',
      tags: ['work'],
      occurredAt: tx4OccurredAt,
      createdAt: tx4OccurredAt,
    },
    {
      id: 'tx-seed-5',
      type: 'EXPENSE' as const,
      amountMinor: 450000,
      currency: 'PHP',
      walletId: 'wallet-checking',
      categoryId: 'cat-bills',
      merchant: 'Meralco',
      tags: ['recurring', 'shared'],
      note: 'Electric utility bill',
      occurredAt: tx5OccurredAt,
      createdAt: tx5OccurredAt,
    },
    {
      id: 'tx-seed-6',
      type: 'TRANSFER' as const,
      amountMinor: 1000000,
      currency: 'PHP',
      walletId: 'wallet-checking',
      toWalletId: 'wallet-savings',
      tags: ['recurring'],
      note: 'Automated savings transfer',
      occurredAt: tx6OccurredAt,
      createdAt: tx6OccurredAt,
    },
  ];

  return rawTransactions.map((tx) => transactionSchema.parse(tx));
}

export const DEFAULT_TRANSACTIONS: Transaction[] = createDefaultTransactions();
