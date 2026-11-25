import { z } from 'zod';
import { DEFAULT_CURRENCY, parseDecimalToMinorUnits } from './money';
import {
  type Account,
  accountSchema,
  type Category,
  categorySchema,
  type CreateTransactionInput,
  createTransactionInputSchema,
  DEFAULT_CATEGORIES,
  normalizeLegacyAccountType,
  normalizeLegacyCategoryId,
  type Transaction,
  transactionSchema,
  smartDefaultsSchema,
} from './transactions.schema';
import { categoryBudgetSchema } from './category-budget.schema';
import { incomeSourceSchema } from './income-plan.schema';
import { recurringCommitmentSchema } from './recurring.schema';
import { sinkingFundSchema } from './sinking-funds.schema';
import { quickPresetSchema } from './presets.schema';

export const backupEnvelopeSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  data: z.object({
    accounts: z.array(accountSchema).max(100),
    categories: z.array(categorySchema).max(200),
    transactions: z.array(transactionSchema).max(5000),
    categoryBudgets: z.array(categoryBudgetSchema).max(500),
    recurringCommitments: z.array(recurringCommitmentSchema).max(200),
    sinkingFunds: z.array(sinkingFundSchema).max(100),
    quickPresets: z.array(quickPresetSchema).max(100),
    incomeSources: z.array(incomeSourceSchema).max(50).optional(),
    smartDefaults: smartDefaultsSchema.optional(),
  }),
});
export type BackupEnvelope = z.infer<typeof backupEnvelopeSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function mapRecordAccountRefs(
  item: unknown,
  idMap: Map<string, string>,
): unknown {
  if (!isRecord(item)) return item;
  const rawAccountId = item.accountId ?? item.walletId;
  const rawToAccountId = item.toAccountId ?? item.toWalletId;
  const { walletId: _w, toWalletId: _tw, ...rest } = item;
  const mappedAccountId =
    typeof rawAccountId === 'string'
      ? (idMap.get(rawAccountId) ?? rawAccountId)
      : rawAccountId;
  const mappedToAccountId =
    typeof rawToAccountId === 'string'
      ? (idMap.get(rawToAccountId) ?? rawToAccountId)
      : rawToAccountId;

  return {
    ...rest,
    ...(mappedAccountId !== undefined ? { accountId: mappedAccountId } : {}),
    ...(mappedToAccountId !== undefined ? { toAccountId: mappedToAccountId } : {}),
  };
}

function mapRecordCategoryRefs(item: unknown): unknown {
  if (!isRecord(item)) return item;
  let next: Record<string, unknown> = item;
  if (typeof item.categoryId === 'string') {
    const mappedCategoryId = normalizeLegacyCategoryId(item.categoryId);
    if (mappedCategoryId !== item.categoryId) {
      next = { ...next, categoryId: mappedCategoryId };
    }
  }
  if (Array.isArray(item.splits)) {
    const mappedSplits = item.splits.map((split) => {
      if (!isRecord(split) || typeof split.categoryId !== 'string') {
        return split;
      }
      const mappedSplitCat = normalizeLegacyCategoryId(split.categoryId);
      return mappedSplitCat !== split.categoryId
        ? { ...split, categoryId: mappedSplitCat }
        : split;
    });
    next = { ...next, splits: mappedSplits };
  }
  return next;
}

function normalizeLegacyCategoriesList(rawCategories: unknown): unknown {
  if (!Array.isArray(rawCategories) || rawCategories.length === 0) {
    return rawCategories;
  }

  const canonicalIds = new Set(DEFAULT_CATEGORIES.map((c) => c.id));
  const usageByCanonicalId = new Map<string, number>();
  const customCategories: Record<string, unknown>[] = [];
  const seenCustomIds = new Set<string>();

  for (const entry of rawCategories) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id) continue;
    const rawUsage =
      typeof entry.usageCount === 'number' && Number.isFinite(entry.usageCount) && entry.usageCount >= 0
        ? Math.floor(entry.usageCount)
        : 0;

    if (entry.isCustom === true) {
      if (!seenCustomIds.has(entry.id)) {
        seenCustomIds.add(entry.id);
        customCategories.push(entry);
      }
      continue;
    }

    const mappedId = normalizeLegacyCategoryId(entry.id);
    if (canonicalIds.has(mappedId)) {
      usageByCanonicalId.set(mappedId, (usageByCanonicalId.get(mappedId) ?? 0) + rawUsage);
    }
  }

  const canonicalList = DEFAULT_CATEGORIES.map((cat) => ({
    ...cat,
    usageCount: usageByCanonicalId.get(cat.id) ?? cat.usageCount,
  }));

  return [...canonicalList, ...customCategories];
}

