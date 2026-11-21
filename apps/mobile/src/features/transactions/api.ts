import {
  accountSchema,
  applyReconciliationInputSchema,
  backupEnvelopeSchema,
  categoryBudgetSchema,
  categorySchema,
  computeEnvelopeRollovers,
  computeReconciliationDelta,
  computeSafeToSpend,
  createCategoryInputSchema,
  createDestructiveConfirmation,
  createTransactionInputSchema,
  DEFAULT_CURRENCY,
  isCommitmentPaidOff,
  normalizeBackupEnvelope,
  positiveAmountMinorSchema,
  quickPresetSchema,
  recurringCommitmentSchema,
  sinkingFundSchema,
  smartDefaultsSchema,
  transactionSchema,
  updateTransactionInputSchema,
  upsertAccountInputSchema,
  type Account,
  type ApplyReconciliationInput,
  type BackupEnvelope,
  type BalanceReconciliation,
  type Category,
  type CategoryBudget,
  type CategoryBudgetStatus,
  type CreateCategoryInput,
  type CreateTransactionInput,
  type QuickPreset,
  type RecurringCommitment,
  type RecurringCommitmentInput,
  type SafeToSpendMetrics,
  type SinkingFund,
  type SmartDefaults,
  type SyncDataState,
  type Transaction,
  type UpdateTransactionInput,
  type UpsertAccountInput,
} from '@repo/contracts';
import {
  createSyncOpId,
  enqueueSyncMutation,
  getCurrentSyncState,
} from './sync-engine';

export type LocalStoreState = SyncDataState;

function generateEntityId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ==========================================
// Accounts API
// ==========================================

export async function getAccounts(): Promise<Account[]> {
  const state = getCurrentSyncState();
  return state.accounts.map((a) => accountSchema.parse(a));
}

export async function upsertAccount(input: UpsertAccountInput): Promise<Account> {
  const validated = upsertAccountInputSchema.parse(input);
  const state = getCurrentSyncState();
  const existingAccount = validated.id
    ? state.accounts.find((a) => a.id === validated.id)
    : undefined;

  if (existingAccount && existingAccount.balanceMinor === validated.balanceMinor) {
    const updatedMetadata = {
      id: existingAccount.id,
      name: validated.name,
      accountType: validated.accountType,
      icon: validated.icon,
      color: validated.color,
      currency: validated.currency,
    };

    enqueueSyncMutation({
      opId: createSyncOpId(),
      clientTimestamp: new Date().toISOString(),
      type: 'account.updateMetadata',
      account: updatedMetadata,
    });

    return accountSchema.parse({
      ...updatedMetadata,
      balanceMinor: existingAccount.balanceMinor,
    });
  }

  const id = validated.id ?? generateEntityId('account');

  const savedAccount = accountSchema.parse({
    id,
    name: validated.name,
    accountType: validated.accountType,
    icon: validated.icon,
    color: validated.color,
    currency: validated.currency,
    balanceMinor: validated.balanceMinor,
  });

  enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: new Date().toISOString(),
    type: 'account.upsert',
    account: savedAccount,
  });

  return savedAccount;
}

export async function deleteAccount(id: string): Promise<void> {
  const state = getCurrentSyncState();

  if (state.accounts.length <= 1) {
    throw new Error('You must keep at least one account.');
  }

  const isLinked =
    state.transactions.some((tx) => tx.accountId === id || tx.toAccountId === id) ||
    state.recurringCommitments.some((rc) => rc.accountId === id) ||
    state.sinkingFunds.some((sf) => sf.accountId === id);

  if (isLinked) {
    throw new Error(
      'Cannot delete an account that is linked to existing transactions, bills, or sinking funds.',
    );
  }

  enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: new Date().toISOString(),
    type: 'account.delete',
    id,
    confirmation: createDestructiveConfirmation('delete-account', id),
  });
}

// ==========================================
// Categories & Smart Defaults API
// ==========================================

export async function getCategories(): Promise<Category[]> {
  const state = getCurrentSyncState();
  return state.categories.map((c) => categorySchema.parse(c));
}

export async function getSmartDefaults(): Promise<SmartDefaults> {
  const state = getCurrentSyncState();
  return smartDefaultsSchema.parse(state.smartDefaults);
}

export async function createCustomCategory(
  input: CreateCategoryInput,
): Promise<Category> {
  const validatedInput = createCategoryInputSchema.parse(input);
  const state = getCurrentSyncState();

  const newCategory = categorySchema.parse({
    id: 'cat-custom-' + Date.now(),
    name: validatedInput.name,
    type: validatedInput.type,
    icon: validatedInput.icon,
    color: validatedInput.color,
    usageCount: 1,
    defaultOrder: state.categories.length,
    isCustom: true,
  });

  enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: new Date().toISOString(),
    type: 'category.create',
    category: newCategory,
  });

  return newCategory;
}

