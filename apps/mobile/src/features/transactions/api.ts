import {
  DEFAULT_CATEGORIES,
  DEFAULT_TAGS,
  DEFAULT_WALLETS,
  DEFAULT_PRESETS,
  createCategoryInputSchema,
  createDefaultTransactions,
  createTransactionInputSchema,
  positiveAmountMinorSchema,
  transactionSchema,
  walletSchema,
  categorySchema,
  smartDefaultsSchema,
  categoryBudgetSchema,
  computeEnvelopeRollovers,
  recurringCommitmentSchema,
  computeSafeToSpend,
  sinkingFundSchema,
  computeSinkingFundMonthlyTarget,
  quickPresetSchema,
  balanceReconciliationSchema,
  applyReconciliationInputSchema,
  computeReconciliationDelta,
  backupEnvelopeSchema,
  type Wallet,
  type Category,
  type CreateCategoryInput,
  type CreateTransactionInput,
  type Transaction,
  type SmartDefaults,
  type CategoryBudget,
  type CategoryBudgetStatus,
  type RecurringCommitment,
  type SafeToSpendMetrics,
  type SinkingFund,
  type QuickPreset,
  type BalanceReconciliation,
  type ApplyReconciliationInput,
  type BackupEnvelope,
} from '@repo/contracts';

export interface LocalStoreState {
  wallets: Wallet[];
  categories: Category[];
  transactions: Transaction[];
  smartDefaults: SmartDefaults;
  categoryBudgets: CategoryBudget[];
  recurringCommitments: RecurringCommitment[];
  sinkingFunds: SinkingFund[];
  quickPresets: QuickPreset[];
  reconciliations: BalanceReconciliation[];
}

const STORAGE_KEY = 'budget_tracker_v2_state';

function getInitialState(): LocalStoreState {
  const firstWalletId = DEFAULT_WALLETS[0]?.id ?? 'wallet-checking';
  const savingsWalletId = DEFAULT_WALLETS[3]?.id ?? DEFAULT_WALLETS[0]?.id ?? 'wallet-savings';

  const initialCategoryUsage: Record<string, number> = {
    'cat-salary': 1,
    'cat-groceries': 1,
    'cat-household': 1,
    'cat-travel': 1,
    'cat-coffee': 1,
    'cat-bills': 1,
  };

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const currentPeriod = `${year}-${month}`;

  return {
    wallets: DEFAULT_WALLETS.map((w) => ({ ...w })),
    categories: DEFAULT_CATEGORIES.map((c) => ({
      ...c,
      usageCount: initialCategoryUsage[c.id] ?? 0,
    })),
    transactions: createDefaultTransactions(),
    smartDefaults: {
      lastWalletId: firstWalletId,
      lastTransferToWalletId: savingsWalletId,
      recentMerchants: ['Whole Foods', 'Target', 'Shell', 'Starbucks', 'Amazon'],
      knownTags: [...DEFAULT_TAGS],
      monthlyBudgetMinor: 250000,
    },
    categoryBudgets: [
      {
        id: `budget-groceries-${currentPeriod}`,
        categoryId: 'cat-groceries',
        periodMonth: currentPeriod,
        assignedMinor: 50000,
        rolloverEnabled: true,
        notes: 'Monthly starter grocery envelope',
      },
      {
        id: `budget-dining-${currentPeriod}`,
        categoryId: 'cat-dining',
        periodMonth: currentPeriod,
        assignedMinor: 25000,
        rolloverEnabled: false,
        notes: 'Monthly dining out envelope',
      },
      {
        id: `budget-transport-${currentPeriod}`,
        categoryId: 'cat-transport',
        periodMonth: currentPeriod,
        assignedMinor: 12000,
        rolloverEnabled: true,
        notes: 'Monthly transport envelope',
      },
      {
        id: `budget-coffee-${currentPeriod}`,
        categoryId: 'cat-coffee',
        periodMonth: currentPeriod,
        assignedMinor: 5000,
        rolloverEnabled: false,
        notes: 'Monthly coffee and drinks envelope',
      },
    ],
    recurringCommitments: [
      {
        id: 'commitment-rent',
        name: 'Apartment Rent',
        amountMinor: 120000,
        currency: 'PHP',
        walletId: 'wallet-checking',
        categoryId: 'cat-household',
        frequency: 'MONTHLY',
        dueDay: 1,
        isAutoPaid: true,
        lastPaidPeriod: currentPeriod,
        isActive: true,
        notes: 'Monthly rent commitment',
      },
      {
        id: 'commitment-electric',
        name: 'Electric Bill',
        amountMinor: 9500,
        currency: 'PHP',
        walletId: 'wallet-checking',
        categoryId: 'cat-bills',
        frequency: 'MONTHLY',
        dueDay: 15,
        isAutoPaid: false,
        isActive: true,
        notes: 'Monthly electric utility',
      },
      {
        id: 'commitment-netflix',
        name: 'Netflix',
        amountMinor: 1600,
        currency: 'PHP',
        walletId: 'wallet-card',
        categoryId: 'cat-subscriptions',
        frequency: 'MONTHLY',
        dueDay: 20,
        isAutoPaid: true,
        isActive: true,
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
        walletId: 'wallet-savings',
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
        walletId: 'wallet-savings',
        monthlyContributionMinor: 7500,
        isCompleted: false,
        notes: 'Year-end holiday gifts',
      },
    ],
    quickPresets: DEFAULT_PRESETS.map((p) => ({ ...p })),
    reconciliations: [],
  };
}