/**
 * Normalizes legacy backup payloads (which used `wallets` / `walletId` / `DEBIT` / `CREDIT`)
 * into the unified `accounts` / `accountId` schema before validation.
 */
export function normalizeBackupEnvelope(raw: unknown): unknown {
  if (!isRecord(raw) || !isRecord(raw.data)) {
    return raw;
  }

  const data = raw.data;
  const rawAccountsList = Array.isArray(data.accounts)
    ? data.accounts
    : Array.isArray(data.wallets)
      ? data.wallets
      : [];

  const legacyIdMap = new Map<string, string>([
    ['wallet-checking', 'account-bank'],
    ['wallet-debit', 'account-bank'],
    ['wallet-card', 'account-card'],
    ['wallet-cash', 'account-cash'],
    ['wallet-savings', 'account-savings'],
  ]);

  const seenIds = new Set<string>();
  const normalizedAccounts: Record<string, unknown>[] = [];
  for (const entry of rawAccountsList) {
    if (!isRecord(entry)) continue;
    const rawId = typeof entry.id === 'string' ? entry.id : '';
    const mappedId = legacyIdMap.get(rawId) ?? rawId;
    if (!mappedId || seenIds.has(mappedId)) continue;
    seenIds.add(mappedId);

    const rawName = typeof entry.name === 'string' ? entry.name : '';
    const normalizedName =
      rawName.trim().toLowerCase() === 'checking' ? 'Main Bank' : rawName;

    normalizedAccounts.push({
      ...entry,
      id: mappedId,
      name: normalizedName,
      accountType: normalizeLegacyAccountType(entry.accountType),
    });
  }

  const normalizedCategories = normalizeLegacyCategoriesList(data.categories);
  const normalizedTransactions = Array.isArray(data.transactions)
    ? data.transactions.map((t) => mapRecordCategoryRefs(mapRecordAccountRefs(t, legacyIdMap)))
    : data.transactions;
  const normalizedBudgets = Array.isArray(data.categoryBudgets)
    ? data.categoryBudgets.map((b) => mapRecordCategoryRefs(b))
    : data.categoryBudgets;
  const normalizedCommitments = Array.isArray(data.recurringCommitments)
    ? data.recurringCommitments.map((rc) =>
        mapRecordCategoryRefs(mapRecordAccountRefs(rc, legacyIdMap)),
      )
    : data.recurringCommitments;
  const normalizedFunds = Array.isArray(data.sinkingFunds)
    ? data.sinkingFunds.map((sf) => mapRecordAccountRefs(sf, legacyIdMap))
    : data.sinkingFunds;
  const normalizedPresets = Array.isArray(data.quickPresets)
    ? data.quickPresets.map((qp) => mapRecordCategoryRefs(mapRecordAccountRefs(qp, legacyIdMap)))
    : data.quickPresets;
  const normalizedIncomeSources = Array.isArray(data.incomeSources)
    ? data.incomeSources.map((src) => mapRecordAccountRefs(src, legacyIdMap))
    : [];

  let normalizedSmartDefaults = data.smartDefaults;
  if (isRecord(data.smartDefaults)) {
    const sd = data.smartDefaults;
    const rawLastId = sd.lastAccountId ?? sd.lastWalletId;
    const rawLastToId = sd.lastTransferToAccountId ?? sd.lastTransferToWalletId;
    const {
      lastWalletId: _lw,
      lastTransferToWalletId: _ltw,
      ...restSd
    } = sd;
    normalizedSmartDefaults = {
      ...restSd,
      ...(typeof rawLastId === 'string'
        ? { lastAccountId: legacyIdMap.get(rawLastId) ?? rawLastId }
        : {}),
      ...(typeof rawLastToId === 'string'
        ? { lastTransferToAccountId: legacyIdMap.get(rawLastToId) ?? rawLastToId }
        : {}),
    };
  }

  const { wallets: _legacyWallets, ...restData } = data;
  return {
    ...raw,
    data: {
      ...restData,
      accounts: normalizedAccounts,
      categories: normalizedCategories,
      transactions: normalizedTransactions,
      categoryBudgets: normalizedBudgets,
      recurringCommitments: normalizedCommitments,
      sinkingFunds: normalizedFunds,
      quickPresets: normalizedPresets,
      incomeSources: normalizedIncomeSources,
      smartDefaults: normalizedSmartDefaults,
    },
  };
}

