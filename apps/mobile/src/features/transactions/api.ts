import {
  applyReconciliationInputSchema,
  applyReconciliationResponseSchema,
  backupEnvelopeSchema,
  batchCreateTransactionsInputSchema,
  categoriesResponseSchema,
  categoryBudgetSchema,
  categoryBudgetsStatusResponseSchema,
  categorySchema,
  contributeSinkingFundInputSchema,
  contributeSinkingFundResponseSchema,
  createCategoryInputSchema,
  createTransactionInputSchema,
  createWalletInputSchema,
  importBackupInputSchema,
  importBackupResponseSchema,
  okResponseSchema,
  positiveAmountMinorSchema,
  quickPresetSchema,
  quickPresetsResponseSchema,
  reconciliationsResponseSchema,
  recurringCommitmentSchema,
  recurringCommitmentsResponseSchema,
  safeToSpendMetricsSchema,
  settleRecurringCommitmentInputSchema,
  settleRecurringCommitmentResponseSchema,
  sinkingFundSchema,
  sinkingFundsResponseSchema,
  smartDefaultsSchema,
  transactionSchema,
  transactionsResponseSchema,
  updateMonthlyBudgetInputSchema,
  updateTransactionInputSchema,
  updateWalletInputSchema,
  upsertCategoryBudgetInputSchema,
  upsertQuickPresetInputSchema,
  upsertRecurringCommitmentInputSchema,
  upsertSinkingFundInputSchema,
  walletSchema,
  walletsResponseSchema,
  type ApplyReconciliationInput,
  type BackupEnvelope,
  type BalanceReconciliation,
  type Category,
  type CategoryBudget,
  type CategoryBudgetStatus,
  type CreateCategoryInput,
  type CreateTransactionInput,
  type CreateWalletInput,
  type QuickPreset,
  type RecurringCommitment,
  type SafeToSpendMetrics,
  type SinkingFund,
  type SmartDefaults,
  type Transaction,
  type UpdateTransactionInput,
  type UpdateWalletInput,
  type Wallet,
} from '@repo/contracts';
import { apiFetch } from '@/common/lib/api-client';

function formatLocalYyyyMmDd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function getWallets(): Promise<Wallet[]> {
  return apiFetch('/v1/wallets', walletsResponseSchema);
}

export async function createWallet(input: CreateWalletInput): Promise<Wallet> {
  const parsed = createWalletInputSchema.parse(input);
  return apiFetch('/v1/wallets', walletSchema, {
    method: 'POST',
    body: JSON.stringify(parsed),
  });
}

export async function updateWallet(
  walletId: string,
  input: UpdateWalletInput,
): Promise<Wallet> {
  const parsed = updateWalletInputSchema.parse(input);
  return apiFetch(`/v1/wallets/${encodeURIComponent(walletId)}`, walletSchema, {
    method: 'PATCH',
    body: JSON.stringify(parsed),
  });
}

export async function deleteWallet(walletId: string): Promise<void> {
  await apiFetch(
    `/v1/wallets/${encodeURIComponent(walletId)}`,
    okResponseSchema,
    { method: 'DELETE' },
  );
}

export async function getCategories(): Promise<Category[]> {
  return apiFetch('/v1/categories', categoriesResponseSchema);
}

export async function createCustomCategory(
  input: CreateCategoryInput,
): Promise<Category> {
  const parsed = createCategoryInputSchema.parse(input);
  return apiFetch('/v1/categories', categorySchema, {
    method: 'POST',
    body: JSON.stringify(parsed),
  });
}

export async function getSmartDefaults(): Promise<SmartDefaults> {
  return apiFetch('/v1/settings', smartDefaultsSchema);
}

export async function updateMonthlyBudget(
  monthlyBudgetMinor: number,
): Promise<SmartDefaults> {
  const parsed = updateMonthlyBudgetInputSchema.parse({ monthlyBudgetMinor });
  return apiFetch('/v1/settings/monthly-budget', smartDefaultsSchema, {
    method: 'PATCH',
    body: JSON.stringify(parsed),
  });
}

