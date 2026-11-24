import { DEFAULT_CURRENCY, MAX_SAFE_MONEY_MINOR } from './money';
import { categoryBudgetSchema } from './category-budget.schema';
import { quickPresetSchema } from './presets.schema';
import {
  balanceReconciliationSchema,
  computeReconciliationDelta,
} from './reconciliation.schema';
import {
  advanceNextDueDate,
  isCommitmentPaidOff,
  recurringCommitmentSchema,
} from './recurring.schema';
import { sinkingFundSchema } from './sinking-funds.schema';
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

function deduplicateTransactionSplits(tx: Transaction): Transaction {
  if (!tx.splits || tx.splits.length === 0) {
    return tx;
  }
  const seen = new Map<string, (typeof tx.splits)[number]>();
  for (const split of tx.splits) {
    seen.set(split.id, split);
  }
  return {
    ...tx,
    splits: Array.from(seen.values()),
  };
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
      knownTags: [],
      monthlyBudgetMinor: 250000,
    },
    categoryBudgets: [],
    recurringCommitments: [],
    sinkingFunds: [],
    quickPresets: [],
    reconciliations: [],
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

function getTransactionCategoryIds(tx: Transaction): Set<string> {
  const ids = new Set<string>();
  if (tx.splits && tx.splits.length > 0) {
    for (const split of tx.splits) {
      ids.add(split.categoryId);
    }
  } else if (tx.categoryId) {
    ids.add(tx.categoryId);
  }
  return ids;
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

  const knownTags = [...smartDefaults.knownTags];
  if (tx.tags && tx.tags.length > 0) {
    const normalizedNewTags = tx.tags
      .map((tag) => tag.trim().replace(/^#+/, ''))
      .filter((tag) => tag.length > 0);

    const existingLower = new Set(knownTags.map((t) => t.toLowerCase()));
    for (const tag of normalizedNewTags) {
      if (!existingLower.has(tag.toLowerCase())) {
        knownTags.push(tag);
        existingLower.add(tag.toLowerCase());
      }
    }
  }

  return {
    ...smartDefaults,
    lastAccountId: tx.accountId,
    ...(tx.type === 'TRANSFER' && tx.toAccountId
      ? { lastTransferToAccountId: tx.toAccountId }
      : {}),
    recentMerchants,
    knownTags,
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

  const tx = transactionSchema.parse(deduplicateTransactionSplits(rawTx));
  if (!isTransactionAccountCompatible(state.accounts, tx)) {
    return state;
  }
  const nextAccounts = applyTransactionToAccounts(state.accounts, tx, 1);

  const categoryIdsToIncrement = getTransactionCategoryIds(tx);
  const nextCategories =
    categoryIdsToIncrement.size > 0
      ? state.categories.map((c) =>
          categoryIdsToIncrement.has(c.id)
            ? { ...c, usageCount: c.usageCount + 1 }
            : c,
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

  const nextAccounts = applyTransactionToAccounts(state.accounts, tx, -1);
  const categoryIdsToDecrement = getTransactionCategoryIds(tx);
  const nextCategories =
    categoryIdsToDecrement.size > 0
      ? state.categories.map((c) =>
          categoryIdsToDecrement.has(c.id)
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

export interface AccountLinkedRecordsSummary {
  transactions: Transaction[];
  expenseCount: number;
  incomeCount: number;
  transferCount: number;
  recurringCommitments: SyncDataState['recurringCommitments'];
  sinkingFunds: SyncDataState['sinkingFunds'];
  totalCount: number;
  isLinked: boolean;
}

/**
 * Finds all transactions, recurring commitments, and sinking funds linked to an account.
 */
export function getAccountLinkedRecords(
  state: Pick<SyncDataState, 'transactions' | 'recurringCommitments' | 'sinkingFunds'>,
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
  const sinkingFunds = state.sinkingFunds.filter((sf) => sf.accountId === accountId);
  const totalCount =
    transactions.length + recurringCommitments.length + sinkingFunds.length;

  return {
    transactions,
    expenseCount,
    incomeCount,
    transferCount,
    recurringCommitments,
    sinkingFunds,
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
      `${count} ${count === 1 ? 'recurring bill' : 'recurring bills'} (${namesPreview})`,
    );
  }

  if (summary.sinkingFunds.length > 0) {
    const count = summary.sinkingFunds.length;
    const namesPreview = formatLinkedNamesPreview(summary.sinkingFunds);
    parts.push(
      `${count} ${count === 1 ? 'sinking fund' : 'sinking funds'} (${namesPreview})`,
    );
  }

  const joined = parts.length === 2 ? `${parts[0]} and ${parts[1]}` : parts.join(', ');
  return `Cannot delete this account: linked to ${joined}.`;
}

/**
 * Pure, replay-safe state transition for a single sync mutation.
 * Safe when mutations from multiple devices replay concurrently.
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
        ? { ...saved, balanceMinor: existing.balanceMinor }
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
        const tx = transactionSchema.parse(deduplicateTransactionSplits(rawTx));
        if (!isTransactionAccountCompatible(nextAccounts, tx)) {
          continue;
        }
        existingIds.add(tx.id);
        nextAccounts = applyTransactionToAccounts(nextAccounts, tx, 1);
        const categoryIdsToIncrement = getTransactionCategoryIds(tx);
        if (categoryIdsToIncrement.size > 0) {
          nextCategories = nextCategories.map((c) =>
            categoryIdsToIncrement.has(c.id)
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
      const updatedTx = transactionSchema.parse(
        deduplicateTransactionSplits({
          ...mutation.input,
          createdAt: existingTx.createdAt,
        } as Transaction),
      );
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

      const oldCategoryIds = getTransactionCategoryIds(existingTx);
      const newCategoryIds = getTransactionCategoryIds(updatedTx);
      const nextCategories =
        oldCategoryIds.size > 0 || newCategoryIds.size > 0
          ? state.categories.map((c) => {
              const delta =
                (newCategoryIds.has(c.id) ? 1 : 0) -
                (oldCategoryIds.has(c.id) ? 1 : 0);
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
        reconciliations: [],
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

    case 'categoryBudget.upsert': {
      const saved = categoryBudgetSchema.parse(mutation.budget);
      return {
        ...state,
        categoryBudgets: upsertById(state.categoryBudgets, saved),
      };
    }

    case 'categoryBudget.delete': {
      return {
        ...state,
        categoryBudgets: state.categoryBudgets.filter((b) => b.id !== mutation.id),
      };
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

      if (commitment.lastPaidPeriod === periodMonth) {
        return state;
      }

      if (state.transactions.some((tx) => tx.id === mutation.transactionId)) {
        return state;
      }

      const targetAccountId = mutation.accountId ?? commitment.accountId;
      const targetAccount = state.accounts.find((a) => a.id === targetAccountId);
      if (!targetAccount || targetAccount.currency !== commitment.currency) {
        return state;
      }
      const currency = targetAccount.currency;

      const isInstallment = commitment.kind === 'INSTALLMENT';
      const hasTerms =
        isInstallment ||
        (typeof commitment.totalInstallments === 'number' &&
          commitment.totalInstallments > 0);

      const paidIso = validDate.toISOString();
      const rawNote =
        commitment.notes ??
        (isInstallment
          ? 'Loan installment payment'
          : 'Scheduled recurring payment');

      const tx = transactionSchema.parse({
        id: mutation.transactionId,
        type: 'EXPENSE',
        amountMinor: commitment.amountMinor,
        currency,
        accountId: targetAccountId,
        categoryId: commitment.categoryId,
        merchant: truncateText(commitment.name, 80) || 'Scheduled Payment',
        note: truncateText(rawNote, 280),
        tags: isInstallment ? ['loan', 'recurring'] : ['recurring'],
        occurredAt: paidIso,
        createdAt: paidIso,
      });

      const stateAfterTx = addTransactionToState(state, tx);

      const nextPaidInstallments = hasTerms
        ? commitment.paidInstallments + 1
        : commitment.paidInstallments;
      const reachedPayoff =
        typeof commitment.totalInstallments === 'number' &&
        commitment.totalInstallments > 0 &&
        nextPaidInstallments >= commitment.totalInstallments;

      const hasNextDueDate = Boolean(commitment.nextDueDate);
      const nextDueDate =
        hasNextDueDate && !reachedPayoff && commitment.nextDueDate
          ? advanceNextDueDate(
              commitment.nextDueDate,
              commitment.frequency,
              commitment.dueDay,
            )
          : commitment.nextDueDate;

      const updatedCommitment = recurringCommitmentSchema.parse({
        ...commitment,
        lastPaidPeriod: periodMonth,
        lastPaidTransactionId: tx.id,
        paidInstallments: nextPaidInstallments,
        isActive: reachedPayoff ? false : commitment.isActive,
        ...(hasNextDueDate
          ? {
              previousNextDueDate: reachedPayoff
                ? undefined
                : commitment.nextDueDate,
              nextDueDate,
            }
          : {}),
      });

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
      if (
        !commitment ||
        (!commitment.lastPaidPeriod && !commitment.lastPaidTransactionId)
      ) {
        return state;
      }

      const stateAfterDelete = commitment.lastPaidTransactionId
        ? deleteTransactionFromState(state, commitment.lastPaidTransactionId)
        : state;

      const hasTerms =
        commitment.kind === 'INSTALLMENT' ||
        (typeof commitment.totalInstallments === 'number' &&
          commitment.totalInstallments > 0);
      const nextPaidInstallments = hasTerms
        ? Math.max(0, commitment.paidInstallments - 1)
        : commitment.paidInstallments;

      const updatedCommitment = recurringCommitmentSchema.parse({
        ...commitment,
        lastPaidPeriod: undefined,
        lastPaidTransactionId: undefined,
        paidInstallments: nextPaidInstallments,
        isActive: hasTerms ? true : commitment.isActive,
        nextDueDate: commitment.previousNextDueDate ?? commitment.nextDueDate,
        previousNextDueDate: undefined,
      });

      return {
        ...stateAfterDelete,
        recurringCommitments: stateAfterDelete.recurringCommitments.map((rc) =>
          rc.id === commitment.id ? updatedCommitment : rc,
        ),
      };
    }

    case 'sinkingFund.upsert': {
      const saved = sinkingFundSchema.parse(mutation.fund);
      return {
        ...state,
        sinkingFunds: upsertById(state.sinkingFunds, saved),
      };
    }

    case 'sinkingFund.delete': {
      return {
        ...state,
        sinkingFunds: state.sinkingFunds.filter((sf) => sf.id !== mutation.id),
      };
    }

    case 'sinkingFund.contribute': {
      const fund = state.sinkingFunds.find((sf) => sf.id === mutation.fundId);
      if (!fund) {
        return state;
      }
      if (state.transactions.some((tx) => tx.id === mutation.transactionId)) {
        return state;
      }

      const sourceAccount = state.accounts.find(
        (a) => a.id === mutation.sourceAccountId,
      );
      if (!sourceAccount) {
        return state;
      }
      const isTransfer = mutation.sourceAccountId !== fund.accountId;
      if (isTransfer) {
        const destAccount = state.accounts.find((a) => a.id === fund.accountId);
        if (!destAccount || destAccount.currency !== sourceAccount.currency) {
          return state;
        }
      }
      const sourceCurrency = sourceAccount.currency;

      const merchant = truncateText(fund.name, 80) || 'Sinking Fund';
      const note = truncateText(`Contribution to ${fund.name}`, 280);

      const tx = isTransfer
        ? transactionSchema.parse({
            id: mutation.transactionId,
            type: 'TRANSFER',
            amountMinor: mutation.amountMinor,
            currency: sourceCurrency,
            accountId: mutation.sourceAccountId,
            toAccountId: fund.accountId,
            merchant,
            note,
            tags: ['sinking-fund'],
            occurredAt: mutation.occurredAt,
            createdAt: mutation.occurredAt,
          })
        : transactionSchema.parse({
            id: mutation.transactionId,
            type: 'EXPENSE',
            amountMinor: mutation.amountMinor,
            currency: sourceCurrency,
            accountId: mutation.sourceAccountId,
            categoryId: 'cat-home',
            merchant,
            note,
            tags: ['sinking-fund'],
            occurredAt: mutation.occurredAt,
            createdAt: mutation.occurredAt,
          });

      const stateAfterTx = addTransactionToState(state, tx);
      if (stateAfterTx === state) {
        return state;
      }
      const newSavedMinor = clampMinor(fund.currentSavedMinor + mutation.amountMinor);
      const updatedFund = sinkingFundSchema.parse({
        ...fund,
        currentSavedMinor: newSavedMinor,
        isCompleted: newSavedMinor >= fund.targetAmountMinor,
      });

      return {
        ...stateAfterTx,
        sinkingFunds: stateAfterTx.sinkingFunds.map((sf) =>
          sf.id === fund.id ? updatedFund : sf,
        ),
      };
    }

    case 'quickPreset.upsert': {
      const saved = quickPresetSchema.parse(mutation.preset);
      return {
        ...state,
        quickPresets: upsertById(state.quickPresets, saved),
      };
    }

    case 'quickPreset.delete': {
      return {
        ...state,
        quickPresets: state.quickPresets.filter((qp) => qp.id !== mutation.id),
      };
    }

    case 'reconciliation.apply': {
      if (
        state.reconciliations.some((r) => r.id === mutation.reconciliationId)
      ) {
        return state;
      }
      const account = state.accounts.find((a) => a.id === mutation.accountId);
      if (!account) {
        return state;
      }

      const delta = computeReconciliationDelta(
        account.balanceMinor,
        mutation.actualBalanceMinor,
      );

      let workingState = state;
      let adjustmentTransactionId: string | undefined;

      if (mutation.createAdjustment && delta.needsAdjustment) {
        const derivedTxId =
          mutation.adjustmentTransactionId ?? `${mutation.reconciliationId}-adj`;
        const adjustmentTx = transactionSchema.parse({
          id: derivedTxId,
          type: delta.adjustmentType === 'INCOME' ? 'INCOME' : 'EXPENSE',
          amountMinor: Math.min(delta.adjustmentAmountMinor, MAX_SAFE_MONEY_MINOR),
          currency: account.currency ?? DEFAULT_CURRENCY,
          accountId: mutation.accountId,
          categoryId:
            delta.adjustmentType === 'INCOME' ? 'cat-other-income' : 'cat-dues',
          merchant: 'Balance Adjustment',
          note: truncateText(mutation.notes || 'Reconciliation adjustment', 280),
          tags: ['reconciliation'],
          occurredAt: mutation.reconciledAt,
          createdAt: mutation.reconciledAt,
        });
        workingState = addTransactionToState(workingState, adjustmentTx);
        adjustmentTransactionId = adjustmentTx.id;
      }

      const reconciledAccounts = workingState.accounts.map((a) =>
        a.id === mutation.accountId
          ? accountSchema.parse({
              ...a,
              balanceMinor: mutation.actualBalanceMinor,
            })
          : a,
      );

      const reconciliation = balanceReconciliationSchema.parse({
        id: mutation.reconciliationId,
        accountId: mutation.accountId,
        appBalanceMinor: account.balanceMinor,
        actualBalanceMinor: mutation.actualBalanceMinor,
        discrepancyMinor: delta.discrepancyMinor,
        reconciledAt: mutation.reconciledAt,
        ...(adjustmentTransactionId ? { adjustmentTransactionId } : {}),
      });

      return {
        ...workingState,
        accounts: reconciledAccounts,
        reconciliations: [...workingState.reconciliations, reconciliation],
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
            transactionSchema.parse(deduplicateTransactionSplits(t)),
          ),
          categoryBudgets: mergeById([], envelope.data.categoryBudgets).map((b) =>
            categoryBudgetSchema.parse(b),
          ),
          recurringCommitments: mergeById(
            [],
            envelope.data.recurringCommitments,
          ).map((rc) => recurringCommitmentSchema.parse(rc)),
          sinkingFunds: mergeById([], envelope.data.sinkingFunds).map((sf) =>
            sinkingFundSchema.parse(sf),
          ),
          quickPresets: mergeById([], envelope.data.quickPresets).map((qp) =>
            quickPresetSchema.parse(qp),
          ),
          smartDefaults: envelope.data.smartDefaults
            ? smartDefaultsSchema.parse(envelope.data.smartDefaults)
            : state.smartDefaults,
          reconciliations: state.reconciliations,
        };
      }

      const mergedKnownTags = Array.from(
        new Set([
          ...state.smartDefaults.knownTags,
          ...(envelope.data.smartDefaults?.knownTags ?? []),
        ]),
      );

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
        ).map((t) => transactionSchema.parse(deduplicateTransactionSplits(t))),
        categoryBudgets: mergeById(
          state.categoryBudgets,
          envelope.data.categoryBudgets,
        ).map((b) => categoryBudgetSchema.parse(b)),
        recurringCommitments: mergeById(
          state.recurringCommitments,
          envelope.data.recurringCommitments,
        ).map((rc) => recurringCommitmentSchema.parse(rc)),
        sinkingFunds: mergeById(
          state.sinkingFunds,
          envelope.data.sinkingFunds,
        ).map((sf) => sinkingFundSchema.parse(sf)),
        quickPresets: mergeById(
          state.quickPresets,
          envelope.data.quickPresets,
        ).map((qp) => quickPresetSchema.parse(qp)),
        smartDefaults: smartDefaultsSchema.parse({
          ...state.smartDefaults,
          knownTags: mergedKnownTags,
          recentMerchants: mergedMerchants,
          monthlyBudgetMinor:
            envelope.data.smartDefaults?.monthlyBudgetMinor ??
            state.smartDefaults.monthlyBudgetMinor,
        }),
        reconciliations: state.reconciliations,
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
