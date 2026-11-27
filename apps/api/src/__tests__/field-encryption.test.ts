import { MAX_SAFE_MONEY_MINOR } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import type { AppDatabase } from '../core/db/client';
import {
  accounts,
  incomeSources,
  recurringCommitments,
  transactions,
  userSettings,
} from '../core/db/schema';
import {
  createMoneyCipher,
  ENCRYPTED_MONEY_PREFIX,
  isEncryptedMoneyValue,
  parseEncryptionKeyMaterial,
  parsePlaintextMinorString,
  type MoneyFieldContext,
} from '../core/crypto/field-encryption';
import { encryptExistingFiguresInDb } from '../scripts/encrypt-existing-figures';

const KEY_A = Buffer.from('0123456789abcdef'.repeat(4), 'hex');
const KEY_B = Buffer.from('fedcba9876543210'.repeat(4), 'hex');

const BASE_CTX: MoneyFieldContext = {
  userId: 'user-1',
  table: 'transactions',
  rowId: 'tx-1',
  column: 'amount_minor',
};

describe('AES-256-GCM monetary field encryption', () => {
  it('parses valid 32-byte hex and base64 keys and rejects invalid ones without leaking key material', () => {
    const hexKey = '0123456789abcdef'.repeat(4);
    expect(parseEncryptionKeyMaterial(hexKey).equals(KEY_A)).toBe(true);

    const b64Key = KEY_A.toString('base64');
    expect(parseEncryptionKeyMaterial(b64Key).equals(KEY_A)).toBe(true);

    const badSecret = 'super-secret-too-short-value';
    expect(() => parseEncryptionKeyMaterial(badSecret)).toThrow();
    try {
      parseEncryptionKeyMaterial(badSecret);
    } catch (error: unknown) {
      expect(error instanceof Error ? error.message : '').not.toContain(
        badSecret,
      );
    }

    expect(() => parseEncryptionKeyMaterial('')).toThrow();
    expect(() => parseEncryptionKeyMaterial('ab'.repeat(16))).toThrow();
  });

  it('round-trips zero, positive, negative, and boundary safe integer figures', () => {
    const cipher = createMoneyCipher({ primaryKey: KEY_A });
    const samples = [
      0,
      1,
      -1,
      1250,
      -400,
      999_999_999,
      MAX_SAFE_MONEY_MINOR,
      -MAX_SAFE_MONEY_MINOR,
    ];

    for (const amount of samples) {
      const encrypted = cipher.encrypt(amount, BASE_CTX);
      expect(isEncryptedMoneyValue(encrypted)).toBe(true);
      expect(encrypted.startsWith(ENCRYPTED_MONEY_PREFIX)).toBe(true);
      expect(cipher.decrypt(encrypted, BASE_CTX)).toBe(amount);
    }
  });

  it('uses fresh random IVs and fixed-width ciphertext lengths so magnitude never leaks', () => {
    const cipher = createMoneyCipher({ primaryKey: KEY_A });

    const cZero1 = cipher.encrypt(0, BASE_CTX);
    const cZero2 = cipher.encrypt(0, BASE_CTX);
    const cSmall = cipher.encrypt(5, BASE_CTX);
    const cHuge = cipher.encrypt(999_999_999_999, BASE_CTX);
    const cNeg = cipher.encrypt(-MAX_SAFE_MONEY_MINOR, BASE_CTX);

    expect(cZero1).not.toBe(cZero2);
    expect(cZero1.length).toBe(cSmall.length);
    expect(cSmall.length).toBe(cHuge.length);
    expect(cHuge.length).toBe(cNeg.length);
  });

  it('rejects tampering and enforces per-user/table/row/column AAD isolation', () => {
    const cipher = createMoneyCipher({ primaryKey: KEY_A });
    const encrypted = cipher.encrypt(12500, BASE_CTX);
    const parts = encrypted.split(':');

    const ct = parts[4]!;
    const flippedCt = `${ct[0] === 'A' ? 'B' : 'A'}${ct.slice(1)}`;
    const tampered = `${parts.slice(0, 4).join(':')}:${flippedCt}`;
    expect(() => cipher.decrypt(tampered, BASE_CTX)).toThrow();

    expect(() =>
      cipher.decrypt(encrypted, { ...BASE_CTX, userId: 'user-2' }),
    ).toThrow();
    expect(() =>
      cipher.decrypt(encrypted, { ...BASE_CTX, table: 'accounts' }),
    ).toThrow();
    expect(() =>
      cipher.decrypt(encrypted, { ...BASE_CTX, rowId: 'tx-2' }),
    ).toThrow();
    expect(() =>
      cipher.decrypt(encrypted, { ...BASE_CTX, column: 'balance_minor' }),
    ).toThrow();
    expect(() => cipher.decrypt('1250', BASE_CTX)).toThrow();
  });

  it('supports zero-downtime key rotation via previousKey', () => {
    const oldCipher = createMoneyCipher({ primaryKey: KEY_A });
    const legacyCiphertext = oldCipher.encrypt(4200, BASE_CTX);

    const rotatedCipher = createMoneyCipher({
      primaryKey: KEY_B,
      previousKey: KEY_A,
    });
    const decrypted = rotatedCipher.decryptWithKeyInfo(
      legacyCiphertext,
      BASE_CTX,
    );
    expect(decrypted).toEqual({ value: 4200, usedPreviousKey: true });

    const freshCiphertext = rotatedCipher.encrypt(4200, BASE_CTX);
    expect(rotatedCipher.decryptWithKeyInfo(freshCiphertext, BASE_CTX)).toEqual(
      { value: 4200, usedPreviousKey: false },
    );
    expect(() => oldCipher.decrypt(freshCiphertext, BASE_CTX)).toThrow();
  });

  it('validates plaintext minor unit strings strictly', () => {
    expect(parsePlaintextMinorString('0')).toBe(0);
    expect(parsePlaintextMinorString('12500')).toBe(12500);
    expect(parsePlaintextMinorString('-450')).toBe(-450);
    expect(() => parsePlaintextMinorString('12.50')).toThrow();
    expect(() => parsePlaintextMinorString('abc')).toThrow();
    expect(() =>
      parsePlaintextMinorString(`${MAX_SAFE_MONEY_MINOR + 1}`),
    ).toThrow();
  });

  it('backfills all 5 remaining monetary tables idempotently, supports dry-run, and supports rekeying', async () => {
    const cipherA = createMoneyCipher({ primaryKey: KEY_A });
    const cipherB = createMoneyCipher({
      primaryKey: KEY_B,
      previousKey: KEY_A,
    });

    const store = new Map<unknown, Array<Record<string, unknown>>>([
      [
        userSettings,
        [{ userId: 'user-1', monthlyBudgetMinor: '250000' }],
      ],
      [
        accounts,
        [
          {
            userId: 'user-1',
            id: 'acc-1',
            balanceMinor: '123450',
            creditLimitMinor: '6000000',
            monthlyPaymentTargetMinor: '500000',
          },
          {
            userId: 'user-1',
            id: 'acc-2',
            balanceMinor: '50000',
            creditLimitMinor: null,
            monthlyPaymentTargetMinor: null,
          },
        ],
      ],
      [
        transactions,
        [{ userId: 'user-1', id: 'tx-1', amountMinor: '4500' }],
      ],
      [
        recurringCommitments,
        [{ userId: 'user-1', id: 'rc-1', amountMinor: '150000' }],
      ],
      [
        incomeSources,
        [
          {
            userId: 'user-1',
            id: 'inc-1',
            expectedMonthlyMinor: '150000',
            typicalPayoutMinor: '75000',
          },
          {
            userId: 'user-1',
            id: 'inc-2',
            expectedMonthlyMinor: '50000',
            typicalPayoutMinor: null,
          },
        ],
      ],
    ]);

    const mockTx = {
      select: () => ({
        from: async (table: unknown) =>
          (store.get(table) ?? []).map((row) => ({ ...row })),
      }),
      update: (table: unknown) => ({
        set: (patch: Record<string, unknown>) => ({
          where: async () => {
            const rows = store.get(table) ?? [];
            const target = rows.find((row) =>
              Object.keys(patch).some(
                (k) =>
                  row[k] !== null &&
                  row[k] !== undefined &&
                  !isEncryptedMoneyValue(String(row[k])),
              ),
            );
            if (target) {
              Object.assign(target, patch);
            }
          },
        }),
      }),
    };

    const mockDb = {
      transaction: async <T>(fn: (tx: typeof mockTx) => Promise<T>) =>
        fn(mockTx),
    } as unknown as AppDatabase;

    const drySummary = await encryptExistingFiguresInDb(mockDb, cipherA, {
      dryRun: true,
    });
    expect(drySummary.reduce((sum, t) => sum + t.fieldsEncrypted, 0)).toBe(10);
    expect(store.get(accounts)![0]!.balanceMinor).toBe('123450');

    const firstRun = await encryptExistingFiguresInDb(mockDb, cipherA);
    expect(firstRun.reduce((sum, t) => sum + t.fieldsEncrypted, 0)).toBe(10);
    expect(firstRun.reduce((sum, t) => sum + t.rowsUpdated, 0)).toBe(7);

    expect(
      cipherA.decrypt(String(store.get(accounts)![0]!.balanceMinor), {
        userId: 'user-1',
        table: 'accounts',
        rowId: 'acc-1',
        column: 'balance_minor',
      }),
    ).toBe(123450);
    expect(
      cipherA.decrypt(String(store.get(accounts)![0]!.creditLimitMinor), {
        userId: 'user-1',
        table: 'accounts',
        rowId: 'acc-1',
        column: 'credit_limit_minor',
      }),
    ).toBe(6000000);
    expect(
      cipherA.decrypt(
        String(store.get(accounts)![0]!.monthlyPaymentTargetMinor),
        {
          userId: 'user-1',
          table: 'accounts',
          rowId: 'acc-1',
          column: 'monthly_payment_target_minor',
        },
      ),
    ).toBe(500000);
    expect(store.get(accounts)![1]!.creditLimitMinor).toBeNull();
    expect(store.get(accounts)![1]!.monthlyPaymentTargetMinor).toBeNull();
    expect(
      cipherA.decrypt(String(store.get(incomeSources)![0]!.typicalPayoutMinor), {
        userId: 'user-1',
        table: 'income_sources',
        rowId: 'inc-1',
        column: 'typical_payout_minor',
      }),
    ).toBe(75000);
    expect(store.get(incomeSources)![1]!.typicalPayoutMinor).toBeNull();

    const secondRun = await encryptExistingFiguresInDb(mockDb, cipherA);
    expect(secondRun.reduce((sum, t) => sum + t.fieldsEncrypted, 0)).toBe(0);
    expect(secondRun.reduce((sum, t) => sum + t.rowsUpdated, 0)).toBe(0);
    expect(secondRun.reduce((sum, t) => sum + t.fieldsAlreadyEncrypted, 0)).toBe(10);

    const rekeyIndexByTable = new Map<unknown, number>();
    mockTx.update = (table: unknown) => ({
      set: (patch: Record<string, unknown>) => ({
        where: async () => {
          const rows = store.get(table) ?? [];
          const idx = rekeyIndexByTable.get(table) ?? 0;
          rekeyIndexByTable.set(table, idx + 1);
          const row = rows[idx];
          if (row) Object.assign(row, patch);
        },
      }),
    });

    const rekeyRun = await encryptExistingFiguresInDb(mockDb, cipherB, {
      rekey: true,
    });
    expect(rekeyRun.reduce((sum, t) => sum + t.fieldsRekeyed, 0)).toBe(10);
  });
});
