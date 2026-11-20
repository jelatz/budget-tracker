import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  authMeResponseSchema,
  authResponseSchema,
  okResponseSchema,
  type AuthUser,
} from '@repo/contracts';
import { ApiError, apiFetch, setUnauthorizedHandler } from '@/common/lib/api-client';
import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from '@/common/lib/token-storage';

export type User = AuthUser;

export type AuthContextType = {
  user: User | null;
  isAuthenticated: boolean;
  isHydrating: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSession() {
      try {
        const token = await getAccessToken();
        if (!token) {
          return;
        }
        const { user: currentUser } = await apiFetch(
          '/v1/auth/me',
          authMeResponseSchema,
        );
        if (!cancelled) {
          setUser(currentUser);
        }
      } catch (error: unknown) {
        if (!(error instanceof ApiError && error.status === 0)) {
          await clearAccessToken();
        }
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setIsHydrating(false);
        }
      }
    }

    void hydrateSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void clearAccessToken();
      queryClient.clear();
      setUser(null);
    });
    return () => {
      setUnauthorizedHandler(null);
    };
  }, [queryClient]);

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await apiFetch('/v1/auth/login', authResponseSchema, {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({ email, password }),
      });
      await setAccessToken(response.token);
      queryClient.clear();
      setUser(response.user);
    },
    [queryClient],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const response = await apiFetch('/v1/auth/register', authResponseSchema, {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({ name, email, password }),
      });
      await setAccessToken(response.token);
      queryClient.clear();
      setUser(response.user);
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch('/v1/auth/logout', okResponseSchema, {
        method: 'POST',
      });
    } catch (error: unknown) {
      // Best-effort session revocation; still clear local session
    } finally {
      await clearAccessToken();
      queryClient.clear();
      setUser(null);
    }
  }, [queryClient]);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isHydrating,
      login,
      register,
      logout,
    }),
    [user, isHydrating, login, register, logout],
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
