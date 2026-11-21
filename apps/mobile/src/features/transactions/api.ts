import {
  DEFAULT_ACCOUNTS,
  DEFAULT_CATEGORIES,
  DEFAULT_CURRENCY,
  DEFAULT_PRESETS,
  DEFAULT_TAGS,
  accountSchema,
  advanceNextDueDate,
  applyReconciliationInputSchema,
  backupEnvelopeSchema,
  balanceReconciliationSchema,
  categoryBudgetSchema,
  categorySchema,
  computeEnvelopeRollovers,
  computeReconciliationDelta,
  computeSafeToSpend,
  createCategoryInputSchema,
  createDefaultTransactions,
  createTransactionInputSchema,
  isCommitmentPaidOff,
  normalizeBackupEnvelope,
  normalizeLegacyAccountType,
  normalizeLegacyCategoryId,
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
  type Transaction,
  type UpdateTransactionInput,
  type UpsertAccountInput,
} from '@repo/contracts';

export interface LocalStoreState {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  smartDefaults: SmartDefaults;
  categoryBudgets: CategoryBudget[];
  recurringCommitments: RecurringCommitment[];
  sinkingFunds: SinkingFund[];
  quickPresets: QuickPreset[];
  reconciliations: BalanceReconciliation[];
}

const STORAGE_KEY = 'budget_tracker_v3_state';
const LEGACY_STORAGE_KEY = 'budget_tracker_v2_state';

const LEGACY_ACCOUNT_ID_MAP = new Map<string, string>([
  ['wallet-checking', 'account-bank'],
  ['wallet-debit', 'account-bank'],
  ['wallet-card', 'account-card'],
  ['wallet-cash', 'account-cash'],
  ['wallet-savings', 'account-savings'],
]);

