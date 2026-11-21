import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  applyCalculatorKey,
  computeSplitRemainder,
  DEFAULT_CURRENCY,
  evaluateCalculatorExpression,
  formatMinorUnits,
  minorUnitsToDecimalInput,
  type CalculatorKey,
  type Category,
  type CreateCategoryInput,
  type QuickPreset,
  type TransactionSplit,
  type TransactionType,
} from '@repo/contracts';

import { ThemedText } from '@/common/components/themed-text';
import { ThemedView } from '@/common/components/themed-view';
import { BottomTabInset } from '@/common/constants/theme';
import { useRequireAuth } from '@/common/hooks/use-require-auth';
import { useTheme } from '@/common/hooks/use-theme';

import { AmountDisplay } from '../components/amount-display';
import {
  CalculatorFocusFrame,
  type CalculatorFocusFrameHandle,
} from '../components/calculator-focus-frame';
import { CalculatorKeypad } from '../components/calculator-keypad';
import { CategoryPickerGrid } from '../components/category-picker-grid';
import {
  MetadataPillBar,
  type TransactionMetadataState,
} from '../components/metadata-pill-bar';
import { AccountSelector } from '../components/account-selector';
import { QuickPresetBar } from '../components/quick-preset-bar';
import { SplitEditorModal } from '../components/split-editor-modal';
import { TypeToggle } from '../components/type-toggle';
import {
  useAccounts,
  useAllCategories,
  useCategories,
  useCreateCustomCategory,
  useCreateTransaction,
  useDeleteTransaction,
  useQuickPresets,
  useSmartDefaults,
} from '../hooks/use-transactions';

interface SavedTransactionToast {
  id: string;
  amountMinor: number;
  currency: string;
  label: string;
}

