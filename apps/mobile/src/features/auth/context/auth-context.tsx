import { createDestructiveConfirmation, type AuthUser } from '@repo/contracts';
import { useQueryClient } from '@tanstack/react-query';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ApiClientError } from '@/common/lib/api-client';
import {
  markLegacyWebBackupMigrated,
  readUnmigratedLegacyWebBackup,
} from '@/common/lib/legacy-web-migration';
import {
  clearAuthToken,
  clearCachedUser,
  getAuthToken,
  getCachedUser,
  getInitialAuthSnapshotSync,
  isCookieAuthMode,
  setAuthToken,
  setCachedUser,
} from '@/common/lib/token-storage';
import {
  clearSyncCacheForUser,
  createSyncOpId,
  enqueueSyncMutation,
  getActiveSyncUserId,
  getCurrentSyncRevision,
  getCurrentSyncState,
  setActiveSyncUser,
  syncNow,
} from '@/features/transactions/sync-engine';
import {
  demoLoginApi,
  loginApi,
  logoutApi,
  meApi,
  registerApi,
} from '../api';

export type User = AuthUser;

export type AuthContextType = {
  user: User | null;
  isAuthenticated: boolean;
  isHydrating: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (params: {
    name: string;
    email: string;
    password: string;
  }) => Promise<void>;
  signInDemo: () => Promise<void>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [isHydrating, setIsHydrating] = useState<boolean>(true);

  const migrateLegacyWebDataIfPresent = useCallback(async (email: string) => {
    const backup = readUnmigratedLegacyWebBackup(email);
    if (!backup) {
      return;
    }

    const currentState = getCurrentSyncState();
    const hasOnlySeedTransactions =
      currentState.transactions.length === 0 ||
      currentState.transactions.every((tx) => tx.id.startsWith('tx-seed-'));
    const mode =
      getCurrentSyncRevision() <= 1 && hasOnlySeedTransactions
        ? 'overwrite'
        : 'merge';

    enqueueSyncMutation({
      opId: createSyncOpId(),
      clientTimestamp: new Date().toISOString(),
      type: 'backup.import',
      envelope: backup,
      mode,
      ...(mode === 'overwrite'
        ? { confirmation: createDestructiveConfirmation('overwrite-backup', 'all') }
        : {}),
    });
    markLegacyWebBackupMigrated(email);
    await syncNow();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateAndVerifySession() {
      const cookieMode = isCookieAuthMode();
      const syncSnapshot = getInitialAuthSnapshotSync();
      let token = syncSnapshot?.token ?? null;
      let cachedUser = syncSnapshot?.user ?? null;

      if ((cookieMode || token) && cachedUser) {
        setActiveSyncUser(cachedUser.id);
        setUser(cachedUser);
        setIsHydrating(false);
      } else if (cookieMode) {
        // Web session cookie may still be valid even if cached user metadata is absent.
        try {
          const me = await meApi();
          if (cancelled) return;
          await setCachedUser(me.user);
          setActiveSyncUser(me.user.id);
          setUser(me.user);
          setIsHydrating(false);
          await syncNow();
          if (!cancelled) {
            queryClient.invalidateQueries();
          }
        } catch (error: unknown) {
          if (cancelled) return;
          await Promise.all([clearAuthToken(), clearCachedUser()]);
          setActiveSyncUser(null);
          setUser(null);
          setIsHydrating(false);
        }
        return;
      } else if (syncSnapshot !== null) {
        if (token && !cachedUser) {
          await clearAuthToken();
        }
        if (cancelled) return;
        setActiveSyncUser(null);
        setUser(null);
        setIsHydrating(false);
        return;
      } else {
        const [storedToken, storedUser] = await Promise.all([
          getAuthToken(),
          getCachedUser(),
        ]);
        if (cancelled) return;

        token = storedToken;
        cachedUser = storedUser;

        if (token && cachedUser) {
          setActiveSyncUser(cachedUser.id);
          setUser(cachedUser);
          setIsHydrating(false);
        } else {
          if (token && !cachedUser) {
            await clearAuthToken();
          }
          if (cancelled) return;
          setActiveSyncUser(null);
          setUser(null);
          setIsHydrating(false);
          return;
        }
      }

      // Validate token/cookie in background; stay signed in offline when network is unreachable
      try {
        const me = await meApi(cookieMode ? undefined : token);
        if (cancelled) return;
        await setCachedUser(me.user);
        setUser(me.user);
        await syncNow();
        if (!cancelled) {
          queryClient.invalidateQueries();
        }
      } catch (error: unknown) {
        if (cancelled) return;
        if (error instanceof ApiClientError && error.status === 401) {
          const userIdToClear = cachedUser?.id ?? getActiveSyncUserId();
          await Promise.all([clearAuthToken(), clearCachedUser()]);
          setActiveSyncUser(null);
          if (userIdToClear) {
            clearSyncCacheForUser(userIdToClear);
          }
          setUser(null);
          queryClient.clear();
          return;
        }
        // Offline or transient error: keep cached session and try syncing pending state
        await syncNow();
      }
    }

    void hydrateAndVerifySession();

    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const session = await loginApi({ email, password });
      await Promise.all([
        setAuthToken(session.token),
        setCachedUser(session.user),
      ]);
      setActiveSyncUser(session.user.id);
      await syncNow();
      if (getActiveSyncUserId() !== session.user.id) {
        throw new Error('Session expired during initial sync.');
      }
      await migrateLegacyWebDataIfPresent(session.user.email);
      if (getActiveSyncUserId() !== session.user.id) {
        throw new Error('Session expired during data migration.');
      }
      setUser(session.user);
      setIsHydrating(false);
      queryClient.invalidateQueries();
    },
    [migrateLegacyWebDataIfPresent, queryClient],
  );

  const signUp = useCallback(
    async (params: { name: string; email: string; password: string }) => {
      const legacyBackup = readUnmigratedLegacyWebBackup(params.email);
      const session = await registerApi({
        name: params.name,
        email: params.email,
        password: params.password,
        ...(legacyBackup ? { initialBackup: legacyBackup } : {}),
      });

      await Promise.all([
        setAuthToken(session.token),
        setCachedUser(session.user),
      ]);
      if (legacyBackup) {
        markLegacyWebBackupMigrated(session.user.email);
      }

      setActiveSyncUser(session.user.id);
      await syncNow();
      if (getActiveSyncUserId() !== session.user.id) {
        throw new Error('Session expired during initial sync.');
      }
      setUser(session.user);
      setIsHydrating(false);
      queryClient.invalidateQueries();
    },
    [queryClient],
  );

  const signInDemo = useCallback(async () => {
    const session = await demoLoginApi();
    await Promise.all([
      setAuthToken(session.token),
      setCachedUser(session.user),
    ]);
    setActiveSyncUser(session.user.id);
    await syncNow();
    if (getActiveSyncUserId() !== session.user.id) {
      throw new Error('Session expired during initial sync.');
    }
    setUser(session.user);
    setIsHydrating(false);
    queryClient.invalidateQueries();
  }, [queryClient]);

  const logout = useCallback(async () => {
    const currentUserId = user?.id ?? getActiveSyncUserId();
    const currentToken = await getAuthToken();
    if (currentToken || isCookieAuthMode()) {
      try {
        await logoutApi(currentToken ?? undefined);
      } catch (error: unknown) {
        // Ignore network errors during logout; always clear local credentials
      }
    }

    await Promise.all([clearAuthToken(), clearCachedUser()]);
    setActiveSyncUser(null);
    if (currentUserId) {
      clearSyncCacheForUser(currentUserId);
    }
    setUser(null);
    setIsHydrating(false);
    queryClient.clear();
  }, [queryClient, user?.id]);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isHydrating,
      signIn,
      signUp,
      signInDemo,
      logout,
    }),
    [user, isHydrating, signIn, signUp, signInDemo, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
