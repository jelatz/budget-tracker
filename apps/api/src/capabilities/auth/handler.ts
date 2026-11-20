import { eq } from 'drizzle-orm';
import type { AuthResponse, LoginInput, RegisterInput } from '@repo/contracts';
import { hashPassword, verifyPassword } from '../../core/auth/password';
import { generateSessionToken, hashSessionToken } from '../../core/auth/token';
import type { AppDb } from '../../core/db/client';
import { sessions, users } from '../../core/db/schema';
import { AppError, isPgErrorCode } from '../../core/errors';
import { generateId, seedWorkspaceForUser } from '../shared/tx-helpers';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function registerUser(
  db: AppDb,
  input: RegisterInput,
): Promise<AuthResponse> {
  const emailLower = input.email.trim().toLowerCase();
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, emailLower))
    .limit(1);

  if (existing[0]) {
    throw new AppError('CONFLICT', 'An account with this email already exists');
  }

  const passwordHash = await hashPassword(input.password);
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const userId = generateId('usr');
  const sessionId = generateId('sess');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  try {
    await db.transaction(async (tx) => {
      await tx.insert(users).values({
        id: userId,
        email: emailLower,
        name: input.name.trim(),
        passwordHash,
      });

      await tx.insert(sessions).values({
        id: sessionId,
        userId,
        tokenHash,
        expiresAt,
      });

      await seedWorkspaceForUser(tx, userId, 'empty');
    });
  } catch (error: unknown) {
    if (isPgErrorCode(error, '23505')) {
      throw new AppError('CONFLICT', 'An account with this email already exists');
    }
    throw error;
  }

  return {
    token,
    user: {
      id: userId,
      email: emailLower,
      name: input.name.trim(),
    },
  };
}

export async function loginUser(
  db: AppDb,
  input: LoginInput,
): Promise<AuthResponse> {
  const emailLower = input.email.trim().toLowerCase();
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, emailLower))
    .limit(1);

  const user = rows[0];
  if (!user) {
    throw new AppError('UNAUTHORIZED', 'Invalid email or password');
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw new AppError('UNAUTHORIZED', 'Invalid email or password');
  }

  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(sessions).values({
    id: generateId('sess'),
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
  };
}

export async function logoutSession(
  db: AppDb,
  sessionId: string,
): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.id, sessionId));
}