export function CaptureScreen() {
  const { isAuthenticated } = useRequireAuth();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isWide = width >= 768;
  const isWeb = Platform.OS === 'web';
  const calculatorFrameRef = useRef<CalculatorFocusFrameHandle>(null);

  // Primary state
  const [type, setType] = useState<TransactionType>('EXPENSE');
  const [expression, setExpression] = useState<string>('0');
  const [isCalculatorFocused, setIsCalculatorFocused] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(undefined);
  const [selectedToAccountId, setSelectedToAccountId] = useState<string | undefined>(undefined);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(undefined);
  const [splits, setSplits] = useState<TransactionSplit[]>([]);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [lastSaved, setLastSaved] = useState<SavedTransactionToast | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [metadata, setMetadata] = useState<TransactionMetadataState>(() => ({
    occurredAt: new Date().toISOString(),
    merchant: '',
    tags: [],
    note: '',
    receiptUri: undefined,
  }));

  // Queries & Mutations
  const accountsQuery = useAccounts();
  const accounts = accountsQuery.data ?? [];

  const { categories, pinnedCategories } = useCategories(
    type === 'TRANSFER' ? 'EXPENSE' : type,
    8,
  );
  const { categories: allCategories } = useAllCategories();
  const smartDefaultsQuery = useSmartDefaults();
  const smartDefaults = smartDefaultsQuery.data;

  const quickPresetsQuery = useQuickPresets();
  const quickPresets = quickPresetsQuery.data ?? [];

  const createTransactionMutation = useCreateTransaction();
  const deleteTransactionMutation = useDeleteTransaction();
  const createCategoryMutation = useCreateCustomCategory();

  // Active accounts with fallbacks
  const activeAccountId =
    selectedAccountId ??
    smartDefaults?.lastAccountId ??
    accounts[0]?.id ??
    'account-bank';

  const activeToAccountId =
    selectedToAccountId ??
    smartDefaults?.lastTransferToAccountId ??
    accounts.find((a) => a.id !== activeAccountId)?.id ??
    accounts[1]?.id ??
    'account-savings';

  const activeAccount = accounts.find((a) => a.id === activeAccountId);
  const activeToAccount = accounts.find((a) => a.id === activeToAccountId);
  const activeCategory = categories.find((c) => c.id === selectedCategoryId);
  const activeCurrency = activeAccount?.currency ?? DEFAULT_CURRENCY;

  // Calculator evaluation
  const evaluation = useMemo(
    () => evaluateCalculatorExpression(expression),
    [expression],
  );

  // Initialize account defaults once data is ready
  useEffect(() => {
    if (!selectedAccountId && accounts.length > 0) {
      const defaultAccount =
        smartDefaults?.lastAccountId &&
        accounts.some((a) => a.id === smartDefaults.lastAccountId)
          ? smartDefaults.lastAccountId
          : accounts[0].id;
      setSelectedAccountId(defaultAccount);
    }
  }, [selectedAccountId, accounts, smartDefaults]);

  useEffect(() => {
    if (!selectedToAccountId && accounts.length > 0) {
      const defaultToAccount =
        smartDefaults?.lastTransferToAccountId &&
        accounts.some((a) => a.id === smartDefaults.lastTransferToAccountId)
          ? smartDefaults.lastTransferToAccountId
          : accounts.find((a) => a.id !== activeAccountId)?.id ??
            accounts[1]?.id ??
            accounts[0].id;
      setSelectedToAccountId(defaultToAccount);
    }
  }, [selectedToAccountId, accounts, smartDefaults, activeAccountId]);

  // Ensure selectedCategoryId matches the active type when switching
  useEffect(() => {
    if (type === 'TRANSFER') {
      return;
    }
    const currentMatchesType = categories.some(
      (c) => c.id === selectedCategoryId && c.type === type,
    );
    if (!currentMatchesType && pinnedCategories.length > 0) {
      setSelectedCategoryId(pinnedCategories[0].id);
    }
  }, [type, categories, selectedCategoryId, pinnedCategories]);

  // Handle Type Change
  const handleTypeChange = (nextType: TransactionType) => {
    setType(nextType);
    setActionError(null);
    if (nextType === 'TRANSFER') {
      setSplits([]);
    }
  };

  // Quick Preset Selection
  const handleSelectPreset = (preset: QuickPreset) => {
    setActionError(null);
    setType(preset.type);
    setExpression(minorUnitsToDecimalInput(preset.amountMinor));
    setSelectedAccountId(preset.accountId);
    if (preset.toAccountId) {
      setSelectedToAccountId(preset.toAccountId);
    }
    if (preset.categoryId) {
      setSelectedCategoryId(preset.categoryId);
    }
    setMetadata((prev) => ({
      ...prev,
      merchant: preset.merchant ?? prev.merchant,
      tags: preset.tags && preset.tags.length > 0 ? preset.tags : prev.tags,
    }));
    setSplits([]);
  };

  // Calculator Key Handling
  const handleKeyPress = (key: CalculatorKey) => {
    setActionError(null);
    setExpression((prev) => applyCalculatorKey(prev, key));
  };

  const handleClearAll = () => {
    setActionError(null);
    setExpression('0');
    setSplits([]);
  };

  // Split Remainder
  const splitRemainder = useMemo(() => {
    if (splits.length < 2) return 0;
    return computeSplitRemainder(
      evaluation.previewMinor,
      splits.map((s) => s.amountMinor),
    );
  }, [splits, evaluation.previewMinor]);

  // Can Save validation
  const canSave = useMemo(() => {
    const isPositiveAmount =
      evaluation.previewMinor > 0 &&
      !evaluation.endsWithOperator &&
      evaluation.error === null;

    if (!isPositiveAmount) return false;

    if (type === 'TRANSFER') {
      return Boolean(
        activeAccountId &&
          activeToAccountId &&
          activeAccountId !== activeToAccountId,
      );
    }

    if (splits.length >= 2) {
      return splitRemainder === 0;
    }

    return Boolean(selectedCategoryId);
  }, [
    evaluation.previewMinor,
    evaluation.endsWithOperator,
    evaluation.error,
    type,
    activeAccountId,
    activeToAccountId,
    splits.length,
    splitRemainder,
    selectedCategoryId,
  ]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!lastSaved) return;
    const timer = setTimeout(() => {
      setLastSaved(null);
    }, 8000);
    return () => clearTimeout(timer);
  }, [lastSaved]);

  // Handle Save
  const handleSave = async () => {
    if (!canSave || createTransactionMutation.isPending) return;
    setActionError(null);

    try {
      const savedTx = await createTransactionMutation.mutateAsync({
        type,
        amountMinor: evaluation.previewMinor,
        currency: activeCurrency,
        accountId: activeAccountId,
        toAccountId: type === 'TRANSFER' ? activeToAccountId : undefined,
        categoryId:
          type !== 'TRANSFER' && splits.length === 0
            ? selectedCategoryId
            : undefined,
        splits: type !== 'TRANSFER' && splits.length >= 2 ? splits : undefined,
        merchant: metadata.merchant.trim() || undefined,
        tags: metadata.tags,
        note: metadata.note.trim() || undefined,
        receiptUri: metadata.receiptUri,
        occurredAt: metadata.occurredAt,
      });

      // Label for toast
      let label = 'Expense';
      if (type === 'TRANSFER') {
        const fromA = activeAccount?.name ?? 'Account';
        const toA = activeToAccount?.name ?? 'Account';
        label = `${fromA} → ${toA}`;
      } else if (splits.length >= 2) {
        label = `Split (${splits.length})`;
      } else {
        label = activeCategory?.name ?? (type === 'INCOME' ? 'Income' : 'Expense');
      }

      setLastSaved({
        id: savedTx.id,
        amountMinor: savedTx.amountMinor,
        currency: savedTx.currency,
        label,
      });

      // Rapid-fire reset
      setExpression('0');
      setSplits([]);
      setMetadata({
        occurredAt: new Date().toISOString(),
        merchant: '',
        tags: [],
        note: '',
        receiptUri: undefined,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to save transaction';
      setActionError(message);
    }
  };

  // Handle Undo
  const handleUndo = async () => {
    if (!lastSaved) return;
    const idToDelete = lastSaved.id;
    setLastSaved(null);
    setActionError(null);
    try {
      await deleteTransactionMutation.mutateAsync(idToDelete);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to undo transaction';
      setActionError(message);
    }
  };

  // Handle custom category creation
  const handleCreateCustomCategory = async (
    input: CreateCategoryInput,
  ): Promise<Category> => {
    return await createCategoryMutation.mutateAsync(input);
  };

  if (!isAuthenticated) {
    return null;
  }

  const typeLabel =
    type === 'INCOME' ? 'Income' : type === 'TRANSFER' ? 'Transfer' : 'Expense';
  const needsCalculation =
    evaluation.hasOperator || evaluation.endsWithOperator;
  const saveLabel =
    evaluation.previewMinor > 0
      ? `✓ Save ${typeLabel} • ${formatMinorUnits(evaluation.previewMinor, activeCurrency)}`
      : `✓ Save ${typeLabel}`;

  const summaryTargetLabel =
    type === 'TRANSFER'
      ? `→ ${activeToAccount ? `${activeToAccount.icon} ${activeToAccount.name}` : 'Select destination'}`
      : splits.length >= 2
        ? `🔀 Split (${splits.length})`
        : activeCategory
          ? `${activeCategory.icon} ${activeCategory.name}`
          : 'Select category';

  const contentMaxWidth = isWide ? 960 : 520;
  const scrollBottomPadding = Math.max(32, BottomTabInset + insets.bottom + 16);

  return (
    <ThemedView className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        {/* Non-blocking confirmation toast banner */}
        {lastSaved && (
          <View
            style={{ maxWidth: contentMaxWidth, width: '100%', alignSelf: 'center' }}
            className="px-4 pt-2 z-50"
          >
            <View className="px-4 py-2.5 rounded-2xl bg-emerald-50/95 dark:bg-emerald-950/90 border border-emerald-500/40 flex-row items-center justify-between gap-2 shadow-md">
              <View className="flex-1 min-w-0">
                <ThemedText
                  className="text-xs font-bold text-emerald-700 dark:text-emerald-300"
                  numberOfLines={1}
                >
                  ✓ Saved {formatMinorUnits(lastSaved.amountMinor, lastSaved.currency)} ({lastSaved.label})
                </ThemedText>
              </View>
              <View className="flex-row items-center gap-1.5">
                <Pressable
                  onPress={handleUndo}
                  accessibilityRole="button"
                  accessibilityLabel="Undo saved transaction"
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  className="min-h-[36px] px-2.5 rounded-xl bg-rose-500/15 items-center justify-center active:opacity-75"
                >
                  <ThemedText className="text-xs font-bold text-rose-600 dark:text-rose-400">
                    Undo
                  </ThemedText>
                </Pressable>

                <Pressable
                  onPress={() => router.push('/transactions')}
                  accessibilityRole="button"
                  accessibilityLabel="View history"
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  className="min-h-[36px] px-2.5 rounded-xl bg-brand-500/15 items-center justify-center active:opacity-75"
                >
                  <ThemedText className="text-xs font-bold text-brand-600 dark:text-brand-400">
                    History →
                  </ThemedText>
                </Pressable>

                <Pressable
                  onPress={() => setLastSaved(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss confirmation toast"
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  className="min-w-[36px] min-h-[36px] rounded-xl items-center justify-center active:opacity-75"
                >
                  <ThemedText className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    ✕
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            width: '100%',
            maxWidth: contentMaxWidth,
            alignSelf: 'center',
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: scrollBottomPadding,
            gap: 12,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header Bar */}
          <View className="flex-row items-center justify-between gap-3 py-0.5">
            <View className="flex-1 min-w-0">
              <View className="flex-row items-center gap-2">
                <ThemedText className="text-xl sm:text-2xl">⚡</ThemedText>
                <ThemedText
                  accessibilityRole="header"
                  className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50"
                >
                  Fast Entry
                </ThemedText>
              </View>
              <ThemedText
                className="text-xs sm:text-sm text-slate-500 dark:text-slate-400"
                numberOfLines={1}
              >
                Quick calculator capture
              </ThemedText>
            </View>

            <Pressable
              onPress={() => router.push('/transactions')}
              accessibilityRole="button"
              accessibilityLabel="View transaction history"
              className="min-h-[44px] px-4 py-2 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex-row items-center justify-center active:opacity-75"
            >
              <ThemedText className="text-xs font-bold text-brand-600 dark:text-brand-400">
                History 📜
              </ThemedText>
            </Pressable>
          </View>

          {/* Action Error Alert Banner */}
          {actionError && (
            <View
              accessibilityRole="alert"
              className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/70 flex-row items-center justify-between gap-2"
            >
              <ThemedText className="flex-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
                ⚠️ {actionError}
              </ThemedText>
              <Pressable
                onPress={() => setActionError(null)}
                accessibilityRole="button"
                accessibilityLabel="Dismiss error message"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                className="min-w-[36px] min-h-[36px] items-center justify-center"
              >
                <ThemedText className="text-xs font-bold text-rose-500">✕</ThemedText>
              </Pressable>
            </View>
          )}

          {/* Loading / Error / Main Cockpit */}
          {accountsQuery.isLoading ? (
            <View className="py-16 items-center justify-center gap-3 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
              <ActivityIndicator size="large" color={theme.text} />
              <ThemedText className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Preparing fast entry workspace...
              </ThemedText>
            </View>
          ) : accountsQuery.isError ? (
            <View className="p-6 rounded-3xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 items-center gap-3">
              <ThemedText
                accessibilityRole="alert"
                className="text-sm font-semibold text-rose-600 dark:text-rose-400 text-center"
              >
                Could not load accounts or presets right now.
              </ThemedText>
              <Pressable
                onPress={() => accountsQuery.refetch()}
                accessibilityRole="button"
                accessibilityLabel="Retry loading fast entry"
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-rose-600 active:bg-rose-700 items-center justify-center"
              >
                <ThemedText className="text-xs font-bold text-white">Retry</ThemedText>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Quick Preset Bar */}
              <QuickPresetBar
                presets={quickPresets}
                onSelectPreset={handleSelectPreset}
                currency={activeCurrency}
                currentType={type}
                currentAmountMinor={evaluation.previewMinor > 0 ? evaluation.previewMinor : undefined}
                currentAccountId={activeAccountId}
                currentToAccountId={activeToAccountId}
                currentCategoryId={selectedCategoryId}
                currentMerchant={metadata.merchant}
                currentTags={metadata.tags}
              />

              {/* Responsive Two-Column Cockpit on Wide Screens / Compact Stack on Mobile */}
              <View className={isWide ? 'flex-row items-start gap-4' : 'gap-3'}>
                {/* Primary Column: Type, Bordered Calculator (Readout + Keypad on Wide) & Summary */}
                <View className={isWide ? 'flex-1 min-w-0 gap-3' : 'gap-3'}>
                  <View className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-3.5 shadow-sm gap-3">
                    <TypeToggle value={type} onChange={handleTypeChange} />

                    {isWide ? (
                      <CalculatorFocusFrame
                        ref={calculatorFrameRef}
                        transactionType={type}
                        needsCalculation={needsCalculation}
                        canSave={canSave}
                        isFocused={isCalculatorFocused}
                        onFocusChange={setIsCalculatorFocused}
                        onKeyPress={handleKeyPress}
                        onClearAll={handleClearAll}
                        onSave={handleSave}
                      >
                        <AmountDisplay
                          type={type}
                          evaluation={evaluation}
                          currency={activeCurrency}
                          splitCount={splits.length}
                          isCalculatorFocused={isCalculatorFocused}
                          showKeyboardHint={isWeb}
                        />
                        <CalculatorKeypad
                          evaluation={evaluation}
                          canSave={canSave}
                          isSaving={createTransactionMutation.isPending}
                          saveLabel={saveLabel}
                          transactionType={type}
                          onKeyPress={handleKeyPress}
                          onClearAll={handleClearAll}
                          onSave={handleSave}
                        />
                      </CalculatorFocusFrame>
                    ) : (
                      <AmountDisplay
                        type={type}
                        evaluation={evaluation}
                        currency={activeCurrency}
                        splitCount={splits.length}
                        isCalculatorFocused={isCalculatorFocused}
                        showKeyboardHint={isWeb}
                        standaloneBorder
                        onActivateCalculator={() => calculatorFrameRef.current?.focus()}
                      />
                    )}

                    {/* Active Context Summary Strip */}
                    <View className="flex-row items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70">
                      <ThemedText
                        className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex-1"
                        numberOfLines={1}
                      >
                        {activeAccount ? `${activeAccount.icon} ${activeAccount.name}` : 'Select account'}
                      </ThemedText>
                      <ThemedText
                        className="text-xs font-bold text-slate-600 dark:text-slate-200 flex-1 text-right"
                        numberOfLines={1}
                      >
                        {summaryTargetLabel}
                      </ThemedText>
                    </View>
                  </View>
                </View>

                {/* Context Column: Account, Category, Split Warning & Metadata */}
                <View className={isWide ? 'flex-1 min-w-0 gap-3' : 'gap-3'}>
                  <View className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 shadow-sm gap-4">
                    <AccountSelector
                      type={type}
                      accounts={accounts}
                      selectedAccountId={activeAccountId}
                      selectedToAccountId={activeToAccountId}
                      onSelectAccount={(id: string) => setSelectedAccountId(id)}
                      onSelectToAccount={(id: string) => setSelectedToAccountId(id)}
                    />

                    {type !== 'TRANSFER' && (
                      <CategoryPickerGrid
                        type={type}
                        pinnedCategories={pinnedCategories}
                        allRankedCategories={categories}
                        selectedCategoryId={selectedCategoryId}
                        splits={splits}
                        onSelectCategory={(id: string) => setSelectedCategoryId(id)}
                        onOpenSplitEditor={() => setIsSplitModalOpen(true)}
                        onCreateCustomCategory={handleCreateCustomCategory}
                      />
                    )}

                    {/* Split Remainder Warning Banner */}
                    {splits.length >= 2 && splitRemainder !== 0 && (
                      <Pressable
                        onPress={() => setIsSplitModalOpen(true)}
                        accessibilityRole="button"
                        accessibilityLabel="Split discrepancy warning, tap to open split editor"
                        className="min-h-[44px] p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/60 items-center justify-center active:scale-[0.99]"
                      >
                        <ThemedText className="text-xs font-semibold text-amber-700 dark:text-amber-400 text-center">
                          ⚠️ Split amounts differ by {formatMinorUnits(Math.abs(splitRemainder), activeCurrency)} • Tap to Edit Splits
                        </ThemedText>
                      </Pressable>
                    )}

                    <View className="gap-1.5">
                      <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-0.5">
                        Details & Attachments
                      </ThemedText>
                      <MetadataPillBar
                        value={metadata}
                        recentMerchants={smartDefaults?.recentMerchants ?? []}
                        knownTags={smartDefaults?.knownTags ?? []}
                        onChange={setMetadata}
                      />
                    </View>
                  </View>

                  {!isWide && (
                    <View className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-2.5 shadow-sm">
                      <CalculatorFocusFrame
                        ref={calculatorFrameRef}
                        transactionType={type}
                        needsCalculation={needsCalculation}
                        canSave={canSave}
                        isFocused={isCalculatorFocused}
                        onFocusChange={setIsCalculatorFocused}
                        onKeyPress={handleKeyPress}
                        onClearAll={handleClearAll}
                        onSave={handleSave}
                      >
                        <CalculatorKeypad
                          evaluation={evaluation}
                          canSave={canSave}
                          isSaving={createTransactionMutation.isPending}
                          saveLabel={saveLabel}
                          transactionType={type}
                          onKeyPress={handleKeyPress}
                          onClearAll={handleClearAll}
                          onSave={handleSave}
                        />
                      </CalculatorFocusFrame>
                    </View>
                  )}
                </View>
              </View>
            </>
          )}
        </ScrollView>

        {/* Split Editor Modal */}
        {type !== 'TRANSFER' && (
          <SplitEditorModal
            visible={isSplitModalOpen}
            totalAmountMinor={evaluation.previewMinor}
            currency={activeCurrency}
            categories={allCategories.filter((c) => c.type === type)}
            initialCategoryId={selectedCategoryId}
            initialSplits={splits}
            onClose={() => setIsSplitModalOpen(false)}
            onApplySplits={(newSplits, updatedTotalMinor) => {
              setSplits(newSplits);
              if (typeof updatedTotalMinor === 'number' && updatedTotalMinor > 0) {
                setExpression(minorUnitsToDecimalInput(updatedTotalMinor));
              }
              setIsSplitModalOpen(false);
            }}
            onClearSplits={() => {
              setSplits([]);
              setIsSplitModalOpen(false);
            }}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}
