import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
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
  parseDecimalToMinorUnits,
  type Account,
  type BalanceReconciliation,
} from '@repo/contracts';

import { ThemedText } from '@/common/components/themed-text';
import { Colors } from '@/common/constants/theme';
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
      setToastMessage(`✓ Account reconciled to ${formattedActual}${adjustmentNotice}`);
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
      <View className="flex-1 bg-slate-50 dark:bg-slate-950 items-center justify-center">
        <SafeAreaView style={{ flex: 1 }} className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={theme.text} />
        </SafeAreaView>
      </View>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView style={{ flex: 1 }} className="flex-1" edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          className="flex-1"
        >
          {/* Top Bar Header */}
          <View className="px-4 py-3 border-b border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70">
            <View className="flex-row items-center justify-between">
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
                className="min-h-[44px] py-2 px-3 rounded-full bg-slate-100 dark:bg-slate-800 active:opacity-75 flex-row items-center gap-1"
              >
                <ThemedText className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  ← Back
                </ThemedText>
              </Pressable>

              <View className="items-center flex-1 px-1">
                <ThemedText
                  className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white text-center"
                  numberOfLines={1}
                >
                  Balance Reconciliation
                </ThemedText>
                <ThemedText
                  className="text-[10px] sm:text-[11px] text-slate-500 text-center"
                  numberOfLines={1}
                >
                  Actual vs. App Balance Sanity Check
                </ThemedText>
              </View>

              <View className="w-12 sm:w-16" />
            </View>
          </View>

          <ScrollView
            className="flex-1"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              width: '100%',
              paddingHorizontal: 16,
              paddingTop: 16,
              paddingBottom: 96,
              gap: 18,
            }}
            showsVerticalScrollIndicator={false}
          >
            {/* Non-blocking Success Toast Banner */}
            {toastMessage && (
              <View className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex-row items-center justify-between">
                <View className="flex-1 mr-2">
                  <ThemedText className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    {toastMessage}
                  </ThemedText>
                </View>
                <Pressable
                  onPress={() => setToastMessage(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss message"
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  className="px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/50"
                >
                  <ThemedText className="text-[11px] font-bold text-emerald-800 dark:text-emerald-200">
                    Dismiss
                  </ThemedText>
                </Pressable>
              </View>
            )}

            {/* Error Banner */}
            {errorText && (
              <View className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50">
                <ThemedText className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                  {errorText}
                </ThemedText>
              </View>
            )}

            {/* 1. Account Selector Tabs */}
            <View className="gap-2">
              <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Select Account to Reconcile
              </ThemedText>

              {isAccountsLoading ? (
                <ActivityIndicator size="small" color={theme.text} />
              ) : isAccountsError ? (
                <View className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 gap-2.5 items-start">
                  <ThemedText className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                    Unable to load accounts right now.
                  </ThemedText>
                  <Pressable
                    onPress={() => {
                      void refetchAccounts();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Retry loading accounts"
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-100 dark:bg-rose-900/50 items-center justify-center active:opacity-75"
                  >
                    <ThemedText className="text-xs font-bold text-rose-700 dark:text-rose-200">
                      Retry
                    </ThemedText>
                  </Pressable>
                </View>
              ) : accounts.length === 0 ? (
                <View className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-700 items-center gap-2.5">
                  <ThemedText className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    No accounts available
                  </ThemedText>
                  <ThemedText className="text-xs text-slate-500 text-center">
                    Add an account first to start reconciling balances.
                  </ThemedText>
                  <Pressable
                    onPress={() => router.push('/accounts')}
                    accessibilityRole="button"
                    accessibilityLabel="Add account"
                    className="min-h-[44px] px-4 py-2.5 rounded-xl bg-brand-500 active:bg-brand-600 items-center justify-center"
                  >
                    <ThemedText className="text-xs font-bold text-white">
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
                    return (
                      <Pressable
                        key={account.id}
                        onPress={() => handleSelectAccount(account)}
                        accessibilityRole="button"
                        accessibilityLabel={`Select ${account.name}`}
                        accessibilityState={{ selected: isSelected }}
                        className={`min-h-[44px] p-3.5 rounded-2xl border min-w-[148px] ${
                          isSelected
                            ? 'bg-brand-50 dark:bg-brand-950/40 border-brand-500 dark:border-brand-500 shadow-sm'
                            : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
                        }`}
                      >
                        <View className="flex-row items-center gap-1.5 mb-1">
                          <ThemedText className="text-base">{account.icon}</ThemedText>
                          <ThemedText
                            className={`text-xs font-bold flex-1 ${
                              isSelected
                                ? 'text-brand-700 dark:text-brand-300'
                                : 'text-slate-700 dark:text-slate-300'
                            }`}
                            numberOfLines={1}
                          >
                            {account.name}
                          </ThemedText>
                        </View>
                        <ThemedText className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
                          {getAccountTypeLabel(account.accountType)}
                        </ThemedText>
                        <ThemedText
                          className="text-sm font-extrabold"
                          style={{ color: account.color }}
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
              <View className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm gap-4">
                {/* Current App Balance Info */}
                <View className="flex-row items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <View className="flex-row items-center gap-2.5">
                    <View className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 items-center justify-center">
                      <ThemedText className="text-xl">{selectedAccount.icon}</ThemedText>
                    </View>
                    <View>
                      <ThemedText className="text-base font-bold text-slate-900 dark:text-white">
                        {selectedAccount.name}
                      </ThemedText>
                      <ThemedText className="text-xs text-slate-500">
                        {getAccountTypeLabel(selectedAccount.accountType)} • Current App Record
                      </ThemedText>
                    </View>
                  </View>

                  <View className="items-end">
                    <ThemedText
                      className="text-lg font-extrabold"
                      style={{ color: selectedAccount.color }}
                    >
                      {formatMinorUnits(selectedAccount.balanceMinor, selectedAccount.currency)}
                    </ThemedText>
                    <ThemedText className="text-[11px] text-slate-500">
                      Calculated Balance
                    </ThemedText>
                  </View>
                </View>

                {/* Actual Balance Input */}
                <View className="gap-2">
                  <View className="flex-row items-center justify-between">
                    <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Actual Statement / Account Balance ({DEFAULT_CURRENCY_SYMBOL})
                    </ThemedText>
                    <Pressable
                      onPress={handleMatchAppBalance}
                      accessibilityRole="button"
                      accessibilityLabel={`Reset to app balance of ${formatMinorUnits(selectedAccount.balanceMinor, selectedAccount.currency)}`}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 active:opacity-75"
                    >
                      <ThemedText className="text-[11px] font-semibold text-brand-600 dark:text-brand-400">
                        Reset to App ({formatMinorUnits(selectedAccount.balanceMinor, selectedAccount.currency)})
                      </ThemedText>
                    </Pressable>
                  </View>

                  <TextInput
                    value={actualBalanceInput}
                    onChangeText={(val) => {
                      setActualBalanceInput(val);
                      setToastMessage(null);
                    }}
                    placeholder="0.00"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="numeric"
                    className="w-full px-4 py-3 rounded-2xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-2xl font-extrabold tracking-tight"
                  />

                  {/* Quick Delta Adjuster Helpers */}
                  <View className="flex-row items-center gap-1.5 flex-wrap pt-0.5">
                    <ThemedText className="text-[11px] text-slate-500 mr-1">Quick nudge:</ThemedText>
                    <Pressable
                      onPress={() => handleQuickDelta(-5000)}
                      accessibilityRole="button"
                      accessibilityLabel="Subtract 50 pesos"
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 active:opacity-75"
                    >
                      <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        -{DEFAULT_CURRENCY_SYMBOL}50
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => handleQuickDelta(-1000)}
                      accessibilityRole="button"
                      accessibilityLabel="Subtract 10 pesos"
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 active:opacity-75"
                    >
                      <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        -{DEFAULT_CURRENCY_SYMBOL}10
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => handleQuickDelta(1000)}
                      accessibilityRole="button"
                      accessibilityLabel="Add 10 pesos"
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 active:opacity-75"
                    >
                      <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        +{DEFAULT_CURRENCY_SYMBOL}10
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => handleQuickDelta(5000)}
                      accessibilityRole="button"
                      accessibilityLabel="Add 50 pesos"
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 active:opacity-75"
                    >
                      <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        +{DEFAULT_CURRENCY_SYMBOL}50
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>

                {/* 3. Live Discrepancy Card */}
                {deltaResult !== null && (
                  <View className="pt-2">
                    {deltaResult.discrepancyMinor === 0 ? (
                      /* Balanced State */
                      <View className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 gap-1.5 items-center text-center">
                        <ThemedText className="text-2xl">🎉</ThemedText>
                        <ThemedText className="text-sm font-bold text-emerald-800 dark:text-emerald-200">
                          Account is perfectly balanced!
                        </ThemedText>
                        <ThemedText className="text-xs text-emerald-600 dark:text-emerald-400 text-center">
                          App records match your actual bank balance to the penny. No adjustment is necessary.
                        </ThemedText>
                      </View>
                    ) : (
                      /* Discrepancy Detected State */
                      <View className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 gap-3">
                        <View className="flex-row items-center justify-between">
                          <View className="flex-1 mr-2">
                            <ThemedText className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                              Discrepancy Detected
                            </ThemedText>
                            <ThemedText className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                              {deltaResult.discrepancyMinor < 0
                                ? `App shows ${formatMinorUnits(Math.abs(deltaResult.discrepancyMinor), selectedAccount.currency)} more than statement`
                                : `Statement has ${formatMinorUnits(deltaResult.discrepancyMinor, selectedAccount.currency)} more than app`}
                            </ThemedText>
                          </View>
                          <ThemedText
                            className={`text-lg font-extrabold ${
                              deltaResult.discrepancyMinor < 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {deltaResult.discrepancyMinor > 0 ? '+' : ''}
                            {formatMinorUnits(deltaResult.discrepancyMinor, selectedAccount.currency)}
                          </ThemedText>
                        </View>

                        {/* Auto-adjustment Switch */}
                        <View className="flex-row items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <View className="flex-1 mr-3">
                            <ThemedText className="text-xs font-bold text-slate-800 dark:text-slate-200">
                              Create auto-adjustment transaction
                            </ThemedText>
                            <ThemedText className="text-[11px] text-slate-500">
                              Records a {deltaResult.adjustmentType} transaction tagged &quot;reconciliation&quot;.
                            </ThemedText>
                          </View>
                          <Switch
                            value={createAdjustment}
                            onValueChange={setCreateAdjustment}
                            trackColor={{ false: '#cbd5e1', true: '#3b82f6' }}
                          />
                        </View>

                        {/* Note Input */}
                        <View className="gap-1">
                          <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Adjustment Note
                          </ThemedText>
                          <TextInput
                            value={notes}
                            onChangeText={setNotes}
                            placeholder="e.g. Month-end statement sanity check"
                            placeholderTextColor={theme.textSecondary}
                            className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                          />
                        </View>

                        {/* Apply Reconciliation Button */}
                        <Pressable
                          onPress={handleApplyAdjustment}
                          disabled={applyMutation.isPending}
                          accessibilityRole="button"
                          accessibilityLabel="Apply reconciliation adjustment"
                          className="w-full min-h-[44px] py-3 rounded-2xl bg-brand-500 active:bg-brand-600 items-center justify-center shadow-sm"
                        >
                          {applyMutation.isPending ? (
                            <ActivityIndicator size="small" color={Colors.dark.text} />
                          ) : (
                            <ThemedText className="text-white font-bold text-sm">
                              Apply Reconciliation Adjustment (
                              {deltaResult.discrepancyMinor > 0 ? '+' : ''}
                              {formatMinorUnits(deltaResult.discrepancyMinor, selectedAccount.currency)}
                              )
                            </ThemedText>
                          )}
                        </Pressable>
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* 4. Reconciliation History Section */}
            <View className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm gap-3">
              <View className="flex-row items-center justify-between">
                <ThemedText className="text-sm font-bold text-slate-900 dark:text-white">
                  Reconciliation History
                </ThemedText>
                <ThemedText className="text-xs text-slate-500">
                  {selectedAccount?.name ?? 'Account'} Log
                </ThemedText>
              </View>

              {isHistoryLoading ? (
                <ActivityIndicator size="small" color={theme.text} className="my-3" />
              ) : isHistoryError ? (
                <View className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 gap-2.5 items-start">
                  <ThemedText className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                    Unable to load reconciliation history.
                  </ThemedText>
                  <Pressable
                    onPress={() => {
                      void refetchHistory();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Retry loading reconciliation history"
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-100 dark:bg-rose-900/50 items-center justify-center active:opacity-75"
                  >
                    <ThemedText className="text-xs font-bold text-rose-700 dark:text-rose-200">
                      Retry
                    </ThemedText>
                  </Pressable>
                </View>
              ) : history.length === 0 ? (
                <View className="py-6 items-center justify-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                  <ThemedText className="text-xl mb-1">⚖️</ThemedText>
                  <ThemedText className="text-xs font-medium text-slate-500">
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
                        className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 flex-row items-center justify-between"
                      >
                        <View className="flex-1 mr-3">
                          <View className="flex-row items-center gap-1.5 mb-0.5">
                            <ThemedText className="text-xs font-bold text-slate-800 dark:text-slate-200">
                              {dateFormatted}
                            </ThemedText>
                            {record.adjustmentTransactionId && (
                              <View className="px-1.5 py-0.5 rounded bg-brand-100 dark:bg-brand-900/40">
                                <ThemedText className="text-[10px] font-semibold text-brand-700 dark:text-brand-300">
                                  Auto-Adjusted
                                </ThemedText>
                              </View>
                            )}
                          </View>
                          <ThemedText className="text-[11px] text-slate-500">
                            App: {formatMinorUnits(record.appBalanceMinor)} ➔ Reconciled: {formatMinorUnits(record.actualBalanceMinor)}
                          </ThemedText>
                        </View>

                        <View className="items-end">
                          <ThemedText
                            className={`text-xs font-bold ${
                              isZero
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : record.discrepancyMinor > 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {isZero
                              ? 'Matched ✓'
                              : `${record.discrepancyMinor > 0 ? '+' : ''}${formatMinorUnits(record.discrepancyMinor)}`}
                          </ThemedText>
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