let inMemoryState: LocalStoreState = getInitialState();
let isHydrated = false;

function loadState(): LocalStoreState {
  if (isHydrated) {
    return inMemoryState;
  }
  isHydrated = true;

  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      const raw = globalThis.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === 'object') {
          const candidate = parsed as Partial<LocalStoreState>;
          const initial = getInitialState();
          inMemoryState = {
            wallets: Array.isArray(candidate.wallets)
              ? candidate.wallets.flatMap((w) => {
                  const normalized =
                    w && typeof w === 'object' && (w as Record<string, unknown>).currency === 'USD'
                      ? { ...(w as Record<string, unknown>), currency: 'PHP' }
                      : w;
                  const r = walletSchema.safeParse(normalized);
                  return r.success ? [r.data] : [];
                })
              : initial.wallets,
            categories: Array.isArray(candidate.categories)
              ? candidate.categories.flatMap((c) => {
                  const r = categorySchema.safeParse(c);
                  return r.success ? [r.data] : [];
                })
              : initial.categories,
            transactions: Array.isArray(candidate.transactions)
              ? candidate.transactions.flatMap((t) => {
                  const normalized =
                    t && typeof t === 'object' && (t as Record<string, unknown>).currency === 'USD'
                      ? { ...(t as Record<string, unknown>), currency: 'PHP' }
                      : t;
                  const r = transactionSchema.safeParse(normalized);
                  return r.success ? [r.data] : [];
                })
              : initial.transactions,
            smartDefaults: candidate.smartDefaults
              ? (smartDefaultsSchema.safeParse(candidate.smartDefaults).data ?? initial.smartDefaults)
              : initial.smartDefaults,
            categoryBudgets: Array.isArray(candidate.categoryBudgets)
              ? candidate.categoryBudgets.flatMap((b) => {
                  const r = categoryBudgetSchema.safeParse(b);
                  return r.success ? [r.data] : [];
                })
              : initial.categoryBudgets,
            recurringCommitments: Array.isArray(candidate.recurringCommitments)
              ? candidate.recurringCommitments.flatMap((rc) => {
                  const normalized =
                    rc && typeof rc === 'object' && (rc as Record<string, unknown>).currency === 'USD'
                      ? { ...(rc as Record<string, unknown>), currency: 'PHP' }
                      : rc;
                  const r = recurringCommitmentSchema.safeParse(normalized);
                  return r.success ? [r.data] : [];
                })
              : initial.recurringCommitments,
            sinkingFunds: Array.isArray(candidate.sinkingFunds)
              ? candidate.sinkingFunds.flatMap((sf) => {
                  const r = sinkingFundSchema.safeParse(sf);
                  return r.success ? [r.data] : [];
                })
              : initial.sinkingFunds,
            quickPresets: Array.isArray(candidate.quickPresets)
              ? candidate.quickPresets.flatMap((qp) => {
                  const r = quickPresetSchema.safeParse(qp);
                  return r.success ? [r.data] : [];
                })
              : initial.quickPresets,
            reconciliations: Array.isArray(candidate.reconciliations)
              ? candidate.reconciliations.flatMap((rec) => {
                  const r = balanceReconciliationSchema.safeParse(rec);
                  return r.success ? [r.data] : [];
                })
              : initial.reconciliations,
          };

          if (inMemoryState.wallets.length === 0) {
            inMemoryState.wallets = initial.wallets;
          }
          if (inMemoryState.categories.length === 0) {
            inMemoryState.categories = initial.categories;
          }
          if (inMemoryState.categoryBudgets.length === 0 && !candidate.categoryBudgets) {
            inMemoryState.categoryBudgets = initial.categoryBudgets;
          }
          if (inMemoryState.recurringCommitments.length === 0 && !candidate.recurringCommitments) {
            inMemoryState.recurringCommitments = initial.recurringCommitments;
          }
          if (inMemoryState.sinkingFunds.length === 0 && !candidate.sinkingFunds) {
            inMemoryState.sinkingFunds = initial.sinkingFunds;
          }
          if (inMemoryState.quickPresets.length === 0 && !candidate.quickPresets) {
            inMemoryState.quickPresets = initial.quickPresets;
          }
        }
      }
    }
  } catch (error: unknown) {
    // If stored data was invalid or corrupted, fallback safely to initial state
    inMemoryState = getInitialState();
  }

  return inMemoryState;
}