function getInitialState(): LocalStoreState {
  const firstAccountId = DEFAULT_ACCOUNTS[0]?.id ?? 'account-bank';
  const savingsAccountId = DEFAULT_ACCOUNTS[3]?.id ?? DEFAULT_ACCOUNTS[0]?.id ?? 'account-savings';

  const initialCategoryUsage: Record<string, number> = {
    'cat-salary': 1,
    'cat-daily-living': 2,
    'cat-home': 1,
    'cat-transportation': 1,
    'cat-dues': 1,
  };

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const currentPeriod = `${year}-${month}`;

  return {
    accounts: DEFAULT_ACCOUNTS.map((a) => ({ ...a })),
    categories: DEFAULT_CATEGORIES.map((c) => ({
      ...c,
      usageCount: initialCategoryUsage[c.id] ?? 0,
    })),
    transactions: createDefaultTransactions(),
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

let inMemoryState: LocalStoreState = getInitialState();
let isHydrated = false;

interface LegacyStoreCandidate {
  accounts?: unknown[];
  wallets?: unknown[];
  categories?: unknown[];
  transactions?: unknown[];
  smartDefaults?: Record<string, unknown>;
  categoryBudgets?: unknown[];
  recurringCommitments?: unknown[];
  sinkingFunds?: unknown[];
  quickPresets?: unknown[];
  reconciliations?: unknown[];
}

function mapLegacyId(rawId: unknown): string | undefined {
  if (typeof rawId !== 'string' || !rawId) return undefined;
  return LEGACY_ACCOUNT_ID_MAP.get(rawId) ?? rawId;
}

function upgradeRecordAccountRefs(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const obj = raw as Record<string, unknown>;
  const { walletId, toWalletId, ...rest } = obj;
  const accountId = mapLegacyId(obj.accountId ?? walletId);
  const toAccountId = mapLegacyId(obj.toAccountId ?? toWalletId);
  return {
    ...rest,
    ...(accountId ? { accountId } : {}),
    ...(toAccountId ? { toAccountId } : {}),
  };
}

function upgradeRecordCategoryRefs(raw: unknown): {
  upgraded: unknown;
  didChange: boolean;
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { upgraded: raw, didChange: false };
  }
  const obj = raw as Record<string, unknown>;
  let next: Record<string, unknown> = obj;
  let didChange = false;

  if (typeof obj.categoryId === 'string') {
    const mapped = normalizeLegacyCategoryId(obj.categoryId);
    if (mapped !== obj.categoryId) {
      next = { ...next, categoryId: mapped };
      didChange = true;
    }
  }

  if (Array.isArray(obj.splits)) {
    let splitsChanged = false;
    const mappedSplits = obj.splits.map((split) => {
      if (!split || typeof split !== 'object' || Array.isArray(split)) {
        return split;
      }
      const splitObj = split as Record<string, unknown>;
      if (typeof splitObj.categoryId === 'string') {
        const mappedSplitCat = normalizeLegacyCategoryId(splitObj.categoryId);
        if (mappedSplitCat !== splitObj.categoryId) {
          splitsChanged = true;
          return { ...splitObj, categoryId: mappedSplitCat };
        }
      }
      return split;
    });
    if (splitsChanged) {
      next = { ...next, splits: mappedSplits };
      didChange = true;
    }
  }

  return { upgraded: next, didChange };
}

function migrateHydratedCategories(rawCategories: unknown[]): {
  categories: Category[];
  didMigrate: boolean;
} {
  const parsed = rawCategories.flatMap((c) => {
    const r = categorySchema.safeParse(c);
    return r.success ? [r.data] : [];
  });

  if (parsed.length === 0) {
    return {
      categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
      didMigrate: true,
    };
  }

  const canonicalIds = new Set(DEFAULT_CATEGORIES.map((c) => c.id));
  const usageByCanonicalId = new Map<string, number>();
  const customCategories: Category[] = [];
  const seenCustomIds = new Set<string>();
  const seenNonCustomIds = new Set<string>();
  let didMigrate = false;

  for (const cat of parsed) {
    if (cat.isCustom) {
      if (!seenCustomIds.has(cat.id)) {
        seenCustomIds.add(cat.id);
        customCategories.push(cat);
      }
      continue;
    }

    seenNonCustomIds.add(cat.id);
    const mappedId = normalizeLegacyCategoryId(cat.id);
    if (mappedId !== cat.id) {
      didMigrate = true;
    }
    if (canonicalIds.has(mappedId)) {
      usageByCanonicalId.set(
        mappedId,
        (usageByCanonicalId.get(mappedId) ?? 0) + cat.usageCount,
      );
    }
  }

  if (
    seenNonCustomIds.size !== canonicalIds.size ||
    Array.from(canonicalIds).some((id) => !seenNonCustomIds.has(id))
  ) {
    didMigrate = true;
  }

  const canonicalList = DEFAULT_CATEGORIES.map((cat) =>
    categorySchema.parse({
      ...cat,
      usageCount: usageByCanonicalId.get(cat.id) ?? cat.usageCount,
    }),
  );

  return {
    categories: [...canonicalList, ...customCategories],
    didMigrate,
  };
}

function loadState(): LocalStoreState {
  if (isHydrated) {
    return inMemoryState;
  }
  isHydrated = true;

  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      const currentRaw = globalThis.localStorage.getItem(STORAGE_KEY);
      const legacyRaw = currentRaw ? null : globalThis.localStorage.getItem(LEGACY_STORAGE_KEY);
      const raw = currentRaw ?? legacyRaw;
      const isMigratingFromLegacyKey = Boolean(!currentRaw && legacyRaw);

      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === 'object') {
          const candidate = parsed as LegacyStoreCandidate;
          const initial = getInitialState();
          const migrateCurrency = (currency?: string): string =>
            !currency || currency === 'USD' ? DEFAULT_CURRENCY : currency;

          const hasLegacyWalletsField =
            !Array.isArray(candidate.accounts) && Array.isArray(candidate.wallets);
          const rawAccounts = Array.isArray(candidate.accounts)
            ? candidate.accounts
            : Array.isArray(candidate.wallets)
              ? candidate.wallets
              : null;

          let didUpgradeSchema = isMigratingFromLegacyKey || hasLegacyWalletsField;

          const seenAccountIds = new Set<string>();
          const hydratedAccounts: Account[] = rawAccounts
            ? rawAccounts.flatMap((rawItem) => {
                const obj =
                  rawItem && typeof rawItem === 'object'
                    ? (rawItem as Record<string, unknown>)
                    : undefined;
                if (!obj) return [];

                const originalId = typeof obj.id === 'string' ? obj.id : '';
                const mappedId = mapLegacyId(originalId) ?? originalId;
                if (mappedId !== originalId) {
                  didUpgradeSchema = true;
                }
                if (!mappedId || seenAccountIds.has(mappedId)) {
                  return [];
                }
                seenAccountIds.add(mappedId);

                const rawName = typeof obj.name === 'string' ? obj.name : '';
                const lowerName = rawName.trim().toLowerCase();
                let nextName = rawName;
                if (lowerName === 'checking' || (originalId === 'wallet-debit' && lowerName === 'debit card')) {
                  nextName = 'Main Bank';
                  didUpgradeSchema = true;
                }

                const rawType = obj.accountType;
                const normalizedType = rawType
                  ? normalizeLegacyAccountType(rawType)
                  : mappedId === 'account-card'
                    ? 'CREDIT_CARD'
                    : mappedId === 'account-cash'
                      ? 'CASH'
                      : 'BANK';
                if (rawType !== normalizedType) {
                  didUpgradeSchema = true;
                }

                const result = accountSchema.safeParse({
                  ...obj,
                  id: mappedId,
                  name: nextName,
                  accountType: normalizedType,
                });
                if (!result.success) return [];
                return [
                  isMigratingFromLegacyKey
                    ? { ...result.data, currency: migrateCurrency(result.data.currency) }
                    : result.data,
                ];
              })
            : initial.accounts;

          let hydratedSmartDefaults = initial.smartDefaults;
          if (candidate.smartDefaults && typeof candidate.smartDefaults === 'object') {
            const sd = candidate.smartDefaults;
            const lastAccountId = mapLegacyId(sd.lastAccountId ?? sd.lastWalletId);
            const lastTransferToAccountId = mapLegacyId(
              sd.lastTransferToAccountId ?? sd.lastTransferToWalletId,
            );
            if (sd.lastWalletId !== undefined || sd.lastTransferToWalletId !== undefined) {
              didUpgradeSchema = true;
            }
            const {
              lastWalletId: _lw,
              lastTransferToWalletId: _ltw,
              ...restSd
            } = sd;
            const parsedSd = smartDefaultsSchema.safeParse({
              ...restSd,
              ...(lastAccountId ? { lastAccountId } : {}),
              ...(lastTransferToAccountId ? { lastTransferToAccountId } : {}),
            });
            if (parsedSd.success) {
              hydratedSmartDefaults = parsedSd.data;
            }
          }

          const migratedCategoriesResult = Array.isArray(candidate.categories)
            ? migrateHydratedCategories(candidate.categories)
            : { categories: initial.categories, didMigrate: false };
          if (migratedCategoriesResult.didMigrate) {
            didUpgradeSchema = true;
          }

          const hydratedTransactions = Array.isArray(candidate.transactions)
            ? candidate.transactions.flatMap((t) => {
                const accountUpgraded = upgradeRecordAccountRefs(t);
                const { upgraded, didChange } = upgradeRecordCategoryRefs(accountUpgraded);
                if (didChange) didUpgradeSchema = true;
                const r = transactionSchema.safeParse(upgraded);
                if (!r.success) return [];
                return [
                  isMigratingFromLegacyKey
                    ? { ...r.data, currency: migrateCurrency(r.data.currency) }
                    : r.data,
                ];
              })
            : initial.transactions;

          const budgetMap = new Map<string, CategoryBudget>();
          if (Array.isArray(candidate.categoryBudgets)) {
            for (const b of candidate.categoryBudgets) {
              const { upgraded, didChange } = upgradeRecordCategoryRefs(b);
              if (didChange) didUpgradeSchema = true;
              const r = categoryBudgetSchema.safeParse(upgraded);
              if (!r.success) continue;
              const key = `${r.data.categoryId}::${r.data.periodMonth}`;
              const existing = budgetMap.get(key);
              if (existing) {
                didUpgradeSchema = true;
                budgetMap.set(key, {
                  ...existing,
                  assignedMinor: existing.assignedMinor + r.data.assignedMinor,
                  rolloverEnabled: existing.rolloverEnabled || r.data.rolloverEnabled,
                });
              } else {
                budgetMap.set(key, r.data);
              }
            }
          }
          const hydratedCategoryBudgets = Array.isArray(candidate.categoryBudgets)
            ? Array.from(budgetMap.values())
            : initial.categoryBudgets;

          const hydratedCommitments = Array.isArray(candidate.recurringCommitments)
            ? candidate.recurringCommitments.flatMap((rc) => {
                const accountUpgraded = upgradeRecordAccountRefs(rc);
                const { upgraded, didChange } = upgradeRecordCategoryRefs(accountUpgraded);
                if (didChange) didUpgradeSchema = true;
                const r = recurringCommitmentSchema.safeParse(upgraded);
                if (!r.success) return [];
                return [
                  isMigratingFromLegacyKey
                    ? { ...r.data, currency: migrateCurrency(r.data.currency) }
                    : r.data,
                ];
              })
            : initial.recurringCommitments;

          const hydratedPresets = Array.isArray(candidate.quickPresets)
            ? candidate.quickPresets.flatMap((qp) => {
                const accountUpgraded = upgradeRecordAccountRefs(qp);
                const { upgraded, didChange } = upgradeRecordCategoryRefs(accountUpgraded);
                if (didChange) didUpgradeSchema = true;
                const r = quickPresetSchema.safeParse(upgraded);
                return r.success ? [r.data] : [];
              })
            : initial.quickPresets;

          inMemoryState = {
            accounts: hydratedAccounts.length > 0 ? hydratedAccounts : initial.accounts,
            categories: migratedCategoriesResult.categories,
            transactions: hydratedTransactions,
            smartDefaults: hydratedSmartDefaults,
            categoryBudgets: hydratedCategoryBudgets,
            recurringCommitments: hydratedCommitments,
            sinkingFunds: Array.isArray(candidate.sinkingFunds)
              ? candidate.sinkingFunds.flatMap((sf) => {
                  const upgraded = upgradeRecordAccountRefs(sf);
                  const r = sinkingFundSchema.safeParse(upgraded);
                  return r.success ? [r.data] : [];
                })
              : initial.sinkingFunds,
            quickPresets: hydratedPresets,
            reconciliations: Array.isArray(candidate.reconciliations)
              ? candidate.reconciliations.flatMap((rec) => {
                  const upgraded = upgradeRecordAccountRefs(rec);
                  const r = balanceReconciliationSchema.safeParse(upgraded);
                  return r.success ? [r.data] : [];
                })
              : initial.reconciliations,
          };

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

          if (didUpgradeSchema) {
            saveState(inMemoryState);
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

export async function getAccounts(): Promise<Account[]> {
  const state = getState();
  return state.accounts.map((a) => accountSchema.parse(a));
}

export async function upsertAccount(input: UpsertAccountInput): Promise<Account> {
  const validated = upsertAccountInputSchema.parse(input);
  const state = getState();

  const id =
    validated.id ??
    `account-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const savedAccount = accountSchema.parse({
    id,
    name: validated.name,
    accountType: validated.accountType,
    icon: validated.icon,
    color: validated.color,
    currency: validated.currency,
    balanceMinor: validated.balanceMinor,
  });

  const existingIndex = state.accounts.findIndex((a) => a.id === id);
  if (existingIndex >= 0) {
    state.accounts[existingIndex] = savedAccount;
  } else {
    state.accounts.push(savedAccount);
  }

  saveState(state);
  return savedAccount;
}

export async function deleteAccount(id: string): Promise<void> {
  const state = getState();

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

  state.accounts = state.accounts.filter((a) => a.id !== id);
  const fallbackAccountId = state.accounts[0]?.id;
  if (fallbackAccountId) {
    if (state.smartDefaults.lastAccountId === id) {
      state.smartDefaults.lastAccountId = fallbackAccountId;
    }
    if (state.smartDefaults.lastTransferToAccountId === id) {
      state.smartDefaults.lastTransferToAccountId =
        state.accounts.find((a) => a.id !== state.smartDefaults.lastAccountId)?.id ??
        fallbackAccountId;
    }
  }

  saveState(state);
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

function applyTransactionToAccounts(
  accounts: readonly Account[],
  tx: Transaction,
  direction: 1 | -1,
): Account[] {
  return accounts.map((account) => {
    if (tx.type === 'EXPENSE') {
      if (account.id === tx.accountId) {
        return accountSchema.parse({
          ...account,
          balanceMinor: account.balanceMinor - direction * tx.amountMinor,
        });
      }
    } else if (tx.type === 'INCOME') {
      if (account.id === tx.accountId) {
        return accountSchema.parse({
          ...account,
          balanceMinor: account.balanceMinor + direction * tx.amountMinor,
        });
      }
    } else if (tx.type === 'TRANSFER') {
      if (account.id === tx.accountId) {
        return accountSchema.parse({
          ...account,
          balanceMinor: account.balanceMinor - direction * tx.amountMinor,
        });
      }
      if (tx.toAccountId && account.id === tx.toAccountId) {
        return accountSchema.parse({
          ...account,
          balanceMinor: account.balanceMinor + direction * tx.amountMinor,
        });
      }
    }
    return account;
  });
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

  state.accounts = applyTransactionToAccounts(state.accounts, tx, 1);

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
    lastAccountId: tx.accountId,
    ...(tx.type === 'TRANSFER' && tx.toAccountId
      ? { lastTransferToAccountId: tx.toAccountId }
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

    state.accounts = applyTransactionToAccounts(state.accounts, tx, 1);

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

  state.accounts = applyTransactionToAccounts(state.accounts, tx, -1);

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

export async function updateTransaction(
  input: UpdateTransactionInput,
): Promise<Transaction> {
  const validatedInput = updateTransactionInputSchema.parse(input);
  const state = getState();

  const existingIndex = state.transactions.findIndex((t) => t.id === validatedInput.id);
  if (existingIndex < 0) {
    throw new Error('Transaction not found.');
  }

  const existingTx = state.transactions[existingIndex];
  const updatedTx = transactionSchema.parse({
    ...validatedInput,
    createdAt: existingTx.createdAt,
  });

  // Reverse existing balance effect, then apply updated balance effect
  const revertedAccounts = applyTransactionToAccounts(state.accounts, existingTx, -1);
  state.accounts = applyTransactionToAccounts(revertedAccounts, updatedTx, 1);

  // Adjust category usage counts (decrement old, increment new)
  const oldCategoryIds = getTransactionCategoryIds(existingTx);
  const newCategoryIds = getTransactionCategoryIds(updatedTx);

  if (oldCategoryIds.size > 0 || newCategoryIds.size > 0) {
    state.categories = state.categories.map((c) => {
      const delta = (newCategoryIds.has(c.id) ? 1 : 0) - (oldCategoryIds.has(c.id) ? 1 : 0);
      if (delta === 0) {
        return c;
      }
      return categorySchema.parse({
        ...c,
        usageCount: Math.max(0, c.usageCount + delta),
      });
    });
  }

  // Update smartDefaults with updated merchant/tags/account
  let recentMerchants = [...state.smartDefaults.recentMerchants];
  if (updatedTx.merchant && updatedTx.merchant.trim().length > 0) {
    const trimmed = updatedTx.merchant.trim();
    const lower = trimmed.toLowerCase();
    recentMerchants = [
      trimmed,
      ...recentMerchants.filter((m) => m.toLowerCase() !== lower),
    ].slice(0, 12);
  }

  const knownTags = [...state.smartDefaults.knownTags];
  if (updatedTx.tags && updatedTx.tags.length > 0) {
    const normalizedNewTags = updatedTx.tags
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
    lastAccountId: updatedTx.accountId,
    ...(updatedTx.type === 'TRANSFER' && updatedTx.toAccountId
      ? { lastTransferToAccountId: updatedTx.toAccountId }
      : {}),
    recentMerchants,
    knownTags,
  });

  state.transactions = state.transactions.map((t, index) =>
    index === existingIndex ? updatedTx : t,
  );
  saveState(state);

  return updatedTx;
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
  state.accounts = DEFAULT_ACCOUNTS.map((a) => ({ ...a }));
  state.categories = DEFAULT_CATEGORIES.map((c) => ({ ...c }));
  state.reconciliations = [];
  saveState(state);
}

export async function resetLocalStore(): Promise<void> {
  const initial = getInitialState();
  saveState(initial);
}

// ==========================================
// Envelope Budgets API
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
// Recurring Commitments API
// ==========================================

export async function getRecurringCommitments(): Promise<RecurringCommitment[]> {
  const state = getState();
  return state.recurringCommitments.map((rc) => recurringCommitmentSchema.parse(rc));
}

export async function upsertRecurringCommitment(
  input: Omit<RecurringCommitmentInput, 'id'> & { id?: string },
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

export async function payRecurringCommitment(params: {
  commitmentId: string;
  paidAtIso?: string;
  accountId?: string;
}): Promise<{ commitment: RecurringCommitment; transaction: Transaction }> {
  const state = getState();
  const commitment = state.recurringCommitments.find((rc) => rc.id === params.commitmentId);
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

  const targetAccountId = params.accountId ?? commitment.accountId;
  const targetAccount = state.accounts.find((a) => a.id === targetAccountId);
  const currency = targetAccount?.currency ?? commitment.currency ?? DEFAULT_CURRENCY;

  const isInstallment = commitment.kind === 'INSTALLMENT';
  const hasTerms =
    isInstallment ||
    (typeof commitment.totalInstallments === 'number' &&
      commitment.totalInstallments > 0);
  const tx = await createTransaction({
    type: 'EXPENSE',
    amountMinor: commitment.amountMinor,
    currency,
    accountId: targetAccountId,
    categoryId: commitment.categoryId,
    merchant: commitment.name,
    note:
      commitment.notes ??
      (isInstallment ? 'Loan installment payment' : 'Scheduled recurring payment'),
    tags: isInstallment ? ['loan', 'recurring'] : ['recurring'],
    occurredAt: validDate.toISOString(),
  });

  const currentState = getState();
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
      ? advanceNextDueDate(commitment.nextDueDate, commitment.frequency, commitment.dueDay)
      : commitment.nextDueDate;

  const updatedCommitment = recurringCommitmentSchema.parse({
    ...commitment,
    lastPaidPeriod: periodMonth,
    lastPaidTransactionId: tx.id,
    paidInstallments: nextPaidInstallments,
    isActive: reachedPayoff ? false : commitment.isActive,
    ...(hasNextDueDate
      ? {
          previousNextDueDate: reachedPayoff ? undefined : commitment.nextDueDate,
          nextDueDate,
        }
      : {}),
  });

  currentState.recurringCommitments = currentState.recurringCommitments.map((rc) =>
    rc.id === commitment.id ? updatedCommitment : rc,
  );
  saveState(currentState);

  return { commitment: updatedCommitment, transaction: tx };
}

export async function unpayRecurringCommitment(
  commitmentId: string,
): Promise<RecurringCommitment> {
  const state = getState();
  const commitment = state.recurringCommitments.find((rc) => rc.id === commitmentId);
  if (!commitment) {
    throw new Error('Scheduled expense not found.');
  }

  if (commitment.lastPaidTransactionId) {
    await deleteTransaction(commitment.lastPaidTransactionId);
  }

  const currentState = getState();
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

  currentState.recurringCommitments = currentState.recurringCommitments.map((rc) =>
    rc.id === commitment.id ? updatedCommitment : rc,
  );
  saveState(currentState);

  return updatedCommitment;
}

// ==========================================
// Sinking Funds API
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
  sourceAccountId: string,
): Promise<{ fund: SinkingFund; transaction: Transaction }> {
  positiveAmountMinorSchema.parse(amountMinor);
  const state = getState();
  const fund = state.sinkingFunds.find((sf) => sf.id === fundId);
  if (!fund) {
    throw new Error(`Sinking fund "${fundId}" not found`);
  }

  const sourceCurrency =
    state.accounts.find((a) => a.id === sourceAccountId)?.currency ?? DEFAULT_CURRENCY;

  let tx: Transaction;
  if (sourceAccountId !== fund.accountId) {
    tx = await createTransaction({
      type: 'TRANSFER',
      amountMinor,
      currency: sourceCurrency,
      accountId: sourceAccountId,
      toAccountId: fund.accountId,
      merchant: fund.name,
      note: `Contribution to ${fund.name}`,
      tags: ['sinking-fund'],
      occurredAt: new Date().toISOString(),
    });
  } else {
    tx = await createTransaction({
      type: 'EXPENSE',
      amountMinor,
      currency: sourceCurrency,
      accountId: sourceAccountId,
      categoryId: 'cat-home',
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
// Quick Presets API
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
  const state = getState();
  const account = state.accounts.find((a) => a.id === validatedInput.accountId);
  if (!account) {
    throw new Error(`Account "${validatedInput.accountId}" not found`);
  }

  const delta = computeReconciliationDelta(
    account.balanceMinor,
    validatedInput.actualBalanceMinor,
  );

  let adjustmentTransaction: Transaction | undefined;
  if (validatedInput.createAdjustment && delta.needsAdjustment) {
    if (delta.adjustmentType === 'INCOME') {
      adjustmentTransaction = await createTransaction({
        type: 'INCOME',
        amountMinor: delta.adjustmentAmountMinor,
        currency: account.currency ?? DEFAULT_CURRENCY,
        accountId: validatedInput.accountId,
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
        currency: account.currency ?? DEFAULT_CURRENCY,
        accountId: validatedInput.accountId,
        categoryId: 'cat-dues',
        merchant: 'Balance Adjustment',
        note: validatedInput.notes || 'Reconciliation adjustment',
        tags: ['reconciliation'],
        occurredAt: new Date().toISOString(),
      });
    }
  }

  // Ensure account actual balance matches actualBalanceMinor directly
  const currentState = getState();
  currentState.accounts = currentState.accounts.map((a) =>
    a.id === validatedInput.accountId
      ? accountSchema.parse({
          ...a,
          balanceMinor: validatedInput.actualBalanceMinor,
        })
      : a,
  );

  const reconciliation: BalanceReconciliation = balanceReconciliationSchema.parse({
    id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    accountId: validatedInput.accountId,
    appBalanceMinor: account.balanceMinor,
    actualBalanceMinor: validatedInput.actualBalanceMinor,
    discrepancyMinor: delta.discrepancyMinor,
    reconciledAt: new Date().toISOString(),
    ...(adjustmentTransaction ? { adjustmentTransactionId: adjustmentTransaction.id } : {}),
  });

  currentState.reconciliations.push(reconciliation);
  saveState(currentState);

  const updatedAccount = currentState.accounts.find((a) => a.id === validatedInput.accountId)!;
  return {
    reconciliation,
    adjustmentTransaction,
    account: updatedAccount,
  };
}

export async function getReconciliations(accountId?: string): Promise<BalanceReconciliation[]> {
  const state = getState();
  const list = [...state.reconciliations].reverse();
  if (accountId) {
    return list.filter((r) => r.accountId === accountId);
  }
  return list;
}

// ==========================================
// Safe-to-Spend API
// ==========================================

export async function getSafeToSpendMetrics(currentDate?: Date): Promise<SafeToSpendMetrics> {
  const state = getState();
  const date = currentDate ?? new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const periodMonth = `${year}-${month}`;

  const cashLikeAccounts = state.accounts.filter((a) => a.accountType !== 'CREDIT_CARD');
  const nonSavingsAccounts = cashLikeAccounts.filter((a) => a.id !== 'account-savings');
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
  const state = getState();
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
  const state = getState();

  if (mode === 'overwrite') {
    const newState: LocalStoreState = {
      accounts: envelope.data.accounts.map((a) => accountSchema.parse(a)),
      categories: envelope.data.categories.map((c) => categorySchema.parse(c)),
      transactions: envelope.data.transactions.map((t) => transactionSchema.parse(t)),
      categoryBudgets: envelope.data.categoryBudgets.map((b) => categoryBudgetSchema.parse(b)),
      recurringCommitments: envelope.data.recurringCommitments.map((rc) =>
        recurringCommitmentSchema.parse(rc),
      ),
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

  const mergedAccounts = mergeById(state.accounts, envelope.data.accounts);
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
    accounts: mergedAccounts.map((a) => accountSchema.parse(a)),
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
