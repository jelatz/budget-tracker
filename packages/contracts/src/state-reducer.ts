import { MAX_SAFE_MONEY_MINOR } from './money';
import { incomeSourceSchema } from './income-plan.schema';
import {
  advanceNextDueDateByCycles,
  computeCreditCardBillSummary,
  computeInstallmentProgress,
  formatPeriodMonthShort,
  isCommitmentPaidOff,
  normalizeCommitmentKind,
  recurringCommitmentSchema,
  resolveEffectiveCommitmentCycles,
  resolveTargetPeriodForCommitmentPay,
  resolveTargetPeriodForCreditCardAdvance,
  rewindNextDueDateByCycles,
  type RecurringCommitment,
} from './recurring.schema';
import {
  accountSchema,
  categorySchema,
  DEFAULT_ACCOUNTS,
  DEFAULT_CATEGORIES,
  smartDefaultsSchema,
  transactionSchema,
  type Account,
  type SmartDefaults,
  type Transaction,
} from './transactions.schema';
import type { SyncDataState, SyncMutation } from './sync.schema';

function formatUtcPeriodMonth(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function clampMinor(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-MAX_SAFE_MONEY_MINOR, Math.min(MAX_SAFE_MONEY_MINOR, Math.trunc(value)));
}

function truncateText(text: string, maxLen: number): string {
  const trimmed = text.trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

/**
 * Builds a clean zero-balance starter dataset for newly registered accounts.
 */
export function createInitialSyncDataState(_referenceDate = new Date()): SyncDataState {
  const firstAccountId = DEFAULT_ACCOUNTS[0]?.id ?? 'account-bank';
  const savingsAccountId =
    DEFAULT_ACCOUNTS[3]?.id ?? DEFAULT_ACCOUNTS[0]?.id ?? 'account-savings';

  return {
    accounts: DEFAULT_ACCOUNTS.map((a) => ({ ...a })),
    categories: DEFAULT_CATEGORIES.map((c) => ({
      ...c,
      usageCount: 0,
    })),
    transactions: [],
    smartDefaults: {
      lastAccountId: firstAccountId,
      lastTransferToAccountId: savingsAccountId,
      recentMerchants: [],
      monthlyBudgetMinor: 250000,
    },
    recurringCommitments: [],
    incomeSources: [],
  };
}

function applyTransactionToAccounts(
  accounts: readonly Account[],
  tx: Transaction,
  direction: 1 | -1,
): Account[] {
  return accounts.map((account) => {
    if (tx.type === 'EXPENSE') {
      if (account.id === tx.accountId) {
        return {
          ...account,
          balanceMinor: clampMinor(account.balanceMinor - direction * tx.amountMinor),
        };
      }
    } else if (tx.type === 'INCOME') {
      if (account.id === tx.accountId) {
        return {
          ...account,
          balanceMinor: clampMinor(account.balanceMinor + direction * tx.amountMinor),
        };
      }
    } else if (tx.type === 'TRANSFER') {
      if (account.id === tx.accountId) {
        return {
          ...account,
          balanceMinor: clampMinor(account.balanceMinor - direction * tx.amountMinor),
        };
      }
      if (tx.toAccountId && account.id === tx.toAccountId) {
        return {
          ...account,
          balanceMinor: clampMinor(account.balanceMinor + direction * tx.amountMinor),
        };
      }
    }
    return account;
  });
}

function updateSmartDefaultsForTransaction(
  smartDefaults: SmartDefaults,
  tx: Transaction,
): SmartDefaults {
  let recentMerchants = [...smartDefaults.recentMerchants];
  if (tx.merchant && tx.merchant.trim().length > 0) {
    const trimmed = tx.merchant.trim();
    const lower = trimmed.toLowerCase();
    recentMerchants = [
      trimmed,
      ...recentMerchants.filter((m) => m.toLowerCase() !== lower),
    ].slice(0, 12);
  }

  return {
    ...smartDefaults,
    lastAccountId: tx.accountId,
    ...(tx.type === 'TRANSFER' && tx.toAccountId
      ? { lastTransferToAccountId: tx.toAccountId }
      : {}),
    recentMerchants,
  };
}

function isTransactionAccountCompatible(
  accounts: readonly Account[],
  tx: Pick<Transaction, 'type' | 'currency' | 'accountId' | 'toAccountId'>,
): boolean {
  const source = accounts.find((a) => a.id === tx.accountId);
  if (!source || source.currency !== tx.currency) {
    return false;
  }
  if (tx.type === 'TRANSFER') {
    if (!tx.toAccountId) return false;
    const dest = accounts.find((a) => a.id === tx.toAccountId);
    if (!dest || dest.currency !== tx.currency) {
      return false;
    }
  }
  return true;
}

function addTransactionToState(
  state: SyncDataState,
  rawTx: Transaction,
  options?: { updateSmartDefaults?: boolean },
): SyncDataState {
  if (state.transactions.some((existing) => existing.id === rawTx.id)) {
    return state;
  }

  const tx = transactionSchema.parse(rawTx);
  if (!isTransactionAccountCompatible(state.accounts, tx)) {
    return state;
  }
  const nextAccounts = applyTransactionToAccounts(state.accounts, tx, 1);

  const nextCategories = tx.categoryId
    ? state.categories.map((c) =>
        c.id === tx.categoryId ? { ...c, usageCount: c.usageCount + 1 } : c,
      )
    : state.categories;

  const nextSmartDefaults =
    options?.updateSmartDefaults !== false
      ? updateSmartDefaultsForTransaction(state.smartDefaults, tx)
      : state.smartDefaults;

  return {
    ...state,
    accounts: nextAccounts,
    categories: nextCategories,
    smartDefaults: nextSmartDefaults,
    transactions: [tx, ...state.transactions],
  };
}

function deleteTransactionFromState(
  state: SyncDataState,
  transactionId: string,
): SyncDataState {
  const tx = state.transactions.find((t) => t.id === transactionId);
  if (!tx) {
    return state;
  }

  const nextAccounts = applyTransactionToAccounts(state.accounts, tx, -1).map(
    (account) => {
      if (account.lastPaymentTransactionId !== transactionId) {
        return account;
      }
      const nextRaw: Record<string, unknown> = { ...account };
      if (account.previousPaidThroughPeriod === undefined) {
        delete nextRaw.paidThroughPeriod;
      } else {
        nextRaw.paidThroughPeriod = account.previousPaidThroughPeriod;
      }
      delete nextRaw.previousPaidThroughPeriod;
      delete nextRaw.lastPaymentTransactionId;
      delete nextRaw.lastPaymentInstallmentTxPrefix;
      return accountSchema.parse(nextRaw);
    },
  );
  const nextCategories = tx.categoryId
    ? state.categories.map((c) =>
        c.id === tx.categoryId
          ? { ...c, usageCount: Math.max(0, c.usageCount - 1) }
          : c,
      )
    : state.categories;

  return {
    ...state,
    accounts: nextAccounts,
    categories: nextCategories,
    transactions: state.transactions.filter((t) => t.id !== transactionId),
  };
}

function revertCommitmentOnUnpay(
  state: SyncDataState,
  commitment: RecurringCommitment,
): SyncDataState {
  if (!commitment.lastPaidPeriod && !commitment.lastPaidTransactionId) {
    return state;
  }

  const stateAfterDelete = commitment.lastPaidTransactionId
    ? deleteTransactionFromState(state, commitment.lastPaidTransactionId)
    : state;

  const account = state.accounts.find((a) => a.id === commitment.accountId);
  const resolvedKind = normalizeCommitmentKind(
    commitment.kind,
    account?.accountType,
  );
  const hasTerms =
    resolvedKind === 'LOAN' ||
    resolvedKind === 'CREDIT_CARD_INSTALLMENT' ||
    (typeof commitment.totalInstallments === 'number' &&
      commitment.totalInstallments > 0);
  const cyclesToRevert = commitment.lastPaidCycles ?? 1;
  const nextPaidInstallments = hasTerms
    ? Math.max(0, commitment.paidInstallments - cyclesToRevert)
    : commitment.paidInstallments;

  let restoredNextDueDate = commitment.nextDueDate;
  if (commitment.previousNextDueDate) {
    restoredNextDueDate = commitment.previousNextDueDate;
  } else if (
    commitment.nextDueDate &&
    commitment.lastPaidPeriod &&
    commitment.nextDueDate.slice(0, 7) > commitment.lastPaidPeriod
  ) {
    restoredNextDueDate = rewindNextDueDateByCycles(
      commitment.nextDueDate,
      commitment.frequency,
      cyclesToRevert,
      commitment.dueDay,
    );
  }

  const updatedCommitment = recurringCommitmentSchema.parse({
    ...commitment,
    kind: resolvedKind,
    lastPaidPeriod: commitment.previousLastPaidPeriod,
    previousLastPaidPeriod: undefined,
    lastPaidCycles: undefined,
    lastPaidTransactionId: undefined,
    paidInstallments: nextPaidInstallments,
    isActive: hasTerms ? true : commitment.isActive,
    nextDueDate: restoredNextDueDate,
    previousNextDueDate: undefined,
  });

  return {
    ...stateAfterDelete,
    recurringCommitments: stateAfterDelete.recurringCommitments.map((rc) =>
      rc.id === commitment.id ? updatedCommitment : rc,
    ),
  };
}

function upsertById<T extends { id: string }>(
  items: readonly T[],
  nextItem: T,
): T[] {
  const idx = items.findIndex((item) => item.id === nextItem.id);
  if (idx >= 0) {
    return items.map((item, i) => (i === idx ? nextItem : item));
  }
  return [...items, nextItem];
}

function mergeById<T extends { id: string }>(
  existing: readonly T[],
  incoming: readonly T[],
): T[] {
  const map = new Map<string, T>();
  for (const item of existing) {
    map.set(item.id, item);
  }
  for (const item of incoming) {
    map.set(item.id, item);
  }
  return Array.from(map.values());
}

function advanceCommitmentOnPay(
  commitment: RecurringCommitment,
  periodMonth: string,
  txId: string,
  accountType?: Account['accountType'],
  cyclesCount = 1,
): RecurringCommitment {
  const resolvedKind = normalizeCommitmentKind(commitment.kind, accountType);
  const hasTerms =
    resolvedKind === 'LOAN' ||
    resolvedKind === 'CREDIT_CARD_INSTALLMENT' ||
    (typeof commitment.totalInstallments === 'number' &&
      commitment.totalInstallments > 0);

  const effectiveCycles = resolveEffectiveCommitmentCycles(
    commitment,
    cyclesCount,
  );
  if (effectiveCycles <= 0) {
    return commitment;
  }

  const nextPaidInstallments = hasTerms
    ? commitment.paidInstallments + effectiveCycles
    : commitment.paidInstallments;
  const reachedPayoff =
    typeof commitment.totalInstallments === 'number' &&
    commitment.totalInstallments > 0 &&
    nextPaidInstallments >= commitment.totalInstallments;

  const targetPeriodMonth = resolveTargetPeriodForCommitmentPay(
    commitment,
    periodMonth,
    effectiveCycles,
  );

  const hasNextDueDate = Boolean(commitment.nextDueDate);
  const nextDueDate =
    hasNextDueDate && !reachedPayoff && commitment.nextDueDate
      ? advanceNextDueDateByCycles(
          commitment.nextDueDate,
          commitment.frequency,
          effectiveCycles,
          commitment.dueDay,
        )
      : commitment.nextDueDate;

  return recurringCommitmentSchema.parse({
    ...commitment,
    kind: resolvedKind,
    previousLastPaidPeriod: commitment.lastPaidPeriod,
    lastPaidPeriod: targetPeriodMonth,
    lastPaidCycles: effectiveCycles,
    lastPaidTransactionId: txId,
    paidInstallments: nextPaidInstallments,
    isActive: reachedPayoff ? false : commitment.isActive,
    ...(hasNextDueDate
      ? {
          previousNextDueDate: reachedPayoff ? undefined : commitment.nextDueDate,
          nextDueDate,
        }
      : {}),
  });
}

export interface AccountLinkedRecordsSummary {
  transactions: Transaction[];
  expenseCount: number;
  incomeCount: number;
  transferCount: number;
  recurringCommitments: SyncDataState['recurringCommitments'];
  incomeSources: SyncDataState['incomeSources'];
  totalCount: number;
  isLinked: boolean;
}

/**
 * Finds all transactions, recurring commitments/debts, and income sources linked to an account.
 */
export function getAccountLinkedRecords(
  state: Pick<SyncDataState, 'transactions' | 'recurringCommitments'> & {
    incomeSources?: SyncDataState['incomeSources'];
  },
  accountId: string,
): AccountLinkedRecordsSummary {
  const transactions = state.transactions.filter(
    (tx) => tx.accountId === accountId || tx.toAccountId === accountId,
  );
  let expenseCount = 0;
  let incomeCount = 0;
  let transferCount = 0;
  for (const tx of transactions) {
    if (tx.type === 'EXPENSE') {
      expenseCount += 1;
    } else if (tx.type === 'INCOME') {
      incomeCount += 1;
    } else if (tx.type === 'TRANSFER') {
      transferCount += 1;
    }
  }
  const recurringCommitments = state.recurringCommitments.filter(
    (rc) => rc.accountId === accountId,
  );
  const incomeSources = (state.incomeSources ?? []).filter(
    (src) => src.accountId === accountId,
  );
  const totalCount =
    transactions.length + recurringCommitments.length + incomeSources.length;

  return {
    transactions,
    expenseCount,
    incomeCount,
    transferCount,
    recurringCommitments,
    incomeSources,
    totalCount,
    isLinked: totalCount > 0,
  };
}

function formatLinkedNamesPreview(items: readonly { name: string }[]): string {
  const preview = items
    .slice(0, 2)
    .map((item) => item.name)
    .join(', ');
  return items.length > 2 ? `${preview}, ...` : preview;
}

/**
 * Formats a human-readable error message describing why an account cannot be deleted.
 */
export function formatAccountLinkedErrorMessage(
  summary: AccountLinkedRecordsSummary,
): string {
  if (summary.totalCount === 0) {
    return 'Account has no linked records.';
  }

  const parts: string[] = [];

  if (summary.transactions.length > 0) {
    const typeParts: string[] = [];
    if (summary.expenseCount > 0) {
      typeParts.push(
        `${summary.expenseCount} ${summary.expenseCount === 1 ? 'expense' : 'expenses'}`,
      );
    }
    if (summary.incomeCount > 0) {
      typeParts.push(`${summary.incomeCount} income`);
    }
    if (summary.transferCount > 0) {
      typeParts.push(
        `${summary.transferCount} ${summary.transferCount === 1 ? 'transfer' : 'transfers'}`,
      );
    }
    const txCount = summary.transactions.length;
    parts.push(
      `${txCount} ${txCount === 1 ? 'transaction' : 'transactions'} (${typeParts.join(', ')})`,
    );
  }

  if (summary.recurringCommitments.length > 0) {
    const count = summary.recurringCommitments.length;
    const namesPreview = formatLinkedNamesPreview(summary.recurringCommitments);
    parts.push(
      `${count} ${count === 1 ? 'debt or bill' : 'debts and bills'} (${namesPreview})`,
    );
  }

  if (summary.incomeSources.length > 0) {
    const count = summary.incomeSources.length;
    const namesPreview = formatLinkedNamesPreview(summary.incomeSources);
    parts.push(
      `${count} ${count === 1 ? 'payday source' : 'payday sources'} (${namesPreview})`,
    );
  }

  const joined = parts.length === 2 ? `${parts[0]} and ${parts[1]}` : parts.join(', ');
  return `Cannot delete this account: linked to ${joined}.`;
}

/**
 * Pure, replay-safe state transition for a single sync mutation.
 */
export function applySyncMutation(
  state: SyncDataState,
  mutation: SyncMutation,
): SyncDataState {
  switch (mutation.type) {
    case 'account.upsert': {
      const saved = accountSchema.parse(mutation.account);
      const existing = state.accounts.find((a) => a.id === saved.id);
      const nextAccount = existing
        ? {
            ...saved,
            balanceMinor: existing.balanceMinor,
            ...(saved.paidThroughPeriod === undefined &&
            existing.paidThroughPeriod !== undefined
              ? { paidThroughPeriod: existing.paidThroughPeriod }
              : {}),
            ...(saved.previousPaidThroughPeriod === undefined &&
            existing.previousPaidThroughPeriod !== undefined
              ? { previousPaidThroughPeriod: existing.previousPaidThroughPeriod }
              : {}),
            ...(saved.lastPaymentTransactionId === undefined &&
            existing.lastPaymentTransactionId !== undefined
              ? { lastPaymentTransactionId: existing.lastPaymentTransactionId }
              : {}),
            ...(saved.lastPaymentInstallmentTxPrefix === undefined &&
            existing.lastPaymentInstallmentTxPrefix !== undefined
              ? {
                  lastPaymentInstallmentTxPrefix:
                    existing.lastPaymentInstallmentTxPrefix,
                }
              : {}),
          }
        : saved;
      return {
        ...state,
        accounts: upsertById(state.accounts, nextAccount),
      };
    }

    case 'account.updateMetadata': {
      const existing = state.accounts.find((a) => a.id === mutation.account.id);
      if (!existing) {
        return state;
      }
      const updated = accountSchema.parse({
        ...mutation.account,
        balanceMinor: existing.balanceMinor,
        ...(mutation.account.paidThroughPeriod === undefined &&
        existing.paidThroughPeriod !== undefined
          ? { paidThroughPeriod: existing.paidThroughPeriod }
          : {}),
        ...(mutation.account.previousPaidThroughPeriod === undefined &&
        existing.previousPaidThroughPeriod !== undefined
          ? { previousPaidThroughPeriod: existing.previousPaidThroughPeriod }
          : {}),
        ...(mutation.account.lastPaymentTransactionId === undefined &&
        existing.lastPaymentTransactionId !== undefined
          ? { lastPaymentTransactionId: existing.lastPaymentTransactionId }
          : {}),
        ...(mutation.account.lastPaymentInstallmentTxPrefix === undefined &&
        existing.lastPaymentInstallmentTxPrefix !== undefined
          ? {
              lastPaymentInstallmentTxPrefix:
                existing.lastPaymentInstallmentTxPrefix,
            }
          : {}),
      });
      return {
        ...state,
        accounts: state.accounts.map((a) =>
          a.id === updated.id ? updated : a,
        ),
      };
    }

    case 'account.setBalance': {
      const existing = state.accounts.find((a) => a.id === mutation.accountId);
      if (!existing) {
        return state;
      }
      const updated = accountSchema.parse({
        ...existing,
        balanceMinor: clampMinor(mutation.balanceMinor),
      });
      return {
        ...state,
        accounts: state.accounts.map((a) =>
          a.id === updated.id ? updated : a,
        ),
      };
    }

    case 'account.delete': {
      if (state.accounts.length <= 1) {
        return state;
      }
      if (getAccountLinkedRecords(state, mutation.id).isLinked) {
        return state;
      }

      const nextAccounts = state.accounts.filter((a) => a.id !== mutation.id);
      if (nextAccounts.length === state.accounts.length) {
        return state;
      }

      const fallbackAccountId = nextAccounts[0]?.id;
      let nextSmartDefaults = state.smartDefaults;
      if (fallbackAccountId) {
        const lastAccountId =
          state.smartDefaults.lastAccountId === mutation.id
            ? fallbackAccountId
            : state.smartDefaults.lastAccountId;
        const lastTransferToAccountId =
          state.smartDefaults.lastTransferToAccountId === mutation.id
            ? (nextAccounts.find((a) => a.id !== lastAccountId)?.id ??
              fallbackAccountId)
            : state.smartDefaults.lastTransferToAccountId;

        nextSmartDefaults = {
          ...state.smartDefaults,
          lastAccountId,
          lastTransferToAccountId,
        };
      }

      return {
        ...state,
        accounts: nextAccounts,
        smartDefaults: nextSmartDefaults,
      };
    }

    case 'category.create': {
      if (state.categories.some((c) => c.id === mutation.category.id)) {
        return state;
      }
      const savedCategory = categorySchema.parse(mutation.category);
      return {
        ...state,
        categories: [...state.categories, savedCategory],
      };
    }

    case 'transaction.create': {
      return addTransactionToState(state, mutation.transaction);
    }

    case 'transaction.createBatch': {
      let nextAccounts = state.accounts;
      let nextCategories = state.categories;
      const existingIds = new Set(state.transactions.map((t) => t.id));
      const newTransactions: Transaction[] = [];

      for (const rawTx of mutation.transactions) {
        if (existingIds.has(rawTx.id)) {
          continue;
        }
        const tx = transactionSchema.parse(rawTx);
        if (!isTransactionAccountCompatible(nextAccounts, tx)) {
          continue;
        }
        existingIds.add(tx.id);
        nextAccounts = applyTransactionToAccounts(nextAccounts, tx, 1);
        if (tx.categoryId) {
          nextCategories = nextCategories.map((c) =>
            c.id === tx.categoryId
              ? { ...c, usageCount: c.usageCount + 1 }
              : c,
          );
        }
        newTransactions.push(tx);
      }

      if (newTransactions.length === 0) {
        return state;
      }

      return {
        ...state,
        accounts: nextAccounts,
        categories: nextCategories,
        transactions: [...newTransactions, ...state.transactions],
      };
    }

    case 'transaction.update': {
      const existingIndex = state.transactions.findIndex(
        (t) => t.id === mutation.input.id,
      );
      if (existingIndex < 0) {
        return state;
      }

      const existingTx = state.transactions[existingIndex];
      const updatedTx = transactionSchema.parse({
        ...mutation.input,
        createdAt: existingTx.createdAt,
      } as Transaction);
      if (!isTransactionAccountCompatible(state.accounts, updatedTx)) {
        return state;
      }

      const revertedAccounts = applyTransactionToAccounts(
        state.accounts,
        existingTx,
        -1,
      );
      const nextAccounts = applyTransactionToAccounts(
        revertedAccounts,
        updatedTx,
        1,
      );

      const oldCategoryId = existingTx.categoryId;
      const newCategoryId = updatedTx.categoryId;
      const nextCategories =
        oldCategoryId !== newCategoryId
          ? state.categories.map((c) => {
              const delta =
                (newCategoryId === c.id ? 1 : 0) -
                (oldCategoryId === c.id ? 1 : 0);
              if (delta === 0) {
                return c;
              }
              return {
                ...c,
                usageCount: Math.max(0, c.usageCount + delta),
              };
            })
          : state.categories;

      const nextSmartDefaults = updateSmartDefaultsForTransaction(
        state.smartDefaults,
        updatedTx,
      );

      return {
        ...state,
        accounts: nextAccounts,
        categories: nextCategories,
        smartDefaults: nextSmartDefaults,
        transactions: state.transactions.map((t, index) =>
          index === existingIndex ? updatedTx : t,
        ),
      };
    }

    case 'transaction.delete': {
      return deleteTransactionFromState(state, mutation.id);
    }

    case 'transactions.clearAll': {
      return {
        ...state,
        transactions: [],
        accounts: state.accounts.map((a) => ({ ...a, balanceMinor: 0 })),
        categories: state.categories.map((c) => ({ ...c, usageCount: 0 })),
      };
    }

    case 'budget.updateMonthly': {
      return {
        ...state,
        smartDefaults: smartDefaultsSchema.parse({
          ...state.smartDefaults,
          monthlyBudgetMinor: mutation.monthlyBudgetMinor,
        }),
      };
    }

    case 'incomeSource.upsert': {
      const saved = incomeSourceSchema.parse(mutation.source);
      return {
        ...state,
        incomeSources: upsertById(state.incomeSources, saved),
      };
    }

    case 'incomeSource.delete': {
      return {
        ...state,
        incomeSources: state.incomeSources.filter((src) => src.id !== mutation.id),
      };
    }

    case 'incomeSource.logPayday': {
      const source = state.incomeSources.find((src) => src.id === mutation.sourceId);
      if (!source) {
        return state;
      }
      if (state.transactions.some((tx) => tx.id === mutation.transactionId)) {
        return state;
      }
      const targetAccountId = mutation.accountId ?? source.accountId;
      const targetAccount = state.accounts.find((a) => a.id === targetAccountId);
      if (!targetAccount || targetAccount.currency !== source.currency) {
        return state;
      }

      const tx = transactionSchema.parse({
        id: mutation.transactionId,
        type: 'INCOME',
        amountMinor: mutation.amountMinor,
        currency: targetAccount.currency,
        accountId: targetAccountId,
        categoryId: source.categoryId || 'cat-salary',
        incomeSourceId: source.id,
        merchant: truncateText(source.name, 80) || 'Salary',
        ...(mutation.note ? { note: truncateText(mutation.note, 280) } : {}),
        occurredAt: mutation.occurredAt,
        createdAt: mutation.occurredAt,
      });

      return addTransactionToState(state, tx);
    }

    case 'commitment.upsert': {
      const saved = recurringCommitmentSchema.parse(mutation.commitment);
      return {
        ...state,
        recurringCommitments: upsertById(state.recurringCommitments, saved),
      };
    }

    case 'commitment.delete': {
      return {
        ...state,
        recurringCommitments: state.recurringCommitments.filter(
          (rc) => rc.id !== mutation.id,
        ),
      };
    }

    case 'commitment.pay': {
      const commitment = state.recurringCommitments.find(
        (rc) => rc.id === mutation.commitmentId,
      );
      if (!commitment || isCommitmentPaidOff(commitment)) {
        return state;
      }

      const paidDate = new Date(mutation.paidAtIso);
      const validDate = Number.isNaN(paidDate.getTime())
        ? new Date(mutation.clientTimestamp)
        : paidDate;
      const periodMonth =
        mutation.periodMonth ?? formatUtcPeriodMonth(validDate);

      const requestedCycles = mutation.cyclesCount ?? 1;
      const isAdvance =
        mutation.isAdvancePayment === true || requestedCycles > 1;

      if (
        !isAdvance &&
        commitment.lastPaidPeriod &&
        commitment.lastPaidPeriod >= periodMonth
      ) {
        return state;
      }

      if (state.transactions.some((tx) => tx.id === mutation.transactionId)) {
        return state;
      }

      const effectiveCycles = resolveEffectiveCommitmentCycles(
        commitment,
        requestedCycles,
      );
      if (effectiveCycles <= 0) {
        return state;
      }

      const targetAccountId = mutation.accountId ?? commitment.accountId;
      const targetAccount = state.accounts.find((a) => a.id === targetAccountId);
      if (!targetAccount || targetAccount.currency !== commitment.currency) {
        return state;
      }
      const currency = targetAccount.currency;
      const resolvedKind = normalizeCommitmentKind(
        commitment.kind,
        targetAccount.accountType,
      );
      const paidAmountMinor =
        mutation.actualAmountMinor ??
        clampMinor(commitment.amountMinor * effectiveCycles);

      const targetPeriod = resolveTargetPeriodForCommitmentPay(
        commitment,
        periodMonth,
        effectiveCycles,
      );

      const paidIso = validDate.toISOString();
      const rawNote = isAdvance
        ? `Advance payment (${effectiveCycles} ${
            effectiveCycles === 1 ? 'cycle' : 'cycles'
          } · thru ${formatPeriodMonthShort(targetPeriod)})`
        : (commitment.notes ??
          (resolvedKind === 'LOAN'
            ? 'Loan payment'
            : resolvedKind === 'CREDIT_CARD_INSTALLMENT'
              ? 'Credit card installment'
              : 'Monthly bill payment'));

      const tx = transactionSchema.parse({
        id: mutation.transactionId,
        type: 'EXPENSE',
        amountMinor: paidAmountMinor,
        currency,
        accountId: targetAccountId,
        categoryId: commitment.categoryId,
        commitmentId: commitment.id,
        merchant: truncateText(commitment.name, 80) || 'Scheduled Payment',
        note: truncateText(rawNote, 280),
        occurredAt: paidIso,
        createdAt: paidIso,
      });

      const stateAfterTx = addTransactionToState(state, tx);
      const updatedCommitment = advanceCommitmentOnPay(
        commitment,
        periodMonth,
        tx.id,
        targetAccount.accountType,
        effectiveCycles,
      );

      return {
        ...stateAfterTx,
        recurringCommitments: stateAfterTx.recurringCommitments.map((rc) =>
          rc.id === commitment.id ? updatedCommitment : rc,
        ),
      };
    }

    case 'commitment.unpay': {
      const commitment = state.recurringCommitments.find(
        (rc) => rc.id === mutation.commitmentId,
      );
      if (!commitment) {
        return state;
      }
      return revertCommitmentOnUnpay(state, commitment);
    }

    case 'creditCard.payBill': {
      const cardAccount = state.accounts.find(
        (a) => a.id === mutation.creditCardAccountId,
      );
      const paymentAccount = state.accounts.find(
        (a) => a.id === mutation.paymentAccountId,
      );
      if (
        !cardAccount ||
        !paymentAccount ||
        cardAccount.accountType !== 'CREDIT_CARD' ||
        cardAccount.id === paymentAccount.id ||
        cardAccount.currency !== paymentAccount.currency
      ) {
        return state;
      }

      if (state.transactions.some((tx) => tx.id === mutation.transferTransactionId)) {
        return state;
      }

      const paidDate = new Date(mutation.paidAtIso);
      const validDate = Number.isNaN(paidDate.getTime())
        ? new Date(mutation.clientTimestamp)
        : paidDate;
      const paidIso = validDate.toISOString();
      const periodMonth =
        mutation.periodMonth ?? formatUtcPeriodMonth(validDate);

      const isAdvance =
        typeof mutation.advanceMonths === 'number' &&
        mutation.advanceMonths >= 1;
      const monthsCount = isAdvance ? mutation.advanceMonths! : 1;

      let workingState = state;
      const summaryBefore = computeCreditCardBillSummary({
        account: cardAccount,
        commitments: workingState.recurringCommitments,
        transactions: workingState.transactions,
        currentDate: validDate,
      });

      const dueInstallments = workingState.recurringCommitments.filter(
        (rc) =>
          rc.accountId === cardAccount.id &&
          normalizeCommitmentKind(rc.kind, cardAccount.accountType) ===
            'CREDIT_CARD_INSTALLMENT' &&
          rc.isActive &&
          !isCommitmentPaidOff(rc) &&
          (isAdvance || !(rc.lastPaidPeriod && rc.lastPaidPeriod >= periodMonth)) &&
          rc.currency === cardAccount.currency,
      );

      let processedAnyInstallment = false;
      for (const inst of dueInstallments) {
        const effectiveCycles = resolveEffectiveCommitmentCycles(
          inst,
          monthsCount,
        );
        if (effectiveCycles <= 0) {
          continue;
        }
        const instTxId = `${mutation.installmentTxPrefix}-${inst.id}`;
        if (workingState.transactions.some((tx) => tx.id === instTxId)) {
          continue;
        }
        processedAnyInstallment = true;
        const instAmountMinor = clampMinor(inst.amountMinor * effectiveCycles);
        const instTx = transactionSchema.parse({
          id: instTxId,
          type: 'EXPENSE',
          amountMinor: instAmountMinor,
          currency: cardAccount.currency,
          accountId: cardAccount.id,
          categoryId: inst.categoryId,
          commitmentId: inst.id,
          merchant: truncateText(inst.name, 80) || 'Card Installment',
          note: truncateText(
            effectiveCycles > 1
              ? `Advance card installment (${effectiveCycles} cycles)`
              : (inst.notes ?? 'Credit card installment'),
            280,
          ),
          occurredAt: paidIso,
          createdAt: paidIso,
        });
        workingState = addTransactionToState(workingState, instTx, {
          updateSmartDefaults: false,
        });
        const updatedInst = advanceCommitmentOnPay(
          inst,
          periodMonth,
          instTx.id,
          cardAccount.accountType,
          effectiveCycles,
        );
        workingState = {
          ...workingState,
          recurringCommitments: workingState.recurringCommitments.map((rc) =>
            rc.id === inst.id ? updatedInst : rc,
          ),
        };
      }

      const refreshedCard = workingState.accounts.find(
        (a) => a.id === cardAccount.id,
      );
      const owedMinor = refreshedCard
        ? Math.max(0, -refreshedCard.balanceMinor)
        : 0;
      const transferAmountMinor = mutation.amountOverrideMinor ?? owedMinor;

      const remainingInstallmentsBalance = workingState.recurringCommitments
        .filter(
          (rc) =>
            rc.accountId === cardAccount.id &&
            normalizeCommitmentKind(rc.kind, cardAccount.accountType) ===
              'CREDIT_CARD_INSTALLMENT' &&
            rc.isActive &&
            !isCommitmentPaidOff(rc),
        )
        .reduce(
          (sum, rc) => sum + computeInstallmentProgress(rc).remainingBalanceMinor,
          0,
        );

      if (transferAmountMinor > 0) {
        const settlesAll =
          transferAmountMinor >= owedMinor && remainingInstallmentsBalance === 0;
        const transferNote = isAdvance
          ? settlesAll
            ? 'Paid credit card bill in full'
            : `Advance credit card payment (${monthsCount} ${
                monthsCount === 1 ? 'month' : 'months'
              })`
          : transferAmountMinor < owedMinor
            ? 'Credit card paydown payment'
            : 'Paid credit card bill in full';

        const transferTx = transactionSchema.parse({
          id: mutation.transferTransactionId,
          type: 'TRANSFER',
          amountMinor: transferAmountMinor,
          currency: cardAccount.currency,
          accountId: paymentAccount.id,
          toAccountId: cardAccount.id,
          merchant: truncateText(`${cardAccount.name} Bill Payment`, 80),
          note: transferNote,
          occurredAt: paidIso,
          createdAt: paidIso,
        });
        workingState = addTransactionToState(workingState, transferTx, {
          updateSmartDefaults: false,
        });
      }

      const cardAfterTransfer = workingState.accounts.find(
        (a) => a.id === cardAccount.id,
      );
      const remainingCardDebt =
        (cardAfterTransfer ? Math.max(0, -cardAfterTransfer.balanceMinor) : 0) +
        remainingInstallmentsBalance;

      if (cardAfterTransfer) {
        let nextPaidThroughPeriod = cardAfterTransfer.paidThroughPeriod;
        if (remainingCardDebt === 0) {
          nextPaidThroughPeriod = undefined;
        } else if (isAdvance) {
          nextPaidThroughPeriod = resolveTargetPeriodForCreditCardAdvance({
            account: cardAccount,
            upcomingBillMinor: summaryBefore.upcomingBillMinor,
            isPaidForCurrentMonth: summaryBefore.isPaidForCurrentMonth,
            basePeriodMonth: periodMonth,
            advanceMonths: monthsCount,
            referenceDate: validDate,
          });
        }

        const didRecordPayment =
          transferAmountMinor > 0 || processedAnyInstallment;

        if (
          didRecordPayment ||
          nextPaidThroughPeriod !== cardAfterTransfer.paidThroughPeriod
        ) {
          workingState = {
            ...workingState,
            accounts: workingState.accounts.map((a) => {
              if (a.id !== cardAccount.id) {
                return a;
              }
              const nextAccountRaw: Record<string, unknown> = { ...a };
              if (nextPaidThroughPeriod === undefined) {
                delete nextAccountRaw.paidThroughPeriod;
              } else {
                nextAccountRaw.paidThroughPeriod = nextPaidThroughPeriod;
              }
              if (didRecordPayment) {
                if (cardAccount.paidThroughPeriod === undefined) {
                  delete nextAccountRaw.previousPaidThroughPeriod;
                } else {
                  nextAccountRaw.previousPaidThroughPeriod =
                    cardAccount.paidThroughPeriod;
                }
                if (transferAmountMinor > 0) {
                  nextAccountRaw.lastPaymentTransactionId =
                    mutation.transferTransactionId;
                } else {
                  delete nextAccountRaw.lastPaymentTransactionId;
                }
                if (processedAnyInstallment) {
                  nextAccountRaw.lastPaymentInstallmentTxPrefix =
                    mutation.installmentTxPrefix;
                } else {
                  delete nextAccountRaw.lastPaymentInstallmentTxPrefix;
                }
              }
              return accountSchema.parse(nextAccountRaw);
            }),
          };
        }
      }

      return workingState;
    }

    case 'creditCard.unpayBill': {
      const cardAccount = state.accounts.find(
        (a) => a.id === mutation.creditCardAccountId,
      );
      if (
        !cardAccount ||
        cardAccount.accountType !== 'CREDIT_CARD' ||
        (!cardAccount.lastPaymentTransactionId &&
          !cardAccount.lastPaymentInstallmentTxPrefix &&
          !cardAccount.paidThroughPeriod)
      ) {
        return state;
      }

      let workingState = state;
      if (cardAccount.lastPaymentTransactionId) {
        workingState = deleteTransactionFromState(
          workingState,
          cardAccount.lastPaymentTransactionId,
        );
      }

      if (cardAccount.lastPaymentInstallmentTxPrefix) {
        const prefix = `${cardAccount.lastPaymentInstallmentTxPrefix}-`;
        const matchingInstallments = workingState.recurringCommitments.filter(
          (rc) =>
            rc.accountId === cardAccount.id &&
            rc.lastPaidTransactionId?.startsWith(prefix),
        );
        for (const inst of matchingInstallments) {
          workingState = revertCommitmentOnUnpay(workingState, inst);
        }
      }

      return {
        ...workingState,
        accounts: workingState.accounts.map((a) => {
          if (a.id !== cardAccount.id) {
            return a;
          }
          const nextRaw: Record<string, unknown> = { ...a };
          if (cardAccount.previousPaidThroughPeriod === undefined) {
            delete nextRaw.paidThroughPeriod;
          } else {
            nextRaw.paidThroughPeriod = cardAccount.previousPaidThroughPeriod;
          }
          delete nextRaw.previousPaidThroughPeriod;
          delete nextRaw.lastPaymentTransactionId;
          delete nextRaw.lastPaymentInstallmentTxPrefix;
          return accountSchema.parse(nextRaw);
        }),
      };
    }

    case 'state.resetDemo': {
      const parsedDate = new Date(mutation.referenceIso);
      return createInitialSyncDataState(
        Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate,
      );
    }

    case 'backup.import': {
      const { envelope, mode } = mutation;
      if (mode === 'overwrite') {
        const dedupedAccounts = mergeById([], envelope.data.accounts).map((a) =>
          accountSchema.parse(a),
        );
        const safeAccounts =
          dedupedAccounts.length > 0 ? dedupedAccounts : state.accounts;

        return {
          accounts: safeAccounts,
          categories: mergeById([], envelope.data.categories).map((c) =>
            categorySchema.parse(c),
          ),
          transactions: mergeById([], envelope.data.transactions).map((t) =>
            transactionSchema.parse(t),
          ),
          recurringCommitments: mergeById(
            [],
            envelope.data.recurringCommitments,
          ).map((rc) => recurringCommitmentSchema.parse(rc)),
          incomeSources: mergeById([], envelope.data.incomeSources ?? []).map((src) =>
            incomeSourceSchema.parse(src),
          ),
          smartDefaults: envelope.data.smartDefaults
            ? smartDefaultsSchema.parse(envelope.data.smartDefaults)
            : state.smartDefaults,
        };
      }

      const mergedMerchants = Array.from(
        new Set([
          ...state.smartDefaults.recentMerchants,
          ...(envelope.data.smartDefaults?.recentMerchants ?? []),
        ]),
      ).slice(0, 16);

      return {
        accounts: mergeById(state.accounts, envelope.data.accounts).map((a) =>
          accountSchema.parse(a),
        ),
        categories: mergeById(state.categories, envelope.data.categories).map(
          (c) => categorySchema.parse(c),
        ),
        transactions: mergeById(
          state.transactions,
          envelope.data.transactions,
        ).map((t) => transactionSchema.parse(t)),
        recurringCommitments: mergeById(
          state.recurringCommitments,
          envelope.data.recurringCommitments,
        ).map((rc) => recurringCommitmentSchema.parse(rc)),
        incomeSources: mergeById(
          state.incomeSources,
          envelope.data.incomeSources ?? [],
        ).map((src) => incomeSourceSchema.parse(src)),
        smartDefaults: smartDefaultsSchema.parse({
          ...state.smartDefaults,
          recentMerchants: mergedMerchants,
          monthlyBudgetMinor:
            envelope.data.smartDefaults?.monthlyBudgetMinor ??
            state.smartDefaults.monthlyBudgetMinor,
        }),
      };
    }
  }
}

/**
 * Applies a sequence of sync mutations deterministically without mutating the input state.
 */
export function applySyncMutations(
  initialState: SyncDataState,
  mutations: readonly SyncMutation[],
): SyncDataState {
  let current = initialState;
  for (const mutation of mutations) {
    current = applySyncMutation(current, mutation);
  }
  return current;
}