export async function getTransactions(): Promise<Transaction[]> {
  return apiFetch('/v1/transactions', transactionsResponseSchema);
}

export async function createTransaction(
  input: CreateTransactionInput,
): Promise<Transaction> {
  const parsed = createTransactionInputSchema.parse(input);
  return apiFetch('/v1/transactions', transactionSchema, {
    method: 'POST',
    body: JSON.stringify(parsed),
  });
}

export async function createTransactionsBatch(
  inputs: CreateTransactionInput[],
): Promise<Transaction[]> {
  const parsed = batchCreateTransactionsInputSchema.parse({
    transactions: inputs,
  });
  return apiFetch('/v1/transactions/batch', transactionsResponseSchema, {
    method: 'POST',
    body: JSON.stringify(parsed),
  });
}

export async function updateTransaction(
  transactionId: string,
  input: UpdateTransactionInput,
): Promise<Transaction> {
  const parsed = updateTransactionInputSchema.parse(input);
  return apiFetch(
    `/v1/transactions/${encodeURIComponent(transactionId)}`,
    transactionSchema,
    {
      method: 'PUT',
      body: JSON.stringify(parsed),
    },
  );
}

export async function deleteTransaction(transactionId: string): Promise<void> {
  await apiFetch(
    `/v1/transactions/${encodeURIComponent(transactionId)}`,
    okResponseSchema,
    { method: 'DELETE' },
  );
}

export async function clearAllTransactions(): Promise<void> {
  await apiFetch('/v1/account/clear-transactions', okResponseSchema, {
    method: 'POST',
  });
}

export async function resetLocalStore(): Promise<void> {
  await apiFetch('/v1/account/reset-demo', okResponseSchema, {
    method: 'POST',
  });
}

export async function getCategoryBudgets(
  periodMonth: string,
): Promise<CategoryBudgetStatus[]> {
  return apiFetch(
    `/v1/category-budgets?periodMonth=${encodeURIComponent(periodMonth)}`,
    categoryBudgetsStatusResponseSchema,
  );
}

export async function upsertCategoryBudget(
  budget: Omit<CategoryBudget, 'id'> & { id?: string },
): Promise<CategoryBudget> {
  const parsed = upsertCategoryBudgetInputSchema.parse(budget);
  return apiFetch('/v1/category-budgets', categoryBudgetSchema, {
    method: 'POST',
    body: JSON.stringify(parsed),
  });
}

export async function deleteCategoryBudget(id: string): Promise<void> {
  await apiFetch(
    `/v1/category-budgets/${encodeURIComponent(id)}`,
    okResponseSchema,
    { method: 'DELETE' },
  );
}

export async function getRecurringCommitments(): Promise<
  RecurringCommitment[]
> {
  return apiFetch(
    '/v1/recurring-commitments',
    recurringCommitmentsResponseSchema,
  );
}

export async function upsertRecurringCommitment(
  input: Omit<RecurringCommitment, 'id'> & { id?: string },
): Promise<RecurringCommitment> {
  const parsed = upsertRecurringCommitmentInputSchema.parse(input);
  return apiFetch('/v1/recurring-commitments', recurringCommitmentSchema, {
    method: 'POST',
    body: JSON.stringify(parsed),
  });
}

export async function deleteRecurringCommitment(id: string): Promise<void> {
  await apiFetch(
    `/v1/recurring-commitments/${encodeURIComponent(id)}`,
    okResponseSchema,
    { method: 'DELETE' },
  );
}

export async function settleRecurringCommitment(
  commitmentId: string,
  options: { periodMonth: string; recordTransaction: boolean },
): Promise<{ commitment: RecurringCommitment; transaction?: Transaction }> {
  const parsed = settleRecurringCommitmentInputSchema.parse(options);
  return apiFetch(
    `/v1/recurring-commitments/${encodeURIComponent(commitmentId)}/settle`,
    settleRecurringCommitmentResponseSchema,
    {
      method: 'POST',
      body: JSON.stringify(parsed),
    },
  );
}

