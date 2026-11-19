import { z } from 'zod';
import { parseDecimalToMinorUnits } from './money';
import {
  type Category,
  categorySchema,
  type CreateTransactionInput,
  createTransactionInputSchema,
  type Transaction,
  transactionSchema,
  type Wallet,
  walletSchema,
  smartDefaultsSchema,
} from './transactions.schema';
import { categoryBudgetSchema } from './category-budget.schema';
import { recurringCommitmentSchema } from './recurring.schema';
import { sinkingFundSchema } from './sinking-funds.schema';
import { quickPresetSchema } from './presets.schema';

export const backupEnvelopeSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  data: z.object({
    wallets: z.array(walletSchema),
    categories: z.array(categorySchema),
    transactions: z.array(transactionSchema),
    categoryBudgets: z.array(categoryBudgetSchema),
    recurringCommitments: z.array(recurringCommitmentSchema),
    sinkingFunds: z.array(sinkingFundSchema),
    quickPresets: z.array(quickPresetSchema),
    smartDefaults: smartDefaultsSchema.optional(),
  }),
});
export type BackupEnvelope = z.infer<typeof backupEnvelopeSchema>;

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
  wallets: readonly Wallet[],
): string {
  const headers = [
    'Date',
    'Type',
    'Amount',
    'Currency',
    'Wallet',
    'ToWallet',
    'Category',
    'Merchant',
    'Notes',
    'Tags',
  ];

  const categoryMap = new Map<string, string>();
  for (const c of categories) {
    categoryMap.set(c.id, c.name);
  }

  const walletMap = new Map<string, string>();
  for (const w of wallets) {
    walletMap.set(w.id, w.name);
  }

  const lines: string[] = [headers.join(',')];

  for (const tx of transactions) {
    const walletName = walletMap.get(tx.walletId) ?? tx.walletId;
    const toWalletName = tx.toWalletId
      ? (walletMap.get(tx.toWalletId) ?? tx.toWalletId)
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
      escapeCsvField(tx.currency ?? 'PHP'),
      escapeCsvField(walletName),
      escapeCsvField(toWalletName),
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
 * resolving wallets and categories by name or ID.
 */
export function parseTransactionsFromCsv(
  csvText: string,
  wallets: readonly Wallet[],
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
    const rawCurrency = getCol(row, ['currency']) || 'PHP';
    const rawWallet = getCol(row, ['wallet', 'walletid', 'account']);
    const rawToWallet = getCol(row, ['towallet', 'to wallet', 'towalletid', 'destinationwallet']);
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

    // Validate Wallet
    if (!rawWallet) {
      errors.push(`Row ${rowNum}: Missing wallet`);
      continue;
    }
    const wallet = wallets.find(
      (w) => w.name.toLowerCase() === rawWallet.toLowerCase() || w.id === rawWallet,
    );
    if (!wallet) {
      errors.push(`Row ${rowNum}: Wallet "${rawWallet}" not found`);
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
      if (!rawToWallet) {
        errors.push(`Row ${rowNum}: Destination wallet required for transfer`);
        continue;
      }
      const toWallet = wallets.find(
        (w) => w.name.toLowerCase() === rawToWallet.toLowerCase() || w.id === rawToWallet,
      );
      if (!toWallet) {
        errors.push(`Row ${rowNum}: Destination wallet "${rawToWallet}" not found`);
        continue;
      }
      if (wallet.id === toWallet.id) {
        errors.push(`Row ${rowNum}: Destination wallet must differ from source wallet`);
        continue;
      }

      inputCandidate = {
        type: 'TRANSFER',
        amountMinor,
        currency: rawCurrency.toUpperCase(),
        walletId: wallet.id,
        toWalletId: toWallet.id,
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
        walletId: wallet.id,
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
