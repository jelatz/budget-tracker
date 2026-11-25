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
  formatAccountLinkedErrorMessage,
  getAccountLinkedRecords,
  incomeSourceSchema,
  isCommitmentPaidOff,
  normalizeBackupEnvelope,
  positiveAmountMinorSchema,
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
  type IncomeSource,
  type IncomeSourceInput,
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

function assertTransactionAccountsCompatible(
  state: SyncDataState,
  tx: Pick<Transaction, 'type' | 'currency' | 'accountId' | 'toAccountId'>,
): void {
  const sourceAccount = state.accounts.find((a) => a.id === tx.accountId);
  if (!sourceAccount) {
    throw new Error('Selected account was not found.');
  }
  if (sourceAccount.currency !== tx.currency) {
    throw new Error(
      `Account currency (${sourceAccount.currency}) does not match transaction currency (${tx.currency}).`,
    );
  }
  if (tx.type === 'TRANSFER') {
    if (!tx.toAccountId) {
      throw new Error('Please select a destination account for this transfer.');
    }
    const destinationAccount = state.accounts.find((a) => a.id === tx.toAccountId);
    if (!destinationAccount) {
      throw new Error('Selected destination account was not found.');
    }
    if (destinationAccount.currency !== tx.currency) {
      throw new Error(
        `Transfer accounts must use the same currency (${tx.currency}).`,
      );
    }
  }
}

export async function upsertAccount(input: UpsertAccountInput): Promise<Account> {
  const validated = upsertAccountInputSchema.parse(input);
  const state = getCurrentSyncState();
  const existingAccount = validated.id
    ? state.accounts.find((a) => a.id === validated.id)
    : undefined;

  if (existingAccount) {
    const metadataChanged =
      existingAccount.name !== validated.name ||
      existingAccount.accountType !== validated.accountType ||
      existingAccount.icon !== validated.icon ||
      existingAccount.color !== validated.color ||
      existingAccount.currency !== validated.currency;
    const balanceChanged =
      existingAccount.balanceMinor !== validated.balanceMinor;

    if (!metadataChanged && !balanceChanged) {
      return accountSchema.parse(existingAccount);
    }

    const nowIso = new Date().toISOString();

    if (metadataChanged) {
      enqueueSyncMutation({
        opId: createSyncOpId(),
        clientTimestamp: nowIso,
        type: 'account.updateMetadata',
        account: {
          id: existingAccount.id,
          name: validated.name,
          accountType: validated.accountType,
          icon: validated.icon,
          color: validated.color,
          currency: validated.currency,
        },
      });
    }

    if (balanceChanged) {
      enqueueSyncMutation({
        opId: createSyncOpId(),
        clientTimestamp: nowIso,
        type: 'reconciliation.apply',
        reconciliationId: generateEntityId('rec'),
        accountId: existingAccount.id,
        actualBalanceMinor: validated.balanceMinor,
        createAdjustment: false,
        notes: 'Account balance updated',
        reconciledAt: nowIso,
        confirmation: createDestructiveConfirmation(
          'reconcile-account',
          existingAccount.id,
        ),
      });
    }

    const updatedAccount = getCurrentSyncState().accounts.find(
      (a) => a.id === existingAccount.id,
    );
    if (
      !updatedAccount ||
      updatedAccount.balanceMinor !== validated.balanceMinor
    ) {
      throw new Error('Could not update account. Please try again.');
    }

    return accountSchema.parse(updatedAccount);
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

  const nextState = enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: new Date().toISOString(),
    type: 'account.upsert',
    account: savedAccount,
  });

  const persisted = nextState.accounts.find((a) => a.id === id);
  if (!persisted) {
    throw new Error('Could not save account. Please try again.');
  }

  return accountSchema.parse(persisted);
}

export async function deleteAccount(id: string): Promise<void> {
  const state = getCurrentSyncState();

  if (state.accounts.length <= 1) {
    throw new Error('You must keep at least one account.');
  }

  const linked = getAccountLinkedRecords(state, id);
  if (linked.isLinked) {
    throw new Error(formatAccountLinkedErrorMessage(linked));
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
  const state = getCurrentSyncState();
  const nowIso = new Date().toISOString();

  const tx = transactionSchema.parse({
    ...validatedInput,
    id: generateEntityId('tx'),
    createdAt: nowIso,
  });

  assertTransactionAccountsCompatible(state, tx);

  const nextState = enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: nowIso,
    type: 'transaction.create',
    transaction: tx,
  });

  if (!nextState.transactions.some((item) => item.id === tx.id)) {
    throw new Error(
      'Could not save transaction. Please verify the selected account and try again.',
    );
  }

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

  assertTransactionAccountsCompatible(state, updatedTx);

  const nextState = enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: new Date().toISOString(),
    type: 'transaction.update',
    input: validatedInput,
  });

  const savedTx = nextState.transactions.find((t) => t.id === updatedTx.id);
  if (!savedTx) {
    throw new Error('Could not update transaction. Please try again.');
  }

  return savedTx;
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

