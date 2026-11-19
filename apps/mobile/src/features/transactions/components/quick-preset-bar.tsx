import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  formatMinorUnits,
  minorUnitsToDecimalInput,
  parseDecimalToMinorUnits,
  type QuickPreset,
  type TransactionType,
} from '@repo/contracts';
import { ThemedText } from '@/common/components/themed-text';
import { ThemedView } from '@/common/components/themed-view';
import {
  useAllCategories,
  useDeleteQuickPreset,
  useUpsertQuickPreset,
  useWallets,
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
  currentWalletId?: string;
  currentToWalletId?: string;
  currentCategoryId?: string;
  currentMerchant?: string;
  currentTags?: readonly string[];
}

export function QuickPresetBar({
  presets,
  onSelectPreset,
  onCreatePreset,
  currency = 'PHP',
  currentType = 'EXPENSE',
  currentAmountMinor,
  currentWalletId,
  currentToWalletId,
  currentCategoryId,
  currentMerchant,
  currentTags = [],
}: QuickPresetBarProps) {
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
  const [walletId, setWalletId] = useState(currentWalletId ?? '');
  const [toWalletId, setToWalletId] = useState(currentToWalletId ?? '');
  const [categoryId, setCategoryId] = useState(currentCategoryId ?? '');
  const [merchant, setMerchant] = useState(currentMerchant ?? '');
  const [tagsInput, setTagsInput] = useState(currentTags.join(', '));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Queries & Mutations
  const walletsQuery = useWallets();
  const wallets = walletsQuery.data ?? [];

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
      setWalletId(currentWalletId || wallets[0]?.id || '');
      setToWalletId(
        currentToWalletId ||
          wallets.find((w) => w.id !== currentWalletId)?.id ||
          wallets[1]?.id ||
          '',
      );
      setCategoryId(currentCategoryId || categories.find((c) => c.type === currentType)?.id || '');
      setMerchant(currentMerchant ?? '');
      setTagsInput(currentTags.join(', '));
      setErrorMessage(null);
    }
  }, [
    isModalOpen,
    currentType,
    currentAmountMinor,
    currentWalletId,
    currentToWalletId,
    currentCategoryId,
    currentMerchant,
    currentTags,
    wallets,
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

    if (!walletId) {
      setErrorMessage('Please select a wallet.');
      return;
    }

    if (type === 'TRANSFER') {
      if (!toWalletId || toWalletId === walletId) {
        setErrorMessage('Please select a different destination wallet.');
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
        walletId,
        toWalletId: type === 'TRANSFER' ? toWalletId : undefined,
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

  const handleDeletePreset = async (presetId: string, presetLabel: string) => {
    const doDelete = async () => {
      try {
        await deletePresetMutation.mutateAsync(presetId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to delete preset.';
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.alert(msg);
        } else {
          Alert.alert('Error', msg);
        }
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`Delete preset "${presetLabel}"?`)) {
        await doDelete();
      }
    } else {
      Alert.alert(
        'Delete Preset',
        `Are you sure you want to delete "${presetLabel}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ],
      );
    }
  };

  return (
    <View className="w-full">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="flex-row items-center gap-2 py-1 px-0.5"
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
              className="flex-row items-center gap-2 px-3 py-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs active:scale-95 transition-all"
            >
              <ThemedText className="text-base">{preset.icon}</ThemedText>
              <View>
                <ThemedText
                  className="text-xs font-bold text-slate-800 dark:text-slate-100"
                  numberOfLines={1}
                >
                  {preset.label}
                </ThemedText>
                <View className="flex-row items-center gap-1.5 mt-0.5">
                  <ThemedText className="text-[11px] font-bold text-brand-600 dark:text-brand-400">
                    {formatMinorUnits(preset.amountMinor, currency)}
                  </ThemedText>
                  <View
                    className={`px-1 py-0.2 rounded ${
                      preset.type === 'EXPENSE'
                        ? 'bg-rose-50 dark:bg-rose-950/60'
                        : preset.type === 'INCOME'
                          ? 'bg-emerald-50 dark:bg-emerald-950/60'
                          : 'bg-indigo-50 dark:bg-indigo-950/60'
                    }`}
                  >
                    <ThemedText
                      className={`text-[9px] font-bold ${
                        preset.type === 'EXPENSE'
                          ? 'text-rose-600 dark:text-rose-400'
                          : preset.type === 'INCOME'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-indigo-600 dark:text-indigo-400'
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
          className="flex-row items-center gap-1.5 px-3 py-2.5 rounded-2xl border border-dashed border-brand-300 dark:border-brand-800/80 bg-brand-50/40 dark:bg-brand-950/20 active:scale-95 transition-all"
        >
          <ThemedText className="text-xs font-bold text-brand-600 dark:text-brand-400">
            + Add
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
        <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
          <ThemedView className="flex-1 bg-slate-50 dark:bg-slate-950 px-4 pt-4">
            {/* Header */}
            <View className="flex-row justify-between items-center mb-3">
              <View>
                <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  1-TAP CAPTURE
                </ThemedText>
                <ThemedText className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                  Quick Presets
                </ThemedText>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close quick preset modal"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                className="px-3.5 py-1.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 active:opacity-75"
                onPress={() => setIsModalOpen(false)}
              >
                <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Close
                </ThemedText>
              </Pressable>
            </View>

          {/* Tab Selector: Create vs Manage */}
          <View className="flex-row rounded-xl bg-slate-200 dark:bg-slate-800 p-1 mb-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create new preset tab"
              className={`flex-1 py-1.5 rounded-lg items-center ${
                modalTab === 'create'
                  ? 'bg-white dark:bg-slate-900 shadow-xs'
                  : 'opacity-70'
              }`}
              onPress={() => setModalTab('create')}
            >
              <ThemedText
                className={`text-xs font-bold ${
                  modalTab === 'create'
                    ? 'text-brand-600 dark:text-brand-400'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                + New Preset
              </ThemedText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Manage existing presets tab"
              className={`flex-1 py-1.5 rounded-lg items-center ${
                modalTab === 'manage'
                  ? 'bg-white dark:bg-slate-900 shadow-xs'
                  : 'opacity-70'
              }`}
              onPress={() => setModalTab('manage')}
            >
              <ThemedText
                className={`text-xs font-bold ${
                  modalTab === 'manage'
                    ? 'text-brand-600 dark:text-brand-400'
                    : 'text-slate-600 dark:text-slate-400'
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
                <View className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800">
                  <ThemedText className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                    {errorMessage}
                  </ThemedText>
                </View>
              )}

              {/* Label */}
              <View>
                <ThemedText className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                  Preset Label
                </ThemedText>
                <TextInput
                  className="h-11 rounded-xl border border-slate-200 dark:border-slate-800 px-3 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  value={label}
                  onChangeText={setLabel}
                  placeholder="e.g. Daily Coffee"
                  placeholderTextColor="#94A3B8"
                  maxLength={50}
                />
              </View>

              {/* Icon Picker */}
              <View>
                <ThemedText className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
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
                      accessibilityLabel={`Select emoji ${emoji}`}
                      className={`w-10 h-10 rounded-xl items-center justify-center border ${
                        icon === emoji && !customIconInput
                          ? 'bg-brand-50 dark:bg-brand-950 border-brand-500'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
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
                <ThemedText className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                  Transaction Type
                </ThemedText>
                <View className="flex-row gap-2">
                  {(['EXPENSE', 'INCOME', 'TRANSFER'] as const).map((t) => (
                    <Pressable
                      key={t}
                      accessibilityRole="button"
                      accessibilityLabel={`Set type to ${t}`}
                      className={`flex-1 py-2 rounded-xl items-center border ${
                        type === t
                          ? 'bg-brand-500 border-brand-500'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                      }`}
                      onPress={() => setType(t)}
                    >
                      <ThemedText
                        className={`text-xs font-bold ${
                          type === t ? 'text-white' : 'text-slate-600 dark:text-slate-400'
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
                <ThemedText className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                  Amount ({currency})
                </ThemedText>
                <TextInput
                  className="h-11 rounded-xl border border-slate-200 dark:border-slate-800 px-3 text-base font-mono font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  keyboardType="decimal-pad"
                  value={amountInput}
                  onChangeText={setAmountInput}
                  placeholder="0.00"
                  placeholderTextColor="#94A3B8"
                />
              </View>

              {/* Wallet */}
              <View>
                <ThemedText className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                  {type === 'TRANSFER' ? 'Source Wallet' : 'Wallet'}
                </ThemedText>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerClassName="gap-2 py-0.5"
                >
                  {wallets.map((w) => (
                    <Pressable
                      key={w.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Wallet ${w.name}`}
                      className={`px-3 py-1.5 rounded-xl border flex-row items-center gap-1.5 ${
                        walletId === w.id
                          ? 'bg-brand-50 dark:bg-brand-950 border-brand-500'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                      }`}
                      onPress={() => setWalletId(w.id)}
                    >
                      <ThemedText className="text-sm">{w.icon}</ThemedText>
                      <ThemedText
                        className={`text-xs font-semibold ${
                          walletId === w.id
                            ? 'text-brand-600 dark:text-brand-400'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {w.name}
                      </ThemedText>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {/* Destination Wallet (Transfer only) */}
              {type === 'TRANSFER' && (
                <View>
                  <ThemedText className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                    Destination Wallet
                  </ThemedText>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerClassName="gap-2 py-0.5"
                  >
                    {wallets.map((w) => (
                      <Pressable
                        key={w.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Destination wallet ${w.name}`}
                        className={`px-3 py-1.5 rounded-xl border flex-row items-center gap-1.5 ${
                          toWalletId === w.id
                            ? 'bg-brand-50 dark:bg-brand-950 border-brand-500'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                        }`}
                        onPress={() => setToWalletId(w.id)}
                      >
                        <ThemedText className="text-sm">{w.icon}</ThemedText>
                        <ThemedText
                          className={`text-xs font-semibold ${
                            toWalletId === w.id
                              ? 'text-brand-600 dark:text-brand-400'
                              : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {w.name}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Category (Expense / Income only) */}
              {type !== 'TRANSFER' && filteredCategories.length > 0 && (
                <View>
                  <ThemedText className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
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
                        className={`px-3 py-1.5 rounded-xl border flex-row items-center gap-1.5 ${
                          categoryId === c.id
                            ? 'border-brand-500'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                        }`}
                        style={
                          categoryId === c.id
                            ? { backgroundColor: `${c.color}25` }
                            : undefined
                        }
                        onPress={() => setCategoryId(c.id)}
                      >
                        <ThemedText className="text-sm">{c.icon}</ThemedText>
                        <ThemedText
                          className="text-xs font-semibold text-slate-800 dark:text-slate-200"
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
                <ThemedText className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                  Merchant / Payee (Optional)
                </ThemedText>
                <TextInput
                  className="h-11 rounded-xl border border-slate-200 dark:border-slate-800 px-3 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  value={merchant}
                  onChangeText={setMerchant}
                  placeholder="e.g. Starbucks"
                  placeholderTextColor="#94A3B8"
                  maxLength={80}
                />
              </View>

              {/* Save Button */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save preset"
                disabled={upsertPresetMutation.isPending}
                className="mt-2 h-12 rounded-2xl bg-brand-500 active:bg-brand-600 items-center justify-center active:scale-[0.98]"
                onPress={handleSavePreset}
              >
                <ThemedText className="text-base font-bold text-white">
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
              {presets.length === 0 ? (
                <View className="p-8 items-center justify-center">
                  <ThemedText className="text-sm text-slate-400">
                    No presets created yet.
                  </ThemedText>
                </View>
              ) : (
                presets.map((preset) => (
                  <View
                    key={preset.id}
                    className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex-row items-center justify-between"
                  >
                    <View className="flex-row items-center gap-2.5 flex-1 mr-2">
                      <ThemedText className="text-2xl">{preset.icon}</ThemedText>
                      <View className="flex-1">
                        <ThemedText
                          className="text-sm font-bold text-slate-900 dark:text-slate-100"
                          numberOfLines={1}
                        >
                          {preset.label}
                        </ThemedText>
                        <ThemedText className="text-xs font-semibold text-brand-600 dark:text-brand-400">
                          {formatMinorUnits(preset.amountMinor, currency)} • {preset.type}
                        </ThemedText>
                      </View>
                    </View>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Delete preset ${preset.label}`}
                      disabled={deletePresetMutation.isPending}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 active:opacity-75"
                      onPress={() => handleDeletePreset(preset.id, preset.label)}
                    >
                      <ThemedText className="text-xs font-bold text-rose-500">
                        Delete
                      </ThemedText>
                    </Pressable>
                  </View>
                ))
              )}
            </ScrollView>
          )}
        </ThemedView>
      </SafeAreaView>
    </Modal>
  </View>
);
}
