import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  computeReconciliationDelta,
  formatMinorUnits,
  minorUnitsToDecimalInput,
  parseDecimalToMinorUnits,
  type Wallet,
} from '@repo/contracts';

import { ThemedText } from '@/common/components/themed-text';
import { useRequireAuth } from '@/common/hooks/use-require-auth';
import {
  TRANSACTION_KEYS,
  useApplyReconciliation,
  useReconciliations,
  useWallets,
} from '@/features/transactions/hooks/use-transactions';

export function ReconciliationScreen() {
  const { isAuthenticated } = useRequireAuth();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 960;
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handlePullRefresh = async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    } finally {
      setIsRefreshing(false);
    }
  };

  const { data: wallets = [], isLoading: isWalletsLoading } = useWallets();
  const applyMutation = useApplyReconciliation();

  // Selected wallet state
  const [selectedWalletId, setSelectedWalletId] = useState<string>('');
  const [mobileTab, setMobileTab] = useState<'RECONCILE' | 'HISTORY'>('RECONCILE');
  const selectedWallet: Wallet | undefined = useMemo(() => {
    return wallets.find((w) => w.id === selectedWalletId) ?? wallets[0];
  }, [wallets, selectedWalletId]);

  // Form states
  const [actualBalanceInput, setActualBalanceInput] = useState<string>('');
  const [createAdjustment, setCreateAdjustment] = useState<boolean>(true);
  const [notes, setNotes] = useState<string>('Balance adjustment');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  // Initialize selected wallet and actual balance input
  useEffect(() => {
    if (wallets.length > 0 && !selectedWalletId) {
      setSelectedWalletId(wallets[0].id);
      setActualBalanceInput(minorUnitsToDecimalInput(wallets[0].balanceMinor));
    }
  }, [wallets, selectedWalletId]);

  // When switching wallet, reset input to that wallet's current balance
  const handleSelectWallet = (wallet: Wallet) => {
    setSelectedWalletId(wallet.id);
    setActualBalanceInput(minorUnitsToDecimalInput(wallet.balanceMinor));
    setToastMessage(null);
    setErrorText(null);
  };

  // Reconciliations history query for selected wallet
  const { data: history = [], isLoading: isHistoryLoading } = useReconciliations(
    selectedWallet?.id,
  );

  // Live calculation of discrepancy
  const currentAppBalanceMinor = selectedWallet?.balanceMinor ?? 0;
  const parsedActualMinor = parseDecimalToMinorUnits(actualBalanceInput);

  const deltaResult = useMemo(() => {
    if (parsedActualMinor === null) return null;
    return computeReconciliationDelta(currentAppBalanceMinor, parsedActualMinor);
  }, [currentAppBalanceMinor, parsedActualMinor]);

  const handleApplyAdjustment = async () => {
    if (!selectedWallet) return;
    if (parsedActualMinor === null) {
      setErrorText('Please enter a valid numeric actual balance.');
      return;
    }

    setErrorText(null);
    try {
      const result = await applyMutation.mutateAsync({
        walletId: selectedWallet.id,
        actualBalanceMinor: parsedActualMinor,
        createAdjustment,
        notes: notes.trim() || 'Balance adjustment',
      });

      const formattedActual = formatMinorUnits(parsedActualMinor, selectedWallet.currency);
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
    if (selectedWallet) {
      setActualBalanceInput(minorUnitsToDecimalInput(selectedWallet.balanceMinor));
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  // Content for Selected Wallet & Statement Input Card
  const selectedWalletCardContent = selectedWallet ? (
    <View className="p-5 rounded-3xl bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 shadow-sm gap-4">
      {/* Current App Balance Info */}
      <View className="flex-row items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
        <View className="flex-row items-center gap-2.5">
          <View className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 items-center justify-center">
            <ThemedText className="text-xl">{selectedWallet.icon}</ThemedText>
          </View>
          <View>
            <ThemedText className="text-base font-bold text-slate-900 dark:text-white">
              {selectedWallet.name}
            </ThemedText>
            <ThemedText className="text-xs text-slate-500">
              Current App Record
            </ThemedText>
          </View>
        </View>

        <View className="items-end">
          <ThemedText
            className="text-lg font-extrabold font-mono"
            style={{ color: selectedWallet.color }}
          >
            {formatMinorUnits(selectedWallet.balanceMinor, selectedWallet.currency)}
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
            Actual Bank / Statement Balance (₱)
          </ThemedText>
          <Pressable
            onPress={handleMatchAppBalance}
            accessibilityRole="button"
            accessibilityLabel={`Reset to app balance of ${formatMinorUnits(selectedWallet.balanceMinor, selectedWallet.currency)}`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="min-h-[44px] px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 active:opacity-75 justify-center"
          >
            <ThemedText className="text-[11px] font-semibold text-brand-600 dark:text-brand-400">
              Reset to App ({formatMinorUnits(selectedWallet.balanceMinor, selectedWallet.currency)})
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
          placeholderTextColor="#94a3b8"
          keyboardType="numeric"
          className="w-full px-4 py-3 rounded-2xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white text-2xl font-extrabold tracking-tight font-mono"
        />

        {/* Quick Delta Adjuster Helpers */}
        <View className="flex-row items-center gap-2 flex-wrap pt-1">
          <ThemedText className="text-[11px] text-slate-500 mr-1">Quick nudge:</ThemedText>
          <Pressable
            onPress={() => handleQuickDelta(-50000)}
            accessibilityRole="button"
            accessibilityLabel="Subtract 500 pesos"
            className="min-h-[44px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 active:opacity-75 justify-center items-center"
          >
            <ThemedText className="text-xs font-semibold font-mono text-slate-700 dark:text-slate-300">
              -₱500
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => handleQuickDelta(-10000)}
            accessibilityRole="button"
            accessibilityLabel="Subtract 100 pesos"
            className="min-h-[44px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 active:opacity-75 justify-center items-center"
          >
            <ThemedText className="text-xs font-semibold font-mono text-slate-700 dark:text-slate-300">
              -₱100
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => handleQuickDelta(10000)}
            accessibilityRole="button"
            accessibilityLabel="Add 100 pesos"
            className="min-h-[44px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 active:opacity-75 justify-center items-center"
          >
            <ThemedText className="text-xs font-semibold font-mono text-slate-700 dark:text-slate-300">
              +₱100
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => handleQuickDelta(50000)}
            accessibilityRole="button"
            accessibilityLabel="Add 500 pesos"
            className="min-h-[44px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 active:opacity-75 justify-center items-center"
          >
            <ThemedText className="text-xs font-semibold font-mono text-slate-700 dark:text-slate-300">
              +₱500
            </ThemedText>
          </Pressable>
        </View>
      </View>

      {/* Live Discrepancy Card */}
      {deltaResult !== null && (
        <View className="pt-2">
          {deltaResult.discrepancyMinor === 0 ? (
            /* Balanced State */
            <View className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 gap-1.5 items-center text-center">
              <ThemedText className="text-sm font-bold text-emerald-800 dark:text-emerald-200">
                Account is perfectly balanced!
              </ThemedText>
              <ThemedText className="text-xs text-emerald-600 dark:text-emerald-400 text-center">
                App records match your actual bank balance to the centavo. No adjustment is necessary.
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
                      ? `App shows ${formatMinorUnits(Math.abs(deltaResult.discrepancyMinor), selectedWallet.currency)} more than bank`
                      : `Bank has ${formatMinorUnits(deltaResult.discrepancyMinor, selectedWallet.currency)} more than app`}
                  </ThemedText>
                </View>
                <ThemedText
                  className={`text-lg font-extrabold font-mono ${
                    deltaResult.discrepancyMinor < 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {deltaResult.discrepancyMinor > 0 ? '+' : ''}
                  {formatMinorUnits(deltaResult.discrepancyMinor, selectedWallet.currency)}
                </ThemedText>
              </View>

              {/* Auto-adjustment Switch */}
              <View className="flex-row items-center justify-between p-3 rounded-xl bg-white dark:bg-[#0b1326] border border-slate-200 dark:border-slate-800">
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
                  placeholderTextColor="#94a3b8"
                  className="px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0b1326] text-slate-900 dark:text-white text-xs"
                />
              </View>

              {/* Apply Reconciliation Button */}
              <Pressable
                onPress={handleApplyAdjustment}
                disabled={applyMutation.isPending}
                accessibilityRole="button"
                accessibilityLabel="Apply Reconciliation Adjustment"
                className="w-full min-h-[48px] py-3.5 rounded-2xl bg-brand-500 active:bg-brand-600 items-center justify-center shadow-sm"
              >
                {applyMutation.isPending ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <ThemedText className="text-white font-bold text-sm">
                    Apply Reconciliation Adjustment (
                    {deltaResult.discrepancyMinor > 0 ? '+' : ''}
                    <ThemedText className="font-mono text-white font-bold">
                      {formatMinorUnits(deltaResult.discrepancyMinor, selectedWallet.currency)}
                    </ThemedText>
                    )
                  </ThemedText>
                )}
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  ) : null;

  // Content for Reconciliation History Section
  const historyCardContent = (
    <View className="p-5 rounded-3xl bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 shadow-sm gap-3">
      <View className="flex-row items-center justify-between">
        <ThemedText className="text-sm font-bold text-slate-900 dark:text-white">
          Reconciliation History
        </ThemedText>
        <ThemedText className="text-xs text-slate-500">
          {selectedWallet?.name ?? 'Account'} Log
        </ThemedText>
      </View>

      {isHistoryLoading ? (
        <ActivityIndicator size="small" className="my-3" />
      ) : history.length === 0 ? (
        <View className="py-6 items-center justify-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
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
                      <View className="px-1.5 py-0.2 rounded bg-brand-100 dark:bg-brand-900/40">
                        <ThemedText className="text-[10px] font-semibold text-brand-700 dark:text-brand-300">
                          Auto-Adjusted
                        </ThemedText>
                      </View>
                    )}
                  </View>
                  <ThemedText className="text-[11px] text-slate-500">
                    App:{' '}
                    <ThemedText className="font-mono text-[11px] text-slate-500">
                      {formatMinorUnits(record.appBalanceMinor)}
                    </ThemedText>{' '}
                    Reconciled:{' '}
                    <ThemedText className="font-mono text-[11px] text-slate-500">
                      {formatMinorUnits(record.actualBalanceMinor)}
                    </ThemedText>
                  </ThemedText>
                </View>

                <View className="items-end">
                  <ThemedText
                    className={`text-xs font-bold font-mono ${
                      isZero
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : record.discrepancyMinor > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {isZero
                      ? 'Matched'
                      : `${record.discrepancyMinor > 0 ? '+' : ''}${formatMinorUnits(record.discrepancyMinor)}`}
                  </ThemedText>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );

  return (
    <View className="flex-1 bg-slate-50 dark:bg-[#0b1326]">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          {/* Top Bar Header */}
          <View className="px-4 py-3 border-b border-slate-200/80 dark:border-slate-800/90 bg-white/70 dark:bg-[#131b2e]/70">
            <View className="flex-row items-center justify-between max-w-[1200px] self-center w-full">
              <Pressable
                onPress={() => router.navigate('/dashboard')}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                className="min-h-[44px] px-3.5 rounded-full bg-slate-100 dark:bg-slate-800 active:opacity-75 flex-row items-center gap-1.5"
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
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => void handlePullRefresh()}
                tintColor="#208AEF"
                colors={['#208AEF']}
              />
            }
            contentContainerStyle={{
              width: '100%',
              maxWidth: isDesktop ? 1200 : 720,
              alignSelf: 'center',
              paddingHorizontal: isDesktop ? 28 : 16,
              paddingTop: isDesktop ? 24 : 16,
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
                  className="min-h-[44px] px-3 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 justify-center items-center"
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

            {/* 1. Wallet Selector */}
            <View className="gap-2">
              <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Select Account to Reconcile
              </ThemedText>

              {isWalletsLoading ? (
                <ActivityIndicator size="small" />
              ) : isDesktop ? (
                /* Desktop Multi-Card Grid */
                <View className="flex-row flex-wrap gap-3">
                  {wallets.map((wallet) => {
                    const isSelected = selectedWallet?.id === wallet.id;
                    const formatted = formatMinorUnits(wallet.balanceMinor, wallet.currency);
                    return (
                      <Pressable
                        key={wallet.id}
                        onPress={() => handleSelectWallet(wallet)}
                        accessibilityRole="button"
                        accessibilityLabel={`Select wallet ${wallet.name}`}
                        accessibilityState={{ selected: isSelected }}
                        className={`p-3.5 rounded-2xl border min-w-[160px] flex-1 min-h-[44px] justify-center ${
                          isSelected
                            ? 'bg-brand-50 dark:bg-brand-900/45 border-brand-500 shadow-sm'
                            : 'bg-white dark:bg-[#131b2e] border-slate-200/80 dark:border-slate-800/90'
                        }`}
                      >
                        <View className="flex-row items-center gap-1.5 mb-1.5">
                          <ThemedText className="text-base">{wallet.icon}</ThemedText>
                          <ThemedText
                            className={`text-xs font-bold ${
                              isSelected
                                ? 'text-brand-700 dark:text-brand-200'
                                : 'text-slate-700 dark:text-slate-300'
                            }`}
                            numberOfLines={1}
                          >
                            {wallet.name}
                          </ThemedText>
                        </View>
                        <ThemedText
                          className="text-sm font-extrabold font-mono"
                          style={{ color: wallet.color }}
                        >
                          {formatted}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                /* Mobile Horizontal Scroller */
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
                >
                  {wallets.map((wallet) => {
                    const isSelected = selectedWallet?.id === wallet.id;
                    const formatted = formatMinorUnits(wallet.balanceMinor, wallet.currency);
                    return (
                      <Pressable
                        key={wallet.id}
                        onPress={() => handleSelectWallet(wallet)}
                        accessibilityRole="button"
                        accessibilityLabel={`Select wallet ${wallet.name}`}
                        accessibilityState={{ selected: isSelected }}
                        className={`p-3.5 rounded-2xl border min-w-[140px] min-h-[44px] justify-center ${
                          isSelected
                            ? 'bg-brand-50 dark:bg-brand-900/45 border-brand-500 shadow-sm'
                            : 'bg-white dark:bg-[#131b2e] border-slate-200/80 dark:border-slate-800/90'
                        }`}
                      >
                        <View className="flex-row items-center gap-1.5 mb-1.5">
                          <ThemedText className="text-base">{wallet.icon}</ThemedText>
                          <ThemedText
                            className={`text-xs font-bold ${
                              isSelected
                                ? 'text-brand-700 dark:text-brand-200'
                                : 'text-slate-700 dark:text-slate-300'
                            }`}
                            numberOfLines={1}
                          >
                            {wallet.name}
                          </ThemedText>
                        </View>
                        <ThemedText
                          className="text-sm font-extrabold font-mono"
                          style={{ color: wallet.color }}
                        >
                          {formatted}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            {/* 2 & 3: Selected Wallet Statement Input & History Log */}
            {isDesktop ? (
              <View className="flex-row gap-6 items-start w-full">
                <View className="flex-[7] min-w-0">
                  {selectedWalletCardContent}
                </View>
                <View className="flex-[5] min-w-0">
                  {historyCardContent}
                </View>
              </View>
            ) : (
              <>
                {/* 2-segment Stitch pill switcher */}
                <View className="flex-row rounded-2xl bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 p-1">
                  <Pressable
                    onPress={() => setMobileTab('RECONCILE')}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: mobileTab === 'RECONCILE' }}
                    accessibilityLabel="Reconcile Balance"
                    className={`flex-1 min-h-[44px] py-2.5 rounded-xl items-center justify-center transition-colors ${
                      mobileTab === 'RECONCILE'
                        ? 'bg-brand-500 shadow-sm'
                        : 'bg-transparent active:opacity-70'
                    }`}
                  >
                    <ThemedText
                      className={`text-xs font-bold ${
                        mobileTab === 'RECONCILE'
                          ? 'text-white'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Reconcile Balance
                    </ThemedText>
                  </Pressable>

                  <Pressable
                    onPress={() => setMobileTab('HISTORY')}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: mobileTab === 'HISTORY' }}
                    accessibilityLabel={`Audit History (${history.length})`}
                    className={`flex-1 min-h-[44px] py-2.5 rounded-xl items-center justify-center transition-colors ${
                      mobileTab === 'HISTORY'
                        ? 'bg-brand-500 shadow-sm'
                        : 'bg-transparent active:opacity-70'
                    }`}
                  >
                    <ThemedText
                      className={`text-xs font-bold ${
                        mobileTab === 'HISTORY'
                          ? 'text-white'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Audit History ({history.length})
                    </ThemedText>
                  </Pressable>
                </View>

                {mobileTab === 'RECONCILE' ? selectedWalletCardContent : historyCardContent}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