function saveState(state: LocalStoreState): void {
  inMemoryState = state;
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch (error: unknown) {
    // Ignore storage quota or serialization errors
  }
}

function getState(): LocalStoreState {
  return loadState();
}

export async function getWallets(): Promise<Wallet[]> {
  const state = getState();
  return state.wallets.map((w) => walletSchema.parse(w));
}

export async function getCategories(): Promise<Category[]> {
  const state = getState();
  return state.categories.map((c) => categorySchema.parse(c));
}

export async function getSmartDefaults(): Promise<SmartDefaults> {
  const state = getState();
  return smartDefaultsSchema.parse(state.smartDefaults);
}

export async function getTransactions(): Promise<Transaction[]> {
  const state = getState();
  return state.transactions.map((tx) => transactionSchema.parse(tx));
}

export async function createCustomCategory(
  input: CreateCategoryInput,
): Promise<Category> {
  const validatedInput = createCategoryInputSchema.parse(input);
  const state = getState();

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

  state.categories.push(newCategory);
  saveState(state);

  return newCategory;
}

export async function createTransaction(
  input: CreateTransactionInput,
): Promise<Transaction> {
  const validatedInput = createTransactionInputSchema.parse(input);
  const state = getState();

  const tx = transactionSchema.parse({
    ...validatedInput,
    id: 'tx-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    createdAt: new Date().toISOString(),
  });

  // Update wallet balances in integer minor units
  state.wallets = state.wallets.map((wallet) => {
    if (tx.type === 'EXPENSE') {
      if (wallet.id === tx.walletId) {
        return walletSchema.parse({
          ...wallet,
          balanceMinor: wallet.balanceMinor - tx.amountMinor,
        });
      }
    } else if (tx.type === 'INCOME') {
      if (wallet.id === tx.walletId) {
        return walletSchema.parse({
          ...wallet,
          balanceMinor: wallet.balanceMinor + tx.amountMinor,
        });
      }
    } else if (tx.type === 'TRANSFER') {
      if (wallet.id === tx.walletId) {
        return walletSchema.parse({
          ...wallet,
          balanceMinor: wallet.balanceMinor - tx.amountMinor,
        });
      }
      if (tx.toWalletId && wallet.id === tx.toWalletId) {
        return walletSchema.parse({
          ...wallet,
          balanceMinor: wallet.balanceMinor + tx.amountMinor,
        });
      }
    }
    return wallet;
  });

  // Update category usageCount
  const categoryIdsToIncrement = new Set<string>();
  if (tx.splits && tx.splits.length > 0) {
    for (const split of tx.splits) {
      categoryIdsToIncrement.add(split.categoryId);
    }
  } else if (tx.categoryId) {
    categoryIdsToIncrement.add(tx.categoryId);
  }

  if (categoryIdsToIncrement.size > 0) {
    state.categories = state.categories.map((c) => {
      if (categoryIdsToIncrement.has(c.id)) {
        return categorySchema.parse({
          ...c,
          usageCount: c.usageCount + 1,
        });
      }
      return c;
    });
  }

  // Update smartDefaults
  let recentMerchants = [...state.smartDefaults.recentMerchants];
  if (tx.merchant && tx.merchant.trim().length > 0) {
    const trimmed = tx.merchant.trim();
    const lower = trimmed.toLowerCase();
    recentMerchants = [
      trimmed,
      ...recentMerchants.filter((m) => m.toLowerCase() !== lower),
    ].slice(0, 12);
  }

  let knownTags = [...state.smartDefaults.knownTags];
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

  state.smartDefaults = smartDefaultsSchema.parse({
    ...state.smartDefaults,
    lastWalletId: tx.walletId,
    ...(tx.type === 'TRANSFER' && tx.toWalletId
      ? { lastTransferToWalletId: tx.toWalletId }
      : {}),
    recentMerchants,
    knownTags,
  });

  // Prepend tx to state.transactions
  state.transactions = [tx, ...state.transactions];
  saveState(state);

  return tx;
}

