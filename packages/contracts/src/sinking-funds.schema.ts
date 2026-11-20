import { z } from 'zod';
import { positiveAmountMinorSchema } from './money';

function isValidTargetDate(value: string): boolean {
  const match = /^(\d{4})-(0[1-9]|1[0-2])(?:-(\d{2}))?$/.exec(value);
  if (!match) return false;
  if (!match[3]) return true;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export const sinkingFundSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  icon: z.string().min(1).default('🎯'),
  color: z.string().min(1).default('#3B82F6'),
  targetAmountMinor: positiveAmountMinorSchema,
  currentSavedMinor: z.number().int().nonnegative().default(0),
  targetDate: z
    .string()
    .refine(
      isValidTargetDate,
      'Must be a valid calendar date in YYYY-MM or YYYY-MM-DD format',
    ),
  walletId: z.string().min(1),
  monthlyContributionMinor: z.number().int().nonnegative().default(0),
  isCompleted: z.boolean().default(false),
  notes: z.string().trim().max(280).optional(),
});
export type SinkingFund = z.infer<typeof sinkingFundSchema>;

export const createSinkingFundInputSchema = sinkingFundSchema.omit({ id: true });
export type CreateSinkingFundInput = z.infer<typeof createSinkingFundInputSchema>;

export interface SinkingFundMonthlyTargetResult {
  remainingMonths: number;
  remainingTargetMinor: number;
  monthlyTargetMinor: number;
  isTargetReached: boolean;
}

/**
 * Calculates remaining months and monthly allocation needed to hit a sinking fund target by date.
 */
export function computeSinkingFundMonthlyTarget(
  targetAmountMinor: number,
  currentSavedMinor: number,
  targetDateIso: string,
  currentDate = new Date(),
): SinkingFundMonthlyTargetResult {
  const isTargetReached = currentSavedMinor >= targetAmountMinor;
  const remainingTargetMinor = isTargetReached ? 0 : targetAmountMinor - currentSavedMinor;

  if (isTargetReached) {
    return {
      remainingMonths: 0,
      remainingTargetMinor: 0,
      monthlyTargetMinor: 0,
      isTargetReached: true,
    };
  }

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth(); // 0-indexed (0-11)

  const parts = targetDateIso.split('-');
  const targetYear = parseInt(parts[0], 10);
  const targetMonth = parseInt(parts[1], 10) - 1; // 0-indexed (0-11)

  const monthDiff = (targetYear - currentYear) * 12 + (targetMonth - currentMonth);
  // Clamped to at least 1 month if due in current month or past
  const remainingMonths = Math.max(1, monthDiff <= 0 ? 1 : monthDiff);

  const monthlyTargetMinor = Math.ceil(remainingTargetMinor / remainingMonths);

  return {
    remainingMonths,
    remainingTargetMinor,
    monthlyTargetMinor,
    isTargetReached: false,
  };
}
