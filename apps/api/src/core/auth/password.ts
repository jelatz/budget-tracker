import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;

function scryptAsync(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) {
        reject(err);
      } else {
        resolve(derivedKey);
      }
    });
  });
}

/**
 * Hashes a plaintext password using per-user random salt and scrypt.
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = await scryptAsync(plain, salt);
  return `${salt}:${derived.toString('hex')}`;
}

/**
 * Verifies a plaintext password against a stored `salt:hash` value in constant time.
 */
export async function verifyPassword(
  plain: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 2) {
    return false;
  }
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) {
    return false;
  }
  const expectedBuffer = Buffer.from(expectedHex, 'hex');
  const derived = await scryptAsync(plain, salt);
  if (derived.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(derived, expectedBuffer);
}
