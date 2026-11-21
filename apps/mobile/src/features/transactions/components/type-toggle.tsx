import React from 'react';
import { Pressable, View } from 'react-native';
import type { TransactionType } from '@repo/contracts';
import { ThemedText } from '@/common/components/themed-text';

export interface TypeToggleProps {
  value: TransactionType;
  onChange: (next: TransactionType) => void;
}

interface TypeOption {
  type: TransactionType;
  label: string;
  symbol: string;
  activeBg: string;
}

const TYPE_OPTIONS: readonly TypeOption[] = [
  {
    type: 'EXPENSE',
    label: 'Expense',
    symbol: '↓',
    activeBg: 'bg-rose-500 shadow-sm shadow-rose-500/30',
  },
  {
    type: 'INCOME',
    label: 'Income',
    symbol: '↑',
    activeBg: 'bg-emerald-500 shadow-sm shadow-emerald-500/30',
  },
  {
    type: 'TRANSFER',
    label: 'Transfer',
    symbol: '⇄',
    activeBg: 'bg-brand-500 shadow-sm shadow-brand-500/30',
  },
] as const;

export function TypeToggle({ value, onChange }: TypeToggleProps) {
  return (
    <View
      className="flex-row p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 w-full gap-1"
      accessibilityRole="tablist"
    >
      {TYPE_OPTIONS.map((option) => {
        const isSelected = value === option.type;
        return (
          <Pressable
            key={option.type}
            accessibilityRole="tab"
            accessibilityLabel={`${option.label} transaction type`}
            accessibilityState={{ selected: isSelected }}
            onPress={() => onChange(option.type)}
            className={`flex-1 min-h-[44px] px-2 rounded-xl flex-row items-center justify-center gap-1.5 ${
              isSelected ? option.activeBg : 'active:opacity-75'
            }`}
          >
            <ThemedText
              className={`text-xs font-extrabold ${
                isSelected ? 'text-white' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {option.symbol}
            </ThemedText>
            <ThemedText
              className={`text-xs sm:text-sm ${
                isSelected
                  ? 'text-white font-bold'
                  : 'text-slate-600 dark:text-slate-300 font-semibold'
              }`}
              numberOfLines={1}
            >
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}
