import React from 'react';
import { Pressable, View } from 'react-native';
import type {
  CalculatorEvaluation,
  CalculatorKey,
  TransactionType,
} from '@repo/contracts';
import { ThemedText } from '@/common/components/themed-text';

export interface CalculatorKeypadProps {
  evaluation: CalculatorEvaluation;
  canSave: boolean;
  isSaving?: boolean;
  saveLabel?: string;
  transactionType?: TransactionType;
  onKeyPress: (key: CalculatorKey) => void;
  onClearAll?: () => void;
  onSave: () => void;
}

interface KeyConfig {
  key: CalculatorKey;
  label: string;
  accessibilityLabel: string;
  isOperator?: boolean;
  isAction?: boolean;
}

const KEY_ROWS: readonly (readonly KeyConfig[])[] = [
  [
    { key: '7', label: '7', accessibilityLabel: 'Key 7' },
    { key: '8', label: '8', accessibilityLabel: 'Key 8' },
    { key: '9', label: '9', accessibilityLabel: 'Key 9' },
    { key: '÷', label: '÷', accessibilityLabel: 'Divide', isOperator: true },
  ],
  [
    { key: '4', label: '4', accessibilityLabel: 'Key 4' },
    { key: '5', label: '5', accessibilityLabel: 'Key 5' },
    { key: '6', label: '6', accessibilityLabel: 'Key 6' },
    { key: '×', label: '×', accessibilityLabel: 'Multiply', isOperator: true },
  ],
  [
    { key: '1', label: '1', accessibilityLabel: 'Key 1' },
    { key: '2', label: '2', accessibilityLabel: 'Key 2' },
    { key: '3', label: '3', accessibilityLabel: 'Key 3' },
    { key: '-', label: '-', accessibilityLabel: 'Subtract', isOperator: true },
  ],
  [
    { key: '.', label: '.', accessibilityLabel: 'Decimal point' },
    { key: '0', label: '0', accessibilityLabel: 'Key 0' },
    { key: 'BACKSPACE', label: '⌫', accessibilityLabel: 'Backspace', isAction: true },
    { key: '+', label: '+', accessibilityLabel: 'Add', isOperator: true },
  ],
] as const;

const SAVE_CTA_STYLES: Record<TransactionType, string> = {
  EXPENSE: 'bg-rose-500 active:bg-rose-600 shadow-sm shadow-rose-500/25',
  INCOME: 'bg-emerald-500 active:bg-emerald-600 shadow-sm shadow-emerald-500/25',
  TRANSFER: 'bg-brand-500 active:bg-brand-600 shadow-sm shadow-brand-500/25',
};

export function CalculatorKeypad({
  evaluation,
  canSave,
  isSaving = false,
  saveLabel = '✓ Save',
  transactionType = 'EXPENSE',
  onKeyPress,
  onClearAll,
  onSave,
}: CalculatorKeypadProps) {
  const needsCalculation =
    evaluation.hasOperator || evaluation.endsWithOperator;

  const handleClearAll = () => {
    if (onClearAll) {
      onClearAll();
    } else {
      onKeyPress('CLEAR');
    }
  };

  return (
    <View className="w-full gap-2">
      {/* Compact 4x4 Keypad Grid (keeps >= 44px touch targets) */}
      <View className="gap-1.5">
        {KEY_ROWS.map((row, rowIndex) => (
          <View key={`row-${rowIndex}`} className="flex-row gap-1.5">
            {row.map((item) => {
              const isOp = item.isOperator;
              const isAction = item.isAction;

              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="button"
                  accessibilityLabel={item.accessibilityLabel}
                  onPress={() => onKeyPress(item.key)}
                  className={`flex-1 min-h-[44px] py-1 rounded-xl items-center justify-center border active:scale-95 ${
                    isOp
                      ? 'bg-brand-50/80 dark:bg-brand-950/40 border-brand-200/80 dark:border-brand-800/60 hover:bg-brand-100/70 dark:hover:bg-brand-900/50'
                      : isAction
                        ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-200/70 dark:hover:bg-slate-700/80'
                        : 'bg-white dark:bg-slate-800/70 border-slate-200/90 dark:border-slate-700/80 hover:bg-slate-100/70 dark:hover:bg-slate-800'
                  }`}
                >
                  <ThemedText
                    className={`${
                      isOp
                        ? 'text-lg font-extrabold text-brand-600 dark:text-brand-400'
                        : isAction
                          ? 'text-base font-bold text-slate-600 dark:text-slate-300'
                          : 'text-lg font-bold font-mono text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {item.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      {/* Action Bar: Explicit Clear All + Morphing Calculate (=) / Save CTA */}
      <View className="flex-row gap-1.5 pt-0.5">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear all"
          onPress={handleClearAll}
          className="min-h-[44px] min-w-[78px] px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 items-center justify-center active:scale-95 hover:bg-slate-200/70 dark:hover:bg-slate-700/80"
        >
          <ThemedText
            className="text-xs font-bold text-slate-700 dark:text-slate-200"
            numberOfLines={1}
          >
            Clear All
          </ThemedText>
        </Pressable>

        {needsCalculation ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Calculate expression"
            onPress={() => onKeyPress('=')}
            className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-brand-500 active:bg-brand-600 shadow-sm shadow-brand-500/25 items-center justify-center active:scale-[0.98]"
          >
            <ThemedText className="text-sm font-bold text-white" numberOfLines={1}>
              Calculate (=)
            </ThemedText>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={saveLabel}
            accessibilityState={{ disabled: !canSave || isSaving }}
            disabled={!canSave || isSaving}
            onPress={canSave && !isSaving ? onSave : undefined}
            className={`flex-1 min-h-[44px] px-3.5 rounded-xl items-center justify-center ${
              canSave && !isSaving
                ? `${SAVE_CTA_STYLES[transactionType]} active:scale-[0.98]`
                : 'bg-slate-200 dark:bg-slate-800 opacity-60'
            }`}
          >
            <ThemedText
              className={`text-sm font-bold ${
                canSave && !isSaving
                  ? 'text-white'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
              numberOfLines={1}
            >
              {isSaving ? 'Saving...' : saveLabel}
            </ThemedText>
          </Pressable>
        )}
      </View>
    </View>
  );
}
