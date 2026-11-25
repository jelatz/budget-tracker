import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import { getEnv } from '../env';

const MAX_SAFE_MONEY_MINOR = 1_000_000_000_000_000;

export const ENCRYPTED_MONEY_PREFIX = 'enc:v1:';
const HKDF_INFO = Buffer.from('budget-tracker:money-minor:v1', 'utf8');
const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;
const PLAINTEXT_LENGTH_BYTES = 8;
const MAX_SUBKEY_CACHE_SIZE = 500;

export interface MoneyFieldContext {
  userId: string;
  table: string;
  rowId: string;
  column: string;
}

export interface DecryptedMoneyResult {
  value: number;
  usedPreviousKey: boolean;
}

export interface MoneyCipher {
  encrypt(amountMinor: number, context: MoneyFieldContext): string;
  decrypt(stored: string, context: MoneyFieldContext): number;
  decryptWithKeyInfo(
    stored: string,
    context: MoneyFieldContext,
  ): DecryptedMoneyResult;
}

export function parseEncryptionKeyMaterial(
  raw: string,
  varName = 'DATA_ENCRYPTION_KEY',
): Buffer {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(`${varName} must be a 32-byte hex or base64 key.`);
  }

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  const normalizedB64 = trimmed.replace(/-/g, '+').replace(/_/g, '/');
  const padded =
    normalizedB64.length % 4 === 0
      ? normalizedB64
      : normalizedB64.padEnd(
          normalizedB64.length + (4 - (normalizedB64.length % 4)),
          '=',
        );

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(padded)) {
    throw new Error(`${varName} must be a 32-byte hex (64 chars) or base64 key.`);
  }

  const decoded = Buffer.from(padded, 'base64');
  if (decoded.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `${varName} must decode to exactly ${KEY_LENGTH_BYTES} bytes.`,
    );
  }

  if (decoded.toString('base64') !== padded) {
    throw new Error(`${varName} must be a valid 32-byte hex or base64 key.`);
  }

  return decoded;
}

export function isEncryptedMoneyValue(value: string): boolean {
  return value.startsWith(ENCRYPTED_MONEY_PREFIX);
}

export function parsePlaintextMinorString(value: string): number {
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    throw new Error('Invalid plaintext minor unit string.');
  }

  const big = BigInt(trimmed);
  const maxBig = BigInt(MAX_SAFE_MONEY_MINOR);
  if (big < -maxBig || big > maxBig) {
    throw new Error('Plaintext minor unit value is out of safe bounds.');
  }

  const num = Number(big);
  if (!Number.isSafeInteger(num)) {
    throw new Error('Plaintext minor unit value is not a safe integer.');
  }
  return num;
}

function buildAad(context: MoneyFieldContext): Buffer {
  return Buffer.from(
    `${context.userId}|${context.table}|${context.rowId}|${context.column}`,
    'utf8',
  );
}

