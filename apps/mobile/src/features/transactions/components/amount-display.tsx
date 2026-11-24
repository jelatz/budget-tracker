import React from 'react';
import { Pressable, View } from 'react-native';
import {
  DEFAULT_CURRENCY,
  formatMinorUnits,
  type CalculatorEvaluation,
  type TransactionType,
} from '@repo/contracts';
import { AppIcon } from '@/common/components/app-icon';
import { ThemedText } from '@/common/components/themed-text';
import { useTheme } from '@/common/hooks/use-theme';

export interface AmountDisplayProps {
  type: TransactionType;
  evaluation: CalculatorEvaluation;
  currency?: string;
  splitCount?: number;
  isCalculatorFocused?: boolean;
  showKeyboardHint?: boolean;
  standaloneBorder?: boolean;
  onActivateCalculator?: () => void;
}

const TYPE_PANEL_STYLES: Record<
  TransactionType,
  {
    container: string;
    standaloneContainer: string;
    standaloneInactiveBorder: string;
    standaloneActiveBorder: string;
    text: string;
    badgeActive: string;
    badgeTextActive: string;
    hint: string;
    prefix: string;
  }
> = {
  EXPENSE: {
    container: 'bg-ledger-surface dark:bg-ledger-surface-dark border-ledger-border dark:border-ledger-border-dark',
    standaloneContainer: 'bg-ledger-subtle dark:bg-ledger-subtle-dark',
    standaloneInactiveBorder: 'border border-ledger-border-strong dark:border-ledger-border-strong-dark',
    standaloneActiveBorder: 'border-2 border-ledger-terracotta dark:border-ledger-terracotta-dark',
    text: 'text-ledger-terracotta dark:text-ledger-terracotta-dark',
    badgeActive: 'bg-ledger-terracotta dark:bg-ledger-terracotta-dark',
    badgeTextActive: 'text-ledger-canvas dark:text-ledger-canvas-dark',
    hint: 'Expense Amount',
    prefix: '−',
  },
  INCOME: {
    container: 'bg-ledger-surface dark:bg-ledger-surface-dark border-ledger-border dark:border-ledger-border-dark',
    standaloneContainer: 'bg-ledger-subtle dark:bg-ledger-subtle-dark',
    standaloneInactiveBorder: 'border border-ledger-border-strong dark:border-ledger-border-strong-dark',
    standaloneActiveBorder: 'border-2 border-ledger-pine dark:border-ledger-pine-dark',
    text: 'text-ledger-pine dark:text-ledger-pine-dark',
    badgeActive: 'bg-ledger-pine dark:bg-ledger-pine-dark',
    badgeTextActive: 'text-ledger-canvas dark:text-ledger-canvas-dark',
    hint: 'Income Deposit',
    prefix: '+',
  },
  TRANSFER: {
    container: 'bg-ledger-surface dark:bg-ledger-surface-dark border-ledger-border dark:border-ledger-border-dark',
    standaloneContainer: 'bg-ledger-subtle dark:bg-ledger-subtle-dark',
    standaloneInactiveBorder: 'border border-ledger-border-strong dark:border-ledger-border-strong-dark',
    standaloneActiveBorder: 'border-2 border-ledger-teal dark:border-ledger-teal-dark',
    text: 'text-ledger-teal dark:text-ledger-teal-dark',
    badgeActive: 'bg-ledger-teal dark:bg-ledger-teal-dark',
    badgeTextActive: 'text-ledger-canvas dark:text-ledger-canvas-dark',
    hint: 'Account Transfer',
    prefix: '',
  },
};

export function AmountDisplay({
  type,
  evaluation,
  currency = DEFAULT_CURRENCY,
  splitCount = 0,
  isCalculatorFocused = false,
  showKeyboardHint = false,
  standaloneBorder = false,
  onActivateCalculator,
}: AmountDisplayProps) {
  const theme = useTheme();
  const themeStyle = TYPE_PANEL_STYLES[type];
  const formattedAmount = formatMinorUnits(
    Math.max(0, evaluation.previewMinor),
    currency,
  );

  const showFormula =
    evaluation.hasOperator || evaluation.displayExpression !== '0';
  const isDivideByZero = evaluation.error === 'DIVIDE_BY_ZERO';

  const surfaceAndBorderClass = standaloneBorder
    ? `${themeStyle.standaloneContainer} ${
        isCalculatorFocused
          ? themeStyle.standaloneActiveBorder
          : themeStyle.standaloneInactiveBorder
      }`
    : `border ${themeStyle.container}`;

  const panelClass = `w-full rounded-xl px-3.5 py-2.5 ${surfaceAndBorderClass}`;

  const content = (
    <View className={panelClass}>
      {/* Secondary Row: Type Hint / Live Formula & Keyboard Status Pill */}
      <View className="flex-row items-center justify-between min-h-[24px] gap-2">
        {showFormula ? (
          <ThemedText
            numeric
            className="text-xs font-mono font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary flex-1"
            numberOfLines={1}
            ellipsizeMode="head"
          >
            {evaluation.displayExpression}
          </ThemedText>
        ) : (
          <ThemedText
            className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted flex-1"
            numberOfLines={1}
          >
            {themeStyle.hint}
          </ThemedText>
        )}

        {showKeyboardHint && (
          <View
            className={`px-2 py-0.5 rounded-full flex-row items-center gap-1 ${
              isCalculatorFocused
                ? themeStyle.badgeActive
                : 'bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark'
            }`}
          >
            <AppIcon
              name="keyboard"
              size={12}
              color={isCalculatorFocused ? theme.onPrimary : theme.textSecondary}
            />
            <ThemedText
              className={`text-[10px] font-bold ${
                isCalculatorFocused
                  ? themeStyle.badgeTextActive
                  : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
              }`}
              numberOfLines={1}
            >
              {isCalculatorFocused ? 'Keyboard active' : 'Click to type'}
            </ThemedText>
          </View>
        )}
      </View>

      {/* Main Row: Formatted Hero Amount & Optional Split Badge */}
      <View className="flex-row items-baseline justify-between flex-wrap gap-2 mt-0.5">
        <View className="flex-row items-center gap-1.5 flex-1 min-w-0">
          {type === 'TRANSFER' && (
            <AppIcon name="transfer" size={22} color={theme.info} />
          )}
          <ThemedText
            numeric
            className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${themeStyle.text}`}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.65}
          >
            {themeStyle.prefix}
            {formattedAmount}
          </ThemedText>
        </View>

        {splitCount >= 2 && (
          <View className="px-2.5 py-1 rounded-full bg-ledger-teal-soft dark:bg-ledger-teal-dark-soft border border-ledger-border dark:border-ledger-border-dark flex-row items-center gap-1">
            <AppIcon name="split" size={12} color={theme.info} />
            <ThemedText
              numeric
              className="text-xs font-bold text-ledger-teal dark:text-ledger-teal-dark"
            >
              Split ({splitCount})
            </ThemedText>
          </View>
        )}
      </View>

      {/* Warning Row: Subtle Divide-by-zero notice */}
      {isDivideByZero && (
        <View className="mt-1.5 flex-row items-center gap-1.5" accessibilityRole="alert">
          <AppIcon name="warning" size={13} color={theme.negative} />
          <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
            Cannot divide by zero
          </ThemedText>
        </View>
      )}
    </View>
  );

  if (onActivateCalculator) {
    return (
      <Pressable
        onPress={onActivateCalculator}
        accessibilityRole="button"
        accessibilityLabel="Focus calculator to type transaction amount"
        className="w-full min-h-[44px]"
      >
        {content}
      </Pressable>
    );
  }

  return content;
}
