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
      'border-2 border-ledger-terracotta dark:border-ledger-terracotta-dark bg-ledger-subtle dark:bg-ledger-subtle-dark',
    inactive:
      'border border-ledger-border dark:border-ledger-border-dark bg-ledger-subtle dark:bg-ledger-subtle-dark',
  },
  INCOME: {
    active:
      'border-2 border-ledger-pine dark:border-ledger-pine-dark bg-ledger-subtle dark:bg-ledger-subtle-dark',
    inactive:
      'border border-ledger-border dark:border-ledger-border-dark bg-ledger-subtle dark:bg-ledger-subtle-dark',
  },
  TRANSFER: {
    active:
      'border-2 border-brand-500 dark:border-brand-400 bg-ledger-subtle dark:bg-ledger-subtle-dark',
    inactive:
      'border border-ledger-border dark:border-ledger-border-dark bg-ledger-subtle dark:bg-ledger-subtle-dark',
  },
};

export function getCalculatorFrameClassName(
  transactionType: TransactionType,
  isFocused: boolean,
): string {
  const palette = CALCULATOR_FRAME_BORDER_CLASSES[transactionType];
  return `w-full rounded-2xl p-2.5 gap-2.5 ${isFocused ? palette.active : palette.inactive}`;
}
