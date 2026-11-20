import React from 'react';
import { Pressable, View } from 'react-native';
import {
  formatMinorUnits,
  formatPeriodMonthLabel,
  type MonthlyCashflowPoint,
} from '@repo/contracts';
import { ThemedText } from '@/common/components/themed-text';

export interface CashflowTrendCardProps {
  points: readonly MonthlyCashflowPoint[];
  activePeriodMonth?: string;
  currency?: string;
  onSelectMonth?: (periodMonth: string) => void;
}

const MAX_BAR_HEIGHT = 96;

export function CashflowTrendCard({
  points,
  activePeriodMonth,
  currency = 'PHP',
  onSelectMonth,
}: CashflowTrendCardProps) {
  const hasAnyActivity = points.some(
    (p) => p.incomeMinor > 0 || p.expenseMinor > 0,
  );

  const maxMinor = Math.max(
    1,
    ...points.flatMap((p) => [p.incomeMinor, p.expenseMinor]),
  );

  const activePoint =
    points.find((p) => p.periodMonth === activePeriodMonth) ??
    points[points.length - 1];

  return (
    <View className="rounded-3xl p-5 bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 shadow-sm gap-4">
      {/* Header & Legend */}
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <View className="flex-1 min-w-[180px]">
          <ThemedText className="text-base font-bold text-slate-900 dark:text-white">
            Incoming vs. Outgoing (6 Months)
          </ThemedText>
          <ThemedText className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Tap any month to inspect its cashflow breakdown
          </ThemedText>
        </View>

        <View className="flex-row items-center gap-3">
          <View className="flex-row items-center gap-1.5">
            <View className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <ThemedText className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Income
            </ThemedText>
          </View>
          <View className="flex-row items-center gap-1.5">
            <View className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            <ThemedText className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Expense
            </ThemedText>
          </View>
        </View>
      </View>

      {!hasAnyActivity ? (
        <View className="py-8 items-center justify-center rounded-2xl bg-slate-50 dark:bg-[#171f33]/60 border border-dashed border-slate-200 dark:border-slate-800">
          <ThemedText className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            No cashflow recorded across the last 6 months
          </ThemedText>
          <ThemedText className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 text-center max-w-[260px]">
            Record incoming earnings and outgoing expenses to visualize monthly trends.
          </ThemedText>
        </View>
      ) : (
        <>
          {/* 6-Month Bar Columns */}
          <View className="flex-row items-end justify-between gap-1.5 pt-2">
            {points.map((point) => {
              const isSelected = point.periodMonth === activePoint?.periodMonth;
              const incomeHeight =
                point.incomeMinor > 0
                  ? Math.max(4, Math.round((point.incomeMinor / maxMinor) * MAX_BAR_HEIGHT))
                  : 2;
              const expenseHeight =
                point.expenseMinor > 0
                  ? Math.max(4, Math.round((point.expenseMinor / maxMinor) * MAX_BAR_HEIGHT))
                  : 2;

              return (
                <Pressable
                  key={point.periodMonth}
                  onPress={() => onSelectMonth?.(point.periodMonth)}
                  disabled={!onSelectMonth}
                  accessibilityRole={onSelectMonth ? 'button' : undefined}
                  accessibilityState={onSelectMonth ? { selected: isSelected } : undefined}
                  accessibilityLabel={`${formatPeriodMonthLabel(point.periodMonth)}: Income ${formatMinorUnits(point.incomeMinor, currency)}, Expense ${formatMinorUnits(point.expenseMinor, currency)}, Net ${formatMinorUnits(point.netCashflowMinor, currency)}`}
                  className={`flex-1 min-h-[44px] items-center pt-2 pb-1.5 px-1 rounded-2xl border ${
                    isSelected
                      ? 'bg-brand-50/70 dark:bg-brand-950/30 border-brand-500/60'
                      : 'bg-transparent border-transparent active:opacity-75'
                  }`}
                >
                  {/* Vertical Bar Pair */}
                  <View
                    className="flex-row items-end justify-center gap-1 w-full"
                    style={{ height: MAX_BAR_HEIGHT }}
                  >
                    <View
                      className={`w-2.5 sm:w-3 rounded-t-md ${
                        point.incomeMinor > 0
                          ? 'bg-emerald-500'
                          : 'bg-slate-200 dark:bg-slate-800'
                      }`}
                      style={{ height: incomeHeight }}
                    />
                    <View
                      className={`w-2.5 sm:w-3 rounded-t-md ${
                        point.expenseMinor > 0
                          ? 'bg-rose-500'
                          : 'bg-slate-200 dark:bg-slate-800'
                      }`}
                      style={{ height: expenseHeight }}
                    />
                  </View>

                  <ThemedText
                    className={`text-[11px] mt-2 ${
                      isSelected
                        ? 'font-extrabold text-brand-600 dark:text-brand-400'
                        : 'font-semibold text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {point.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {/* Focused Month Numeric Summary Strip */}
          {activePoint && (
            <View className="flex-row flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-slate-50 dark:bg-[#171f33] border border-slate-200/70 dark:border-slate-800/80">
              <View className="flex-row items-center gap-2">
                <ThemedText className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {formatPeriodMonthLabel(activePoint.periodMonth)}
                </ThemedText>
                {activePoint.savingsRatePercent !== null && (
                  <View
                    className={`px-2 py-0.5 rounded-full ${
                      activePoint.savingsRatePercent >= 0
                        ? 'bg-emerald-100 dark:bg-emerald-950/70'
                        : 'bg-rose-100 dark:bg-rose-950/70'
                    }`}
                  >
                    <ThemedText
                      className={`text-[10px] font-bold ${
                        activePoint.savingsRatePercent >= 0
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : 'text-rose-700 dark:text-rose-300'
                      }`}
                    >
                      {activePoint.savingsRatePercent >= 0
                        ? `Saved ${activePoint.savingsRatePercent}%`
                        : `Overspent ${Math.abs(activePoint.savingsRatePercent)}%`}
                    </ThemedText>
                  </View>
                )}
              </View>

              <View className="flex-row items-center gap-3 flex-wrap">
                <ThemedText className="text-xs font-semibold font-mono text-emerald-600 dark:text-emerald-400">
                  +{formatMinorUnits(activePoint.incomeMinor, currency)}
                </ThemedText>
                <ThemedText className="text-xs font-semibold font-mono text-rose-600 dark:text-rose-400">
                  -{formatMinorUnits(activePoint.expenseMinor, currency)}
                </ThemedText>
                <ThemedText
                  className={`text-xs font-extrabold font-mono ${
                    activePoint.netCashflowMinor >= 0
                      ? 'text-slate-900 dark:text-white'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  Net {activePoint.netCashflowMinor >= 0 ? '+' : ''}
                  {formatMinorUnits(activePoint.netCashflowMinor, currency)}
                </ThemedText>
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}
