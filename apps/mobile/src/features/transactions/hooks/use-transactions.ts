import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  computeDashboardMetrics,
  rankCategoriesByFrequency,
  type ApplyReconciliationInput,
  type CategoryBudget,
  type CategoryType,
  type CreateCategoryInput,
  type CreateTransactionInput,
  type DashboardMetrics,
  type DashboardPeriod,
  type RecurringCommitmentInput,
  type SinkingFund,
  type UpdateTransactionInput,
  type UpsertAccountInput,
} from '@repo/contracts';
import {
  applyReconciliation,
  clearAllTransactions,
  contributeToSinkingFund,
  createCustomCategory,
  createTransaction,
  createTransactionsBatch,
  deleteAccount,
  deleteCategoryBudget,
  deleteRecurringCommitment,
  deleteSinkingFund,
  deleteTransaction,
  exportBackupEnvelope,
  getAccounts,
  getCategories,
  getCategoryBudgets,
  getReconciliations,
  getRecurringCommitments,
  getSafeToSpendMetrics,
  getSinkingFunds,
  getSmartDefaults,
  getTransactions,
  importBackupEnvelope,
  payRecurringCommitment,
  resetLocalStore,
  unpayRecurringCommitment,
  updateMonthlyBudget,
  updateTransaction,
  upsertAccount,
  upsertCategoryBudget,
  upsertRecurringCommitment,
  upsertSinkingFund,
} from '../api';

export const TRANSACTION_KEYS = {
  all: ['transactions-domain'] as const,
  accounts: ['transactions-domain', 'accounts'] as const,
  categories: ['transactions-domain', 'categories'] as const,
  smartDefaults: ['transactions-domain', 'smart-defaults'] as const,
  list: ['transactions-domain', 'list'] as const,
  categoryBudgets: (periodMonth: string) =>
    ['transactions-domain', 'category-budgets', periodMonth] as const,
  allCategoryBudgets: ['transactions-domain', 'category-budgets'] as const,
  recurringCommitments: ['transactions-domain', 'recurring-commitments'] as const,
  sinkingFunds: ['transactions-domain', 'sinking-funds'] as const,
  safeToSpend: (dateIso?: string) =>
    ['transactions-domain', 'safe-to-spend', dateIso ?? 'current'] as const,
  reconciliations: ['transactions-domain', 'reconciliations'] as const,
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
// Envelope Budgets Hooks
// ==========================================

export function useCategoryBudgets(periodMonth: string) {
  return useQuery({
    queryKey: TRANSACTION_KEYS.categoryBudgets(periodMonth),
    queryFn: () => getCategoryBudgets(periodMonth),
  });
}

export function useUpsertCategoryBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (budget: Omit<CategoryBudget, 'id'> & { id?: string }) =>
      upsertCategoryBudget(budget),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

export function useDeleteCategoryBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteCategoryBudget(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

// ==========================================
// Recurring Commitments Hooks
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
    mutationFn: (params: { commitmentId: string; paidAtIso?: string; accountId?: string }) =>
      payRecurringCommitment(params),
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

// ==========================================
// Sinking Funds Hooks
// ==========================================

export function useSinkingFunds() {
  return useQuery({
    queryKey: TRANSACTION_KEYS.sinkingFunds,
    queryFn: getSinkingFunds,
  });
}

export function useUpsertSinkingFund() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Omit<SinkingFund, 'id'> & { id?: string }) => upsertSinkingFund(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

export function useContributeToSinkingFund() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      fundId,
      amountMinor,
      sourceAccountId,
    }: {
      fundId: string;
      amountMinor: number;
      sourceAccountId: string;
    }) => contributeToSinkingFund(fundId, amountMinor, sourceAccountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

export function useDeleteSinkingFund() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteSinkingFund(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

// ==========================================
// Balance Reconciliation Hooks
// ==========================================

export function useApplyReconciliation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ApplyReconciliationInput) => applyReconciliation(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

export function useReconciliations(accountId?: string) {
  return useQuery({
    queryKey: accountId
      ? ([...TRANSACTION_KEYS.reconciliations, accountId] as const)
      : TRANSACTION_KEYS.reconciliations,
    queryFn: () => getReconciliations(accountId),
  });
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
