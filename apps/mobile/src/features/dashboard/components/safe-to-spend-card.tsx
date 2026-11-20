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
  useWindowDimensions,
  View,
} from 'react-native';
import {
  formatMinorUnits,
  minorUnitsToDecimalInput,
  parseDecimalToMinorUnits,
  type CommitmentFrequency,
  type CommitmentType,
  type RecurringCommitment,
} from '@repo/contracts';
import { ThemedText } from '@/common/components/themed-text';
import { confirmAction } from '@/common/lib/confirm';
import {
  useAllCategories,
  useDeleteRecurringCommitment,
  useRecurringCommitments,
  useSafeToSpendMetrics,
  useSettleRecurringCommitment,
  useUnmarkRecurringCommitmentPaid,
  useUpsertRecurringCommitment,
  useWallets,
} from '@/features/transactions/hooks/use-transactions';

const FREQUENCY_OPTIONS: { label: string; value: CommitmentFrequency }[] = [
  { label: 'Monthly', value: 'MONTHLY' },
  { label: 'Weekly', value: 'WEEKLY' },
  { label: 'Bi-Weekly', value: 'BIWEEKLY' },
  { label: 'Quarterly', value: 'QUARTERLY' },
  { label: 'Yearly', value: 'YEARLY' },
];

const QUICK_AMOUNT_PRESETS = [50000, 150000, 300000, 1000000, 2000000]; // ₱500, ₱1,500, ₱3,000, ₱10,000, ₱20,000 in centavos
const QUICK_DAY_PRESETS = [1, 5, 10, 15, 20, 25, 30];

