import type { AuthUser } from '@repo/contracts';
import { useQueryClient } from '@tanstack/react-query';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  setAuthToken,
  setCachedUser,
} from '@/common/lib/token-storage';
import {
  clearSyncCacheForUser,
  createSyncOpId,
  enqueueSyncMutation,
  getCurrentSyncRevision,
  getCurrentSyncState,
  getSyncStatusSnapshot,
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
  const initialSnapshotRef = useRef<ReturnType<typeof getInitialAuthSnapshotSync> | undefined>(
    undefined,
  );
  if (initialSnapshotRef.current === undefined) {
    initialSnapshotRef.current = getInitialAuthSnapshotSync();
    if (initialSnapshotRef.current?.token && initialSnapshotRef.current?.user) {
      setActiveSyncUser(initialSnapshotRef.current.user.id);
    }
  }

  const hasSyncSession = Boolean(
    initialSnapshotRef.current?.token && initialSnapshotRef.current?.user,
  );

  const [user, setUser] = useState<User | null>(
    hasSyncSession ? initialSnapshotRef.current!.user : null,
  );
  const [isHydrating, setIsHydrating] = useState<boolean>(
    initialSnapshotRef.current === null,
  );

  const migrateLegacyWebDataIfPresent = useCallback(async (email: string) => {
    if (email.trim().toLowerCase() === 'demo@budgettracker.app') {
      return;
    }
    const backup = readUnmigratedLegacyWebBackup(email);
    if (!backup) {
      return;
    }

    const currentState = getCurrentSyncState();
    const hasOnlySeedTransactions = currentState.transactions.every((tx) =>
      tx.id.startsWith('tx-seed-'),
    );
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
    });
    markLegacyWebBackupMigrated(email);
    await syncNow();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateAndVerifySession() {
      let token = initialSnapshotRef.current?.token ?? null;
      let cachedUser = initialSnapshotRef.current?.user ?? null;

      if (!token || !cachedUser) {
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
        } else {
          if (token && !cachedUser) {
            await clearAuthToken();
          }
          setActiveSyncUser(null);
          setUser(null);
          setIsHydrating(false);
          return;
        }
      }

      setIsHydrating(false);

      // Validate token in background; stay signed in offline when network is unreachable
      try {
        const me = await meApi(token);
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
          await Promise.all([clearAuthToken(), clearCachedUser()]);
          setActiveSyncUser(null);
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
      await migrateLegacyWebDataIfPresent(session.user.email);
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
    setUser(session.user);
    setIsHydrating(false);
    queryClient.invalidateQueries();
  }, [queryClient]);

  const logout = useCallback(async () => {
    const currentUserId = user?.id ?? null;
    const pendingCount = getSyncStatusSnapshot().pendingCount;
    const currentToken = await getAuthToken();
    if (currentToken) {
      try {
        await logoutApi(currentToken);
      } catch (error: unknown) {
        // Ignore network errors during logout; always clear local credentials
      }
    }

    await Promise.all([clearAuthToken(), clearCachedUser()]);
    setActiveSyncUser(null);
    if (currentUserId && pendingCount === 0) {
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
