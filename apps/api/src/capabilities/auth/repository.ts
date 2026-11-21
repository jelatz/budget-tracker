import type { AuthUser, SyncDataState } from '@repo/contracts';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { AuthenticatedSession } from '../../core/auth/middleware';
import type { AppDatabase } from '../../core/db/client';
import { sessions, users } from '../../core/db/schema';
import { AppError } from '../../core/errors';
import { saveUserSyncStateInTx } from '../sync/repository';

export interface StoredUserRecord {
  user: AuthUser;
  passwordHash: string;
}

export interface AuthRepository {
  findUserByEmail(email: string): Promise<StoredUserRecord | null>;
  createUserWithSessionAndState(params: {
    userId: string;
    email: string;
    name: string;
    passwordHash: string;
    initialState: SyncDataState;
    sessionId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<AuthUser>;
  createSession(params: {
    sessionId: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  verifySessionTokenHash(tokenHash: string): Promise<AuthenticatedSession | null>;
  revokeSession(sessionId: string, userId: string): Promise<void>;
}

function isEmailUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const pgError = error as { code?: unknown; constraint?: unknown; detail?: unknown };
  if (pgError.code !== '23505') {
    return false;
  }
  if (typeof pgError.constraint === 'string') {
    return pgError.constraint === 'users_email_unique';
  }
  if (typeof pgError.detail === 'string') {
    return pgError.detail.includes('(email)');
  }
  return false;
}

export function createPgAuthRepository(db: AppDatabase): AuthRepository {
  return {
    async findUserByEmail(email) {
      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          passwordHash: users.passwordHash,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.email, email));

      const row = rows[0];
      if (!row) {
        return null;
      }

      return {
        user: {
          id: row.id,
          email: row.email,
          name: row.name,
          createdAt: row.createdAt.toISOString(),
        },
        passwordHash: row.passwordHash,
      };
    },

    async createUserWithSessionAndState({
      userId,
      email,
      name,
      passwordHash,
      initialState,
      sessionId,
      tokenHash,
      expiresAt,
    }) {
      try {
        return await db.transaction(async (tx) => {
          const [createdUser] = await tx
            .insert(users)
            .values({
              id: userId,
              email,
              name,
              passwordHash,
              stateRevision: 1,
            })
            .returning({
              id: users.id,
              email: users.email,
              name: users.name,
              createdAt: users.createdAt,
            });

          await saveUserSyncStateInTx(tx, userId, initialState);

          await tx.insert(sessions).values({
            id: sessionId,
            userId,
            tokenHash,
            expiresAt,
          });

          return {
            id: createdUser.id,
            email: createdUser.email,
            name: createdUser.name,
            createdAt: createdUser.createdAt.toISOString(),
          };
        });
      } catch (error: unknown) {
        if (isEmailUniqueViolation(error)) {
          throw new AppError(
            'CONFLICT',
            'An account with this email already exists.',
          );
        }
        throw error;
      }
    },

    async createSession({ sessionId, userId, tokenHash, expiresAt }) {
      await db.insert(sessions).values({
        id: sessionId,
        userId,
        tokenHash,
        expiresAt,
      });
    },

    async verifySessionTokenHash(tokenHash) {
      const now = new Date();
      const rows = await db
        .select({
          sessionId: sessions.id,
          userId: users.id,
          email: users.email,
          name: users.name,
          createdAt: users.createdAt,
        })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(
          and(
            eq(sessions.tokenHash, tokenHash),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, now),
          ),
        );

      const row = rows[0];
      if (!row) {
        return null;
      }

      return {
        sessionId: row.sessionId,
        user: {
          id: row.userId,
          email: row.email,
          name: row.name,
          createdAt: row.createdAt.toISOString(),
        },
      };
    },

    async revokeSession(sessionId, userId) {
      await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
    },
  };
}
