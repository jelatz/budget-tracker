import type { ReactNode } from 'react';
import type { CalculatorKey, TransactionType } from '@repo/contracts';

export interface CalculatorFocusFrameHandle {
  focus: () => void;
}

export interface CalculatorFocusFrameProps {
  transactionType: TransactionType;
  needsCalculation: boolean;
  canSave: boolean;
  isFocused: boolean;
  onFocusChange: (focused: boolean) => void;
  onKeyPress: (key: CalculatorKey) => void;
  onClearAll: () => void;
  onSave: () => void;
  ariaLabel?: string;
  children: ReactNode;
}

export const CALCULATOR_FRAME_BORDER_CLASSES: Record<
  TransactionType,
  {
    active: string;
    inactive: string;
  }
> = {
  EXPENSE: {
    active:
      'border-2 border-rose-600 dark:border-rose-400 bg-rose-50/30 dark:bg-rose-950/20 shadow-sm',
    inactive:
      'border-2 border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/50',
  },
  INCOME: {
    active:
      'border-2 border-emerald-600 dark:border-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/20 shadow-sm',
    inactive:
      'border-2 border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/50',
  },
  TRANSFER: {
    active:
      'border-2 border-brand-600 dark:border-brand-400 bg-brand-50/30 dark:bg-brand-950/20 shadow-sm',
    inactive:
      'border-2 border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/50',
  },
};

export function getCalculatorFrameClassName(
  transactionType: TransactionType,
  isFocused: boolean,
): string {
  const palette = CALCULATOR_FRAME_BORDER_CLASSES[transactionType];
  return `w-full rounded-2xl p-2.5 gap-2.5 ${isFocused ? palette.active : palette.inactive}`;
}
