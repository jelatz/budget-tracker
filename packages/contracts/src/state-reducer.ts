import { DEFAULT_CURRENCY, MAX_SAFE_MONEY_MINOR } from './money';
import { categoryBudgetSchema } from './category-budget.schema';
import { quickPresetSchema, DEFAULT_PRESETS } from './presets.schema';
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
  createDefaultTransactions,
  DEFAULT_ACCOUNTS,
  DEFAULT_CATEGORIES,
  DEFAULT_TAGS,
  smartDefaultsSchema,
  transactionSchema,
  type Account,
  type SmartDefaults,
  type Transaction,
} from './transactions.schema';
import type { SyncDataState, SyncMutation } from './sync.schema';

function formatLocalPeriodMonth(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

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
 * Builds the default starter dataset used for new accounts and demo resets.
 */
export function createInitialSyncDataState(referenceDate = new Date()): SyncDataState {
  const firstAccountId = DEFAULT_ACCOUNTS[0]?.id ?? 'account-bank';
  const savingsAccountId =
    DEFAULT_ACCOUNTS[3]?.id ?? DEFAULT_ACCOUNTS[0]?.id ?? 'account-savings';

  const initialCategoryUsage: Record<string, number> = {
    'cat-salary': 1,
    'cat-daily-living': 2,
    'cat-home': 1,
    'cat-transportation': 1,
    'cat-dues': 1,
  };

  const year = referenceDate.getFullYear();
  const currentPeriod = formatLocalPeriodMonth(referenceDate);

  return {
    accounts: DEFAULT_ACCOUNTS.map((a) => ({ ...a })),
    categories: DEFAULT_CATEGORIES.map((c) => ({
      ...c,
      usageCount: initialCategoryUsage[c.id] ?? 0,
    })),
    transactions: createDefaultTransactions(referenceDate),
    smartDefaults: {
      lastAccountId: firstAccountId,
      lastTransferToAccountId: savingsAccountId,
      recentMerchants: ['Whole Foods', 'Target', 'Shell', 'Starbucks', 'Amazon'],
      knownTags: [...DEFAULT_TAGS],
      monthlyBudgetMinor: 250000,
    },
    categoryBudgets: [
      {
        id: `budget-daily-living-${currentPeriod}`,
        categoryId: 'cat-daily-living',
        periodMonth: currentPeriod,
        assignedMinor: 75000,
        rolloverEnabled: true,
        notes: 'Monthly daily living & groceries envelope',
      },
      {
        id: `budget-home-${currentPeriod}`,
        categoryId: 'cat-home',
        periodMonth: currentPeriod,
        assignedMinor: 40000,
        rolloverEnabled: false,
        notes: 'Monthly home & household envelope',
      },
      {
        id: `budget-transportation-${currentPeriod}`,
        categoryId: 'cat-transportation',
        periodMonth: currentPeriod,
        assignedMinor: 15000,
        rolloverEnabled: true,
        notes: 'Monthly transportation envelope',
      },
      {
        id: `budget-entertainment-${currentPeriod}`,
        categoryId: 'cat-entertainment',
        periodMonth: currentPeriod,
        assignedMinor: 10000,
        rolloverEnabled: false,
        notes: 'Monthly entertainment envelope',
      },
    ],
    recurringCommitments: [
      {
        id: 'commitment-rent',
        name: 'Apartment Rent',
        kind: 'RECURRING',
        amountMinor: 120000,
        currency: DEFAULT_CURRENCY,
        accountId: 'account-bank',
        categoryId: 'cat-home',
        frequency: 'MONTHLY',
        dueDay: 1,
        isAutoPaid: true,
        isActive: true,
        paidInstallments: 0,
        notes: 'Monthly rent commitment',
      },
      {
        id: 'commitment-electric',
        name: 'Electric Bill',
        kind: 'RECURRING',
        amountMinor: 9500,
        currency: DEFAULT_CURRENCY,
        accountId: 'account-bank',
        categoryId: 'cat-dues',
        frequency: 'MONTHLY',
        dueDay: 15,
        isAutoPaid: false,
        isActive: true,
        paidInstallments: 0,
        notes: 'Monthly electric utility',
      },
      {
        id: 'commitment-netflix',
        name: 'Netflix',
        kind: 'RECURRING',
        amountMinor: 1600,
        currency: DEFAULT_CURRENCY,
        accountId: 'account-card',
        categoryId: 'cat-subscription',
        frequency: 'MONTHLY',
        dueDay: 20,
        isAutoPaid: true,
        isActive: true,
        paidInstallments: 0,
        notes: 'Streaming subscription',
      },
    ],
    sinkingFunds: [
      {
        id: 'fund-car-insurance',
        name: 'Car Insurance',
        icon: '🚗',
        color: '#3B82F6',
        targetAmountMinor: 60000,
        currentSavedMinor: 20000,
        targetDate: `${year}-12-31`,
        accountId: 'account-savings',
        monthlyContributionMinor: 10000,
        isCompleted: false,
        notes: 'Semi-annual car insurance premium',
      },
      {
        id: 'fund-holiday-gifts',
        name: 'Holiday Gifts',
        icon: '🎁',
        color: '#EC4899',
        targetAmountMinor: 40000,
        currentSavedMinor: 10000,
        targetDate: `${year}-12-25`,
        accountId: 'account-savings',
        monthlyContributionMinor: 7500,
        isCompleted: false,
        notes: 'Year-end holiday gifts',
      },
    ],
    quickPresets: DEFAULT_PRESETS.map((p) => ({ ...p })),
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

function addTransactionToState(
  state: SyncDataState,
  rawTx: Transaction,
  options?: { updateSmartDefaults?: boolean },
): SyncDataState {
  if (state.transactions.some((existing) => existing.id === rawTx.id)) {
    return state;
  }

  const tx = transactionSchema.parse(deduplicateTransactionSplits(rawTx));
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
      return {
        ...state,
        accounts: upsertById(state.accounts, saved),
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
      const isLinked =
        state.transactions.some(
          (tx) => tx.accountId === mutation.id || tx.toAccountId === mutation.id,
        ) ||
        state.recurringCommitments.some((rc) => rc.accountId === mutation.id) ||
        state.sinkingFunds.some((sf) => sf.accountId === mutation.id);
      if (isLinked) {
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
        accounts: DEFAULT_ACCOUNTS.map((a) => ({ ...a })),
        categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
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
      const currency =
        targetAccount?.currency ?? commitment.currency ?? DEFAULT_CURRENCY;

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

      const sourceCurrency =
        state.accounts.find((a) => a.id === mutation.sourceAccountId)
          ?.currency ?? DEFAULT_CURRENCY;

      const merchant = truncateText(fund.name, 80) || 'Sinking Fund';
      const note = truncateText(`Contribution to ${fund.name}`, 280);

      const tx =
        mutation.sourceAccountId !== fund.accountId
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
