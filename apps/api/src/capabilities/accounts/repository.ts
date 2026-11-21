import {
  accountSchema,
  normalizeLegacyAccountType,
  type Account,
  type UpdateAccountRequest,
} from '@repo/contracts';
import { and, asc, eq } from 'drizzle-orm';
import type { AppDatabase } from '../../core/db/client';
import { accounts, users, userSettings } from '../../core/db/schema';
import { AppError } from '../../core/errors';

export interface AccountsRepository {
  listAccounts(userId: string): Promise<{ accounts: Account[]; revision: number }>;
  getAccountById(
    userId: string,
    accountId: string,
  ): Promise<{ account: Account; revision: number } | null>;
  createAccount(
    userId: string,
    account: Account,
  ): Promise<{ account: Account; revision: number }>;
  updateAccountMetadata(
    userId: string,
    accountId: string,
    patch: UpdateAccountRequest,
  ): Promise<{ account: Account; revision: number } | null>;
  deleteAccountById(
    userId: string,
    accountId: string,
  ): Promise<{ deletedAccountId: string; revision: number }>;
}

function mapAccountRow(row: typeof accounts.$inferSelect): Account {
  return accountSchema.parse({
    id: row.id,
    name: row.name,
    accountType: normalizeLegacyAccountType(row.accountType),
    icon: row.icon,
    color: row.color,
    currency: row.currency,
    balanceMinor: Number(row.balanceMinor),
  });
}

export function createPgAccountsRepository(db: AppDatabase): AccountsRepository {
  return {
    async listAccounts(userId) {
      const [userRows, accountRows] = await Promise.all([
        db
          .select({ stateRevision: users.stateRevision })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1),
        db
          .select()
          .from(accounts)
          .where(eq(accounts.userId, userId))
          .orderBy(asc(accounts.sortOrder)),
      ]);

      const userRow = userRows[0];
      if (!userRow) {
        throw new AppError('UNAUTHORIZED', 'Account not found.');
      }

      return {
        accounts: accountRows.map(mapAccountRow),
        revision: Number(userRow.stateRevision),
      };
    },

    async getAccountById(userId, accountId) {
      const [userRows, accountRows] = await Promise.all([
        db
          .select({ stateRevision: users.stateRevision })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1),
        db
          .select()
          .from(accounts)
          .where(and(eq(accounts.userId, userId), eq(accounts.id, accountId)))
          .limit(1),
      ]);

      const userRow = userRows[0];
      if (!userRow) {
        throw new AppError('UNAUTHORIZED', 'Account not found.');
      }
      const row = accountRows[0];
      if (!row) {
        return null;
      }

      return {
        account: mapAccountRow(row),
        revision: Number(userRow.stateRevision),
      };
    },

    async createAccount(userId, account) {
      return db.transaction(async (tx) => {
        const [userRow] = await tx
          .select({ stateRevision: users.stateRevision })
          .from(users)
          .where(eq(users.id, userId))
          .for('update');

        if (!userRow) {
          throw new AppError('UNAUTHORIZED', 'Account not found.');
        }

        const existingRows = await tx
          .select({ id: accounts.id, sortOrder: accounts.sortOrder })
          .from(accounts)
          .where(eq(accounts.userId, userId));

        if (existingRows.some((row) => row.id === account.id)) {
          throw new AppError(
            'CONFLICT',
            `Account with id "${account.id}" already exists.`,
          );
        }

        const nextSortOrder =
          existingRows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;

        await tx.insert(accounts).values({
          userId,
          id: account.id,
          name: account.name,
          accountType: account.accountType,
          icon: account.icon,
          color: account.color,
          currency: account.currency,
          balanceMinor: account.balanceMinor,
          sortOrder: nextSortOrder,
        });

        const nextRevision = Number(userRow.stateRevision) + 1;
        await tx
          .update(users)
          .set({ stateRevision: nextRevision, updatedAt: new Date() })
          .where(eq(users.id, userId));

        return { account, revision: nextRevision };
      });
    },

    async updateAccountMetadata(userId, accountId, patch) {
      return db.transaction(async (tx) => {
        const [userRow] = await tx
          .select({ stateRevision: users.stateRevision })
          .from(users)
          .where(eq(users.id, userId))
          .for('update');

        if (!userRow) {
          throw new AppError('UNAUTHORIZED', 'Account not found.');
        }

        const [existing] = await tx
          .select()
          .from(accounts)
          .where(and(eq(accounts.userId, userId), eq(accounts.id, accountId)))
          .limit(1);

        if (!existing) {
          return null;
        }

        const [updated] = await tx
          .update(accounts)
          .set({
            name: patch.name ?? existing.name,
            accountType: patch.accountType ?? existing.accountType,
            icon: patch.icon ?? existing.icon,
            color: patch.color ?? existing.color,
          })
          .where(and(eq(accounts.userId, userId), eq(accounts.id, accountId)))
          .returning();

        const nextRevision = Number(userRow.stateRevision) + 1;
        await tx
          .update(users)
          .set({ stateRevision: nextRevision, updatedAt: new Date() })
          .where(eq(users.id, userId));

        return {
          account: mapAccountRow(updated),
          revision: nextRevision,
        };
      });
    },

    async deleteAccountById(userId, accountId) {
      return db.transaction(async (tx) => {
        const [userRow] = await tx
          .select({ stateRevision: users.stateRevision })
          .from(users)
          .where(eq(users.id, userId))
          .for('update');

        if (!userRow) {
          throw new AppError('UNAUTHORIZED', 'Account not found.');
        }

        const userAccounts = await tx
          .select({ id: accounts.id })
          .from(accounts)
          .where(eq(accounts.userId, userId))
          .orderBy(asc(accounts.sortOrder));

        const exists = userAccounts.some((acc) => acc.id === accountId);
        if (!exists) {
          throw new AppError('NOT_FOUND', `Account "${accountId}" not found.`);
        }

        if (userAccounts.length <= 1) {
          throw new AppError(
            'CONFLICT',
            'Cannot delete the last remaining account.',
          );
        }

        await tx
          .delete(accounts)
          .where(and(eq(accounts.userId, userId), eq(accounts.id, accountId)));

        const fallbackAccountId =
          userAccounts.find((acc) => acc.id !== accountId)?.id ?? '';

        const [settings] = await tx
          .select()
          .from(userSettings)
          .where(eq(userSettings.userId, userId))
          .limit(1);

        if (settings) {
          const nextLastAccountId =
            settings.lastAccountId === accountId
              ? fallbackAccountId
              : settings.lastAccountId;
          const nextTransferTo =
            settings.lastTransferToAccountId === accountId
              ? null
              : settings.lastTransferToAccountId;

          if (
            nextLastAccountId !== settings.lastAccountId ||
            nextTransferTo !== settings.lastTransferToAccountId
          ) {
            await tx
              .update(userSettings)
              .set({
                lastAccountId: nextLastAccountId,
                lastTransferToAccountId: nextTransferTo,
              })
              .where(eq(userSettings.userId, userId));
          }
        }

        const nextRevision = Number(userRow.stateRevision) + 1;
        await tx
          .update(users)
          .set({ stateRevision: nextRevision, updatedAt: new Date() })
          .where(eq(users.id, userId));

        return { deletedAccountId: accountId, revision: nextRevision };
      });
    },
  };
}
