import { compareVersions } from '@/common/hooks/use-version-gate';
import * as tokenStorage from '@/common/lib/token-storage';
import {
  applyReconciliation,
  createTransaction,
  getSafeToSpendMetrics,
  getWallets,
  upsertQuickPreset,
} from '../transactions/api';

jest.mock('@/common/lib/token-storage', () => ({
  getAccessToken: jest.fn(),
  setAccessToken: jest.fn(),
  clearAccessToken: jest.fn(),
}));

const mockedGetAccessToken = tokenStorage.getAccessToken as jest.MockedFunction<
  typeof tokenStorage.getAccessToken
>;

describe('Universal App Testing — Mobile Contracts & Version Gate (TC-09)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    jest.resetAllMocks();
    mockedGetAccessToken.mockResolvedValue('valid-token');
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('compares semantic app versions accurately for VersionGate', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
    expect(compareVersions('1.2.0', '1.10.0')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.5', '1.5.0')).toBe(0);
  });

  it('validates transaction input via @repo/contracts before calling fetch', async () => {
    const mockFetch = jest.fn();
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await expect(
      createTransaction({
        type: 'TRANSFER',
        amountMinor: 10000,
        currency: 'PHP',
        walletId: 'w-1',
        toWalletId: 'w-1',
        tags: [],
        occurredAt: '2026-11-20T12:00:00.000Z',
      }),
    ).rejects.toThrow(/differ from source wallet/i);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('validates quick preset cross-field rules client-side before sending POST', async () => {
    const mockFetch = jest.fn();
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await expect(
      upsertQuickPreset({
        label: 'Invalid Self Transfer',
        icon: '🔄',
        type: 'TRANSFER',
        amountMinor: 5000,
        walletId: 'w-1',
        toWalletId: 'w-1',
        tags: [],
        defaultOrder: 1,
      }),
    ).rejects.toThrow(/differ from source wallet/i);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('parses wallets, safe-to-spend, and reconciliation responses strictly with Zod', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: 'w-1',
            name: 'Checking',
            type: 'CHECKING',
            icon: '🏦',
            color: '#2563EB',
            currency: 'PHP',
            openingBalanceMinor: 100000,
            balanceMinor: 100000,
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          totalLiquidBalanceMinor: 100000,
          upcomingFixedBillsMinor: 10000,
          overdueFixedBillsMinor: 0,
          expectedRemainingIncomeMinor: 0,
          remainingCategoryBudgetsMinor: 20000,
          isolatedSinkingFundsMinor: 5000,
          safeToSpendMinor: 65000,
          daysRemainingInMonth: 10,
          dailyDiscretionaryBudgetMinor: 6500,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          reconciliation: {
            id: 'rec-1',
            walletId: 'w-1',
            reconciledAt: '2026-11-20T12:00:00.000Z',
            appBalanceMinor: 100000,
            actualBalanceMinor: 100000,
            discrepancyMinor: 0,
          },
          wallet: {
            id: 'w-1',
            name: 'Checking',
            type: 'CHECKING',
            icon: '🏦',
            color: '#2563EB',
            currency: 'PHP',
            openingBalanceMinor: 100000,
            balanceMinor: 100000,
          },
        }),
      });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const wallets = await getWallets();
    expect(wallets).toHaveLength(1);
    expect(wallets[0]?.currency).toBe('PHP');

    const sts = await getSafeToSpendMetrics(new Date(2026, 10, 20, 12, 0, 0));
    expect(sts.safeToSpendMinor).toBe(65000);
    expect(mockFetch.mock.calls[1]?.[0]).toContain('/v1/safe-to-spend?date=2026-11-20');

    const rec = await applyReconciliation({
      walletId: 'w-1',
      actualBalanceMinor: 100000,
      createAdjustment: true,
    });
    expect(rec.reconciliation.discrepancyMinor).toBe(0);
    expect(rec.adjustmentTransaction).toBeUndefined();
  });
});
