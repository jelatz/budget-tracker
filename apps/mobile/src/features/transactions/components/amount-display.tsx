import React from 'react';
import { Pressable, View } from 'react-native';
import {
  DEFAULT_CURRENCY,
  formatMinorUnits,
  type CalculatorEvaluation,
  type TransactionType,
} from '@repo/contracts';
import { ThemedText } from '@/common/components/themed-text';

export interface AmountDisplayProps {
  type: TransactionType;
  evaluation: CalculatorEvaluation;
  currency?: string;
  splitCount?: number;
  isCalculatorFocused?: boolean;
  showKeyboardHint?: boolean;
  standaloneBorder?: boolean;
  onActivateCalculator?: () => void;
}

const TYPE_PANEL_STYLES: Record<
  TransactionType,
  {
    container: string;
    standaloneInactiveBorder: string;
    standaloneActiveBorder: string;
    text: string;
    badgeActive: string;
    badgeTextActive: string;
    hint: string;
    prefix: string;
  }
> = {
  EXPENSE: {
    container: 'bg-rose-50/70 dark:bg-rose-950/25 border-rose-200/80 dark:border-rose-900/40',
    standaloneInactiveBorder: 'border-2 border-slate-300 dark:border-slate-700',
    standaloneActiveBorder: 'border-2 border-rose-600 dark:border-rose-400',
    text: 'text-rose-600 dark:text-rose-400',
    badgeActive: 'bg-rose-600 dark:bg-rose-500',
    badgeTextActive: 'text-white',
    hint: 'Expense Amount',
    prefix: '-',
  },
  INCOME: {
    container:
      'bg-emerald-50/70 dark:bg-emerald-950/25 border-emerald-200/80 dark:border-emerald-900/40',
    standaloneInactiveBorder: 'border-2 border-slate-300 dark:border-slate-700',
    standaloneActiveBorder: 'border-2 border-emerald-600 dark:border-emerald-400',
    text: 'text-emerald-600 dark:text-emerald-400',
    badgeActive: 'bg-emerald-600 dark:bg-emerald-500',
    badgeTextActive: 'text-white',
    hint: 'Income Deposit',
    prefix: '+',
  },
  TRANSFER: {
    container: 'bg-brand-50/70 dark:bg-brand-950/25 border-brand-200/80 dark:border-brand-900/40',
    standaloneInactiveBorder: 'border-2 border-slate-300 dark:border-slate-700',
    standaloneActiveBorder: 'border-2 border-brand-600 dark:border-brand-400',
    text: 'text-brand-600 dark:text-brand-400',
    badgeActive: 'bg-brand-600 dark:bg-brand-500',
    badgeTextActive: 'text-white',
    hint: 'Account Transfer',
    prefix: '⇄ ',
  },
};

export function AmountDisplay({
  type,
  evaluation,
  currency = DEFAULT_CURRENCY,
  splitCount = 0,
  isCalculatorFocused = false,
  showKeyboardHint = false,
  standaloneBorder = false,
  onActivateCalculator,
}: AmountDisplayProps) {
  const themeStyle = TYPE_PANEL_STYLES[type];
  const formattedAmount = formatMinorUnits(
    Math.max(0, evaluation.previewMinor),
    currency,
  );

  const showFormula =
    evaluation.hasOperator || evaluation.displayExpression !== '0';
  const isDivideByZero = evaluation.error === 'DIVIDE_BY_ZERO';

  const borderClass = standaloneBorder
    ? isCalculatorFocused
      ? themeStyle.standaloneActiveBorder
      : themeStyle.standaloneInactiveBorder
    : 'border';

  const panelClass = `w-full rounded-xl px-3.5 py-2.5 ${borderClass} ${themeStyle.container}`;

  const content = (
    <View className={panelClass}>
      {/* Secondary Row: Type Hint / Live Formula & Keyboard Status Pill */}
      <View className="flex-row items-center justify-between min-h-[24px] gap-2">
        {showFormula ? (
          <ThemedText
            className="text-xs font-mono font-semibold text-slate-600 dark:text-slate-300 flex-1"
            numberOfLines={1}
            ellipsizeMode="head"
          >
            {evaluation.displayExpression}
          </ThemedText>
        ) : (
          <ThemedText
            className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex-1"
            numberOfLines={1}
          >
            {themeStyle.hint}
          </ThemedText>
        )}

        {showKeyboardHint && (
          <View
            className={`px-2 py-0.5 rounded-full ${
              isCalculatorFocused
                ? themeStyle.badgeActive
                : 'bg-white/90 dark:bg-slate-800 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <ThemedText
              className={`text-[10px] font-bold ${
                isCalculatorFocused
                  ? themeStyle.badgeTextActive
                  : 'text-slate-600 dark:text-slate-300'
              }`}
              numberOfLines={1}
            >
              {isCalculatorFocused ? '⌨️ Keyboard active' : 'Click to type'}
            </ThemedText>
          </View>
        )}
      </View>

      {/* Main Row: Formatted Hero Amount & Optional Split Badge */}
      <View className="flex-row items-baseline justify-between flex-wrap gap-2 mt-0.5">
        <ThemedText
          className={`text-3xl sm:text-4xl font-extrabold font-mono tracking-tight ${themeStyle.text}`}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.65}
        >
          {themeStyle.prefix}
          {formattedAmount}
        </ThemedText>

        {splitCount >= 2 && (
          <View className="px-2.5 py-1 rounded-full bg-indigo-100/80 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800/70">
            <ThemedText className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
              Split ({splitCount})
            </ThemedText>
          </View>
        )}
      </View>

      {/* Warning Row: Subtle Divide-by-zero notice */}
      {isDivideByZero && (
        <View className="mt-1.5 flex-row items-center" accessibilityRole="alert">
          <ThemedText className="text-xs font-semibold text-rose-600 dark:text-rose-400">
            Cannot divide by zero
          </ThemedText>
        </View>
      )}
    </View>
  );

  if (onActivateCalculator) {
    return (
      <Pressable
        onPress={onActivateCalculator}
        accessibilityRole="button"
        accessibilityLabel="Focus calculator to type transaction amount"
        className="w-full min-h-[44px]"
      >
        {content}
      </Pressable>
    );
  }

  return content;
}
