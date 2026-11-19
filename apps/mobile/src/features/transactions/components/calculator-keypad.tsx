import React from 'react';
import { Pressable, View } from 'react-native';
import type { CalculatorEvaluation, CalculatorKey } from '@repo/contracts';
import { ThemedText } from '@/common/components/themed-text';

export interface CalculatorKeypadProps {
  evaluation: CalculatorEvaluation;
  canSave: boolean;
  isSaving?: boolean;
  saveLabel?: string;
  onKeyPress: (key: CalculatorKey) => void;
  onSave: () => void;
}

interface KeyConfig {
  key: CalculatorKey;
  label: string;
  isOperator?: boolean;
  isAction?: boolean;
}

const KEY_ROWS: readonly (readonly KeyConfig[])[] = [
  [
    { key: '7', label: '7' },
    { key: '8', label: '8' },
    { key: '9', label: '9' },
    { key: '÷', label: '÷', isOperator: true },
  ],
  [
    { key: '4', label: '4' },
    { key: '5', label: '5' },
    { key: '6', label: '6' },
    { key: '×', label: '×', isOperator: true },
  ],
  [
    { key: '1', label: '1' },
    { key: '2', label: '2' },
    { key: '3', label: '3' },
    { key: '-', label: '-', isOperator: true },
  ],
  [
    { key: '.', label: '.' },
    { key: '0', label: '0' },
    { key: 'BACKSPACE', label: '⌫', isAction: true },
    { key: '+', label: '+', isOperator: true },
  ],
] as const;

export function CalculatorKeypad({
  evaluation,
  canSave,
  isSaving = false,
  saveLabel = 'Save',
  onKeyPress,
  onSave,
}: CalculatorKeypadProps) {
  const needsCalculation =
    evaluation.hasOperator || evaluation.endsWithOperator;

  return (
    <View className="w-full gap-2">
      {/* 4x4 Keypad Grid */}
      <View className="gap-2">
        {KEY_ROWS.map((row, rowIndex) => (
          <View key={`row-${rowIndex}`} className="flex-row gap-2">
            {row.map((item) => {
              const isOp = item.isOperator;
              const isAction = item.isAction;

              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="button"
                  accessibilityLabel={`Key ${item.label}`}
                  onPress={() => onKeyPress(item.key)}
                  className={`flex-1 min-h-[46px] sm:min-h-[52px] rounded-2xl items-center justify-center border active:scale-95 transition-all ${
                    isOp
                      ? 'bg-slate-100 dark:bg-slate-800 border-slate-200/60 dark:border-slate-700/60'
                      : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
                  }`}
                >
                  <ThemedText
                    className={`${
                      isOp
                        ? 'text-xl sm:text-2xl font-bold text-brand-500 dark:text-brand-400'
                        : isAction
                          ? 'text-lg sm:text-xl font-semibold text-slate-500 dark:text-slate-400'
                          : 'text-xl sm:text-2xl font-semibold text-slate-900 dark:text-slate-100'
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

      {/* Morphing Primary Action Bar */}
      <View className="flex-row gap-2 mt-1">
        {needsCalculation ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Calculate expression"
              onPress={() => onKeyPress('=')}
              className="flex-[3] min-h-[48px] sm:min-h-[56px] rounded-2xl bg-brand-500 active:bg-brand-600 shadow-md shadow-brand-500/25 items-center justify-center active:scale-95 transition-all"
            >
              <ThemedText className="text-base font-bold text-white">
                Calculate (=)
              </ThemedText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear calculator"
              onPress={() => onKeyPress('CLEAR')}
              className="flex-1 min-h-[48px] sm:min-h-[56px] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 items-center justify-center active:scale-95 transition-all"
            >
              <ThemedText className="text-lg font-bold text-slate-500 dark:text-slate-400">
                C
              </ThemedText>
            </Pressable>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={saveLabel}
            accessibilityState={{ disabled: !canSave || isSaving }}
            disabled={!canSave || isSaving}
            onPress={canSave && !isSaving ? onSave : undefined}
            className={`flex-1 min-h-[48px] sm:min-h-[56px] rounded-2xl items-center justify-center transition-all ${
              canSave && !isSaving
                ? 'bg-brand-500 active:bg-brand-600 shadow-md shadow-brand-500/25 active:scale-[0.98]'
                : 'bg-slate-200 dark:bg-slate-800 opacity-60'
            }`}
          >
            <ThemedText
              className={`text-base font-bold ${
                canSave && !isSaving
                  ? 'text-white'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              {isSaving ? 'Saving...' : saveLabel}
            </ThemedText>
          </Pressable>
        )}
      </View>
    </View>
  );
}