export function createMoneyCipher(options: {
  primaryKey: Buffer;
  previousKey?: Buffer;
}): MoneyCipher {
  if (options.primaryKey.length !== KEY_LENGTH_BYTES) {
    throw new Error('primaryKey must be exactly 32 bytes.');
  }
  if (options.previousKey && options.previousKey.length !== KEY_LENGTH_BYTES) {
    throw new Error('previousKey must be exactly 32 bytes.');
  }

  const primaryKey = Buffer.from(options.primaryKey);
  const previousKey = options.previousKey
    ? Buffer.from(options.previousKey)
    : undefined;
  const subkeyCache = new Map<string, Buffer>();

  function getUserSubkey(keySlot: 'primary' | 'previous', userId: string): Buffer {
    const cacheKey = `${keySlot}:${userId}`;
    const cached = subkeyCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const masterKey = keySlot === 'primary' ? primaryKey : previousKey;
    if (!masterKey) {
      throw new Error('Encryption key not configured.');
    }

    const derived = Buffer.from(
      hkdfSync(
        'sha256',
        masterKey,
        Buffer.from(userId, 'utf8'),
        HKDF_INFO,
        KEY_LENGTH_BYTES,
      ),
    );

    if (subkeyCache.size >= MAX_SUBKEY_CACHE_SIZE) {
      subkeyCache.clear();
    }
    subkeyCache.set(cacheKey, derived);
    return derived;
  }

  function decryptWithMasterSlot(
    keySlot: 'primary' | 'previous',
    userId: string,
    iv: Buffer,
    authTag: Buffer,
    ciphertext: Buffer,
    aad: Buffer,
  ): number {
    const subkey = getUserSubkey(keySlot, userId);
    const decipher = createDecipheriv('aes-256-gcm', subkey, iv, {
      authTagLength: AUTH_TAG_LENGTH_BYTES,
    });
    decipher.setAAD(aad);
    decipher.setAuthTag(authTag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    if (plain.length !== PLAINTEXT_LENGTH_BYTES) {
      throw new Error('Invalid plaintext payload length.');
    }

    const bigVal = plain.readBigInt64BE(0);
    const maxBig = BigInt(MAX_SAFE_MONEY_MINOR);
    if (bigVal < -maxBig || bigVal > maxBig) {
      throw new Error('Decrypted monetary value is out of safe bounds.');
    }
    return Number(bigVal);
  }

  return {
    encrypt(amountMinor, context) {
      if (
        !Number.isSafeInteger(amountMinor) ||
        Math.abs(amountMinor) > MAX_SAFE_MONEY_MINOR
      ) {
        throw new Error('Monetary value must be a safe integer within bounds.');
      }

      const subkey = getUserSubkey('primary', context.userId);
      const iv = randomBytes(IV_LENGTH_BYTES);
      const plain = Buffer.alloc(PLAINTEXT_LENGTH_BYTES);
      plain.writeBigInt64BE(BigInt(amountMinor), 0);

      const cipher = createCipheriv('aes-256-gcm', subkey, iv, {
        authTagLength: AUTH_TAG_LENGTH_BYTES,
      });
      cipher.setAAD(buildAad(context));
      const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
      const authTag = cipher.getAuthTag();

      return `${ENCRYPTED_MONEY_PREFIX}${iv.toString('base64url')}:${authTag.toString('base64url')}:${ciphertext.toString('base64url')}`;
    },

    decryptWithKeyInfo(stored, context) {
      if (!isEncryptedMoneyValue(stored)) {
        throw new Error(
          'Expected encrypted money value; run db:encrypt-figures backfill if migrating legacy data.',
        );
      }

      const parts = stored.split(':');
      if (parts.length !== 5 || parts[0] !== 'enc' || parts[1] !== 'v1') {
        throw new Error('Failed to decrypt encrypted monetary field.');
      }

      const [, , ivB64, tagB64, ctB64] = parts;
      if (!ivB64 || !tagB64 || !ctB64) {
        throw new Error('Failed to decrypt encrypted monetary field.');
      }

      const iv = Buffer.from(ivB64, 'base64url');
      const authTag = Buffer.from(tagB64, 'base64url');
      const ciphertext = Buffer.from(ctB64, 'base64url');

      if (
        iv.length !== IV_LENGTH_BYTES ||
        authTag.length !== AUTH_TAG_LENGTH_BYTES ||
        ciphertext.length !== PLAINTEXT_LENGTH_BYTES
      ) {
        throw new Error('Failed to decrypt encrypted monetary field.');
      }

      const aad = buildAad(context);

      try {
        const value = decryptWithMasterSlot(
          'primary',
          context.userId,
          iv,
          authTag,
          ciphertext,
          aad,
        );
        return { value, usedPreviousKey: false };
      } catch (primaryError: unknown) {
        if (previousKey) {
          try {
            const value = decryptWithMasterSlot(
              'previous',
              context.userId,
              iv,
              authTag,
              ciphertext,
              aad,
            );
            return { value, usedPreviousKey: true };
          } catch (previousError: unknown) {
            throw new Error('Failed to decrypt encrypted monetary field.');
          }
        }
        throw new Error('Failed to decrypt encrypted monetary field.');
      }
    },

    decrypt(stored, context) {
      return this.decryptWithKeyInfo(stored, context).value;
    },
  };
}

let cachedCipher: MoneyCipher | null = null;

export function getMoneyCipher(): MoneyCipher {
  if (cachedCipher) {
    return cachedCipher;
  }

  const env = getEnv();
  const primaryKey = parseEncryptionKeyMaterial(
    env.DATA_ENCRYPTION_KEY,
    'DATA_ENCRYPTION_KEY',
  );
  const previousKey = env.DATA_ENCRYPTION_KEY_PREVIOUS
    ? parseEncryptionKeyMaterial(
        env.DATA_ENCRYPTION_KEY_PREVIOUS,
        'DATA_ENCRYPTION_KEY_PREVIOUS',
      )
    : undefined;

  cachedCipher = createMoneyCipher({ primaryKey, previousKey });
  return cachedCipher;
}

export function resetMoneyCipherCache(): void {
  cachedCipher = null;
}