function escapeCsvField(value: string | number | undefined | null): string {
  if (value === undefined || value === null) {
    return '';
  }
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Serializes an array of transactions into RFC 4180 compliant CSV text.
 */
export function serializeTransactionsToCsv(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  accounts: readonly Account[],
): string {
  const headers = [
    'Date',
    'Type',
    'Amount',
    'Currency',
    'Account',
    'ToAccount',
    'Category',
    'Merchant',
    'Notes',
    'Tags',
  ];

  const categoryMap = new Map<string, string>();
  for (const c of categories) {
    categoryMap.set(c.id, c.name);
  }

  const accountMap = new Map<string, string>();
  for (const a of accounts) {
    accountMap.set(a.id, a.name);
  }

  const lines: string[] = [headers.join(',')];

  for (const tx of transactions) {
    const accountName = accountMap.get(tx.accountId) ?? tx.accountId;
    const toAccountName = tx.toAccountId
      ? (accountMap.get(tx.toAccountId) ?? tx.toAccountId)
      : '';
    const categoryName = tx.categoryId
      ? (categoryMap.get(tx.categoryId) ?? tx.categoryId)
      : '';
    const decimalAmount = (tx.amountMinor / 100).toFixed(2);
    const tagsStr = (tx.tags ?? []).join(';');

    const row = [
      escapeCsvField(tx.occurredAt),
      escapeCsvField(tx.type),
      escapeCsvField(decimalAmount),
      escapeCsvField(tx.currency ?? DEFAULT_CURRENCY),
      escapeCsvField(accountName),
      escapeCsvField(toAccountName),
      escapeCsvField(categoryName),
      escapeCsvField(tx.merchant ?? ''),
      escapeCsvField(tx.note ?? ''),
      escapeCsvField(tagsStr),
    ];

    lines.push(row.join(','));
  }

  return lines.join('\r\n');
}

/**
 * RFC 4180 CSV tokenizer parsing text into an array of string rows.
 */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
        i++;
        continue;
      } else if (char === '\r') {
        if (i + 1 < text.length && text[i + 1] === '\n') {
          i++;
        }
        currentRow.push(currentField);
        currentField = '';
        rows.push(currentRow);
        currentRow = [];
        i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentField);
        currentField = '';
        rows.push(currentRow);
        currentRow = [];
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

export interface ParseTransactionsCsvResult {
  valid: CreateTransactionInput[];
  errors: string[];
}

/**
 * Parses RFC 4180 CSV text into validated CreateTransactionInput records,
 * resolving accounts and categories by name or ID.
 */
