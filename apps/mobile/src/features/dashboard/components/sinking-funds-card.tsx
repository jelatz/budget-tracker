import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import {
  computeSinkingFundMonthlyTarget,
  formatMinorUnits,
  minorUnitsToDecimalInput,
  parseDecimalToMinorUnits,
  type SinkingFund,
} from '@repo/contracts';
import { ThemedText } from '@/common/components/themed-text';
import { confirmAction } from '@/common/lib/confirm';
import {
  useContributeToSinkingFund,
  useDeleteSinkingFund,
  useSinkingFunds,
  useUpsertSinkingFund,
  useWallets,
} from '@/features/transactions/hooks/use-transactions';

const FUND_ICONS = [
  '🚗',
  '🎁',
  '🏖️',
  '💻',
  '🏥',
  '🏠',
  '🎓',
  '💍',
  '✈️',
  '🛡️',
  '🚲',
  '⛺',
  '🎯',
  '🐾',
  '🔧',
];

const FUND_COLORS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#64748B',
];

const AMOUNT_PRESETS = [500000, 1500000, 3000000, 5000000]; // ₱5,000, ₱15,000, ₱30,000, ₱50,000

function getDatePreset(type: '3_MOS' | '6_MOS' | '1_YR' | 'EOY'): string {
  const now = new Date();
  if (type === 'EOY') {
    return `${now.getFullYear()}-12-31`;
  }
  const target = new Date(now);
  if (type === '3_MOS') target.setMonth(target.getMonth() + 3);
  if (type === '6_MOS') target.setMonth(target.getMonth() + 6);
  if (type === '1_YR') target.setFullYear(target.getFullYear() + 1);

  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, '0');
  const day = String(target.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function SinkingFundsCard() {
  // Queries & Mutations
  const { data: sinkingFunds = [], isLoading } = useSinkingFunds();
  const { data: wallets = [] } = useWallets();
  const upsertMutation = useUpsertSinkingFund();
  const contributeMutation = useContributeToSinkingFund();
  const deleteMutation = useDeleteSinkingFund();

  // Create / Edit Modal State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingFund, setEditingFund] = useState<SinkingFund | null>(null);

  // Edit Form Fields
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🎯');
  const [customIcon, setCustomIcon] = useState('');
  const [color, setColor] = useState('#3B82F6');
  const [targetAmountInput, setTargetAmountInput] = useState('1000');
  const [targetDate, setTargetDate] = useState(() => getDatePreset('6_MOS'));
  const [walletId, setWalletId] = useState('');
  const [notes, setNotes] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  // Quick Stash Modal State
  const [stashModalVisible, setStashModalVisible] = useState(false);
  const [stashingFund, setStashingFund] = useState<SinkingFund | null>(null);
  const [stashAmountInput, setStashAmountInput] = useState('');
  const [stashSourceWalletId, setStashSourceWalletId] = useState('');
  const [stashError, setStashError] = useState<string | null>(null);

  const isSubmitting =
    upsertMutation.isPending || contributeMutation.isPending || deleteMutation.isPending;

  // Wallet map for quick lookup
  const walletMap = useMemo(() => {
    const map = new Map<string, { name: string; icon: string; balanceMinor: number }>();
    for (const w of wallets) {
      map.set(w.id, { name: w.name, icon: w.icon, balanceMinor: w.balanceMinor });
    }
    return map;
  }, [wallets]);

  // Sinking Fund totals
  const totals = useMemo(() => {
    let totalSaved = 0;
    let totalTarget = 0;
    for (const sf of sinkingFunds) {
      totalSaved += sf.currentSavedMinor;
      totalTarget += sf.targetAmountMinor;
    }
    return { totalSaved, totalTarget };
  }, [sinkingFunds]);

  // Live calculation for create/edit modal
  const livePreview = useMemo(() => {
    const minor = parseDecimalToMinorUnits(targetAmountInput);
    if (minor === null || minor <= 0 || !/^\d{4}-\d{2}(-\d{2})?$/.test(targetDate.trim())) {
      return null;
    }
    const currentSaved = editingFund?.currentSavedMinor ?? 0;
    try {
      return computeSinkingFundMonthlyTarget(minor, currentSaved, targetDate.trim());
    } catch {
      return null;
    }
  }, [targetAmountInput, targetDate, editingFund]);

  // Handle Opening Create Modal
  const handleOpenCreateModal = () => {
    setEditingFund(null);
    setName('');
    setIcon('🎯');
    setCustomIcon('');
    setColor('#3B82F6');
    setTargetAmountInput('10000');
    setTargetDate(getDatePreset('6_MOS'));
    setWalletId(wallets[0]?.id ?? '');
    setNotes('');
    setEditError(null);
    setEditModalVisible(true);
  };

  // Handle Opening Edit Modal
  const handleOpenEditModal = (fund: SinkingFund) => {
    setEditingFund(fund);
    setName(fund.name);
    setIcon(fund.icon);
    setCustomIcon('');
    setColor(fund.color || '#3B82F6');
    setTargetAmountInput(minorUnitsToDecimalInput(fund.targetAmountMinor));
    setTargetDate(fund.targetDate);
    setWalletId(fund.walletId);
    setNotes(fund.notes ?? '');
    setEditError(null);
    setEditModalVisible(true);
  };

  const handleCloseEditModal = () => {
    if (!isSubmitting) {
      setEditModalVisible(false);
      setEditingFund(null);
      setEditError(null);
    }
  };

  // Handle Opening Stash Modal
  const handleOpenStashModal = (fund: SinkingFund) => {
    setStashingFund(fund);
    setStashSourceWalletId(fund.walletId || wallets[0]?.id || '');
    // Suggest monthly amount or remaining amount if reasonable
    const calc = computeSinkingFundMonthlyTarget(
      fund.targetAmountMinor,
      fund.currentSavedMinor,
      fund.targetDate,
    );
    if (calc.monthlyTargetMinor > 0) {
      setStashAmountInput(minorUnitsToDecimalInput(calc.monthlyTargetMinor));
    } else {
      setStashAmountInput('1000');
    }
    setStashError(null);
    setStashModalVisible(true);
  };

  const handleCloseStashModal = () => {
    if (!isSubmitting) {
      setStashModalVisible(false);
      setStashingFund(null);
      setStashError(null);
    }
  };

  // Save Sinking Fund
  const handleSaveFund = async () => {
    if (!name.trim()) {
      setEditError('Please enter a fund name.');
      return;
    }

    const minor = parseDecimalToMinorUnits(targetAmountInput);
    if (minor === null || minor <= 0) {
      setEditError('Please enter a valid positive target amount.');
      return;
    }

    const trimmedDate = targetDate.trim();
    if (!/^\d{4}-\d{2}(-\d{2})?$/.test(trimmedDate)) {
      setEditError('Target date must be in YYYY-MM or YYYY-MM-DD format.');
      return;
    }

    if (!walletId) {
      setEditError('Please select a holding wallet.');
      return;
    }

    const finalIcon = customIcon.trim() || icon || '🎯';

    try {
      setEditError(null);
      const payload: Omit<SinkingFund, 'id'> & { id?: string } = {
        name: name.trim(),
        icon: finalIcon,
        color,
        targetAmountMinor: minor,
        currentSavedMinor: editingFund?.currentSavedMinor ?? 0,
        targetDate: trimmedDate,
        walletId,
        monthlyContributionMinor: livePreview?.monthlyTargetMinor ?? 0,
        isCompleted: editingFund ? editingFund.currentSavedMinor >= minor : false,
        notes: notes.trim() || undefined,
      };

      if (editingFund?.id) {
        payload.id = editingFund.id;
      }

      await upsertMutation.mutateAsync(payload);
      setEditModalVisible(false);
      setEditingFund(null);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to save sinking fund.';
      setEditError(msg);
    }
  };

  // Delete Sinking Fund
  const handleDeleteFund = async () => {
    if (!editingFund) return;

    const confirmed = await confirmAction({
      title: 'Delete Sinking Fund',
      message: `Are you sure you want to delete "${editingFund.name}"? Accumulated savings remain safe in the holding wallet.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(editingFund.id);
      setEditModalVisible(false);
      setEditingFund(null);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to delete fund.';
      setEditError(msg);
    }
  };

  // Submit Stash
  const handleStashSubmit = async () => {
    if (!stashingFund) return;

    const minor = parseDecimalToMinorUnits(stashAmountInput);
    if (minor === null || minor <= 0) {
      setStashError('Please enter a valid positive peso amount.');
      return;
    }

    if (!stashSourceWalletId) {
      setStashError('Please select a source wallet.');
      return;
    }

    try {
      setStashError(null);
      await contributeMutation.mutateAsync({
        fundId: stashingFund.id,
        amountMinor: minor,
        sourceWalletId: stashSourceWalletId,
      });
      setStashModalVisible(false);
      setStashingFund(null);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to contribute to sinking fund.';
      setStashError(msg);
    }
  };

  return (
    <View className="rounded-3xl p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm gap-4">
      {/* 1. Header */}
      <View className="flex-row items-center justify-between">
        <View className="gap-0.5 flex-1 mr-2">
          <ThemedText className="text-base font-bold text-slate-900 dark:text-white">
            Sinking Funds
          </ThemedText>
          <ThemedText className="text-xs text-slate-500 dark:text-slate-400" numberOfLines={1}>
            Savings vaults for irregular expenses
          </ThemedText>
        </View>

        <Pressable
          onPress={handleOpenCreateModal}
          accessibilityRole="button"
          accessibilityLabel="Create New Sinking Fund"
          className="bg-brand-500 active:bg-brand-600 px-3 py-1.5 rounded-full flex-row items-center gap-1 shadow-sm"
        >
          <ThemedText className="text-white text-xs font-bold">+ New Fund</ThemedText>
        </Pressable>
      </View>

      {/* 2. Summary Badge */}
      {sinkingFunds.length > 0 && (
        <View className="flex-row items-center justify-between bg-slate-50 dark:bg-slate-950 p-3 rounded-2xl border border-slate-200/60 dark:border-slate-800/80">
          <View>
            <ThemedText className="text-[11px] text-slate-500 dark:text-slate-400">
              Total Saved Across Vaults
            </ThemedText>
            <ThemedText className="text-sm font-bold text-slate-900 dark:text-white">
              {formatMinorUnits(totals.totalSaved)}
            </ThemedText>
          </View>

          <View className="items-end">
            <ThemedText className="text-[11px] text-slate-500 dark:text-slate-400">
              Combined Target
            </ThemedText>
            <ThemedText className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {formatMinorUnits(totals.totalTarget)}
            </ThemedText>
          </View>
        </View>
      )}

      {/* 3. List of Sinking Funds */}
      {isLoading ? (
        <View className="py-8 items-center justify-center">
          <ActivityIndicator size="small" color="#0ea5e9" />
          <ThemedText className="text-xs text-slate-400 mt-2">Loading sinking funds...</ThemedText>
        </View>
      ) : sinkingFunds.length === 0 ? (
        <View className="py-6 items-center justify-center gap-2 bg-slate-50/50 dark:bg-slate-950/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
          <ThemedText className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            No sinking funds created
          </ThemedText>
          <ThemedText className="text-xs text-center text-slate-500 dark:text-slate-400 max-w-[260px]">
            Set aside money for car repairs, insurance, holiday gifts, and vacations ahead of time.
          </ThemedText>
          <Pressable
            onPress={handleOpenCreateModal}
            accessibilityRole="button"
            accessibilityLabel="Create First Sinking Fund"
            className="mt-1 px-3 py-1.5 rounded-xl bg-brand-500 active:bg-brand-600"
          >
            <ThemedText className="text-white text-xs font-bold">+ Create Sinking Fund</ThemedText>
          </Pressable>
        </View>
      ) : (
        <View className="gap-3">
          {sinkingFunds.map((fund) => {
            const holdingWallet = walletMap.get(fund.walletId);
            const percent =
              fund.targetAmountMinor > 0
                ? Math.round((fund.currentSavedMinor * 100) / fund.targetAmountMinor)
                : 0;
            const clampedPercent = Math.min(100, Math.max(0, percent));
            const calc = computeSinkingFundMonthlyTarget(
              fund.targetAmountMinor,
              fund.currentSavedMinor,
              fund.targetDate,
            );

            return (
              <View
                key={fund.id}
                className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800/80 gap-2.5"
              >
                {/* Row 1: Icon, Name, Wallet, Quick Stash & Edit */}
                <View className="flex-row items-center justify-between">
                  <Pressable
                    onPress={() => handleOpenEditModal(fund)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${fund.name}`}
                    className="flex-row items-center gap-2.5 flex-1 mr-2 active:opacity-75"
                  >
                    <View
                      className="w-9 h-9 rounded-xl items-center justify-center shadow-xs"
                      style={{ backgroundColor: `${fund.color}20` }}
                    >
                      <ThemedText className="text-lg">{fund.icon}</ThemedText>
                    </View>
                    <View className="flex-1">
                      <ThemedText
                        className="text-sm font-bold text-slate-900 dark:text-white"
                        numberOfLines={1}
                      >
                        {fund.name}
                      </ThemedText>
                      <ThemedText className="text-[11px] text-slate-500 dark:text-slate-400">
                        Vault:{' '}
                        <ThemedText className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                          {holdingWallet?.icon ?? '🏦'} {holdingWallet?.name ?? 'Main Wallet'}
                        </ThemedText>
                      </ThemedText>
                    </View>
                  </Pressable>

                  {/* Quick Stash Button */}
                  <Pressable
                    onPress={() => handleOpenStashModal(fund)}
                    accessibilityRole="button"
                    accessibilityLabel={`Stash funds into ${fund.name}`}
                    className="bg-emerald-600 active:bg-emerald-700 px-3 py-1.5 rounded-xl flex-row items-center gap-1 shadow-sm"
                  >
                    <ThemedText className="text-white text-xs font-bold">+ Stash</ThemedText>
                  </Pressable>
                </View>

                {/* Row 2: Saved vs Target & Percent */}
                <View className="flex-row items-baseline justify-between">
                  <ThemedText className="text-xs text-slate-500 dark:text-slate-400">
                    Saved:{' '}
                    <ThemedText className="font-bold text-slate-900 dark:text-white text-sm">
                      {formatMinorUnits(fund.currentSavedMinor)}
                    </ThemedText>{' '}
                    of {formatMinorUnits(fund.targetAmountMinor)}
                  </ThemedText>
                  <ThemedText
                    className="text-xs font-bold"
                    style={{ color: fund.color || '#3B82F6' }}
                  >
                    {percent}%
                  </ThemedText>
                </View>

                {/* Row 3: Progress Bar */}
                <View className="h-2.5 rounded-full bg-slate-200/70 dark:bg-slate-800 overflow-hidden">
                  <View
                    className="h-full rounded-full"
                    style={{
                      width: `${clampedPercent}%`,
                      backgroundColor: fund.color || '#3B82F6',
                    }}
                  />
                </View>

                {/* Row 4: Target Date Badge & Monthly Recommendation */}
                <View className="flex-row items-center justify-between flex-wrap gap-1.5 pt-0.5">
                  <View className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
                    <ThemedText className="text-[10px] font-medium text-slate-600 dark:text-slate-300">
                      Target: {fund.targetDate}
                    </ThemedText>
                  </View>

                  {calc.isTargetReached ? (
                    <View className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/80 dark:border-emerald-800/80">
                      <ThemedText className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                        Goal Reached!
                      </ThemedText>
                    </View>
                  ) : (
                    <View className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-800/80">
                      <ThemedText className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">
                        {formatMinorUnits(calc.monthlyTargetMinor)}/mo needed ({calc.remainingMonths}{' '}
                        mo)
                      </ThemedText>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* 4. Sinking Fund Create / Edit Modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseEditModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1 justify-center items-center p-4 bg-black/60"
        >
          <Pressable className="absolute inset-0" onPress={handleCloseEditModal} />

          <View className="w-full max-w-[440px] rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl gap-4">
            {/* Header */}
            <View className="flex-row items-center justify-between">
              <View>
                <ThemedText className="text-lg font-bold text-slate-900 dark:text-white">
                  {editingFund ? 'Edit Sinking Fund' : 'New Sinking Fund'}
                </ThemedText>
                <ThemedText className="text-xs text-slate-500 dark:text-slate-400">
                  Targeted irregular savings vault
                </ThemedText>
              </View>

              <Pressable
                onPress={handleCloseEditModal}
                accessibilityRole="button"
                accessibilityLabel="Close Modal"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center active:opacity-75"
              >
                <ThemedText className="text-xs text-slate-500 font-bold">✕</ThemedText>
              </Pressable>
            </View>

            {editError && (
              <View className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800">
                <ThemedText className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                  {editError}
                </ThemedText>
              </View>
            )}

            <ScrollView
              className="max-h-[440px]"
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View className="gap-4">
                {/* Fund Name */}
                <View className="gap-1.5">
                  <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Fund Name
                  </ThemedText>
                  <TextInput
                    className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 rounded-2xl px-4 py-2.5 text-sm font-semibold text-slate-900 dark:text-white"
                    value={name}
                    onChangeText={setName}
                    placeholder="e.g. Car Insurance, Vacation, Laptop"
                    placeholderTextColor="#94A3B8"
                    editable={!isSubmitting}
                  />
                </View>

                {/* Icon Selection */}
                <View className="gap-1.5">
                  <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Icon
                  </ThemedText>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerClassName="gap-2 py-1"
                  >
                    {FUND_ICONS.map((emoji) => {
                      const isSelected = icon === emoji && !customIcon;
                      return (
                        <Pressable
                          key={emoji}
                          onPress={() => {
                            setIcon(emoji);
                            setCustomIcon('');
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Select icon ${emoji}`}
                          className={`w-9 h-9 rounded-xl items-center justify-center border ${
                            isSelected
                              ? 'bg-brand-500 border-brand-500'
                              : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          <ThemedText className="text-base">{emoji}</ThemedText>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Color Selection */}
                <View className="gap-1.5">
                  <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Vault Accent Color
                  </ThemedText>
                  <View className="flex-row gap-2 flex-wrap">
                    {FUND_COLORS.map((c) => {
                      const isSelected = color === c;
                      return (
                        <Pressable
                          key={c}
                          onPress={() => setColor(c)}
                          accessibilityRole="button"
                          accessibilityLabel={`Select color ${c}`}
                          className={`w-8 h-8 rounded-full items-center justify-center ${
                            isSelected ? 'border-2 border-slate-900 dark:border-white scale-110' : ''
                          }`}
                          style={{ backgroundColor: c }}
                        >
                          {isSelected && <ThemedText className="text-white text-xs">✓</ThemedText>}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Target Amount */}
                <View className="gap-1.5">
                  <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Target Goal Amount (₱)
                  </ThemedText>
                  <View className="flex-row items-center border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 rounded-2xl px-4 py-3">
                    <ThemedText className="text-2xl font-bold text-slate-400 dark:text-slate-500 mr-2">
                      ₱
                    </ThemedText>
                    <TextInput
                      className="flex-1 text-2xl font-bold text-slate-900 dark:text-white p-0"
                      value={targetAmountInput}
                      onChangeText={(t) => {
                        setTargetAmountInput(t);
                        if (editError) setEditError(null);
                      }}
                      keyboardType="decimal-pad"
                      placeholder="10000"
                      placeholderTextColor="#94A3B8"
                      editable={!isSubmitting}
                    />
                  </View>

                  {/* Presets */}
                  <View className="flex-row gap-2 mt-1">
                    {AMOUNT_PRESETS.map((presetMinor) => (
                      <Pressable
                        key={presetMinor}
                        onPress={() =>
                          setTargetAmountInput(minorUnitsToDecimalInput(presetMinor))
                        }
                        accessibilityRole="button"
                        accessibilityLabel={`Set target to ${formatMinorUnits(presetMinor)}`}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 active:opacity-75"
                      >
                        <ThemedText className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          {formatMinorUnits(presetMinor)}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* Target Date */}
                <View className="gap-1.5">
                  <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Target Date (YYYY-MM-DD)
                  </ThemedText>
                  <TextInput
                    className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 rounded-2xl px-4 py-2.5 text-sm font-semibold text-slate-900 dark:text-white"
                    value={targetDate}
                    onChangeText={setTargetDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#94A3B8"
                    editable={!isSubmitting}
                  />

                  {/* Date Quick Presets */}
                  <View className="flex-row gap-2 mt-1 flex-wrap">
                    <Pressable
                      onPress={() => setTargetDate(getDatePreset('3_MOS'))}
                      accessibilityRole="button"
                      accessibilityLabel="Set date to 3 months from now"
                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 active:opacity-75"
                    >
                      <ThemedText className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        +3 Mos
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => setTargetDate(getDatePreset('6_MOS'))}
                      accessibilityRole="button"
                      accessibilityLabel="Set date to 6 months from now"
                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 active:opacity-75"
                    >
                      <ThemedText className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        +6 Mos
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => setTargetDate(getDatePreset('1_YR'))}
                      accessibilityRole="button"
                      accessibilityLabel="Set date to 1 year from now"
                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 active:opacity-75"
                    >
                      <ThemedText className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        +1 Year
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => setTargetDate(getDatePreset('EOY'))}
                      accessibilityRole="button"
                      accessibilityLabel="Set date to End of Year"
                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 active:opacity-75"
                    >
                      <ThemedText className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        End of Year
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>

                {/* Holding Wallet */}
                <View className="gap-1.5">
                  <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Holding Wallet (Vault Account)
                  </ThemedText>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerClassName="gap-2 py-1"
                  >
                    {wallets.map((w) => {
                      const isSelected = walletId === w.id;
                      return (
                        <Pressable
                          key={w.id}
                          onPress={() => setWalletId(w.id)}
                          accessibilityRole="button"
                          accessibilityLabel={`Hold funds in ${w.name}`}
                          className={`px-3 py-2 rounded-xl flex-row items-center gap-1.5 border ${
                            isSelected
                              ? 'bg-brand-500 border-brand-500'
                              : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          <ThemedText className="text-sm">{w.icon}</ThemedText>
                          <ThemedText
                            className={`text-xs font-semibold ${
                              isSelected ? 'text-white' : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {w.name}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Live Monthly Target Preview */}
                {livePreview && (
                  <View className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/80 gap-1">
                    <ThemedText className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                      Monthly Stash Target:
                    </ThemedText>
                    <ThemedText className="text-sm font-extrabold text-indigo-700 dark:text-indigo-300">
                      {formatMinorUnits(livePreview.monthlyTargetMinor)} / month
                    </ThemedText>
                    <ThemedText className="text-[11px] text-indigo-600 dark:text-indigo-400">
                      Based on {livePreview.remainingMonths} month
                      {livePreview.remainingMonths === 1 ? '' : 's'} remaining to reach goal.
                    </ThemedText>
                  </View>
                )}

                {/* Notes */}
                <View className="gap-1.5">
                  <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Notes (Optional)
                  </ThemedText>
                  <TextInput
                    className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 rounded-2xl p-3 text-sm text-slate-900 dark:text-white"
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="e.g. Due every 6 months to Geico"
                    placeholderTextColor="#94A3B8"
                    maxLength={280}
                    editable={!isSubmitting}
                  />
                </View>
              </View>
            </ScrollView>

            {/* Actions */}
            <View className="gap-2 pt-2">
              <Pressable
                onPress={handleSaveFund}
                disabled={isSubmitting}
                accessibilityRole="button"
                accessibilityLabel="Save Sinking Fund"
                className="bg-brand-500 active:bg-brand-600 py-3 rounded-2xl items-center justify-center shadow-md shadow-brand-500/20"
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <ThemedText className="text-white font-bold text-sm">
                    {editingFund ? 'Update Sinking Fund' : 'Create Sinking Fund'}
                  </ThemedText>
                )}
              </Pressable>

              {editingFund && (
                <Pressable
                  onPress={() => void handleDeleteFund()}
                  disabled={isSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel="Delete Sinking Fund"
                  className="py-2.5 rounded-2xl items-center justify-center border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/30 active:opacity-75"
                >
                  <ThemedText className="text-rose-600 dark:text-rose-400 font-bold text-xs">
                    Delete Sinking Fund
                  </ThemedText>
                </Pressable>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 5. Quick Stash (Deposit) Modal */}
      <Modal
        visible={stashModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseStashModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1 justify-center items-center p-4 bg-black/60"
        >
          <Pressable className="absolute inset-0" onPress={handleCloseStashModal} />

          <View className="w-full max-w-[420px] rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl gap-4">
            {/* Header */}
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <ThemedText className="text-2xl">{stashingFund?.icon ?? '🎯'}</ThemedText>
                <View>
                  <ThemedText className="text-base font-bold text-slate-900 dark:text-white">
                    Stash into {stashingFund?.name}
                  </ThemedText>
                  <ThemedText className="text-xs text-slate-500 dark:text-slate-400">
                    Saved: {formatMinorUnits(stashingFund?.currentSavedMinor ?? 0)} of{' '}
                    {formatMinorUnits(stashingFund?.targetAmountMinor ?? 0)}
                  </ThemedText>
                </View>
              </View>

              <Pressable
                onPress={handleCloseStashModal}
                accessibilityRole="button"
                accessibilityLabel="Close Modal"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center active:opacity-75"
              >
                <ThemedText className="text-xs text-slate-500 font-bold">✕</ThemedText>
              </Pressable>
            </View>

            {stashError && (
              <View className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800">
                <ThemedText className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                  {stashError}
                </ThemedText>
              </View>
            )}

            {/* Source Wallet Selector */}
            <View className="gap-1.5">
              <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Source Wallet
              </ThemedText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-2 py-1"
              >
                {wallets.map((w) => {
                  const isSelected = stashSourceWalletId === w.id;
                  return (
                    <Pressable
                      key={w.id}
                      onPress={() => setStashSourceWalletId(w.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Transfer from ${w.name}`}
                      className={`px-3 py-2 rounded-xl flex-row items-center gap-1.5 border ${
                        isSelected
                          ? 'bg-brand-500 border-brand-500'
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <ThemedText className="text-sm">{w.icon}</ThemedText>
                      <View>
                        <ThemedText
                          className={`text-xs font-semibold ${
                            isSelected ? 'text-white' : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {w.name}
                        </ThemedText>
                        <ThemedText
                          className={`text-[10px] ${
                            isSelected ? 'text-white/80' : 'text-slate-400'
                          }`}
                        >
                          {formatMinorUnits(w.balanceMinor, w.currency)}
                        </ThemedText>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Amount Input */}
            <View className="gap-1.5">
              <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Stash Amount (₱)
              </ThemedText>

              <View className="flex-row items-center border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 rounded-2xl px-4 py-3">
                <ThemedText className="text-2xl font-bold text-slate-400 dark:text-slate-500 mr-2">
                  ₱
                </ThemedText>
                <TextInput
                  className="flex-1 text-2xl font-bold text-slate-900 dark:text-white p-0"
                  value={stashAmountInput}
                  onChangeText={(t) => {
                    setStashAmountInput(t);
                    if (stashError) setStashError(null);
                  }}
                  keyboardType="decimal-pad"
                  placeholder="1000"
                  placeholderTextColor="#94A3B8"
                  autoFocus
                  editable={!isSubmitting}
                />
              </View>

              <ThemedText className="text-[11px] text-slate-500 dark:text-slate-400">
                {stashSourceWalletId === stashingFund?.walletId
                  ? 'Earmarks funds already inside this holding wallet without creating an expense.'
                  : 'Creates a transfer from the selected source wallet into this fund’s holding wallet.'}
              </ThemedText>

              {/* Quick Suggestions */}
              <View className="flex-row gap-2 mt-1 flex-wrap">
                {stashingFund && (
                  <Pressable
                    onPress={() => {
                      const calc = computeSinkingFundMonthlyTarget(
                        stashingFund.targetAmountMinor,
                        stashingFund.currentSavedMinor,
                        stashingFund.targetDate,
                      );
                      if (calc.monthlyTargetMinor > 0) {
                        setStashAmountInput(minorUnitsToDecimalInput(calc.monthlyTargetMinor));
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Use recommended monthly amount"
                    className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 active:opacity-75"
                  >
                    <ThemedText className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                      Recommended Monthly
                    </ThemedText>
                  </Pressable>
                )}
                {[100000, 250000, 500000].map((minor) => (
                  <Pressable
                    key={minor}
                    onPress={() => setStashAmountInput(minorUnitsToDecimalInput(minor))}
                    accessibilityRole="button"
                    accessibilityLabel={`Stash ${formatMinorUnits(minor)}`}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 active:opacity-75"
                  >
                    <ThemedText className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      {formatMinorUnits(minor)}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Actions */}
            <View className="gap-2 pt-2">
              <Pressable
                onPress={handleStashSubmit}
                disabled={isSubmitting}
                accessibilityRole="button"
                accessibilityLabel="Confirm Stash"
                className="bg-emerald-600 active:bg-emerald-700 py-3 rounded-2xl items-center justify-center shadow-md shadow-emerald-600/20"
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <ThemedText className="text-white font-bold text-sm">
                    Stash Funds Now
                  </ThemedText>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