export async function createTransactionsBatch(
  inputs: CreateTransactionInput[],
): Promise<Transaction[]> {
  const state = getState();
  const created: Transaction[] = [];

  for (const input of inputs) {
    const validatedInput = createTransactionInputSchema.parse(input);
    const tx = transactionSchema.parse({
      ...validatedInput,
      id: 'tx-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      createdAt: new Date().toISOString(),
    });

    // Update wallet balances in integer minor units
    state.wallets = state.wallets.map((wallet) => {
      if (tx.type === 'EXPENSE') {
        if (wallet.id === tx.walletId) {
          return walletSchema.parse({
            ...wallet,
            balanceMinor: wallet.balanceMinor - tx.amountMinor,
          });
        }
      } else if (tx.type === 'INCOME') {
        if (wallet.id === tx.walletId) {
          return walletSchema.parse({
            ...wallet,
            balanceMinor: wallet.balanceMinor + tx.amountMinor,
          });
        }
      } else if (tx.type === 'TRANSFER') {
        if (wallet.id === tx.walletId) {
          return walletSchema.parse({
            ...wallet,
            balanceMinor: wallet.balanceMinor - tx.amountMinor,
          });
        }
        if (tx.toWalletId && wallet.id === tx.toWalletId) {
          return walletSchema.parse({
            ...wallet,
            balanceMinor: wallet.balanceMinor + tx.amountMinor,
          });
        }
      }
      return wallet;
    });

    // Update category usageCount
    const categoryIdsToIncrement = new Set<string>();
    if (tx.splits && tx.splits.length > 0) {
      for (const split of tx.splits) {
        categoryIdsToIncrement.add(split.categoryId);
      }
    } else if (tx.categoryId) {
      categoryIdsToIncrement.add(tx.categoryId);
    }

    if (categoryIdsToIncrement.size > 0) {
      state.categories = state.categories.map((c) => {
        if (categoryIdsToIncrement.has(c.id)) {
          return categorySchema.parse({
            ...c,
            usageCount: c.usageCount + 1,
          });
        }
        return c;
      });
    }

    created.push(tx);
  }

  // Prepend created transactions to state.transactions
  state.transactions = [...created, ...state.transactions];
  saveState(state);

  return created;
}

