import { z } from 'zod';
import { positiveAmountMinorSchema } from './money';
import { transactionTypeSchema } from './transactions.schema';

export const baseQuickPresetSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1),
  icon: z.string().min(1),
  type: transactionTypeSchema,
  amountMinor: positiveAmountMinorSchema,
  walletId: z.string().min(1),
  toWalletId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  merchant: z.string().trim().max(80).optional(),
  tags: z.array(z.string().trim().min(1).max(32)).default([]),
  defaultOrder: z.number().int().nonnegative().default(0),
});

export function refineQuickPresetRules(
  data: {
    type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
    walletId: string;
    toWalletId?: string;
    categoryId?: string;
  },
  ctx: z.RefinementCtx,
): void {
  if (data.type === 'TRANSFER') {
    if (!data.toWalletId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Destination wallet is required for transfers',
        path: ['toWalletId'],
      });
    } else if (data.toWalletId === data.walletId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Destination wallet must differ from source wallet',
        path: ['toWalletId'],
      });
    }
    if (data.categoryId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Transfers cannot have a category',
        path: ['categoryId'],
      });
    }
    return;
  }

  if (data.toWalletId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Destination wallet is only allowed for transfers',
      path: ['toWalletId'],
    });
  }
}

export const quickPresetSchema = baseQuickPresetSchema.superRefine(
  refineQuickPresetRules,
);
export type QuickPreset = z.infer<typeof quickPresetSchema>;

export const createQuickPresetInputSchema = baseQuickPresetSchema
  .omit({ id: true })
  .superRefine(refineQuickPresetRules);
export type CreateQuickPresetInput = z.infer<typeof createQuickPresetInputSchema>;

export const DEFAULT_PRESETS: QuickPreset[] = [
  {
    id: 'preset-coffee',
    label: 'Daily Coffee',
    icon: '☕',
    type: 'EXPENSE',
    amountMinor: 18000,
    walletId: 'wallet-card',
    categoryId: 'cat-coffee',
    merchant: 'Coffee Shop',
    tags: ['coffee', 'daily'],
    defaultOrder: 1,
  },
  {
    id: 'preset-transit',
    label: 'Metro Transit',
    icon: '🚇',
    type: 'EXPENSE',
    amountMinor: 8000,
    walletId: 'wallet-card',
    categoryId: 'cat-transport',
    merchant: 'Metro Transit',
    tags: ['transit', 'commute'],
    defaultOrder: 2,
  },
  {
    id: 'preset-lunch',
    label: 'Quick Lunch',
    icon: '🥪',
    type: 'EXPENSE',
    amountMinor: 25000,
    walletId: 'wallet-card',
    categoryId: 'cat-dining',
    merchant: 'Lunch Deli',
    tags: ['lunch', 'food'],
    defaultOrder: 3,
  },
  {
    id: 'preset-savings',
    label: 'Move to Savings',
    icon: '🐷',
    type: 'TRANSFER',
    amountMinor: 500000,
    walletId: 'wallet-checking',
    toWalletId: 'wallet-savings',
    tags: ['savings'],
    defaultOrder: 4,
  },
];