export async function copyCategoryBudgetsFromMonth(
  fromPeriodMonth: string,
  toPeriodMonth: string,
): Promise<{ copiedCount: number }> {
  if (fromPeriodMonth === toPeriodMonth) {
    return { copiedCount: 0 };
  }
  const state = getCurrentSyncState();
  const sourceBudgets = state.categoryBudgets.filter(
    (b) => b.periodMonth === fromPeriodMonth,
  );
  const existingCategoryIds = new Set(
    state.categoryBudgets
      .filter((b) => b.periodMonth === toPeriodMonth)
      .map((b) => b.categoryId),
  );
  const missing = sourceBudgets.filter(
    (b) => !existingCategoryIds.has(b.categoryId),
  );

  if (missing.length === 0) {
    return { copiedCount: 0 };
  }

  enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: new Date().toISOString(),
    type: 'categoryBudget.copyMonth',
    fromPeriodMonth,
    toPeriodMonth,
    idPrefix: generateEntityId('budget'),
  });

  return { copiedCount: missing.length };
}

// ==========================================
// Income Sources (Salary & Jobs) API
// ==========================================

export async function getIncomeSources(): Promise<IncomeSource[]> {
  const state = getCurrentSyncState();
  return state.incomeSources.map((src) => incomeSourceSchema.parse(src));
}

export async function upsertIncomeSource(
  input: Omit<IncomeSourceInput, 'id'> & { id?: string },
): Promise<IncomeSource> {
  const id = input.id || generateEntityId('job');
  const validated = incomeSourceSchema.parse({
    ...input,
    id,
  });

  const state = getCurrentSyncState();
  const account = state.accounts.find((a) => a.id === validated.accountId);
  if (!account) {
    throw new Error('Selected deposit account was not found.');
  }
  if (account.currency !== validated.currency) {
    throw new Error(
      `Deposit account currency (${account.currency}) must match income source currency (${validated.currency}).`,
    );
  }

  enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: new Date().toISOString(),
    type: 'incomeSource.upsert',
    source: validated,
  });

  return validated;
}

export async function deleteIncomeSource(id: string): Promise<void> {
  enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: new Date().toISOString(),
    type: 'incomeSource.delete',
    id,
  });
}

export async function logPayday(params: {
  sourceId: string;
  amountMinor: number;
  accountId?: string;
  occurredAt?: string;
  note?: string;
}): Promise<{ source: IncomeSource; transaction: Transaction }> {
  positiveAmountMinorSchema.parse(params.amountMinor);
  const state = getCurrentSyncState();
  const source = state.incomeSources.find((src) => src.id === params.sourceId);
  if (!source) {
    throw new Error('Income source was not found.');
  }

  const targetAccountId = params.accountId ?? source.accountId;
  const targetAccount = state.accounts.find((a) => a.id === targetAccountId);
  if (!targetAccount) {
    throw new Error('Selected deposit account was not found.');
  }
  if (targetAccount.currency !== source.currency) {
    throw new Error(
      `Deposit account currency (${targetAccount.currency}) must match ${source.name} currency (${source.currency}).`,
    );
  }

  const transactionId = generateEntityId('tx');
  const occurredAt = params.occurredAt ?? new Date().toISOString();

  const nextState = enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: new Date().toISOString(),
    type: 'incomeSource.logPayday',
    sourceId: source.id,
    transactionId,
    amountMinor: params.amountMinor,
    accountId: targetAccountId,
    occurredAt,
    ...(params.note?.trim() ? { note: params.note.trim() } : {}),
  });

  const createdTx = nextState.transactions.find((tx) => tx.id === transactionId);
  if (!createdTx) {
    throw new Error('Could not record payday. Please verify the selected account.');
  }

  return {
    source,
    transaction: createdTx,
  };
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

  const sourceAccount = state.accounts.find((a) => a.id === sourceAccountId);
  if (!sourceAccount) {
    throw new Error('Selected source account was not found.');
  }

  if (sourceAccountId !== fund.accountId) {
    const destAccount = state.accounts.find((a) => a.id === fund.accountId);
    if (!destAccount) {
      throw new Error('Sinking fund holding account was not found.');
    }
    if (destAccount.currency !== sourceAccount.currency) {
      throw new Error(
        `Source account (${sourceAccount.currency}) must match holding account (${destAccount.currency}).`,
      );
    }
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

  const updatedFund = nextState.sinkingFunds.find((sf) => sf.id === fundId);
  const createdTx = nextState.transactions.find((tx) => tx.id === transactionId);
  if (!updatedFund || !createdTx) {
    throw new Error('Could not record sinking fund contribution.');
  }

  return {
    fund: updatedFund,
    transaction: createdTx,
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
    confirmation: createDestructiveConfirmation(
      'reconcile-account',
      validatedInput.accountId,
    ),
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
      incomeSources: state.incomeSources,
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
