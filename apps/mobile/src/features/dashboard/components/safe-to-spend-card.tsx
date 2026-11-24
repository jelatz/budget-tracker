import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  View,
} from 'react-native';
import {
  DEFAULT_CURRENCY,
  DEFAULT_CURRENCY_SYMBOL,
  formatMinorUnits,
  minorUnitsToDecimalInput,
  normalizeDecimalInput,
  parseDecimalToMinorUnits,
  type CommitmentFrequency,
  type RecurringCommitment,
} from '@repo/contracts';
import { AppIcon, type AppIconName } from '@/common/components/app-icon';
import { ThemedText } from '@/common/components/themed-text';
import { TABULAR_NUMS_STYLE } from '@/common/constants/theme';
import { useTheme } from '@/common/hooks/use-theme';
import {
  useAccounts,
  useAllCategories,
  useDeleteRecurringCommitment,
  usePayRecurringCommitment,
  useRecurringCommitments,
  useSafeToSpendMetrics,
  useUnpayRecurringCommitment,
  useUpsertRecurringCommitment,
} from '@/features/transactions/hooks/use-transactions';

const FREQUENCY_OPTIONS: { label: string; value: CommitmentFrequency }[] = [
  { label: 'Monthly', value: 'MONTHLY' },
  { label: 'Weekly', value: 'WEEKLY' },
  { label: 'Bi-Weekly', value: 'BIWEEKLY' },
  { label: 'Quarterly', value: 'QUARTERLY' },
  { label: 'Yearly', value: 'YEARLY' },
];

const FREQUENCY_LABEL_MAP: Record<CommitmentFrequency, string> = {
  MONTHLY: 'Monthly',
  WEEKLY: 'Weekly',
  BIWEEKLY: 'Bi-Weekly',
  QUARTERLY: 'Quarterly',
  YEARLY: 'Yearly',
};

const QUICK_AMOUNT_PRESETS = [1500, 5000, 10000, 50000, 150000];
const QUICK_DAY_PRESETS = [1, 5, 10, 15, 20, 25, 30];

function formatOrdinalDay(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return `${day}th`;
  }
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

