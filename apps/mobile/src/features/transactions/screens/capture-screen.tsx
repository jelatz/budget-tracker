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

import { AppIcon } from '@/common/components/app-icon';
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
      ? `Save ${typeLabel} · ${formatMinorUnits(evaluation.previewMinor, activeCurrency)}`
      : `Save ${typeLabel}`;

  const contentMaxWidth = isWide ? 960 : 520;
  const scrollBottomPadding = Math.max(32, BottomTabInset + insets.bottom + 16);

  return (
    <ThemedView className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        {/* Non-blocking confirmation toast banner */}
        {lastSaved && (
          <View
            style={{ maxWidth: contentMaxWidth, width: '100%', alignSelf: 'center' }}
            className="px-4 pt-2 z-50"
          >
            <View className="px-4 py-2.5 rounded-2xl bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft border border-ledger-pine dark:border-ledger-pine-dark flex-row items-center justify-between gap-2">
              <View className="flex-1 min-w-0 flex-row items-center gap-2">
                <AppIcon name="checkCircle" size={16} color={theme.positive} />
                <ThemedText
                  numeric
                  className="flex-1 text-xs font-bold text-ledger-pine dark:text-ledger-pine-dark"
                  numberOfLines={1}
                >
                  Saved {formatMinorUnits(lastSaved.amountMinor, lastSaved.currency)} ({lastSaved.label})
                </ThemedText>
              </View>
              <View className="flex-row items-center gap-1.5">
                <Pressable
                  onPress={handleUndo}
                  accessibilityRole="button"
                  accessibilityLabel="Undo saved transaction"
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  className="min-h-[44px] px-2.5 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft flex-row items-center justify-center gap-1 active:opacity-75"
                >
                  <AppIcon name="undo" size={13} color={theme.negative} />
                  <ThemedText className="text-xs font-bold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                    Undo
                  </ThemedText>
                </Pressable>

                <Pressable
                  onPress={() => router.push('/transactions')}
                  accessibilityRole="button"
                  accessibilityLabel="View history"
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  className="min-h-[44px] px-2.5 rounded-xl bg-brand-50 dark:bg-ledger-pine-dark-soft flex-row items-center justify-center gap-1 active:opacity-75"
                >
                  <ThemedText className="text-xs font-bold text-brand-500 dark:text-brand-400">
                    History
                  </ThemedText>
                  <AppIcon name="arrowRight" size={13} color={theme.primary} />
                </Pressable>

                <Pressable
                  onPress={() => setLastSaved(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss confirmation toast"
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  className="min-w-[44px] min-h-[44px] rounded-xl items-center justify-center active:opacity-75"
                >
                  <AppIcon name="close" size={15} color={theme.textSecondary} />
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
                <View className="w-8 h-8 rounded-xl bg-brand-50 dark:bg-ledger-pine-dark-soft border border-brand-200 dark:border-ledger-border-dark items-center justify-center">
                  <AppIcon name="autopay" size={17} color={theme.primary} />
                </View>
                <ThemedText
                  accessibilityRole="header"
                  className="text-xl sm:text-2xl font-extrabold tracking-tight text-ledger-ink dark:text-ledger-ink-dark"
                >
                  Fast Entry
                </ThemedText>
              </View>
              <ThemedText
                className="text-xs sm:text-sm text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mt-0.5"
                numberOfLines={1}
              >
                Quick calculator capture
              </ThemedText>
            </View>

            <Pressable
              onPress={() => router.push('/transactions')}
              accessibilityRole="button"
              accessibilityLabel="View transaction history"
              className="min-h-[44px] px-4 py-2 rounded-full bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-center gap-1.5 active:opacity-75"
            >
              <AppIcon name="history" size={15} color={theme.primary} />
              <ThemedText className="text-xs font-bold text-brand-500 dark:text-brand-400">
                History
              </ThemedText>
            </Pressable>
          </View>

          {/* Action Error Alert Banner */}
          {actionError && (
            <View
              accessibilityRole="alert"
              className="p-3.5 rounded-2xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-between gap-2"
            >
              <View className="flex-row items-center gap-2 flex-1 min-w-0">
                <AppIcon name="warning" size={16} color={theme.negative} />
                <ThemedText className="flex-1 text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                  {actionError}
                </ThemedText>
              </View>
              <Pressable
                onPress={() => setActionError(null)}
                accessibilityRole="button"
                accessibilityLabel="Dismiss error message"
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                className="min-w-[44px] min-h-[44px] items-center justify-center"
              >
                <AppIcon name="close" size={15} color={theme.negative} />
              </Pressable>
            </View>
          )}

          {/* Loading / Error / Main Cockpit */}
          {accountsQuery.isLoading ? (
            <View className="py-16 items-center justify-center gap-3 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark">
              <ActivityIndicator size="large" color={theme.primary} />
              <ThemedText className="text-sm font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                Preparing fast entry workspace...
              </ThemedText>
            </View>
          ) : accountsQuery.isError ? (
            <View className="p-6 rounded-2xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark items-center gap-3">
              <AppIcon name="warning" size={24} color={theme.negative} />
              <ThemedText
                accessibilityRole="alert"
                className="text-sm font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark text-center"
              >
                Could not load accounts or presets right now.
              </ThemedText>
              <Pressable
                onPress={() => accountsQuery.refetch()}
                accessibilityRole="button"
                accessibilityLabel="Retry loading fast entry"
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-ledger-terracotta dark:bg-ledger-terracotta-dark active:opacity-90 items-center justify-center"
              >
                <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
                  Retry
                </ThemedText>
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
                  <View className="rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark p-3.5 gap-3">
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
                    <View className="flex-row items-center justify-between gap-2 px-3 py-2 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark">
                      <ThemedText
                        className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark flex-1"
                        numberOfLines={1}
                      >
                        {activeAccount ? `${activeAccount.icon} ${activeAccount.name}` : 'Select account'}
                      </ThemedText>

                      <View className="flex-1 flex-row items-center justify-end gap-1.5 min-w-0">
                        {type === 'TRANSFER' ? (
                          <>
                            <AppIcon name="arrowRight" size={13} color={theme.info} />
                            <ThemedText
                              className="text-xs font-bold text-ledger-teal dark:text-ledger-teal-dark"
                              numberOfLines={1}
                            >
                              {activeToAccount
                                ? `${activeToAccount.icon} ${activeToAccount.name}`
                                : 'Select destination'}
                            </ThemedText>
                          </>
                        ) : splits.length >= 2 ? (
                          <>
                            <AppIcon name="split" size={13} color={theme.primary} />
                            <ThemedText
                              numeric
                              className="text-xs font-bold text-brand-500 dark:text-brand-400"
                              numberOfLines={1}
                            >
                              Split ({splits.length})
                            </ThemedText>
                          </>
                        ) : (
                          <ThemedText
                            className="text-xs font-bold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary text-right"
                            numberOfLines={1}
                          >
                            {activeCategory
                              ? `${activeCategory.icon} ${activeCategory.name}`
                              : 'Select category'}
                          </ThemedText>
                        )}
                      </View>
                    </View>
                  </View>
                </View>

                {/* Context Column: Account, Category, Split Warning & Metadata */}
                <View className={isWide ? 'flex-1 min-w-0 gap-3' : 'gap-3'}>
                  <View className="rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark p-4 gap-4">
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
                        className="min-h-[44px] p-3 rounded-2xl bg-ledger-ochre-soft dark:bg-ledger-ochre-dark-soft border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-center gap-2 active:scale-[0.99]"
                      >
                        <AppIcon name="warning" size={15} color={theme.warning} />
                        <ThemedText
                          numeric
                          className="text-xs font-semibold text-ledger-ochre dark:text-ledger-ochre-dark text-center"
                        >
                          Split amounts differ by {formatMinorUnits(Math.abs(splitRemainder), activeCurrency)} · Tap to Edit Splits
                        </ThemedText>
                      </Pressable>
                    )}

                    <View className="gap-1.5">
                      <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted px-0.5">
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
                    <View className="rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark p-2.5">
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
