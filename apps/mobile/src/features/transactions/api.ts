import {
  accountSchema,
  backupEnvelopeSchema,
  categorySchema,
  computeSafeToSpend,
  createCategoryInputSchema,
  createDestructiveConfirmation,
  createTransactionInputSchema,
  formatAccountLinkedErrorMessage,
  getAccountLinkedRecords,
  getNextPaydayHorizonDate,
  incomeSourceSchema,
  isCommitmentPaidOff,
  normalizeBackupEnvelope,
  positiveAmountMinorSchema,
  recurringCommitmentSchema,
  smartDefaultsSchema,
  transactionSchema,
  updateTransactionInputSchema,
  upsertAccountInputSchema,
  type Account,
  type BackupEnvelope,
  type Category,
  type CreateCategoryInput,
  type CreateTransactionInput,
  type IncomeSource,
  type IncomeSourceInput,
  type RecurringCommitment,
  type RecurringCommitmentInput,
  type SafeToSpendMetrics,
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
      existingAccount.currency !== validated.currency ||
      existingAccount.creditLimitMinor !== validated.creditLimitMinor ||
      existingAccount.monthlyPaymentTargetMinor !==
        validated.monthlyPaymentTargetMinor ||
      existingAccount.statementDay !== validated.statementDay ||
      existingAccount.dueDay !== validated.dueDay ||
      existingAccount.dueWeekday !== validated.dueWeekday ||
      existingAccount.dueWeekdayOrdinal !== validated.dueWeekdayOrdinal ||
      existingAccount.dueStartDate !== validated.dueStartDate;
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
          ...(validated.creditLimitMinor !== undefined
            ? { creditLimitMinor: validated.creditLimitMinor }
            : {}),
          ...(validated.monthlyPaymentTargetMinor !== undefined
            ? {
                monthlyPaymentTargetMinor: validated.monthlyPaymentTargetMinor,
              }
            : {}),
          ...(validated.statementDay !== undefined
            ? { statementDay: validated.statementDay }
            : {}),
          ...(validated.dueDay !== undefined ? { dueDay: validated.dueDay } : {}),
          ...(validated.dueWeekday !== undefined
            ? { dueWeekday: validated.dueWeekday }
            : {}),
          ...(validated.dueWeekdayOrdinal !== undefined
            ? { dueWeekdayOrdinal: validated.dueWeekdayOrdinal }
            : {}),
          ...(validated.dueStartDate !== undefined
            ? { dueStartDate: validated.dueStartDate }
            : {}),
        },
      });
    }

    if (balanceChanged) {
      enqueueSyncMutation({
        opId: createSyncOpId(),
        clientTimestamp: nowIso,
        type: 'account.setBalance',
        accountId: existingAccount.id,
        balanceMinor: validated.balanceMinor,
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
    ...(validated.creditLimitMinor !== undefined
      ? { creditLimitMinor: validated.creditLimitMinor }
      : {}),
    ...(validated.monthlyPaymentTargetMinor !== undefined
      ? { monthlyPaymentTargetMinor: validated.monthlyPaymentTargetMinor }
      : {}),
    ...(validated.statementDay !== undefined
      ? { statementDay: validated.statementDay }
      : {}),
    ...(validated.dueDay !== undefined ? { dueDay: validated.dueDay } : {}),
    ...(validated.dueWeekday !== undefined
      ? { dueWeekday: validated.dueWeekday }
      : {}),
    ...(validated.dueWeekdayOrdinal !== undefined
      ? { dueWeekdayOrdinal: validated.dueWeekdayOrdinal }
      : {}),
    ...(validated.dueStartDate !== undefined
      ? { dueStartDate: validated.dueStartDate }
      : {}),
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

export async function setAccountBalance(params: {
  accountId: string;
  balanceMinor: number;
}): Promise<Account> {
  const state = getCurrentSyncState();
  const existing = state.accounts.find((a) => a.id === params.accountId);
  if (!existing) {
    throw new Error('Account not found.');
  }
  if (!Number.isInteger(params.balanceMinor)) {
    throw new Error('Balance must be a valid integer amount.');
  }

  const nextState = enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: new Date().toISOString(),
    type: 'account.setBalance',
    accountId: params.accountId,
    balanceMinor: params.balanceMinor,
  });

  const updated = nextState.accounts.find((a) => a.id === params.accountId);
  if (!updated) {
    throw new Error('Could not update account balance.');
  }
  return accountSchema.parse(updated);
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
// Income Sources (Salary & Paydays) API
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
// Debts & Monthly Obligations API
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
  actualAmountMinor?: number;
}): Promise<{ commitment: RecurringCommitment; transaction: Transaction }> {
  const state = getCurrentSyncState();
  const commitment = state.recurringCommitments.find(
    (rc) => rc.id === params.commitmentId,
  );
  if (!commitment) {
    throw new Error('Obligation not found.');
  }

  if (params.actualAmountMinor !== undefined) {
    positiveAmountMinorSchema.parse(params.actualAmountMinor);
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
    ...(params.actualAmountMinor !== undefined
      ? { actualAmountMinor: params.actualAmountMinor }
      : {}),
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
    throw new Error('Obligation not found.');
  }

  const nextState = enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: new Date().toISOString(),
    type: 'commitment.unpay',
    commitmentId,
  });

  return nextState.recurringCommitments.find((rc) => rc.id === commitmentId)!;
}