export async function deleteTransaction(transactionId: string): Promise<void> {
  const state = getState();
  const tx = state.transactions.find((t) => t.id === transactionId);
  if (!tx) {
    return;
  }

  // Reverse wallet balance changes in integer minor units
  state.wallets = state.wallets.map((wallet) => {
    if (tx.type === 'EXPENSE') {
      if (wallet.id === tx.walletId) {
        return walletSchema.parse({
          ...wallet,
          balanceMinor: wallet.balanceMinor + tx.amountMinor,
        });
      }
    } else if (tx.type === 'INCOME') {
      if (wallet.id === tx.walletId) {
        return walletSchema.parse({
          ...wallet,
          balanceMinor: wallet.balanceMinor - tx.amountMinor,
        });
      }
    } else if (tx.type === 'TRANSFER') {
      if (wallet.id === tx.walletId) {
        return walletSchema.parse({
          ...wallet,
          balanceMinor: wallet.balanceMinor + tx.amountMinor,
        });
      }
      if (tx.toWalletId && wallet.id === tx.toWalletId) {
        return walletSchema.parse({
          ...wallet,
          balanceMinor: wallet.balanceMinor - tx.amountMinor,
        });
      }
    }
    return wallet;
  });

  // Decrement category usageCount (clamped with Math.max(0, c.usageCount - 1))
  const categoryIdsToDecrement = new Set<string>();
  if (tx.splits && tx.splits.length > 0) {
    for (const split of tx.splits) {
      categoryIdsToDecrement.add(split.categoryId);
    }
  } else if (tx.categoryId) {
    categoryIdsToDecrement.add(tx.categoryId);
  }

  if (categoryIdsToDecrement.size > 0) {
    state.categories = state.categories.map((c) => {
      if (categoryIdsToDecrement.has(c.id)) {
        return categorySchema.parse({
          ...c,
          usageCount: Math.max(0, c.usageCount - 1),
        });
      }
      return c;
    });
  }

  state.transactions = state.transactions.filter((t) => t.id !== transactionId);
  saveState(state);
}

export async function updateMonthlyBudget(
  monthlyBudgetMinor: number,
): Promise<SmartDefaults> {
  const validatedBudget = positiveAmountMinorSchema.parse(monthlyBudgetMinor);
  const state = getState();
  state.smartDefaults = smartDefaultsSchema.parse({
    ...state.smartDefaults,
    monthlyBudgetMinor: validatedBudget,
  });
  saveState(state);
  return state.smartDefaults;
}

export async function clearAllTransactions(): Promise<void> {
  const state = getState();
  state.transactions = [];
  state.wallets = DEFAULT_WALLETS.map((w) => ({ ...w }));
  state.categories = DEFAULT_CATEGORIES.map((c) => ({ ...c }));
  state.reconciliations = [];
  saveState(state);
}

export async function resetLocalStore(): Promise<void> {
  const initial = getInitialState();
  saveState(initial);
}

// ==========================================
// Milestone 2: Envelope Budgets API
// ==========================================

export async function getCategoryBudgets(periodMonth: string): Promise<CategoryBudgetStatus[]> {
  const state = getState();
  return computeEnvelopeRollovers({
    budgets: state.categoryBudgets,
    transactions: state.transactions,
    periodMonth,
  });
}

export async function upsertCategoryBudget(
  budget: Omit<CategoryBudget, 'id'> & { id?: string },
): Promise<CategoryBudget> {
  const state = getState();
  const id = budget.id || `budget-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const validated = categoryBudgetSchema.parse({
    ...budget,
    id,
  });

  const existingIndex = state.categoryBudgets.findIndex((b) => b.id === id);
  if (existingIndex >= 0) {
    state.categoryBudgets[existingIndex] = validated;
  } else {
    state.categoryBudgets.push(validated);
  }

  saveState(state);
  return validated;
}

export async function deleteCategoryBudget(id: string): Promise<void> {
  const state = getState();
  state.categoryBudgets = state.categoryBudgets.filter((b) => b.id !== id);
  saveState(state);
}

// ==========================================
// Milestone 2: Recurring Commitments API
// ==========================================

export async function getRecurringCommitments(): Promise<RecurringCommitment[]> {
  const state = getState();
  return state.recurringCommitments.map((rc) => recurringCommitmentSchema.parse(rc));
}

export async function upsertRecurringCommitment(
  input: Omit<RecurringCommitment, 'id'> & { id?: string },
): Promise<RecurringCommitment> {
  const state = getState();
  const id = input.id || `commitment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const validated = recurringCommitmentSchema.parse({
    ...input,
    id,
  });

  const existingIndex = state.recurringCommitments.findIndex((rc) => rc.id === id);
  if (existingIndex >= 0) {
    state.recurringCommitments[existingIndex] = validated;
  } else {
    state.recurringCommitments.push(validated);
  }

  saveState(state);
  return validated;
}

