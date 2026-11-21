import React from 'react';
import { Pressable, View } from 'react-native';
import { DEFAULT_CURRENCY, formatMinorUnits, type DashboardPeriod } from '@repo/contracts';
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
  currency = DEFAULT_CURRENCY,
}: NetWorthCardProps) {
  return (
    <View className="rounded-3xl p-5 bg-slate-900 dark:bg-slate-900 border border-slate-800 shadow-lg">
      {/* 1. Period Selector Pill Strip */}
      <View className="flex-row items-center bg-slate-800/90 p-1 rounded-xl mb-5">
        {PERIOD_OPTIONS.map((option) => {
          const isActive = period === option.key;
          return (
            <Pressable
              key={option.key}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`Select period ${option.label}`}
              onPress={() => onPeriodChange(option.key)}
              className={`flex-1 py-2 px-2.5 rounded-lg items-center justify-center active:opacity-80 ${
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
          className="text-3xl font-extrabold tracking-tight text-white text-center"
          numberOfLines={1}
        >
          {formatMinorUnits(netWorthMinor, currency)}
        </ThemedText>

        <View className="mt-2.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/50">
          <ThemedText className="text-xs font-medium text-slate-300">
            {`${transactionCount} transactions in period`}
          </ThemedText>
        </View>
      </View>

      {/* 3. Three-Column Summary Row */}
      <View className="flex-row gap-1.5 sm:gap-2.5 pt-1 border-t border-slate-800/80">
        <View className="flex-1 bg-slate-800/70 border border-slate-800 rounded-2xl p-2 sm:p-3 items-center">
          <ThemedText className="text-[11px] font-medium text-slate-400 mb-1">
            Income
          </ThemedText>
          <ThemedText
            className="text-xs sm:text-sm font-bold text-emerald-400"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {formatMinorUnits(incomeMinor, currency)}
          </ThemedText>
        </View>

        <View className="flex-1 bg-slate-800/70 border border-slate-800 rounded-2xl p-2 sm:p-3 items-center">
          <ThemedText className="text-[11px] font-medium text-slate-400 mb-1">
            Expense
          </ThemedText>
          <ThemedText
            className="text-xs sm:text-sm font-bold text-rose-400"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {formatMinorUnits(expenseMinor, currency)}
          </ThemedText>
        </View>

        <View className="flex-1 bg-slate-800/70 border border-slate-800 rounded-2xl p-2 sm:p-3 items-center">
          <ThemedText className="text-[11px] font-medium text-slate-400 mb-1">
            Net Cashflow
          </ThemedText>
          <ThemedText
            className={`text-xs sm:text-sm font-bold ${
              netCashflowMinor >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
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
