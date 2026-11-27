import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  computeDashboardMetrics,
  computeDebtOverview,
  computeMonthlySalaryPlan,
  getNextPayday,
  getNextPaydayHorizonDate,
  getUpcomingPaydays,
  rankCategoriesByFrequency,
  type CategoryType,
  type CreateCategoryInput,
  type CreateTransactionInput,
  type DashboardMetrics,
  type DashboardPeriod,
  type DebtOverview,
  type IncomeSourceInput,
  type MonthlySalaryPlan,
  type RecurringCommitmentInput,
  type SalaryPlanBasis,
  type UpcomingPayday,
  type UpdateTransactionInput,
  type UpsertAccountInput,
} from '@repo/contracts';
import {
  clearAllTransactions,
  createCustomCategory,
  createTransaction,
  createTransactionsBatch,
  deleteAccount,
  deleteIncomeSource,
  deleteRecurringCommitment,
  deleteTransaction,
  exportBackupEnvelope,
  getAccounts,
  getCategories,
  getIncomeSources,
  getRecurringCommitments,
  getSafeToSpendMetrics,
  getSmartDefaults,
  getTransactions,
  importBackupEnvelope,
  logPayday,
  payCreditCardBill,
  payRecurringCommitment,
  resetLocalStore,
  setAccountBalance,
  unpayRecurringCommitment,
  updateMonthlyBudget,
  updateTransaction,
  upsertAccount,
  upsertIncomeSource,
  upsertRecurringCommitment,
} from '../api';

export const TRANSACTION_KEYS = {
  all: ['transactions-domain'] as const,
  accounts: ['transactions-domain', 'accounts'] as const,
  categories: ['transactions-domain', 'categories'] as const,
  smartDefaults: ['transactions-domain', 'smart-defaults'] as const,
  list: ['transactions-domain', 'list'] as const,
  recurringCommitments: ['transactions-domain', 'recurring-commitments'] as const,
  incomeSources: ['transactions-domain', 'income-sources'] as const,
  safeToSpend: (dateIso?: string) =>
    ['transactions-domain', 'safe-to-spend', dateIso ?? 'current'] as const,
};

// ==========================================
// Base Queries & Mutations
// ==========================================

export function useAccounts() {
  return useQuery({
    queryKey: TRANSACTION_KEYS.accounts,
    queryFn: getAccounts,
  });
}

export function useUpsertAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpsertAccountInput) => upsertAccount(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

export function useSetAccountBalance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { accountId: string; balanceMinor: number }) =>
      setAccountBalance(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

export function useCategories(type: CategoryType = 'EXPENSE', pinnedLimit = 8) {
  const query = useQuery({
    queryKey: TRANSACTION_KEYS.categories,
    queryFn: getCategories,
  });

  const categories = query.data ?? [];
  const rankedCategories = rankCategoriesByFrequency(categories, type);
  const pinnedCategories = rankedCategories.slice(0, pinnedLimit);

  return {
    ...query,
    categories,
    rankedCategories,
    pinnedCategories,
  };
}

export function useAllCategories() {
  const query = useQuery({
    queryKey: TRANSACTION_KEYS.categories,
    queryFn: getCategories,
  });

  return {
    ...query,
    categories: query.data ?? [],
  };
}

export function useSmartDefaults() {
  return useQuery({
    queryKey: TRANSACTION_KEYS.smartDefaults,
    queryFn: getSmartDefaults,
  });
}

export function useTransactions() {
  return useQuery({
    queryKey: TRANSACTION_KEYS.list,
    queryFn: getTransactions,
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTransactionInput) => createTransaction(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

export function useBatchCreateTransactions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (inputs: CreateTransactionInput[]) => createTransactionsBatch(inputs),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (transactionId: string) => deleteTransaction(transactionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateTransactionInput) => updateTransaction(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

export function useCreateCustomCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCategoryInput) => createCustomCategory(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.categories });
    },
  });
}

