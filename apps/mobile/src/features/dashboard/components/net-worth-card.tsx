import React from 'react';
import { Pressable, View } from 'react-native';
import { formatMinorUnits, type DashboardPeriod } from '@repo/contracts';
import { ThemedText } from '@/common/components/themed-text';

export interface NetWorthCardProps {
  period: DashboardPeriod;
  onPeriodChange: (period: DashboardPeriod) => void;
  netWorthMinor: number;
  incomeMinor: number;
  expenseMinor: number;
  netCashflowMinor: number;
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
  netWorthMinor,
  incomeMinor,
  expenseMinor,
  netCashflowMinor,
  transactionCount,
  currency = 'PHP',
}: NetWorthCardProps) {
  return (
    <View className="rounded-3xl p-5 bg-slate-900 dark:bg-[#131b2e] border border-slate-800/90 shadow-lg">
      {/* 1. Period Selector Pill Strip */}
      <View className="flex-row items-center bg-slate-800/90 dark:bg-[#171f33] p-1.5 rounded-2xl mb-5 border border-slate-700/50 dark:border-slate-800">
        {PERIOD_OPTIONS.map((option) => {
          const isActive = period === option.key;
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
                {option.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

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

        <View className="mt-2.5 px-3 py-1 rounded-full bg-slate-800/80 dark:bg-[#171f33] border border-slate-700/50 dark:border-slate-800">
          <ThemedText className="text-xs font-medium text-slate-300">
            {`${transactionCount} transactions in period`}
          </ThemedText>
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
