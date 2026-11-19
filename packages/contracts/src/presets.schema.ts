import { z } from 'zod';
import { positiveAmountMinorSchema } from './money';
import { transactionTypeSchema } from './transactions.schema';

export const quickPresetSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
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
export type QuickPreset = z.infer<typeof quickPresetSchema>;

export const createQuickPresetInputSchema = quickPresetSchema.omit({ id: true });
export type CreateQuickPresetInput = z.infer<typeof createQuickPresetInputSchema>;

export const DEFAULT_PRESETS: QuickPreset[] = [
  {
    id: 'preset-coffee',
    label: 'Daily Coffee',
    icon: '☕',
    type: 'EXPENSE',
    amountMinor: 450,
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
    amountMinor: 275,
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
    amountMinor: 1200,
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
    amountMinor: 5000,
    walletId: 'wallet-checking',
    toWalletId: 'wallet-savings',
    tags: ['savings'],
    defaultOrder: 4,
  },
];
