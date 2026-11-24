import { describe, expect, it } from 'vitest';
import {
  applySyncMutations,
  createInitialSyncDataState,
  DEFAULT_CURRENCY,
  formatAccountLinkedErrorMessage,
  getAccountLinkedRecords,
  syncPushRequestSchema,
  type SyncMutation,
} from '../index';

describe('Sync State Reducer', () => {
  it('replays concurrent Web and offline Phone expenses onto account-bank without balance drift', () => {
    const base = createInitialSyncDataState(new Date('2026-11-10T12:00:00.000Z'));
    const initialBankBalance = base.accounts.find((a) => a.id === 'account-bank')!.balanceMinor;

    const webExpense: SyncMutation = {
      opId: 'op-web-1',
      clientTimestamp: '2026-11-10T12:01:00.000Z',
      type: 'transaction.create',
      transaction: {
        id: 'tx-web-1',
        type: 'EXPENSE',
        amountMinor: 15000,
        currency: DEFAULT_CURRENCY,
        accountId: 'account-bank',
        categoryId: 'cat-daily-living',
        merchant: 'Web Groceries',
        tags: ['food'],
        occurredAt: '2026-11-10T12:01:00.000Z',
        createdAt: '2026-11-10T12:01:00.000Z',
      },
    };

    const offlinePhoneExpense: SyncMutation = {
      opId: 'op-phone-1',
      clientTimestamp: '2026-11-10T12:02:00.000Z',
      type: 'transaction.create',
      transaction: {
        id: 'tx-phone-1',
        type: 'EXPENSE',
        amountMinor: 7500,
        currency: DEFAULT_CURRENCY,
        accountId: 'account-bank',
        categoryId: 'cat-transportation',
        merchant: 'Grab',
        tags: ['commute'],
        occurredAt: '2026-11-10T12:02:00.000Z',
        createdAt: '2026-11-10T12:02:00.000Z',
      },
    };

    const next = applySyncMutations(base, [webExpense, offlinePhoneExpense]);
    const finalBankBalance = next.accounts.find((a) => a.id === 'account-bank')!.balanceMinor;

    expect(finalBankBalance).toBe(initialBankBalance - 15000 - 7500);
    expect(next.transactions.map((t) => t.id)).toContain('tx-web-1');
    expect(next.transactions.map((t) => t.id)).toContain('tx-phone-1');
  });

  it('remains idempotent when replaying duplicate transaction ids', () => {
    const base = createInitialSyncDataState(new Date('2026-11-10T12:00:00.000Z'));
    const initialBankBalance = base.accounts.find((a) => a.id === 'account-bank')!.balanceMinor;

    const mutation: SyncMutation = {
      opId: 'op-dup-1',
      clientTimestamp: '2026-11-10T12:01:00.000Z',
      type: 'transaction.create',
      transaction: {
        id: 'tx-dup-1',
        type: 'EXPENSE',
        amountMinor: 5000,
        currency: DEFAULT_CURRENCY,
        accountId: 'account-bank',
        categoryId: 'cat-daily-living',
        tags: [],
        occurredAt: '2026-11-10T12:01:00.000Z',
        createdAt: '2026-11-10T12:01:00.000Z',
      },
    };

    const next = applySyncMutations(base, [mutation, mutation]);
    expect(next.accounts.find((a) => a.id === 'account-bank')!.balanceMinor).toBe(
      initialBankBalance - 5000,
    );
    expect(next.transactions.filter((t) => t.id === 'tx-dup-1')).toHaveLength(1);
  });

  it('handles transfers, updates, and deletes accurately in minor units', () => {
    const base = createInitialSyncDataState(new Date('2026-11-10T12:00:00.000Z'));
    const bank0 = base.accounts.find((a) => a.id === 'account-bank')!.balanceMinor;
    const savings0 = base.accounts.find((a) => a.id === 'account-savings')!.balanceMinor;

    const transferred = applySyncMutations(base, [
      {
        opId: 'op-tr-1',
        clientTimestamp: '2026-11-10T12:05:00.000Z',
        type: 'transaction.create',
        transaction: {
          id: 'tx-tr-1',
          type: 'TRANSFER',
          amountMinor: 10000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          toAccountId: 'account-savings',
          tags: ['savings'],
          occurredAt: '2026-11-10T12:05:00.000Z',
          createdAt: '2026-11-10T12:05:00.000Z',
        },
      },
      {
        opId: 'op-tr-2',
        clientTimestamp: '2026-11-10T12:06:00.000Z',
        type: 'transaction.update',
        input: {
          id: 'tx-tr-1',
          type: 'TRANSFER',
          amountMinor: 25000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          toAccountId: 'account-savings',
          tags: ['savings'],
          occurredAt: '2026-11-10T12:05:00.000Z',
        },
      },
    ]);

    expect(transferred.accounts.find((a) => a.id === 'account-bank')!.balanceMinor).toBe(
      bank0 - 25000,
    );
    expect(transferred.accounts.find((a) => a.id === 'account-savings')!.balanceMinor).toBe(
      savings0 + 25000,
    );

    const deleted = applySyncMutations(transferred, [
      {
        opId: 'op-tr-3',
        clientTimestamp: '2026-11-10T12:07:00.000Z',
        type: 'transaction.delete',
        id: 'tx-tr-1',
      },
    ]);

    expect(deleted.accounts.find((a) => a.id === 'account-bank')!.balanceMinor).toBe(bank0);
    expect(deleted.accounts.find((a) => a.id === 'account-savings')!.balanceMinor).toBe(
      savings0,
    );
  });

  it('handles commitment pay/unpay, sinking fund contribution, and reconciliation', () => {
    const base = createInitialSyncDataState(new Date('2026-11-10T12:00:00.000Z'));
    const bank0 = base.accounts.find((a) => a.id === 'account-bank')!.balanceMinor;

    const afterPay = applySyncMutations(base, [
      {
        opId: 'op-inst-upsert',
        clientTimestamp: '2026-11-10T12:10:00.000Z',
        type: 'commitment.upsert',
        commitment: {
          id: 'inst-1',
          name: 'Phone Installment',
          kind: 'INSTALLMENT',
          amountMinor: 10000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          categoryId: 'cat-loans',
          frequency: 'MONTHLY',
          dueDay: 15,
          nextDueDate: '2026-11-15',
          isAutoPaid: false,
          isActive: true,
          totalInstallments: 2,
          paidInstallments: 0,
        },
      },
      {
        opId: 'op-inst-pay',
        clientTimestamp: '2026-11-10T12:11:00.000Z',
        type: 'commitment.pay',
        commitmentId: 'inst-1',
        transactionId: 'tx-inst-1',
        paidAtIso: '2026-11-10T12:11:00.000Z',
      },
    ]);

    const paidInst = afterPay.recurringCommitments.find((c) => c.id === 'inst-1')!;
    expect(paidInst.paidInstallments).toBe(1);
    expect(paidInst.nextDueDate).toBe('2026-12-15');
    expect(paidInst.previousNextDueDate).toBe('2026-11-15');
    expect(afterPay.accounts.find((a) => a.id === 'account-bank')!.balanceMinor).toBe(
      bank0 - 10000,
    );

    const afterUnpay = applySyncMutations(afterPay, [
      {
        opId: 'op-inst-unpay',
        clientTimestamp: '2026-11-10T12:12:00.000Z',
        type: 'commitment.unpay',
        commitmentId: 'inst-1',
      },
    ]);
    const unpaidInst = afterUnpay.recurringCommitments.find((c) => c.id === 'inst-1')!;
    expect(unpaidInst.paidInstallments).toBe(0);
    expect(unpaidInst.nextDueDate).toBe('2026-11-15');
    expect(afterUnpay.accounts.find((a) => a.id === 'account-bank')!.balanceMinor).toBe(bank0);

    const afterFundAndRec = applySyncMutations(afterUnpay, [
      {
        opId: 'op-sf-upsert',
        clientTimestamp: '2026-11-10T12:12:30.000Z',
        type: 'sinkingFund.upsert',
        fund: {
          id: 'fund-car-insurance',
          name: 'Car Insurance',
          icon: '🚗',
          color: '#3B82F6',
          targetAmountMinor: 60000,
          currentSavedMinor: 20000,
          targetDate: '2026-12-31',
          accountId: 'account-savings',
          monthlyContributionMinor: 10000,
          isCompleted: false,
        },
      },
      {
        opId: 'op-sf-1',
        clientTimestamp: '2026-11-10T12:13:00.000Z',
        type: 'sinkingFund.contribute',
        fundId: 'fund-car-insurance',
        transactionId: 'tx-sf-1',
        amountMinor: 5000,
        sourceAccountId: 'account-bank',
        occurredAt: '2026-11-10T12:13:00.000Z',
      },
      {
        opId: 'op-rec-1',
        clientTimestamp: '2026-11-10T12:14:00.000Z',
        type: 'reconciliation.apply',
        reconciliationId: 'rec-1',
        accountId: 'account-cash',
        actualBalanceMinor: 20000,
        createAdjustment: true,
        adjustmentTransactionId: 'tx-rec-adj-1',
        reconciledAt: '2026-11-10T12:14:00.000Z',
      },
    ]);

    expect(
      afterFundAndRec.sinkingFunds.find((f) => f.id === 'fund-car-insurance')!.currentSavedMinor,
    ).toBe(25000);
    expect(afterFundAndRec.accounts.find((a) => a.id === 'account-cash')!.balanceMinor).toBe(
      20000,
    );
    expect(afterFundAndRec.reconciliations).toHaveLength(1);
  });

  it('supports backup overwrite and merge without losing reconciliations', () => {
    const base = createInitialSyncDataState(new Date('2026-11-10T12:00:00.000Z'));
    const customAccount = {
      id: 'account-gcash',
      name: 'GCash',
      accountType: 'E_WALLET' as const,
      icon: '📱',
      color: '#208AEF',
      currency: DEFAULT_CURRENCY,
      balanceMinor: 50000,
    };

    const merged = applySyncMutations(base, [
      {
        opId: 'op-backup-merge',
        clientTimestamp: '2026-11-10T12:20:00.000Z',
        type: 'backup.import',
        mode: 'merge',
        envelope: {
          version: 1,
          exportedAt: '2026-11-10T12:20:00.000Z',
          data: {
            accounts: [customAccount],
            categories: [],
            transactions: [],
            categoryBudgets: [],
            recurringCommitments: [],
            sinkingFunds: [],
            quickPresets: [],
          },
        },
      },
    ]);

    expect(merged.accounts.some((a) => a.id === 'account-gcash')).toBe(true);
    expect(merged.accounts.some((a) => a.id === 'account-bank')).toBe(true);

    const overwritten = applySyncMutations(merged, [
      {
        opId: 'op-backup-overwrite',
        clientTimestamp: '2026-11-10T12:21:00.000Z',
        type: 'backup.import',
        mode: 'overwrite',
        envelope: {
          version: 1,
          exportedAt: '2026-11-10T12:21:00.000Z',
          data: {
            accounts: [customAccount],
            categories: base.categories,
            transactions: [],
            categoryBudgets: [],
            recurringCommitments: [],
            sinkingFunds: [],
            quickPresets: [],
          },
        },
      },
    ]);

    expect(overwritten.accounts).toEqual([customAccount]);
    expect(overwritten.transactions).toEqual([]);
  });

  it('preserves concurrent balance when updating account metadata and guards unpay & long names', () => {
    const base = createInitialSyncDataState(new Date('2026-11-10T12:00:00.000Z'));
    const longName = 'A'.repeat(110);

    const updated = applySyncMutations(base, [
      {
        opId: 'op-expense-concurrent',
        clientTimestamp: '2026-11-10T12:01:00.000Z',
        type: 'transaction.create',
        transaction: {
          id: 'tx-concurrent',
          type: 'EXPENSE',
          amountMinor: 5000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          categoryId: 'cat-daily-living',
          tags: [],
          occurredAt: '2026-11-10T12:01:00.000Z',
          createdAt: '2026-11-10T12:01:00.000Z',
        },
      },
      {
        opId: 'op-meta-rename',
        clientTimestamp: '2026-11-10T12:02:00.000Z',
        type: 'account.updateMetadata',
        account: {
          id: 'account-bank',
          name: 'Primary Checking',
          accountType: 'BANK',
          icon: '🏦',
          color: '#208AEF',
          currency: DEFAULT_CURRENCY,
        },
      },
      {
        opId: 'op-long-fund',
        clientTimestamp: '2026-11-10T12:03:00.000Z',
        type: 'sinkingFund.upsert',
        fund: {
          id: 'fund-long',
          name: longName,
          icon: '🎯',
          color: '#3B82F6',
          targetAmountMinor: 100000,
          currentSavedMinor: 0,
          targetDate: '2026-12-31',
          accountId: 'account-savings',
          monthlyContributionMinor: 5000,
          isCompleted: false,
        },
      },
      {
        opId: 'op-long-fund-contrib',
        clientTimestamp: '2026-11-10T12:04:00.000Z',
        type: 'sinkingFund.contribute',
        fundId: 'fund-long',
        transactionId: 'tx-long-fund',
        amountMinor: 5000,
        sourceAccountId: 'account-bank',
        occurredAt: '2026-11-10T12:04:00.000Z',
      },
      {
        opId: 'op-unpay-noop',
        clientTimestamp: '2026-11-10T12:05:00.000Z',
        type: 'commitment.unpay',
        commitmentId: 'commitment-rent',
      },
    ]);

    const bank = updated.accounts.find((a) => a.id === 'account-bank')!;
    expect(bank.name).toBe('Primary Checking');
    expect(bank.balanceMinor).toBe(
      base.accounts.find((a) => a.id === 'account-bank')!.balanceMinor - 10000,
    );
    expect(updated.transactions.find((t) => t.id === 'tx-long-fund')!.merchant!.length).toBe(80);
  });

  it('preserves existing balance on account.upsert, rejects cross-currency or orphan txs, and caps sync push batches', () => {
    const base = createInitialSyncDataState(new Date('2026-11-10T12:00:00.000Z'));
    const seeded = applySyncMutations(base, [
      {
        opId: 'op-seed-income',
        clientTimestamp: '2026-11-10T12:00:30.000Z',
        type: 'transaction.create',
        transaction: {
          id: 'tx-seed-income',
          type: 'INCOME',
          amountMinor: 50000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          categoryId: 'cat-salary',
          tags: [],
          occurredAt: '2026-11-10T12:00:30.000Z',
          createdAt: '2026-11-10T12:00:30.000Z',
        },
      },
    ]);

    const afterUpsertAndBadTxs = applySyncMutations(seeded, [
      {
        opId: 'op-upsert-existing',
        clientTimestamp: '2026-11-10T12:01:00.000Z',
        type: 'account.upsert',
        account: {
          ...seeded.accounts.find((a) => a.id === 'account-bank')!,
          name: 'Renamed Bank',
          balanceMinor: 9999999,
        },
      },
      {
        opId: 'op-bad-currency',
        clientTimestamp: '2026-11-10T12:02:00.000Z',
        type: 'transaction.create',
        transaction: {
          id: 'tx-bad-usd',
          type: 'EXPENSE',
          amountMinor: 10000,
          currency: 'USD',
          accountId: 'account-bank',
          categoryId: 'cat-daily-living',
          tags: [],
          occurredAt: '2026-11-10T12:02:00.000Z',
          createdAt: '2026-11-10T12:02:00.000Z',
        },
      },
      {
        opId: 'op-orphan-acc',
        clientTimestamp: '2026-11-10T12:03:00.000Z',
        type: 'transaction.create',
        transaction: {
          id: 'tx-orphan',
          type: 'EXPENSE',
          amountMinor: 1000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-does-not-exist',
          categoryId: 'cat-daily-living',
          tags: [],
          occurredAt: '2026-11-10T12:03:00.000Z',
          createdAt: '2026-11-10T12:03:00.000Z',
        },
      },
    ]);

    const bank = afterUpsertAndBadTxs.accounts.find((a) => a.id === 'account-bank')!;
    expect(bank.name).toBe('Renamed Bank');
    expect(bank.balanceMinor).toBe(50000);
    expect(afterUpsertAndBadTxs.transactions.some((t) => t.id === 'tx-bad-usd')).toBe(false);
    expect(afterUpsertAndBadTxs.transactions.some((t) => t.id === 'tx-orphan')).toBe(false);

    const oversizedPush = syncPushRequestSchema.safeParse({
      lastKnownRevision: 1,
      mutations: [1, 2, 3].map((i) => ({
        opId: `op-imp-${i}`,
        clientTimestamp: '2026-11-10T12:04:00.000Z',
        type: 'backup.import',
        mode: 'merge',
        envelope: {
          version: 1,
          exportedAt: '2026-11-10T12:04:00.000Z',
          data: {
            accounts: [],
            categories: [],
            transactions: [],
            categoryBudgets: [],
            recurringCommitments: [],
            sinkingFunds: [],
            quickPresets: [],
          },
        },
      })),
    });
    expect(oversizedPush.success).toBe(false);
  });

  it('detects linked account records across outgoing, incoming transfers, reconciliations, recurring bills, and sinking funds', () => {
    const base = createInitialSyncDataState(new Date('2026-11-10T12:00:00.000Z'));

    const state = applySyncMutations(base, [
      {
        opId: 'op-link-exp',
        clientTimestamp: '2026-11-10T12:01:00.000Z',
        type: 'transaction.create',
        transaction: {
          id: 'tx-link-exp',
          type: 'EXPENSE',
          amountMinor: 1000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          categoryId: 'cat-daily-living',
          tags: [],
          occurredAt: '2026-11-10T12:01:00.000Z',
          createdAt: '2026-11-10T12:01:00.000Z',
        },
      },
      {
        opId: 'op-link-tr',
        clientTimestamp: '2026-11-10T12:02:00.000Z',
        type: 'transaction.create',
        transaction: {
          id: 'tx-link-tr',
          type: 'TRANSFER',
          amountMinor: 2000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          toAccountId: 'account-savings',
          tags: [],
          occurredAt: '2026-11-10T12:02:00.000Z',
          createdAt: '2026-11-10T12:02:00.000Z',
        },
      },
      {
        opId: 'op-link-rec',
        clientTimestamp: '2026-11-10T12:03:00.000Z',
        type: 'reconciliation.apply',
        reconciliationId: 'rec-link-1',
        accountId: 'account-cash',
        actualBalanceMinor: 5000,
        createAdjustment: true,
        adjustmentTransactionId: 'tx-link-rec-adj',
        reconciledAt: '2026-11-10T12:03:00.000Z',
      },
      {
        opId: 'op-link-rc',
        clientTimestamp: '2026-11-10T12:04:00.000Z',
        type: 'commitment.upsert',
        commitment: {
          id: 'rc-link-1',
          name: 'Internet Bill',
          kind: 'RECURRING',
          amountMinor: 15000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          categoryId: 'cat-utilities',
          frequency: 'MONTHLY',
          dueDay: 20,
          nextDueDate: '2026-11-20',
          isAutoPaid: false,
          isActive: true,
          paidInstallments: 0,
        },
      },
      {
        opId: 'op-link-sf',
        clientTimestamp: '2026-11-10T12:05:00.000Z',
        type: 'sinkingFund.upsert',
        fund: {
          id: 'sf-link-1',
          name: 'Emergency Reserve',
          icon: '🛡️',
          color: '#10B981',
          targetAmountMinor: 100000,
          currentSavedMinor: 0,
          targetDate: '2027-01-01',
          accountId: 'account-savings',
          monthlyContributionMinor: 5000,
          isCompleted: false,
        },
      },
    ]);

    const bankSummary = getAccountLinkedRecords(state, 'account-bank');
    expect(bankSummary.isLinked).toBe(true);
    expect(bankSummary.transactions.map((t) => t.id)).toEqual(['tx-link-tr', 'tx-link-exp']);
    expect(bankSummary.expenseCount).toBe(1);
    expect(bankSummary.incomeCount).toBe(0);
    expect(bankSummary.transferCount).toBe(1);
    expect(bankSummary.recurringCommitments.map((rc) => rc.id)).toEqual(['rc-link-1']);
    expect(bankSummary.sinkingFunds).toEqual([]);
    expect(bankSummary.totalCount).toBe(3);

    const savingsSummary = getAccountLinkedRecords(state, 'account-savings');
    expect(savingsSummary.isLinked).toBe(true);
    expect(savingsSummary.transactions.map((t) => t.id)).toEqual(['tx-link-tr']);
    expect(savingsSummary.transferCount).toBe(1);
    expect(savingsSummary.sinkingFunds.map((sf) => sf.id)).toEqual(['sf-link-1']);
    expect(savingsSummary.totalCount).toBe(2);

    const cashSummary = getAccountLinkedRecords(state, 'account-cash');
    expect(cashSummary.isLinked).toBe(true);
    expect(cashSummary.transactions.map((t) => t.id)).toEqual(['tx-link-rec-adj']);
    expect(cashSummary.incomeCount).toBe(1);
    expect(cashSummary.totalCount).toBe(1);
  });

  it('formats account linked error messages with only non-zero categories, accurate counts, and truncated names', () => {
    const base = createInitialSyncDataState(new Date('2026-11-10T12:00:00.000Z'));

    const unlinkedSummary = getAccountLinkedRecords(base, 'account-bank');
    expect(formatAccountLinkedErrorMessage(unlinkedSummary)).toBe(
      'Account has no linked records.',
    );

    const oneCategoryState = applySyncMutations(base, [
      {
        opId: 'op-fmt-tx-1',
        clientTimestamp: '2026-11-10T12:01:00.000Z',
        type: 'transaction.create',
        transaction: {
          id: 'tx-fmt-1',
          type: 'INCOME',
          amountMinor: 5000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          categoryId: 'cat-salary',
          tags: [],
          occurredAt: '2026-11-10T12:01:00.000Z',
          createdAt: '2026-11-10T12:01:00.000Z',
        },
      },
    ]);
    expect(
      formatAccountLinkedErrorMessage(getAccountLinkedRecords(oneCategoryState, 'account-bank')),
    ).toBe('Cannot delete this account: linked to 1 transaction (1 income).');

    const twoCategoriesState = applySyncMutations(oneCategoryState, [
      {
        opId: 'op-fmt-tx-2',
        clientTimestamp: '2026-11-10T12:02:00.000Z',
        type: 'transaction.create',
        transaction: {
          id: 'tx-fmt-2',
          type: 'EXPENSE',
          amountMinor: 1000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          categoryId: 'cat-daily-living',
          tags: [],
          occurredAt: '2026-11-10T12:02:00.000Z',
          createdAt: '2026-11-10T12:02:00.000Z',
        },
      },
      {
        opId: 'op-fmt-tx-3',
        clientTimestamp: '2026-11-10T12:03:00.000Z',
        type: 'transaction.create',
        transaction: {
          id: 'tx-fmt-3',
          type: 'EXPENSE',
          amountMinor: 2000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          categoryId: 'cat-daily-living',
          tags: [],
          occurredAt: '2026-11-10T12:03:00.000Z',
          createdAt: '2026-11-10T12:03:00.000Z',
        },
      },
      {
        opId: 'op-fmt-rc-1',
        clientTimestamp: '2026-11-10T12:04:00.000Z',
        type: 'commitment.upsert',
        commitment: {
          id: 'rc-fmt-1',
          name: 'Rent',
          kind: 'RECURRING',
          amountMinor: 20000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          categoryId: 'cat-home',
          frequency: 'MONTHLY',
          dueDay: 1,
          nextDueDate: '2026-12-01',
          isAutoPaid: false,
          isActive: true,
          paidInstallments: 0,
        },
      },
      {
        opId: 'op-fmt-rc-2',
        clientTimestamp: '2026-11-10T12:05:00.000Z',
        type: 'commitment.upsert',
        commitment: {
          id: 'rc-fmt-2',
          name: 'Fiber',
          kind: 'RECURRING',
          amountMinor: 5000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          categoryId: 'cat-utilities',
          frequency: 'MONTHLY',
          dueDay: 5,
          nextDueDate: '2026-12-05',
          isAutoPaid: false,
          isActive: true,
          paidInstallments: 0,
        },
      },
      {
        opId: 'op-fmt-rc-3',
        clientTimestamp: '2026-11-10T12:06:00.000Z',
        type: 'commitment.upsert',
        commitment: {
          id: 'rc-fmt-3',
          name: 'Water',
          kind: 'RECURRING',
          amountMinor: 1500,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          categoryId: 'cat-utilities',
          frequency: 'MONTHLY',
          dueDay: 10,
          nextDueDate: '2026-12-10',
          isAutoPaid: false,
          isActive: true,
          paidInstallments: 0,
        },
      },
    ]);
    expect(
      formatAccountLinkedErrorMessage(
        getAccountLinkedRecords(twoCategoriesState, 'account-bank'),
      ),
    ).toBe(
      'Cannot delete this account: linked to 3 transactions (2 expenses, 1 income) and 3 recurring bills (Rent, Fiber, ...).',
    );

    const threeCategoriesState = applySyncMutations(twoCategoriesState, [
      {
        opId: 'op-fmt-sf-1',
        clientTimestamp: '2026-11-10T12:07:00.000Z',
        type: 'sinkingFund.upsert',
        fund: {
          id: 'sf-fmt-1',
          name: 'Vacation',
          icon: '✈️',
          color: '#3B82F6',
          targetAmountMinor: 50000,
          currentSavedMinor: 0,
          targetDate: '2027-06-01',
          accountId: 'account-bank',
          monthlyContributionMinor: 5000,
          isCompleted: false,
        },
      },
    ]);
    expect(
      formatAccountLinkedErrorMessage(
        getAccountLinkedRecords(threeCategoriesState, 'account-bank'),
      ),
    ).toBe(
      'Cannot delete this account: linked to 3 transactions (2 expenses, 1 income), 3 recurring bills (Rent, Fiber, ...), 1 sinking fund (Vacation).',
    );
  });

  it('refuses account.delete when linked via incoming transfer toAccountId and succeeds after transaction.delete', () => {
    const base = createInitialSyncDataState(new Date('2026-11-10T12:00:00.000Z'));

    const withIncomingTransfer = applySyncMutations(base, [
      {
        opId: 'op-del-tr-create',
        clientTimestamp: '2026-11-10T12:01:00.000Z',
        type: 'transaction.create',
        transaction: {
          id: 'tx-del-tr',
          type: 'TRANSFER',
          amountMinor: 10000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          toAccountId: 'account-savings',
          tags: [],
          occurredAt: '2026-11-10T12:01:00.000Z',
          createdAt: '2026-11-10T12:01:00.000Z',
        },
      },
      {
        opId: 'op-del-acc-blocked',
        clientTimestamp: '2026-11-10T12:02:00.000Z',
        type: 'account.delete',
        id: 'account-savings',
      },
    ]);

    expect(withIncomingTransfer.accounts.some((a) => a.id === 'account-savings')).toBe(true);

    const afterTxDeleted = applySyncMutations(withIncomingTransfer, [
      {
        opId: 'op-del-tr-delete',
        clientTimestamp: '2026-11-10T12:03:00.000Z',
        type: 'transaction.delete',
        id: 'tx-del-tr',
      },
      {
        opId: 'op-del-acc-allowed',
        clientTimestamp: '2026-11-10T12:04:00.000Z',
        type: 'account.delete',
        id: 'account-savings',
      },
    ]);

    expect(afterTxDeleted.accounts.some((a) => a.id === 'account-savings')).toBe(false);
  });
});
