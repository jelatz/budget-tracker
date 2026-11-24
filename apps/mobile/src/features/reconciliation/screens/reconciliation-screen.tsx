import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  computeReconciliationDelta,
  DEFAULT_CURRENCY_SYMBOL,
  formatMinorUnits,
  getAccountTypeLabel,
  minorUnitsToDecimalInput,
  normalizeDecimalInput,
  parseDecimalToMinorUnits,
  type Account,
  type BalanceReconciliation,
} from '@repo/contracts';

import { AppIcon } from '@/common/components/app-icon';
import { ThemedText } from '@/common/components/themed-text';
import {
  BottomTabInset,
  TABULAR_NUMS_STYLE,
  WebMaxPageWidth,
} from '@/common/constants/theme';
import { useRequireAuth } from '@/common/hooks/use-require-auth';
import { useTheme } from '@/common/hooks/use-theme';
import {
  useAccounts,
  useApplyReconciliation,
  useReconciliations,
} from '@/features/transactions/hooks/use-transactions';

const EMPTY_ACCOUNTS: Account[] = [];
const EMPTY_HISTORY: BalanceReconciliation[] = [];

export function ReconciliationScreen() {
  const { isAuthenticated, isHydrating } = useRequireAuth();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 768;

  const {
    data: accounts = EMPTY_ACCOUNTS,
    isLoading: isAccountsLoading,
    isError: isAccountsError,
    refetch: refetchAccounts,
  } = useAccounts();
  const applyMutation = useApplyReconciliation();

  // Selected account state
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const selectedAccount: Account | undefined = useMemo(() => {
    return accounts.find((a) => a.id === selectedAccountId) ?? accounts[0];
  }, [accounts, selectedAccountId]);

  // Form states
  const [actualBalanceInput, setActualBalanceInput] = useState<string>('');
  const [createAdjustment, setCreateAdjustment] = useState<boolean>(true);
  const [notes, setNotes] = useState<string>('Balance adjustment');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  // Initialize selected account and actual balance input
  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0].id);
      setActualBalanceInput(minorUnitsToDecimalInput(accounts[0].balanceMinor));
    }
  }, [accounts, selectedAccountId]);

  // When switching account, reset input to that account's current balance
  const handleSelectAccount = (account: Account) => {
    setSelectedAccountId(account.id);
    setActualBalanceInput(minorUnitsToDecimalInput(account.balanceMinor));
    setToastMessage(null);
    setErrorText(null);
  };

  // Reconciliations history query for selected account
  const {
    data: history = EMPTY_HISTORY,
    isLoading: isHistoryLoading,
    isError: isHistoryError,
    refetch: refetchHistory,
  } = useReconciliations(selectedAccount?.id);

  // Live calculation of discrepancy
  const currentAppBalanceMinor = selectedAccount?.balanceMinor ?? 0;
  const parsedActualMinor = parseDecimalToMinorUnits(actualBalanceInput);

  const deltaResult = useMemo(() => {
    if (parsedActualMinor === null) return null;
    return computeReconciliationDelta(currentAppBalanceMinor, parsedActualMinor);
  }, [currentAppBalanceMinor, parsedActualMinor]);

  const handleApplyAdjustment = async () => {
    if (!selectedAccount) return;
    if (parsedActualMinor === null) {
      setErrorText('Please enter a valid numeric actual balance.');
      return;
    }

    setErrorText(null);
    try {
      const result = await applyMutation.mutateAsync({
        accountId: selectedAccount.id,
        actualBalanceMinor: parsedActualMinor,
        createAdjustment,
        notes: notes.trim() || 'Balance adjustment',
      });

      const formattedActual = formatMinorUnits(parsedActualMinor, selectedAccount.currency);
      const adjustmentNotice = result.adjustmentTransaction
        ? ' (Adjustment transaction recorded)'
        : '';
      setToastMessage(`Account reconciled to ${formattedActual}${adjustmentNotice}`);
    } catch (err: unknown) {
      setErrorText(err instanceof Error ? err.message : 'Failed to apply reconciliation.');
    }
  };

  const handleQuickDelta = (deltaCents: number) => {
    if (parsedActualMinor === null) return;
    const nextMinor = parsedActualMinor + deltaCents;
    setActualBalanceInput(minorUnitsToDecimalInput(nextMinor));
  };

  const handleMatchAppBalance = () => {
    if (selectedAccount) {
      setActualBalanceInput(minorUnitsToDecimalInput(selectedAccount.balanceMinor));
    }
  };

  if (isHydrating) {
    return (
      <View className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark items-center justify-center">
        <SafeAreaView style={{ flex: 1 }} className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={theme.primary} />
        </SafeAreaView>
      </View>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <View className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark">
      <SafeAreaView style={{ flex: 1 }} className="flex-1" edges={['top', 'bottom', 'left', 'right']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          className="flex-1"
        >
          {/* Mobile / Standalone Top Bar Header (hidden when Desktop sidebar is visible) */}
          {!isDesktopWeb && (
            <View className="px-4 py-3 border-b border-ledger-border dark:border-ledger-border-dark bg-ledger-surface dark:bg-ledger-surface-dark">
              <View className="flex-row items-center justify-between gap-2">
                <Pressable
                  onPress={() => {
                    if (router.canGoBack()) {
                      router.back();
                    } else {
                      router.replace('/dashboard');
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Go back"
                  className="min-h-[44px] px-3.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark active:opacity-75 flex-row items-center gap-1.5"
                >
                  <AppIcon name="back" size={16} color={theme.text} />
                  <ThemedText className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                    Back
                  </ThemedText>
                </Pressable>

                <View className="items-center flex-1 px-1">
                  <ThemedText
                    accessibilityRole="header"
                    className="text-base font-extrabold text-ledger-ink dark:text-ledger-ink-dark text-center"
                    numberOfLines={1}
                  >
                    Reconciliation
                  </ThemedText>
                  <ThemedText
                    className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary text-center"
                    numberOfLines={1}
                  >
                    Actual vs. ledger balance check
                  </ThemedText>
                </View>

                <View className="w-16" />
              </View>
            </View>
          )}

          <ScrollView
            className="flex-1"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              width: '100%',
              paddingHorizontal: 16,
              paddingTop: 16,
              paddingBottom: Math.max(96, BottomTabInset + 32),
              gap: 18,
              ...(Platform.OS === 'web'
                ? { maxWidth: WebMaxPageWidth, alignSelf: 'center' as const }
                : {}),
            }}
            showsVerticalScrollIndicator={false}
          >
            {/* Desktop Web Editorial Header */}
            {isDesktopWeb && (
              <View className="gap-0.5">
                <ThemedText
                  accessibilityRole="header"
                  className="text-[28px] leading-9 font-extrabold tracking-tight text-ledger-ink dark:text-ledger-ink-dark"
                >
                  Reconciliation
                </ThemedText>
                <ThemedText className="text-sm text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                  Compare actual statement balances with your ledger records
                </ThemedText>
              </View>
            )}

            {/* Non-blocking Success Toast Banner */}
            {toastMessage && (
              <View className="px-4 py-3 rounded-2xl bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-between gap-2.5">
                <AppIcon name="checkCircle" size={16} color={theme.positive} />
                <ThemedText className="flex-1 text-xs font-semibold text-ledger-pine dark:text-ledger-pine-dark">
                  {toastMessage}
                </ThemedText>
                <Pressable
                  onPress={() => setToastMessage(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss message"
                  className="min-w-[44px] min-h-[44px] items-center justify-center active:opacity-75"
                >
                  <AppIcon name="close" size={15} color={theme.positive} />
                </Pressable>
              </View>
            )}

            {/* Error Banner */}
            {errorText && (
              <View
                accessibilityRole="alert"
                className="p-3.5 rounded-2xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark flex-row items-center gap-2"
              >
                <AppIcon name="warning" size={16} color={theme.negative} />
                <ThemedText className="flex-1 text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                  {errorText}
                </ThemedText>
              </View>
            )}

            {/* 1. Account Selector Tabs */}
            <View className="gap-2">
              <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                Select Account to Reconcile
              </ThemedText>

              {isAccountsLoading ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : isAccountsError ? (
                <View className="p-4 rounded-2xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark gap-2.5 items-start">
                  <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                    Unable to load accounts right now.
                  </ThemedText>
                  <Pressable
                    onPress={() => {
                      void refetchAccounts();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Retry loading accounts"
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-ledger-terracotta dark:bg-ledger-terracotta-dark items-center justify-center active:opacity-85"
                  >
                    <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
                      Retry
                    </ThemedText>
                  </Pressable>
                </View>
              ) : accounts.length === 0 ? (
                <View className="p-5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-dashed border-ledger-border-strong dark:border-ledger-border-strong-dark items-center gap-2.5">
                  <View className="w-12 h-12 rounded-2xl bg-ledger-subtle dark:bg-ledger-subtle-dark items-center justify-center">
                    <AppIcon name="accounts" size={24} color={theme.textMuted} />
                  </View>
                  <ThemedText className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark">
                    No accounts available
                  </ThemedText>
                  <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary text-center">
                    Add an account first to start reconciling balances.
                  </ThemedText>
                  <Pressable
                    onPress={() => router.push('/accounts')}
                    accessibilityRole="button"
                    accessibilityLabel="Add account"
                    className="min-h-[44px] px-4 py-2.5 rounded-xl bg-brand-500 active:bg-brand-600 dark:bg-brand-400 flex-row items-center justify-center gap-1.5"
                  >
                    <AppIcon name="add" size={15} color={theme.onPrimary} />
                    <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-brand-900">
                      Add Account
                    </ThemedText>
                  </Pressable>
                </View>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
                >
                  {accounts.map((account) => {
                    const isSelected = selectedAccount?.id === account.id;
                    const formatted = formatMinorUnits(account.balanceMinor, account.currency);
                    const isNegative = account.balanceMinor < 0;
                    return (
                      <Pressable
                        key={account.id}
                        onPress={() => handleSelectAccount(account)}
                        accessibilityRole="button"
                        accessibilityLabel={`Select ${account.name}`}
                        accessibilityState={{ selected: isSelected }}
                        className={`min-h-[44px] p-3.5 rounded-2xl border min-w-[152px] gap-0.5 ${
                          isSelected
                            ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-500 dark:border-brand-400'
                            : 'bg-ledger-surface dark:bg-ledger-surface-dark border-ledger-border dark:border-ledger-border-dark active:opacity-75'
                        }`}
                      >
                        <View className="flex-row items-center gap-1.5 mb-0.5">
                          <ThemedText className="text-base">{account.icon}</ThemedText>
                          <ThemedText
                            className={`text-xs font-bold flex-1 ${
                              isSelected
                                ? 'text-brand-500 dark:text-brand-400'
                                : 'text-ledger-ink dark:text-ledger-ink-dark'
                            }`}
                            numberOfLines={1}
                          >
                            {account.name}
                          </ThemedText>
                        </View>
                        <ThemedText className="text-[11px] font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                          {getAccountTypeLabel(account.accountType)}
                        </ThemedText>
                        <ThemedText
                          numeric
                          className={`text-sm font-extrabold ${
                            isNegative
                              ? 'text-ledger-terracotta dark:text-ledger-terracotta-dark'
                              : isSelected
                                ? 'text-brand-500 dark:text-brand-400'
                                : 'text-ledger-ink dark:text-ledger-ink-dark'
                          }`}
                        >
                          {formatted}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            {/* 2. Selected Account Card & Statement Input */}
            {selectedAccount && (
              <View className="p-5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark gap-4">
                {/* Current App Balance Info */}
                <View className="flex-row items-center justify-between gap-3 pb-3.5 border-b border-ledger-border dark:border-ledger-border-dark">
                  <View className="flex-row items-center gap-2.5 flex-1 min-w-0">
                    <View className="w-10 h-10 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center shrink-0">
                      <ThemedText className="text-xl">{selectedAccount.icon}</ThemedText>
                    </View>
                    <View className="flex-1 min-w-0">
                      <ThemedText
                        className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark"
                        numberOfLines={1}
                      >
                        {selectedAccount.name}
                      </ThemedText>
                      <ThemedText
                        className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                        numberOfLines={1}
                      >
                        {getAccountTypeLabel(selectedAccount.accountType)} · Book Balance
                      </ThemedText>
                    </View>
                  </View>

                  <View className="items-end shrink-0">
                    <ThemedText
                      numeric
                      className={`text-lg font-extrabold ${
                        selectedAccount.balanceMinor < 0
                          ? 'text-ledger-terracotta dark:text-ledger-terracotta-dark'
                          : 'text-ledger-ink dark:text-ledger-ink-dark'
                      }`}
                    >
                      {formatMinorUnits(selectedAccount.balanceMinor, selectedAccount.currency)}
                    </ThemedText>
                    <ThemedText className="text-[11px] text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                      Calculated Balance
                    </ThemedText>
                  </View>
                </View>

                {/* Actual Statement Balance Well */}
                <View className="gap-2.5">
                  <View className="p-4 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark gap-2">
                    <View className="flex-row flex-wrap items-center justify-between gap-2">
                      <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                        Actual Statement Balance ({DEFAULT_CURRENCY_SYMBOL})
                      </ThemedText>
                      <Pressable
                        onPress={handleMatchAppBalance}
                        accessibilityRole="button"
                        accessibilityLabel={`Reset to app balance of ${formatMinorUnits(selectedAccount.balanceMinor, selectedAccount.currency)}`}
                        hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                        className="min-h-[32px] px-2.5 py-1 rounded-lg bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center gap-1 active:opacity-75"
                      >
                        <AppIcon name="sync" size={12} color={theme.primary} />
                        <ThemedText numeric className="text-xs font-semibold text-brand-500 dark:text-brand-400">
                          Match ({formatMinorUnits(selectedAccount.balanceMinor, selectedAccount.currency)})
                        </ThemedText>
                      </Pressable>
                    </View>

                    <View className="flex-row items-center">
                      <ThemedText className="text-xl font-bold text-ledger-ink-muted dark:text-ledger-ink-dark-muted mr-2">
                        {DEFAULT_CURRENCY_SYMBOL}
                      </ThemedText>
                      <TextInput
                        value={actualBalanceInput}
                        onChangeText={(val) => {
                          setActualBalanceInput(normalizeDecimalInput(val));
                          setToastMessage(null);
                          if (errorText) setErrorText(null);
                        }}
                        placeholder="0.00"
                        placeholderTextColor={theme.textMuted}
                        accessibilityLabel="Actual account balance"
                        keyboardType="decimal-pad"
                        inputMode="decimal"
                        autoCorrect={false}
                        spellCheck={false}
                        autoComplete="off"
                        style={TABULAR_NUMS_STYLE}
                        className="flex-1 min-h-[44px] text-ledger-ink dark:text-ledger-ink-dark text-2xl sm:text-3xl font-extrabold tracking-tight"
                      />
                    </View>
                  </View>

                  {/* Quick Delta Adjuster Helpers */}
                  <View className="flex-row items-center gap-1.5 flex-wrap pt-0.5">
                    <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mr-1">
                      Quick nudge:
                    </ThemedText>
                    <Pressable
                      onPress={() => handleQuickDelta(-5000)}
                      accessibilityRole="button"
                      accessibilityLabel="Subtract 50"
                      className="min-h-[44px] px-3 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                    >
                      <ThemedText numeric className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                        -{DEFAULT_CURRENCY_SYMBOL}50
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => handleQuickDelta(-1000)}
                      accessibilityRole="button"
                      accessibilityLabel="Subtract 10"
                      className="min-h-[44px] px-3 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                    >
                      <ThemedText numeric className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                        -{DEFAULT_CURRENCY_SYMBOL}10
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => handleQuickDelta(1000)}
                      accessibilityRole="button"
                      accessibilityLabel="Add 10"
                      className="min-h-[44px] px-3 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                    >
                      <ThemedText numeric className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                        +{DEFAULT_CURRENCY_SYMBOL}10
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => handleQuickDelta(5000)}
                      accessibilityRole="button"
                      accessibilityLabel="Add 50"
                      className="min-h-[44px] px-3 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                    >
                      <ThemedText numeric className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                        +{DEFAULT_CURRENCY_SYMBOL}50
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>

                {/* 3. Live Discrepancy Card */}
                {deltaResult !== null && (
                  <View className="pt-1">
                    {deltaResult.discrepancyMinor === 0 ? (
                      /* Balanced State */
                      <View className="p-4 rounded-2xl bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft border border-ledger-border dark:border-ledger-border-dark gap-2 items-center">
                        <View className="w-10 h-10 rounded-full bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center">
                          <AppIcon name="checkCircle" size={22} color={theme.positive} />
                        </View>
                        <ThemedText className="text-sm font-bold text-ledger-pine dark:text-ledger-pine-dark text-center">
                          Account is balanced
                        </ThemedText>
                        <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary text-center">
                          App records match your actual bank balance to the cent. No adjustment is necessary.
                        </ThemedText>
                      </View>
                    ) : (
                      /* Discrepancy Detected State */
                      <View className="gap-3">
                        <View
                          className={`p-4 rounded-2xl border gap-2 ${
                            deltaResult.discrepancyMinor < 0
                              ? 'bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border-ledger-border dark:border-ledger-border-dark'
                              : 'bg-ledger-ochre-soft dark:bg-ledger-ochre-dark-soft border-ledger-border dark:border-ledger-border-dark'
                          }`}
                        >
                          <View className="flex-row items-start justify-between gap-2">
                            <View className="flex-row items-start gap-2 flex-1">
                              <View className="mt-0.5">
                                <AppIcon
                                  name="warning"
                                  size={16}
                                  color={
                                    deltaResult.discrepancyMinor < 0
                                      ? theme.negative
                                      : theme.warning
                                  }
                                />
                              </View>
                              <View className="flex-1">
                                <ThemedText
                                  numeric
                                  className={`text-xs font-bold ${
                                    deltaResult.discrepancyMinor < 0
                                      ? 'text-ledger-terracotta dark:text-ledger-terracotta-dark'
                                      : 'text-ledger-ochre dark:text-ledger-ochre-dark'
                                  }`}
                                >
                                  {deltaResult.discrepancyMinor > 0 ? '+' : ''}
                                  {formatMinorUnits(
                                    deltaResult.discrepancyMinor,
                                    selectedAccount.currency,
                                  )}{' '}
                                  Discrepancy Found
                                </ThemedText>
                                <ThemedText
                                  numeric
                                  className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mt-0.5"
                                >
                                  {deltaResult.discrepancyMinor < 0
                                    ? `Ledger shows ${formatMinorUnits(Math.abs(deltaResult.discrepancyMinor), selectedAccount.currency)} more than statement.`
                                    : `Statement has ${formatMinorUnits(deltaResult.discrepancyMinor, selectedAccount.currency)} more than ledger.`}
                                </ThemedText>
                              </View>
                            </View>
                          </View>
                        </View>

                        {/* Auto-adjustment Switch */}
                        <View className="flex-row items-center justify-between p-3.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark">
                          <View className="flex-1 mr-3">
                            <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                              Create auto-adjustment transaction
                            </ThemedText>
                            <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                              Records a {deltaResult.adjustmentType} entry tagged &quot;reconciliation&quot;.
                            </ThemedText>
                          </View>
                          <Switch
                            value={createAdjustment}
                            onValueChange={setCreateAdjustment}
                            trackColor={{ false: theme.borderStrong, true: theme.primary }}
                            thumbColor={theme.surface}
                            accessibilityLabel="Create auto-adjustment transaction"
                          />
                        </View>

                        {/* Note Input */}
                        <View className="gap-1">
                          <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                            Adjustment Note
                          </ThemedText>
                          <TextInput
                            value={notes}
                            onChangeText={setNotes}
                            placeholder="e.g. Month-end statement sanity check"
                            placeholderTextColor={theme.textMuted}
                            accessibilityLabel="Adjustment note"
                            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-ledger-border-strong dark:border-ledger-border-strong-dark bg-ledger-canvas dark:bg-ledger-subtle-dark text-ledger-ink dark:text-ledger-ink-dark text-sm"
                          />
                        </View>

                        {/* Apply Reconciliation Button */}
                        <Pressable
                          onPress={handleApplyAdjustment}
                          disabled={applyMutation.isPending}
                          accessibilityRole="button"
                          accessibilityLabel="Apply reconciliation adjustment"
                          className={`w-full min-h-[48px] py-3 px-4 rounded-xl bg-brand-500 active:bg-brand-600 dark:bg-brand-400 flex-row items-center justify-center gap-2 ${
                            applyMutation.isPending ? 'opacity-70' : ''
                          }`}
                        >
                          {applyMutation.isPending ? (
                            <ActivityIndicator size="small" color={theme.onPrimary} />
                          ) : (
                            <>
                              <AppIcon name="check" size={16} color={theme.onPrimary} />
                              <ThemedText
                                numeric
                                className="text-ledger-canvas dark:text-brand-900 font-bold text-sm"
                              >
                                Apply Reconciliation (
                                {deltaResult.discrepancyMinor > 0 ? '+' : ''}
                                {formatMinorUnits(deltaResult.discrepancyMinor, selectedAccount.currency)}
                                )
                              </ThemedText>
                            </>
                          )}
                        </Pressable>
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* 4. Reconciliation History Section */}
            <View className="p-5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark gap-3">
              <View className="flex-row items-center justify-between">
                <ThemedText className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark">
                  Reconciliation History
                </ThemedText>
                <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                  {selectedAccount?.name ?? 'Account'} Log
                </ThemedText>
              </View>

              {isHistoryLoading ? (
                <ActivityIndicator size="small" color={theme.primary} className="my-3" />
              ) : isHistoryError ? (
                <View className="p-4 rounded-2xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark gap-2.5 items-start">
                  <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                    Unable to load reconciliation history.
                  </ThemedText>
                  <Pressable
                    onPress={() => {
                      void refetchHistory();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Retry loading reconciliation history"
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-ledger-terracotta dark:bg-ledger-terracotta-dark items-center justify-center active:opacity-85"
                  >
                    <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
                      Retry
                    </ThemedText>
                  </Pressable>
                </View>
              ) : history.length === 0 ? (
                <View className="py-6 px-4 items-center justify-center bg-ledger-subtle dark:bg-ledger-subtle-dark rounded-xl border border-dashed border-ledger-border-strong dark:border-ledger-border-strong-dark gap-2">
                  <AppIcon name="reconcile" size={24} color={theme.textMuted} />
                  <ThemedText className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary text-center">
                    No past reconciliation records for this account yet.
                  </ThemedText>
                </View>
              ) : (
                <View className="gap-2">
                  {history.map((record) => {
                    const dateFormatted = new Date(record.reconciledAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                    const isZero = record.discrepancyMinor === 0;

                    return (
                      <View
                        key={record.id}
                        className="p-3.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-between gap-3"
                      >
                        <View className="flex-1 min-w-0 gap-0.5">
                          <View className="flex-row flex-wrap items-center gap-1.5">
                            <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                              {dateFormatted}
                            </ThemedText>
                            {record.adjustmentTransactionId && (
                              <View className="px-2 py-0.5 rounded-full bg-brand-50 dark:bg-ledger-pine-dark-soft">
                                <ThemedText className="text-[11px] font-semibold text-brand-500 dark:text-brand-400">
                                  Auto-Adjusted
                                </ThemedText>
                              </View>
                            )}
                          </View>
                          <ThemedText
                            numeric
                            className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                          >
                            Book: {formatMinorUnits(record.appBalanceMinor)} · Reconciled:{' '}
                            {formatMinorUnits(record.actualBalanceMinor)}
                          </ThemedText>
                        </View>

                        <View className="items-end shrink-0">
                          {isZero ? (
                            <View className="flex-row items-center gap-1">
                              <AppIcon name="check" size={12} color={theme.positive} />
                              <ThemedText className="text-xs font-bold text-ledger-pine dark:text-ledger-pine-dark">
                                Matched
                              </ThemedText>
                            </View>
                          ) : (
                            <ThemedText
                              numeric
                              className={`text-xs font-bold ${
                                record.discrepancyMinor > 0
                                  ? 'text-ledger-pine dark:text-ledger-pine-dark'
                                  : 'text-ledger-terracotta dark:text-ledger-terracotta-dark'
                              }`}
                            >
                              {record.discrepancyMinor > 0 ? '+' : ''}
                              {formatMinorUnits(record.discrepancyMinor)}
                            </ThemedText>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
