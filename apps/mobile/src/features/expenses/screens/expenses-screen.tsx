import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  computeExpenseSummary,
  computeInstallmentProgress,
  DEFAULT_CURRENCY,
  filterExpenses,
  formatMinorUnits,
  getCommitmentDueStatus,
  isCommitmentPaidOff,
  isTransactionInPeriod,
  minorUnitsToDecimalInput,
  type CreateCategoryInput,
  type CreateTransactionInput,
  type DashboardPeriod,
  type RecurringCommitment,
  type RecurringCommitmentInput,
  type Transaction,
  type TransactionSplit,
} from '@repo/contracts';

import { ThemedText } from '@/common/components/themed-text';
import { BottomTabInset } from '@/common/constants/theme';
import { useRequireAuth } from '@/common/hooks/use-require-auth';
import { useTheme } from '@/common/hooks/use-theme';
import { SplitEditorModal } from '@/features/transactions/components/split-editor-modal';
import {
  useAccounts,
  useAllCategories,
  useCategories,
  useCreateCustomCategory,
  useCreateTransaction,
  useDeleteRecurringCommitment,
  useDeleteTransaction,
  usePayRecurringCommitment,
  useQuickPresets,
  useRecurringCommitments,
  useSmartDefaults,
  useTransactions,
  useUnpayRecurringCommitment,
  useUpdateTransaction,
  useUpsertRecurringCommitment,
} from '@/features/transactions/hooks/use-transactions';

import { ExpenseCard } from '../components/expense-card';
import { ExpenseFormModal, type ExpenseFormMode } from '../components/expense-form-modal';
import { RecordedExpensesTable, ScheduledExpensesTable } from '../components/expenses-table';
import { InlineExpenseForm } from '../components/inline-expense-form';
import { ScheduledExpenseCard } from '../components/scheduled-expense-card';

export interface ExpensesScreenProps {
  initialCategoryId?: string;
  initialAccountId?: string;
  initialSearch?: string;
}

type ExpensesViewTab = 'RECORDED' | 'SCHEDULED';
type ExpensesDisplayMode = 'CARDS' | 'TABLE';
type ScheduledStatusFilter = 'ALL' | 'UNPAID' | 'PAID' | 'LOANS';

const PERIOD_OPTIONS: readonly { key: DashboardPeriod; label: string }[] = [
  { key: 'THIS_MONTH', label: 'This Month' },
  { key: 'LAST_7_DAYS', label: 'Last 7 Days' },
  { key: 'ALL_TIME', label: 'All Time' },
];

const SCHEDULED_STATUS_OPTIONS: readonly { key: ScheduledStatusFilter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'UNPAID', label: 'Unpaid' },
  { key: 'PAID', label: 'Paid' },
  { key: 'LOANS', label: 'Loans' },
];

const COMPACT_HIT_SLOP = { top: 6, bottom: 6, left: 4, right: 4 } as const;

function chunkIntoRows<T>(items: readonly T[], columns: number): T[][] {
  if (columns <= 1) {
    return items.map((item) => [item]);
  }
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns));
  }
  return rows;
}

