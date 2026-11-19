import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  applyCalculatorKey,
  computeSplitRemainder,
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
import { useRequireAuth } from '@/common/hooks/use-require-auth';

import { AmountDisplay } from '../components/amount-display';
import { CalculatorKeypad } from '../components/calculator-keypad';
import { CategoryPickerGrid } from '../components/category-picker-grid';
import {
  MetadataPillBar,
  type TransactionMetadataState,
} from '../components/metadata-pill-bar';
import { QuickPresetBar } from '../components/quick-preset-bar';
import { SplitEditorModal } from '../components/split-editor-modal';
import { TypeToggle } from '../components/type-toggle';
import { WalletSelector } from '../components/wallet-selector';
import {
  useAllCategories,
  useCategories,
  useCreateCustomCategory,
  useCreateTransaction,
  useDeleteTransaction,
  useQuickPresets,
  useSmartDefaults,
  useWallets,
} from '../hooks/use-transactions';

interface SavedTransactionToast {
  id: string;
  amountMinor: number;
  currency: string;
  label: string;
}

export function CaptureScreen() {
  const { isAuthenticated } = useRequireAuth();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 960;

  // Primary state
  const [type, setType] = useState<TransactionType>('EXPENSE');
  const [expression, setExpression] = useState<string>('0');
  const [selectedWalletId, setSelectedWalletId] = useState<string | undefined>(undefined);
  const [selectedToWalletId, setSelectedToWalletId] = useState<string | undefined>(undefined);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(undefined);
  const [splits, setSplits] = useState<TransactionSplit[]>([]);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [lastSaved, setLastSaved] = useState<SavedTransactionToast | null>(null);

  const [metadata, setMetadata] = useState<TransactionMetadataState>(() => ({
    occurredAt: new Date().toISOString(),
    merchant: '',
    tags: [],
    note: '',
    receiptUri: undefined,
  }));

  // Queries & Mutations
  const walletsQuery = useWallets();
  const wallets = walletsQuery.data ?? [];

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

  // Active wallets with fallbacks
  const activeWalletId =
    selectedWalletId ??
    smartDefaults?.lastWalletId ??
    wallets[0]?.id ??
    'wallet-checking';

  const activeToWalletId =
    selectedToWalletId ??
    smartDefaults?.lastTransferToWalletId ??
    wallets.find((w) => w.id !== activeWalletId)?.id ??
    wallets[1]?.id ??
    'wallet-savings';

  const activeCurrency =
    wallets.find((w) => w.id === activeWalletId)?.currency ?? 'PHP';

  // Calculator evaluation
  const evaluation = useMemo(
    () => evaluateCalculatorExpression(expression),
    [expression],
  );

  // Initialize wallet defaults once data is ready
  useEffect(() => {
    if (!selectedWalletId && wallets.length > 0) {
      const defaultWallet =
        smartDefaults?.lastWalletId && wallets.some((w) => w.id === smartDefaults.lastWalletId)
          ? smartDefaults.lastWalletId
          : wallets[0].id;
      setSelectedWalletId(defaultWallet);
    }
  }, [selectedWalletId, wallets, smartDefaults]);

  useEffect(() => {
    if (!selectedToWalletId && wallets.length > 0) {
      const defaultToWallet =
        smartDefaults?.lastTransferToWalletId &&
        wallets.some((w) => w.id === smartDefaults.lastTransferToWalletId)
          ? smartDefaults.lastTransferToWalletId
          : wallets.find((w) => w.id !== activeWalletId)?.id ??
            wallets[1]?.id ??
            wallets[0].id;
      setSelectedToWalletId(defaultToWallet);
    }
  }, [selectedToWalletId, wallets, smartDefaults, activeWalletId]);

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
    if (nextType === 'TRANSFER') {
      setSplits([]);
    }
  };

  // Quick Preset Selection
  const handleSelectPreset = (preset: QuickPreset) => {
    setType(preset.type);
    setExpression(minorUnitsToDecimalInput(preset.amountMinor));
    setSelectedWalletId(preset.walletId);
    if (preset.toWalletId) {
      setSelectedToWalletId(preset.toWalletId);
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
    setExpression((prev) => applyCalculatorKey(prev, key));
  };

  const handleClear = () => {
    setExpression('0');
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
        activeWalletId &&
          activeToWalletId &&
          activeWalletId !== activeToWalletId,
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
    activeWalletId,
    activeToWalletId,
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

    try {
      const savedTx = await createTransactionMutation.mutateAsync({
        type,
        amountMinor: evaluation.previewMinor,
        currency: activeCurrency,
        walletId: activeWalletId,
        toWalletId: type === 'TRANSFER' ? activeToWalletId : undefined,
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
        const fromW = wallets.find((w) => w.id === activeWalletId)?.name ?? 'Wallet';
        const toW = wallets.find((w) => w.id === activeToWalletId)?.name ?? 'Wallet';
        label = `${fromW} → ${toW}`;
      } else if (splits.length >= 2) {
        label = `Split (${splits.length})`;
      } else {
        const cat = categories.find((c) => c.id === selectedCategoryId);
        label = cat?.name ?? (type === 'INCOME' ? 'Income' : 'Expense');
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
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(message);
      } else {
        Alert.alert('Save Error', message);
      }
    }
  };

  // Handle Undo
  const handleUndo = async () => {
    if (!lastSaved) return;
    const idToDelete = lastSaved.id;
    setLastSaved(null);
    try {
      await deleteTransactionMutation.mutateAsync(idToDelete);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to undo transaction';
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(message);
      } else {
        Alert.alert('Undo Error', message);
      }
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

  return (
    <ThemedView className="flex-1 bg-slate-50 dark:bg-[#0b1326]">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        {/* Non-blocking confirmation toast banner */}
        {lastSaved && (
          <View
            style={{ maxWidth: isDesktop ? 1200 : 600 }}
            className="mx-4 mt-2 px-4 py-3 rounded-2xl bg-emerald-50/95 dark:bg-[#131b2e] border border-emerald-500/40 flex-row items-center justify-between shadow-lg z-50 self-center w-full"
          >
            <View className="flex-1 mr-2">
              <ThemedText className="text-xs font-bold text-emerald-700 dark:text-emerald-300" numberOfLines={1}>
                Saved <ThemedText className="font-mono text-emerald-700 dark:text-emerald-300">{formatMinorUnits(lastSaved.amountMinor, lastSaved.currency)}</ThemedText> ({lastSaved.label})
              </ThemedText>
            </View>
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={handleUndo}
                accessibilityRole="button"
                accessibilityLabel="Undo saved transaction"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 active:opacity-75"
              >
                <ThemedText className="text-xs font-bold text-rose-500">Undo</ThemedText>
              </Pressable>

              <Pressable
                onPress={() => router.push('/transactions')}
                accessibilityRole="button"
                accessibilityLabel="View history"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                className="px-2.5 py-1.5 rounded-lg bg-brand-500/10 active:opacity-75"
              >
                <ThemedText className="text-xs font-bold text-brand-500">History →</ThemedText>
              </Pressable>

              <Pressable
                onPress={() => setLastSaved(null)}
                accessibilityRole="button"
                accessibilityLabel="Dismiss confirmation toast"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                className="p-1 active:opacity-75"
              >
                <ThemedText className="text-xs font-bold text-slate-400 dark:text-slate-500">
                  ✕
                </ThemedText>
              </Pressable>
            </View>
          </View>
        )}

        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            width: '100%',
            maxWidth: isDesktop ? 1200 : 600,
            alignSelf: 'center',
            paddingHorizontal: isDesktop ? 28 : 16,
            paddingTop: isDesktop ? 24 : 8,
            paddingBottom: 80,
            gap: isDesktop ? 16 : 10,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header Bar */}
          <View className="flex-row items-center justify-between py-1">
            <View>
              <View className="flex-row items-center gap-2">
                <ThemedText className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                  Fast Entry
                </ThemedText>
              </View>
              <ThemedText className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                Sub-3-second transaction capture studio
              </ThemedText>
            </View>
            <Pressable
              onPress={() => router.push('/transactions')}
              accessibilityRole="button"
              accessibilityLabel="View transaction history"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              className="min-h-[44px] px-4 py-2 rounded-full bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 items-center justify-center active:opacity-75"
            >
              <ThemedText className="text-xs font-bold text-brand-500 dark:text-brand-400">History</ThemedText>
            </Pressable>
          </View>

          {/* Desktop 2-Pane Split Studio vs Mobile Stacked Layout */}
          {isDesktop ? (
            <View className="flex-row gap-6 items-start mt-2">
              {/* Left Pane (flex-[7] min-w-0 gap-4) */}
              <View className="flex-[7] min-w-0 gap-4">
                {/* Card 1: QuickPresetBar + TypeToggle */}
                <View className="bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 rounded-3xl p-5 gap-4">
                  <QuickPresetBar
                    presets={quickPresets}
                    onSelectPreset={handleSelectPreset}
                    currency={activeCurrency}
                    currentType={type}
                    currentAmountMinor={evaluation.previewMinor > 0 ? evaluation.previewMinor : undefined}
                    currentWalletId={activeWalletId}
                    currentToWalletId={activeToWalletId}
                    currentCategoryId={selectedCategoryId}
                    currentMerchant={metadata.merchant}
                    currentTags={metadata.tags}
                  />
                  <TypeToggle value={type} onChange={handleTypeChange} />
                </View>

                {/* Card 2: WalletSelector + CategoryPickerGrid (when type !== 'TRANSFER') */}
                <View className="bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 rounded-3xl p-5 gap-4">
                  <WalletSelector
                    type={type}
                    wallets={wallets}
                    selectedWalletId={activeWalletId}
                    selectedToWalletId={activeToWalletId}
                    onSelectWallet={(id: string) => setSelectedWalletId(id)}
                    onSelectToWallet={(id: string) => setSelectedToWalletId(id)}
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
                </View>

                {/* Card 3: MetadataPillBar with crisp section label "Details, Merchant & Receipt" */}
                <View className="bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 rounded-3xl p-5 gap-3">
                  <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Details, Merchant & Receipt
                  </ThemedText>
                  <MetadataPillBar
                    value={metadata}
                    recentMerchants={smartDefaults?.recentMerchants ?? []}
                    knownTags={smartDefaults?.knownTags ?? []}
                    onChange={setMetadata}
                  />
                </View>
              </View>

              {/* Right Pane (flex-[5] min-w-0 gap-4) */}
              <View className="flex-[5] min-w-0 gap-4">
                {/* Docked Execution Card */}
                <View className="bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 rounded-3xl p-5 gap-4 shadow-sm">
                  {/* Live AmountDisplay */}
                  <AmountDisplay
                    type={type}
                    evaluation={evaluation}
                    currency={activeCurrency}
                    splitCount={splits.length}
                    onClear={handleClear}
                  />

                  {/* Context Summary Strip */}
                  <View className="flex-row flex-wrap items-center gap-2 py-1">
                    {/* Active Wallet Badge */}
                    <View className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800/90 border border-slate-200/60 dark:border-slate-700/60">
                      <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-200">
                        {wallets.find((w) => w.id === activeWalletId)?.icon ?? '💳'}{' '}
                        {wallets.find((w) => w.id === activeWalletId)?.name ?? 'Wallet'}
                      </ThemedText>
                    </View>

                    {/* Category or Transfer Target Badge */}
                    {type === 'TRANSFER' ? (
                      <View className="flex-row items-center gap-1 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/60">
                        <ThemedText className="text-xs font-bold text-blue-600 dark:text-blue-400">
                          → {wallets.find((w) => w.id === activeToWalletId)?.name ?? 'Target Wallet'}
                        </ThemedText>
                      </View>
                    ) : splits.length >= 2 ? (
                      <View className="flex-row items-center gap-1 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60">
                        <ThemedText className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                          Split ({splits.length})
                        </ThemedText>
                      </View>
                    ) : (
                      <View className="flex-row items-center gap-1 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800/90 border border-slate-200/60 dark:border-slate-700/60">
                        <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-200">
                          {categories.find((c) => c.id === selectedCategoryId)?.icon ?? '🏷️'}{' '}
                          {categories.find((c) => c.id === selectedCategoryId)?.name ?? 'Uncategorized'}
                        </ThemedText>
                      </View>
                    )}

                    {/* Merchant badge if present */}
                    {Boolean(metadata.merchant) && (
                      <View className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/90 border border-slate-200/60 dark:border-slate-700/60">
                        <ThemedText className="text-xs font-medium text-slate-600 dark:text-slate-300" numberOfLines={1}>
                          {metadata.merchant}
                        </ThemedText>
                      </View>
                    )}

                    {/* Tags badge if present */}
                    {metadata.tags.length > 0 && (
                      <View className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/90 border border-slate-200/60 dark:border-slate-700/60">
                        <ThemedText className="text-xs font-medium text-slate-600 dark:text-slate-300">
                          #{metadata.tags.length} {metadata.tags.length === 1 ? 'tag' : 'tags'}
                        </ThemedText>
                      </View>
                    )}

                    {/* Receipt badge if present */}
                    {Boolean(metadata.receiptUri) && (
                      <View className="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60">
                        <ThemedText className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          Receipt
                        </ThemedText>
                      </View>
                    )}
                  </View>

                  {/* Split Remainder Warning Banner */}
                  {splits.length >= 2 && splitRemainder !== 0 && (
                    <Pressable
                      onPress={() => setIsSplitModalOpen(true)}
                      accessibilityRole="button"
                      accessibilityLabel="Split discrepancy warning, tap to open split editor"
                      className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/60 items-center justify-center active:scale-[0.99]"
                    >
                      <ThemedText className="text-xs font-semibold text-amber-700 dark:text-amber-400 text-center font-mono">
                        Split amounts differ by {formatMinorUnits(Math.abs(splitRemainder), activeCurrency)} • Tap to Edit Splits
                      </ThemedText>
                    </Pressable>
                  )}

                  {/* Calculator Keypad */}
                  <CalculatorKeypad
                    evaluation={evaluation}
                    canSave={canSave}
                    isSaving={createTransactionMutation.isPending}
                    saveLabel="Save"
                    onKeyPress={handleKeyPress}
                    onSave={handleSave}
                  />
                </View>
              </View>
            </View>
          ) : (
            <>
              {/* Card 1: Studio Hero Card (TypeToggle + AmountDisplay + QuickPresetBar) */}
              <View className="rounded-3xl bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 shadow-sm p-3.5 gap-3">
                <TypeToggle value={type} onChange={handleTypeChange} />
                <AmountDisplay
                  type={type}
                  evaluation={evaluation}
                  currency={activeCurrency}
                  splitCount={splits.length}
                  onClear={handleClear}
                />
                <QuickPresetBar
                  presets={quickPresets}
                  onSelectPreset={handleSelectPreset}
                  currency={activeCurrency}
                  currentType={type}
                  currentAmountMinor={evaluation.previewMinor > 0 ? evaluation.previewMinor : undefined}
                  currentWalletId={activeWalletId}
                  currentToWalletId={activeToWalletId}
                  currentCategoryId={selectedCategoryId}
                  currentMerchant={metadata.merchant}
                  currentTags={metadata.tags}
                />
              </View>

              {/* Card 2: Context & Category Card (WalletSelector + CategoryPickerGrid + MetadataPillBar) */}
              <View className="rounded-3xl bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 shadow-sm p-3.5 gap-3">
                <WalletSelector
                  type={type}
                  wallets={wallets}
                  selectedWalletId={activeWalletId}
                  selectedToWalletId={activeToWalletId}
                  onSelectWallet={(id: string) => setSelectedWalletId(id)}
                  onSelectToWallet={(id: string) => setSelectedToWalletId(id)}
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

                <MetadataPillBar
                  value={metadata}
                  recentMerchants={smartDefaults?.recentMerchants ?? []}
                  knownTags={smartDefaults?.knownTags ?? []}
                  onChange={setMetadata}
                />
              </View>

              {/* Split Remainder Warning Banner */}
              {splits.length >= 2 && splitRemainder !== 0 && (
                <Pressable
                  onPress={() => setIsSplitModalOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Split discrepancy warning, tap to open split editor"
                  className="min-h-[44px] p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/60 items-center justify-center active:scale-[0.99]"
                >
                  <ThemedText className="text-xs font-semibold text-amber-700 dark:text-amber-400 text-center font-mono">
                    Split amounts differ by {formatMinorUnits(Math.abs(splitRemainder), activeCurrency)} • Tap to Edit Splits
                  </ThemedText>
                </Pressable>
              )}

              {/* Card 3: Docked Execution Keypad Card */}
              <View className="rounded-3xl bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 shadow-sm p-3">
                <CalculatorKeypad
                  evaluation={evaluation}
                  canSave={canSave}
                  isSaving={createTransactionMutation.isPending}
                  saveLabel="Save"
                  onKeyPress={handleKeyPress}
                  onSave={handleSave}
                />
              </View>
            </>
          )}
        </ScrollView>

        {/* 7. Split Editor Modal */}
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