export async function deleteRecurringCommitment(id: string): Promise<void> {
  const state = getState();
  state.recurringCommitments = state.recurringCommitments.filter((rc) => rc.id !== id);
  saveState(state);
}

// ==========================================
// Milestone 2: Sinking Funds API
// ==========================================

export async function getSinkingFunds(): Promise<SinkingFund[]> {
  const state = getState();
  return state.sinkingFunds.map((sf) => sinkingFundSchema.parse(sf));
}

export async function upsertSinkingFund(
  input: Omit<SinkingFund, 'id'> & { id?: string },
): Promise<SinkingFund> {
  const state = getState();
  const id = input.id || `fund-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const validated = sinkingFundSchema.parse({
    ...input,
    id,
  });

  const existingIndex = state.sinkingFunds.findIndex((sf) => sf.id === id);
  if (existingIndex >= 0) {
    state.sinkingFunds[existingIndex] = validated;
  } else {
    state.sinkingFunds.push(validated);
  }

  saveState(state);
  return validated;
}

export async function contributeToSinkingFund(
  fundId: string,
  amountMinor: number,
  sourceWalletId: string,
): Promise<{ fund: SinkingFund; transaction: Transaction }> {
  positiveAmountMinorSchema.parse(amountMinor);
  const state = getState();
  const fund = state.sinkingFunds.find((sf) => sf.id === fundId);
  if (!fund) {
    throw new Error(`Sinking fund "${fundId}" not found`);
  }

  const sourceWallet = state.wallets.find((w) => w.id === sourceWalletId);
  const currency = sourceWallet?.currency ?? 'PHP';

  let tx: Transaction;
  if (sourceWalletId !== fund.walletId) {
    tx = await createTransaction({
      type: 'TRANSFER',
      amountMinor,
      currency,
      walletId: sourceWalletId,
      toWalletId: fund.walletId,
      merchant: fund.name,
      note: `Contribution to ${fund.name}`,
      tags: ['sinking-fund'],
      occurredAt: new Date().toISOString(),
    });
  } else {
    tx = await createTransaction({
      type: 'EXPENSE',
      amountMinor,
      currency,
      walletId: sourceWalletId,
      categoryId: 'cat-household',
      merchant: fund.name,
      note: `Contribution to ${fund.name}`,
      tags: ['sinking-fund'],
      occurredAt: new Date().toISOString(),
    });
  }

  const currentState = getState();
  const newSavedMinor = fund.currentSavedMinor + amountMinor;
  const isCompleted = newSavedMinor >= fund.targetAmountMinor;
  const updatedFund = sinkingFundSchema.parse({
    ...fund,
    currentSavedMinor: newSavedMinor,
    isCompleted,
  });

  currentState.sinkingFunds = currentState.sinkingFunds.map((sf) =>
    sf.id === fundId ? updatedFund : sf,
  );
  saveState(currentState);

  return { fund: updatedFund, transaction: tx };
}

export async function deleteSinkingFund(id: string): Promise<void> {
  const state = getState();
  state.sinkingFunds = state.sinkingFunds.filter((sf) => sf.id !== id);
  saveState(state);
}

// ==========================================
// Milestone 2: Quick Presets API
// ==========================================

export async function getQuickPresets(): Promise<QuickPreset[]> {
  const state = getState();
  return state.quickPresets.map((qp) => quickPresetSchema.parse(qp));
}

export async function upsertQuickPreset(
  input: Omit<QuickPreset, 'id'> & { id?: string },
): Promise<QuickPreset> {
  const state = getState();
  const id = input.id || `preset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const validated = quickPresetSchema.parse({
    ...input,
    id,
  });

  const existingIndex = state.quickPresets.findIndex((qp) => qp.id === id);
  if (existingIndex >= 0) {
    state.quickPresets[existingIndex] = validated;
  } else {
    state.quickPresets.push(validated);
  }

  saveState(state);
  return validated;
}