export async function unmarkRecurringCommitmentPaid(
  commitmentId: string,
): Promise<RecurringCommitment> {
  return apiFetch(
    `/v1/recurring-commitments/${encodeURIComponent(commitmentId)}/unmark`,
    recurringCommitmentSchema,
    { method: 'POST' },
  );
}

export async function getSinkingFunds(): Promise<SinkingFund[]> {
  return apiFetch('/v1/sinking-funds', sinkingFundsResponseSchema);
}

export async function upsertSinkingFund(
  input: Omit<SinkingFund, 'id'> & { id?: string },
): Promise<SinkingFund> {
  const parsed = upsertSinkingFundInputSchema.parse(input);
  return apiFetch('/v1/sinking-funds', sinkingFundSchema, {
    method: 'POST',
    body: JSON.stringify(parsed),
  });
}

export async function contributeToSinkingFund(
  fundId: string,
  amountMinor: number,
  sourceWalletId: string,
): Promise<{ fund: SinkingFund; transaction?: Transaction }> {
  const parsed = contributeSinkingFundInputSchema.parse({
    amountMinor: positiveAmountMinorSchema.parse(amountMinor),
    sourceWalletId,
  });
  return apiFetch(
    `/v1/sinking-funds/${encodeURIComponent(fundId)}/contribute`,
    contributeSinkingFundResponseSchema,
    {
      method: 'POST',
      body: JSON.stringify(parsed),
    },
  );
}

export async function deleteSinkingFund(id: string): Promise<void> {
  await apiFetch(
    `/v1/sinking-funds/${encodeURIComponent(id)}`,
    okResponseSchema,
    { method: 'DELETE' },
  );
}

export async function getQuickPresets(): Promise<QuickPreset[]> {
  return apiFetch('/v1/quick-presets', quickPresetsResponseSchema);
}

export async function upsertQuickPreset(
  input: Omit<QuickPreset, 'id'> & { id?: string },
): Promise<QuickPreset> {
  const parsed = upsertQuickPresetInputSchema.parse(input);
  return apiFetch('/v1/quick-presets', quickPresetSchema, {
    method: 'POST',
    body: JSON.stringify(parsed),
  });
}

export async function deleteQuickPreset(id: string): Promise<void> {
  await apiFetch(
    `/v1/quick-presets/${encodeURIComponent(id)}`,
    okResponseSchema,
    { method: 'DELETE' },
  );
}

export async function applyReconciliation(
  input: ApplyReconciliationInput,
): Promise<{
  reconciliation: BalanceReconciliation;
  adjustmentTransaction?: Transaction;
  wallet: Wallet;
}> {
  const parsed = applyReconciliationInputSchema.parse(input);
  return apiFetch('/v1/reconciliations', applyReconciliationResponseSchema, {
    method: 'POST',
    body: JSON.stringify(parsed),
  });
}

export async function getReconciliations(
  walletId?: string,
): Promise<BalanceReconciliation[]> {
  const query = walletId ? `?walletId=${encodeURIComponent(walletId)}` : '';
  return apiFetch(`/v1/reconciliations${query}`, reconciliationsResponseSchema);
}

export async function getSafeToSpendMetrics(
  currentDate?: Date,
): Promise<SafeToSpendMetrics> {
  const query = currentDate
    ? `?date=${encodeURIComponent(formatLocalYyyyMmDd(currentDate))}`
    : '';
  return apiFetch(`/v1/safe-to-spend${query}`, safeToSpendMetricsSchema);
}

export async function exportBackupEnvelope(): Promise<BackupEnvelope> {
  return apiFetch('/v1/portability/export', backupEnvelopeSchema);
}

export async function importBackupEnvelope(
  rawEnvelope: unknown,
  mode: 'merge' | 'overwrite',
): Promise<{ success: boolean; importedCount: number }> {
  const envelope = backupEnvelopeSchema.parse(rawEnvelope);
  const parsed = importBackupInputSchema.parse({ envelope, mode });
  return apiFetch('/v1/portability/import', importBackupResponseSchema, {
    method: 'POST',
    body: JSON.stringify(parsed),
  });
}
