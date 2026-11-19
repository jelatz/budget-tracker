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
  activeBg: string;
}

const TYPE_OPTIONS: readonly TypeOption[] = [
  { type: 'EXPENSE', label: 'Expense', activeBg: 'bg-rose-500 shadow-sm shadow-rose-500/30' },
  { type: 'INCOME', label: 'Income', activeBg: 'bg-emerald-500 shadow-sm shadow-emerald-500/30' },
  { type: 'TRANSFER', label: 'Transfer', activeBg: 'bg-brand-500 shadow-sm shadow-brand-500/30' },
] as const;

export function TypeToggle({ value, onChange }: TypeToggleProps) {
  return (
    <View
      className="flex-row p-1 rounded-2xl bg-slate-200/80 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full"
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
            className={`flex-1 py-2.5 rounded-xl items-center justify-center ${
              isSelected ? option.activeBg : 'active:opacity-80'
            }`}
          >
            <ThemedText
              className={`text-sm ${
                isSelected
                  ? 'text-white font-bold'
                  : 'text-slate-600 dark:text-slate-400 font-semibold'
              }`}
            >
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}
