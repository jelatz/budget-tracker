import React from 'react';
import { Pressable, View } from 'react-native';
import {
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
  onClear: () => void;
}

const TYPE_TEXT_COLORS: Record<TransactionType, string> = {
  EXPENSE: 'text-rose-500 dark:text-rose-400',
  INCOME: 'text-emerald-500 dark:text-emerald-400',
  TRANSFER: 'text-brand-500 dark:text-brand-400',
};

const TYPE_PREFIXES: Record<TransactionType, string> = {
  EXPENSE: '-',
  INCOME: '+',
  TRANSFER: '⇄ ',
};

export function AmountDisplay({
  type,
  evaluation,
  currency = 'PHP',
  splitCount = 0,
  onClear,
}: AmountDisplayProps) {
  const textColorClass = TYPE_TEXT_COLORS[type];
  const prefix = TYPE_PREFIXES[type];
  const formattedAmount = formatMinorUnits(
    Math.max(0, evaluation.previewMinor),
    currency,
  );

  const showFormula =
    evaluation.hasOperator || evaluation.displayExpression !== '0';
  const showClearButton = evaluation.displayExpression !== '0';
  const isDivideByZero = evaluation.error === 'DIVIDE_BY_ZERO';

  return (
    <View className="w-full rounded-3xl p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
      {/* Secondary Row: Live Formula & Clear Button */}
      <View className="flex-row items-center justify-between min-h-[28px]">
        {showFormula ? (
          <ThemedText
            className="text-base font-mono font-medium text-slate-500 dark:text-slate-400 flex-1 mr-2"
            numberOfLines={1}
            ellipsizeMode="head"
          >
            {evaluation.displayExpression}
          </ThemedText>
        ) : (
          <View className="flex-1" />
        )}

        {showClearButton && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear calculator expression"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={onClear}
            className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center active:opacity-60"
          >
            <ThemedText className="text-xs font-bold text-slate-500 dark:text-slate-400">
              C
            </ThemedText>
          </Pressable>
        )}
      </View>

      {/* Main Row: Formatted Amount & Optional Split Badge */}
      <View className="flex-row items-baseline flex-wrap gap-2 mt-1">
        <ThemedText
          className={`text-4xl sm:text-5xl font-bold font-mono tracking-tight ${textColorClass}`}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {prefix}
          {formattedAmount}
        </ThemedText>

        {splitCount >= 2 && (
          <View className="px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60">
            <ThemedText className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              Split ({splitCount})
            </ThemedText>
          </View>
        )}
      </View>

      {/* Warning Row: Subtle Divide-by-zero notice */}
      {isDivideByZero && (
        <View className="mt-2 flex-row items-center">
          <ThemedText className="text-xs font-medium text-rose-500 dark:text-rose-400">
            Cannot divide by zero
          </ThemedText>
        </View>
      )}
    </View>
  );
}