export function SafeToSpendCard() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 1024;

  const { data: metrics, isLoading: isMetricsLoading } = useSafeToSpendMetrics();
  const { data: commitments = [], isLoading: isCommitmentsLoading } = useRecurringCommitments();
  const { data: wallets = [] } = useWallets();
  const { categories } = useAllCategories();

  const upsertMutation = useUpsertRecurringCommitment();
  const deleteMutation = useDeleteRecurringCommitment();
  const settleMutation = useSettleRecurringCommitment();
  const unmarkMutation = useUnmarkRecurringCommitmentPaid();

  // Accordion toggle: defaults to expanded on desktop web
  const [isBreakdownExpanded, setIsBreakdownExpanded] = useState(() => Platform.OS === 'web');
  const [isBillsExpanded, setIsBillsExpanded] = useState(
    () => Platform.OS === 'web' && width >= 1024,
  );

  // Bill filter
  const [filterMode, setFilterMode] = useState<'ALL' | 'UNPAID' | 'PAID'>('ALL');

  // Add/Edit Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCommitment, setEditingCommitment] = useState<RecurringCommitment | null>(null);

  // Settle Confirmation Modal State
  const [settleTarget, setSettleTarget] = useState<RecurringCommitment | null>(null);
  const [settleError, setSettleError] = useState<string | null>(null);

  // Form Fields
  const [commitmentType, setCommitmentType] = useState<CommitmentType>('EXPENSE');
  const [name, setName] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [dueDay, setDueDay] = useState(1);
  const [frequency, setFrequency] = useState<CommitmentFrequency>('MONTHLY');
  const [walletId, setWalletId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [isAutoPaid, setIsAutoPaid] = useState(false);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Current period computations
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthNum = now.getMonth() + 1;
  const currentPeriod = `${currentYear}-${String(currentMonthNum).padStart(2, '0')}`;
  const currentDay = now.getDate();
  const monthName = now.toLocaleDateString(undefined, { month: 'short' });

  // Semantic styles for Hero Widget
  const safeToSpendMinor = metrics?.safeToSpendMinor ?? 0;
  const dailyDiscretionaryMinor = metrics?.dailyDiscretionaryBudgetMinor ?? 0;
  const daysRemaining = metrics?.daysRemainingInMonth ?? 1;

  const isNegative = safeToSpendMinor < 0;
  const isTight = !isNegative && dailyDiscretionaryMinor < 50000; // < ₱500.00/day
  const isPositive = !isNegative && !isTight;

  const heroTheme = useMemo(() => {
    if (isNegative) {
      return {
        cardBg: 'bg-rose-50/80 dark:bg-rose-950/25 border-rose-200 dark:border-rose-900/50',
        badgeBg: 'bg-rose-100 dark:bg-rose-900/50',
        badgeText: 'text-rose-700 dark:text-rose-300',
        statusText: 'Overcommitted',
        amountColor: 'text-rose-600 dark:text-rose-400',
      };
    }
    if (isTight) {
      return {
        cardBg: 'bg-amber-50/80 dark:bg-amber-950/25 border-amber-200 dark:border-amber-900/50',
        badgeBg: 'bg-amber-100 dark:bg-amber-900/50',
        badgeText: 'text-amber-700 dark:text-amber-300',
        statusText: 'Tight Liquidity',
        amountColor: 'text-amber-600 dark:text-amber-400',
      };
    }
    return {
      cardBg: 'bg-emerald-50/80 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-900/50',
      badgeBg: 'bg-emerald-100 dark:bg-emerald-900/50',
      badgeText: 'text-emerald-700 dark:text-emerald-300',
      statusText: 'Safe & On Track',
      amountColor: 'text-emerald-600 dark:text-emerald-400',
    };
  }, [isNegative, isTight]);

  // Filtered commitments
  const filteredCommitments = useMemo(() => {
    return commitments.filter((c) => {
      const isPaid = c.lastPaidPeriod === currentPeriod;
      if (filterMode === 'UNPAID') return !isPaid;
      if (filterMode === 'PAID') return isPaid;
      return true;
    });
  }, [commitments, currentPeriod, filterMode]);

  const unpaidCount = useMemo(() => {
    return commitments.filter(
      (c) =>
        c.isActive &&
        (c.type ?? 'EXPENSE') === 'EXPENSE' &&
        c.lastPaidPeriod !== currentPeriod,
    ).length;
  }, [commitments, currentPeriod]);

  const pendingFilterCount = useMemo(() => {
    return commitments.filter((c) => c.lastPaidPeriod !== currentPeriod).length;
  }, [commitments, currentPeriod]);

  const modalCategories = useMemo(() => {
    return categories.filter((c) => c.type === commitmentType);
  }, [categories, commitmentType]);

  // Modal Handlers
  const handleSelectCommitmentType = (nextType: CommitmentType) => {
    setCommitmentType(nextType);
    const matching = categories.filter((c) => c.type === nextType);
    if (!matching.some((c) => c.id === categoryId)) {
      const fallbackId =
        nextType === 'INCOME'
          ? (matching.find((c) => c.id === 'cat-salary')?.id ?? matching[0]?.id ?? 'cat-salary')
          : (matching.find((c) => c.id === 'cat-bills')?.id ?? matching[0]?.id ?? 'cat-bills');
      setCategoryId(fallbackId);
    }
  };

  const handleOpenAddModal = () => {
    setEditingCommitment(null);
    setCommitmentType('EXPENSE');
    setName('');
    setAmountInput('');
    setDueDay(15);
    setFrequency('MONTHLY');
    setWalletId(wallets[0]?.id ?? 'wallet-checking');
    const expenseCategories = categories.filter((c) => c.type === 'EXPENSE');
    setCategoryId(
      expenseCategories.find((c) => c.id === 'cat-bills')?.id ??
        expenseCategories[0]?.id ??
        'cat-bills',
    );
    setIsAutoPaid(false);
    setNotes('');
    setFormError(null);
    setModalVisible(true);
  };

  const handleOpenEditModal = (commitment: RecurringCommitment) => {
    setEditingCommitment(commitment);
    setCommitmentType(commitment.type ?? 'EXPENSE');
    setName(commitment.name);
    setAmountInput(minorUnitsToDecimalInput(commitment.amountMinor));
    setDueDay(commitment.dueDay);
    setFrequency(commitment.frequency);
    setWalletId(commitment.walletId);
    setCategoryId(commitment.categoryId);
    setIsAutoPaid(commitment.isAutoPaid);
    setNotes(commitment.notes ?? '');
    setFormError(null);
    setModalVisible(true);
  };

  const handleSaveCommitment = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('Please enter a name for the recurring entry.');
      return;
    }

    const parsedMinor = parseDecimalToMinorUnits(amountInput);
    if (parsedMinor === null || parsedMinor <= 0) {
      setFormError('Please enter a valid amount greater than ₱0.00.');
      return;
    }

    if (dueDay < 1 || dueDay > 31) {
      setFormError('Due day must be between 1 and 31.');
      return;
    }

    const selectedWallet = wallets.find((w) => w.id === walletId) ?? wallets[0];
    const currency = selectedWallet?.currency ?? 'PHP';

    try {
      await upsertMutation.mutateAsync({
        ...(editingCommitment ? { id: editingCommitment.id } : {}),
        name: trimmedName,
        type: commitmentType,
        amountMinor: parsedMinor,
        currency,
        walletId: walletId || (wallets[0]?.id ?? 'wallet-checking'),
        categoryId:
          categoryId ||
          modalCategories[0]?.id ||
          (commitmentType === 'INCOME' ? 'cat-salary' : 'cat-bills'),
        frequency,
        dueDay,
        isAutoPaid,
        isActive: editingCommitment ? editingCommitment.isActive : true,
        lastPaidPeriod: editingCommitment?.lastPaidPeriod,
        notes: notes.trim() ? notes.trim() : undefined,
      });

      setModalVisible(false);
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to save recurring obligation.',
      );
    }
  };

  const handleDeleteCommitment = async (id: string) => {
    const confirmed = await confirmAction({
      title: 'Delete Recurring Entry',
      message: 'Are you sure you want to delete this recurring item?',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(id);
      setModalVisible(false);
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to delete recurring commitment.',
      );
    }
  };

  const handlePressSettle = async (commitment: RecurringCommitment) => {
    const isPaid = commitment.lastPaidPeriod === currentPeriod;
    if (isPaid) {
      const confirmed = await confirmAction({
        title:
          commitment.type === 'INCOME'
            ? 'Unmark Received Income'
            : 'Unmark Paid Bill',
        message: `Mark "${commitment.name}" as pending for this month again? (Any previously logged transaction will stay in your ledger.)`,
        confirmLabel: 'Mark Pending',
      });
      if (!confirmed) {
        return;
      }
      await unmarkMutation.mutateAsync(commitment.id);
      return;
    }

    setSettleError(null);
    setSettleTarget(commitment);
  };

  const handleConfirmSettle = async (recordTransaction: boolean) => {
    if (!settleTarget) return;
    setSettleError(null);
    try {
      await settleMutation.mutateAsync({
        commitmentId: settleTarget.id,
        periodMonth: currentPeriod,
        recordTransaction,
      });
      setSettleTarget(null);
    } catch (err: unknown) {
      setSettleError(
        err instanceof Error ? err.message : 'Failed to update status.',
      );
    }
  };

  return (
    <View className="gap-4">
      {/* 1. HERO WIDGET */}
      <View
        className={`p-5 rounded-3xl border shadow-sm ${heroTheme.cardBg}`}
      >
        {/* Header row with badge */}
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center gap-2">
            <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Safe to Spend
            </ThemedText>
          </View>

          <View className={`px-2.5 py-1 rounded-full ${heroTheme.badgeBg}`}>
            <ThemedText className={`text-xs font-semibold ${heroTheme.badgeText}`}>
              {heroTheme.statusText}
            </ThemedText>
          </View>
        </View>

        {/* Big Safe to Spend Amount */}
        {isMetricsLoading ? (
          <ActivityIndicator className="my-3" size="small" />
        ) : (
          <View className="my-1">
            <ThemedText
              className={`text-4xl font-extrabold font-mono tracking-tight leading-tight ${heroTheme.amountColor}`}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {formatMinorUnits(safeToSpendMinor)}
            </ThemedText>
            <ThemedText className="text-sm font-medium text-slate-600 dark:text-slate-400 mt-1">
              <ThemedText className="text-sm font-mono font-bold text-slate-800 dark:text-slate-200">
                {formatMinorUnits(dailyDiscretionaryMinor)}
              </ThemedText>{' '}
              / day for next {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'}
            </ThemedText>
          </View>
        )}

        {/* Toggle Calculation Accordion Button */}
        <Pressable
          onPress={() => setIsBreakdownExpanded(!isBreakdownExpanded)}
          accessibilityRole="button"
          accessibilityLabel="Toggle liquidity calculation breakdown"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="min-h-[44px] mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/60 flex-row items-center justify-between active:opacity-75"
        >
          <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            How is this calculated?
          </ThemedText>
          <ThemedText className="text-xs font-bold text-slate-500">
            {isBreakdownExpanded ? 'Collapse ▲' : 'Details ▼'}
          </ThemedText>
        </Pressable>

        {/* Expandable Breakdown Accordion */}
        {isBreakdownExpanded && metrics && (
          <View className="mt-3 pt-2 gap-3 bg-white/70 dark:bg-[#131b2e]/80 p-4 rounded-2xl border border-slate-200/70 dark:border-slate-800/80">
            {isDesktop ? (
              <View className="gap-3">
                <View className="flex-row gap-3 items-stretch">
                  {/* (+) Liquid Cash */}
                  <View className="flex-1 p-3.5 rounded-xl bg-slate-50 dark:bg-[#171f33] border border-slate-200/60 dark:border-slate-800/60 justify-between">
                    <View>
                      <ThemedText className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-0.5">
                        (+) Liquid Cash
                      </ThemedText>
                      <ThemedText className="text-[11px] text-slate-500 mb-2" numberOfLines={1}>
                        Checking & cash balances
                      </ThemedText>
                    </View>
                    <ThemedText className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      +{formatMinorUnits(metrics.totalLiquidBalanceMinor)}
                    </ThemedText>
                  </View>

                  {/* (-) Sinking Fund Reserves */}
                  <View className="flex-1 p-3.5 rounded-xl bg-slate-50 dark:bg-[#171f33] border border-slate-200/60 dark:border-slate-800/60 justify-between">
                    <View>
                      <ThemedText className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-0.5">
                        (-) Sinking Funds
                      </ThemedText>
                      <ThemedText className="text-[11px] text-slate-500 mb-2" numberOfLines={1}>
                        Earmarked savings goals
                      </ThemedText>
                    </View>
                    <ThemedText className="text-sm font-bold font-mono text-amber-600 dark:text-amber-400">
                      -{formatMinorUnits(metrics.isolatedSinkingFundsMinor)}
                    </ThemedText>
                  </View>

                  {/* (-) Upcoming Fixed Bills */}
                  <View className="flex-1 p-3.5 rounded-xl bg-slate-50 dark:bg-[#171f33] border border-slate-200/60 dark:border-slate-800/60 justify-between">
                    <View>
                      <ThemedText className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-0.5">
                        (-) Fixed Bills
                      </ThemedText>
                      <ThemedText className="text-[11px] text-slate-500 mb-2" numberOfLines={2}>
                        {metrics.overdueFixedBillsMinor > 0
                          ? `Includes ${formatMinorUnits(metrics.overdueFixedBillsMinor)} overdue`
                          : 'Unpaid recurring bills'}
                      </ThemedText>
                    </View>
                    <ThemedText className="text-sm font-bold font-mono text-rose-600 dark:text-rose-400">
                      -{formatMinorUnits(metrics.upcomingFixedBillsMinor)}
                    </ThemedText>
                  </View>

                  {/* (-) Remaining Envelope Budgets */}
                  <View className="flex-1 p-3.5 rounded-xl bg-slate-50 dark:bg-[#171f33] border border-slate-200/60 dark:border-slate-800/60 justify-between">
                    <View>
                      <ThemedText className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-0.5">
                        (-) Envelopes Left
                      </ThemedText>
                      <ThemedText className="text-[11px] text-slate-500 mb-2" numberOfLines={1}>
                        Category allowances
                      </ThemedText>
                    </View>
                    <ThemedText className="text-sm font-bold font-mono text-purple-600 dark:text-purple-400">
                      -{formatMinorUnits(metrics.remainingCategoryBudgetsMinor)}
                    </ThemedText>
                  </View>
                </View>

                {/* (=) Safe to Spend Result Bar */}
                <View className="flex-row items-center justify-between pt-2.5 border-t border-slate-200/70 dark:border-slate-800/80 px-1">
                  <View>
                    <ThemedText className="text-xs font-extrabold text-slate-900 dark:text-white">
                      (=) Safe to Spend (Liquidity Result)
                    </ThemedText>
                    <ThemedText className="text-[11px] text-slate-500">
                      Truly uncommitted discretionary cash after reserving all goals & obligations
                    </ThemedText>
                  </View>
                  <ThemedText className={`text-base font-extrabold font-mono ${heroTheme.amountColor}`}>
                    {formatMinorUnits(metrics.safeToSpendMinor)}
                  </ThemedText>
                </View>

                {metrics.expectedRemainingIncomeMinor > 0 && (
                  <View className="flex-row items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-800/60 px-1">
                    <ThemedText className="text-[11px] text-slate-500 dark:text-slate-400 flex-1 mr-2">
                      Expected upcoming income (not counted in Safe-to-Spend until received)
                    </ThemedText>
                    <ThemedText className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      +{formatMinorUnits(metrics.expectedRemainingIncomeMinor)}
                    </ThemedText>
                  </View>
                )}
              </View>
            ) : (
              /* Mobile / Compact view */
              <View className="gap-2">
                {/* (+) Liquid Cash */}
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 mr-2">
                    <ThemedText className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      (+) Liquid Cash Balance
                    </ThemedText>
                    <ThemedText className="text-[11px] text-slate-500">
                      Checking, wallet & cash accounts
                    </ThemedText>
                  </View>
                  <ThemedText className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    +{formatMinorUnits(metrics.totalLiquidBalanceMinor)}
                  </ThemedText>
                </View>

                {/* (-) Sinking Fund Reserves */}
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 mr-2">
                    <ThemedText className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      (-) Sinking Fund Reserves
                    </ThemedText>
                    <ThemedText className="text-[11px] text-slate-500">
                      Protected earmarked savings goals
                    </ThemedText>
                  </View>
                  <ThemedText className="text-xs font-bold font-mono text-amber-600 dark:text-amber-400">
                    -{formatMinorUnits(metrics.isolatedSinkingFundsMinor)}
                  </ThemedText>
                </View>

                {/* (-) Upcoming Fixed Bills */}
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 mr-2">
                    <ThemedText className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      (-) Upcoming & Unpaid Bills
                    </ThemedText>
                    <ThemedText className="text-[11px] text-slate-500">
                      {metrics.overdueFixedBillsMinor > 0
                        ? `Includes ${formatMinorUnits(metrics.overdueFixedBillsMinor)} overdue`
                        : 'Unpaid recurring commitments due'}
                    </ThemedText>
                  </View>
                  <ThemedText className="text-xs font-bold font-mono text-rose-600 dark:text-rose-400">
                    -{formatMinorUnits(metrics.upcomingFixedBillsMinor)}
                  </ThemedText>
                </View>

                {/* (-) Remaining Envelope Budgets */}
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 mr-2">
                    <ThemedText className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      (-) Envelope Budgets Left
                    </ThemedText>
                    <ThemedText className="text-[11px] text-slate-500">
                      Remaining unspent category allowances
                    </ThemedText>
                  </View>
                  <ThemedText className="text-xs font-bold font-mono text-purple-600 dark:text-purple-400">
                    -{formatMinorUnits(metrics.remainingCategoryBudgetsMinor)}
                  </ThemedText>
                </View>

                {/* Divider */}
                <View className="h-px bg-slate-200 dark:bg-slate-700 my-0.5" />

                {/* (=) Safe to Spend Result */}
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 mr-2">
                    <ThemedText className="text-xs font-extrabold text-slate-900 dark:text-white">
                      (=) Safe to Spend
                    </ThemedText>
                    <ThemedText className="text-[11px] text-slate-500">
                      Truly uncommitted discretionary cash
                    </ThemedText>
                  </View>
                  <ThemedText
                    className={`text-sm font-extrabold font-mono ${heroTheme.amountColor}`}
                  >
                    {formatMinorUnits(metrics.safeToSpendMinor)}
                  </ThemedText>
                </View>

                {metrics.expectedRemainingIncomeMinor > 0 && (
                  <View className="flex-row items-center justify-between pt-1.5 border-t border-slate-200/60 dark:border-slate-800/60">
                    <ThemedText className="text-[11px] text-slate-500 flex-1 mr-2">
                      Expected income (not counted until received)
                    </ThemedText>
                    <ThemedText className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      +{formatMinorUnits(metrics.expectedRemainingIncomeMinor)}
                    </ThemedText>
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      </View>

      {/* 2. RECURRING OBLIGATIONS STRIP / LIST */}
      <View className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 shadow-sm gap-3.5">
        {/* Header & Add Button */}
        <View className="flex-row items-center justify-between">
          <View>
            <View className="flex-row items-center gap-1.5">
              <ThemedText className="text-base font-bold text-slate-900 dark:text-white">
                Recurring Obligations
              </ThemedText>
              <View className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">
                <ThemedText className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  {commitments.length}
                </ThemedText>
              </View>
            </View>
            <ThemedText className="text-xs text-slate-500">
              {unpaidCount === 0
                ? 'All bills settled for this month'
                : `${unpaidCount} unpaid bill${unpaidCount === 1 ? '' : 's'} (${formatMinorUnits(metrics?.upcomingFixedBillsMinor ?? 0)})`}
            </ThemedText>
          </View>

          <Pressable
            onPress={handleOpenAddModal}
            accessibilityRole="button"
            accessibilityLabel="Add new recurring bill or income"
            className="min-h-[44px] px-4 py-2 rounded-full bg-brand-500 active:bg-brand-600 shadow-sm items-center justify-center"
          >
            <ThemedText className="text-xs font-bold text-white">
              + Add
            </ThemedText>
          </Pressable>
        </View>

        {/* Mobile Collapsible Header Toggle */}
        {!isDesktop && (
          <Pressable
            onPress={() => setIsBillsExpanded(!isBillsExpanded)}
            accessibilityRole="button"
            accessibilityLabel={isBillsExpanded ? 'Hide recurring items' : 'Show recurring items'}
            accessibilityState={{ expanded: isBillsExpanded }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="min-h-[44px] py-2.5 px-3.5 rounded-2xl bg-slate-100/90 dark:bg-[#171f33] border border-slate-200/80 dark:border-slate-800/80 flex-row items-center justify-between active:opacity-75"
          >
            <View className="flex-row items-center gap-2 flex-1">
              <ThemedText className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Recurring Bills & Paydays
              </ThemedText>
              <View className="px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-700/80">
                <ThemedText className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">
                  {commitments.length} total • {pendingFilterCount} pending
                </ThemedText>
              </View>
            </View>
            <ThemedText className="text-xs font-bold text-brand-500">
              {isBillsExpanded ? 'Hide' : 'Show'}
            </ThemedText>
          </Pressable>
        )}

        {(isDesktop || isBillsExpanded) && (
          <>
            {/* Filter Pills (All / Pending / Settled) */}
            {commitments.length > 0 && (
              <View className="flex-row items-center gap-1.5 pt-1">
            <Pressable
              onPress={() => setFilterMode('ALL')}
              accessibilityRole="button"
              accessibilityLabel="Show all recurring items"
              className={`min-h-[44px] items-center justify-center px-3.5 py-1.5 rounded-full border ${
                filterMode === 'ALL'
                  ? 'bg-slate-900 dark:bg-white border-slate-900 dark:border-white'
                  : 'bg-slate-100 dark:bg-slate-800 border-transparent'
              }`}
            >
              <ThemedText
                className={`text-xs font-semibold ${
                  filterMode === 'ALL'
                    ? 'text-white dark:text-slate-900'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                All ({commitments.length})
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => setFilterMode('UNPAID')}
              accessibilityRole="button"
              accessibilityLabel="Show pending items"
              className={`min-h-[44px] items-center justify-center px-3.5 py-1.5 rounded-full border ${
                filterMode === 'UNPAID'
                  ? 'bg-amber-600 border-amber-600'
                  : 'bg-slate-100 dark:bg-slate-800 border-transparent'
              }`}
            >
              <ThemedText
                className={`text-xs font-semibold ${
                  filterMode === 'UNPAID'
                    ? 'text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Pending ({pendingFilterCount})
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => setFilterMode('PAID')}
              accessibilityRole="button"
              accessibilityLabel="Show settled items"
              className={`min-h-[44px] items-center justify-center px-3.5 py-1.5 rounded-full border ${
                filterMode === 'PAID'
                  ? 'bg-emerald-600 border-emerald-600'
                  : 'bg-slate-100 dark:bg-slate-800 border-transparent'
              }`}
            >
              <ThemedText
                className={`text-xs font-semibold ${
                  filterMode === 'PAID'
                    ? 'text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Settled ({commitments.length - pendingFilterCount})
              </ThemedText>
            </Pressable>
          </View>
        )}

        {/* Commitment List */}
        {isCommitmentsLoading ? (
          <ActivityIndicator className="my-4" size="small" />
        ) : filteredCommitments.length === 0 ? (
          <View className="py-6 items-center justify-center bg-slate-50 dark:bg-[#171f33]/60 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
            <ThemedText className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {commitments.length === 0
                ? 'No recurring obligations added yet'
                : 'No bills match this filter'}
            </ThemedText>
            <ThemedText className="text-xs text-slate-500 text-center px-4 mt-0.5">
              {commitments.length === 0
                ? 'Add subscriptions, rent, and utilities to reserve liquidity before spending.'
                : 'Switch filters or add a new recurring obligation.'}
            </ThemedText>
          </View>
        ) : (
          <View className={isDesktop ? 'flex-row flex-wrap gap-3' : 'gap-2.5'}>
            {filteredCommitments.map((commitment) => {
              const isPaid = commitment.lastPaidPeriod === currentPeriod;
              const isIncome = commitment.type === 'INCOME';
              const isOverdue = !isPaid && !isIncome && commitment.dueDay < currentDay;
              const isDueToday = !isPaid && commitment.dueDay === currentDay;

              const wallet = wallets.find((w) => w.id === commitment.walletId);
              const category = categories.find((c) => c.id === commitment.categoryId);

              return (
                <View
                  key={commitment.id}
                  className={`p-3.5 rounded-2xl border ${
                    isDesktop ? 'flex-1 min-w-[320px]' : ''
                  } ${
                    isPaid
                      ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-900/40'
                      : isOverdue
                        ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200/80 dark:border-rose-900/40'
                        : 'bg-slate-50 dark:bg-[#171f33] border-slate-200/80 dark:border-slate-800/80'
                  }`}
                >
                  <View className="flex-row items-center justify-between">
                    {/* Left: Due Badge + Name + Badges */}
                    <View className="flex-1 mr-3">
                      <View className="flex-row items-center gap-2 mb-1 flex-wrap">
                        {/* Type pill */}
                        <View
                          className={`px-1.5 py-0.5 rounded ${
                            isIncome
                              ? 'bg-emerald-100 dark:bg-emerald-900/50'
                              : 'bg-rose-100/80 dark:bg-rose-900/40'
                          }`}
                        >
                          <ThemedText
                            className={`text-[10px] font-bold ${
                              isIncome
                                ? 'text-emerald-700 dark:text-emerald-300'
                                : 'text-rose-700 dark:text-rose-300'
                            }`}
                          >
                            {isIncome ? 'INCOME' : 'BILL'}
                          </ThemedText>
                        </View>

                        {/* Due Badge */}
                        <View
                          className={`px-2 py-0.5 rounded-md ${
                            isPaid
                              ? 'bg-emerald-100 dark:bg-emerald-900/60'
                              : isOverdue
                                ? 'bg-rose-100 dark:bg-rose-900/60'
                                : isDueToday
                                  ? 'bg-amber-100 dark:bg-amber-900/60'
                                  : 'bg-slate-200/80 dark:bg-slate-700'
                          }`}
                        >
                          <ThemedText
                            className={`text-[11px] font-bold ${
                              isPaid
                                ? 'text-emerald-700 dark:text-emerald-300'
                                : isOverdue
                                  ? 'text-rose-700 dark:text-rose-300'
                                  : isDueToday
                                    ? 'text-amber-700 dark:text-amber-300'
                                    : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {isPaid
                              ? isIncome
                                ? `Received (${monthName})`
                                : `Paid (${monthName})`
                              : isDueToday
                                ? isIncome
                                  ? 'Expected Today'
                                  : 'Due Today!'
                                : isOverdue
                                  ? `Overdue (${monthName} ${commitment.dueDay})`
                                  : `${isIncome ? 'Expected' : 'Due'} ${monthName} ${commitment.dueDay}`}
                          </ThemedText>
                        </View>

                        {/* Frequency badge */}
                        <View className="px-1.5 py-0.5 rounded bg-slate-200/50 dark:bg-slate-700/50">
                          <ThemedText className="text-[10px] font-medium text-slate-600 dark:text-slate-400">
                            {commitment.frequency}
                          </ThemedText>
                        </View>

                        {commitment.isAutoPaid && (
                          <View className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40">
                            <ThemedText className="text-[10px] font-medium text-blue-700 dark:text-blue-300">
                              Auto
                            </ThemedText>
                          </View>
                        )}
                      </View>

                      {/* Name */}
                      <ThemedText className="text-sm font-bold text-slate-900 dark:text-white">
                        {commitment.name}
                      </ThemedText>

                      {/* Wallet and Category Subtext */}
                      <View className="flex-row items-center gap-2 mt-1">
                        {wallet && (
                          <ThemedText className="text-xs text-slate-500">
                            {wallet.icon} {wallet.name}
                          </ThemedText>
                        )}
                        {category && (
                          <ThemedText className="text-xs text-slate-500">
                            • {category.icon} {category.name}
                          </ThemedText>
                        )}
                      </View>
                    </View>

                    {/* Right: Amount & Actions */}
                    <View className="items-end gap-2">
                      <ThemedText
                        className={`text-base font-extrabold font-mono ${
                          isIncome
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {isIncome ? '+' : ''}
                        {formatMinorUnits(commitment.amountMinor, commitment.currency)}
                      </ThemedText>

                      <View className="flex-row items-center gap-1.5">
                        {/* Quick Mark Paid / Received Button */}
                        <Pressable
                          onPress={() => void handlePressSettle(commitment)}
                          accessibilityRole="button"
                          accessibilityLabel={
                            isPaid
                              ? isIncome
                                ? 'Mark income as pending'
                                : 'Mark bill as unpaid'
                              : isIncome
                                ? 'Mark income as received'
                                : 'Mark bill as paid'
                          }
                          className={`min-h-[44px] px-3.5 py-2 rounded-full items-center justify-center ${
                            isPaid
                              ? 'bg-emerald-600 active:bg-emerald-700'
                              : 'bg-brand-500 active:bg-brand-600'
                          }`}
                        >
                          <ThemedText className="text-xs font-semibold text-white">
                            {isPaid
                              ? isIncome
                                ? 'Received'
                                : 'Paid'
                              : isIncome
                                ? 'Mark Received'
                                : 'Mark Paid'}
                          </ThemedText>
                        </Pressable>

                        {/* Edit Button */}
                        <Pressable
                          onPress={() => handleOpenEditModal(commitment)}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${commitment.name}`}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          className="min-h-[44px] min-w-[44px] px-3 items-center justify-center rounded-full bg-slate-200/70 dark:bg-slate-700 active:opacity-75"
                        >
                          <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                            Edit
                          </ThemedText>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
          </>
        )}
      </View>

      {/* 3. ADD / EDIT BILL MODAL */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1 justify-end bg-black/50"
        >
          <View className="bg-white dark:bg-[#131b2e] rounded-t-3xl sm:rounded-3xl max-h-[90%] p-5 sm:p-6 gap-4 border border-slate-200 dark:border-slate-800">
            {/* Modal Header */}
            <View className="flex-row items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <ThemedText className="text-lg font-bold text-slate-900 dark:text-white">
                {editingCommitment
                  ? commitmentType === 'INCOME'
                    ? 'Edit Recurring Income'
                    : 'Edit Recurring Bill'
                  : commitmentType === 'INCOME'
                    ? 'New Recurring Income'
                    : 'New Recurring Bill'}
              </ThemedText>
              <Pressable
                onPress={() => setModalVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel editing recurring item"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                className="min-h-[44px] min-w-[44px] items-center justify-center active:opacity-75"
              >
                <ThemedText className="text-sm font-semibold text-slate-500">
                  Cancel
                </ThemedText>
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              className="gap-4"
            >
              {formError && (
                <View className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 mb-3">
                  <ThemedText className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                    {formError}
                  </ThemedText>
                </View>
              )}

              {/* Commitment Type Toggle */}
              <View className="flex-row items-center bg-slate-100 dark:bg-[#171f33] p-1 rounded-2xl border border-slate-200 dark:border-slate-700 mb-3">
                <Pressable
                  onPress={() => handleSelectCommitmentType('EXPENSE')}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: commitmentType === 'EXPENSE' }}
                  accessibilityLabel="Recurring Bill"
                  className={`flex-1 min-h-[44px] rounded-xl items-center justify-center ${
                    commitmentType === 'EXPENSE'
                      ? 'bg-white dark:bg-[#131b2e] shadow-sm'
                      : 'bg-transparent'
                  }`}
                >
                  <ThemedText
                    className={`text-xs ${
                      commitmentType === 'EXPENSE'
                        ? 'font-bold text-rose-600 dark:text-rose-400'
                        : 'font-semibold text-slate-500'
                    }`}
                  >
                    Recurring Bill
                  </ThemedText>
                </Pressable>

                <Pressable
                  onPress={() => handleSelectCommitmentType('INCOME')}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: commitmentType === 'INCOME' }}
                  accessibilityLabel="Recurring Income"
                  className={`flex-1 min-h-[44px] rounded-xl items-center justify-center ${
                    commitmentType === 'INCOME'
                      ? 'bg-white dark:bg-[#131b2e] shadow-sm'
                      : 'bg-transparent'
                  }`}
                >
                  <ThemedText
                    className={`text-xs ${
                      commitmentType === 'INCOME'
                        ? 'font-bold text-emerald-600 dark:text-emerald-400'
                        : 'font-semibold text-slate-500'
                    }`}
                  >
                    Recurring Income
                  </ThemedText>
                </Pressable>
              </View>

              {/* Name */}
              <View className="gap-1.5 mb-3">
                <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {commitmentType === 'INCOME' ? 'Income Source Name' : 'Bill Name'}
                </ThemedText>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder={
                    commitmentType === 'INCOME'
                      ? 'e.g. Monthly Salary, Freelance Retainer'
                      : 'e.g. Rent, Netflix, Electric Bill'
                  }
                  placeholderTextColor="#94a3b8"
                  className="px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#171f33] text-slate-900 dark:text-white text-sm"
                />
              </View>

              {/* Amount & Presets */}
              <View className="gap-1.5">
                <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Amount (₱ PHP)
                </ThemedText>
                <TextInput
                  value={amountInput}
                  onChangeText={setAmountInput}
                  placeholder="0.00"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  className="px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#171f33] text-slate-900 dark:text-white text-base font-bold font-mono"
                />
                <View className="flex-row items-center gap-2 flex-wrap pt-1">
                  {QUICK_AMOUNT_PRESETS.map((cents) => (
                    <Pressable
                      key={cents}
                      onPress={() => setAmountInput(minorUnitsToDecimalInput(cents))}
                      accessibilityRole="button"
                      accessibilityLabel={`Set amount to ${formatMinorUnits(cents)}`}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#171f33] border border-slate-200 dark:border-slate-700 items-center justify-center active:opacity-75"
                    >
                      <ThemedText className="text-xs font-semibold font-mono text-slate-700 dark:text-slate-300">
                        {formatMinorUnits(cents)}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Due Day Selection */}
              <View className="gap-1.5">
                <View className="flex-row items-center justify-between">
                  <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Day of Month Due (1 - 31)
                  </ThemedText>
                  <ThemedText className="text-xs font-extrabold text-brand-600 dark:text-brand-400">
                    Day {dueDay}
                  </ThemedText>
                </View>
                <View className="flex-row items-center gap-1.5 flex-wrap">
                  {QUICK_DAY_PRESETS.map((day) => (
                    <Pressable
                      key={day}
                      onPress={() => setDueDay(day)}
                      accessibilityRole="button"
                      accessibilityLabel={`Due day ${day}`}
                      className={`min-h-[40px] px-3.5 py-1.5 rounded-xl border items-center justify-center ${
                        dueDay === day
                          ? 'bg-brand-500 border-brand-500'
                          : 'bg-slate-100 dark:bg-[#171f33] border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <ThemedText
                        className={`text-xs font-bold ${
                          dueDay === day ? 'text-white' : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {day}th
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Frequency */}
              <View className="gap-1.5">
                <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Billing Frequency
                </ThemedText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-2">
                  {FREQUENCY_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.value}
                      onPress={() => setFrequency(opt.value)}
                      accessibilityRole="button"
                      accessibilityLabel={`Set frequency to ${opt.label}`}
                      className={`min-h-[40px] px-3.5 py-1.5 rounded-xl border mr-2 items-center justify-center ${
                        frequency === opt.value
                          ? 'bg-brand-500 border-brand-500'
                          : 'bg-slate-100 dark:bg-[#171f33] border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <ThemedText
                        className={`text-xs font-semibold ${
                          frequency === opt.value
                            ? 'text-white'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {opt.label}
                      </ThemedText>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {/* Funding Wallet Selector */}
              <View className="gap-1.5">
                <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {commitmentType === 'INCOME' ? 'Deposit To Wallet' : 'Pay From Wallet'}
                </ThemedText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-2">
                  {wallets.map((w) => (
                    <Pressable
                      key={w.id}
                      onPress={() => setWalletId(w.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Select wallet ${w.name}`}
                      className={`min-h-[44px] px-3.5 py-1.5 rounded-xl border flex-row items-center gap-1.5 mr-2 ${
                        walletId === w.id
                          ? 'bg-slate-900 dark:bg-white border-slate-900 dark:border-white'
                          : 'bg-slate-100 dark:bg-[#171f33] border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <ThemedText className="text-sm">{w.icon}</ThemedText>
                      <ThemedText
                        className={`text-xs font-semibold ${
                          walletId === w.id
                            ? 'text-white dark:text-slate-900'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {w.name}
                      </ThemedText>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {/* Category Selector */}
              <View className="gap-1.5">
                <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Category
                </ThemedText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-2">
                  {modalCategories.map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => setCategoryId(c.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Select category ${c.name}`}
                      className={`min-h-[44px] px-3.5 py-1.5 rounded-xl border flex-row items-center gap-1.5 mr-2 ${
                        categoryId === c.id
                          ? 'bg-brand-500 border-brand-500'
                          : 'bg-slate-100 dark:bg-[#171f33] border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <ThemedText className="text-sm">{c.icon}</ThemedText>
                      <ThemedText
                        className={`text-xs font-semibold ${
                          categoryId === c.id
                            ? 'text-white'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {c.name}
                      </ThemedText>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {/* Auto-pay switch */}
              <View className="flex-row items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-[#171f33] border border-slate-200 dark:border-slate-700">
                <View className="flex-1 mr-3">
                  <ThemedText className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Auto-Pay Enabled
                  </ThemedText>
                  <ThemedText className="text-[11px] text-slate-500">
                    This bill is automatically debited by the provider.
                  </ThemedText>
                </View>
                <Switch
                  value={isAutoPaid}
                  onValueChange={setIsAutoPaid}
                  trackColor={{ false: '#cbd5e1', true: '#3b82f6' }}
                />
              </View>

              {/* Notes */}
              <View className="gap-1.5">
                <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Notes (Optional)
                </ThemedText>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="e.g. Account # 1234, renews every Nov"
                  placeholderTextColor="#94a3b8"
                  className="px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#171f33] text-slate-900 dark:text-white text-sm"
                />
              </View>

              {/* Buttons: Save / Delete */}
              <View className="gap-2 pt-2 pb-6">
                <Pressable
                  onPress={handleSaveCommitment}
                  disabled={upsertMutation.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Save recurring bill"
                  className="min-h-[44px] w-full py-3 rounded-2xl bg-brand-500 active:bg-brand-600 items-center justify-center shadow-sm"
                >
                  {upsertMutation.isPending ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <ThemedText className="text-white font-bold text-sm">
                      {editingCommitment
                        ? 'Save Changes'
                        : commitmentType === 'INCOME'
                          ? 'Create Recurring Income'
                          : 'Create Recurring Bill'}
                    </ThemedText>
                  )}
                </Pressable>

                {editingCommitment && (
                  <Pressable
                    onPress={() => void handleDeleteCommitment(editingCommitment.id)}
                    disabled={deleteMutation.isPending}
                    accessibilityRole="button"
                    accessibilityLabel="Delete recurring entry"
                    className="min-h-[44px] w-full py-2.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 items-center justify-center active:opacity-75"
                  >
                    <ThemedText className="text-rose-600 dark:text-rose-400 font-semibold text-xs">
                      {commitmentType === 'INCOME'
                        ? 'Delete Recurring Income'
                        : 'Delete Recurring Bill'}
                    </ThemedText>
                  </Pressable>
                )}
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 4. SETTLE COMMITMENT CONFIRMATION MODAL */}
      <Modal
        visible={settleTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!settleMutation.isPending) setSettleTarget(null);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1 justify-center items-center p-4 bg-black/60"
        >
          <Pressable
            className="absolute inset-0"
            onPress={() => {
              if (!settleMutation.isPending) setSettleTarget(null);
            }}
          />

          <View className="w-full max-w-[400px] rounded-3xl bg-white dark:bg-[#131b2e] border border-slate-200 dark:border-slate-800 p-6 shadow-2xl gap-4">
            <View className="gap-1">
              <ThemedText className="text-lg font-bold text-slate-900 dark:text-white">
                {settleTarget?.type === 'INCOME'
                  ? `Record ${settleTarget?.name}?`
                  : `Settle ${settleTarget?.name}?`}
              </ThemedText>
              <ThemedText className="text-xs text-slate-500 dark:text-slate-400 leading-5">
                {settleTarget
                  ? `Amount: ${formatMinorUnits(settleTarget.amountMinor, settleTarget.currency)}. Choose whether to record this in your ledger and update the wallet balance.`
                  : ''}
              </ThemedText>
            </View>

            {settleError && (
              <View className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800">
                <ThemedText className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                  {settleError}
                </ThemedText>
              </View>
            )}

            <View className="gap-2.5">
              <Pressable
                onPress={() => void handleConfirmSettle(true)}
                disabled={settleMutation.isPending}
                accessibilityRole="button"
                accessibilityLabel="Mark and record transaction"
                className="min-h-[44px] w-full py-3 px-4 rounded-2xl bg-brand-500 active:bg-brand-600 items-center justify-center shadow-sm"
              >
                {settleMutation.isPending ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <ThemedText className="text-white font-bold text-sm">
                    {settleTarget?.type === 'INCOME'
                      ? 'Mark Received & Record Income'
                      : 'Mark Paid & Record Expense'}
                  </ThemedText>
                )}
              </Pressable>

              <Pressable
                onPress={() => void handleConfirmSettle(false)}
                disabled={settleMutation.isPending}
                accessibilityRole="button"
                accessibilityLabel="Mark only without creating transaction"
                className="min-h-[44px] w-full py-3 px-4 rounded-2xl bg-slate-100 dark:bg-[#171f33] border border-slate-200 dark:border-slate-700 items-center justify-center active:opacity-75"
              >
                <ThemedText className="text-slate-700 dark:text-slate-200 font-semibold text-xs">
                  Mark Only (Already Logged)
                </ThemedText>
              </Pressable>

              <Pressable
                onPress={() => setSettleTarget(null)}
                disabled={settleMutation.isPending}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                className="min-h-[44px] w-full py-2.5 rounded-2xl items-center justify-center active:opacity-75"
              >
                <ThemedText className="text-slate-500 dark:text-slate-400 font-semibold text-xs">
                  Cancel
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