export function ExpensesScreen({
  initialCategoryId,
  initialAccountId,
  initialSearch,
}: ExpensesScreenProps) {
  const { isAuthenticated } = useRequireAuth();
  const theme = useTheme();

  const transactionsQuery = useTransactions();
  const accountsQuery = useAccounts();
  const categoriesQuery = useCategories('EXPENSE', 12);
  const { categories: allCategories } = useAllCategories();
  const smartDefaultsQuery = useSmartDefaults();
  const quickPresetsQuery = useQuickPresets();
  const commitmentsQuery = useRecurringCommitments();

  const createTransactionMutation = useCreateTransaction();
  const updateTransactionMutation = useUpdateTransaction();
  const deleteTransactionMutation = useDeleteTransaction();
  const createCategoryMutation = useCreateCustomCategory();
  const upsertCommitmentMutation = useUpsertRecurringCommitment();
  const deleteCommitmentMutation = useDeleteRecurringCommitment();
  const payCommitmentMutation = usePayRecurringCommitment();
  const unpayCommitmentMutation = useUnpayRecurringCommitment();

  const transactions = transactionsQuery.data ?? [];
  const accounts = accountsQuery.data ?? [];
  const expenseCategories = categoriesQuery.rankedCategories;
  const smartDefaults = smartDefaultsQuery.data;
  const quickPresets = quickPresetsQuery.data ?? [];
  const commitments = commitmentsQuery.data ?? [];

  // View Tab, Display Mode & Filter State
  const { width: windowWidth } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<ExpensesViewTab>('RECORDED');
  const [displayMode, setDisplayMode] = useState<ExpensesDisplayMode>('CARDS');
  const [cardColumnsPref, setCardColumnsPref] = useState<2 | 3>(3);
  const [showInlineForm, setShowInlineForm] = useState(false);
  const [period, setPeriod] = useState<DashboardPeriod>('THIS_MONTH');
  const [scheduledStatus, setScheduledStatus] = useState<ScheduledStatusFilter>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [accountFilter, setAccountFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal & Form Session State
  const [modalVisible, setModalVisible] = useState(false);
  const [formSessionKey, setFormSessionKey] = useState(0);
  const [initialFormMode, setInitialFormMode] = useState<ExpenseFormMode>('ONE_TIME');
  const [editingExpense, setEditingExpense] = useState<Transaction | null>(null);
  const [editingCommitment, setEditingCommitment] = useState<RecurringCommitment | null>(null);
  const [draftSplits, setDraftSplits] = useState<TransactionSplit[]>([]);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [splitTotalMinor, setSplitTotalMinor] = useState<number>(10000);
  const [splitInitialCategoryId, setSplitInitialCategoryId] = useState<string | undefined>(
    undefined,
  );
  const [externalAmountSync, setExternalAmountSync] = useState<string | null>(null);

  // Feedback State
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Current Period Metadata for Scheduled Expenses
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentDay = now.getDate();
  const monthName = now.toLocaleDateString(undefined, { month: 'short' });

  // Sync deep-link route params cleanly when navigated from Dashboard
  useEffect(() => {
    if (initialCategoryId && expenseCategories.length > 0) {
      const exists = expenseCategories.some((c) => c.id === initialCategoryId);
      setCategoryFilter(exists ? initialCategoryId : 'ALL');
    }
  }, [initialCategoryId, expenseCategories]);

  useEffect(() => {
    if (initialAccountId && accounts.length > 0) {
      const exists = accounts.some((a) => a.id === initialAccountId);
      setAccountFilter(exists ? initialAccountId : 'ALL');
    }
  }, [initialAccountId, accounts]);

  useEffect(() => {
    if (typeof initialSearch === 'string' && initialSearch.trim().length > 0) {
      setSearchQuery(initialSearch.trim());
    }
  }, [initialSearch]);

  // Auto-dismiss confirmation toast
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const allExpensesCount = useMemo(
    () => transactions.filter((tx) => tx.type === 'EXPENSE').length,
    [transactions],
  );

  // Recorded Expenses Filtering & Summary
  const periodAndAccountExpenses = useMemo(
    () =>
      filterExpenses({
        transactions,
        categories: allCategories,
        accounts,
        period,
        accountId: accountFilter,
        searchQuery,
      }),
    [transactions, allCategories, accounts, period, accountFilter, searchQuery],
  );

  const periodAndAccountSummary = useMemo(
    () =>
      computeExpenseSummary({
        expenses: periodAndAccountExpenses,
        categories: allCategories,
      }),
    [periodAndAccountExpenses, allCategories],
  );

  const filteredExpenses = useMemo(
    () =>
      filterExpenses({
        transactions,
        categories: allCategories,
        accounts,
        period,
        categoryId: categoryFilter,
        accountId: accountFilter,
        searchQuery,
      }),
    [transactions, allCategories, accounts, period, categoryFilter, accountFilter, searchQuery],
  );

  const summary = useMemo(
    () =>
      computeExpenseSummary({
        expenses: filteredExpenses,
        categories: allCategories,
      }),
    [filteredExpenses, allCategories],
  );

  // Scheduled Commitments Filtering & KPIs
  const scheduledStats = useMemo(() => {
    const active = commitments.filter((c) => c.isActive && !isCommitmentPaidOff(c));
    const unpaid = active.filter((c) => getCommitmentDueStatus(c).isDueThisMonth);
    const paid = active.filter((c) => c.lastPaidPeriod === currentPeriod);
    const activeWithTerms = active.filter(
      (c) => typeof c.totalInstallments === 'number' && c.totalInstallments > 0,
    );
    const remainingTermsTotal = activeWithTerms.reduce(
      (sum, c) => sum + computeInstallmentProgress(c).remainingCount,
      0,
    );
    const loansRemainingMinor = activeWithTerms.reduce(
      (sum, c) => sum + computeInstallmentProgress(c).remainingBalanceMinor,
      0,
    );

    return {
      activeCount: active.length,
      monthlyScheduledMinor: active.reduce((sum, c) => sum + c.amountMinor, 0),
      unpaidCount: unpaid.length,
      unpaidMinor: unpaid.reduce((sum, c) => sum + c.amountMinor, 0),
      paidCount: paid.length,
      paidMinor: paid.reduce((sum, c) => sum + c.amountMinor, 0),
      activeLoansCount: activeWithTerms.length,
      remainingTermsTotal,
      loansRemainingMinor,
    };
  }, [commitments, currentPeriod]);

  const filterCommitmentsList = useCallback(
    (includeCategoryFilter: boolean) => {
      const normalizedQuery = searchQuery.trim().toLowerCase();
      return commitments
        .filter((c) => {
          const isPaidOff = isCommitmentPaidOff(c);
          const isPaid = c.lastPaidPeriod === currentPeriod;

          if (scheduledStatus === 'UNPAID' && (isPaid || isPaidOff || !c.isActive)) {
            return false;
          }
          if (scheduledStatus === 'PAID' && !isPaid && !isPaidOff) {
            return false;
          }
          if (scheduledStatus === 'LOANS' && c.kind !== 'INSTALLMENT' && c.categoryId !== 'cat-loans') {
            return false;
          }
          if (accountFilter !== 'ALL' && c.accountId !== accountFilter) {
            return false;
          }
          if (includeCategoryFilter && categoryFilter !== 'ALL' && c.categoryId !== categoryFilter) {
            return false;
          }
          if (normalizedQuery.length > 0) {
            const catName = allCategories.find((cat) => cat.id === c.categoryId)?.name ?? '';
            const accName = accounts.find((acc) => acc.id === c.accountId)?.name ?? '';
            const haystack = `${c.name} ${c.notes ?? ''} ${c.dueLabel ?? ''} ${c.nextDueDate ?? ''} ${catName} ${accName}`.toLowerCase();
            if (!haystack.includes(normalizedQuery)) {
              return false;
            }
          }
          return true;
        })
        .slice()
        .sort((a, b) => a.dueDay - b.dueDay);
    },
    [
      commitments,
      currentPeriod,
      scheduledStatus,
      accountFilter,
      categoryFilter,
      searchQuery,
      allCategories,
      accounts,
    ],
  );

  const scheduledBaseList = useMemo(
    () => filterCommitmentsList(false),
    [filterCommitmentsList],
  );

  const scheduledCategoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of scheduledBaseList) {
      counts[c.categoryId] = (counts[c.categoryId] ?? 0) + 1;
    }
    return counts;
  }, [scheduledBaseList]);

  const filteredCommitments = useMemo(
    () => filterCommitmentsList(true),
    [filterCommitmentsList],
  );

  // This month's total spending vs monthly budget (independent of active period filter)
  const monthlyBudgetMinor = smartDefaults?.monthlyBudgetMinor ?? 250000;
  const thisMonthSpentMinor = useMemo(
    () =>
      transactions
        .filter((tx) => tx.type === 'EXPENSE' && isTransactionInPeriod(tx.occurredAt, 'THIS_MONTH'))
        .reduce((sum, tx) => sum + tx.amountMinor, 0),
    [transactions],
  );
  const budgetRemainingMinor = monthlyBudgetMinor - thisMonthSpentMinor;
  const budgetUtilizationPercent =
    monthlyBudgetMinor > 0
      ? Math.round((thisMonthSpentMinor * 100) / monthlyBudgetMinor)
      : 0;
  const isOverBudget = thisMonthSpentMinor > monthlyBudgetMinor;
  const isNearBudget = !isOverBudget && budgetUtilizationPercent >= 80;
  const projectedMonthlyOutflowMinor = thisMonthSpentMinor + scheduledStats.unpaidMinor;

  const canChooseThreeColumns = windowWidth >= 1150;
  const effectiveCardColumns =
    windowWidth < 768 ? 1 : canChooseThreeColumns ? cardColumnsPref : 2;

  const expenseCardRows = useMemo(
    () => chunkIntoRows(filteredExpenses, effectiveCardColumns),
    [filteredExpenses, effectiveCardColumns],
  );
  const commitmentCardRows = useMemo(
    () => chunkIntoRows(filteredCommitments, effectiveCardColumns),
    [filteredCommitments, effectiveCardColumns],
  );

  const hasActiveFilters =
    activeTab === 'RECORDED'
      ? period !== 'THIS_MONTH' ||
        categoryFilter !== 'ALL' ||
        accountFilter !== 'ALL' ||
        searchQuery.trim().length > 0
      : scheduledStatus !== 'ALL' ||
        categoryFilter !== 'ALL' ||
        accountFilter !== 'ALL' ||
        searchQuery.trim().length > 0;

  const handleResetFilters = () => {
    setPeriod('THIS_MONTH');
    setScheduledStatus('ALL');
    setCategoryFilter('ALL');
    setAccountFilter('ALL');
    setSearchQuery('');
  };

  const openAddModal = () => {
    setEditingExpense(null);
    setEditingCommitment(null);
    setInitialFormMode(activeTab === 'SCHEDULED' ? 'RECURRING' : 'ONE_TIME');
    setDraftSplits([]);
    setExternalAmountSync(null);
    setIsSplitModalOpen(false);
    setActionError(null);
    setFormSessionKey((prev) => prev + 1);
    setModalVisible(true);
  };

  const openEditExpenseModal = (expense: Transaction) => {
    setEditingCommitment(null);
    setEditingExpense(expense);
    setInitialFormMode('ONE_TIME');
    setDraftSplits(expense.splits ? expense.splits.map((s) => ({ ...s })) : []);
    setExternalAmountSync(null);
    setIsSplitModalOpen(false);
    setActionError(null);
    setFormSessionKey((prev) => prev + 1);
    setModalVisible(true);
  };

  const openEditCommitmentModal = (commitment: RecurringCommitment) => {
    setEditingExpense(null);
    setEditingCommitment(commitment);
    setInitialFormMode(commitment.kind === 'INSTALLMENT' ? 'INSTALLMENT' : 'RECURRING');
    setDraftSplits([]);
    setExternalAmountSync(null);
    setIsSplitModalOpen(false);
    setActionError(null);
    setFormSessionKey((prev) => prev + 1);
    setModalVisible(true);
  };

  const isMutatingModal =
    createTransactionMutation.isPending ||
    updateTransactionMutation.isPending ||
    deleteTransactionMutation.isPending ||
    upsertCommitmentMutation.isPending ||
    deleteCommitmentMutation.isPending;

  const handleCloseModal = () => {
    if (isMutatingModal) {
      return;
    }
    setModalVisible(false);
    setIsSplitModalOpen(false);
  };

  const handleSaveExpense = async (payload: {
    id?: string;
    input: CreateTransactionInput;
  }) => {
    if (payload.id) {
      const updated = await updateTransactionMutation.mutateAsync({
        ...payload.input,
        id: payload.id,
      });
      setModalVisible(false);
      setToastMessage(
        `✓ Updated expense (${formatMinorUnits(updated.amountMinor, updated.currency)})`,
      );
    } else {
      const created = await createTransactionMutation.mutateAsync(payload.input);
      setModalVisible(false);
      setActiveTab('RECORDED');
      setToastMessage(
        `✓ Added expense (${formatMinorUnits(created.amountMinor, created.currency)})`,
      );
    }
  };

  const handleSaveCommitment = async (
    payload: Omit<RecurringCommitmentInput, 'id'> & { id?: string },
  ) => {
    const saved = await upsertCommitmentMutation.mutateAsync(payload);
    setModalVisible(false);
    setActiveTab('SCHEDULED');
    const kindLabel = saved.kind === 'INSTALLMENT' ? 'loan / installment' : 'recurring expense';
    setToastMessage(
      payload.id
        ? `✓ Updated ${kindLabel}: ${saved.name}`
        : `✓ Scheduled ${kindLabel}: ${saved.name} (${formatMinorUnits(saved.amountMinor, saved.currency)})`,
    );
  };

  const handleDeleteExpenseFromCard = async (expenseId: string) => {
    setActionError(null);
    try {
      await deleteTransactionMutation.mutateAsync(expenseId);
      setToastMessage('✓ Expense deleted and account balance restored');
    } catch (error: unknown) {
      setActionError(
        error instanceof Error ? error.message : 'Failed to delete expense.',
      );
    }
  };

  const handleDeleteExpenseFromModal = async (expenseId: string) => {
    await deleteTransactionMutation.mutateAsync(expenseId);
    setModalVisible(false);
    setToastMessage('✓ Expense deleted and account balance restored');
  };

  const handleDeleteCommitmentFromCard = async (commitmentId: string) => {
    setActionError(null);
    try {
      await deleteCommitmentMutation.mutateAsync(commitmentId);
      setToastMessage('✓ Scheduled expense deleted');
    } catch (error: unknown) {
      setActionError(
        error instanceof Error ? error.message : 'Failed to delete scheduled expense.',
      );
    }
  };

  const handleDeleteCommitmentFromModal = async (commitmentId: string) => {
    await deleteCommitmentMutation.mutateAsync(commitmentId);
    setModalVisible(false);
    setToastMessage('✓ Scheduled expense deleted');
  };

  const handlePayCommitment = async (commitment: RecurringCommitment) => {
    setActionError(null);
    try {
      const result = await payCommitmentMutation.mutateAsync({
        commitmentId: commitment.id,
      });
      setToastMessage(
        `✓ Paid ${commitment.name} (${formatMinorUnits(
          result.transaction.amountMinor,
          result.transaction.currency,
        )}) and deducted from account`,
      );
    } catch (error: unknown) {
      setActionError(
        error instanceof Error ? error.message : 'Could not record payment.',
      );
    }
  };

  const handleUnpayCommitment = async (commitment: RecurringCommitment) => {
    setActionError(null);
    try {
      await unpayCommitmentMutation.mutateAsync(commitment.id);
      setToastMessage(
        `✓ Reversed payment for ${commitment.name} and restored account balance`,
      );
    } catch (error: unknown) {
      setActionError(
        error instanceof Error ? error.message : 'Could not reverse payment.',
      );
    }
  };

  const handleCreateCustomCategory = async (input: CreateCategoryInput) => {
    return await createCategoryMutation.mutateAsync(input);
  };

  const handleOpenSplitEditor = (currentAmountMinor: number, currentCategoryId?: string) => {
    setSplitTotalMinor(currentAmountMinor > 0 ? currentAmountMinor : 10000);
    setSplitInitialCategoryId(currentCategoryId);
    setIsSplitModalOpen(true);
  };

  const handleClearExternalAmountSync = useCallback(() => {
    setExternalAmountSync(null);
  }, []);

  if (!isAuthenticated) {
    return null;
  }

  const isLoading =
    transactionsQuery.isLoading ||
    accountsQuery.isLoading ||
    categoriesQuery.isLoading ||
    commitmentsQuery.isLoading;
  const isError =
    transactionsQuery.isError ||
    accountsQuery.isError ||
    categoriesQuery.isError ||
    commitmentsQuery.isError;

  const activePeriodLabel =
    PERIOD_OPTIONS.find((p) => p.key === period)?.label ?? 'This Month';
  const activeCategoryName =
    categoryFilter === 'ALL'
      ? null
      : expenseCategories.find((c) => c.id === categoryFilter)?.name ?? null;
  const listTitle =
    activeTab === 'RECORDED'
      ? activeCategoryName
        ? `${activeCategoryName} Expenses`
        : 'Recorded Expenses'
      : activeCategoryName
        ? `${activeCategoryName} Schedules`
        : 'Recurring & Loans';

  const defaultModalAccountId =
    accountFilter !== 'ALL'
      ? accountFilter
      : smartDefaults?.lastAccountId ?? accounts[0]?.id;
  const defaultModalCategoryId =
    categoryFilter !== 'ALL' ? categoryFilter : undefined;

  const modalCurrency =
    editingCommitment?.currency ??
    editingExpense?.currency ??
    accounts.find((a) => a.id === defaultModalAccountId)?.currency ??
    DEFAULT_CURRENCY;

  const isScheduledActionBusy =
    payCommitmentMutation.isPending ||
    unpayCommitmentMutation.isPending ||
    deleteCommitmentMutation.isPending;

  const categoryPillTotalCount =
    activeTab === 'RECORDED'
      ? periodAndAccountSummary.expenseCount
      : scheduledBaseList.length;

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1" style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            width: '100%',
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: Math.max(96, BottomTabInset + 32),
            gap: 20,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View className="flex-row flex-wrap items-center justify-between gap-3">
            <View className="flex-1 min-w-[200px] gap-0.5">
              <ThemedText
                accessibilityRole="header"
                className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white"
              >
                Expenses
              </ThemedText>
              <ThemedText className="text-sm text-slate-500 dark:text-slate-400">
                One-time expenses, recurring dues & subscriptions, and loans
              </ThemedText>
            </View>

            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={() => router.push('/capture')}
                hitSlop={COMPACT_HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel="Open Fast Entry calculator"
                className="h-9 px-3.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex-row items-center justify-center active:opacity-75"
              >
                <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  ⚡ Fast Entry
                </ThemedText>
              </Pressable>

              <Pressable
                onPress={openAddModal}
                hitSlop={COMPACT_HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel="Add expense"
                className="h-9 px-3.5 rounded-full bg-brand-500 active:bg-brand-600 shadow-md shadow-brand-500/25 flex-row items-center justify-center"
              >
                <ThemedText className="text-white text-xs sm:text-sm font-bold">
                  + Add Expense
                </ThemedText>
              </Pressable>
            </View>
          </View>

          {/* Segmented View Switcher */}
          <View className="p-1 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex-row gap-1">
            <Pressable
              onPress={() => setActiveTab('RECORDED')}
              hitSlop={COMPACT_HIT_SLOP}
              accessibilityRole="tab"
              accessibilityLabel={`One-Time and Recorded expenses, ${allExpensesCount}`}
              accessibilityState={{ selected: activeTab === 'RECORDED' }}
              className={`flex-1 h-9 px-3 rounded-lg items-center justify-center ${
                activeTab === 'RECORDED'
                  ? 'bg-white dark:bg-slate-800 shadow-sm'
                  : 'active:opacity-75'
              }`}
            >
              <ThemedText
                className={`text-xs sm:text-sm font-bold text-center ${
                  activeTab === 'RECORDED'
                    ? 'text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                🧾 One-Time & Recorded ({allExpensesCount})
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => setActiveTab('SCHEDULED')}
              hitSlop={COMPACT_HIT_SLOP}
              accessibilityRole="tab"
              accessibilityLabel={`Recurring and Loans, ${scheduledStats.unpaidCount} due`}
              accessibilityState={{ selected: activeTab === 'SCHEDULED' }}
              className={`flex-1 h-9 px-3 rounded-lg items-center justify-center ${
                activeTab === 'SCHEDULED'
                  ? 'bg-white dark:bg-slate-800 shadow-sm'
                  : 'active:opacity-75'
              }`}
            >
              <ThemedText
                className={`text-xs sm:text-sm font-bold text-center ${
                  activeTab === 'SCHEDULED'
                    ? 'text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                🔄 Recurring & Loans ({scheduledStats.unpaidCount} due)
              </ThemedText>
            </Pressable>
          </View>

          {/* Toast Feedback Banner */}
          {toastMessage ? (
            <View className="px-4 py-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 flex-row items-center justify-between gap-2">
              <ThemedText className="flex-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                {toastMessage}
              </ThemedText>
              <Pressable
                onPress={() => setToastMessage(null)}
                accessibilityRole="button"
                accessibilityLabel="Dismiss notification"
                className="min-w-[44px] min-h-[44px] items-center justify-center active:opacity-75"
              >
                <ThemedText className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  ✕
                </ThemedText>
              </Pressable>
            </View>
          ) : null}

          {/* Action Error Banner */}
          {actionError ? (
            <View
              accessibilityRole="alert"
              className="px-4 py-3 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/70 flex-row items-center justify-between gap-2"
            >
              <ThemedText className="flex-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
                ⚠️ {actionError}
              </ThemedText>
              <Pressable
                onPress={() => setActionError(null)}
                accessibilityRole="button"
                accessibilityLabel="Dismiss error"
                className="min-w-[44px] min-h-[44px] items-center justify-center active:opacity-75"
              >
                <ThemedText className="text-xs font-bold text-rose-600 dark:text-rose-400">
                  ✕
                </ThemedText>
              </Pressable>
            </View>
          ) : null}

          {/* Loading / Error / Content */}
          {isLoading ? (
            <View className="py-12 items-center justify-center gap-3">
              <ActivityIndicator size="large" color={theme.text} />
              <ThemedText className="text-sm text-slate-500 dark:text-slate-400">
                Loading your expenses...
              </ThemedText>
            </View>
          ) : isError ? (
            <View className="p-6 rounded-3xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 items-center gap-3">
              <ThemedText
                accessibilityRole="alert"
                className="text-sm font-semibold text-rose-600 dark:text-rose-400 text-center"
              >
                Could not load your expenses right now.
              </ThemedText>
              <Pressable
                onPress={() => {
                  transactionsQuery.refetch();
                  accountsQuery.refetch();
                  categoriesQuery.refetch();
                  commitmentsQuery.refetch();
                }}
                accessibilityRole="button"
                accessibilityLabel="Retry loading expenses"
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-rose-600 active:bg-rose-700 items-center justify-center"
              >
                <ThemedText className="text-xs font-bold text-white">Retry</ThemedText>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Unified Stats for BOTH One-Time & Recorded AND Recurring & Loans */}
              <View className="gap-3">
                {/* Combined Monthly Outflow Banner */}
                <View className="p-4 rounded-2xl bg-slate-900 dark:bg-slate-900 border border-slate-800 shadow-sm flex-row flex-wrap items-center justify-between gap-3">
                  <View className="gap-1 flex-1 min-w-[220px]">
                    <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Combined Monthly Outflow ({monthName.toUpperCase()})
                    </ThemedText>
                    <ThemedText className="text-2xl font-extrabold font-mono text-white">
                      {formatMinorUnits(projectedMonthlyOutflowMinor)}
                    </ThemedText>
                  </View>
                  <View className="gap-1">
                    <ThemedText className="text-xs font-medium text-slate-300">
                      Recorded this month: {formatMinorUnits(thisMonthSpentMinor)}
                    </ThemedText>
                    <ThemedText className="text-xs font-medium text-slate-400">
                      Unpaid scheduled: {formatMinorUnits(scheduledStats.unpaidMinor)} • Paid scheduled:{' '}
                      {scheduledStats.paidCount}/{scheduledStats.activeCount}
                    </ThemedText>
                  </View>
                </View>

                {/* 4-Card Unified KPI Grid */}
                <View className="flex-row flex-wrap gap-3">
                  <View className="flex-1 min-w-[160px] p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm gap-1">
                    <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      One-Time & Recorded ({activePeriodLabel})
                    </ThemedText>
                    <ThemedText className="text-xl font-extrabold font-mono text-slate-900 dark:text-white">
                      {formatMinorUnits(summary.totalMinor)}
                    </ThemedText>
                    <ThemedText className="text-xs text-slate-500 dark:text-slate-400" numberOfLines={1}>
                      {summary.expenseCount}{' '}
                      {summary.expenseCount === 1 ? 'expense' : 'expenses'} •{' '}
                      {summary.topCategory
                        ? `Top: ${summary.topCategory.icon} ${summary.topCategory.name}`
                        : `Avg ${formatMinorUnits(summary.averageMinor)}`}
                    </ThemedText>
                  </View>

                  <View className="flex-1 min-w-[160px] p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm gap-1">
                    <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Monthly Budget
                    </ThemedText>
                    <ThemedText
                      className={`text-xl font-extrabold font-mono ${
                        isOverBudget
                          ? 'text-rose-600 dark:text-rose-400'
                          : isNearBudget
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {formatMinorUnits(Math.abs(budgetRemainingMinor))}{' '}
                      {isOverBudget ? 'over' : 'left'}
                    </ThemedText>
                    <ThemedText className="text-xs text-slate-500 dark:text-slate-400">
                      {budgetUtilizationPercent}% of {formatMinorUnits(monthlyBudgetMinor)} used
                    </ThemedText>
                  </View>

                  <View className="flex-1 min-w-[160px] p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm gap-1">
                    <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Monthly Scheduled
                    </ThemedText>
                    <ThemedText className="text-xl font-extrabold font-mono text-slate-900 dark:text-white">
                      {formatMinorUnits(scheduledStats.monthlyScheduledMinor)}
                    </ThemedText>
                    <ThemedText className="text-xs text-slate-500 dark:text-slate-400" numberOfLines={1}>
                      {scheduledStats.activeCount} active • Unpaid:{' '}
                      {formatMinorUnits(scheduledStats.unpaidMinor)} ({scheduledStats.unpaidCount})
                    </ThemedText>
                  </View>

                  <View className="flex-1 min-w-[160px] p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm gap-1">
                    <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Termed Balance Remaining
                    </ThemedText>
                    <ThemedText className="text-xl font-extrabold font-mono text-slate-900 dark:text-white">
                      {formatMinorUnits(scheduledStats.loansRemainingMinor)}
                    </ThemedText>
                    <ThemedText className="text-xs text-slate-500 dark:text-slate-400" numberOfLines={1}>
                      {scheduledStats.activeLoansCount === 0
                        ? 'No active term schedules'
                        : `${scheduledStats.activeLoansCount} termed • ${scheduledStats.remainingTermsTotal} remaining ${
                            scheduledStats.remainingTermsTotal === 1 ? 'term' : 'terms'
                          }`}
                    </ThemedText>
                  </View>
                </View>
              </View>

              {/* Primary Filter Row + Search */}
              <View className="gap-2.5">
                <View className="flex-row flex-wrap items-center gap-1.5">
                  {activeTab === 'RECORDED'
                    ? PERIOD_OPTIONS.map((option) => {
                        const isSelected = period === option.key;
                        return (
                          <Pressable
                            key={option.key}
                            onPress={() => setPeriod(option.key)}
                            hitSlop={COMPACT_HIT_SLOP}
                            accessibilityRole="button"
                            accessibilityLabel={`Filter period ${option.label}`}
                            accessibilityState={{ selected: isSelected }}
                            className={`h-8 px-3 rounded-full border items-center justify-center ${
                              isSelected
                                ? 'bg-slate-900 dark:bg-white border-slate-900 dark:border-white'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 active:opacity-75'
                            }`}
                          >
                            <ThemedText
                              className={`text-xs font-bold ${
                                isSelected
                                  ? 'text-white dark:text-slate-900'
                                  : 'text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              {option.label}
                            </ThemedText>
                          </Pressable>
                        );
                      })
                    : SCHEDULED_STATUS_OPTIONS.map((option) => {
                        const isSelected = scheduledStatus === option.key;
                        return (
                          <Pressable
                            key={option.key}
                            onPress={() => setScheduledStatus(option.key)}
                            hitSlop={COMPACT_HIT_SLOP}
                            accessibilityRole="button"
                            accessibilityLabel={`Filter schedules ${option.label}`}
                            accessibilityState={{ selected: isSelected }}
                            className={`h-8 px-3 rounded-full border items-center justify-center ${
                              isSelected
                                ? 'bg-slate-900 dark:bg-white border-slate-900 dark:border-white'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 active:opacity-75'
                            }`}
                          >
                            <ThemedText
                              className={`text-xs font-bold ${
                                isSelected
                                  ? 'text-white dark:text-slate-900'
                                  : 'text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              {option.label}
                            </ThemedText>
                          </Pressable>
                        );
                      })}
                </View>

                <View className="h-10 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex-row items-center gap-2">
                  <ThemedText className="text-sm text-slate-400">🔍</ThemedText>
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder={
                      activeTab === 'RECORDED'
                        ? 'Search merchant, note, #tag, category, or account...'
                        : 'Search schedule name, note, category, or account...'
                    }
                    placeholderTextColor={theme.textSecondary}
                    accessibilityLabel="Search expenses"
                    className="flex-1 h-10 text-sm text-slate-900 dark:text-slate-100"
                  />
                  {searchQuery.length > 0 && (
                    <Pressable
                      onPress={() => setSearchQuery('')}
                      hitSlop={COMPACT_HIT_SLOP}
                      accessibilityRole="button"
                      accessibilityLabel="Clear search"
                      className="h-8 w-8 items-center justify-center active:opacity-75"
                    >
                      <ThemedText className="text-xs font-bold text-slate-500 dark:text-slate-400">
                        ✕
                      </ThemedText>
                    </Pressable>
                  )}
                </View>

                {/* 8 Category Filter Pills */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerClassName="gap-1.5 py-0.5"
                >
                  <Pressable
                    onPress={() => setCategoryFilter('ALL')}
                    hitSlop={COMPACT_HIT_SLOP}
                    accessibilityRole="button"
                    accessibilityLabel={`Filter all categories, ${categoryPillTotalCount} items`}
                    accessibilityState={{ selected: categoryFilter === 'ALL' }}
                    className={`h-8 px-3 rounded-full flex-row items-center justify-center gap-1 border ${
                      categoryFilter === 'ALL'
                        ? 'bg-brand-500 border-brand-600 shadow-sm'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 active:opacity-75'
                    }`}
                  >
                    {categoryFilter === 'ALL' && (
                      <ThemedText className="text-xs font-extrabold text-white">✓</ThemedText>
                    )}
                    <ThemedText
                      className={`text-xs font-bold ${
                        categoryFilter === 'ALL'
                          ? 'text-white'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      All ({categoryPillTotalCount})
                    </ThemedText>
                  </Pressable>

                  {expenseCategories.map((cat) => {
                    const isSelected = categoryFilter === cat.id;
                    const count =
                      activeTab === 'RECORDED'
                        ? periodAndAccountSummary.categoryCounts[cat.id] ?? 0
                        : scheduledCategoryCounts[cat.id] ?? 0;

                    return (
                      <Pressable
                        key={cat.id}
                        onPress={() => setCategoryFilter(cat.id)}
                        hitSlop={COMPACT_HIT_SLOP}
                        accessibilityRole="button"
                        accessibilityLabel={`Filter ${cat.name}, ${count} items`}
                        accessibilityState={{ selected: isSelected }}
                        className={`h-8 px-3 rounded-full flex-row items-center justify-center gap-1 border ${
                          isSelected
                            ? 'bg-brand-500 border-brand-600 shadow-sm'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 active:opacity-75'
                        }`}
                      >
                        {isSelected && (
                          <ThemedText className="text-xs font-extrabold text-white">
                            ✓
                          </ThemedText>
                        )}
                        <ThemedText
                          className={`text-xs font-bold ${
                            isSelected ? 'text-white' : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {cat.icon} {cat.name} ({count})
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* List / Table Section */}
              <View className="gap-3">
                <View className="flex-row flex-wrap items-center justify-between gap-2">
                  <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {listTitle} (
                    {activeTab === 'RECORDED'
                      ? filteredExpenses.length
                      : filteredCommitments.length}
                    )
                  </ThemedText>

                  <View className="flex-row flex-wrap items-center gap-2">
                    {/* Cards / Table Switcher */}
                    <View className="p-0.5 rounded-lg bg-slate-200/80 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex-row items-center gap-0.5">
                      <Pressable
                        onPress={() => setDisplayMode('CARDS')}
                        hitSlop={COMPACT_HIT_SLOP}
                        accessibilityRole="button"
                        accessibilityLabel="Display as cards"
                        accessibilityState={{ selected: displayMode === 'CARDS' }}
                        className={`h-7 px-2.5 rounded-md items-center justify-center ${
                          displayMode === 'CARDS'
                            ? 'bg-white dark:bg-slate-900 shadow-sm'
                            : 'active:opacity-75'
                        }`}
                      >
                        <ThemedText
                          className={`text-xs font-bold ${
                            displayMode === 'CARDS'
                              ? 'text-slate-900 dark:text-white'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          Cards
                        </ThemedText>
                      </Pressable>

                      <Pressable
                        onPress={() => setDisplayMode('TABLE')}
                        hitSlop={COMPACT_HIT_SLOP}
                        accessibilityRole="button"
                        accessibilityLabel="Display as table"
                        accessibilityState={{ selected: displayMode === 'TABLE' }}
                        className={`h-7 px-2.5 rounded-md items-center justify-center ${
                          displayMode === 'TABLE'
                            ? 'bg-white dark:bg-slate-900 shadow-sm'
                            : 'active:opacity-75'
                        }`}
                      >
                        <ThemedText
                          className={`text-xs font-bold ${
                            displayMode === 'TABLE'
                              ? 'text-slate-900 dark:text-white'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          Table
                        </ThemedText>
                      </Pressable>
                    </View>

                    {/* 2-Column / 3-Column Card Grid Switcher (Desktop) */}
                    {displayMode === 'CARDS' && canChooseThreeColumns && (
                      <View className="p-0.5 rounded-lg bg-slate-200/80 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex-row items-center gap-0.5">
                        {([2, 3] as const).map((cols) => {
                          const isSelected = cardColumnsPref === cols;
                          return (
                            <Pressable
                              key={cols}
                              onPress={() => setCardColumnsPref(cols)}
                              hitSlop={COMPACT_HIT_SLOP}
                              accessibilityRole="button"
                              accessibilityLabel={`${cols} column cards`}
                              accessibilityState={{ selected: isSelected }}
                              className={`h-7 px-2.5 rounded-md items-center justify-center ${
                                isSelected
                                  ? 'bg-white dark:bg-slate-900 shadow-sm'
                                  : 'active:opacity-75'
                              }`}
                            >
                              <ThemedText
                                className={`text-xs font-bold ${
                                  isSelected
                                    ? 'text-slate-900 dark:text-white'
                                    : 'text-slate-600 dark:text-slate-400'
                                }`}
                              >
                                {cols} Col
                              </ThemedText>
                            </Pressable>
                          );
                        })}
                      </View>
                    )}

                    {/* Collapsible Inline Quick Form Toggle */}
                    <Pressable
                      onPress={() => setShowInlineForm((prev) => !prev)}
                      hitSlop={COMPACT_HIT_SLOP}
                      accessibilityRole="button"
                      accessibilityLabel="Toggle quick expense form"
                      accessibilityState={{ selected: showInlineForm }}
                      className={`h-8 px-2.5 rounded-lg border items-center justify-center ${
                        showInlineForm
                          ? 'bg-brand-50 dark:bg-brand-900/40 border-brand-500'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 active:opacity-75'
                      }`}
                    >
                      <ThemedText
                        className={`text-xs font-bold ${
                          showInlineForm
                            ? 'text-brand-700 dark:text-brand-300'
                            : 'text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        📝 Quick Form
                      </ThemedText>
                    </Pressable>

                    {hasActiveFilters && (
                      <Pressable
                        onPress={handleResetFilters}
                        hitSlop={COMPACT_HIT_SLOP}
                        accessibilityRole="button"
                        accessibilityLabel="Clear filters"
                        className="h-8 px-2 items-center justify-center active:opacity-75"
                      >
                        <ThemedText className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                          Clear filters
                        </ThemedText>
                      </Pressable>
                    )}

                    <Pressable
                      onPress={openAddModal}
                      hitSlop={COMPACT_HIT_SLOP}
                      accessibilityRole="button"
                      accessibilityLabel="Add new expense"
                      className="h-8 px-2 items-center justify-center active:opacity-75"
                    >
                      <ThemedText className="text-xs font-semibold text-brand-500 dark:text-brand-400">
                        {activeTab === 'SCHEDULED' ? '+ New Schedule' : '+ New Expense'}
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>

                {/* Collapsible Inline Quick Form */}
                {showInlineForm && (
                  <InlineExpenseForm
                    activeTab={activeTab}
                    accounts={accounts}
                    expenseCategories={expenseCategories}
                    defaultAccountId={defaultModalAccountId}
                    defaultCategoryId={defaultModalCategoryId}
                    onSaveExpense={handleSaveExpense}
                    onSaveCommitment={handleSaveCommitment}
                    onClose={() => setShowInlineForm(false)}
                    isSaving={
                      createTransactionMutation.isPending ||
                      upsertCommitmentMutation.isPending
                    }
                  />
                )}

                {activeTab === 'RECORDED' ? (
                  filteredExpenses.length === 0 ? (
                    <View className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 items-center gap-3">
                      <ThemedText className="text-3xl">🧾</ThemedText>
                      <ThemedText className="text-base font-bold text-slate-800 dark:text-slate-100 text-center">
                        {allExpensesCount === 0
                          ? 'No expenses added yet'
                          : 'No matching expenses'}
                      </ThemedText>
                      <ThemedText className="text-xs text-slate-500 dark:text-slate-400 text-center max-w-[300px]">
                        {allExpensesCount === 0
                          ? 'Tap below to log your first expense and keep your balances up to date.'
                          : 'Try adjusting your period, category, account, or search query.'}
                      </ThemedText>
                      <View className="flex-row flex-wrap items-center justify-center gap-2 pt-1">
                        {allExpensesCount > 0 && hasActiveFilters && (
                          <Pressable
                            onPress={handleResetFilters}
                            accessibilityRole="button"
                            accessibilityLabel="Reset filters"
                            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 items-center justify-center active:opacity-75"
                          >
                            <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-200">
                              Reset Filters
                            </ThemedText>
                          </Pressable>
                        )}
                        <Pressable
                          onPress={openAddModal}
                          accessibilityRole="button"
                          accessibilityLabel="Add expense"
                          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-brand-500 active:bg-brand-600 items-center justify-center"
                        >
                          <ThemedText className="text-xs font-bold text-white">
                            + Add Expense
                          </ThemedText>
                        </Pressable>
                      </View>
                    </View>
                  ) : displayMode === 'TABLE' ? (
                    <RecordedExpensesTable
                      expenses={filteredExpenses}
                      categories={allCategories}
                      accounts={accounts}
                      onEdit={openEditExpenseModal}
                      onDelete={handleDeleteExpenseFromCard}
                      isDeleting={deleteTransactionMutation.isPending}
                    />
                  ) : (
                    <View className="gap-3">
                      {expenseCardRows.map((row, rowIndex) => (
                        <View
                          key={`expense-row-${rowIndex}`}
                          className="flex-row items-stretch gap-3"
                        >
                          {row.map((expense) => (
                            <View key={expense.id} className="flex-1 min-w-0">
                              <ExpenseCard
                                expense={expense}
                                categories={allCategories}
                                accounts={accounts}
                                onEdit={openEditExpenseModal}
                                onDelete={handleDeleteExpenseFromCard}
                                isDeleting={deleteTransactionMutation.isPending}
                              />
                            </View>
                          ))}
                          {Array.from({
                            length: effectiveCardColumns - row.length,
                          }).map((_, spacerIndex) => (
                            <View
                              key={`expense-spacer-${rowIndex}-${spacerIndex}`}
                              className="flex-1 min-w-0"
                            />
                          ))}
                        </View>
                      ))}
                    </View>
                  )
                ) : filteredCommitments.length === 0 ? (
                  <View className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 items-center gap-3">
                    <ThemedText className="text-3xl">🔄</ThemedText>
                    <ThemedText className="text-base font-bold text-slate-800 dark:text-slate-100 text-center">
                      {commitments.length === 0
                        ? 'No recurring expenses or loans yet'
                        : 'No matching schedules'}
                    </ThemedText>
                    <ThemedText className="text-xs text-slate-500 dark:text-slate-400 text-center max-w-[320px]">
                      {commitments.length === 0
                        ? 'Add recurring dues, subscriptions, or installment loans to track due dates and deduct payments automatically.'
                        : 'Try adjusting your status, category, account, or search filter.'}
                    </ThemedText>
                    <View className="flex-row flex-wrap items-center justify-center gap-2 pt-1">
                      {commitments.length > 0 && hasActiveFilters && (
                        <Pressable
                          onPress={handleResetFilters}
                          accessibilityRole="button"
                          accessibilityLabel="Reset filters"
                          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 items-center justify-center active:opacity-75"
                        >
                          <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-200">
                            Reset Filters
                          </ThemedText>
                        </Pressable>
                      )}
                      <Pressable
                        onPress={openAddModal}
                        accessibilityRole="button"
                        accessibilityLabel="Add recurring expense or loan"
                        className="min-h-[44px] px-4 py-2.5 rounded-xl bg-brand-500 active:bg-brand-600 items-center justify-center"
                      >
                        <ThemedText className="text-xs font-bold text-white">
                          + Add Schedule / Loan
                        </ThemedText>
                      </Pressable>
                    </View>
                  </View>
                ) : displayMode === 'TABLE' ? (
                  <ScheduledExpensesTable
                    commitments={filteredCommitments}
                    categories={allCategories}
                    accounts={accounts}
                    currentPeriod={currentPeriod}
                    currentDay={currentDay}
                    monthName={monthName}
                    onPay={handlePayCommitment}
                    onUnpay={handleUnpayCommitment}
                    onEdit={openEditCommitmentModal}
                    onDelete={handleDeleteCommitmentFromCard}
                    isBusy={isScheduledActionBusy}
                  />
                ) : (
                  <View className="gap-3">
                    {commitmentCardRows.map((row, rowIndex) => (
                      <View
                        key={`schedule-row-${rowIndex}`}
                        className="flex-row items-stretch gap-3"
                      >
                        {row.map((commitment) => (
                          <View key={commitment.id} className="flex-1 min-w-0">
                            <ScheduledExpenseCard
                              commitment={commitment}
                              categories={allCategories}
                              accounts={accounts}
                              currentPeriod={currentPeriod}
                              currentDay={currentDay}
                              monthName={monthName}
                              onPay={handlePayCommitment}
                              onUnpay={handleUnpayCommitment}
                              onEdit={openEditCommitmentModal}
                              onDelete={handleDeleteCommitmentFromCard}
                              isBusy={isScheduledActionBusy}
                            />
                          </View>
                        ))}
                        {Array.from({
                          length: effectiveCardColumns - row.length,
                        }).map((_, spacerIndex) => (
                          <View
                            key={`schedule-spacer-${rowIndex}-${spacerIndex}`}
                            className="flex-1 min-w-0"
                          />
                        ))}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </>
          )}
        </ScrollView>

        {/* Sibling Modals (never nested, safe on iOS & Web) */}
        <ExpenseFormModal
          visible={modalVisible && !isSplitModalOpen}
          formSessionKey={formSessionKey}
          initialMode={initialFormMode}
          editingExpense={editingExpense}
          editingCommitment={editingCommitment}
          accounts={accounts}
          expenseCategories={expenseCategories}
          presets={quickPresets}
          recentMerchants={smartDefaults?.recentMerchants ?? []}
          knownTags={smartDefaults?.knownTags ?? []}
          defaultAccountId={defaultModalAccountId}
          defaultCategoryId={defaultModalCategoryId}
          draftSplits={draftSplits}
          onChangeDraftSplits={setDraftSplits}
          onOpenSplitEditor={handleOpenSplitEditor}
          onCreateCategory={handleCreateCustomCategory}
          onSave={handleSaveExpense}
          onDelete={handleDeleteExpenseFromModal}
          onSaveCommitment={handleSaveCommitment}
          onDeleteCommitment={handleDeleteCommitmentFromModal}
          onClose={handleCloseModal}
          isSaving={
            createTransactionMutation.isPending ||
            updateTransactionMutation.isPending ||
            upsertCommitmentMutation.isPending
          }
          isDeleting={
            deleteTransactionMutation.isPending || deleteCommitmentMutation.isPending
          }
          externalAmountSync={externalAmountSync}
          onClearExternalAmountSync={handleClearExternalAmountSync}
        />

        <SplitEditorModal
          visible={isSplitModalOpen}
          totalAmountMinor={splitTotalMinor}
          currency={modalCurrency}
          categories={expenseCategories}
          initialCategoryId={splitInitialCategoryId}
          initialSplits={draftSplits}
          onClose={() => setIsSplitModalOpen(false)}
          onApplySplits={(newSplits, updatedTotalMinor) => {
            setDraftSplits(newSplits);
            if (typeof updatedTotalMinor === 'number' && updatedTotalMinor > 0) {
              setExternalAmountSync(minorUnitsToDecimalInput(updatedTotalMinor));
            }
            setIsSplitModalOpen(false);
          }}
          onClearSplits={() => {
            setDraftSplits([]);
            setIsSplitModalOpen(false);
          }}
        />
      </SafeAreaView>
    </View>
  );
}
