import React from 'react';
import { Pressable, View } from 'react-native';
import type {
  CalculatorEvaluation,
  CalculatorKey,
  TransactionType,
} from '@repo/contracts';
import { AppIcon } from '@/common/components/app-icon';
import { ThemedText } from '@/common/components/themed-text';
import { useTheme } from '@/common/hooks/use-theme';

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
    { key: 'BACKSPACE', label: 'Backspace', accessibilityLabel: 'Backspace', isAction: true },
    { key: '+', label: '+', accessibilityLabel: 'Add', isOperator: true },
  ],
] as const;

const SAVE_CTA_STYLES: Record<TransactionType, string> = {
  EXPENSE: 'bg-ledger-terracotta dark:bg-ledger-terracotta-dark active:opacity-90',
  INCOME: 'bg-ledger-pine dark:bg-ledger-pine-dark active:opacity-90',
  TRANSFER: 'bg-brand-500 dark:bg-brand-400 active:opacity-90',
};

export function CalculatorKeypad({
  evaluation,
  canSave,
  isSaving = false,
  saveLabel = 'Save',
  transactionType = 'EXPENSE',
  onKeyPress,
  onClearAll,
  onSave,
}: CalculatorKeypadProps) {
  const theme = useTheme();
  const needsCalculation =
    evaluation.hasOperator || evaluation.endsWithOperator;

  const cleanSaveLabel = saveLabel.replace(/^✓\s*/, '');

  const handleClearAll = () => {
    if (onClearAll) {
      onClearAll();
    } else {
      onKeyPress('CLEAR');
    }
  };

  return (
    <View className="w-full gap-2">
      {/* Tactile 4x4 Keypad Grid (keeps >= 44px touch targets) */}
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
                      ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-200 dark:border-ledger-border-dark hover:bg-brand-100 dark:hover:bg-ledger-selected-dark'
                      : isAction
                        ? 'bg-ledger-surface dark:bg-ledger-surface-dark border-ledger-border-strong dark:border-ledger-border-strong-dark hover:bg-ledger-selected dark:hover:bg-ledger-selected-dark'
                        : 'bg-ledger-surface dark:bg-ledger-surface-dark border-ledger-border dark:border-ledger-border-dark hover:bg-ledger-selected dark:hover:bg-ledger-selected-dark'
                  }`}
                >
                  {isAction ? (
                    <AppIcon name="backspace" size={20} color={theme.textSecondary} />
                  ) : (
                    <ThemedText
                      numeric={!isOp}
                      className={
                        isOp
                          ? 'text-lg font-extrabold text-brand-500 dark:text-brand-400'
                          : 'text-lg font-bold text-ledger-ink dark:text-ledger-ink-dark'
                      }
                    >
                      {item.label}
                    </ThemedText>
                  )}
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
          className="min-h-[44px] min-w-[78px] px-3 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark items-center justify-center active:scale-95 hover:bg-ledger-selected dark:hover:bg-ledger-selected-dark"
        >
          <ThemedText
            className="text-xs font-bold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
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
            className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-brand-500 dark:bg-brand-400 items-center justify-center active:scale-[0.98]"
          >
            <ThemedText
              className="text-sm font-bold text-ledger-canvas dark:text-ledger-canvas-dark"
              numberOfLines={1}
            >
              Calculate (=)
            </ThemedText>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={cleanSaveLabel}
            accessibilityState={{ disabled: !canSave || isSaving }}
            disabled={!canSave || isSaving}
            onPress={canSave && !isSaving ? onSave : undefined}
            className={`flex-1 min-h-[44px] px-3.5 rounded-xl flex-row items-center justify-center gap-1.5 ${
              canSave && !isSaving
                ? `${SAVE_CTA_STYLES[transactionType]} active:scale-[0.98]`
                : 'bg-ledger-selected dark:bg-ledger-selected-dark border border-ledger-border dark:border-ledger-border-dark opacity-70'
            }`}
          >
            <AppIcon
              name="check"
              size={15}
              color={canSave && !isSaving ? theme.onPrimary : theme.textMuted}
            />
            <ThemedText
              numeric
              className={`text-sm font-bold ${
                canSave && !isSaving
                  ? 'text-ledger-canvas dark:text-ledger-canvas-dark'
                  : 'text-ledger-ink-muted dark:text-ledger-ink-dark-muted'
              }`}
              numberOfLines={1}
            >
              {isSaving ? 'Saving...' : cleanSaveLabel}
            </ThemedText>
          </Pressable>
        )}
      </View>
    </View>
  );
}
