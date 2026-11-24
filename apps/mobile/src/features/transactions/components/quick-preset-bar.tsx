import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  DEFAULT_CURRENCY,
  formatMinorUnits,
  minorUnitsToDecimalInput,
  normalizeDecimalInput,
  parseDecimalToMinorUnits,
  type QuickPreset,
  type TransactionType,
} from '@repo/contracts';
import { AppIcon } from '@/common/components/app-icon';
import { ThemedText } from '@/common/components/themed-text';
import { ThemedView } from '@/common/components/themed-view';
import { TABULAR_NUMS_STYLE } from '@/common/constants/theme';
import { useTheme } from '@/common/hooks/use-theme';
import {
  useAccounts,
  useAllCategories,
  useDeleteQuickPreset,
  useUpsertQuickPreset,
} from '../hooks/use-transactions';

const COMMON_PRESET_ICONS = [
  '☕',
  '🥪',
  '🚇',
  '🛒',
  '⛽',
  '🎬',
  '💊',
  '💡',
  '✈️',
  '🐷',
  '💼',
  '🎁',
  '🏋️',
  '📱',
  '🏷️',
];

export interface QuickPresetBarProps {
  presets: readonly QuickPreset[];
  onSelectPreset: (preset: QuickPreset) => void;
  onCreatePreset?: () => void;
  currency?: string;
  currentType?: TransactionType;
  currentAmountMinor?: number;
  currentAccountId?: string;
  currentToAccountId?: string;
  currentCategoryId?: string;
  currentMerchant?: string;
  currentTags?: readonly string[];
}