export function useDashboardMetrics(period: DashboardPeriod = 'THIS_MONTH') {
  const transactionsQuery = useTransactions();
  const accountsQuery = useAccounts();
  const categoriesQuery = useAllCategories();
  const smartDefaultsQuery = useSmartDefaults();

  const metrics: DashboardMetrics = computeDashboardMetrics({
    transactions: transactionsQuery.data ?? [],
    accounts: accountsQuery.data ?? [],
    categories: categoriesQuery.categories,
    period,
    monthlyBudgetMinor: smartDefaultsQuery.data?.monthlyBudgetMinor ?? 250000,
  });

  return {
    metrics,
    accounts: accountsQuery.data ?? [],
    categories: categoriesQuery.categories,
    isLoading: transactionsQuery.isLoading || accountsQuery.isLoading,
    isError:
      transactionsQuery.isError ||
      accountsQuery.isError ||
      categoriesQuery.isError ||
      smartDefaultsQuery.isError,
    refetch: () =>
      Promise.all([
        transactionsQuery.refetch(),
        accountsQuery.refetch(),
        categoriesQuery.refetch(),
        smartDefaultsQuery.refetch(),
      ]),
  };
}

export function useUpdateMonthlyBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (newBudgetMinor: number) => updateMonthlyBudget(newBudgetMinor),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

