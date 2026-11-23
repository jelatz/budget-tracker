import { randomUUID } from 'node:crypto';
import {
  applySyncMutation,
  authSessionResponseSchema,
  createInitialSyncDataState,
  type AuthSessionResponse,
  type LoginInput,
  type RegisterInput,
} from '@repo/contracts';
import {
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from '../../core/auth/crypto';
import { AppError } from '../../core/errors';
import type { AuthRepository } from './repository';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Precomputed valid scrypt format string used solely to equalize login timing on unknown emails.
const DUMMY_PASSWORD_HASH =
  'scrypt$00000000000000000000000000000000$' + '0'.repeat(128);

function buildSessionExpiry(): Date {
  return new Date(Date.now() + SESSION_TTL_MS);
}

export async function handleRegister(
  repo: AuthRepository,
  input: RegisterInput,
): Promise<AuthSessionResponse> {
  const existing = await repo.findUserByEmail(input.email);
  if (existing) {
    throw new AppError('CONFLICT', 'An account with this email already exists.');
  }

  const userId = randomUUID();
  const sessionId = randomUUID();
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = buildSessionExpiry();
  const passwordHash = await hashPassword(input.password);

  const baseState = createInitialSyncDataState();
  const initialState = input.initialBackup
    ? applySyncMutation(baseState, {
        opId: 'initial-backup',
        clientTimestamp: new Date().toISOString(),
        type: 'backup.import',
        envelope: input.initialBackup,
        mode: 'overwrite',
      })
    : baseState;

  const user = await repo.createUserWithSessionAndState({
    userId,
    email: input.email,
    name: input.name,
    passwordHash,
    initialState,
    sessionId,
    tokenHash,
    expiresAt,
  });

  return authSessionResponseSchema.parse({
    token,
    expiresAt: expiresAt.toISOString(),
    user,
  });
}

export async function handleLogin(
  repo: AuthRepository,
  input: LoginInput,
): Promise<AuthSessionResponse> {
  const existing = await repo.findUserByEmail(input.email);

  if (!existing) {
    await verifyPassword(input.password, DUMMY_PASSWORD_HASH);
    throw new AppError('UNAUTHORIZED', 'Invalid email or password.');
  }

  const valid = await verifyPassword(input.password, existing.passwordHash);
  if (!valid) {
    throw new AppError('UNAUTHORIZED', 'Invalid email or password.');
  }

  const sessionId = randomUUID();
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = buildSessionExpiry();

  await repo.createSession({
    sessionId,
    userId: existing.user.id,
    tokenHash,
    expiresAt,
  });

  return authSessionResponseSchema.parse({
    token,
    expiresAt: expiresAt.toISOString(),
    user: existing.user,
  });
}

export async function handleDemoLogin(
  _repo: AuthRepository,
): Promise<AuthSessionResponse> {
  throw new AppError('FORBIDDEN', 'Demo login is disabled.');
}