export async function deleteQuickPreset(id: string): Promise<void> {
  const state = getState();
  state.quickPresets = state.quickPresets.filter((qp) => qp.id !== id);
  saveState(state);
}

// ==========================================
// Milestone 2: Balance Reconciliation API
// ==========================================

export async function applyReconciliation(
  input: ApplyReconciliationInput,
): Promise<{
  reconciliation: BalanceReconciliation;
  adjustmentTransaction?: Transaction;
  wallet: Wallet;
}> {
  const validatedInput = applyReconciliationInputSchema.parse(input);
  const state = getState();
  const wallet = state.wallets.find((w) => w.id === validatedInput.walletId);
  if (!wallet) {
    throw new Error(`Wallet "${validatedInput.walletId}" not found`);
  }

  const delta = computeReconciliationDelta(
    wallet.balanceMinor,
    validatedInput.actualBalanceMinor,
  );

  let adjustmentTransaction: Transaction | undefined;
  if (validatedInput.createAdjustment && delta.needsAdjustment) {
    if (delta.adjustmentType === 'INCOME') {
      adjustmentTransaction = await createTransaction({
        type: 'INCOME',
        amountMinor: delta.adjustmentAmountMinor,
        currency: wallet.currency ?? 'PHP',
        walletId: validatedInput.walletId,
        categoryId: 'cat-other-income',
        merchant: 'Balance Adjustment',
        note: validatedInput.notes || 'Reconciliation adjustment',
        tags: ['reconciliation'],
        occurredAt: new Date().toISOString(),
      });
    } else if (delta.adjustmentType === 'EXPENSE') {
      adjustmentTransaction = await createTransaction({
        type: 'EXPENSE',
        amountMinor: delta.adjustmentAmountMinor,
        currency: wallet.currency ?? 'PHP',
        walletId: validatedInput.walletId,
        categoryId: 'cat-bills',
        merchant: 'Balance Adjustment',
        note: validatedInput.notes || 'Reconciliation adjustment',
        tags: ['reconciliation'],
        occurredAt: new Date().toISOString(),
      });
    }
  }

  // Ensure wallet actual balance matches actualBalanceMinor directly
  const currentState = getState();
  currentState.wallets = currentState.wallets.map((w) =>
    w.id === validatedInput.walletId
      ? walletSchema.parse({
          ...w,
          balanceMinor: validatedInput.actualBalanceMinor,
        })
      : w,
  );

  const reconciliation: BalanceReconciliation = balanceReconciliationSchema.parse({
    id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    walletId: validatedInput.walletId,
    appBalanceMinor: wallet.balanceMinor,
    actualBalanceMinor: validatedInput.actualBalanceMinor,
    discrepancyMinor: delta.discrepancyMinor,
    reconciledAt: new Date().toISOString(),
    ...(adjustmentTransaction ? { adjustmentTransactionId: adjustmentTransaction.id } : {}),
  });

  currentState.reconciliations.push(reconciliation);
  saveState(currentState);

  const updatedWallet = currentState.wallets.find((w) => w.id === validatedInput.walletId)!;
  return {
    reconciliation,
    adjustmentTransaction,
    wallet: updatedWallet,
  };
}

export async function getReconciliations(walletId?: string): Promise<BalanceReconciliation[]> {
  const state = getState();
  const list = [...state.reconciliations].reverse();
  if (walletId) {
    return list.filter((r) => r.walletId === walletId);
  }
  return list;
}

// ==========================================
// Milestone 2: Safe-to-Spend API
// ==========================================

export async function getSafeToSpendMetrics(currentDate?: Date): Promise<SafeToSpendMetrics> {
  const state = getState();
  const date = currentDate ?? new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const periodMonth = `${year}-${month}`;

  const nonSavingsWallets = state.wallets.filter((w) => w.id !== 'wallet-savings');
  const liquidWallets = nonSavingsWallets.length > 0 ? nonSavingsWallets : state.wallets;

  const categoryBudgets = computeEnvelopeRollovers({
    budgets: state.categoryBudgets,
    transactions: state.transactions,
    periodMonth,
  });

  const liquidWalletIds = new Set(liquidWallets.map((w) => w.id));
  const liquidSinkingFunds = state.sinkingFunds.filter((sf) =>
    liquidWalletIds.has(sf.walletId),
  );

  return computeSafeToSpend({
    liquidWallets,
    commitments: state.recurringCommitments,
    categoryBudgets,
    sinkingFunds: liquidSinkingFunds,
    currentDate: date,
  });
}