export function QuickPresetBar({
  presets,
  onSelectPreset,
  onCreatePreset,
  currency = DEFAULT_CURRENCY,
  currentType = 'EXPENSE',
  currentAmountMinor,
  currentAccountId,
  currentToAccountId,
  currentCategoryId,
  currentMerchant,
  currentTags = [],
}: QuickPresetBarProps) {
  const theme = useTheme();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'create' | 'manage'>('create');

  // Form states for creating a preset
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState('☕');
  const [customIconInput, setCustomIconInput] = useState('');
  const [type, setType] = useState<TransactionType>(currentType);
  const [amountInput, setAmountInput] = useState(
    currentAmountMinor && currentAmountMinor > 0
      ? minorUnitsToDecimalInput(currentAmountMinor)
      : '5.00',
  );
  const [accountId, setAccountId] = useState(currentAccountId ?? '');
  const [toAccountId, setToAccountId] = useState(currentToAccountId ?? '');
  const [categoryId, setCategoryId] = useState(currentCategoryId ?? '');
  const [merchant, setMerchant] = useState(currentMerchant ?? '');
  const [tagsInput, setTagsInput] = useState(currentTags.join(', '));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [manageError, setManageError] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  // Queries & Mutations
  const accountsQuery = useAccounts();
  const accounts = accountsQuery.data ?? [];

  const categoriesQuery = useAllCategories();
  const categories = categoriesQuery.categories ?? [];

  const upsertPresetMutation = useUpsertQuickPreset();
  const deletePresetMutation = useDeleteQuickPreset();

  // Reset or initialize form with current capture context when modal opens
  useEffect(() => {
    if (isModalOpen) {
      setLabel('');
      setIcon(COMMON_PRESET_ICONS[0]);
      setCustomIconInput('');
      setType(currentType);
      setAmountInput(
        currentAmountMinor && currentAmountMinor > 0
          ? minorUnitsToDecimalInput(currentAmountMinor)
          : '5.00',
      );
      setAccountId(currentAccountId || accounts[0]?.id || '');
      setToAccountId(
        currentToAccountId ||
          accounts.find((a) => a.id !== currentAccountId)?.id ||
          accounts[1]?.id ||
          '',
      );
      setCategoryId(currentCategoryId || categories.find((c) => c.type === currentType)?.id || '');
      setMerchant(currentMerchant ?? '');
      setTagsInput(currentTags.join(', '));
      setErrorMessage(null);
      setManageError(null);
      setConfirmingDeleteId(null);
    }
  }, [
    isModalOpen,
    currentType,
    currentAmountMinor,
    currentAccountId,
    currentToAccountId,
    currentCategoryId,
    currentMerchant,
    currentTags,
    accounts,
    categories,
  ]);

  const activeIcon = customIconInput.trim() || icon;

  const filteredCategories = useMemo(() => {
    return categories.filter((c) => c.type === type);
  }, [categories, type]);

  const handleOpenModal = () => {
    onCreatePreset?.();
    setIsModalOpen(true);
  };

  const handleSavePreset = async () => {
    setErrorMessage(null);
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      setErrorMessage('Please enter a preset label.');
      return;
    }

    const parsedAmount = parseDecimalToMinorUnits(amountInput);
    if (parsedAmount === null || parsedAmount <= 0) {
      setErrorMessage('Please enter a valid amount greater than 0.');
      return;
    }

    if (!accountId) {
      setErrorMessage('Please select an account.');
      return;
    }

    if (type === 'TRANSFER') {
      if (!toAccountId || toAccountId === accountId) {
        setErrorMessage('Please select a different destination account.');
        return;
      }
    }

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    try {
      await upsertPresetMutation.mutateAsync({
        label: trimmedLabel,
        icon: activeIcon,
        type,
        amountMinor: parsedAmount,
        accountId,
        toAccountId: type === 'TRANSFER' ? toAccountId : undefined,
        categoryId: type !== 'TRANSFER' && categoryId ? categoryId : undefined,
        merchant: merchant.trim() || undefined,
        tags,
        defaultOrder: presets.length + 1,
      });

      setIsModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save preset.';
      setErrorMessage(msg);
    }
  };

  const handleConfirmDeletePreset = async (presetId: string) => {
    setManageError(null);
    try {
      await deletePresetMutation.mutateAsync(presetId);
      setConfirmingDeleteId(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete preset.';
      setManageError(msg);
    }
  };

  return (
    <View className="w-full">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="flex-row items-center gap-2 py-0.5"
      >
        {presets.map((preset) => {
          const typeBadge =
            preset.type === 'EXPENSE'
              ? 'EXP'
              : preset.type === 'INCOME'
                ? 'INC'
                : 'XFER';

          return (
            <Pressable
              key={preset.id}
              accessibilityRole="button"
              accessibilityLabel={`Preset: ${preset.label}, amount ${formatMinorUnits(preset.amountMinor, currency)}`}
              onPress={() => onSelectPreset(preset)}
              className="min-h-[44px] flex-row items-center gap-2 px-3 py-2 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark active:scale-95"
            >
              <ThemedText className="text-base">{preset.icon}</ThemedText>
              <View>
                <ThemedText
                  className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark"
                  numberOfLines={1}
                >
                  {preset.label}
                </ThemedText>
                <View className="flex-row items-center gap-1.5 mt-0.5">
                  <ThemedText
                    numeric
                    className="text-[11px] font-bold text-brand-500 dark:text-brand-400"
                  >
                    {formatMinorUnits(preset.amountMinor, currency)}
                  </ThemedText>
                  <View
                    className={`px-1 py-0.5 rounded ${
                      preset.type === 'EXPENSE'
                        ? 'bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft'
                        : preset.type === 'INCOME'
                          ? 'bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft'
                          : 'bg-ledger-teal-soft dark:bg-ledger-teal-dark-soft'
                    }`}
                  >
                    <ThemedText
                      className={`text-[10px] font-bold ${
                        preset.type === 'EXPENSE'
                          ? 'text-ledger-terracotta dark:text-ledger-terracotta-dark'
                          : preset.type === 'INCOME'
                            ? 'text-ledger-pine dark:text-ledger-pine-dark'
                            : 'text-ledger-teal dark:text-ledger-teal-dark'
                      }`}
                    >
                      {typeBadge}
                    </ThemedText>
                  </View>
                </View>
              </View>
            </Pressable>
          );
        })}

        {/* Add / Manage Preset Chip */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Manage or create quick presets"
          onPress={handleOpenModal}
          className="min-h-[44px] flex-row items-center gap-1.5 px-3.5 py-2 rounded-2xl border border-dashed border-ledger-border-strong dark:border-ledger-border-strong-dark bg-ledger-subtle dark:bg-ledger-subtle-dark active:scale-95"
        >
          <AppIcon name="add" size={14} color={theme.primary} />
          <ThemedText className="text-xs font-bold text-brand-500 dark:text-brand-400">
            Preset
          </ThemedText>
        </Pressable>
      </ScrollView>

      {/* Quick Preset Management Modal */}
      <Modal
        visible={isModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsModalOpen(false)}
      >
        <SafeAreaView
          className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark"
          edges={['top', 'bottom', 'left', 'right']}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            <ThemedView className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark px-4 pt-4">
              {/* Header */}
              <View className="flex-row justify-between items-center mb-3">
                <View>
                  <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    1-Tap Capture
                  </ThemedText>
                  <ThemedText className="text-2xl font-bold tracking-tight text-ledger-ink dark:text-ledger-ink-dark">
                    Quick Presets
                  </ThemedText>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close quick preset modal"
                  className="min-h-[44px] px-4 py-2 rounded-full bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-center gap-1.5 active:opacity-75"
                  onPress={() => setIsModalOpen(false)}
                >
                  <AppIcon name="close" size={14} color={theme.textSecondary} />
                  <ThemedText className="text-xs font-bold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                    Close
                  </ThemedText>
                </Pressable>
              </View>

              {/* Tab Selector: Create vs Manage */}
              <View className="flex-row rounded-2xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark p-1 mb-3 gap-1">
                <Pressable
                  accessibilityRole="tab"
                  accessibilityLabel="Create new preset tab"
                  accessibilityState={{ selected: modalTab === 'create' }}
                  className={`flex-1 min-h-[44px] rounded-xl flex-row items-center justify-center gap-1 ${
                    modalTab === 'create'
                      ? 'bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark'
                      : 'opacity-75'
                  }`}
                  onPress={() => {
                    setModalTab('create');
                    setConfirmingDeleteId(null);
                  }}
                >
                  <AppIcon
                    name="add"
                    size={13}
                    color={modalTab === 'create' ? theme.primary : theme.textSecondary}
                  />
                  <ThemedText
                    className={`text-xs font-bold ${
                      modalTab === 'create'
                        ? 'text-brand-500 dark:text-brand-400'
                        : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
                    }`}
                  >
                    New Preset
                  </ThemedText>
                </Pressable>

                <Pressable
                  accessibilityRole="tab"
                  accessibilityLabel="Manage existing presets tab"
                  accessibilityState={{ selected: modalTab === 'manage' }}
                  className={`flex-1 min-h-[44px] rounded-xl items-center justify-center ${
                    modalTab === 'manage'
                      ? 'bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark'
                      : 'opacity-75'
                  }`}
                  onPress={() => {
                    setModalTab('manage');
                    setManageError(null);
                  }}
                >
                  <ThemedText
                    numeric
                    className={`text-xs font-bold ${
                      modalTab === 'manage'
                        ? 'text-brand-500 dark:text-brand-400'
                        : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
                    }`}
                  >
                    Manage ({presets.length})
                  </ThemedText>
                </Pressable>
              </View>

              {/* Tab 1: Create Preset Form */}
              {modalTab === 'create' && (
                <ScrollView
                  className="flex-1"
                  contentContainerClassName="pb-10 gap-3"
                  keyboardShouldPersistTaps="handled"
                >
                  {errorMessage && (
                    <View
                      accessibilityRole="alert"
                      className="p-3 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark flex-row items-center gap-2"
                    >
                      <AppIcon name="warning" size={15} color={theme.negative} />
                      <ThemedText className="flex-1 text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                        {errorMessage}
                      </ThemedText>
                    </View>
                  )}

                  {/* Label */}
                  <View>
                    <ThemedText className="text-xs font-bold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mb-1">
                      Preset Label
                    </ThemedText>
                    <TextInput
                      className="h-12 rounded-xl border border-ledger-border-strong dark:border-ledger-border-strong-dark px-3 text-sm bg-ledger-surface dark:bg-ledger-surface-dark text-ledger-ink dark:text-ledger-ink-dark"
                      value={label}
                      onChangeText={setLabel}
                      placeholder="e.g. Daily Coffee"
                      placeholderTextColor={theme.textMuted}
                      maxLength={50}
                    />
                  </View>

                  {/* Icon Picker */}
                  <View>
                    <ThemedText className="text-xs font-bold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mb-1">
                      Icon ({activeIcon})
                    </ThemedText>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerClassName="gap-1.5 py-1"
                    >
                      {COMMON_PRESET_ICONS.map((emoji) => (
                        <Pressable
                          key={emoji}
                          accessibilityRole="button"
                          accessibilityLabel={`Select icon ${emoji}`}
                          className={`w-11 h-11 rounded-xl items-center justify-center border ${
                            icon === emoji && !customIconInput
                              ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-500 dark:border-brand-400'
                              : 'bg-ledger-surface dark:bg-ledger-surface-dark border-ledger-border dark:border-ledger-border-dark'
                          }`}
                          onPress={() => {
                            setIcon(emoji);
                            setCustomIconInput('');
                          }}
                        >
                          <ThemedText className="text-lg">{emoji}</ThemedText>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>

                  {/* Transaction Type */}
                  <View>
                    <ThemedText className="text-xs font-bold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mb-1">
                      Transaction Type
                    </ThemedText>
                    <View className="flex-row gap-2">
                      {(['EXPENSE', 'INCOME', 'TRANSFER'] as const).map((t) => (
                        <Pressable
                          key={t}
                          accessibilityRole="button"
                          accessibilityLabel={`Set type to ${t}`}
                          className={`flex-1 min-h-[44px] py-2 rounded-xl items-center justify-center border ${
                            type === t
                              ? 'bg-brand-500 dark:bg-brand-400 border-brand-500 dark:border-brand-400'
                              : 'bg-ledger-surface dark:bg-ledger-surface-dark border-ledger-border dark:border-ledger-border-dark'
                          }`}
                          onPress={() => setType(t)}
                        >
                          <ThemedText
                            className={`text-xs font-bold ${
                              type === t
                                ? 'text-ledger-canvas dark:text-ledger-canvas-dark'
                                : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
                            }`}
                          >
                            {t}
                          </ThemedText>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  {/* Amount */}
                  <View>
                    <ThemedText className="text-xs font-bold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mb-1">
                      Amount ({currency})
                    </ThemedText>
                    <TextInput
                      className="h-12 rounded-xl border border-ledger-border-strong dark:border-ledger-border-strong-dark px-3 text-base font-bold bg-ledger-surface dark:bg-ledger-surface-dark text-ledger-ink dark:text-ledger-ink-dark"
                      style={TABULAR_NUMS_STYLE}
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      autoCorrect={false}
                      spellCheck={false}
                      autoComplete="off"
                      value={amountInput}
                      onChangeText={(text) => setAmountInput(normalizeDecimalInput(text))}
                      placeholder="0.00"
                      placeholderTextColor={theme.textMuted}
                    />
                  </View>

                  {/* Account */}
                  <View>
                    <ThemedText className="text-xs font-bold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mb-1">
                      {type === 'TRANSFER' ? 'Source Account' : 'Account'}
                    </ThemedText>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerClassName="gap-2 py-0.5"
                    >
                      {accounts.map((a) => (
                        <Pressable
                          key={a.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Account ${a.name}`}
                          accessibilityState={{ selected: accountId === a.id }}
                          className={`min-h-[44px] px-3 py-2 rounded-xl border flex-row items-center gap-1.5 ${
                            accountId === a.id
                              ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-500 dark:border-brand-400'
                              : 'bg-ledger-surface dark:bg-ledger-surface-dark border-ledger-border dark:border-ledger-border-dark'
                          }`}
                          onPress={() => setAccountId(a.id)}
                        >
                          <ThemedText className="text-sm">{a.icon}</ThemedText>
                          <ThemedText
                            className={`text-xs font-semibold ${
                              accountId === a.id
                                ? 'text-brand-500 dark:text-brand-400'
                                : 'text-ledger-ink dark:text-ledger-ink-dark'
                            }`}
                          >
                            {a.name}
                          </ThemedText>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>

                  {/* Destination Account (Transfer only) */}
                  {type === 'TRANSFER' && (
                    <View>
                      <ThemedText className="text-xs font-bold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mb-1">
                        Destination Account
                      </ThemedText>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerClassName="gap-2 py-0.5"
                      >
                        {accounts.map((a) => (
                          <Pressable
                            key={a.id}
                            accessibilityRole="button"
                            accessibilityLabel={`Destination account ${a.name}`}
                            accessibilityState={{ selected: toAccountId === a.id }}
                            className={`min-h-[44px] px-3 py-2 rounded-xl border flex-row items-center gap-1.5 ${
                              toAccountId === a.id
                                ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-500 dark:border-brand-400'
                                : 'bg-ledger-surface dark:bg-ledger-surface-dark border-ledger-border dark:border-ledger-border-dark'
                            }`}
                            onPress={() => setToAccountId(a.id)}
                          >
                            <ThemedText className="text-sm">{a.icon}</ThemedText>
                            <ThemedText
                              className={`text-xs font-semibold ${
                                toAccountId === a.id
                                  ? 'text-brand-500 dark:text-brand-400'
                                  : 'text-ledger-ink dark:text-ledger-ink-dark'
                              }`}
                            >
                              {a.name}
                            </ThemedText>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  {/* Category (Expense / Income only) */}
                  {type !== 'TRANSFER' && filteredCategories.length > 0 && (
                    <View>
                      <ThemedText className="text-xs font-bold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mb-1">
                        Category
                      </ThemedText>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerClassName="gap-2 py-0.5"
                      >
                        {filteredCategories.map((c) => (
                          <Pressable
                            key={c.id}
                            accessibilityRole="button"
                            accessibilityLabel={`Category ${c.name}`}
                            className={`min-h-[44px] px-3 py-2 rounded-xl border flex-row items-center gap-1.5 ${
                              categoryId === c.id
                                ? 'border-brand-500 dark:border-brand-400'
                                : 'bg-ledger-surface dark:bg-ledger-surface-dark border-ledger-border dark:border-ledger-border-dark'
                            }`}
                            style={
                              categoryId === c.id
                                ? { backgroundColor: `${c.color}20`, borderColor: c.color }
                                : undefined
                            }
                            onPress={() => setCategoryId(c.id)}
                          >
                            <ThemedText className="text-sm">{c.icon}</ThemedText>
                            <ThemedText
                              className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark"
                              style={categoryId === c.id ? { color: c.color } : undefined}
                            >
                              {c.name}
                            </ThemedText>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  {/* Merchant (optional) */}
                  <View>
                    <ThemedText className="text-xs font-bold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mb-1">
                      Merchant / Payee (Optional)
                    </ThemedText>
                    <TextInput
                      className="h-12 rounded-xl border border-ledger-border-strong dark:border-ledger-border-strong-dark px-3 text-sm bg-ledger-surface dark:bg-ledger-surface-dark text-ledger-ink dark:text-ledger-ink-dark"
                      value={merchant}
                      onChangeText={setMerchant}
                      placeholder="e.g. Starbucks"
                      placeholderTextColor={theme.textMuted}
                      maxLength={80}
                    />
                  </View>

                  {/* Save Button */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Save preset"
                    disabled={upsertPresetMutation.isPending}
                    className={`mt-2 min-h-[48px] h-12 rounded-xl bg-brand-500 dark:bg-brand-400 active:opacity-90 items-center justify-center active:scale-[0.98] ${
                      upsertPresetMutation.isPending ? 'opacity-70' : ''
                    }`}
                    onPress={handleSavePreset}
                  >
                    <ThemedText className="text-base font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
                      {upsertPresetMutation.isPending ? 'Saving...' : 'Save Quick Preset'}
                    </ThemedText>
                  </Pressable>
                </ScrollView>
              )}

              {/* Tab 2: Manage Existing Presets */}
              {modalTab === 'manage' && (
                <ScrollView
                  className="flex-1"
                  contentContainerClassName="pb-10 gap-2.5"
                >
                  {manageError && (
                    <View
                      accessibilityRole="alert"
                      className="p-3 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark flex-row items-center gap-2"
                    >
                      <AppIcon name="warning" size={15} color={theme.negative} />
                      <ThemedText className="flex-1 text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                        {manageError}
                      </ThemedText>
                    </View>
                  )}

                  {presets.length === 0 ? (
                    <View className="p-8 items-center justify-center gap-3">
                      <ThemedText className="text-sm text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                        No presets created yet.
                      </ThemedText>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Create first preset"
                        onPress={() => setModalTab('create')}
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-brand-500 dark:bg-brand-400 active:opacity-90 flex-row items-center justify-center gap-1.5"
                      >
                        <AppIcon name="add" size={14} color={theme.onPrimary} />
                        <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
                          Create Preset
                        </ThemedText>
                      </Pressable>
                    </View>
                  ) : (
                    presets.map((preset) => {
                      const isConfirming = confirmingDeleteId === preset.id;

                      return (
                        <View
                          key={preset.id}
                          className="p-3 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-between gap-2"
                        >
                          <View className="flex-row items-center gap-2.5 flex-1 min-w-0">
                            <ThemedText className="text-2xl">{preset.icon}</ThemedText>
                            <View className="flex-1 min-w-0">
                              <ThemedText
                                className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark"
                                numberOfLines={1}
                              >
                                {preset.label}
                              </ThemedText>
                              <ThemedText
                                numeric
                                className="text-xs font-semibold text-brand-500 dark:text-brand-400"
                              >
                                {formatMinorUnits(preset.amountMinor, currency)} · {preset.type}
                              </ThemedText>
                            </View>
                          </View>

                          {isConfirming ? (
                            <View className="flex-row items-center gap-1.5">
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Cancel deleting preset ${preset.label}`}
                                disabled={deletePresetMutation.isPending}
                                className="min-h-[44px] px-3 py-2 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                                onPress={() => setConfirmingDeleteId(null)}
                              >
                                <ThemedText className="text-xs font-bold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                                  Cancel
                                </ThemedText>
                              </Pressable>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Confirm delete preset ${preset.label}`}
                                disabled={deletePresetMutation.isPending}
                                className="min-h-[44px] px-3 py-2 rounded-xl bg-ledger-terracotta dark:bg-ledger-terracotta-dark items-center justify-center active:opacity-75"
                                onPress={() => handleConfirmDeletePreset(preset.id)}
                              >
                                <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
                                  {deletePresetMutation.isPending ? '...' : 'Confirm'}
                                </ThemedText>
                              </Pressable>
                            </View>
                          ) : (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Delete preset ${preset.label}`}
                              disabled={deletePresetMutation.isPending}
                              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft items-center justify-center active:opacity-75"
                              onPress={() => {
                                setManageError(null);
                                setConfirmingDeleteId(preset.id);
                              }}
                            >
                              <ThemedText className="text-xs font-bold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                                Delete
                              </ThemedText>
                            </Pressable>
                          )}
                        </View>
                      );
                    })
                  )}
                </ScrollView>
              )}
            </ThemedView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
