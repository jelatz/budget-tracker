import React from 'react';
import { Pressable, View } from 'react-native';
import type { TransactionType } from '@repo/contracts';
import { AppIcon, type AppIconName } from '@/common/components/app-icon';
import { ThemedText } from '@/common/components/themed-text';
import { useTheme } from '@/common/hooks/use-theme';

export interface TypeToggleProps {
  value: TransactionType;
  onChange: (next: TransactionType) => void;
}

interface TypeOption {
  type: TransactionType;
  label: string;
  icon: AppIconName;
  activeBg: string;
}

const TYPE_OPTIONS: readonly TypeOption[] = [
  {
    type: 'EXPENSE',
    label: 'Expense',
    icon: 'arrowDown',
    activeBg: 'bg-ledger-terracotta dark:bg-ledger-terracotta-dark',
  },
  {
    type: 'INCOME',
    label: 'Income',
    icon: 'arrowUp',
    activeBg: 'bg-ledger-pine dark:bg-ledger-pine-dark',
  },
  {
    type: 'TRANSFER',
    label: 'Transfer',
    icon: 'transfer',
    activeBg: 'bg-ledger-teal dark:bg-ledger-teal-dark',
  },
] as const;

export function TypeToggle({ value, onChange }: TypeToggleProps) {
  const theme = useTheme();

  return (
    <View
      className="flex-row p-1 rounded-2xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark w-full gap-1"
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
            <AppIcon
              name={option.icon}
              size={14}
              color={isSelected ? theme.onPrimary : theme.textSecondary}
            />
            <ThemedText
              className={`text-xs sm:text-sm ${
                isSelected
                  ? 'text-ledger-canvas dark:text-ledger-canvas-dark font-bold'
                  : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary font-semibold'
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
