import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { ThemedText } from '@/common/components/themed-text';
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

const QUICK_AMOUNT_PRESETS = [1500, 5000, 10000, 50000, 150000]; // $15, $50, $100, $500, $1,500 in cents
const QUICK_DAY_PRESETS = [1, 5, 10, 15, 20, 25, 30];

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

  // Accordion toggle
  const [isBreakdownExpanded, setIsBreakdownExpanded] = useState(false);

  // Bill filter
  const [filterMode, setFilterMode] = useState<'ALL' | 'UNPAID' | 'PAID'>('ALL');

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCommitment, setEditingCommitment] = useState<RecurringCommitment | null>(null);

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
  const isTight = !isNegative && dailyDiscretionaryMinor < 1000; // < $10.00/day
  const isPositive = !isNegative && !isTight;

  const heroTheme = useMemo(() => {
    if (isNegative) {
      return {
        cardBg: 'bg-rose-50/80 dark:bg-rose-950/25 border-rose-200 dark:border-rose-900/50',
        badgeBg: 'bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300',
        statusText: '⚠️ Overcommitted',
        amountColor: 'text-rose-600 dark:text-rose-400',
        icon: '🚨',
      };
    }
    if (isTight) {
      return {
        cardBg: 'bg-amber-50/80 dark:bg-amber-950/25 border-amber-200 dark:border-amber-900/50',
        badgeBg: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300',
        statusText: '⚡ Tight Liquidity',
        amountColor: 'text-amber-600 dark:text-amber-400',
        icon: '⚠️',
      };
    }
    return {
      cardBg: 'bg-emerald-50/80 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-900/50',
      badgeBg: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300',
      statusText: '✓ Safe & On Track',
      amountColor: 'text-emerald-600 dark:text-emerald-400',
      icon: '🛡️',
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
    return commitments.filter((c) => c.isActive && c.lastPaidPeriod !== currentPeriod).length;
  }, [commitments, currentPeriod]);

  // Modal Handlers
  const handleOpenAddModal = () => {
    setEditingCommitment(null);
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

  const handleSaveCommitment = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('Please enter a name for the recurring bill.');
      return;
    }

    const parsedMinor = parseDecimalToMinorUnits(amountInput);
    if (parsedMinor === null || parsedMinor <= 0) {
      setFormError(`Please enter a valid amount greater than ${formatMinorUnits(0, DEFAULT_CURRENCY)}.`);
      return;
    }

    if (dueDay < 1 || dueDay > 31) {
      setFormError('Due day must be between 1 and 31.');
      return;
    }

    const selectedAccount = accounts.find((a) => a.id === accountId) ?? accounts[0];
    const currency = selectedAccount?.currency ?? DEFAULT_CURRENCY;

    try {
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

      setModalVisible(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to save recurring bill.');
    }
  };

  const handleDeleteCommitment = async (id: string) => {
    Alert.alert(
      'Delete Recurring Bill',
      'Are you sure you want to delete this recurring obligation?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync(id);
              setModalVisible(false);
            } catch (err: unknown) {
              Alert.alert('Error', 'Failed to delete recurring commitment.');
            }
          },
        },
      ],
    );
  };

  const handleTogglePaid = async (commitment: RecurringCommitment) => {
    const isPaid = commitment.lastPaidPeriod === currentPeriod;
    try {
      if (isPaid) {
        await unpayMutation.mutateAsync(commitment.id);
      } else {
        await payMutation.mutateAsync({ commitmentId: commitment.id });
      }
    } catch (error: unknown) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Failed to update bill payment status.',
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
            <ThemedText className="text-xl">{heroTheme.icon}</ThemedText>
            <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Safe to Spend
            </ThemedText>
          </View>

          <View className={`px-2.5 py-1 rounded-full ${heroTheme.badgeBg}`}>
            <ThemedText className="text-xs font-semibold">
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
              className={`text-4xl font-extrabold tracking-tight ${heroTheme.amountColor}`}
            >
              {formatMinorUnits(safeToSpendMinor)}
            </ThemedText>
            <ThemedText className="text-sm font-medium text-slate-600 dark:text-slate-400 mt-1">
              {formatMinorUnits(dailyDiscretionaryMinor)} / day for next{' '}
              {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'}
            </ThemedText>
          </View>
        )}

        {/* Toggle Calculation Accordion Button */}
        <Pressable
          onPress={() => setIsBreakdownExpanded(!isBreakdownExpanded)}
          accessibilityRole="button"
          accessibilityLabel="Toggle liquidity calculation breakdown"
          className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-800/60 flex-row items-center justify-between active:opacity-75"
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
          <View className="mt-3 pt-2 gap-2 bg-white/60 dark:bg-slate-900/60 p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-800/60">
            {/* (+) Liquid Cash */}
            <View className="flex-row items-center justify-between">
              <View className="flex-1 mr-2">
                <ThemedText className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  (+) Liquid Cash Balance
                </ThemedText>
                <ThemedText className="text-[11px] text-slate-500">
                  Bank, e-wallet & cash accounts
                </ThemedText>
              </View>
              <ThemedText className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
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
              <ThemedText className="text-xs font-bold text-amber-600 dark:text-amber-400">
                -{formatMinorUnits(metrics.isolatedSinkingFundsMinor)}
              </ThemedText>
            </View>

            {/* (-) Upcoming Fixed Bills */}
            <View className="flex-row items-center justify-between">
              <View className="flex-1 mr-2">
                <ThemedText className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  (-) Upcoming Fixed Bills
                </ThemedText>
                <ThemedText className="text-[11px] text-slate-500">
                  Unpaid recurring commitments due
                </ThemedText>
              </View>
              <ThemedText className="text-xs font-bold text-rose-600 dark:text-rose-400">
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
              <ThemedText className="text-xs font-bold text-purple-600 dark:text-purple-400">
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
                className={`text-sm font-extrabold ${heroTheme.amountColor}`}
              >
                {formatMinorUnits(metrics.safeToSpendMinor)}
              </ThemedText>
            </View>
          </View>
        )}
      </View>

      {/* 2. RECURRING OBLIGATIONS STRIP / LIST */}
      <View className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm gap-3">
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
            accessibilityLabel="Add new recurring bill"
            className="px-3 py-1.5 rounded-full bg-brand-500 active:bg-brand-600 shadow-sm"
          >
            <ThemedText className="text-xs font-bold text-white">
              + Add Bill
            </ThemedText>
          </Pressable>
        </View>

        {/* Filter Pills (All / Unpaid / Paid) */}
        {commitments.length > 0 && (
          <View className="flex-row items-center gap-1.5 pt-1">
            <Pressable
              onPress={() => setFilterMode('ALL')}
              className={`px-3 py-1 rounded-full border ${
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
              className={`px-3 py-1 rounded-full border ${
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
                Unpaid ({unpaidCount})
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => setFilterMode('PAID')}
              className={`px-3 py-1 rounded-full border ${
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
                Paid ({commitments.length - unpaidCount})
              </ThemedText>
            </Pressable>
          </View>
        )}

        {/* Commitment List */}
        {isCommitmentsLoading ? (
          <ActivityIndicator className="my-4" size="small" />
        ) : filteredCommitments.length === 0 ? (
          <View className="py-6 items-center justify-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
            <ThemedText className="text-2xl mb-1">📅</ThemedText>
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
          <View className="gap-2.5">
            {filteredCommitments.map((commitment) => {
              const isPaid = commitment.lastPaidPeriod === currentPeriod;
              const isOverdue = !isPaid && commitment.dueDay < currentDay;
              const isDueToday = !isPaid && commitment.dueDay === currentDay;

              const account = accounts.find((a) => a.id === commitment.accountId);
              const category = categories.find((c) => c.id === commitment.categoryId);

              return (
                <View
                  key={commitment.id}
                  className={`p-3.5 rounded-2xl border ${
                    isPaid
                      ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-900/40'
                      : isOverdue
                        ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200/80 dark:border-rose-900/40'
                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/80'
                  }`}
                >
                  <View className="flex-row items-center justify-between">
                    {/* Left: Due Badge + Name + Badges */}
                    <View className="flex-1 mr-3">
                      <View className="flex-row items-center gap-2 mb-1 flex-wrap">
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
                              ? `✓ Paid (${monthName})`
                              : isDueToday
                                ? 'Due Today!'
                                : isOverdue
                                  ? `Overdue (${monthName} ${commitment.dueDay})`
                                  : `Due ${monthName} ${commitment.dueDay}`}
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
                              ⚡ Auto-pay
                            </ThemedText>
                          </View>
                        )}
                      </View>

                      {/* Name */}
                      <ThemedText className="text-sm font-bold text-slate-900 dark:text-white">
                        {commitment.name}
                      </ThemedText>

                      {/* Account and Category Subtext */}
                      <View className="flex-row items-center gap-2 mt-1">
                        {account && (
                          <ThemedText className="text-xs text-slate-500">
                            {account.icon} {account.name}
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
                      <ThemedText className="text-base font-extrabold text-slate-900 dark:text-white">
                        {formatMinorUnits(commitment.amountMinor, commitment.currency)}
                      </ThemedText>

                      <View className="flex-row items-center gap-1.5">
                        {/* Quick Mark Paid / Unpaid Button */}
                        <Pressable
                          onPress={() => handleTogglePaid(commitment)}
                          accessibilityRole="button"
                          accessibilityLabel={isPaid ? 'Mark as unpaid' : 'Mark as paid'}
                          className={`px-2.5 py-1 rounded-full ${
                            isPaid
                              ? 'bg-emerald-600 active:bg-emerald-700'
                              : 'bg-brand-500 active:bg-brand-600'
                          }`}
                        >
                          <ThemedText className="text-xs font-semibold text-white">
                            {isPaid ? '✓ Paid' : 'Mark Paid'}
                          </ThemedText>
                        </Pressable>

                        {/* Edit Button */}
                        <Pressable
                          onPress={() => handleOpenEditModal(commitment)}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${commitment.name}`}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          className="p-1 rounded-full bg-slate-200/70 dark:bg-slate-700 active:opacity-75"
                        >
                          <ThemedText className="text-xs">✏️</ThemedText>
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
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1 justify-end bg-black/50"
        >
          <Pressable
            onPress={() => setModalVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Close dialog backdrop"
            className="absolute inset-0"
          />
          <View className="relative z-10 bg-white dark:bg-slate-900 rounded-t-3xl max-h-[90%] p-5 gap-4">
            {/* Modal Header */}
            <View className="flex-row items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <ThemedText className="text-lg font-bold text-slate-900 dark:text-white">
                {editingCommitment ? 'Edit Recurring Bill' : 'New Recurring Bill'}
              </ThemedText>
              <Pressable
                onPress={() => setModalVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel editing bill"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                className="p-1 active:opacity-75"
              >
                <ThemedText className="text-sm font-semibold text-slate-500">
                  Cancel
                </ThemedText>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} className="gap-4">
              {formError && (
                <View className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800">
                  <ThemedText className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                    {formError}
                  </ThemedText>
                </View>
              )}

              {/* Bill Name */}
              <View className="gap-1.5">
                <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Bill Name
                </ThemedText>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Rent, Netflix, Electric Bill"
                  placeholderTextColor="#94a3b8"
                  className="px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                />
              </View>

              {/* Amount & Presets */}
              <View className="gap-1.5">
                <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Amount ({DEFAULT_CURRENCY_SYMBOL} {DEFAULT_CURRENCY})
                </ThemedText>
                <TextInput
                  value={amountInput}
                  onChangeText={(text) => {
                    setAmountInput(normalizeDecimalInput(text));
                    if (formError) setFormError(null);
                  }}
                  placeholder="0.00"
                  placeholderTextColor={theme.textSecondary}
                  accessibilityLabel="Bill amount"
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="off"
                  className="px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-base font-bold"
                />
                <View className="flex-row items-center gap-2 flex-wrap pt-1">
                  {QUICK_AMOUNT_PRESETS.map((cents) => (
                    <Pressable
                      key={cents}
                      onPress={() => setAmountInput(minorUnitsToDecimalInput(cents))}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 active:opacity-75"
                    >
                      <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-300">
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
                      className={`px-3 py-1.5 rounded-xl border ${
                        dueDay === day
                          ? 'bg-brand-500 border-brand-500'
                          : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
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
                      className={`px-3 py-1.5 rounded-xl border mr-2 ${
                        frequency === opt.value
                          ? 'bg-brand-500 border-brand-500'
                          : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
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

              {/* Funding Account Selector */}
              <View className="gap-1.5">
                <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Pay From Account
                </ThemedText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-2">
                  {accounts.map((a) => (
                    <Pressable
                      key={a.id}
                      onPress={() => setAccountId(a.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Pay from account ${a.name}`}
                      accessibilityState={{ selected: accountId === a.id }}
                      className={`min-h-[44px] px-3 py-2 rounded-xl border flex-row items-center gap-1.5 mr-2 ${
                        accountId === a.id
                          ? 'bg-slate-900 dark:bg-white border-slate-900 dark:border-white'
                          : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <ThemedText className="text-sm">{a.icon}</ThemedText>
                      <ThemedText
                        className={`text-xs font-semibold ${
                          accountId === a.id
                            ? 'text-white dark:text-slate-900'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {a.name}
                      </ThemedText>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {/* Expense Category Selector */}
              <View className="gap-1.5">
                <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Category
                </ThemedText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-2">
                  {categories.map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => setCategoryId(c.id)}
                      className={`px-3 py-1.5 rounded-xl border flex-row items-center gap-1.5 mr-2 ${
                        categoryId === c.id
                          ? 'bg-brand-500 border-brand-500'
                          : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
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
              <View className="flex-row items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
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
                  className="px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                />
              </View>

              {/* Buttons: Save / Delete */}
              <View className="gap-2 pt-2 pb-6">
                <Pressable
                  onPress={handleSaveCommitment}
                  disabled={upsertMutation.isPending}
                  className="w-full py-3 rounded-2xl bg-brand-500 active:bg-brand-600 items-center justify-center shadow-sm"
                >
                  {upsertMutation.isPending ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <ThemedText className="text-white font-bold text-sm">
                      {editingCommitment ? 'Save Changes' : 'Create Recurring Bill'}
                    </ThemedText>
                  )}
                </Pressable>

                {editingCommitment && (
                  <Pressable
                    onPress={() => handleDeleteCommitment(editingCommitment.id)}
                    disabled={deleteMutation.isPending}
                    className="w-full py-2.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 items-center justify-center active:opacity-75"
                  >
                    <ThemedText className="text-rose-600 dark:text-rose-400 font-semibold text-xs">
                      Delete Recurring Bill
                    </ThemedText>
                  </Pressable>
                )}
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