// ==========================================
// Transactions API
// ==========================================

export async function getTransactions(): Promise<Transaction[]> {
  const state = getCurrentSyncState();
  return state.transactions.map((tx) => transactionSchema.parse(tx));
}

export async function createTransaction(
  input: CreateTransactionInput,
): Promise<Transaction> {
  const validatedInput = createTransactionInputSchema.parse(input);
  const nowIso = new Date().toISOString();

  const tx = transactionSchema.parse({
    ...validatedInput,
    id: generateEntityId('tx'),
    createdAt: nowIso,
  });

  enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: nowIso,
    type: 'transaction.create',
    transaction: tx,
  });

  return tx;
}

export async function createTransactionsBatch(
  inputs: CreateTransactionInput[],
): Promise<Transaction[]> {
  const nowIso = new Date().toISOString();
  const created = inputs.map((input, index) => {
    const validatedInput = createTransactionInputSchema.parse(input);
    return transactionSchema.parse({
      ...validatedInput,
      id: `tx-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: nowIso,
    });
  });

  if (created.length > 0) {
    enqueueSyncMutation({
      opId: createSyncOpId(),
      clientTimestamp: nowIso,
      type: 'transaction.createBatch',
      transactions: created,
    });
  }

  return created;
}

export async function deleteTransaction(transactionId: string): Promise<void> {
  const state = getCurrentSyncState();
  const tx = state.transactions.find((t) => t.id === transactionId);
  if (!tx) {
    return;
  }

  enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: new Date().toISOString(),
    type: 'transaction.delete',
    id: transactionId,
  });
}

export async function updateTransaction(
  input: UpdateTransactionInput,
): Promise<Transaction> {
  const validatedInput = updateTransactionInputSchema.parse(input);
  const state = getCurrentSyncState();

  const existingTx = state.transactions.find((t) => t.id === validatedInput.id);
  if (!existingTx) {
    throw new Error('Transaction not found.');
  }

  const updatedTx = transactionSchema.parse({
    ...validatedInput,
    createdAt: existingTx.createdAt,
  });

  enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: new Date().toISOString(),
    type: 'transaction.update',
    input: validatedInput,
  });

  return updatedTx;
}

export async function updateMonthlyBudget(
  monthlyBudgetMinor: number,
): Promise<SmartDefaults> {
  const validatedBudget = positiveAmountMinorSchema.parse(monthlyBudgetMinor);

  const nextState = enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: new Date().toISOString(),
    type: 'budget.updateMonthly',
    monthlyBudgetMinor: validatedBudget,
  });

  return nextState.smartDefaults;
}

export async function clearAllTransactions(): Promise<void> {
  enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: new Date().toISOString(),
    type: 'transactions.clearAll',
    confirmation: createDestructiveConfirmation('clear-transactions', 'all'),
  });
}

export async function resetLocalStore(): Promise<void> {
  const nowIso = new Date().toISOString();
  enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: nowIso,
    type: 'state.resetDemo',
    referenceIso: nowIso,
    confirmation: createDestructiveConfirmation('reset-demo', 'all'),
  });
}

// ==========================================
// Envelope Budgets API
// ==========================================

export async function getCategoryBudgets(
  periodMonth: string,
): Promise<CategoryBudgetStatus[]> {
  const state = getCurrentSyncState();
  return computeEnvelopeRollovers({
    budgets: state.categoryBudgets,
    transactions: state.transactions,
    periodMonth,
  });
}

export async function upsertCategoryBudget(
  budget: Omit<CategoryBudget, 'id'> & { id?: string },
): Promise<CategoryBudget> {
  const id = budget.id || generateEntityId('budget');
  const validated = categoryBudgetSchema.parse({
    ...budget,
    id,
  });

  enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: new Date().toISOString(),
    type: 'categoryBudget.upsert',
    budget: validated,
  });

  return validated;
}

export async function deleteCategoryBudget(id: string): Promise<void> {
  enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: new Date().toISOString(),
    type: 'categoryBudget.delete',
    id,
  });
}

// ==========================================
// Recurring Commitments API
// ==========================================

export async function getRecurringCommitments(): Promise<RecurringCommitment[]> {
  const state = getCurrentSyncState();
  return state.recurringCommitments.map((rc) => recurringCommitmentSchema.parse(rc));
}

export async function upsertRecurringCommitment(
  input: Omit<RecurringCommitmentInput, 'id'> & { id?: string },
): Promise<RecurringCommitment> {
  const id = input.id || generateEntityId('commitment');
  const validated = recurringCommitmentSchema.parse({
    ...input,
    id,
  });

  enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: new Date().toISOString(),
    type: 'commitment.upsert',
    commitment: validated,
  });

  return validated;
}

export async function deleteRecurringCommitment(id: string): Promise<void> {
  enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: new Date().toISOString(),
    type: 'commitment.delete',
    id,
  });
}

export async function payRecurringCommitment(params: {
  commitmentId: string;
  paidAtIso?: string;
  accountId?: string;
}): Promise<{ commitment: RecurringCommitment; transaction: Transaction }> {
  const state = getCurrentSyncState();
  const commitment = state.recurringCommitments.find(
    (rc) => rc.id === params.commitmentId,
  );
  if (!commitment) {
    throw new Error('Scheduled expense not found.');
  }

  const paidDate = params.paidAtIso ? new Date(params.paidAtIso) : new Date();
  const validDate = Number.isNaN(paidDate.getTime()) ? new Date() : paidDate;
  const periodMonth = `${validDate.getFullYear()}-${String(validDate.getMonth() + 1).padStart(2, '0')}`;

  if (commitment.lastPaidPeriod === periodMonth) {
    throw new Error('Already marked paid for this period.');
  }

  if (isCommitmentPaidOff(commitment)) {
    throw new Error('This installment is already paid off.');
  }

  const transactionId = generateEntityId('tx');
  const paidIso = validDate.toISOString();

  const nextState = enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: new Date().toISOString(),
    type: 'commitment.pay',
    commitmentId: params.commitmentId,
    transactionId,
    paidAtIso: paidIso,
    periodMonth,
    ...(params.accountId ? { accountId: params.accountId } : {}),
  });

  const updatedCommitment = nextState.recurringCommitments.find(
    (rc) => rc.id === params.commitmentId,
  )!;
  const createdTransaction = nextState.transactions.find(
    (tx) => tx.id === transactionId,
  )!;

  return {
    commitment: updatedCommitment,
    transaction: createdTransaction,
  };
}

export async function unpayRecurringCommitment(
  commitmentId: string,
): Promise<RecurringCommitment> {
  const state = getCurrentSyncState();
  const commitment = state.recurringCommitments.find(
    (rc) => rc.id === commitmentId,
  );
  if (!commitment) {
    throw new Error('Scheduled expense not found.');
  }

  const nextState = enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: new Date().toISOString(),
    type: 'commitment.unpay',
    commitmentId,
  });

  return nextState.recurringCommitments.find((rc) => rc.id === commitmentId)!;
}

// ==========================================
// Sinking Funds API
// ==========================================

export async function getSinkingFunds(): Promise<SinkingFund[]> {
  const state = getCurrentSyncState();
  return state.sinkingFunds.map((sf) => sinkingFundSchema.parse(sf));
}

export async function upsertSinkingFund(
  input: Omit<SinkingFund, 'id'> & { id?: string },
): Promise<SinkingFund> {
  const id = input.id || generateEntityId('fund');
  const validated = sinkingFundSchema.parse({
    ...input,
    id,
  });

  enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: new Date().toISOString(),
    type: 'sinkingFund.upsert',
    fund: validated,
  });

  return validated;
}

export async function contributeToSinkingFund(
  fundId: string,
  amountMinor: number,
  sourceAccountId: string,
): Promise<{ fund: SinkingFund; transaction: Transaction }> {
  positiveAmountMinorSchema.parse(amountMinor);
  const state = getCurrentSyncState();
  const fund = state.sinkingFunds.find((sf) => sf.id === fundId);
  if (!fund) {
    throw new Error(`Sinking fund "${fundId}" not found`);
  }

  const transactionId = generateEntityId('tx');
  const occurredAt = new Date().toISOString();

  const nextState = enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: occurredAt,
    type: 'sinkingFund.contribute',
    fundId,
    transactionId,
    amountMinor,
    sourceAccountId,
    occurredAt,
  });

  return {
    fund: nextState.sinkingFunds.find((sf) => sf.id === fundId)!,
    transaction: nextState.transactions.find((tx) => tx.id === transactionId)!,
  };
}

export async function deleteSinkingFund(id: string): Promise<void> {
  enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: new Date().toISOString(),
    type: 'sinkingFund.delete',
    id,
  });
}

// ==========================================
// Quick Presets API
// ==========================================

export async function getQuickPresets(): Promise<QuickPreset[]> {
  const state = getCurrentSyncState();
  return state.quickPresets.map((qp) => quickPresetSchema.parse(qp));
}

export async function upsertQuickPreset(
  input: Omit<QuickPreset, 'id'> & { id?: string },
): Promise<QuickPreset> {
  const id = input.id || generateEntityId('preset');
  const validated = quickPresetSchema.parse({
    ...input,
    id,
  });

  enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: new Date().toISOString(),
    type: 'quickPreset.upsert',
    preset: validated,
  });

  return validated;
}

export async function deleteQuickPreset(id: string): Promise<void> {
  enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: new Date().toISOString(),
    type: 'quickPreset.delete',
    id,
  });
}

// ==========================================
// Balance Reconciliation API
// ==========================================

export async function applyReconciliation(
  input: ApplyReconciliationInput,
): Promise<{
  reconciliation: BalanceReconciliation;
  adjustmentTransaction?: Transaction;
  account: Account;
}> {
  const validatedInput = applyReconciliationInputSchema.parse(input);
  const state = getCurrentSyncState();
  const account = state.accounts.find((a) => a.id === validatedInput.accountId);
  if (!account) {
    throw new Error(`Account "${validatedInput.accountId}" not found`);
  }

  const delta = computeReconciliationDelta(
    account.balanceMinor,
    validatedInput.actualBalanceMinor,
  );

  const reconciliationId = generateEntityId('rec');
  const adjustmentTransactionId =
    validatedInput.createAdjustment && delta.needsAdjustment
      ? generateEntityId('tx')
      : undefined;
  const reconciledAt = new Date().toISOString();

  const nextState = enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: reconciledAt,
    type: 'reconciliation.apply',
    reconciliationId,
    accountId: validatedInput.accountId,
    actualBalanceMinor: validatedInput.actualBalanceMinor,
    createAdjustment: validatedInput.createAdjustment,
    ...(validatedInput.notes ? { notes: validatedInput.notes } : {}),
    ...(adjustmentTransactionId ? { adjustmentTransactionId } : {}),
    reconciledAt,
  });

  return {
    reconciliation: nextState.reconciliations.find(
      (r) => r.id === reconciliationId,
    )!,
    adjustmentTransaction: adjustmentTransactionId
      ? nextState.transactions.find((t) => t.id === adjustmentTransactionId)
      : undefined,
    account: nextState.accounts.find((a) => a.id === validatedInput.accountId)!,
  };
}

export async function getReconciliations(
  accountId?: string,
): Promise<BalanceReconciliation[]> {
  const state = getCurrentSyncState();
  const list = [...state.reconciliations].reverse();
  if (accountId) {
    return list.filter((r) => r.accountId === accountId);
  }
  return list;
}

// ==========================================
// Safe-to-Spend API
// ==========================================

export async function getSafeToSpendMetrics(
  currentDate?: Date,
): Promise<SafeToSpendMetrics> {
  const state = getCurrentSyncState();
  const date = currentDate ?? new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const periodMonth = `${year}-${month}`;

  const cashLikeAccounts = state.accounts.filter(
    (a) => a.accountType !== 'CREDIT_CARD',
  );
  const nonSavingsAccounts = cashLikeAccounts.filter(
    (a) => a.id !== 'account-savings',
  );
  const liquidAccounts =
    nonSavingsAccounts.length > 0
      ? nonSavingsAccounts
      : cashLikeAccounts.length > 0
        ? cashLikeAccounts
        : state.accounts;

  const categoryBudgets = computeEnvelopeRollovers({
    budgets: state.categoryBudgets,
    transactions: state.transactions,
    periodMonth,
  });

  return computeSafeToSpend({
    liquidAccounts,
    commitments: state.recurringCommitments,
    categoryBudgets,
    sinkingFunds: state.sinkingFunds,
    currentDate: date,
  });
}

// ==========================================
// Portability & Backup API
// ==========================================

export async function exportBackupEnvelope(): Promise<BackupEnvelope> {
  const state = getCurrentSyncState();
  return backupEnvelopeSchema.parse({
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      accounts: state.accounts,
      categories: state.categories,
      transactions: state.transactions,
      categoryBudgets: state.categoryBudgets,
      recurringCommitments: state.recurringCommitments,
      sinkingFunds: state.sinkingFunds,
      quickPresets: state.quickPresets,
      smartDefaults: state.smartDefaults,
    },
  });
}

export async function importBackupEnvelope(
  rawEnvelope: unknown,
  mode: 'merge' | 'overwrite',
): Promise<{ success: boolean; importedCount: number }> {
  const envelope = backupEnvelopeSchema.parse(normalizeBackupEnvelope(rawEnvelope));

  enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: new Date().toISOString(),
    type: 'backup.import',
    envelope,
    mode,
    ...(mode === 'overwrite'
      ? { confirmation: createDestructiveConfirmation('overwrite-backup', 'all') }
      : {}),
  });

  return {
    success: true,
    importedCount: envelope.data.transactions.length,
  };
}