export function parseTransactionsFromCsv(
  csvText: string,
  accounts: readonly Account[],
  categories: readonly Category[],
): ParseTransactionsCsvResult {
  const rows = parseCsvRows(csvText);
  const valid: CreateTransactionInput[] = [];
  const errors: string[] = [];

  if (rows.length === 0) {
    return { valid, errors };
  }

  // Find header line
  let headerIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.some((cell) => cell.trim().toLowerCase() === 'amount')) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    errors.push('Could not find header row containing "Amount" column');
    return { valid, errors };
  }

  const headerMap = new Map<string, number>();
  rows[headerIndex].forEach((h, idx) => {
    headerMap.set(h.trim().toLowerCase(), idx);
  });

  const getCol = (row: string[], colNames: string[]): string | undefined => {
    for (const name of colNames) {
      const idx = headerMap.get(name);
      if (idx !== undefined && idx < row.length) {
        return row[idx].trim();
      }
    }
    return undefined;
  };

  for (let r = headerIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    const rowNum = r + 1;

    // Skip empty lines
    if (row.length === 0 || row.every((c) => c.trim() === '')) {
      continue;
    }

    const rawDate = getCol(row, ['date', 'occurredat', 'occurred at', 'time']);
    const rawType = getCol(row, ['type', 'transactiontype']);
    const rawAmount = getCol(row, ['amount', 'amountminor']);
    const rawCurrency = getCol(row, ['currency']) || DEFAULT_CURRENCY;
    const rawAccount = getCol(row, ['account', 'accountid', 'wallet', 'walletid']);
    const rawToAccount = getCol(row, [
      'toaccount',
      'to account',
      'toaccountid',
      'destinationaccount',
      'towallet',
      'to wallet',
      'towalletid',
      'destinationwallet',
    ]);
    const rawCategory = getCol(row, ['category', 'categoryid']);
    const rawMerchant = getCol(row, ['merchant', 'payee']);
    const rawNotes = getCol(row, ['notes', 'note', 'description']);
    const rawTags = getCol(row, ['tags', 'tag']);

    // Validate Date
    if (!rawDate) {
      errors.push(`Row ${rowNum}: Missing date`);
      continue;
    }
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) {
      errors.push(`Row ${rowNum}: Invalid date format "${rawDate}"`);
      continue;
    }
    const occurredAt = d.toISOString();

    // Validate Type
    const typeUpper = (rawType ?? '').toUpperCase();
    if (typeUpper !== 'EXPENSE' && typeUpper !== 'INCOME' && typeUpper !== 'TRANSFER') {
      errors.push(`Row ${rowNum}: Invalid transaction type "${rawType ?? ''}"`);
      continue;
    }

    // Validate Amount
    if (!rawAmount) {
      errors.push(`Row ${rowNum}: Missing amount`);
      continue;
    }
    const parsedAmount = parseDecimalToMinorUnits(rawAmount);
    if (parsedAmount === null || parsedAmount <= 0) {
      errors.push(`Row ${rowNum}: Invalid amount "${rawAmount}"`);
      continue;
    }
    const amountMinor = parsedAmount;

    // Validate Account
    if (!rawAccount) {
      errors.push(`Row ${rowNum}: Missing account`);
      continue;
    }
    const account = accounts.find(
      (a) => a.name.toLowerCase() === rawAccount.toLowerCase() || a.id === rawAccount,
    );
    if (!account) {
      errors.push(`Row ${rowNum}: Account "${rawAccount}" not found`);
      continue;
    }

    // Parse Tags
    const tags: string[] = rawTags
      ? rawTags
          .split(/[;,]/)
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
      : [];

    let inputCandidate: Record<string, unknown>;

    if (typeUpper === 'TRANSFER') {
      if (!rawToAccount) {
        errors.push(`Row ${rowNum}: Destination account required for transfer`);
        continue;
      }
      const toAccount = accounts.find(
        (a) => a.name.toLowerCase() === rawToAccount.toLowerCase() || a.id === rawToAccount,
      );
      if (!toAccount) {
        errors.push(`Row ${rowNum}: Destination account "${rawToAccount}" not found`);
        continue;
      }
      if (account.id === toAccount.id) {
        errors.push(`Row ${rowNum}: Destination account must differ from source account`);
        continue;
      }

      inputCandidate = {
        type: 'TRANSFER',
        amountMinor,
        currency: rawCurrency.toUpperCase(),
        accountId: account.id,
        toAccountId: toAccount.id,
        merchant: rawMerchant || undefined,
        note: rawNotes || undefined,
        tags,
        occurredAt,
      };
    } else {
      // EXPENSE or INCOME
      if (!rawCategory) {
        errors.push(`Row ${rowNum}: Category required for ${typeUpper}`);
        continue;
      }
      const category = categories.find(
        (c) => c.name.toLowerCase() === rawCategory.toLowerCase() || c.id === rawCategory,
      );
      if (!category) {
        errors.push(`Row ${rowNum}: Category "${rawCategory}" not found`);
        continue;
      }

      inputCandidate = {
        type: typeUpper,
        amountMinor,
        currency: rawCurrency.toUpperCase(),
        accountId: account.id,
        categoryId: category.id,
        merchant: rawMerchant || undefined,
        note: rawNotes || undefined,
        tags,
        occurredAt,
      };
    }

    const parseResult = createTransactionInputSchema.safeParse(inputCandidate);
    if (!parseResult.success) {
      const issueMsgs = parseResult.error.issues.map((i) => i.message).join('; ');
      errors.push(`Row ${rowNum}: Validation failed - ${issueMsgs}`);
    } else {
      valid.push(parseResult.data);
    }
  }

  return { valid, errors };
}
