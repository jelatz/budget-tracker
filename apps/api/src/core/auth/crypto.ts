import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const saltHex = randomBytes(16).toString('hex');
  const derived = (await scryptAsync(password, saltHex, KEY_LENGTH)) as Buffer;
  return `scrypt$${saltHex}$${derived.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, saltHex, keyHex] = parts;
  if (!saltHex || !keyHex) {
    return false;
  }

  const expectedBuffer = Buffer.from(keyHex, 'hex');
  if (expectedBuffer.length !== KEY_LENGTH) {
    return false;
  }

  const derivedBuffer = (await scryptAsync(
    password,
    saltHex,
    KEY_LENGTH,
  )) as Buffer;
  if (derivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(derivedBuffer, expectedBuffer);
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