export function useResetDemoData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => resetLocalStore(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

export function useClearAllTransactions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => clearAllTransactions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

// ==========================================
// Income Sources & Payday Hooks
// ==========================================

export function useIncomeSources() {
  return useQuery({
    queryKey: TRANSACTION_KEYS.incomeSources,
    queryFn: getIncomeSources,
  });
}

export function useUpsertIncomeSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Omit<IncomeSourceInput, 'id'> & { id?: string }) =>
      upsertIncomeSource(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

export function useDeleteIncomeSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteIncomeSource(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

export function useLogPayday() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      sourceId: string;
      amountMinor: number;
      accountId?: string;
      occurredAt?: string;
      note?: string;
    }) => logPayday(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

export function useUpcomingPaydays(count = 6) {
  const incomeSourcesQuery = useIncomeSources();
  const transactionsQuery = useTransactions();

  const paydays: UpcomingPayday[] = getUpcomingPaydays({
    sources: incomeSourcesQuery.data ?? [],
    transactions: transactionsQuery.data ?? [],
    count,
  });

  return {
    paydays,
    nextPayday: paydays[0] ?? null,
    sources: incomeSourcesQuery.data ?? [],
    isLoading: incomeSourcesQuery.isLoading || transactionsQuery.isLoading,
    isError: incomeSourcesQuery.isError || transactionsQuery.isError,
  };
}

export function useNextPayday(): {
  nextPayday: UpcomingPayday | null;
  horizonDate: string | null;
  isLoading: boolean;
} {
  const incomeSourcesQuery = useIncomeSources();
  const transactionsQuery = useTransactions();

  const sources = incomeSourcesQuery.data ?? [];
  const transactions = transactionsQuery.data ?? [];

  return {
    nextPayday: getNextPayday({ sources, transactions }),
    horizonDate: getNextPaydayHorizonDate({ sources, transactions }),
    isLoading: incomeSourcesQuery.isLoading || transactionsQuery.isLoading,
  };
}

export function useMonthlySalaryPlan(
  periodMonth: string,
  basis: SalaryPlanBasis = 'EXPECTED',
) {
  const incomeSourcesQuery = useIncomeSources();
  const transactionsQuery = useTransactions();
  const accountsQuery = useAccounts();
  const categoriesQuery = useAllCategories();
  const commitmentsQuery = useRecurringCommitments();
  const smartDefaultsQuery = useSmartDefaults();

  const plan: MonthlySalaryPlan = computeMonthlySalaryPlan({
    periodMonth,
    basis,
    incomeSources: incomeSourcesQuery.data ?? [],
    transactions: transactionsQuery.data ?? [],
    recurringCommitments: commitmentsQuery.data ?? [],
  });

  return {
    plan,
    accounts: accountsQuery.data ?? [],
    categories: categoriesQuery.categories,
    smartDefaults: smartDefaultsQuery.data,
    isLoading:
      incomeSourcesQuery.isLoading ||
      transactionsQuery.isLoading ||
      accountsQuery.isLoading ||
      commitmentsQuery.isLoading,
    isError:
      incomeSourcesQuery.isError ||
      transactionsQuery.isError ||
      accountsQuery.isError ||
      commitmentsQuery.isError,
    refetch: () =>
      Promise.all([
        incomeSourcesQuery.refetch(),
        transactionsQuery.refetch(),
        accountsQuery.refetch(),
        categoriesQuery.refetch(),
        commitmentsQuery.refetch(),
        smartDefaultsQuery.refetch(),
      ]),
  };
}

// ==========================================
// Debts & Obligations Hooks
// ==========================================

export function useRecurringCommitments() {
  return useQuery({
    queryKey: TRANSACTION_KEYS.recurringCommitments,
    queryFn: getRecurringCommitments,
  });
}

export function useUpsertRecurringCommitment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Omit<RecurringCommitmentInput, 'id'> & { id?: string }) =>
      upsertRecurringCommitment(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

export function useDeleteRecurringCommitment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteRecurringCommitment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

export function usePayRecurringCommitment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      commitmentId: string;
      paidAtIso?: string;
      accountId?: string;
      actualAmountMinor?: number;
    }) => payRecurringCommitment(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

export function useUnpayRecurringCommitment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (commitmentId: string) => unpayRecurringCommitment(commitmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

export function usePayCreditCardBill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      creditCardAccountId: string;
      paymentAccountId: string;
      paidAtIso?: string;
      amountOverrideMinor?: number;
    }) => payCreditCardBill(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

export function useDebtOverview(currentDate?: Date) {
  const accountsQuery = useAccounts();
  const commitmentsQuery = useRecurringCommitments();
  const incomeSourcesQuery = useIncomeSources();
  const transactionsQuery = useTransactions();

  const nextPaydayDate = getNextPaydayHorizonDate({
    sources: incomeSourcesQuery.data ?? [],
    transactions: transactionsQuery.data ?? [],
    fromDate: currentDate,
  });

  const overview: DebtOverview = computeDebtOverview({
    accounts: accountsQuery.data ?? [],
    commitments: commitmentsQuery.data ?? [],
    transactions: transactionsQuery.data ?? [],
    nextPaydayDate,
    currentDate,
  });

  return {
    overview,
    nextPaydayDate,
    accounts: accountsQuery.data ?? [],
    commitments: commitmentsQuery.data ?? [],
    isLoading:
      accountsQuery.isLoading ||
      commitmentsQuery.isLoading ||
      incomeSourcesQuery.isLoading,
    isError:
      accountsQuery.isError ||
      commitmentsQuery.isError ||
      incomeSourcesQuery.isError,
    refetch: () =>
      Promise.all([
        accountsQuery.refetch(),
        commitmentsQuery.refetch(),
        incomeSourcesQuery.refetch(),
        transactionsQuery.refetch(),
      ]),
  };
}

// ==========================================
// Safe-to-Spend Hooks
// ==========================================

export function useSafeToSpendMetrics(currentDate?: Date) {
  const dateIso = currentDate?.toISOString().slice(0, 10);
  return useQuery({
    queryKey: TRANSACTION_KEYS.safeToSpend(dateIso),
    queryFn: () => getSafeToSpendMetrics(currentDate),
  });
}

// ==========================================
// Portability & Backup Hooks
// ==========================================

export function useExportBackup() {
  return useMutation({
    mutationFn: () => exportBackupEnvelope(),
  });
}

export function useImportBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      rawEnvelope,
      mode,
    }: {
      rawEnvelope: unknown;
      mode: 'merge' | 'overwrite';
    }) => importBackupEnvelope(rawEnvelope, mode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}
