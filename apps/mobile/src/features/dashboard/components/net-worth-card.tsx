import React from 'react';
import { Pressable, View } from 'react-native';
import { DEFAULT_CURRENCY, formatMinorUnits } from '@repo/contracts';
import { ThemedText } from '@/common/components/themed-text';

export interface NetWorthCardProps {
  netWorthMinor: number;
  incomeMinor: number;
  expenseMinor: number;
  netCashflowMinor: number;
  transactionCount: number;
  currency?: string;
  onPress?: () => void;
}

export function NetWorthCard({
  netWorthMinor,
  incomeMinor,
  expenseMinor,
  netCashflowMinor,
  transactionCount,
  currency = DEFAULT_CURRENCY,
  onPress,
}: NetWorthCardProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="link"
      accessibilityLabel="Total Net Worth. View transaction history"
      className="rounded-2xl p-5 bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark active:opacity-85"
    >
      {/* 1. Hero Net Worth Display */}
      <View className="items-center mb-5">
        <ThemedText className="text-[11px] font-semibold tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted uppercase mb-1.5">
          Total Net Worth
        </ThemedText>

        <ThemedText
          numeric
          className="text-3xl sm:text-4xl font-extrabold tracking-tight text-ledger-ink dark:text-ledger-ink-dark text-center"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {formatMinorUnits(netWorthMinor, currency)}
        </ThemedText>

        <View className="mt-2.5 px-3 py-1 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark">
          <ThemedText
            numeric
            className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
          >
            {`${transactionCount} ${transactionCount === 1 ? 'transaction' : 'transactions'} in period`}
          </ThemedText>
        </View>
      </View>

      {/* 2. Three-Column Summary Row */}
      <View className="flex-row gap-2 pt-4 border-t border-ledger-border dark:border-ledger-border-dark">
        <View className="flex-1 min-w-0 bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark rounded-xl p-2.5 sm:p-3 items-center">
          <ThemedText className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mb-1">
            Income
          </ThemedText>
          <ThemedText
            numeric
            className="text-xs sm:text-sm font-bold text-ledger-pine dark:text-ledger-pine-dark"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {formatMinorUnits(incomeMinor, currency)}
          </ThemedText>
        </View>

        <View className="flex-1 min-w-0 bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark rounded-xl p-2.5 sm:p-3 items-center">
          <ThemedText className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mb-1">
            Expense
          </ThemedText>
          <ThemedText
            numeric
            className="text-xs sm:text-sm font-bold text-ledger-terracotta dark:text-ledger-terracotta-dark"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {formatMinorUnits(expenseMinor, currency)}
          </ThemedText>
        </View>

        <View className="flex-1 min-w-0 bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark rounded-xl p-2.5 sm:p-3 items-center">
          <ThemedText
            className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mb-1"
            numberOfLines={1}
          >
            Net Cashflow
          </ThemedText>
          <ThemedText
            numeric
            className={`text-xs sm:text-sm font-bold ${
              netCashflowMinor >= 0
                ? 'text-ledger-pine dark:text-ledger-pine-dark'
                : 'text-ledger-terracotta dark:text-ledger-terracotta-dark'
            }`}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {formatMinorUnits(netCashflowMinor, currency)}
          </ThemedText>
        </View>
      </View>

      <ThemedText className="text-xs font-medium text-ledger-ink-muted dark:text-ledger-ink-dark-muted text-center mt-3">
        Tap to view history
      </ThemedText>
    </Pressable>
  );
}
