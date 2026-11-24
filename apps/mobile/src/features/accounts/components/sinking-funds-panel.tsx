import React, { useMemo, useRef, useState } from 'react';
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
  DEFAULT_CURRENCY_SYMBOL,
  formatMinorUnits,
  minorUnitsToDecimalInput,
  normalizeDecimalInput,
  parseDecimalToMinorUnits,
  type SinkingFund,
} from '@repo/contracts';
import { useFeedback } from '@/common/components/feedback-provider';
import { ThemedText } from '@/common/components/themed-text';
import { Colors, TABULAR_NUMS_STYLE } from '@/common/constants/theme';
import { useTheme } from '@/common/hooks/use-theme';
import { getUserErrorMessage } from '@/common/lib/error-message';
import {
  useAccounts,
  useContributeToSinkingFund,
  useDeleteSinkingFund,
  useSinkingFunds,
  useUpsertSinkingFund,
} from '@/features/transactions/hooks/use-transactions';

const FUND_COLORS = [
  { label: 'Forest Pine', value: Colors.light.primary },
  { label: 'Sage Pine', value: Colors.light.positive },
  { label: 'Deep Teal', value: Colors.light.info },
  { label: 'Warm Ochre', value: Colors.light.warning },
  { label: 'Terracotta', value: Colors.light.negative },
  { label: 'Mint Pine', value: Colors.dark.positive },
  { label: 'Sky Teal', value: Colors.dark.info },
  { label: 'Warm Slate', value: Colors.light.textSecondary },
] as const;

const DEFAULT_FUND_COLOR = FUND_COLORS[0].value;

function getFundMonogram(fundName: string): string {
  return fundName.trim().slice(0, 2).toUpperCase() || 'SF';
}

