import React from 'react';
import { Pressable, View } from 'react-native';
import {
  formatMinorUnits,
  formatPeriodMonthLabel,
  getCurrentPeriodMonth,
  type DashboardPeriod,
} from '@repo/contracts';
import { ThemedText } from '@/common/components/themed-text';

export interface NetWorthCardProps {
  period: DashboardPeriod;
  onPeriodChange: (period: DashboardPeriod) => void;
  selectedMonth?: string;
  onShiftMonth?: (delta: number) => void;
  netWorthMinor: number;
  incomeMinor: number;
  expenseMinor: number;
  netCashflowMinor: number;
  savingsRatePercent?: number | null;
  transactionCount: number;
  currency?: string;
}

const PERIOD_OPTIONS: Array<{ key: DashboardPeriod; label: string }> = [
  { key: 'THIS_MONTH', label: 'This Month' },
  { key: 'LAST_7_DAYS', label: 'Last 7 Days' },
  { key: 'ALL_TIME', label: 'All Time' },
];

export function NetWorthCard({
  period,
  onPeriodChange,
  selectedMonth,
  onShiftMonth,
  netWorthMinor,
  incomeMinor,
  expenseMinor,
  netCashflowMinor,
  savingsRatePercent,
  transactionCount,
  currency = 'PHP',
}: NetWorthCardProps) {
  const currentMonth = getCurrentPeriodMonth();
  const displayMonth = selectedMonth ?? currentMonth;
  const isMonthlyMode = period === 'THIS_MONTH' || period === 'MONTH';
  const canGoNext = displayMonth < currentMonth;

  return (
    <View className="rounded-3xl p-5 bg-slate-900 dark:bg-[#131b2e] border border-slate-800/90 shadow-lg">
      {/* 1. Period Selector Pill Strip */}
      <View className="flex-row items-center bg-slate-800/90 dark:bg-[#171f33] p-1.5 rounded-2xl mb-3 border border-slate-700/50 dark:border-slate-800">
        {PERIOD_OPTIONS.map((option) => {
          const isActive =
            period === option.key ||
            (option.key === 'THIS_MONTH' && period === 'MONTH');
          return (
            <Pressable
              key={option.key}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`Select period ${option.label}`}
              onPress={() => onPeriodChange(option.key)}
              className={`min-h-[44px] flex-1 py-2 px-2.5 rounded-xl items-center justify-center active:opacity-80 ${
                isActive ? 'bg-brand-500 shadow-sm shadow-brand-500/30' : 'bg-transparent'
              }`}
            >
              <ThemedText
                className={`text-xs ${
                  isActive ? 'font-bold text-white' : 'font-medium text-slate-400'
                }`}
              >
                {option.key === 'THIS_MONTH' && period === 'MONTH'
                  ? formatPeriodMonthLabel(displayMonth)
                  : option.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {/* Optional Month Stepper */}
      {isMonthlyMode && onShiftMonth && (
        <View className="flex-row items-center justify-between bg-slate-800/60 dark:bg-[#171f33]/80 px-2 py-1 rounded-2xl mb-4 border border-slate-700/40 dark:border-slate-800">
          <Pressable
            onPress={() => onShiftMonth(-1)}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            className="min-h-[44px] min-w-[44px] items-center justify-center rounded-xl active:opacity-75"
          >
            <ThemedText className="text-base font-bold text-slate-200">‹</ThemedText>
          </Pressable>

          <ThemedText className="text-xs font-bold text-slate-200 tracking-wide">
            {formatPeriodMonthLabel(displayMonth)}
          </ThemedText>

          <Pressable
            onPress={() => onShiftMonth(1)}
            disabled={!canGoNext}
            accessibilityRole="button"
            accessibilityLabel="Next month"
            className={`min-h-[44px] min-w-[44px] items-center justify-center rounded-xl ${
              canGoNext ? 'active:opacity-75' : 'opacity-30'
            }`}
          >
            <ThemedText className="text-base font-bold text-slate-200">›</ThemedText>
          </Pressable>
        </View>
      )}

      {/* 2. Hero Net Worth Display */}
      <View className="items-center mb-5">
        <ThemedText className="text-[11px] font-bold tracking-widest text-slate-400 uppercase mb-1.5">
          TOTAL NET WORTH
        </ThemedText>

        <ThemedText
          className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight text-white text-center leading-tight w-full"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {formatMinorUnits(netWorthMinor, currency)}
        </ThemedText>

        <View className="mt-2.5 flex-row flex-wrap items-center justify-center gap-2">
          <View className="px-3 py-1 rounded-full bg-slate-800/80 dark:bg-[#171f33] border border-slate-700/50 dark:border-slate-800">
            <ThemedText className="text-xs font-medium text-slate-300">
              {`${transactionCount} ${transactionCount === 1 ? 'transaction' : 'transactions'} in period`}
            </ThemedText>
          </View>

          {savingsRatePercent !== null && savingsRatePercent !== undefined && (
            <View
              className={`px-3 py-1 rounded-full border ${
                savingsRatePercent >= 0
                  ? 'bg-emerald-950/70 border-emerald-700/50'
                  : 'bg-rose-950/70 border-rose-700/50'
              }`}
            >
              <ThemedText
                className={`text-xs font-bold ${
                  savingsRatePercent >= 0
                    ? 'text-emerald-300'
                    : 'text-rose-300'
                }`}
              >
                {savingsRatePercent >= 0
                  ? `Saved ${savingsRatePercent}%`
                  : `Overspent ${Math.abs(savingsRatePercent)}%`}
              </ThemedText>
            </View>
          )}
        </View>
      </View>

      {/* 3. Three-Column Summary Row */}
      <View className="flex-row gap-2 sm:gap-3 pt-2 border-t border-slate-800/80">
        <View className="flex-1 min-w-0 bg-slate-800/70 dark:bg-[#171f33] border border-slate-700/60 dark:border-slate-800 rounded-2xl p-2.5 sm:p-3 items-center">
          <ThemedText className="text-[11px] font-medium text-slate-400 mb-1">
            Income
          </ThemedText>
          <ThemedText
            className="text-xs sm:text-sm font-bold font-mono text-emerald-400 w-full text-center leading-tight"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {formatMinorUnits(incomeMinor, currency)}
          </ThemedText>
        </View>

        <View className="flex-1 min-w-0 bg-slate-800/70 dark:bg-[#171f33] border border-slate-700/60 dark:border-slate-800 rounded-2xl p-2.5 sm:p-3 items-center">
          <ThemedText className="text-[11px] font-medium text-slate-400 mb-1">
            Expense
          </ThemedText>
          <ThemedText
            className="text-xs sm:text-sm font-bold font-mono text-rose-400 w-full text-center leading-tight"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {formatMinorUnits(expenseMinor, currency)}
          </ThemedText>
        </View>

        <View className="flex-1 min-w-0 bg-slate-800/70 dark:bg-[#171f33] border border-slate-700/60 dark:border-slate-800 rounded-2xl p-2.5 sm:p-3 items-center">
          <ThemedText className="text-[11px] font-medium text-slate-400 mb-1">
            Net Cashflow
          </ThemedText>
          <ThemedText
            className={`text-xs sm:text-sm font-bold font-mono ${
              netCashflowMinor >= 0 ? 'text-emerald-400' : 'text-rose-400'
            } w-full text-center leading-tight`}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {formatMinorUnits(netCashflowMinor, currency)}
          </ThemedText>
        </View>
      </View>
    </View>
  );
}