export async function payCreditCardBill(params: {
  creditCardAccountId: string;
  paymentAccountId: string;
  paidAtIso?: string;
  amountOverrideMinor?: number;
}): Promise<{ creditCardAccount: Account; transferTransaction: Transaction | null }> {
  const state = getCurrentSyncState();
  const card = state.accounts.find((a) => a.id === params.creditCardAccountId);
  if (!card || card.accountType !== 'CREDIT_CARD') {
    throw new Error('Credit card account not found.');
  }

  const payer = state.accounts.find((a) => a.id === params.paymentAccountId);
  if (!payer || payer.accountType === 'CREDIT_CARD') {
    throw new Error('Please choose a bank, e-wallet, or cash account to pay from.');
  }
  if (payer.currency !== card.currency) {
    throw new Error(
      `Payment account currency (${payer.currency}) must match ${card.name} currency (${card.currency}).`,
    );
  }

  if (params.amountOverrideMinor !== undefined) {
    positiveAmountMinorSchema.parse(params.amountOverrideMinor);
  }

  const paidDate = params.paidAtIso ? new Date(params.paidAtIso) : new Date();
  const validDate = Number.isNaN(paidDate.getTime()) ? new Date() : paidDate;
  const periodMonth = `${validDate.getFullYear()}-${String(validDate.getMonth() + 1).padStart(2, '0')}`;
  const transferTransactionId = generateEntityId('tx');
  const installmentTxPrefix = generateEntityId('tx-inst');

  const nextState = enqueueSyncMutation({
    opId: createSyncOpId(),
    clientTimestamp: new Date().toISOString(),
    type: 'creditCard.payBill',
    creditCardAccountId: params.creditCardAccountId,
    paymentAccountId: params.paymentAccountId,
    transferTransactionId,
    installmentTxPrefix,
    paidAtIso: validDate.toISOString(),
    periodMonth,
    ...(params.amountOverrideMinor !== undefined
      ? { amountOverrideMinor: params.amountOverrideMinor }
      : {}),
  });

  const updatedCard = nextState.accounts.find(
    (a) => a.id === params.creditCardAccountId,
  );
  const transferTx =
    nextState.transactions.find((tx) => tx.id === transferTransactionId) ?? null;

  return {
    creditCardAccount: updatedCard ?? card,
    transferTransaction: transferTx,
  };
}

// ==========================================
// Safe-to-Spend API
// ==========================================

export async function getSafeToSpendMetrics(
  currentDate?: Date,
): Promise<SafeToSpendMetrics> {
  const state = getCurrentSyncState();
  const date = currentDate ?? new Date();
  const nextPaydayDate = getNextPaydayHorizonDate({
    sources: state.incomeSources,
    transactions: state.transactions,
    fromDate: date,
  });

  return computeSafeToSpend({
    accounts: state.accounts,
    commitments: state.recurringCommitments,
    transactions: state.transactions,
    nextPaydayDate,
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
      recurringCommitments: state.recurringCommitments,
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
