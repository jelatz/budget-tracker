import { createHash, randomUUID } from 'node:crypto';
import {
  computeSafeToSpend,
  formatCalendarDateString,
  formatMinorUnits,
  getCommitmentDueStatus,
  getNextPaydayHorizonDate,
  isCommitmentPaidOff,
  MAX_SAFE_MONEY_MINOR,
  parseCalendarDate,
  parseDecimalToMinorUnits,
  transactionSchema,
  type Account,
  type Category,
  type RecurringCommitment,
} from '@repo/contracts';
import { z } from 'zod';
import { AppError } from '../../core/errors';
import type { SyncRepository } from '../sync/repository';
import type { TransactionsRepository } from '../transactions/repository';

export interface McpToolDependencies {
  userId: string;
  transactionsRepo: TransactionsRepository;
  syncRepo: SyncRepository;
}

export interface McpToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
}

export interface McpToolCallResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export const MCP_TOOL_DEFINITIONS: readonly McpToolDefinition[] = [
  {
    name: 'get_budget_context',
    title: 'Get Budget Context',
    description:
      'Fetch the user accounts, expense/income categories, active loans/bills/installments, and current Safe-to-Spend metrics. Always call this first when you need exact account, category, or obligation names/IDs.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'log_transaction',
    title: 'Log Transaction',
    description:
      'Log an EXPENSE, INCOME, or TRANSFER transaction in the user budget tracker. Amount is in major currency units (e.g. 350 or 125.50). Account and category can be given by name or ID.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['EXPENSE', 'INCOME', 'TRANSFER'],
          description: 'Transaction type.',
        },
        amount: {
          type: 'number',
          exclusiveMinimum: 0,
          description:
            'Amount in major currency units (e.g. 350 for PHP 350.00, 12.5 for 12.50). Up to 2 decimal places.',
        },
        account: {
          type: 'string',
          description:
            'Source account name or ID (e.g. "Maribank CC", "Cash on Hand", "Unionbank Debit").',
        },
        toAccount: {
          type: 'string',
          description:
            'Destination account name or ID (required when type is TRANSFER).',
        },
        category: {
          type: 'string',
          description:
            'Category name or ID (required for EXPENSE and INCOME; omit for TRANSFER).',
        },
        merchant: {
          type: 'string',
          maxLength: 80,
          description: 'Merchant or payee name (e.g. "Starbucks", "Grab").',
        },
        note: {
          type: 'string',
          maxLength: 280,
          description: 'Optional short note or memo.',
        },
        occurredAt: {
          type: 'string',
          description:
            'Optional ISO-8601 timestamp or YYYY-MM-DD date. Defaults to current time.',
        },
        idempotencyKey: {
          type: 'string',
          maxLength: 120,
          description:
            'Optional unique key for safe retries without creating duplicate transactions.',
        },
      },
      required: ['type', 'amount', 'account'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'list_recent_transactions',
    title: 'List Recent Transactions',
    description:
      'List recent transactions, optionally filtered by type, account name/ID, or search keyword.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          default: 10,
          description: 'Maximum number of transactions to return (1-50).',
        },
        type: {
          type: 'string',
          enum: ['EXPENSE', 'INCOME', 'TRANSFER'],
          description: 'Optional filter by transaction type.',
        },
        account: {
          type: 'string',
          description: 'Optional filter by account name or ID.',
        },
        search: {
          type: 'string',
          description:
            'Optional case-insensitive keyword filter matching merchant, note, category, or account.',
        },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'delete_transaction',
    title: 'Delete Transaction',
    description:
      'Delete a transaction by its ID and revert its balance impact. Useful for undoing a mistakenly logged transaction.',
    inputSchema: {
      type: 'object',
      properties: {
        transactionId: {
          type: 'string',
          minLength: 1,
          description: 'Exact ID of the transaction to delete.',
        },
      },
      required: ['transactionId'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'pay_obligation',
    title: 'Pay Obligation',
    description:
      'Record a monthly payment for a loan, recurring bill, or credit card installment (e.g. "JBL Partybox", "House Rent").',
    inputSchema: {
      type: 'object',
      properties: {
        obligation: {
          type: 'string',
          minLength: 1,
          description: 'Obligation name or ID.',
        },
        amount: {
          type: 'number',
          exclusiveMinimum: 0,
          description:
            'Optional actual payment amount in major currency units. Defaults to the scheduled obligation amount.',
        },
        account: {
          type: 'string',
          description:
            'Optional payment account name or ID. Defaults to the obligation default account.',
        },
        paidAt: {
          type: 'string',
          description:
            'Optional ISO-8601 timestamp or YYYY-MM-DD date. Defaults to current time.',
        },
      },
      required: ['obligation'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'unpay_obligation',
    title: 'Undo Obligation Payment',
    description:
      'Undo the most recent payment status for a loan, recurring bill, or credit card installment.',
    inputSchema: {
      type: 'object',
      properties: {
        obligation: {
          type: 'string',
          minLength: 1,
          description: 'Obligation name or ID.',
        },
      },
      required: ['obligation'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
];

function toolSuccess(payload: Record<string, unknown>): McpToolCallResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function toolError(
  message: string,
  details?: Record<string, unknown>,
): McpToolCallResult {
  const payload = { error: message, ...(details ?? {}) };
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
    isError: true,
  };
}

function decimalAmountToMinorUnits(amount: number): number | null {
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  const fixed = amount.toFixed(2);
  const parsedFromString = parseDecimalToMinorUnits(amount.toString());
  if (parsedFromString !== null) {
    if (parsedFromString <= 0 || parsedFromString > MAX_SAFE_MONEY_MINOR) {
      return null;
    }
    return parsedFromString;
  }
  if (Math.abs(Number(fixed) - amount) < 1e-9) {
    const fallback = parseDecimalToMinorUnits(fixed);
    if (fallback !== null && fallback > 0 && fallback <= MAX_SAFE_MONEY_MINOR) {
      return fallback;
    }
  }
  return null;
}

function resolveDateInput(
  rawInput?: string,
): { iso: string; periodMonth: string } | null {
  if (!rawInput || rawInput.trim().length === 0) {
    const now = new Date();
    return {
      iso: now.toISOString(),
      periodMonth: formatCalendarDateString(now).slice(0, 7),
    };
  }
  const trimmed = rawInput.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const cal = parseCalendarDate(trimmed);
    if (!cal) {
      return null;
    }
    return {
      iso: `${trimmed}T12:00:00.000Z`,
      periodMonth: trimmed.slice(0, 7),
    };
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return {
    iso: parsed.toISOString(),
    periodMonth: parsed.toISOString().slice(0, 7),
  };
}

function resolveNamedItem<T extends { id: string; name: string }>(
  items: readonly T[],
  query: string,
  label: string,
): { item: T } | { error: string; candidates: string[] } {
  const trimmed = query.trim();
  const byId = items.find((i) => i.id === trimmed);
  if (byId) {
    return { item: byId };
  }

  const lower = trimmed.toLowerCase();
  const exactMatches = items.filter((i) => i.name.trim().toLowerCase() === lower);
  if (exactMatches.length === 1) {
    return { item: exactMatches[0] };
  }
  if (exactMatches.length > 1) {
    return {
      error: `Multiple ${label}s match "${trimmed}": ${exactMatches.map((m) => m.name).join(', ')}.`,
      candidates: exactMatches.map((m) => m.name),
    };
  }

  const partialMatches = items.filter((i) =>
    i.name.trim().toLowerCase().includes(lower),
  );
  if (partialMatches.length === 1) {
    return { item: partialMatches[0] };
  }
  if (partialMatches.length > 1) {
    return {
      error: `Ambiguous ${label} "${trimmed}". Matches: ${partialMatches.map((m) => m.name).join(', ')}.`,
      candidates: partialMatches.map((m) => m.name),
    };
  }

  return {
    error: `${label} "${trimmed}" not found. Available ${label}s: ${items.map((i) => i.name).join(', ')}.`,
    candidates: items.map((i) => i.name),
  };
}

const logTransactionArgsSchema = z.object({
  type: z.enum(['EXPENSE', 'INCOME', 'TRANSFER']),
  amount: z.number().finite().positive(),
  account: z.string().trim().min(1),
  toAccount: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  merchant: z.string().trim().max(80).optional(),
  note: z.string().trim().max(280).optional(),
  occurredAt: z.string().trim().optional(),
  idempotencyKey: z.string().trim().min(1).max(120).optional(),
});

const listRecentArgsSchema = z.object({
  limit: z.number().int().min(1).max(50).default(10),
  type: z.enum(['EXPENSE', 'INCOME', 'TRANSFER']).optional(),
  account: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional(),
});

const deleteTransactionArgsSchema = z.object({
  transactionId: z.string().trim().min(1).max(120),
});

const payObligationArgsSchema = z.object({
  obligation: z.string().trim().min(1),
  amount: z.number().finite().positive().optional(),
  account: z.string().trim().min(1).optional(),
  paidAt: z.string().trim().optional(),
});

const unpayObligationArgsSchema = z.object({
  obligation: z.string().trim().min(1),
});

async function requireUserState(syncRepo: SyncRepository, userId: string) {
  const pulled = await syncRepo.pullState(userId);
  if (!pulled) {
    throw new AppError('UNAUTHORIZED', 'Account not found.');
  }
  return pulled;
}

function summarizeAccount(account: Account) {
  return {
    id: account.id,
    name: account.name,
    accountType: account.accountType,
    currency: account.currency,
    balanceMinor: account.balanceMinor,
    balanceFormatted: formatMinorUnits(account.balanceMinor, account.currency),
  };
}

function summarizeCategory(cat: Category) {
  return {
    id: cat.id,
    name: cat.name,
    type: cat.type,
  };
}

function summarizeCommitment(c: RecurringCommitment, now: Date) {
  const status = getCommitmentDueStatus(c, now);
  return {
    id: c.id,
    name: c.name,
    kind: c.kind,
    amountMinor: c.amountMinor,
    amountFormatted: formatMinorUnits(c.amountMinor, c.currency),
    currency: c.currency,
    accountId: c.accountId,
    dueDay: c.dueDay,
    nextDueDate: c.nextDueDate ?? null,
    paidInstallments: c.paidInstallments,
    totalInstallments: c.totalInstallments ?? null,
    lastPaidPeriod: c.lastPaidPeriod ?? null,
    isPaidThisMonth: status.isPaid,
    isPaidOff: status.isPaidOff,
    dueState: status.state,
    isActive: c.isActive,
  };
}

export async function executeMcpTool(
  toolName: string,
  rawArgs: unknown,
  deps: McpToolDependencies,
): Promise<McpToolCallResult> {
  const args = rawArgs ?? {};

  switch (toolName) {
    case 'get_budget_context': {
      const { revision, state } = await requireUserState(deps.syncRepo, deps.userId);
      const now = new Date();
      const nextPaydayDate = getNextPaydayHorizonDate({
        sources: state.incomeSources,
        transactions: state.transactions,
        fromDate: now,
      });
      const safeToSpend = computeSafeToSpend({
        accounts: state.accounts,
        commitments: state.recurringCommitments,
        transactions: state.transactions,
        nextPaydayDate,
        currentDate: now,
      });
      const currency = state.accounts[0]?.currency ?? 'PHP';

      return toolSuccess({
        revision,
        currency,
        accounts: state.accounts.map(summarizeAccount),
        categories: {
          expense: state.categories
            .filter((c) => c.type === 'EXPENSE')
            .map(summarizeCategory),
          income: state.categories
            .filter((c) => c.type === 'INCOME')
            .map(summarizeCategory),
        },
        obligations: state.recurringCommitments.map((c) =>
          summarizeCommitment(c, now),
        ),
        safeToSpend: {
          ...safeToSpend,
          totalLiquidBalanceFormatted: formatMinorUnits(
            safeToSpend.totalLiquidBalanceMinor,
            currency,
          ),
          dueBeforeNextPaydayFormatted: formatMinorUnits(
            safeToSpend.dueBeforeNextPaydayMinor,
            currency,
          ),
          safeToSpendFormatted: formatMinorUnits(
            safeToSpend.safeToSpendMinor,
            currency,
          ),
        },
      });
    }

    case 'log_transaction': {
      const parsed = logTransactionArgsSchema.safeParse(args);
      if (!parsed.success) {
        return toolError(
          parsed.error.issues[0]?.message ?? 'Invalid transaction arguments.',
        );
      }

      const input = parsed.data;
      const amountMinor = decimalAmountToMinorUnits(input.amount);
      if (amountMinor === null) {
        return toolError(
          'Invalid amount: must be greater than 0 with at most 2 decimal places.',
        );
      }

      const resolvedDate = resolveDateInput(input.occurredAt);
      if (!resolvedDate) {
        return toolError(
          'Invalid occurredAt date. Use ISO-8601 or YYYY-MM-DD format.',
        );
      }

      const { state } = await requireUserState(deps.syncRepo, deps.userId);
      const sourceMatch = resolveNamedItem(state.accounts, input.account, 'account');
      if ('error' in sourceMatch) {
        return toolError(sourceMatch.error, { availableAccounts: sourceMatch.candidates });
      }
      const sourceAccount = sourceMatch.item;

      let toAccount: Account | undefined;
      let categoryId: string | undefined;

      if (input.type === 'TRANSFER') {
        if (!input.toAccount) {
          return toolError('toAccount is required when type is TRANSFER.');
        }
        const destMatch = resolveNamedItem(
          state.accounts,
          input.toAccount,
          'destination account',
        );
        if ('error' in destMatch) {
          return toolError(destMatch.error, {
            availableAccounts: destMatch.candidates,
          });
        }
        toAccount = destMatch.item;
        if (toAccount.id === sourceAccount.id) {
          return toolError(
            'Destination account must be different from source account.',
          );
        }
        if (toAccount.currency !== sourceAccount.currency) {
          return toolError(
            `Account currency mismatch (${sourceAccount.currency} vs ${toAccount.currency}).`,
          );
        }
      } else {
        const eligibleCategories = state.categories.filter(
          (c) => c.type === input.type,
        );
        if (!input.category) {
          return toolError(
            `Category is required for ${input.type}. Available categories: ${eligibleCategories.map((c) => c.name).join(', ')}.`,
            { availableCategories: eligibleCategories.map((c) => c.name) },
          );
        }
        const catMatch = resolveNamedItem(
          eligibleCategories,
          input.category,
          `${input.type.toLowerCase()} category`,
        );
        if ('error' in catMatch) {
          return toolError(catMatch.error, {
            availableCategories: catMatch.candidates,
          });
        }
        categoryId = catMatch.item.id;
      }

      const deterministicId = input.idempotencyKey
        ? `tx-mcp-${createHash('sha256')
            .update(`${deps.userId}:${input.idempotencyKey}`)
            .digest('hex')
            .slice(0, 24)}`
        : `tx-${randomUUID()}`;

      if (input.idempotencyKey) {
        const existing = await deps.transactionsRepo.getTransactionById(
          deps.userId,
          deterministicId,
        );
        if (existing) {
          return toolSuccess({
            deduplicated: true,
            revision: existing.revision,
            transaction: existing.transaction,
            summary: `Already logged ${existing.transaction.type.toLowerCase()} of ${formatMinorUnits(existing.transaction.amountMinor, existing.transaction.currency)} on ${sourceAccount.name}.`,
          });
        }
      }

      const tx = transactionSchema.parse({
        id: deterministicId,
        type: input.type,
        amountMinor,
        currency: sourceAccount.currency,
        accountId: sourceAccount.id,
        ...(toAccount ? { toAccountId: toAccount.id } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(input.merchant ? { merchant: input.merchant } : {}),
        ...(input.note ? { note: input.note } : {}),
        occurredAt: resolvedDate.iso,
        createdAt: new Date().toISOString(),
      });

      const created = await deps.transactionsRepo.createTransaction(deps.userId, tx);
      return toolSuccess({
        deduplicated: false,
        revision: created.revision,
        transaction: created.transaction,
        summary:
          input.type === 'TRANSFER' && toAccount
            ? `Logged transfer of ${formatMinorUnits(amountMinor, sourceAccount.currency)} from ${sourceAccount.name} to ${toAccount.name}.`
            : `Logged ${input.type.toLowerCase()} of ${formatMinorUnits(amountMinor, sourceAccount.currency)} on ${sourceAccount.name}${input.merchant ? ` (${input.merchant})` : ''}.`,
      });
    }

    case 'list_recent_transactions': {
      const parsed = listRecentArgsSchema.safeParse(args);
      if (!parsed.success) {
        return toolError(
          parsed.error.issues[0]?.message ?? 'Invalid list_recent_transactions arguments.',
        );
      }

      const input = parsed.data;
      const { state } = await requireUserState(deps.syncRepo, deps.userId);
      const accountById = new Map(state.accounts.map((a) => [a.id, a]));
      const categoryById = new Map(state.categories.map((c) => [c.id, c]));

      let filterAccountId: string | undefined;
      if (input.account) {
        const accMatch = resolveNamedItem(state.accounts, input.account, 'account');
        if ('error' in accMatch) {
          return toolError(accMatch.error, { availableAccounts: accMatch.candidates });
        }
        filterAccountId = accMatch.item.id;
      }

      const fetchLimit = input.search ? 200 : input.limit;
      const listed = await deps.transactionsRepo.listTransactions(deps.userId, {
        limit: fetchLimit,
        offset: 0,
        ...(input.type ? { type: input.type } : {}),
        ...(filterAccountId ? { accountId: filterAccountId } : {}),
      });

      const enriched = listed.transactions.map((tx) => {
        const accountName = accountById.get(tx.accountId)?.name ?? tx.accountId;
        const toAccountName = tx.toAccountId
          ? (accountById.get(tx.toAccountId)?.name ?? tx.toAccountId)
          : undefined;
        const categoryName = tx.categoryId
          ? (categoryById.get(tx.categoryId)?.name ?? tx.categoryId)
          : undefined;
        return {
          ...tx,
          amountFormatted: formatMinorUnits(tx.amountMinor, tx.currency),
          accountName,
          ...(toAccountName ? { toAccountName } : {}),
          ...(categoryName ? { categoryName } : {}),
        };
      });

      const searchLower = input.search?.toLowerCase();
      const filtered = searchLower
        ? enriched.filter((tx) =>
            [
              tx.merchant,
              tx.note,
              tx.accountName,
              tx.toAccountName,
              tx.categoryName,
            ]
              .filter(Boolean)
              .some((field) => field!.toLowerCase().includes(searchLower)),
          )
        : enriched;

      const sliced = filtered.slice(0, input.limit);
      return toolSuccess({
        revision: listed.revision,
        count: sliced.length,
        totalMatching: input.search ? filtered.length : listed.total,
        transactions: sliced,
      });
    }

    case 'delete_transaction': {
      const parsed = deleteTransactionArgsSchema.safeParse(args);
      if (!parsed.success) {
        return toolError(
          parsed.error.issues[0]?.message ?? 'transactionId is required.',
        );
      }

      const deleted = await deps.transactionsRepo.deleteTransactionById(
        deps.userId,
        parsed.data.transactionId,
      );
      if (!deleted) {
        return toolError(
          `Transaction "${parsed.data.transactionId}" not found.`,
        );
      }
      return toolSuccess({
        deletedTransactionId: deleted.deletedTransactionId,
        revision: deleted.revision,
        summary: `Deleted transaction ${deleted.deletedTransactionId} and reverted account balances.`,
      });
    }

    case 'pay_obligation': {
      const parsed = payObligationArgsSchema.safeParse(args);
      if (!parsed.success) {
        return toolError(
          parsed.error.issues[0]?.message ?? 'Invalid pay_obligation arguments.',
        );
      }

      const input = parsed.data;
      const resolvedDate = resolveDateInput(input.paidAt);
      if (!resolvedDate) {
        return toolError(
          'Invalid paidAt date. Use ISO-8601 or YYYY-MM-DD format.',
        );
      }

      let actualAmountMinor: number | undefined;
      if (input.amount !== undefined) {
        const converted = decimalAmountToMinorUnits(input.amount);
        if (converted === null) {
          return toolError(
            'Invalid amount: must be greater than 0 with at most 2 decimal places.',
          );
        }
        actualAmountMinor = converted;
      }

      const pulled = await requireUserState(deps.syncRepo, deps.userId);
      const match = resolveNamedItem(
        pulled.state.recurringCommitments,
        input.obligation,
        'obligation',
      );
      if ('error' in match) {
        return toolError(match.error, { availableObligations: match.candidates });
      }
      const commitment = match.item;

      if (isCommitmentPaidOff(commitment)) {
        return toolError(`"${commitment.name}" is already paid off.`);
      }
      if (commitment.lastPaidPeriod === resolvedDate.periodMonth) {
        return toolError(
          `"${commitment.name}" is already marked paid for ${resolvedDate.periodMonth}.`,
        );
      }

      let accountId: string | undefined;
      if (input.account) {
        const accMatch = resolveNamedItem(
          pulled.state.accounts,
          input.account,
          'account',
        );
        if ('error' in accMatch) {
          return toolError(accMatch.error, { availableAccounts: accMatch.candidates });
        }
        if (accMatch.item.currency !== commitment.currency) {
          return toolError(
            `Account currency (${accMatch.item.currency}) must match obligation currency (${commitment.currency}).`,
          );
        }
        accountId = accMatch.item.id;
      }

      const transactionId = `tx-${randomUUID()}`;
      const pushed = await deps.syncRepo.pushMutations({
        userId: deps.userId,
        lastKnownRevision: pulled.revision,
        mutations: [
          {
            opId: `op-mcp-${randomUUID()}`,
            clientTimestamp: new Date().toISOString(),
            type: 'commitment.pay',
            commitmentId: commitment.id,
            transactionId,
            paidAtIso: resolvedDate.iso,
            periodMonth: resolvedDate.periodMonth,
            ...(accountId ? { accountId } : {}),
            ...(actualAmountMinor !== undefined ? { actualAmountMinor } : {}),
          },
        ],
      });

      const updated = pushed.state.recurringCommitments.find(
        (c) => c.id === commitment.id,
      );
      const createdTx = pushed.state.transactions.find(
        (t) => t.id === transactionId,
      );
      const paidMinor = actualAmountMinor ?? commitment.amountMinor;

      return toolSuccess({
        revision: pushed.revision,
        obligation: updated ? summarizeCommitment(updated, new Date()) : null,
        transaction: createdTx ?? null,
        summary: `Marked ${commitment.name} as paid for ${resolvedDate.periodMonth} (${formatMinorUnits(paidMinor, commitment.currency)}).`,
      });
    }

    case 'unpay_obligation': {
      const parsed = unpayObligationArgsSchema.safeParse(args);
      if (!parsed.success) {
        return toolError(
          parsed.error.issues[0]?.message ?? 'obligation is required.',
        );
      }

      const pulled = await requireUserState(deps.syncRepo, deps.userId);
      const match = resolveNamedItem(
        pulled.state.recurringCommitments,
        parsed.data.obligation,
        'obligation',
      );
      if ('error' in match) {
        return toolError(match.error, { availableObligations: match.candidates });
      }
      const commitment = match.item;

      if (!commitment.lastPaidPeriod && !commitment.lastPaidTransactionId) {
        return toolError(`"${commitment.name}" does not have a recent payment to undo.`);
      }

      const pushed = await deps.syncRepo.pushMutations({
        userId: deps.userId,
        lastKnownRevision: pulled.revision,
        mutations: [
          {
            opId: `op-mcp-${randomUUID()}`,
            clientTimestamp: new Date().toISOString(),
            type: 'commitment.unpay',
            commitmentId: commitment.id,
          },
        ],
      });

      const updated = pushed.state.recurringCommitments.find(
        (c) => c.id === commitment.id,
      );
      return toolSuccess({
        revision: pushed.revision,
        obligation: updated ? summarizeCommitment(updated, new Date()) : null,
        summary: `Marked ${commitment.name} as unpaid.`,
      });
    }

    default:
      return toolError(`Unknown tool "${toolName}".`);
  }
}
