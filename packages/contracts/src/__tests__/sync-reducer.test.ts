import { describe, expect, it } from 'vitest';
import {
  applySyncMutations,
  createInitialSyncDataState,
  DEFAULT_CURRENCY,
  formatAccountLinkedErrorMessage,
  getAccountLinkedRecords,
  getCommitmentDueStatus,
  rewindNextDueDate,
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

  it('handles commitment pay/unpay and direct account.setBalance', () => {
    const base = createInitialSyncDataState(new Date('2026-11-10T12:00:00.000Z'));
    const bank0 = base.accounts.find((a) => a.id === 'account-bank')!.balanceMinor;

    const afterPay = applySyncMutations(base, [
      {
        opId: 'op-inst-upsert',
        clientTimestamp: '2026-11-10T12:10:00.000Z',
        type: 'commitment.upsert',
        commitment: {
          id: 'inst-1',
          name: 'Phone Loan',
          kind: 'LOAN',
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
      {
        opId: 'op-set-cash',
        clientTimestamp: '2026-11-10T12:14:00.000Z',
        type: 'account.setBalance',
        accountId: 'account-cash',
        balanceMinor: 20000,
      },
    ]);
    const unpaidInst = afterUnpay.recurringCommitments.find((c) => c.id === 'inst-1')!;
    expect(unpaidInst.paidInstallments).toBe(0);
    expect(unpaidInst.lastPaidPeriod).toBeUndefined();
    expect(unpaidInst.lastPaidTransactionId).toBeUndefined();
    expect(unpaidInst.nextDueDate).toBe('2026-11-15');
    expect(afterUnpay.transactions.some((t) => t.id === 'tx-inst-1')).toBe(false);
    expect(afterUnpay.accounts.find((a) => a.id === 'account-bank')!.balanceMinor).toBe(bank0);
    expect(afterUnpay.accounts.find((a) => a.id === 'account-cash')!.balanceMinor).toBe(20000);
  });

  it('rewinds nextDueDate on commitment.unpay when previousNextDueDate is absent and preserves final-payoff date', () => {
    const base = createInitialSyncDataState(new Date('2026-11-27T12:00:00.000Z'));

    const withCommitments = applySyncMutations(base, [
      {
        opId: 'op-imported-loan',
        clientTimestamp: '2026-11-27T12:00:00.000Z',
        type: 'commitment.upsert',
        commitment: {
          id: 'inst-imported',
          name: 'JBL Partybox',
          kind: 'LOAN',
          amountMinor: 250000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          categoryId: 'cat-loans',
          frequency: 'MONTHLY',
          dueDay: 25,
          nextDueDate: '2026-12-25',
          isAutoPaid: false,
          isActive: true,
          totalInstallments: 6,
          paidInstallments: 2,
          lastPaidPeriod: '2026-11',
        },
      },
      {
        opId: 'op-final-loan',
        clientTimestamp: '2026-11-27T12:00:01.000Z',
        type: 'commitment.upsert',
        commitment: {
          id: 'inst-final',
          name: 'Final Payoff Loan',
          kind: 'LOAN',
          amountMinor: 100000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          categoryId: 'cat-loans',
          frequency: 'MONTHLY',
          dueDay: 25,
          nextDueDate: '2026-11-25',
          isAutoPaid: false,
          isActive: false,
          totalInstallments: 3,
          paidInstallments: 3,
          lastPaidPeriod: '2026-11',
        },
      },
    ]);

    const afterUnpay = applySyncMutations(withCommitments, [
      {
        opId: 'op-unpay-imported',
        clientTimestamp: '2026-11-27T12:01:00.000Z',
        type: 'commitment.unpay',
        commitmentId: 'inst-imported',
      },
      {
        opId: 'op-unpay-final',
        clientTimestamp: '2026-11-27T12:01:01.000Z',
        type: 'commitment.unpay',
        commitmentId: 'inst-final',
      },
    ]);

    const unpaidImported = afterUnpay.recurringCommitments.find((c) => c.id === 'inst-imported')!;
    expect(unpaidImported.paidInstallments).toBe(1);
    expect(unpaidImported.lastPaidPeriod).toBeUndefined();
    expect(unpaidImported.nextDueDate).toBe('2026-11-25');

    const dueStatus = getCommitmentDueStatus(unpaidImported, new Date(2026, 10, 27, 12));
    expect(dueStatus.isPaid).toBe(false);
    expect(dueStatus.isDueThisMonth).toBe(true);
    expect(dueStatus.isOverdue).toBe(true);

    const unpaidFinal = afterUnpay.recurringCommitments.find((c) => c.id === 'inst-final')!;
    expect(unpaidFinal.isActive).toBe(true);
    expect(unpaidFinal.paidInstallments).toBe(2);
    expect(unpaidFinal.lastPaidPeriod).toBeUndefined();
    expect(unpaidFinal.nextDueDate).toBe('2026-11-25');

    expect(rewindNextDueDate('2026-03-31', 'MONTHLY', 31)).toBe('2026-02-28');
    expect(rewindNextDueDate('2026-02-28', 'MONTHLY', 31)).toBe('2026-01-31');
  });

  it('supports backup overwrite and merge', () => {
    const base = createInitialSyncDataState(new Date('2026-11-10T12:00:00.000Z'));
    const customAccount = {
      id: 'account-gcash',
      name: 'GCash',
      accountType: 'E_WALLET' as const,
      icon: '📱',
      color: '#1E6F4E',
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
            recurringCommitments: [],
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
            recurringCommitments: [],
          },
        },
      },
    ]);

    expect(overwritten.accounts).toEqual([customAccount]);
    expect(overwritten.transactions).toEqual([]);
  });

  it('preserves concurrent balance on metadata update and enforces account deletion guards', () => {
    const base = createInitialSyncDataState(new Date('2026-11-10T12:00:00.000Z'));

    const state = applySyncMutations(base, [
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
          color: '#1B4332',
          currency: DEFAULT_CURRENCY,
        },
      },
      {
        opId: 'op-del-blocked',
        clientTimestamp: '2026-11-10T12:03:00.000Z',
        type: 'account.delete',
        id: 'account-bank',
      },
    ]);

    const bank = state.accounts.find((a) => a.id === 'account-bank')!;
    expect(bank.name).toBe('Primary Checking');
    expect(bank.balanceMinor).toBe(-5000);
    expect(
      formatAccountLinkedErrorMessage(getAccountLinkedRecords(state, 'account-bank')),
    ).toContain('1 transaction (1 expense)');

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
            recurringCommitments: [],
          },
        },
      })),
    });
    expect(oversizedPush.success).toBe(false);
  });
});