// ==========================================
// Milestone 2: Portability & Backup API
// ==========================================

export async function exportBackupEnvelope(): Promise<BackupEnvelope> {
  const state = getState();
  return backupEnvelopeSchema.parse({
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      wallets: state.wallets,
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
  const envelope = backupEnvelopeSchema.parse(rawEnvelope);
  const state = getState();

  if (mode === 'overwrite') {
    const newState: LocalStoreState = {
      wallets: envelope.data.wallets.map((w) => walletSchema.parse(w)),
      categories: envelope.data.categories.map((c) => categorySchema.parse(c)),
      transactions: envelope.data.transactions.map((t) => transactionSchema.parse(t)),
      categoryBudgets: envelope.data.categoryBudgets.map((b) => categoryBudgetSchema.parse(b)),
      recurringCommitments: envelope.data.recurringCommitments.map((rc) => recurringCommitmentSchema.parse(rc)),
      sinkingFunds: envelope.data.sinkingFunds.map((sf) => sinkingFundSchema.parse(sf)),
      quickPresets: envelope.data.quickPresets.map((qp) => quickPresetSchema.parse(qp)),
      smartDefaults: envelope.data.smartDefaults
        ? smartDefaultsSchema.parse(envelope.data.smartDefaults)
        : state.smartDefaults,
      reconciliations: state.reconciliations,
    };
    saveState(newState);
    return {
      success: true,
      importedCount: envelope.data.transactions.length,
    };
  }

  // Merge mode: Deduplicate each entity by id
  const mergeById = <T extends { id: string }>(existing: readonly T[], incoming: readonly T[]): T[] => {
    const map = new Map<string, T>();
    for (const item of existing) {
      map.set(item.id, item);
    }
    for (const item of incoming) {
      map.set(item.id, item);
    }
    return Array.from(map.values());
  };

  const mergedWallets = mergeById(state.wallets, envelope.data.wallets);
  const mergedCategories = mergeById(state.categories, envelope.data.categories);
  const mergedTransactions = mergeById(state.transactions, envelope.data.transactions);
  const mergedBudgets = mergeById(state.categoryBudgets, envelope.data.categoryBudgets);
  const mergedCommitments = mergeById(state.recurringCommitments, envelope.data.recurringCommitments);
  const mergedSinkingFunds = mergeById(state.sinkingFunds, envelope.data.sinkingFunds);
  const mergedPresets = mergeById(state.quickPresets, envelope.data.quickPresets);

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

  const mergedState: LocalStoreState = {
    wallets: mergedWallets.map((w) => walletSchema.parse(w)),
    categories: mergedCategories.map((c) => categorySchema.parse(c)),
    transactions: mergedTransactions.map((t) => transactionSchema.parse(t)),
    categoryBudgets: mergedBudgets.map((b) => categoryBudgetSchema.parse(b)),
    recurringCommitments: mergedCommitments.map((rc) => recurringCommitmentSchema.parse(rc)),
    sinkingFunds: mergedSinkingFunds.map((sf) => sinkingFundSchema.parse(sf)),
    quickPresets: mergedPresets.map((qp) => quickPresetSchema.parse(qp)),
    smartDefaults: smartDefaultsSchema.parse({
      ...state.smartDefaults,
      knownTags: mergedKnownTags,
      recentMerchants: mergedMerchants,
      monthlyBudgetMinor:
        envelope.data.smartDefaults?.monthlyBudgetMinor ?? state.smartDefaults.monthlyBudgetMinor,
    }),
    reconciliations: state.reconciliations,
  };

  saveState(mergedState);

  return {
    success: true,
    importedCount: envelope.data.transactions.length,
  };
}
