import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  computeDashboardMetrics,
  rankCategoriesByFrequency,
  type ApplyReconciliationInput,
  type CategoryBudget,
  type CategoryType,
  type CreateCategoryInput,
  type CreateTransactionInput,
  type CreateWalletInput,
  type DashboardMetrics,
  type DashboardPeriod,
  type QuickPreset,
  type RecurringCommitment,
  type SinkingFund,
  type UpdateTransactionInput,
  type UpdateWalletInput,
} from '@repo/contracts';
import {
  applyReconciliation,
  clearAllTransactions,
  contributeToSinkingFund,
  createCustomCategory,
  createTransaction,
  createTransactionsBatch,
  createWallet,
  deleteCategoryBudget,
  deleteQuickPreset,
  deleteRecurringCommitment,
  deleteSinkingFund,
  deleteTransaction,
  deleteWallet,
  exportBackupEnvelope,
  getCategories,
  getCategoryBudgets,
  getQuickPresets,
  getReconciliations,
  getRecurringCommitments,
  getSafeToSpendMetrics,
  getSinkingFunds,
  getSmartDefaults,
  getTransactions,
  getWallets,
  importBackupEnvelope,
  resetLocalStore,
  settleRecurringCommitment,
  unmarkRecurringCommitmentPaid,
  updateMonthlyBudget,
  updateTransaction,
  updateWallet,
  upsertCategoryBudget,
  upsertQuickPreset,
  upsertRecurringCommitment,
  upsertSinkingFund,
} from '../api';
import { useAuth } from '@/features/auth/context/auth-context';

export const TRANSACTION_KEYS = {
  all: ['transactions-domain'] as const,
  wallets: ['transactions-domain', 'wallets'] as const,
  categories: ['transactions-domain', 'categories'] as const,
  smartDefaults: ['transactions-domain', 'smart-defaults'] as const,
  list: ['transactions-domain', 'list'] as const,
  categoryBudgets: (periodMonth: string) =>
    ['transactions-domain', 'category-budgets', periodMonth] as const,
  allCategoryBudgets: ['transactions-domain', 'category-budgets'] as const,
  recurringCommitments: ['transactions-domain', 'recurring-commitments'] as const,
  sinkingFunds: ['transactions-domain', 'sinking-funds'] as const,
  quickPresets: ['transactions-domain', 'quick-presets'] as const,
  safeToSpend: (dateIso?: string) =>
    ['transactions-domain', 'safe-to-spend', dateIso ?? 'current'] as const,
  reconciliations: ['transactions-domain', 'reconciliations'] as const,
};

// ==========================================
// Base Queries & Mutations
// ==========================================

export function useWallets() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: TRANSACTION_KEYS.wallets,
    queryFn: getWallets,
    enabled: isAuthenticated,
  });
}

export function useCategories(type: CategoryType = 'EXPENSE', pinnedLimit = 8) {
  const { isAuthenticated } = useAuth();
  const query = useQuery({
    queryKey: TRANSACTION_KEYS.categories,
    queryFn: getCategories,
    enabled: isAuthenticated,
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
  const { isAuthenticated } = useAuth();
  const query = useQuery({
    queryKey: TRANSACTION_KEYS.categories,
    queryFn: getCategories,
    enabled: isAuthenticated,
  });

  return {
    ...query,
    categories: query.data ?? [],
  };
}

export function useSmartDefaults() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: TRANSACTION_KEYS.smartDefaults,
    queryFn: getSmartDefaults,
    enabled: isAuthenticated,
  });
}

export function useTransactions() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: TRANSACTION_KEYS.list,
    queryFn: getTransactions,
    enabled: isAuthenticated,
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

export function useUpdateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTransactionInput }) =>
      updateTransaction(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

export function useCreateWallet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateWalletInput) => createWallet(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

export function useUpdateWallet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateWalletInput }) =>
      updateWallet(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

export function useDeleteWallet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteWallet(id),
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

export function useCreateCustomCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCategoryInput) => createCustomCategory(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.categories });
    },
  });
}