export function SafeToSpendCard() {
  const theme = useTheme();
  const { data: metrics, isLoading: isMetricsLoading } = useSafeToSpendMetrics();
  const { data: commitments = [], isLoading: isCommitmentsLoading } = useRecurringCommitments();
  const { data: accounts = [] } = useAccounts();
  const { categories } = useAllCategories();

  const upsertMutation = useUpsertRecurringCommitment();
  const deleteMutation = useDeleteRecurringCommitment();
  const payMutation = usePayRecurringCommitment();
  const unpayMutation = useUnpayRecurringCommitment();

  const [isBreakdownExpanded, setIsBreakdownExpanded] = useState(false);
  const [filterMode, setFilterMode] = useState<'ALL' | 'UNPAID' | 'PAID'>('ALL');
  const [actionError, setActionError] = useState<string | null>(null);
  const [togglingCommitmentId, setTogglingCommitmentId] = useState<string | null>(null);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCommitment, setEditingCommitment] = useState<RecurringCommitment | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Form Fields
  const [name, setName] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [dueDay, setDueDay] = useState(1);
  const [frequency, setFrequency] = useState<CommitmentFrequency>('MONTHLY');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [isAutoPaid, setIsAutoPaid] = useState(false);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const isModalBusy = upsertMutation.isPending || deleteMutation.isPending;

  // Current period computations
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthNum = now.getMonth() + 1;
  const currentPeriod = `${currentYear}-${String(currentMonthNum).padStart(2, '0')}`;
  const currentDay = now.getDate();
  const monthName = now.toLocaleDateString(undefined, { month: 'short' });

  const safeToSpendMinor = metrics?.safeToSpendMinor ?? 0;
  const dailyDiscretionaryMinor = metrics?.dailyDiscretionaryBudgetMinor ?? 0;
  const daysRemaining = metrics?.daysRemainingInMonth ?? 1;

  const isNegative = safeToSpendMinor < 0;
  const isTight = !isNegative && dailyDiscretionaryMinor < 1000;

  const heroTheme = useMemo<{
    badgeBg: string;
    badgeText: string;
    statusText: string;
    amountColor: string;
    icon: AppIconName;
    iconColor: string;
  }>(() => {
    if (isNegative) {
      return {
        badgeBg: 'bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft',
        badgeText: 'text-ledger-terracotta dark:text-ledger-terracotta-dark',
        statusText: 'Overcommitted',
        amountColor: 'text-ledger-terracotta dark:text-ledger-terracotta-dark',
        icon: 'error',
        iconColor: theme.negative,
      };
    }
    if (isTight) {
      return {
        badgeBg: 'bg-ledger-ochre-soft dark:bg-ledger-ochre-dark-soft',
        badgeText: 'text-ledger-ochre dark:text-ledger-ochre-dark',
        statusText: 'Tight Liquidity',
        amountColor: 'text-ledger-ochre dark:text-ledger-ochre-dark',
        icon: 'warning',
        iconColor: theme.warning,
      };
    }
    return {
      badgeBg: 'bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft',
      badgeText: 'text-ledger-pine dark:text-ledger-pine-dark',
      statusText: 'Safe & On Track',
      amountColor: 'text-ledger-pine dark:text-ledger-pine-dark',
      icon: 'shield',
      iconColor: theme.positive,
    };
  }, [isNegative, isTight, theme.negative, theme.warning, theme.positive]);

  const filteredCommitments = useMemo(() => {
    return commitments.filter((c) => {
      const isPaid = c.lastPaidPeriod === currentPeriod;
      if (filterMode === 'UNPAID') return !isPaid;
      if (filterMode === 'PAID') return isPaid;
      return true;
    });
  }, [commitments, currentPeriod, filterMode]);

  const unpaidCount = useMemo(() => {
    return commitments.filter((c) => c.isActive && c.lastPaidPeriod !== currentPeriod).length;
  }, [commitments, currentPeriod]);

  const handleOpenAddModal = () => {
    setEditingCommitment(null);
    setConfirmingDelete(false);
    setName('');
    setAmountInput('');
    setDueDay(15);
    setFrequency('MONTHLY');
    setAccountId(accounts[0]?.id ?? 'account-bank');
    setCategoryId(categories[0]?.id ?? 'cat-dues');
    setIsAutoPaid(false);
    setNotes('');
    setFormError(null);
    setModalVisible(true);
  };

  const handleOpenEditModal = (commitment: RecurringCommitment) => {
    setEditingCommitment(commitment);
    setConfirmingDelete(false);
    setName(commitment.name);
    setAmountInput(minorUnitsToDecimalInput(commitment.amountMinor));
    setDueDay(commitment.dueDay);
    setFrequency(commitment.frequency);
    setAccountId(commitment.accountId);
    setCategoryId(commitment.categoryId);
    setIsAutoPaid(commitment.isAutoPaid);
    setNotes(commitment.notes ?? '');
    setFormError(null);
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    if (!isModalBusy) {
      setModalVisible(false);
      setConfirmingDelete(false);
      setFormError(null);
    }
  };

  const handleSaveCommitment = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('Please enter a name for the recurring bill.');
      return;
    }

    const parsedMinor = parseDecimalToMinorUnits(amountInput);
    if (parsedMinor === null || parsedMinor <= 0) {
      setFormError(
        `Please enter a valid amount greater than ${formatMinorUnits(0, DEFAULT_CURRENCY)}.`,
      );
      return;
    }

    if (dueDay < 1 || dueDay > 31) {
      setFormError('Due day must be between 1 and 31.');
      return;
    }

    const selectedAccount = accounts.find((a) => a.id === accountId) ?? accounts[0];
    const currency = selectedAccount?.currency ?? DEFAULT_CURRENCY;

    try {
      setFormError(null);
      await upsertMutation.mutateAsync({
        ...(editingCommitment ? { id: editingCommitment.id } : {}),
        name: trimmedName,
        kind: editingCommitment?.kind ?? 'RECURRING',
        amountMinor: parsedMinor,
        currency,
        accountId: accountId || (accounts[0]?.id ?? 'account-bank'),
        categoryId: categoryId || (categories[0]?.id ?? 'cat-dues'),
        frequency,
        dueDay,
        dueLabel: editingCommitment?.dueLabel,
        nextDueDate: editingCommitment?.nextDueDate,
        previousNextDueDate: editingCommitment?.previousNextDueDate,
        isAutoPaid,
        isActive: editingCommitment ? editingCommitment.isActive : true,
        totalInstallments: editingCommitment?.totalInstallments,
        paidInstallments: editingCommitment?.paidInstallments ?? 0,
        lastPaidPeriod: editingCommitment?.lastPaidPeriod,
        lastPaidTransactionId: editingCommitment?.lastPaidTransactionId,
        notes: notes.trim() ? notes.trim() : undefined,
      });

      setConfirmingDelete(false);
      setModalVisible(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to save recurring bill.');
    }
  };

  const handleConfirmDeleteCommitment = async (id: string) => {
    try {
      setFormError(null);
      await deleteMutation.mutateAsync(id);
      setConfirmingDelete(false);
      setModalVisible(false);
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to delete recurring commitment.',
      );
    }
  };

  const handleTogglePaid = async (commitment: RecurringCommitment) => {
    const isPaid = commitment.lastPaidPeriod === currentPeriod;
    try {
      setActionError(null);
      setTogglingCommitmentId(commitment.id);
      if (isPaid) {
        await unpayMutation.mutateAsync(commitment.id);
      } else {
        await payMutation.mutateAsync({ commitmentId: commitment.id });
      }
    } catch (error: unknown) {
      setActionError(
        error instanceof Error ? error.message : 'Failed to update bill payment status.',
      );
    } finally {
      setTogglingCommitmentId(null);
    }
  };

  return (
    <View className="gap-4">
      {/* 1. HERO WIDGET */}
      <View className="p-5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark">
        {/* Header row with status badge */}
        <View className="flex-row items-center justify-between gap-2 mb-2.5 flex-wrap">
          <View className="flex-row items-center gap-2">
            <View className={`w-7 h-7 rounded-lg items-center justify-center ${heroTheme.badgeBg}`}>
              <AppIcon name={heroTheme.icon} size={15} color={heroTheme.iconColor} />
            </View>
            <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
              Safe to Spend
            </ThemedText>
          </View>

          <View
            className={`px-2.5 py-1 rounded-full border border-ledger-border dark:border-ledger-border-dark flex-row items-center gap-1.5 ${heroTheme.badgeBg}`}
          >
            <AppIcon name={heroTheme.icon} size={12} color={heroTheme.iconColor} />
            <ThemedText className={`text-xs font-semibold ${heroTheme.badgeText}`}>
              {heroTheme.statusText}
            </ThemedText>
          </View>
        </View>

        {/* Big Safe to Spend Amount */}
        {isMetricsLoading ? (
          <ActivityIndicator className="my-4" size="small" color={theme.primary} />
        ) : (
          <View className="my-1">
            <ThemedText
              numeric
              className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${heroTheme.amountColor}`}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {formatMinorUnits(safeToSpendMinor)}
            </ThemedText>
            <ThemedText
              numeric
              className="text-sm font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mt-1"
            >
              {`${formatMinorUnits(dailyDiscretionaryMinor)} / day for next ${daysRemaining} ${
                daysRemaining === 1 ? 'day' : 'days'
              }`}
            </ThemedText>
          </View>
        )}

        {/* Toggle Calculation Accordion Button */}
        <Pressable
          onPress={() => setIsBreakdownExpanded(!isBreakdownExpanded)}
          accessibilityRole="button"
          accessibilityState={{ expanded: isBreakdownExpanded }}
          accessibilityLabel="Toggle liquidity calculation breakdown"
          className="min-h-[44px] mt-3 pt-3 border-t border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-between active:opacity-75"
        >
          <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
            How is this calculated?
          </ThemedText>
          <View className="flex-row items-center gap-1">
            <ThemedText className="text-xs font-semibold text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
              {isBreakdownExpanded ? 'Collapse' : 'Details'}
            </ThemedText>
            <AppIcon
              name={isBreakdownExpanded ? 'chevronUp' : 'chevronDown'}
              size={15}
              color={theme.textMuted}
            />
          </View>
        </Pressable>

        {/* Expandable Breakdown Accordion */}
        {isBreakdownExpanded && metrics && (
          <View className="mt-2 gap-2.5 bg-ledger-subtle dark:bg-ledger-subtle-dark p-3.5 rounded-2xl border border-ledger-border dark:border-ledger-border-dark">
            {/* (+) Liquid Cash */}
            <View className="flex-row items-center justify-between gap-2">
              <View className="flex-1">
                <ThemedText className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                  (+) Liquid Cash Balance
                </ThemedText>
                <ThemedText className="text-[11px] text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                  Bank, e-wallet & cash accounts
                </ThemedText>
              </View>
              <ThemedText
                numeric
                className="text-xs font-bold text-ledger-pine dark:text-ledger-pine-dark"
              >
                {`+${formatMinorUnits(metrics.totalLiquidBalanceMinor)}`}
              </ThemedText>
            </View>

            {/* (-) Sinking Fund Reserves */}
            <View className="flex-row items-center justify-between gap-2">
              <View className="flex-1">
                <ThemedText className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                  (-) Sinking Fund Reserves
                </ThemedText>
                <ThemedText className="text-[11px] text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                  Protected earmarked savings goals
                </ThemedText>
              </View>
              <ThemedText
                numeric
                className="text-xs font-bold text-ledger-ochre dark:text-ledger-ochre-dark"
              >
                {`-${formatMinorUnits(metrics.isolatedSinkingFundsMinor)}`}
              </ThemedText>
            </View>

            {/* (-) Upcoming Fixed Bills */}
            <View className="flex-row items-center justify-between gap-2">
              <View className="flex-1">
                <ThemedText className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                  (-) Upcoming Fixed Bills
                </ThemedText>
                <ThemedText className="text-[11px] text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                  Unpaid recurring commitments due
                </ThemedText>
              </View>
              <ThemedText
                numeric
                className="text-xs font-bold text-ledger-terracotta dark:text-ledger-terracotta-dark"
              >
                {`-${formatMinorUnits(metrics.upcomingFixedBillsMinor)}`}
              </ThemedText>
            </View>

            {/* (-) Remaining Envelope Budgets */}
            <View className="flex-row items-center justify-between gap-2">
              <View className="flex-1">
                <ThemedText className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                  (-) Envelope Budgets Left
                </ThemedText>
                <ThemedText className="text-[11px] text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                  Remaining unspent category allowances
                </ThemedText>
              </View>
              <ThemedText
                numeric
                className="text-xs font-bold text-ledger-teal dark:text-ledger-teal-dark"
              >
                {`-${formatMinorUnits(metrics.remainingCategoryBudgetsMinor)}`}
              </ThemedText>
            </View>

            <View className="h-px bg-ledger-border dark:bg-ledger-border-dark my-0.5" />

            {/* (=) Safe to Spend Result */}
            <View className="flex-row items-center justify-between gap-2">
              <View className="flex-1">
                <ThemedText className="text-xs font-extrabold text-ledger-ink dark:text-ledger-ink-dark">
                  (=) Safe to Spend
                </ThemedText>
                <ThemedText className="text-[11px] text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                  Truly uncommitted discretionary cash
                </ThemedText>
              </View>
              <ThemedText numeric className={`text-sm font-extrabold ${heroTheme.amountColor}`}>
                {formatMinorUnits(metrics.safeToSpendMinor)}
              </ThemedText>
            </View>
          </View>
        )}
      </View>

      {/* 2. RECURRING OBLIGATIONS LIST */}
      <View className="p-5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark gap-3">
        {/* Header & Add Button */}
        <View className="flex-row items-start justify-between flex-wrap gap-3">
          <View className="flex-1 min-w-[140px] gap-0.5">
            <View className="flex-row items-center gap-2">
              <ThemedText className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark">
                Recurring Obligations
              </ThemedText>
              <View className="px-2 py-0.5 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark">
                <ThemedText
                  numeric
                  className="text-[11px] font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                >
                  {commitments.length}
                </ThemedText>
              </View>
            </View>
            <ThemedText
              numeric
              className="text-xs leading-4 text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
            >
              {unpaidCount === 0
                ? 'All bills settled for this month'
                : `${unpaidCount} unpaid bill${unpaidCount === 1 ? '' : 's'} · ${formatMinorUnits(
                    metrics?.upcomingFixedBillsMinor ?? 0,
                  )}`}
            </ThemedText>
          </View>

          <Pressable
            onPress={handleOpenAddModal}
            accessibilityRole="button"
            accessibilityLabel="Add new recurring bill"
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-brand-500 dark:bg-brand-400 active:opacity-85 flex-row items-center gap-1.5 shrink-0"
          >
            <AppIcon name="add" size={15} color={theme.onPrimary} />
            <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
              Add Bill
            </ThemedText>
          </Pressable>
        </View>

        {/* Inline Action Error Banner */}
        {actionError && (
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            className="p-3 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-between gap-2"
          >
            <View className="flex-row items-center gap-2 flex-1">
              <AppIcon name="error" size={15} color={theme.negative} />
              <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark flex-1">
                {actionError}
              </ThemedText>
            </View>
            <Pressable
              onPress={() => setActionError(null)}
              accessibilityRole="button"
              accessibilityLabel="Dismiss bill error"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              className="p-1.5 rounded-lg active:opacity-75"
            >
              <AppIcon name="close" size={14} color={theme.negative} />
            </Pressable>
          </View>
        )}

        {/* Filter Pills (All / Unpaid / Paid) */}
        {commitments.length > 0 && (
          <View className="flex-row items-center gap-2 flex-wrap pt-0.5">
            <Pressable
              onPress={() => setFilterMode('ALL')}
              accessibilityRole="button"
              accessibilityState={{ selected: filterMode === 'ALL' }}
              className={`min-h-[44px] px-3.5 py-2 rounded-full border items-center justify-center ${
                filterMode === 'ALL'
                  ? 'bg-brand-500 dark:bg-brand-400 border-brand-500 dark:border-brand-400'
                  : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark'
              }`}
            >
              <ThemedText
                numeric
                className={`text-xs font-semibold ${
                  filterMode === 'ALL'
                    ? 'text-ledger-canvas dark:text-ledger-canvas-dark'
                    : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
                }`}
              >
                {`All (${commitments.length})`}
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => setFilterMode('UNPAID')}
              accessibilityRole="button"
              accessibilityState={{ selected: filterMode === 'UNPAID' }}
              className={`min-h-[44px] px-3.5 py-2 rounded-full border items-center justify-center ${
                filterMode === 'UNPAID'
                  ? 'bg-ledger-ochre dark:bg-ledger-ochre-dark border-ledger-ochre dark:border-ledger-ochre-dark'
                  : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark'
              }`}
            >
              <ThemedText
                numeric
                className={`text-xs font-semibold ${
                  filterMode === 'UNPAID'
                    ? 'text-ledger-canvas dark:text-ledger-canvas-dark'
                    : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
                }`}
              >
                {`Unpaid (${unpaidCount})`}
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => setFilterMode('PAID')}
              accessibilityRole="button"
              accessibilityState={{ selected: filterMode === 'PAID' }}
              className={`min-h-[44px] px-3.5 py-2 rounded-full border items-center justify-center ${
                filterMode === 'PAID'
                  ? 'bg-ledger-pine dark:bg-ledger-pine-dark border-ledger-pine dark:border-ledger-pine-dark'
                  : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark'
              }`}
            >
              <ThemedText
                numeric
                className={`text-xs font-semibold ${
                  filterMode === 'PAID'
                    ? 'text-ledger-canvas dark:text-ledger-canvas-dark'
                    : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
                }`}
              >
                {`Paid (${commitments.length - unpaidCount})`}
              </ThemedText>
            </Pressable>
          </View>
        )}

        {/* Commitment List */}
        {isCommitmentsLoading ? (
          <ActivityIndicator className="my-4" size="small" color={theme.primary} />
        ) : filteredCommitments.length === 0 ? (
          <View className="py-6 px-4 items-center justify-center bg-ledger-subtle dark:bg-ledger-subtle-dark rounded-2xl border border-dashed border-ledger-border-strong dark:border-ledger-border-strong-dark gap-2">
            <View className="w-11 h-11 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center">
              <AppIcon name="calendar" size={20} color={theme.textMuted} />
            </View>
            <ThemedText className="text-sm font-semibold text-ledger-ink dark:text-ledger-ink-dark text-center">
              {commitments.length === 0
                ? 'No recurring obligations added yet'
                : 'No bills match this filter'}
            </ThemedText>
            <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary text-center max-w-[280px]">
              {commitments.length === 0
                ? 'Add subscriptions, rent, and utilities to reserve liquidity before spending.'
                : 'Switch filters or add a new recurring obligation.'}
            </ThemedText>
          </View>
        ) : (
          <View className="gap-2.5">
            {filteredCommitments.map((commitment) => {
              const isPaid = commitment.lastPaidPeriod === currentPeriod;
              const isOverdue = !isPaid && commitment.dueDay < currentDay;
              const isDueToday = !isPaid && commitment.dueDay === currentDay;
              const isRowToggling = togglingCommitmentId === commitment.id;

              const account = accounts.find((a) => a.id === commitment.accountId);
              const category = categories.find((c) => c.id === commitment.categoryId);
              const metaParts = [
                account ? `${account.icon} ${account.name}` : null,
                category ? `${category.icon} ${category.name}` : null,
                FREQUENCY_LABEL_MAP[commitment.frequency] ?? commitment.frequency,
              ].filter(Boolean);

              return (
                <View
                  key={commitment.id}
                  className="p-3.5 rounded-2xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark"
                >
                  <View className="flex-row items-center justify-between gap-3">
                    {/* Left: Due Status + Name + Inline Metadata */}
                    <View className="flex-1 min-w-0">
                      <View className="flex-row items-center gap-1.5 mb-1.5 flex-wrap">
                        {/* Status Pill (1 primary badge) */}
                        <View
                          className={`px-2 py-0.5 rounded-full flex-row items-center gap-1 ${
                            isPaid
                              ? 'bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft'
                              : isOverdue
                                ? 'bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft'
                                : isDueToday
                                  ? 'bg-ledger-ochre-soft dark:bg-ledger-ochre-dark-soft'
                                  : 'bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark'
                          }`}
                        >
                          {isPaid && (
                            <AppIcon name="checkCircle" size={11} color={theme.positive} />
                          )}
                          <ThemedText
                            numeric
                            className={`text-[11px] font-bold ${
                              isPaid
                                ? 'text-ledger-pine dark:text-ledger-pine-dark'
                                : isOverdue
                                  ? 'text-ledger-terracotta dark:text-ledger-terracotta-dark'
                                  : isDueToday
                                    ? 'text-ledger-ochre dark:text-ledger-ochre-dark'
                                    : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
                            }`}
                          >
                            {isPaid
                              ? `Paid (${monthName})`
                              : isDueToday
                                ? 'Due Today'
                                : isOverdue
                                  ? `Overdue (${monthName} ${commitment.dueDay})`
                                  : `Due ${monthName} ${commitment.dueDay}`}
                          </ThemedText>
                        </View>

                        {/* Optional Auto-pay Badge (max 2 badges total) */}
                        {commitment.isAutoPaid && (
                          <View className="px-2 py-0.5 rounded-full bg-ledger-teal-soft dark:bg-ledger-teal-dark-soft flex-row items-center gap-1">
                            <AppIcon name="autopay" size={11} color={theme.info} />
                            <ThemedText className="text-[11px] font-semibold text-ledger-teal dark:text-ledger-teal-dark">
                              Auto-pay
                            </ThemedText>
                          </View>
                        )}
                      </View>

                      <ThemedText
                        className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark"
                        numberOfLines={1}
                      >
                        {commitment.name}
                      </ThemedText>

                      {metaParts.length > 0 && (
                        <ThemedText
                          className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mt-0.5"
                          numberOfLines={1}
                        >
                          {metaParts.join(' · ')}
                        </ThemedText>
                      )}
                    </View>

                    {/* Right: Amount & Actions */}
                    <View className="items-end gap-2 shrink-0">
                      <ThemedText
                        numeric
                        className="text-base font-extrabold text-ledger-ink dark:text-ledger-ink-dark"
                      >
                        {formatMinorUnits(commitment.amountMinor, commitment.currency)}
                      </ThemedText>

                      <View className="flex-row items-center gap-1.5">
                        <Pressable
                          onPress={() => void handleTogglePaid(commitment)}
                          disabled={togglingCommitmentId !== null}
                          accessibilityRole="button"
                          accessibilityLabel={
                            isPaid
                              ? `Mark ${commitment.name} as unpaid`
                              : `Mark ${commitment.name} as paid`
                          }
                          className={`min-h-[44px] px-3 py-2 rounded-xl flex-row items-center justify-center gap-1 active:opacity-85 ${
                            isPaid
                              ? 'bg-ledger-pine dark:bg-ledger-pine-dark'
                              : 'bg-brand-500 dark:bg-brand-400'
                          } ${togglingCommitmentId !== null && !isRowToggling ? 'opacity-60' : ''}`}
                        >
                          {isRowToggling ? (
                            <ActivityIndicator size="small" color={theme.onPrimary} />
                          ) : (
                            <>
                              {isPaid && (
                                <AppIcon name="check" size={13} color={theme.onPrimary} />
                              )}
                              <ThemedText className="text-xs font-semibold text-ledger-canvas dark:text-ledger-canvas-dark">
                                {isPaid ? 'Paid' : 'Mark Paid'}
                              </ThemedText>
                            </>
                          )}
                        </Pressable>

                        <Pressable
                          onPress={() => handleOpenEditModal(commitment)}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${commitment.name}`}
                          className="w-11 h-11 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                        >
                          <AppIcon name="edit" size={16} color={theme.textSecondary} />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* 3. ADD / EDIT BILL MODAL */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={handleCloseModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1 justify-end bg-black/55"
        >
          <Pressable
            onPress={handleCloseModal}
            accessibilityRole="button"
            accessibilityLabel="Close dialog backdrop"
            className="absolute inset-0"
          />
          <View
            accessibilityViewIsModal
            className="relative z-10 w-full max-w-[520px] self-center bg-ledger-surface dark:bg-ledger-surface-dark border-t sm:border border-ledger-border dark:border-ledger-border-dark rounded-t-2xl sm:rounded-t-2xl max-h-[90%] p-5 gap-4"
          >
            {/* Modal Header */}
            <View className="flex-row items-center justify-between border-b border-ledger-border dark:border-ledger-border-dark pb-3">
              <ThemedText
                accessibilityRole="header"
                className="text-lg font-bold text-ledger-ink dark:text-ledger-ink-dark"
              >
                {editingCommitment ? 'Edit Recurring Bill' : 'New Recurring Bill'}
              </ThemedText>
              <Pressable
                onPress={handleCloseModal}
                disabled={isModalBusy}
                accessibilityRole="button"
                accessibilityLabel="Close recurring bill modal"
                className="w-11 h-11 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
              >
                <AppIcon name="close" size={18} color={theme.textSecondary} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View className="gap-4 pb-6">
                {formError && (
                  <View
                    accessibilityRole="alert"
                    accessibilityLiveRegion="assertive"
                    className="p-3 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark flex-row items-center gap-2"
                  >
                    <AppIcon name="error" size={15} color={theme.negative} />
                    <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark flex-1">
                      {formError}
                    </ThemedText>
                  </View>
                )}

                {/* Bill Name */}
                <View className="gap-1.5">
                  <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                    Bill Name
                  </ThemedText>
                  <TextInput
                    value={name}
                    onChangeText={(text) => {
                      setName(text);
                      if (formError) setFormError(null);
                    }}
                    accessibilityLabel="Bill name"
                    placeholder="e.g. Rent, Fiber Internet, Electric Bill"
                    placeholderTextColor={theme.textMuted}
                    editable={!isModalBusy}
                    className="min-h-[44px] px-3.5 py-2.5 rounded-xl border border-ledger-border-strong dark:border-ledger-border-strong-dark bg-ledger-subtle dark:bg-ledger-subtle-dark text-ledger-ink dark:text-ledger-ink-dark text-sm"
                  />
                </View>

                {/* Amount & Presets */}
                <View className="gap-1.5">
                  <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                    {`Amount (${DEFAULT_CURRENCY_SYMBOL} ${DEFAULT_CURRENCY})`}
                  </ThemedText>
                  <TextInput
                    value={amountInput}
                    onChangeText={(text) => {
                      setAmountInput(normalizeDecimalInput(text));
                      if (formError) setFormError(null);
                    }}
                    style={TABULAR_NUMS_STYLE}
                    placeholder="0.00"
                    placeholderTextColor={theme.textMuted}
                    accessibilityLabel="Bill amount"
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                    autoCorrect={false}
                    spellCheck={false}
                    autoComplete="off"
                    editable={!isModalBusy}
                    className="min-h-[44px] px-3.5 py-2.5 rounded-xl border border-ledger-border-strong dark:border-ledger-border-strong-dark bg-ledger-subtle dark:bg-ledger-subtle-dark text-ledger-ink dark:text-ledger-ink-dark text-base font-bold"
                  />
                  <View className="flex-row items-center gap-2 flex-wrap pt-1">
                    {QUICK_AMOUNT_PRESETS.map((cents) => (
                      <Pressable
                        key={cents}
                        onPress={() => {
                          setAmountInput(minorUnitsToDecimalInput(cents));
                          if (formError) setFormError(null);
                        }}
                        disabled={isModalBusy}
                        accessibilityRole="button"
                        accessibilityLabel={`Set bill amount to ${formatMinorUnits(cents)}`}
                        className="min-h-[44px] px-3 py-2 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:bg-ledger-selected dark:active:bg-ledger-selected-dark"
                      >
                        <ThemedText
                          numeric
                          className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark"
                        >
                          {formatMinorUnits(cents)}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* Due Day Selection */}
                <View className="gap-1.5">
                  <View className="flex-row items-center justify-between">
                    <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                      Day of Month Due (1 - 31)
                    </ThemedText>
                    <ThemedText
                      numeric
                      className="text-xs font-bold text-brand-500 dark:text-brand-400"
                    >
                      {`${formatOrdinalDay(dueDay)} of month`}
                    </ThemedText>
                  </View>
                  <View className="flex-row items-center gap-1.5 flex-wrap">
                    {QUICK_DAY_PRESETS.map((day) => {
                      const isSelected = dueDay === day;
                      return (
                        <Pressable
                          key={day}
                          onPress={() => setDueDay(day)}
                          disabled={isModalBusy}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isSelected }}
                          accessibilityLabel={`Due on the ${formatOrdinalDay(day)}`}
                          className={`min-h-[44px] px-3 py-2 rounded-xl border items-center justify-center ${
                            isSelected
                              ? 'bg-brand-500 dark:bg-brand-400 border-brand-500 dark:border-brand-400'
                              : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark'
                          }`}
                        >
                          <ThemedText
                            numeric
                            className={`text-xs font-bold ${
                              isSelected
                                ? 'text-ledger-canvas dark:text-ledger-canvas-dark'
                                : 'text-ledger-ink dark:text-ledger-ink-dark'
                            }`}
                          >
                            {formatOrdinalDay(day)}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Frequency */}
                <View className="gap-1.5">
                  <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                    Billing Frequency
                  </ThemedText>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerClassName="gap-2 py-0.5"
                  >
                    {FREQUENCY_OPTIONS.map((opt) => {
                      const isSelected = frequency === opt.value;
                      return (
                        <Pressable
                          key={opt.value}
                          onPress={() => setFrequency(opt.value)}
                          disabled={isModalBusy}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isSelected }}
                          accessibilityLabel={`Billing frequency ${opt.label}`}
                          className={`min-h-[44px] px-3.5 py-2 rounded-xl border items-center justify-center ${
                            isSelected
                              ? 'bg-brand-500 dark:bg-brand-400 border-brand-500 dark:border-brand-400'
                              : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark'
                          }`}
                        >
                          <ThemedText
                            className={`text-xs font-semibold ${
                              isSelected
                                ? 'text-ledger-canvas dark:text-ledger-canvas-dark'
                                : 'text-ledger-ink dark:text-ledger-ink-dark'
                            }`}
                          >
                            {opt.label}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Funding Account Selector */}
                <View className="gap-1.5">
                  <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                    Pay From Account
                  </ThemedText>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerClassName="gap-2 py-0.5"
                  >
                    {accounts.map((a) => {
                      const isSelected = accountId === a.id;
                      return (
                        <Pressable
                          key={a.id}
                          onPress={() => setAccountId(a.id)}
                          disabled={isModalBusy}
                          accessibilityRole="button"
                          accessibilityLabel={`Pay from account ${a.name}`}
                          accessibilityState={{ selected: isSelected }}
                          className={`min-h-[44px] px-3 py-2 rounded-xl border flex-row items-center gap-1.5 ${
                            isSelected
                              ? 'bg-brand-500 dark:bg-brand-400 border-brand-500 dark:border-brand-400'
                              : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark'
                          }`}
                        >
                          <ThemedText className="text-sm">{a.icon}</ThemedText>
                          <ThemedText
                            className={`text-xs font-semibold ${
                              isSelected
                                ? 'text-ledger-canvas dark:text-ledger-canvas-dark'
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

                {/* Expense Category Selector */}
                <View className="gap-1.5">
                  <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                    Category
                  </ThemedText>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerClassName="gap-2 py-0.5"
                  >
                    {categories.map((c) => {
                      const isSelected = categoryId === c.id;
                      return (
                        <Pressable
                          key={c.id}
                          onPress={() => setCategoryId(c.id)}
                          disabled={isModalBusy}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isSelected }}
                          accessibilityLabel={`Select category ${c.name}`}
                          className={`min-h-[44px] px-3 py-2 rounded-xl border flex-row items-center gap-1.5 ${
                            isSelected
                              ? 'bg-brand-500 dark:bg-brand-400 border-brand-500 dark:border-brand-400'
                              : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark'
                          }`}
                        >
                          <ThemedText className="text-sm">{c.icon}</ThemedText>
                          <ThemedText
                            className={`text-xs font-semibold ${
                              isSelected
                                ? 'text-ledger-canvas dark:text-ledger-canvas-dark'
                                : 'text-ledger-ink dark:text-ledger-ink-dark'
                            }`}
                          >
                            {c.name}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Auto-pay switch */}
                <View className="flex-row items-center justify-between p-3.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark">
                  <View className="flex-1 mr-3">
                    <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                      Auto-Pay Enabled
                    </ThemedText>
                    <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mt-0.5">
                      This bill is automatically debited by the provider.
                    </ThemedText>
                  </View>
                  <Switch
                    value={isAutoPaid}
                    onValueChange={setIsAutoPaid}
                    disabled={isModalBusy}
                    accessibilityLabel="Auto-Pay Enabled"
                    trackColor={{ false: theme.borderStrong, true: theme.primary }}
                    thumbColor={Platform.OS === 'android' ? theme.surface : undefined}
                  />
                </View>

                {/* Notes */}
                <View className="gap-1.5">
                  <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                    Notes (Optional)
                  </ThemedText>
                  <TextInput
                    value={notes}
                    onChangeText={setNotes}
                    accessibilityLabel="Recurring bill notes"
                    placeholder="e.g. Account # 1234, renews every Nov"
                    placeholderTextColor={theme.textMuted}
                    editable={!isModalBusy}
                    className="min-h-[44px] px-3.5 py-2.5 rounded-xl border border-ledger-border-strong dark:border-ledger-border-strong-dark bg-ledger-subtle dark:bg-ledger-subtle-dark text-ledger-ink dark:text-ledger-ink-dark text-sm"
                  />
                </View>

                {/* Buttons: Save / 2-Step Inline Delete */}
                <View className="gap-2.5 pt-2">
                  <Pressable
                    onPress={handleSaveCommitment}
                    disabled={isModalBusy}
                    accessibilityRole="button"
                    accessibilityLabel={
                      editingCommitment ? 'Save changes to recurring bill' : 'Create recurring bill'
                    }
                    className={`w-full min-h-[44px] py-3 rounded-xl bg-brand-500 dark:bg-brand-400 active:opacity-85 items-center justify-center ${
                      isModalBusy ? 'opacity-60' : ''
                    }`}
                  >
                    {upsertMutation.isPending ? (
                      <ActivityIndicator size="small" color={theme.onPrimary} />
                    ) : (
                      <ThemedText className="text-ledger-canvas dark:text-ledger-canvas-dark font-bold text-sm">
                        {editingCommitment ? 'Save Changes' : 'Create Recurring Bill'}
                      </ThemedText>
                    )}
                  </Pressable>

                  {editingCommitment && !confirmingDelete && (
                    <Pressable
                      onPress={() => setConfirmingDelete(true)}
                      disabled={isModalBusy}
                      accessibilityRole="button"
                      accessibilityLabel="Delete Bill"
                      className="w-full min-h-[44px] py-2.5 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-center gap-1.5 active:opacity-75"
                    >
                      <AppIcon name="delete" size={15} color={theme.negative} />
                      <ThemedText className="text-ledger-terracotta dark:text-ledger-terracotta-dark font-bold text-xs">
                        Delete Bill
                      </ThemedText>
                    </Pressable>
                  )}

                  {editingCommitment && confirmingDelete && (
                    <View className="p-3.5 rounded-2xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark gap-3">
                      <View className="flex-row items-start gap-2">
                        <AppIcon name="warning" size={16} color={theme.negative} />
                        <ThemedText className="flex-1 text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                          {`Delete "${editingCommitment.name}"? This removes the recurring schedule.`}
                        </ThemedText>
                      </View>
                      <View className="flex-row gap-2">
                        <Pressable
                          onPress={() => setConfirmingDelete(false)}
                          disabled={isModalBusy}
                          accessibilityRole="button"
                          accessibilityLabel="Cancel deleting recurring bill"
                          className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                        >
                          <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                            Cancel
                          </ThemedText>
                        </Pressable>
                        <Pressable
                          onPress={() => void handleConfirmDeleteCommitment(editingCommitment.id)}
                          disabled={isModalBusy}
                          accessibilityRole="button"
                          accessibilityLabel="Confirm delete recurring bill"
                          className={`flex-1 min-h-[44px] py-2.5 rounded-xl bg-ledger-terracotta dark:bg-ledger-terracotta-dark items-center justify-center ${
                            deleteMutation.isPending ? 'opacity-60' : ''
                          }`}
                        >
                          {deleteMutation.isPending ? (
                            <ActivityIndicator size="small" color={theme.background} />
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
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