function getDefaultTargetDate(): string {
  const target = new Date();
  target.setMonth(target.getMonth() + 6);
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, '0');
  const day = String(target.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function SinkingFundsPanel() {
  const theme = useTheme();
  const { showSuccess } = useFeedback();
  const editModalScrollRef = useRef<React.ComponentRef<typeof ScrollView> | null>(null);
  const stashModalScrollRef = useRef<React.ComponentRef<typeof ScrollView> | null>(null);
  const {
    data: sinkingFunds = [],
    isLoading,
    isError,
    refetch,
  } = useSinkingFunds();
  const { data: accounts = [] } = useAccounts();
  const upsertMutation = useUpsertSinkingFund();
  const contributeMutation = useContributeToSinkingFund();
  const deleteMutation = useDeleteSinkingFund();

  // Create / Edit Modal State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingFund, setEditingFund] = useState<SinkingFund | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Edit Form Fields
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(DEFAULT_FUND_COLOR);
  const [targetAmountInput, setTargetAmountInput] = useState('1000');
  const [targetDate, setTargetDate] = useState(() => getDefaultTargetDate());
  const [accountId, setAccountId] = useState('');
  const [notes, setNotes] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  // Quick Stash Modal State
  const [stashModalVisible, setStashModalVisible] = useState(false);
  const [stashingFund, setStashingFund] = useState<SinkingFund | null>(null);
  const [stashAmountInput, setStashAmountInput] = useState('');
  const [stashSourceAccountId, setStashSourceAccountId] = useState('');
  const [stashError, setStashError] = useState<string | null>(null);

  const isSubmitting =
    upsertMutation.isPending ||
    contributeMutation.isPending ||
    deleteMutation.isPending;

  const accountMap = useMemo(() => {
    const map = new Map<string, { name: string; balanceMinor: number }>();
    for (const a of accounts) {
      map.set(a.id, { name: a.name, balanceMinor: a.balanceMinor });
    }
    return map;
  }, [accounts]);

  const totals = useMemo(() => {
    let totalSaved = 0;
    let totalTarget = 0;
    for (const sf of sinkingFunds) {
      totalSaved += sf.currentSavedMinor;
      totalTarget += sf.targetAmountMinor;
    }
    return { totalSaved, totalTarget };
  }, [sinkingFunds]);

  const livePreview = useMemo(() => {
    const minor = parseDecimalToMinorUnits(targetAmountInput);
    if (
      minor === null ||
      minor <= 0 ||
      !/^\d{4}-\d{2}(-\d{2})?$/.test(targetDate.trim())
    ) {
      return null;
    }
    const currentSaved = editingFund?.currentSavedMinor ?? 0;
    try {
      return computeSinkingFundMonthlyTarget(
        minor,
        currentSaved,
        targetDate.trim(),
      );
    } catch {
      return null;
    }
  }, [targetAmountInput, targetDate, editingFund]);

  const handleOpenCreateModal = () => {
    setEditingFund(null);
    setConfirmingDelete(false);
    setName('');
    setColor(DEFAULT_FUND_COLOR);
    setTargetAmountInput('1000');
    setTargetDate(getDefaultTargetDate());
    setAccountId(accounts[0]?.id ?? '');
    setNotes('');
    setEditError(null);
    setEditModalVisible(true);
  };

  const handleOpenEditModal = (fund: SinkingFund) => {
    setEditingFund(fund);
    setConfirmingDelete(false);
    setName(fund.name);
    setColor(fund.color || DEFAULT_FUND_COLOR);
    setTargetAmountInput(minorUnitsToDecimalInput(fund.targetAmountMinor));
    setTargetDate(fund.targetDate);
    setAccountId(fund.accountId);
    setNotes(fund.notes ?? '');
    setEditError(null);
    setEditModalVisible(true);
  };

  const handleCloseEditModal = () => {
    if (!isSubmitting) {
      setEditModalVisible(false);
      setEditingFund(null);
      setConfirmingDelete(false);
      setEditError(null);
    }
  };

  const handleOpenStashModal = (fund: SinkingFund) => {
    setStashingFund(fund);
    setStashSourceAccountId(fund.accountId || accounts[0]?.id || '');
    const calc = computeSinkingFundMonthlyTarget(
      fund.targetAmountMinor,
      fund.currentSavedMinor,
      fund.targetDate,
    );
    if (calc.monthlyTargetMinor > 0) {
      setStashAmountInput(minorUnitsToDecimalInput(calc.monthlyTargetMinor));
    } else {
      setStashAmountInput('50');
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

  const showEditModalError = (message: string) => {
    setEditError(message);
    editModalScrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const showStashModalError = (message: string) => {
    setStashError(message);
    stashModalScrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handleSaveFund = async () => {
    if (!name.trim()) {
      showEditModalError('Please enter a fund name.');
      return;
    }

    const minor = parseDecimalToMinorUnits(targetAmountInput);
    if (minor === null || minor <= 0) {
      showEditModalError('Please enter a valid positive target amount.');
      return;
    }

    const trimmedDate = targetDate.trim();
    if (!/^\d{4}-\d{2}(-\d{2})?$/.test(trimmedDate)) {
      showEditModalError('Target date must be in YYYY-MM or YYYY-MM-DD format.');
      return;
    }

    if (!accountId) {
      showEditModalError('Please select a holding account.');
      return;
    }

    const monogram = getFundMonogram(name);
    const wasEditing = Boolean(editingFund);

    try {
      setEditError(null);
      const payload: Omit<SinkingFund, 'id'> & { id?: string } = {
        name: name.trim(),
        icon: monogram,
        color,
        targetAmountMinor: minor,
        currentSavedMinor: editingFund?.currentSavedMinor ?? 0,
        targetDate: trimmedDate,
        accountId,
        monthlyContributionMinor: livePreview?.monthlyTargetMinor ?? 0,
        isCompleted: editingFund
          ? editingFund.currentSavedMinor >= minor
          : false,
        notes: notes.trim() || undefined,
      };

      if (editingFund?.id) {
        payload.id = editingFund.id;
      }

      const saved = await upsertMutation.mutateAsync(payload);
      setEditModalVisible(false);
      setEditingFund(null);
      setConfirmingDelete(false);
      showSuccess(
        wasEditing
          ? `Updated sinking fund "${saved.name}".`
          : `Created sinking fund "${saved.name}".`,
      );
    } catch (error: unknown) {
      showEditModalError(
        getUserErrorMessage(error, 'Failed to save sinking fund.'),
      );
    }
  };

  const handleDeleteFund = async () => {
    if (!editingFund) return;
    const deletedName = editingFund.name;
    try {
      setEditError(null);
      await deleteMutation.mutateAsync(editingFund.id);
      setEditModalVisible(false);
      setEditingFund(null);
      setConfirmingDelete(false);
      showSuccess(`Deleted sinking fund "${deletedName}".`);
    } catch (error: unknown) {
      showEditModalError(
        getUserErrorMessage(error, 'Failed to delete fund.'),
      );
    }
  };

  const handleStashSubmit = async () => {
    if (!stashingFund) return;

    const minor = parseDecimalToMinorUnits(stashAmountInput);
    if (minor === null || minor <= 0) {
      showStashModalError('Please enter a valid positive amount.');
      return;
    }

    if (!stashSourceAccountId) {
      showStashModalError('Please select a source account.');
      return;
    }

    const fundName = stashingFund.name;
    try {
      setStashError(null);
      const result = await contributeMutation.mutateAsync({
        fundId: stashingFund.id,
        amountMinor: minor,
        sourceAccountId: stashSourceAccountId,
      });
      setStashModalVisible(false);
      setStashingFund(null);
      showSuccess(
        `Stashed ${formatMinorUnits(result.transaction.amountMinor, result.transaction.currency)} into "${fundName}".`,
      );
    } catch (error: unknown) {
      showStashModalError(
        getUserErrorMessage(error, 'Failed to contribute to sinking fund.'),
      );
    }
  };

  const stashingAccentColor = stashingFund?.color || DEFAULT_FUND_COLOR;

  return (
    <View className="rounded-2xl p-5 bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark gap-4">
      {/* 1. Header */}
      <View className="flex-row items-start justify-between flex-wrap gap-3">
        <View className="gap-0.5 flex-1 min-w-[160px]">
          <ThemedText className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark">
            Sinking Funds
          </ThemedText>
          <ThemedText className="text-xs leading-4 text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
            Savings vaults for irregular expenses
          </ThemedText>
        </View>

        <Pressable
          onPress={handleOpenCreateModal}
          accessibilityRole="button"
          accessibilityLabel="Create New Sinking Fund"
          className="min-h-[44px] bg-brand-500 dark:bg-brand-400 active:opacity-85 px-4 py-2 rounded-xl items-center justify-center shrink-0"
        >
          <ThemedText className="text-ledger-canvas dark:text-brand-900 text-xs font-bold">
            New Fund
          </ThemedText>
        </Pressable>
      </View>

      {/* 2. Summary Bar */}
      {sinkingFunds.length > 0 && (
        <View className="flex-row items-center justify-between bg-ledger-subtle dark:bg-ledger-subtle-dark p-3.5 rounded-xl border border-ledger-border dark:border-ledger-border-dark gap-3">
          <View className="flex-1">
            <ThemedText className="text-[11px] text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
              Total Saved Across Vaults
            </ThemedText>
            <ThemedText
              numeric
              className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark mt-0.5"
            >
              {formatMinorUnits(totals.totalSaved)}
            </ThemedText>
          </View>

          <View className="items-end">
            <ThemedText className="text-[11px] text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
              Combined Target
            </ThemedText>
            <ThemedText
              numeric
              className="text-sm font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mt-0.5"
            >
              {formatMinorUnits(totals.totalTarget)}
            </ThemedText>
          </View>
        </View>
      )}

      {/* 3. Loading / Error / Empty / Vault List */}
      {isLoading ? (
        <View className="py-10 items-center justify-center gap-2.5">
          <ActivityIndicator size="small" color={theme.primary} />
          <ThemedText className="text-xs text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
            Loading sinking funds...
          </ThemedText>
        </View>
      ) : isError ? (
        <View className="p-6 rounded-2xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark items-center gap-3">
          <ThemedText
            accessibilityRole="alert"
            className="text-sm font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark text-center"
          >
            Could not load your sinking funds right now.
          </ThemedText>
          <Pressable
            onPress={() => void refetch()}
            accessibilityRole="button"
            accessibilityLabel="Retry loading sinking funds"
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-ledger-terracotta dark:bg-ledger-terracotta-dark items-center justify-center active:opacity-85"
          >
            <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
              Retry
            </ThemedText>
          </Pressable>
        </View>
      ) : sinkingFunds.length === 0 ? (
        <View className="py-6 px-4 items-center justify-center gap-2.5 bg-ledger-subtle dark:bg-ledger-subtle-dark rounded-2xl border border-dashed border-ledger-border-strong dark:border-ledger-border-strong-dark">
          <ThemedText className="text-sm font-semibold text-ledger-ink dark:text-ledger-ink-dark">
            No sinking funds created
          </ThemedText>
          <ThemedText className="text-xs text-center text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary max-w-[260px]">
            Set aside money for car repairs, insurance, holiday gifts, and
            vacations ahead of time.
          </ThemedText>
          <Pressable
            onPress={handleOpenCreateModal}
            accessibilityRole="button"
            accessibilityLabel="Create Sinking Fund"
            className="mt-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-brand-500 dark:bg-brand-400 active:opacity-85 items-center justify-center"
          >
            <ThemedText className="text-ledger-canvas dark:text-brand-900 text-xs font-bold">
              Create Sinking Fund
            </ThemedText>
          </Pressable>
        </View>
      ) : (
        <View className="gap-3">
          {sinkingFunds.map((fund) => {
            const holdingAccount = accountMap.get(fund.accountId);
            const percent =
              fund.targetAmountMinor > 0
                ? Math.round(
                    (fund.currentSavedMinor * 100) / fund.targetAmountMinor,
                  )
                : 0;
            const clampedPercent = Math.min(100, Math.max(0, percent));
            const calc = computeSinkingFundMonthlyTarget(
              fund.targetAmountMinor,
              fund.currentSavedMinor,
              fund.targetDate,
            );
            const accentColor = fund.color || DEFAULT_FUND_COLOR;
            const monogram = getFundMonogram(fund.name);

            return (
              <View
                key={fund.id}
                className="p-3.5 rounded-2xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark gap-2.5"
              >
                {/* Row 1: Monogram, Name, Holding Account, Quick Stash */}
                <View className="flex-row items-center justify-between gap-2">
                  <Pressable
                    onPress={() => handleOpenEditModal(fund)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${fund.name}`}
                    className="min-h-[44px] flex-row items-center gap-2.5 flex-1 min-w-0 active:opacity-75"
                  >
                    <View
                      className="w-10 h-10 rounded-xl items-center justify-center shrink-0 border border-ledger-border dark:border-ledger-border-dark"
                      style={{ backgroundColor: `${accentColor}20` }}
                    >
                      <ThemedText className="text-xs font-extrabold tracking-wide text-ledger-ink dark:text-ledger-ink-dark">
                        {monogram}
                      </ThemedText>
                    </View>
                    <View className="flex-1 min-w-0">
                      <ThemedText
                        className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark"
                        numberOfLines={1}
                      >
                        {fund.name}
                      </ThemedText>
                      <ThemedText
                        className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mt-0.5"
                        numberOfLines={1}
                      >
                        {`Vault: ${holdingAccount ? holdingAccount.name : 'Main Account'}`}
                      </ThemedText>
                    </View>
                  </Pressable>

                  {/* Quick Stash Button */}
                  <Pressable
                    onPress={() => handleOpenStashModal(fund)}
                    accessibilityRole="button"
                    accessibilityLabel={`Stash funds into ${fund.name}`}
                    className="min-h-[44px] min-w-[44px] bg-ledger-pine dark:bg-ledger-pine-dark active:opacity-85 px-4 py-2 rounded-xl items-center justify-center shrink-0"
                  >
                    <ThemedText className="text-ledger-canvas dark:text-brand-900 text-xs font-bold">
                      Stash
                    </ThemedText>
                  </Pressable>
                </View>

                {/* Row 2: Saved vs Target & Percent */}
                <View className="flex-row items-baseline justify-between gap-2">
                  <ThemedText
                    numeric
                    className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary flex-1"
                  >
                    Saved:{' '}
                    <ThemedText
                      numeric
                      className="font-bold text-ledger-ink dark:text-ledger-ink-dark text-sm"
                    >
                      {formatMinorUnits(fund.currentSavedMinor)}
                    </ThemedText>{' '}
                    {`of ${formatMinorUnits(fund.targetAmountMinor)}`}
                  </ThemedText>
                  <ThemedText
                    numeric
                    className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark"
                  >
                    {`${percent}%`}
                  </ThemedText>
                </View>

                {/* Row 3: Progress Bar */}
                <View className="h-2 rounded-full bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark overflow-hidden">
                  <View
                    className="h-full rounded-full"
                    style={{
                      width: `${clampedPercent}%`,
                      backgroundColor: accentColor,
                    }}
                  />
                </View>

                {/* Row 4: Target Date Pill & Monthly Target Pill */}
                <View className="flex-row items-center justify-between flex-wrap gap-1.5 pt-0.5">
                  <View className="px-2.5 py-1 rounded-full bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark">
                    <ThemedText
                      numeric
                      className="text-[11px] font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                    >
                      {`Target: ${fund.targetDate}`}
                    </ThemedText>
                  </View>

                  {calc.isTargetReached ? (
                    <View className="px-2.5 py-1 rounded-full bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft">
                      <ThemedText className="text-[11px] font-semibold text-ledger-pine dark:text-ledger-pine-dark">
                        Goal Reached
                      </ThemedText>
                    </View>
                  ) : (
                    <View className="px-2.5 py-1 rounded-full bg-ledger-teal-soft dark:bg-ledger-teal-dark-soft">
                      <ThemedText
                        numeric
                        className="text-[11px] font-semibold text-ledger-teal dark:text-ledger-teal-dark"
                      >
                        {`${formatMinorUnits(calc.monthlyTargetMinor)}/mo needed (${
                          calc.remainingMonths
                        } mo)`}
                      </ThemedText>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* 4. Sinking Fund Create / Edit / 2-Step Delete Modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseEditModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1 justify-center items-center p-4 bg-black/55"
        >
          <Pressable
            className="absolute inset-0"
            accessibilityRole="button"
            accessibilityLabel="Dismiss sinking fund dialog"
            onPress={handleCloseEditModal}
          />

          <View
            accessibilityViewIsModal
            className="relative z-10 w-full max-w-[440px] max-h-[90%] rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark overflow-hidden"
          >
            <ScrollView
              ref={editModalScrollRef}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: 24, gap: 16 }}
            >
              {/* Header */}
              <View className="flex-row items-center justify-between gap-2">
                <View className="flex-1">
                  <ThemedText
                    accessibilityRole="header"
                    className="text-lg font-bold text-ledger-ink dark:text-ledger-ink-dark"
                  >
                    {editingFund ? 'Edit Sinking Fund' : 'New Sinking Fund'}
                  </ThemedText>
                  <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                    Targeted irregular savings vault
                  </ThemedText>
                </View>

                <Pressable
                  onPress={handleCloseEditModal}
                  disabled={isSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel="Close sinking fund modal"
                  className="min-w-[44px] min-h-[44px] px-3 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                >
                  <ThemedText className="text-xs font-bold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                    Close
                  </ThemedText>
                </Pressable>
              </View>

              {editError && (
                <View
                  accessibilityRole="alert"
                  accessibilityLiveRegion="assertive"
                  className="p-3 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark"
                >
                  <ThemedText className="text-xs text-ledger-terracotta dark:text-ledger-terracotta-dark font-semibold">
                    {editError}
                  </ThemedText>
                </View>
              )}

              {/* Fund Name */}
              <View className="gap-1.5">
                <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                  Fund Name
                </ThemedText>
                <TextInput
                  className="min-h-[44px] border border-ledger-border-strong dark:border-ledger-border-strong-dark bg-ledger-subtle dark:bg-ledger-subtle-dark rounded-xl px-4 py-2.5 text-sm font-semibold text-ledger-ink dark:text-ledger-ink-dark"
                  value={name}
                  onChangeText={(t) => {
                    setName(t);
                    if (editError) setEditError(null);
                  }}
                  accessibilityLabel="Sinking fund name"
                  placeholder="e.g. Car Insurance, Vacation, Laptop"
                  placeholderTextColor={theme.textMuted}
                  editable={!isSubmitting}
                />
              </View>

              {/* Accent Color Selection */}
              <View className="gap-1.5">
                <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                  Vault Accent Color
                </ThemedText>
                <View className="flex-row gap-2 flex-wrap py-0.5">
                  {FUND_COLORS.map((swatch) => {
                    const isSelected = color === swatch.value;
                    return (
                      <Pressable
                        key={swatch.value}
                        onPress={() => setColor(swatch.value)}
                        disabled={isSubmitting}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={`Select ${swatch.label} color`}
                        className={`min-w-[44px] min-h-[44px] rounded-full items-center justify-center border-2 ${
                          isSelected
                            ? 'border-ledger-ink dark:border-ledger-ink-dark'
                            : 'border-transparent'
                        }`}
                      >
                        <View
                          className="w-8 h-8 rounded-full items-center justify-center"
                          style={{ backgroundColor: swatch.value }}
                        >
                          {isSelected && (
                            <View className="w-2.5 h-2.5 rounded-full bg-ledger-canvas dark:bg-ledger-canvas-dark" />
                          )}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Target Amount */}
              <View className="gap-1.5">
                <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                  {`Target Goal Amount (${DEFAULT_CURRENCY_SYMBOL})`}
                </ThemedText>
                <View className="flex-row items-center border border-ledger-border-strong dark:border-ledger-border-strong-dark bg-ledger-subtle dark:bg-ledger-subtle-dark rounded-xl px-4 py-3">
                  <ThemedText className="text-2xl font-bold text-ledger-ink-muted dark:text-ledger-ink-dark-muted mr-2">
                    {DEFAULT_CURRENCY_SYMBOL}
                  </ThemedText>
                  <TextInput
                    className="flex-1 text-2xl font-bold text-ledger-ink dark:text-ledger-ink-dark p-0"
                    style={TABULAR_NUMS_STYLE}
                    value={targetAmountInput}
                    onChangeText={(t) => {
                      setTargetAmountInput(normalizeDecimalInput(t));
                      if (editError) setEditError(null);
                    }}
                    accessibilityLabel="Target goal amount"
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                    autoCorrect={false}
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="1000"
                    placeholderTextColor={theme.textMuted}
                    editable={!isSubmitting}
                  />
                </View>
              </View>

              {/* Target Date */}
              <View className="gap-1.5">
                <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                  Target Date (YYYY-MM-DD)
                </ThemedText>
                <TextInput
                  className="min-h-[44px] border border-ledger-border-strong dark:border-ledger-border-strong-dark bg-ledger-subtle dark:bg-ledger-subtle-dark rounded-xl px-4 py-2.5 text-sm font-semibold text-ledger-ink dark:text-ledger-ink-dark"
                  style={TABULAR_NUMS_STYLE}
                  value={targetDate}
                  onChangeText={(t) => {
                    setTargetDate(t);
                    if (editError) setEditError(null);
                  }}
                  accessibilityLabel="Target date in YYYY-MM-DD format"
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={theme.textMuted}
                  editable={!isSubmitting}
                />
              </View>

              {/* Holding Account */}
              <View className="gap-1.5">
                <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                  Holding Account (Vault)
                </ThemedText>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerClassName="gap-2 py-1"
                >
                  {accounts.map((a) => {
                    const isSelected = accountId === a.id;
                    return (
                      <Pressable
                        key={a.id}
                        onPress={() => setAccountId(a.id)}
                        disabled={isSubmitting}
                        accessibilityRole="button"
                        accessibilityLabel={`Hold funds in ${a.name}`}
                        accessibilityState={{ selected: isSelected }}
                        className={`min-h-[44px] px-3.5 py-2 rounded-xl items-center justify-center border ${
                          isSelected
                            ? 'bg-brand-500 dark:bg-brand-400 border-brand-500 dark:border-brand-400'
                            : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark'
                        }`}
                      >
                        <ThemedText
                          className={`text-xs font-semibold ${
                            isSelected
                              ? 'text-ledger-canvas dark:text-brand-900'
                              : 'text-ledger-ink dark:text-ledger-ink-dark'
                          }`}
                        >
                          {a.name}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Live Monthly Target Preview */}
              {livePreview && (
                <View className="p-3.5 rounded-2xl bg-ledger-teal-soft dark:bg-ledger-teal-dark-soft border border-ledger-border dark:border-ledger-border-dark gap-1">
                  <ThemedText className="text-xs font-bold text-ledger-teal dark:text-ledger-teal-dark">
                    Monthly Stash Target
                  </ThemedText>
                  <ThemedText
                    numeric
                    className="text-sm font-extrabold text-ledger-teal dark:text-ledger-teal-dark"
                  >
                    {`${formatMinorUnits(livePreview.monthlyTargetMinor)} / month`}
                  </ThemedText>
                  <ThemedText
                    numeric
                    className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                  >
                    {`Based on ${livePreview.remainingMonths} month${
                      livePreview.remainingMonths === 1 ? '' : 's'
                    } remaining to reach goal.`}
                  </ThemedText>
                </View>
              )}

              {/* Notes */}
              <View className="gap-1.5">
                <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                  Notes (Optional)
                </ThemedText>
                <TextInput
                  className="min-h-[44px] border border-ledger-border-strong dark:border-ledger-border-strong-dark bg-ledger-subtle dark:bg-ledger-subtle-dark rounded-xl p-3 text-sm text-ledger-ink dark:text-ledger-ink-dark"
                  value={notes}
                  onChangeText={setNotes}
                  accessibilityLabel="Sinking fund notes"
                  placeholder="e.g. Due every 6 months"
                  placeholderTextColor={theme.textMuted}
                  maxLength={280}
                  editable={!isSubmitting}
                />
              </View>

              {/* Actions */}
              <View className="gap-2.5 pt-2 border-t border-ledger-border dark:border-ledger-border-dark">
                <Pressable
                  onPress={() => void handleSaveFund()}
                  disabled={isSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel="Save Sinking Fund"
                  className={`min-h-[44px] bg-brand-500 dark:bg-brand-400 active:opacity-85 py-3 rounded-xl items-center justify-center ${
                    isSubmitting ? 'opacity-60' : ''
                  }`}
                >
                  {upsertMutation.isPending ? (
                    <ActivityIndicator size="small" color={theme.onPrimary} />
                  ) : (
                    <ThemedText className="text-ledger-canvas dark:text-brand-900 font-bold text-sm">
                      {editingFund
                        ? 'Update Sinking Fund'
                        : 'Create Sinking Fund'}
                    </ThemedText>
                  )}
                </Pressable>

                {editingFund && !confirmingDelete && (
                  <Pressable
                    onPress={() => setConfirmingDelete(true)}
                    disabled={isSubmitting}
                    accessibilityRole="button"
                    accessibilityLabel="Delete Sinking Fund"
                    className="min-h-[44px] py-2.5 rounded-xl items-center justify-center border border-ledger-border dark:border-ledger-border-dark bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft active:opacity-75"
                  >
                    <ThemedText className="text-ledger-terracotta dark:text-ledger-terracotta-dark font-bold text-xs">
                      Delete Sinking Fund
                    </ThemedText>
                  </Pressable>
                )}

                {editingFund && confirmingDelete && (
                  <View className="p-3.5 rounded-2xl border border-ledger-border dark:border-ledger-border-dark bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft gap-3">
                    <ThemedText className="text-xs text-ledger-terracotta dark:text-ledger-terracotta-dark font-semibold">
                      {`Delete "${editingFund.name}"? Accumulated savings stay in the holding account.`}
                    </ThemedText>
                    <View className="flex-row gap-2">
                      <Pressable
                        onPress={() => setConfirmingDelete(false)}
                        disabled={isSubmitting}
                        accessibilityRole="button"
                        accessibilityLabel="Cancel deleting sinking fund"
                        className="flex-1 min-h-[44px] py-2.5 rounded-xl border border-ledger-border dark:border-ledger-border-dark bg-ledger-surface dark:bg-ledger-surface-dark items-center justify-center active:opacity-75"
                      >
                        <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                          Cancel
                        </ThemedText>
                      </Pressable>
                      <Pressable
                        onPress={() => void handleDeleteFund()}
                        disabled={isSubmitting}
                        accessibilityRole="button"
                        accessibilityLabel="Confirm delete sinking fund"
                        className={`flex-1 min-h-[44px] py-2.5 rounded-xl bg-ledger-terracotta dark:bg-ledger-terracotta-dark items-center justify-center ${
                          deleteMutation.isPending ? 'opacity-60' : ''
                        }`}
                      >
                        {deleteMutation.isPending ? (
                          <ActivityIndicator
                            size="small"
                            color={theme.onPrimary}
                          />
                        ) : (
                          <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
                            Confirm Delete
                          </ThemedText>
                        )}
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            </ScrollView>
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
          className="flex-1 justify-center items-center p-4 bg-black/55"
        >
          <Pressable
            className="absolute inset-0"
            accessibilityRole="button"
            accessibilityLabel="Dismiss quick stash dialog"
            onPress={handleCloseStashModal}
          />

          <View
            accessibilityViewIsModal
            className="relative z-10 w-full max-w-[420px] max-h-[90%] rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark overflow-hidden"
          >
            <ScrollView
              ref={stashModalScrollRef}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: 24, gap: 16 }}
            >
              {/* Header */}
              <View className="flex-row items-center justify-between gap-2">
                <View className="flex-row items-center gap-2.5 flex-1 min-w-0">
                  <View
                    className="w-10 h-10 rounded-xl border border-ledger-border dark:border-ledger-border-dark items-center justify-center shrink-0"
                    style={{ backgroundColor: `${stashingAccentColor}20` }}
                  >
                    <ThemedText className="text-xs font-extrabold tracking-wide text-ledger-ink dark:text-ledger-ink-dark">
                      {getFundMonogram(stashingFund?.name ?? 'SF')}
                    </ThemedText>
                  </View>
                  <View className="flex-1 min-w-0">
                    <ThemedText
                      accessibilityRole="header"
                      className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark"
                      numberOfLines={1}
                    >
                      {`Stash into ${stashingFund?.name ?? 'Fund'}`}
                    </ThemedText>
                    <ThemedText
                      numeric
                      className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                    >
                      {`Saved: ${formatMinorUnits(
                        stashingFund?.currentSavedMinor ?? 0,
                      )} of ${formatMinorUnits(stashingFund?.targetAmountMinor ?? 0)}`}
                    </ThemedText>
                  </View>
                </View>

                <Pressable
                  onPress={handleCloseStashModal}
                  disabled={isSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel="Close stash modal"
                  className="min-w-[44px] min-h-[44px] px-3 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                >
                  <ThemedText className="text-xs font-bold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                    Close
                  </ThemedText>
                </Pressable>
              </View>

              {stashError && (
                <View
                  accessibilityRole="alert"
                  accessibilityLiveRegion="assertive"
                  className="p-3 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark"
                >
                  <ThemedText className="text-xs text-ledger-terracotta dark:text-ledger-terracotta-dark font-semibold">
                    {stashError}
                  </ThemedText>
                </View>
              )}

              {/* Source Account Selector */}
              <View className="gap-1.5">
                <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                  Source Account
                </ThemedText>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerClassName="gap-2 py-1"
                >
                  {accounts.map((a) => {
                    const isSelected = stashSourceAccountId === a.id;
                    return (
                      <Pressable
                        key={a.id}
                        onPress={() => setStashSourceAccountId(a.id)}
                        disabled={isSubmitting}
                        accessibilityRole="button"
                        accessibilityLabel={`Transfer from ${a.name}`}
                        accessibilityState={{ selected: isSelected }}
                        className={`min-h-[44px] px-3.5 py-2 rounded-xl justify-center border ${
                          isSelected
                            ? 'bg-brand-500 dark:bg-brand-400 border-brand-500 dark:border-brand-400'
                            : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark'
                        }`}
                      >
                        <ThemedText
                          className={`text-xs font-semibold ${
                            isSelected
                              ? 'text-ledger-canvas dark:text-brand-900'
                              : 'text-ledger-ink dark:text-ledger-ink-dark'
                          }`}
                        >
                          {a.name}
                        </ThemedText>
                        <ThemedText
                          numeric
                          className={`text-[11px] ${
                            isSelected
                              ? 'text-ledger-canvas/85 dark:text-brand-900/85'
                              : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
                          }`}
                        >
                          {formatMinorUnits(a.balanceMinor, a.currency)}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Amount Input */}
              <View className="gap-1.5">
                <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                  {`Stash Amount (${DEFAULT_CURRENCY_SYMBOL})`}
                </ThemedText>

                <View className="flex-row items-center border border-ledger-border-strong dark:border-ledger-border-strong-dark bg-ledger-subtle dark:bg-ledger-subtle-dark rounded-xl px-4 py-3">
                  <ThemedText className="text-2xl font-bold text-ledger-ink-muted dark:text-ledger-ink-dark-muted mr-2">
                    {DEFAULT_CURRENCY_SYMBOL}
                  </ThemedText>
                  <TextInput
                    className="flex-1 text-2xl font-bold text-ledger-ink dark:text-ledger-ink-dark p-0"
                    style={TABULAR_NUMS_STYLE}
                    value={stashAmountInput}
                    onChangeText={(t) => {
                      setStashAmountInput(normalizeDecimalInput(t));
                      if (stashError) setStashError(null);
                    }}
                    accessibilityLabel="Stash amount"
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                    autoCorrect={false}
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="50"
                    placeholderTextColor={theme.textMuted}
                    autoFocus
                    editable={!isSubmitting}
                  />
                </View>
              </View>

              {/* Actions */}
              <View className="gap-2 pt-2 border-t border-ledger-border dark:border-ledger-border-dark">
                <Pressable
                  onPress={() => void handleStashSubmit()}
                  disabled={isSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel="Confirm Stash"
                  className={`min-h-[44px] bg-ledger-pine dark:bg-ledger-pine-dark active:opacity-85 py-3 rounded-xl items-center justify-center ${
                    isSubmitting ? 'opacity-60' : ''
                  }`}
                >
                  {contributeMutation.isPending ? (
                    <ActivityIndicator size="small" color={theme.onPrimary} />
                  ) : (
                    <ThemedText className="text-ledger-canvas dark:text-brand-900 font-bold text-sm">
                      Stash Funds Now
                    </ThemedText>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