export function useDashboardMetrics(
  period: DashboardPeriod = 'THIS_MONTH',
  selectedMonth?: string,
) {
  const transactionsQuery = useTransactions();
  const walletsQuery = useWallets();
  const categoriesQuery = useAllCategories();
  const smartDefaultsQuery = useSmartDefaults();

  const metrics: DashboardMetrics = computeDashboardMetrics({
    transactions: transactionsQuery.data ?? [],
    wallets: walletsQuery.data ?? [],
    categories: categoriesQuery.categories,
    period,
    selectedMonth,
    monthlyBudgetMinor: smartDefaultsQuery.data?.monthlyBudgetMinor ?? 3000000,
  });

  const refetch = async () => {
    await Promise.all([
      transactionsQuery.refetch(),
      walletsQuery.refetch(),
      categoriesQuery.refetch(),
      smartDefaultsQuery.refetch(),
    ]);
  };

  return {
    metrics,
    wallets: walletsQuery.data ?? [],
    categories: categoriesQuery.categories,
    isLoading: transactionsQuery.isLoading || walletsQuery.isLoading,
    isError:
      transactionsQuery.isError ||
      walletsQuery.isError ||
      categoriesQuery.isError,
    refetch,
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
// Milestone 2: Envelope Budgets Hooks
// ==========================================

export function useCategoryBudgets(periodMonth: string) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: TRANSACTION_KEYS.categoryBudgets(periodMonth),
    queryFn: () => getCategoryBudgets(periodMonth),
    enabled: isAuthenticated,
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
// Milestone 2: Recurring Commitments Hooks
// ==========================================

export function useRecurringCommitments() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: TRANSACTION_KEYS.recurringCommitments,
    queryFn: getRecurringCommitments,
    enabled: isAuthenticated,
  });
}

export function useUpsertRecurringCommitment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Omit<RecurringCommitment, 'id'> & { id?: string }) =>
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

export function useSettleRecurringCommitment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      commitmentId,
      periodMonth,
      recordTransaction,
    }: {
      commitmentId: string;
      periodMonth: string;
      recordTransaction: boolean;
    }) =>
      settleRecurringCommitment(commitmentId, {
        periodMonth,
        recordTransaction,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

export function useUnmarkRecurringCommitmentPaid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (commitmentId: string) => unmarkRecurringCommitmentPaid(commitmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

// ==========================================
// Milestone 2: Sinking Funds Hooks
// ==========================================

export function useSinkingFunds() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: TRANSACTION_KEYS.sinkingFunds,
    queryFn: getSinkingFunds,
    enabled: isAuthenticated,
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
      sourceWalletId,
    }: {
      fundId: string;
      amountMinor: number;
      sourceWalletId: string;
    }) => contributeToSinkingFund(fundId, amountMinor, sourceWalletId),
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
// Milestone 2: Quick Presets Hooks
// ==========================================

export function useQuickPresets() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: TRANSACTION_KEYS.quickPresets,
    queryFn: getQuickPresets,
    enabled: isAuthenticated,
  });
}

export function useUpsertQuickPreset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Omit<QuickPreset, 'id'> & { id?: string }) => upsertQuickPreset(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

export function useDeleteQuickPreset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteQuickPreset(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

// ==========================================
// Milestone 2: Balance Reconciliation Hooks
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

export function useReconciliations(walletId?: string) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: walletId
      ? ([...TRANSACTION_KEYS.reconciliations, walletId] as const)
      : TRANSACTION_KEYS.reconciliations,
    queryFn: () => getReconciliations(walletId),
    enabled: isAuthenticated,
  });
}

// ==========================================
// Milestone 2: Safe-to-Spend Hooks
// ==========================================

export function useSafeToSpendMetrics(currentDate?: Date) {
  const { isAuthenticated } = useAuth();
  const dateIso = currentDate?.toISOString().slice(0, 10);
  return useQuery({
    queryKey: TRANSACTION_KEYS.safeToSpend(dateIso),
    queryFn: () => getSafeToSpendMetrics(currentDate),
    enabled: isAuthenticated,
  });
}

// ==========================================
// Milestone 2: Portability & Backup Hooks
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
